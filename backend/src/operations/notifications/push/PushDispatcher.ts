// MOB-04 (ADR-0029 Karar 4 kanal deseni): web push outbox gondericisi. E-posta gondericisiyle AYNI outbox (`NotificationDeliveries`,
// `channel:'push'`, yalniz anlik) ve ayni kira/fencing/yeniden deneme kurallari. Zamanlanmis is `notifications.push-dispatch` (worker).
// Bir teslim kaydi = kullanici; kullanicinin TUM cihazlarina gider. 404/410 (abonelik bitti) -> abonelik SILINIR.
// Kanal kapaliyken (NOTIFY_V2_ENABLED kapali ya da VAPID yok) hicbir koleksiyona DOKUNMAZ.
import { logger } from '@platform/core/logger';
import { metricsRegistry } from '@platform/runtime/metrics';
import { getDefinition } from '../catalog';
import type { NotificationSeverity } from '../catalog.types';
import { resolveChannels } from '../preferences';
import { decideAfterFailure, MAX_ATTEMPTS } from '../delivery/retry';
import { quietUntil } from '../delivery/schedule';
import type { CompletePatch, DeliveryDoc, DeliveryStore } from '../delivery/deliveryStore';
import type { LoadedPrefs } from '../delivery/EmailDispatcher';
import { buildPushPayload } from './pushPayload';

const log = logger.child({ module: 'notifications.push' });
const MIN = 60_000;
/** Bu sureden eski bildirim artik "anlik" degildir: gonderilmez (uygulama icinde zaten duruyor). */
export const PUSH_STALE_MS = 24 * 60 * MIN;
/** Push servisinin cihaz cevrimdisiyken iletiyi tutma suresi (sn). */
export const PUSH_TTL_SECONDS = 12 * 60 * 60;

export interface PushTarget { id: string; endpoint: string; keys: { p256dh: string; auth: string } }

export interface PushSubscriptionPort {
    /** Kullanicinin (tid kapsamli) cihaz abonelikleri, cozulmus. Cozulemeyen kayit atlanir (cagiran loglar). */
    listForUser(tid: number, userId: string): Promise<PushTarget[]>;
    remove(id: string): Promise<void>;
    markSuccess(id: string, at: Date): Promise<void>;
}

export interface PushSendOptions { ttl: number; urgency: 'normal' | 'high'; topic?: string }

/** Basarisizlikta `statusCode` tasiyan hata firlatir (web-push WebPushError deseni); ag hatasinda statusCode yok. */
export interface PushSender { send(target: PushTarget, payload: string, opts: PushSendOptions): Promise<{ statusCode?: number }> }

export interface LedgerEventLite { params?: Record<string, unknown>; severity?: string }

export interface PushDispatcherDeps {
    store: DeliveryStore;
    subscriptions: PushSubscriptionPort;
    sender: PushSender;
    flags(): { v2Enabled: boolean; pushEnabled: boolean };
    loadPrefs(tid: number, userId: string): Promise<LoadedPrefs>;
    loadEvents(eventIds: any[]): Promise<Map<string, LedgerEventLite>>;
    now?(): Date;
    leaseMs?: number;
    batchSize?: number;
}

export type PushFailureKind = 'gone' | 'transient' | 'permanent';

/** HTTP durum kodu -> sinif. 404/410 abonelik bitti; 429/5xx/ag gecici; digerleri (400/401/403/413) kalici. */
export function classifyPushError(err: unknown): { kind: PushFailureKind; code: string } {
    const status = Number((err as any)?.statusCode);
    if (!Number.isFinite(status) || status <= 0) return { kind: 'transient', code: 'push_network' };
    if (status === 404 || status === 410) return { kind: 'gone', code: `push_${status}` };
    if (status === 429 || status >= 500) return { kind: 'transient', code: `push_${status}` };
    return { kind: 'permanent', code: `push_${status}` };
}

type Outcome = 'sent' | 'retried' | 'dead' | 'skipped' | 'deferred';
export interface PushDispatchResult { sent: number; retried: number; dead: number; skipped: number; deferred: number; removedSubscriptions: number }

export class PushDispatcher {
    private readonly leaseMs: number;
    constructor(private readonly d: PushDispatcherDeps) { this.leaseMs = d.leaseMs ?? 2 * MIN; }
    private now(): Date { return this.d.now ? this.d.now() : new Date(); }

