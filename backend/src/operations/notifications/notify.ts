// ADR-0029 Karar 2: `notify(code, tid, params, opts)` TEK giris noktasi (cekirdek). Cephe `services/notification/NotificationService`
// bir "sink" olarak bunu bootstrap'ta enjekte alir (ADR-0024: services -> operations importu yok).
//
// Akis: katalog + params dogrulama -> idempotency (defter, uniq idemKey) -> grup penceresi (defter, surecler arasi) ->
// alici cozumu -> uygulama ici belge (ALICI BASINA, userId dolu) -> e-posta outbox kaydi -> RealtimeBus.publish.
// Cagirana ASLA hata firlatmaz; sonuc `status` ile doner.
import { logger } from '@platform/core/logger';
import { getDefinition } from './catalog';
import type { MinTier, NotificationDefinition, NotificationSeverity } from './catalog.types';
import { Member, memberTier, resolveRecipients, HasPermission } from './audience';
import { resolveChannels } from './preferences';
import { NotificationLedger, LedgerModelLike } from './ledger';
import { bumpGroup, createForRecipients, InAppNotificationInput, NotificationModelLike } from './inAppRepository';
import { renderNotification } from './templates/render';
import { sanitizeParams } from './safeError';
import { NOTIFICATION_LEDGER_RETENTION_DAYS } from '@database/application/models/NotificationEvent';

const log = logger.child({ module: 'notifications.notify' });

export type NotifyStatus = 'created' | 'grouped' | 'duplicate' | 'suppressed' | 'skipped' | 'failed';
export interface NotifyResult { status: NotifyStatus; eventId?: string; recipients?: number; reason?: string }

export interface NotifyOptions {
    idempotencyKey?: string;
    recipients?: { userIds: string[] };
    actorUserId?: string;
    actorImpersonating?: boolean;
    occurredAt?: Date;
    corrId?: string;
    /** Uretici modul adi (defter `source.module`). */
    module?: string;
    /** NB7: e-posta kanalini cagiran belirler (false = e-posta teslimi uretilmez). Verilmezse katalog/tercih kurali. */
    email?: boolean;
    /** NB7: alici kume alt siniri (ornek 'admin' = yalniz sahip ve yoneticiler). */
    minTier?: MinTier;
    /** NB8: golge mod -- yalniz defter yazilir (`suppressed:shadow`), uygulama ici belge/e-posta/zil uretilmez. */
    shadow?: boolean;
}

const TIER_RANK: Record<MinTier, number> = { member: 1, admin: 2, owner: 3 };

export interface DeliveryModelLike { insertMany(docs: any[]): Promise<any[]> }

export interface RealtimePublish { tid: number; userIds: string[]; kind: 'notification'; id: string; meta: { category: string; severity: string } }

export interface NotifyDeps {
    ledgerModel: LedgerModelLike;
    deliveryModel: DeliveryModelLike;
    /** Tenant DB `Notifications` modeli; tenant yoksa undefined. */
    tenantNotificationModel(tid: number): Promise<NotificationModelLike | undefined>;
    /** Tenant'in AKTIF uyeleri (e-posta adresi DONMEZ). */
    listMembers(tid: number): Promise<Member[]>;
    flags(): { v2Enabled: boolean; emailEnabled: boolean; pushEnabled?: boolean };
    /** MOB-04: aday alicilardan push teslimi uretilecekler (cihaz aboneligi + tercih). Yoksa push yok. */
    pushRecipients?(tid: number, def: NotificationDefinition, userIds: string[]): Promise<string[]>;
    hasPermission?: HasPermission;
    /** RealtimeBus (NB6); yoksa yayin yok. Hata yutulur. */
    publish?(evt: RealtimePublish): void | Promise<void>;
    now?(): Date;
}

export interface LegacyNotificationInput {
    type: string; mode?: string; severity?: string; title: string; message: string; actionUrl?: string;
    metaData?: Record<string, unknown>; userId?: string;
}

type LegacyOverride = { title: string; message: string; severity: NotificationSeverity; actionUrl?: string | null; metaData?: Record<string, unknown>; mode?: string };

const CATEGORY_TYPE: Record<string, string> = { order: 'ORDER', stock: 'STOCK_ALERT', catalog: 'INFO', integration: 'SYSTEM', finance: 'SYSTEM', billing: 'SYSTEM', security: 'SYSTEM', system: 'SYSTEM' };
const MODES = new Set(['TRANSFER', 'UPDATE_PRICE', 'UPDATE_STOCK', 'UPDATE', 'UPDATE_VARIANT', 'UPDATE_DELIVERY', 'IMPORT', 'BILLING']);
const EMAIL_UNVERIFIED_EXEMPT = new Set(['security', 'billing']);
const DAY = 24 * 60 * 60 * 1000;

