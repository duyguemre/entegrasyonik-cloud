// ADR-0029 Karar 4 (NB5): e-posta outbox gondericisi. Zamanlanmis is (`notifications.email-dispatch`, worker rolu) her turda:
//  1) anlik kayitlari tek tek KIRALAR (atomik) ve gonderir; 2) vadesi gelen ozet kayitlarini kullanici basina tek iletide toplar.
// Alici e-postasi gonderim aninda Users'tan cozulur (outbox'ta yok). Hata ham metin/adres icermez (yalniz sinif kodu).
// NOTIFY_V2_ENABLED / NOTIFY_EMAIL_ENABLED kapaliyken hicbir koleksiyona DOKUNMAZ, kayitlar oldugu gibi kalir.
import { logger } from '@platform/core/logger';
import { metricsRegistry } from '@platform/runtime/metrics';
import { getDefinition } from '../catalog';
import type { NotificationDefinition, NotificationLocale } from '../catalog.types';
import { resolveChannels, type PreferenceMatrix } from '../preferences';
import { buildDigestEmail, buildInstantEmail, type DigestItem } from '../templates/email';
import { classifyMailError, maskEmail } from '@services/mail/classifyMailError';
import { decideAfterFailure, MAX_ATTEMPTS } from './retry';
import { DEFAULT_TZ, nextDigestAt, normalizeDigest, quietUntil, type DigestPref, type QuietHours } from './schedule';
import { isUsableSecret, signUnsubscribeToken, UNSUB_ALL } from './unsubscribeToken';
import type { CompletePatch, DeliveryDoc, DeliveryStore } from './deliveryStore';
import { isPlatformUserId, platformHashOf } from '../platformRecipients';

const log = logger.child({ module: 'notifications.email' });
const MIN = 60_000;
const EMAIL_UNVERIFIED_EXEMPT = new Set(['security', 'billing']);

export interface MailRecipient { email?: string; emailVerified?: boolean; isActive?: boolean }
export interface LoadedPrefs { locale?: NotificationLocale; user?: PreferenceMatrix; tenant?: PreferenceMatrix; digest?: DigestPref; quiet?: QuietHours }
export interface LedgerEvent { params?: Record<string, unknown>; count?: number }
export interface OutgoingMail { to: string; subject: string; text: string; html: string; headers: Record<string, string> }

export interface DispatcherDeps {
    store: DeliveryStore;
    flags(): { v2Enabled: boolean; emailEnabled: boolean };
    loadUser(userId: string): Promise<MailRecipient | null>;
    loadPrefs(tid: number, userId: string): Promise<LoadedPrefs>;
    loadEvents(eventIds: any[]): Promise<Map<string, LedgerEvent>>;
    transport: { send(msg: OutgoingMail): Promise<{ messageId?: string }> };
    /** PUBLIC_APP_URL (dogrulanmis, sonda '/' yok); yoksa eylem baglantisi ve abonelik baglantisi uretilemez. */
    appUrl?: string;
    /** PUBLIC_API_URL (ADR-0027: app. ve api. AYRI origin; abonelik ucu API origin'indedir). Yoksa appUrl'e duser. */
    apiUrl?: string;
    /** NOTIFY_UNSUB_SECRET */
    unsubSecret?: string;
    /** NB8: platform alarm alicisi (`userId='platform:<ozet>'`) -> `ALERT_EMAIL_TO` adresi; bulunamazsa undefined (kayit `skipped:no_recipient`). */
    platformRecipient?(hash: string): string | undefined;
    now?(): Date;
    leaseMs?: number;
    batchSize?: number;
    digestGroupLimit?: number;
}

export interface DispatchResult { sent: number; retried: number; dead: number; skipped: number; deferred: number; digests: number }

type Outcome = 'sent' | 'retried' | 'dead' | 'skipped' | 'deferred';

export class EmailDispatcher {
    private readonly leaseMs: number;
    constructor(private readonly d: DispatcherDeps) { this.leaseMs = d.leaseMs ?? 5 * MIN; }
    private now(): Date { return this.d.now ? this.d.now() : new Date(); }