    async runOnce(): Promise<{ skipped?: string; processed: number; failed: number; note: string; result: PushDispatchResult }> {
        const result: PushDispatchResult = { sent: 0, retried: 0, dead: 0, skipped: 0, deferred: 0, removedSubscriptions: 0 };
        const f = this.d.flags();
        if (!f.v2Enabled || !f.pushEnabled) return { skipped: 'disabled', processed: 0, failed: 0, note: 'disabled', result };
        const batch = this.d.batchSize ?? 100;
        for (let i = 0; i < batch; i++) {
            const leaseUntil = new Date(this.now().getTime() + this.leaseMs);
            let doc: DeliveryDoc | null = null;
            try { doc = await this.d.store.leaseNextInstant(this.now(), leaseUntil); } catch (e) { log.error({ err: { message: (e as Error).message } }, 'kira alinamadi'); break; }
            if (!doc) break;
            try { result[await this.process(doc, leaseUntil, result)]++; }
            catch (e) { log.error({ err: { message: (e as Error).message }, deliveryId: String(doc._id) }, 'push teslimi islenemedi (kira dolunca yeniden denenir)'); }
        }
        const processed = result.sent + result.retried + result.dead + result.skipped + result.deferred;
        return { processed, failed: result.retried + result.dead, note: `sent=${result.sent} retry=${result.retried} dead=${result.dead} skipped=${result.skipped} deferred=${result.deferred} removed=${result.removedSubscriptions}`, result };
    }

    private async finish(d: DeliveryDoc, lu: Date, patch: CompletePatch, outcome: Outcome, reason?: string): Promise<Outcome> {
        const ok = await this.d.store.complete(d._id, lu, patch);
        if (!ok) log.warn({ deliveryId: String(d._id), outcome }, 'kira kaybedildi; durum yazilamadi');
        metricsRegistry.incCounter('notifications.delivery', { channel: 'push', result: outcome, ...(reason ? { reason } : {}) });
        return outcome;
    }
    private skip(d: DeliveryDoc, lu: Date, reason: string) { return this.finish(d, lu, { set: { status: 'skipped', lastErrorCode: reason } }, 'skipped', reason); }

    private async process(d: DeliveryDoc, lu: Date, result: PushDispatchResult): Promise<Outcome> {
        if (d.attempts > MAX_ATTEMPTS) return this.finish(d, lu, { set: { status: 'dead', lastErrorCode: 'lease_expired' } }, 'dead', 'max_attempts');
        const now = this.now();
        if (now.getTime() - new Date(d.createdAt).getTime() > PUSH_STALE_MS) return this.skip(d, lu, 'stale');
        const def = getDefinition(d.code);
        if (!def) return this.skip(d, lu, 'unknown_code');
        const prefs = await this.d.loadPrefs(d.tid, d.userId);
        if (!resolveChannels(def, prefs.user, prefs.tenant).push) return this.skip(d, lu, 'opt_out');
        if (!def.mandatory) {
            const until = quietUntil(now, prefs.quiet);
            if (until) return this.finish(d, lu, { set: { status: 'pending', nextAttemptAt: until, lastErrorCode: 'quiet_hours' }, inc: { attempts: -1 } }, 'deferred', 'quiet_hours');
        }
        const targets = await this.d.subscriptions.listForUser(d.tid, d.userId);
        if (!targets.length) return this.skip(d, lu, 'no_subscription');

        const ev = (await this.d.loadEvents([d.eventId])).get(String(d.eventId));
        const severity = (ev?.severity ?? 'info') as NotificationSeverity;
        const payload = JSON.stringify(buildPushPayload({ code: d.code, params: ev?.params ?? {}, locale: prefs.locale ?? d.locale ?? 'tr', eventId: String(d.eventId), severity }));
        const opts: PushSendOptions = { ttl: PUSH_TTL_SECONDS, urgency: severity === 'critical' || severity === 'error' ? 'high' : 'normal' };

        let ok = 0; let transient = 0; let permanent = 0; let lastCode = '';
        for (const t of targets) {
            try {
                await this.d.sender.send(t, payload, opts);
                ok++;
                try { await this.d.subscriptions.markSuccess(t.id, this.now()); } catch { /* bilgi amacli */ }
            } catch (err) {
                const c = classifyPushError(err);
                lastCode = c.code;
                if (c.kind === 'gone') {
                    try { await this.d.subscriptions.remove(t.id); result.removedSubscriptions++; } catch (e) { log.warn({ err: { message: (e as Error).message } }, 'biten abonelik silinemedi'); }
                } else if (c.kind === 'transient') transient++;
                else { permanent++; log.warn({ deliveryId: String(d._id), errClass: c.code }, 'push servisi istegi reddetti'); }
            }
        }
        if (ok > 0) return this.finish(d, lu, { set: { status: 'sent', sentAt: this.now() }, unset: ['lastErrorCode'] }, 'sent');
        if (transient > 0) {
            const dec = decideAfterFailure('transient', d.attempts, now);
            if (dec.action === 'dead') return this.finish(d, lu, { set: { status: 'dead', lastErrorCode: lastCode } }, 'dead', dec.reason);
            return this.finish(d, lu, { set: { status: 'pending', nextAttemptAt: dec.nextAttemptAt, lastErrorCode: lastCode } }, 'retried', lastCode);
        }
        if (permanent > 0) return this.finish(d, lu, { set: { status: 'dead', lastErrorCode: lastCode } }, 'dead', 'permanent');
        return this.skip(d, lu, 'no_subscription'); // tum cihazlarin aboneligi bitmis (silindi)
    }
}