export class Notifier {
    private readonly ledger: NotificationLedger;
    constructor(private readonly deps: NotifyDeps) {
        this.ledger = new NotificationLedger(deps.ledgerModel, () => this.now());
    }
    private now(): Date { return this.deps.now ? this.deps.now() : new Date(); }

    /** Tek giris. ASLA firlatmaz. */
    async notify(code: string, tid: number, params: Record<string, unknown>, opts: NotifyOptions = {}): Promise<NotifyResult> {
        try {
            return await this.run(code, tid, params ?? {}, opts);
        } catch (err) {
            log.error({ err: { code: (err as any)?.code, message: (err as Error)?.message }, notifyCode: code, tid }, 'notify basarisiz');
            return { status: 'failed', reason: 'exception' };
        }
    }

    /** `sendClientNotification` koprusu (ADR-0029 Karar 9): metaData.code+params katalogdaysa o kod, degilse LEGACY_<type>. */
    async notifyLegacy(tid: number, n: LegacyNotificationInput): Promise<NotifyResult> {
        try {
            const mCode = (n.metaData as any)?.code;
            const mParams = (n.metaData as any)?.params;
            const def = typeof mCode === 'string' ? getDefinition(mCode) : undefined;
            if (def && !def.legacy && def.surface === 'tenant' && mParams && typeof mParams === 'object') {
                return await this.notify(def.code, tid, mParams, { recipients: n.userId ? { userIds: [n.userId] } : undefined, module: 'legacy' });
            }
            const legacyDef = getDefinition(`LEGACY_${n.type}`) ?? getDefinition('LEGACY_INFO')!;
            const sev = (['info', 'success', 'warning', 'error', 'critical'] as const).find((s) => s === n.severity)
                ?? (n.severity === 'danger' ? 'error' : 'info');
            return await this.run(legacyDef.code, tid, {}, {
                recipients: n.userId ? { userIds: [n.userId] } : undefined, module: 'legacy',
            }, { title: n.title, message: n.message, severity: sev, actionUrl: n.actionUrl ?? null, metaData: n.metaData, mode: n.mode });
        } catch (err) {
            log.error({ err: { code: (err as any)?.code, message: (err as Error)?.message }, tid }, 'notifyLegacy basarisiz');
            return { status: 'failed', reason: 'exception' };
        }
    }

    /** NB8 golge mod: yalniz defter kaydi (idempotency/grup YOK); tenant bildirimi uretilmez. */
    private async recordShadow(code: string, category: string, tid: number, severity: string, params: Record<string, unknown>, opts: NotifyOptions, occurredAt: Date): Promise<NotifyResult> {
        const r = await this.ledger.tryInsert({
            tid, code, category, severity, kind: 'event', idemKey: `s:${code}:${tid}:${occurredAt.getTime()}:${Math.random().toString(36).slice(2, 10)}`,
            lastOccurredAt: occurredAt, params, source: { module: opts.module, corrId: opts.corrId },
        });
        if (!r.inserted) return { status: 'failed', reason: 'ledger_conflict' };
        await this.ledger.finalize(r.id, { recipientCount: 0, inAppCount: 0, emailQueued: 0, suppressedCount: 1 });
        return { status: 'suppressed', eventId: r.id, recipients: 0, reason: 'shadow' };
    }