    /** Bir tur. Bayrak kapaliyken no-op (`skipped:'disabled'`). Tek bir kayit hatasi turu durdurmaz. */
    async runOnce(): Promise<{ skipped?: string; processed: number; failed: number; note: string; result: DispatchResult }> {
        const result: DispatchResult = { sent: 0, retried: 0, dead: 0, skipped: 0, deferred: 0, digests: 0 };
        const f = this.d.flags();
        if (!f.v2Enabled || !f.emailEnabled) return { skipped: 'disabled', processed: 0, failed: 0, note: 'disabled', result };
        const tally = (o: Outcome) => { if (o === 'sent') result.sent++; else if (o === 'retried') result.retried++; else if (o === 'dead') result.dead++; else if (o === 'skipped') result.skipped++; else result.deferred++; };
        const batch = this.d.batchSize ?? 50;
        for (let i = 0; i < batch; i++) {
            const leaseUntil = new Date(this.now().getTime() + this.leaseMs);
            let doc: DeliveryDoc | null = null;
            try { doc = await this.d.store.leaseNextInstant(this.now(), leaseUntil); } catch (e) { log.error({ err: { message: (e as Error).message } }, 'kira alinamadi'); break; }
            if (!doc) break;
            try { tally(await this.processInstant(doc, leaseUntil)); }
            catch (e) { log.error({ err: { message: (e as Error).message }, deliveryId: String(doc._id) }, 'teslim islenemedi (kira dolunca yeniden denenir)'); }
        }
        try { result.digests = await this.runDigests(tally); } catch (e) { log.error({ err: { message: (e as Error).message } }, 'ozet turu basarisiz'); }
        const processed = result.sent + result.retried + result.dead + result.skipped + result.deferred;
        return { processed, failed: result.retried + result.dead, note: `sent=${result.sent} retry=${result.retried} dead=${result.dead} skipped=${result.skipped} deferred=${result.deferred} digests=${result.digests}`, result };
    }

    // --- ortak yardimcilar ---------------------------------------------------------------------------------------------

    private async finish(d: DeliveryDoc, leaseUntil: Date, patch: CompletePatch, outcome: Outcome, reason?: string): Promise<Outcome> {
        const ok = await this.d.store.complete(d._id, leaseUntil, patch);
        if (!ok) log.warn({ deliveryId: String(d._id), outcome }, 'kira kaybedildi; durum yazilamadi');
        metricsRegistry.incCounter('notifications.delivery', { result: outcome, ...(reason ? { reason } : {}) });
        if (outcome === 'dead') metricsRegistry.incCounter('notifications.delivery.dead', { reason: reason ?? 'unknown' });
        return outcome;
    }
    private skip(d: DeliveryDoc, lu: Date, reason: string) { return this.finish(d, lu, { set: { status: 'skipped', lastErrorCode: reason } }, 'skipped', reason); }
    /** Kira alindi ama gonderim ertelendi: deneme HAKKI harcanmaz (attempts geri alinir). */
    private defer(d: DeliveryDoc, lu: Date, at: Date, reason: string) { return this.finish(d, lu, { set: { status: 'pending', nextAttemptAt: at, lastErrorCode: reason }, inc: { attempts: -1 } }, 'deferred', reason); }

    private async onSendFailure(d: DeliveryDoc, lu: Date, err: unknown): Promise<Outcome> {
        const c = classifyMailError(err);
        const dec = decideAfterFailure(c.kind, d.attempts, this.now());
        if (dec.action === 'dead') return this.finish(d, lu, { set: { status: 'dead', lastErrorCode: c.code } }, 'dead', dec.reason);
        return this.finish(d, lu, { set: { status: 'pending', nextAttemptAt: dec.nextAttemptAt, lastErrorCode: c.code } }, 'retried', c.code);
    }

    private urls(tid: number, userId: string, category: string, service: boolean) {
        const base = this.d.appUrl;
        const preferencesUrl = base ? `${base}/settings/notifications` : undefined;
        if (service) return { ok: true as const, preferencesUrl, unsubscribeUrl: undefined as string | undefined };
        if (!base || !isUsableSecret(this.d.unsubSecret)) return { ok: false as const };
        const token = signUnsubscribeToken(this.d.unsubSecret, { tid, userId, category }, this.now());
        return { ok: true as const, preferencesUrl, unsubscribeUrl: `${this.d.apiUrl ?? base}/api/notifications/unsubscribe?t=${encodeURIComponent(token)}` };
    }

