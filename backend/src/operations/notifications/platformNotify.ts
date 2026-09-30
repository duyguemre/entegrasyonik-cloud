// ADR-0029 Karar 7 / ADR-0017 `AlertChannel` (e-posta adaptoru, NB8): `platformNotify(code, params, opts)` -- katalogdaki `surface:'platform'` kodlari.
// Uygulama ici karsiligi backoffice "Uyarilar" paneli (`Alerts`, ikinci kopya YAZILMAZ); e-posta NB5 outbox'indan `ALERT_EMAIL_TO` alicilarina gider.
// Golge mod (`shadow`): yalniz defter + `suppressed:shadow` teslim kaydi (e-posta gitmez). ASLA firlatmaz. Bayrak kapaliyken (NOTIFY_V2) hicbir kolleksiyona dokunmaz.
import { logger } from '@platform/core/logger';
import { getDefinition } from './catalog';
import { NotificationLedger, type LedgerModelLike } from './ledger';
import { resolveChannels } from './preferences';
import { sanitizeParams } from './safeError';
import { platformUserId, type PlatformRecipient } from './platformRecipients';
import { NOTIFICATION_LEDGER_RETENTION_DAYS } from '@database/application/models/NotificationEvent';
import type { NotifyResult } from './notify';

const log = logger.child({ module: 'notifications.platform' });
const DAY = 24 * 60 * 60 * 1000;
/** Platform olaylarinin defter `tid` degeri (tenant yok). */
export const PLATFORM_TID = 0;

export interface PlatformNotifyOptions { idempotencyKey?: string; shadow?: boolean; corrId?: string; occurredAt?: Date; module?: string }

export interface PlatformNotifyDeps {
    ledgerModel: LedgerModelLike;
    deliveryModel: { insertMany(docs: any[]): Promise<any[]> };
    flags(): { v2Enabled: boolean; emailEnabled: boolean };
    recipients(): PlatformRecipient[];
    now?(): Date;
}

export class PlatformNotifier {
    private readonly ledger: NotificationLedger;
    constructor(private readonly d: PlatformNotifyDeps) { this.ledger = new NotificationLedger(d.ledgerModel, () => this.now()); }
    private now(): Date { return this.d.now ? this.d.now() : new Date(); }

    async notify(code: string, params: Record<string, unknown>, opts: PlatformNotifyOptions = {}): Promise<NotifyResult> {
        try { return await this.run(code, params ?? {}, opts); }
        catch (err) {
            log.error({ err: { code: (err as any)?.code, message: (err as Error)?.message }, notifyCode: code }, 'platformNotify basarisiz');
            return { status: 'failed', reason: 'exception' };
        }
    }

    private async run(code: string, rawParams: Record<string, unknown>, opts: PlatformNotifyOptions): Promise<NotifyResult> {
        const def = getDefinition(code);
        if (!def || def.surface !== 'platform') return { status: 'failed', reason: 'unknown_code' };
        if (!this.d.flags().v2Enabled) return { status: 'skipped', reason: 'disabled' };
        const parsed = def.params.safeParse(sanitizeParams(rawParams));
        if (!parsed.success) { log.warn({ notifyCode: code }, 'platform params gecersiz'); return { status: 'failed', reason: 'invalid_params' }; }
        const params = parsed.data as Record<string, unknown>;
        const occurredAt = opts.occurredAt ?? this.now();
        const severity = typeof def.severity === 'function' ? def.severity(params) : def.severity;
        const idemKey = opts.idempotencyKey ? `x:${def.code}:0:${opts.idempotencyKey}` : `e:${def.code}:0:${occurredAt.getTime()}:${Math.random().toString(36).slice(2, 10)}`;
        const r = await this.ledger.tryInsert({
            tid: PLATFORM_TID, code: def.code, category: def.category, severity, kind: 'event', idemKey, lastOccurredAt: occurredAt, params,
            source: { module: opts.module ?? 'alerts', corrId: opts.corrId },
        });
        if (!r.inserted) { await this.ledger.countDuplicate(idemKey); return { status: 'duplicate' }; }

        const recipients = this.d.recipients();
        const ch = resolveChannels(def);
        const email = ch.email;
        const docs = email === 'off' ? [] : recipients.map((rc) => {
            const shadow = opts.shadow === true;
            const disabled = !this.d.flags().emailEnabled;
            return {
                eventId: r.id, tid: PLATFORM_TID, userId: platformUserId(rc.hash), code: def.code, channel: 'email', mode: email,
                status: shadow ? 'suppressed' : disabled ? 'skipped' : 'pending', lastErrorCode: shadow ? 'shadow' : disabled ? 'disabled' : undefined,
                locale: 'tr', attempts: 0, nextAttemptAt: occurredAt, createdAt: occurredAt, expAt: new Date(occurredAt.getTime() + NOTIFICATION_LEDGER_RETENTION_DAYS * DAY),
            };
        });
        let queued = 0;
        if (docs.length) {
            try { await this.d.deliveryModel.insertMany(docs); queued = docs.filter((x) => x.status === 'pending').length; }
            catch (e) { log.error({ err: { message: (e as Error).message }, notifyCode: code }, 'platform outbox yazimi basarisiz'); }
        }
        await this.ledger.finalize(r.id, { recipientCount: recipients.length, inAppCount: 0, emailQueued: queued, suppressedCount: docs.length - queued }).catch(() => undefined);
        return opts.shadow ? { status: 'suppressed', eventId: r.id, recipients: recipients.length, reason: 'shadow' } : { status: 'created', eventId: r.id, recipients: recipients.length };
    }
}