    private async run(code: string, tid: number, rawParams: Record<string, unknown>, opts: NotifyOptions, legacy?: LegacyOverride): Promise<NotifyResult> {
        const def = getDefinition(code);
        if (!def) { log.warn({ notifyCode: code }, 'bilinmeyen bildirim kodu'); return { status: 'failed', reason: 'unknown_code' }; }
        if (!this.deps.flags().v2Enabled) return { status: 'skipped', reason: 'disabled' };
        if (def.surface === 'platform') return { status: 'skipped', reason: 'platform_surface' }; // platformNotify: NB8
        if (!Number.isInteger(tid) || tid <= 0) return { status: 'failed', reason: 'bad_tenant' };

        // 1) params: hata nesnesi -> guvenli kod (N-05), zod strict (PII / fazla alan reddi), <= 2 KB
        let params: Record<string, unknown> = {};
        if (!legacy) {
            const cleaned = sanitizeParams(rawParams);
            if (cleaned.corrId === undefined && opts.corrId && 'corrId' in ((def.params as any).shape ?? {})) cleaned.corrId = opts.corrId;
            const parsed = def.params.safeParse(cleaned);
            if (!parsed.success) { log.warn({ notifyCode: code, issues: parsed.error.issues.map((i) => `${i.code}:${i.path.join('.')}`) }, 'params gecersiz'); return { status: 'failed', reason: 'invalid_params' }; }
            params = parsed.data as Record<string, unknown>;
            if (JSON.stringify(params).length > 2048) return { status: 'failed', reason: 'params_too_large' };
        }
        const occurredAt = opts.occurredAt ?? this.now();
        if (opts.shadow) return this.recordShadow(def.code, def.category, tid, legacy ? 'info' : typeof def.severity === 'function' ? def.severity(params) : def.severity, params, opts, occurredAt);
        const severity: NotificationSeverity = legacy ? legacy.severity : typeof def.severity === 'function' ? def.severity(params) : def.severity;
        const base = { tid, code: def.code, category: def.category, severity, source: { module: opts.module, corrId: opts.corrId } };
        const stored = legacy ? undefined : params;
        const created: string[] = [];
        let groupKeyVal: string | undefined;
        let written = false; // uygulama ici belgeler yazildiktan sonra defter geri ALINMAZ (dedupe korunur)

        try {
            // 2) idempotency (defter). Acik anahtar ya da katalog dedupeKey.
            const dedupe = opts.idempotencyKey ? `x:${def.code}:${tid}:${opts.idempotencyKey}` : def.dedupeKey ? `d:${def.code}:${tid}:${def.dedupeKey(params)}` : undefined;
            const grouped = !legacy && def.group ? def.group : undefined;
            let eventId: string | undefined;

            if (dedupe) {
                const r = await this.ledger.tryInsert({ ...base, kind: grouped ? 'dedupe' : 'event', idemKey: dedupe, lastOccurredAt: occurredAt, params: grouped ? undefined : stored });
                if (!r.inserted) { await this.ledger.countDuplicate(dedupe); return { status: 'duplicate' }; }
                created.push(r.id);
                if (!grouped) eventId = r.id;
            }

            // 3) grup penceresi (defter; surecler arasi guvenli)
            if (grouped) {
                const groupKey = grouped.key(params);
                const bucket = Math.floor(occurredAt.getTime() / grouped.windowMs);
                const idemKey = `g:${def.code}:${tid}:${groupKey}:${bucket}`;
                const r = await this.ledger.tryInsert({ ...base, kind: 'event', idemKey, groupKey, bucket, lastOccurredAt: occurredAt, params: stored });
                if (!r.inserted) {
                    const leaderId = await this.ledger.bumpGroupLeader(idemKey, occurredAt, stored);
                    const model = await this.deps.tenantNotificationModel(tid);
                    if (leaderId && model) await bumpGroup(model, leaderId, { lastOccurredAt: occurredAt, params: stored });
                    // dedupe isareti bu olay icin tuketildi ama bildirim yeni belge uretmedi -> isaret KALIR (ayni olay tekrar sayilmaz)
                    return { status: 'grouped', eventId: leaderId };
                }
                created.push(r.id);
                eventId = r.id;
                groupKeyVal = groupKey;
            }

            if (!eventId) {
                // dedupe/grup yok: her cagri ayri olay
                const r = await this.ledger.tryInsert({ ...base, kind: 'event', idemKey: `e:${def.code}:${tid}:${occurredAt.getTime()}:${Math.random().toString(36).slice(2, 10)}`, lastOccurredAt: occurredAt, params: stored });
                if (!r.inserted) return { status: 'failed', reason: 'ledger_conflict' };
                created.push(r.id);
                eventId = r.id;
            }

            // 5) alicilar
            const members = await this.deps.listMembers(tid);
            let recipients = resolveRecipients(def, opts, members, this.deps.hasPermission);
            if (opts.minTier) recipients = recipients.filter((m) => TIER_RANK[memberTier(m)] >= TIER_RANK[opts.minTier!]);
            if (!recipients.length) {
                await this.ledger.finalize(eventId, { recipientCount: 0, inAppCount: 0, emailQueued: 0, suppressedCount: 0 });
                return { status: 'suppressed', eventId, recipients: 0, reason: 'no_recipients' };
            }

            // 6) uygulama ici: alici basina belge
            const model = await this.deps.tenantNotificationModel(tid);
            if (!model) { await this.ledger.rollback(created); return { status: 'failed', reason: 'tenant_not_found' }; }
            const rendered = legacy ? { title: legacy.title, message: legacy.message } : renderNotification(def.code, params, 'tr');
            const mode = legacy?.mode ?? (typeof params.mode === 'string' && MODES.has(params.mode) ? params.mode : (def.legacyMode && MODES.has(def.legacyMode) ? def.legacyMode : undefined));
            const type = def.legacyType ?? CATEGORY_TYPE[def.category] ?? 'SYSTEM';
            const needsMode = type === 'BATCH_PROCESS' || type === 'EXPORT_READY' || type === 'IMPORT_READY';
            const items: InAppNotificationInput[] = recipients.map((m) => ({
                userId: m.userId, type, mode: mode ?? (needsMode ? 'TRANSFER' : undefined), severity, title: rendered.title, message: rendered.message,
                actionUrl: legacy ? legacy.actionUrl : def.action ? def.action(params) : null,
                metaData: legacy ? legacy.metaData : { code: def.code, ...(opts.corrId ? { corrId: opts.corrId } : {}) },
                code: legacy ? undefined : def.code, category: def.category, params: stored, eventId, groupKey: groupKeyVal,
                retention: def.retention, occurredAt,
            }));
            let ids: string[];
            try { ids = await createForRecipients(model, items); }
            catch (e) { await this.ledger.rollback(created); throw e; }
            written = true;

            // 7) e-posta outbox (gonderici NB5). Tercih modeli gelene dek katalog varsayilani.
            let emailQueued = 0; let suppressed = 0;
            const deliveries: any[] = [];
            const { emailEnabled } = this.deps.flags();
            for (const m of recipients) {
                if (opts.actorImpersonating && m.userId === opts.actorUserId) { suppressed++; continue; } // destek aktoru e-posta ALAMAZ
                const ch = resolveChannels(def);
                if (ch.email === 'off' || opts.email === false) continue;
                let status: 'pending' | 'skipped' = 'pending'; let reason: string | undefined;
                if (!emailEnabled) { status = 'skipped'; reason = 'disabled'; }
                else if (m.emailVerified !== true && !(def.mandatory && EMAIL_UNVERIFIED_EXEMPT.has(def.category))) { status = 'skipped'; reason = 'unverified'; }
                if (status === 'pending') emailQueued++; else suppressed++;
                deliveries.push({
                    eventId, tid, userId: m.userId, code: def.code, channel: 'email', mode: ch.email, status, lastErrorCode: reason,
                    locale: m.locale ?? 'tr', attempts: 0, nextAttemptAt: occurredAt, createdAt: occurredAt,
                    expAt: new Date(occurredAt.getTime() + NOTIFICATION_LEDGER_RETENTION_DAYS * DAY),
                });
            }
            // 7b) web push outbox (MOB-04; gonderici `notifications.push-dispatch`). Destek aktoru push da ALAMAZ.
            const { pushEnabled } = this.deps.flags();
            if (pushEnabled && this.deps.pushRecipients) {
                const candidates = recipients.filter((m) => !(opts.actorImpersonating && m.userId === opts.actorUserId)).map((m) => m.userId);
                try {
                    const locales = new Map(recipients.map((m) => [m.userId, m.locale ?? 'tr']));
                    for (const userId of await this.deps.pushRecipients(tid, def, candidates)) {
                        deliveries.push({
                            eventId, tid, userId, code: def.code, channel: 'push', mode: 'instant', status: 'pending', locale: locales.get(userId) ?? 'tr',
                            attempts: 0, nextAttemptAt: occurredAt, createdAt: occurredAt, expAt: new Date(occurredAt.getTime() + NOTIFICATION_LEDGER_RETENTION_DAYS * DAY),
                        });
                    }
                } catch (e) { log.warn({ err: { message: (e as Error).message }, notifyCode: code, tid }, 'push alicilari cozulemedi (uygulama ici korundu)'); }
            }
            if (deliveries.length) {
                try { await this.deps.deliveryModel.insertMany(deliveries); }
                catch (e) { log.error({ err: { message: (e as Error).message }, notifyCode: code, tid }, 'outbox yazimi basarisiz (uygulama ici korundu)'); emailQueued = 0; }
            }
            try { await this.ledger.finalize(eventId, { recipientCount: recipients.length, inAppCount: ids.length, emailQueued, suppressedCount: suppressed }); }
            catch (e) { log.warn({ err: { message: (e as Error).message } }, 'defter ozeti yazilamadi'); }

            // 8) zil (NB6); hata yutulur
            try { await this.deps.publish?.({ tid, userIds: recipients.map((m) => m.userId), kind: 'notification', id: eventId, meta: { category: def.category, severity } }); }
            catch (e) { log.warn({ err: { message: (e as Error).message } }, 'realtime publish basarisiz'); }
            return { status: 'created', eventId, recipients: recipients.length };
        } catch (e) {
            // Defter yazimi/okumasi sirasinda beklenmeyen hata: dedupe isareti kalmasin ki yeniden denenebilsin.
            if (!written && created.length) await this.ledger.rollback(created);
            throw e;
        }
    }
}