    private headers(id: string, unsubscribeUrl?: string): Record<string, string> {
        const h: Record<string, string> = { 'Auto-Submitted': 'auto-generated', 'X-Entegrasyonik-Delivery': id };
        if (unsubscribeUrl) { h['List-Unsubscribe'] = `<${unsubscribeUrl}>`; h['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'; }
        return h;
    }

    /** Alici/tercih cozumu: platform alicisi env'den (tercih/abonelik yok, dogrulanmis sayilir); digerleri Users + NotificationPreferences. */
    private async loadRecipient(d: DeliveryDoc): Promise<{ user: MailRecipient | null; prefs: LoadedPrefs; platform: boolean }> {
        if (isPlatformUserId(d.userId)) {
            const email = this.d.platformRecipient?.(platformHashOf(d.userId));
            return { user: email ? { email, emailVerified: true, isActive: true } : null, prefs: {}, platform: true };
        }
        const [user, prefs] = await Promise.all([this.d.loadUser(d.userId), this.d.loadPrefs(d.tid, d.userId)]);
        return { user, prefs, platform: false };
    }

    /** Ortak on kontroller. `undefined` = gonderilebilir. */
    private gate(def: NotificationDefinition | undefined, user: MailRecipient | null, prefs: LoadedPrefs): string | undefined {
        if (!def) return 'unknown_code';
        if (!user || user.isActive === false || !user.email) return 'no_recipient';
        const exempt = def.mandatory && EMAIL_UNVERIFIED_EXEMPT.has(def.category);
        if (user.emailVerified !== true && !exempt) return 'unverified';
        if (resolveChannels(def, prefs.user, prefs.tenant).email === 'off') return 'opt_out';
        return undefined;
    }

    // --- anlik ---------------------------------------------------------------------------------------------------------

    private async processInstant(d: DeliveryDoc, lu: Date): Promise<Outcome> {
        if (d.attempts > MAX_ATTEMPTS) return this.finish(d, lu, { set: { status: 'dead', lastErrorCode: 'lease_expired' } }, 'dead', 'max_attempts');
        const def = getDefinition(d.code);
        const { user, prefs, platform } = await this.loadRecipient(d);
        const why = this.gate(def, user, prefs);
        if (why) return this.skip(d, lu, why);
        const now = this.now();
        if (!def!.mandatory) {
            const until = quietUntil(now, prefs.quiet);
            if (until) return this.defer(d, lu, until, 'quiet_hours');
        }
        const service = def!.mandatory || platform; // zorunlu ve platform alarmi: abonelik baglantisi yok (ADR-0029 Karar 4)
        const u = this.urls(d.tid, d.userId, def!.category, service);
        if (!u.ok) { log.error({ deliveryId: String(d._id) }, 'PUBLIC_APP_URL/NOTIFY_UNSUB_SECRET eksik: abonelik baglantisi uretilemedi; gonderim ertelendi'); return this.defer(d, lu, new Date(now.getTime() + 5 * MIN), 'misconfigured'); }
        const ev = (await this.d.loadEvents([d.eventId])).get(String(d.eventId));
        const content = buildInstantEmail({ code: d.code, params: ev?.params ?? {}, locale: prefs.locale ?? d.locale ?? 'tr', service, count: ev?.count, appUrl: this.d.appUrl, preferencesUrl: u.preferencesUrl, unsubscribeUrl: u.unsubscribeUrl });
        try {
            const r = await this.d.transport.send({ to: user!.email!, ...content, headers: this.headers(String(d._id), u.unsubscribeUrl) });
            return await this.finish(d, lu, { set: { status: 'sent', sentAt: this.now(), providerMessageId: r?.messageId }, unset: ['lastErrorCode'] }, 'sent');
        } catch (err) {
            log.warn({ deliveryId: String(d._id), to: maskEmail(user!.email!), errClass: classifyMailError(err).code }, 'e-posta gonderilemedi');
            return this.onSendFailure(d, lu, err);
        }
    }

    // --- ozet ----------------------------------------------------------------------------------------------------------

    private async runDigests(tally: (o: Outcome) => void): Promise<number> {
        const now = this.now();
        const cands = await this.d.store.listDigestCandidates(now, 500);
        const groups = new Map<string, DeliveryDoc[]>();
        for (const c of cands) { const k = `${c.tid}|${c.userId}`; const g = groups.get(k) ?? []; g.push(c); groups.set(k, g); }
        let sentDigests = 0; let n = 0;
        for (const rows of groups.values()) {
            if (n++ >= (this.d.digestGroupLimit ?? 50)) break;
            try { if (await this.processDigestGroup(rows, tally)) sentDigests++; }
            catch (e) { log.error({ err: { message: (e as Error).message } }, 'ozet grubu islenemedi (kira dolunca yeniden denenir)'); }
        }
        return sentDigests;
    }

    private async processDigestGroup(rows: DeliveryDoc[], tally: (o: Outcome) => void): Promise<boolean> {
        const first = rows[0];
        const platform = isPlatformUserId(first.userId);
        const prefs = platform ? {} : await this.d.loadPrefs(first.tid, first.userId);
        const now = this.now();
        const oldest = Math.min(...rows.map((r) => new Date(r.createdAt).getTime()));
        const dueAt = nextDigestAt(new Date(oldest), prefs.digest ?? normalizeDigest(undefined), prefs.quiet?.tz ?? DEFAULT_TZ);
        if (now.getTime() < dueAt.getTime()) return false;

        // Satirlari tek tek kirala (baska isci aldiysa null -> atla).
        const leaseUntil = new Date(now.getTime() + this.leaseMs);
        const leased: DeliveryDoc[] = [];
        for (const r of rows) { const l = await this.d.store.leaseDigestById(r._id, now, leaseUntil); if (l) leased.push(l); }
        if (!leased.length) return false;

        const user = (await this.loadRecipient(first)).user;
        const sendable: Array<{ d: DeliveryDoc; def: NotificationDefinition }> = [];
        for (const l of leased) {
            const def = getDefinition(l.code);
            const why = this.gate(def, user, prefs);
            if (why) tally(await this.skip(l, leaseUntil, why)); else sendable.push({ d: l, def: def! });
        }
        if (!sendable.length) return false;

        const anyMandatory = sendable.some((s) => s.def.mandatory);
        if (!anyMandatory) {
            const until = quietUntil(now, prefs.quiet);
            if (until) { for (const s of sendable) tally(await this.defer(s.d, leaseUntil, until, 'quiet_hours')); return false; }
        }
        const service = platform || sendable.every((s) => s.def.mandatory);
        const u = this.urls(first.tid, first.userId, UNSUB_ALL, service);
        if (!u.ok) {
            log.error({ tid: first.tid }, 'PUBLIC_APP_URL/NOTIFY_UNSUB_SECRET eksik: ozet ertelendi');
            for (const s of sendable) tally(await this.defer(s.d, leaseUntil, new Date(now.getTime() + 5 * MIN), 'misconfigured'));
            return false;
        }
        const events = await this.d.loadEvents(sendable.map((s) => s.d.eventId));
        const items: DigestItem[] = sendable.map((s) => { const ev = events.get(String(s.d.eventId)); return { code: s.d.code, params: ev?.params ?? {}, count: ev?.count }; });
        const content = buildDigestEmail({ items, locale: prefs.locale ?? first.locale ?? 'tr', service, appUrl: this.d.appUrl, preferencesUrl: u.preferencesUrl, unsubscribeUrl: u.unsubscribeUrl });
        try {
            const r = await this.d.transport.send({ to: user!.email!, ...content, headers: this.headers(`digest:${String(first._id)}`, u.unsubscribeUrl) });
            for (const s of sendable) tally(await this.finish(s.d, leaseUntil, { set: { status: 'sent', sentAt: this.now(), providerMessageId: r?.messageId }, unset: ['lastErrorCode'] }, 'sent'));
            return true;
        } catch (err) {
            log.warn({ to: maskEmail(user!.email!), errClass: classifyMailError(err).code }, 'ozet e-postasi gonderilemedi');
            for (const s of sendable) tally(await this.onSendFailure(s.d, leaseUntil, err));
            return false;
        }
    }
}
