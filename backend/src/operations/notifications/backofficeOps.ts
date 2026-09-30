// ADR-0029 Karar 7 (NB7): backoffice bildirim islemleri -- SAF is mantigi (modeller/saat/tasiyici ENJEKTE edilir; HTTP/RunOperation bilmez).
// Kapsam: teslim istatistigi + liste, yeniden dene / at (audit), tenant bildirim gecmisi (YALNIZ meta veri), katalog + sablon onizleme, test e-postasi.
// Gizlilik: e-posta adresi, kullanici kimligi ve bildirim metni/params HICBIR yanita girmez (teslim satiri: kod, tenant no, kanal, durum, deneme, hata KODU, zamanlar).
import { ApplicationError } from '@platform/core/errors';
import { AuditLogger } from '@services/audit/AuditLogger';
import { getRequestId } from '@platform/core/context';
import { getCatalogDto, getDefinition } from './catalog';
import type { NotificationLocale } from './catalog.types';
import { NOTIFICATION_LOCALES } from './catalog.types';
import { renderNotification } from './templates/render';
import { buildInstantEmail } from './templates/email';

export const MAX_LIMIT = 200;
export const DEFAULT_LIMIT = 50;
export const QUERY_MAX_TIME_MS = 5000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const bad = (m: string): never => { throw new ApplicationError(m, 400, 'VALIDATION'); };
export const clampLimit = (v: unknown): number => Math.min(MAX_LIMIT, Math.max(1, Number.isInteger(v) ? (v as number) : DEFAULT_LIMIT));

const OID = /^[a-f0-9]{24}$/i;
export const encodeCursor = (id: unknown): string => Buffer.from(String(id), 'utf8').toString('base64url');
export function decodeCursor(c: string): string {
    const id = Buffer.from(c, 'base64url').toString('utf8');
    return OID.test(id) ? id : bad('cursor: imleç geçersiz');
}

export interface BackofficeActor { sub?: string; ip?: string }

export interface NotificationOpsDeps {
    applicationDB: { getNotificationDeliveryModel(): any; getNotificationEventModel(): any; getUserModel?(): any };
    now?: () => Date;
    flags?: () => { emailEnabled: boolean };
    /** PUBLIC_APP_URL (onizleme baglantilari icin); yoksa eylem baglantisi uretilmez. */
    appUrl?: string;
    transport?: { send(msg: { to: string; subject: string; text: string; html: string; headers: Record<string, string> }): Promise<{ messageId?: string }> };
}

const audit = (event: string, actor: BackofficeActor | undefined, result: 'ok' | 'fail', meta: Record<string, string | number | boolean>): void => {
    void AuditLogger.log({ event, result, sub: actor?.sub, ip: actor?.ip, surface: 'backoffice', actorType: 'platform', reqId: getRequestId(), meta });
};

const DELIVERY_STATUSES = ['pending', 'sending', 'sent', 'failed', 'dead', 'skipped', 'suppressed'] as const;
const RETRYABLE = ['dead', 'failed'];
const DISCARDABLE = ['pending', 'dead', 'failed', 'skipped'];

/** Teslim satiri: e-posta adresi / userId / platformRecipient / icerik YOK. */
export function toDeliveryRow(d: any) {
    return {
        id: String(d._id), eventId: String(d.eventId), tid: d.tid, code: d.code, channel: d.channel, mode: d.mode, status: d.status, attempts: d.attempts ?? 0,
        lastErrorCode: d.lastErrorCode ?? null, createdAt: d.createdAt ?? null, nextAttemptAt: d.nextAttemptAt ?? null, sentAt: d.sentAt ?? null,
    };
}

export class NotificationOps {
    constructor(private readonly d: NotificationOpsDeps) {}
    private now(): Date { return this.d.now ? this.d.now() : new Date(); }

    // ---- teslim istatistigi -------------------------------------------------------------------------------------------
    async getDeliveryStats(): Promise<any> {
        const model = this.d.applicationDB.getNotificationDeliveryModel();
        const now = this.now();
        const window = async (ms: number) => {
            const rows: any[] = await model.aggregate([
                { $match: { createdAt: { $gte: new Date(now.getTime() - ms) } } },
                { $group: { _id: { channel: '$channel', status: '$status', code: '$code' }, n: { $sum: 1 } } },
                { $limit: 2000 },
            ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
            const byStatus: Record<string, number> = Object.fromEntries(DELIVERY_STATUSES.map((s) => [s, 0]));
            const matrix = new Map<string, number>();
            const codes = new Map<string, Record<string, number>>();
            for (const r of rows) {
                const { channel, status, code } = r._id ?? {};
                byStatus[status] = (byStatus[status] ?? 0) + r.n;
                matrix.set(`${channel}|${status}`, (matrix.get(`${channel}|${status}`) ?? 0) + r.n);
                const c = codes.get(code) ?? {}; c[status] = (c[status] ?? 0) + r.n; codes.set(code, c);
            }
            return {
                byStatus,
                byChannelStatus: [...matrix].map(([k, n]) => { const [channel, status] = k.split('|'); return { channel, status, count: n }; }),
                byCode: [...codes].map(([code, statuses]) => ({ code, statuses })).sort((a, b) => Object.values(b.statuses).reduce((x, y) => x + y, 0) - Object.values(a.statuses).reduce((x, y) => x + y, 0)).slice(0, 100),
            };
        };
        const [h24, d7] = await Promise.all([window(DAY), window(7 * DAY)]);
        const oldest: any = await model.findOne({ status: 'pending' }, { nextAttemptAt: 1 }).sort({ nextAttemptAt: 1 }).maxTimeMS(QUERY_MAX_TIME_MS).lean();
        const oldestPendingAgeSec = oldest?.nextAttemptAt ? Math.max(0, Math.floor((now.getTime() - new Date(oldest.nextAttemptAt).getTime()) / 1000)) : null;
        return { generatedAt: now.toISOString(), windows: { '24h': h24, '7d': d7 }, oldestPendingAgeSec };
    }

    // ---- liste ------------------------------------------------------------------------------------------------------
    async listDeliveries(i: { status?: string; channel?: string; tid?: number; code?: string; eventId?: string; cursor?: string; limit?: number }): Promise<any> {
        const limit = clampLimit(i.limit);
        const match: Record<string, unknown> = {};
        if (i.status !== undefined) match.status = i.status;
        if (i.channel !== undefined) match.channel = i.channel;
        if (i.tid !== undefined) match.tid = i.tid;
        if (i.code !== undefined) match.code = i.code;
        if (i.eventId !== undefined) match.eventId = OID.test(i.eventId) ? i.eventId : bad('eventId: geçersiz kimlik');
        const query = i.cursor !== undefined ? { $and: [match, { _id: { $lt: decodeCursor(i.cursor) } }] } : match;
        const rows: any[] = await this.d.applicationDB.getNotificationDeliveryModel().find(query).sort({ _id: -1 }).limit(limit + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean();
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        return { items: page.map(toDeliveryRow), nextCursor: hasMore ? encodeCursor(page[page.length - 1]._id) : null };
    }

    // ---- yeniden dene / at ------------------------------------------------------------------------------------------
    private async transition(actor: BackofficeActor | undefined, id: string, reason: string, allowed: string[], update: Record<string, unknown>, event: string): Promise<any> {
        if (!OID.test(id)) bad('id: geçersiz kimlik');
        const model = this.d.applicationDB.getNotificationDeliveryModel();
        const r = await model.updateOne({ _id: id, status: { $in: allowed } }, update);
        if ((r?.modifiedCount ?? r?.nModified ?? 0) > 0) { audit(event, actor, 'ok', { deliveryId: id, reason }); return { id, ok: true }; }
        const cur: any = await model.findOne({ _id: id }, { status: 1, tid: 1 }).maxTimeMS(QUERY_MAX_TIME_MS).lean();
        audit(event, actor, 'fail', { deliveryId: id, reason, why: cur ? 'state' : 'not_found' });
        if (!cur) throw new ApplicationError('Teslim kaydı bulunamadı.', 404, 'DELIVERY_NOT_FOUND');
        throw new ApplicationError('Teslim kaydı bu durumda bu işleme uygun değil.', 409, 'DELIVERY_STATE');
    }
    retryDelivery(actor: BackofficeActor | undefined, i: { id: string; reason: string }): Promise<any> {
        const now = this.now();
        return this.transition(actor, i.id, i.reason, RETRYABLE,
            { $set: { status: 'pending', nextAttemptAt: now, attempts: 0 }, $unset: { leaseUntil: '', lastErrorCode: '' } }, 'backoffice.notifications.retry_delivery');
    }
    discardDelivery(actor: BackofficeActor | undefined, i: { id: string; reason: string }): Promise<any> {
        return this.transition(actor, i.id, i.reason, DISCARDABLE, { $set: { status: 'suppressed', lastErrorCode: 'discarded' }, $unset: { leaseUntil: '' } }, 'backoffice.notifications.discard_delivery');
    }

    // ---- tenant gecmisi (YALNIZ meta) ----------------------------------------------------------------------------------
    async getTenantHistory(i: { tid: number; cursor?: string; limit?: number }): Promise<any> {
        const limit = clampLimit(i.limit);
        const base = { tid: i.tid, kind: 'event' };
        const query = i.cursor !== undefined ? { $and: [base, { _id: { $lt: decodeCursor(i.cursor) } }] } : base;
        const rows: any[] = await this.d.applicationDB.getNotificationEventModel().find(query).sort({ _id: -1 }).limit(limit + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean();
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const email = new Map<string, Record<string, number>>();
        if (page.length) {
            const agg: any[] = await this.d.applicationDB.getNotificationDeliveryModel().aggregate([
                { $match: { eventId: { $in: page.map((r) => r._id) } } },
                { $group: { _id: { eventId: '$eventId', status: '$status' }, n: { $sum: 1 } } },
            ]).option({ maxTimeMS: QUERY_MAX_TIME_MS });
            for (const a of agg) { const k = String(a._id.eventId); const o = email.get(k) ?? {}; o[a._id.status] = a.n; email.set(k, o); }
        }
        return {
            items: page.map((r) => ({
                id: String(r._id), at: r.lastOccurredAt ?? r.createdAt, code: r.code, category: r.category, severity: r.severity, count: r.count ?? 1,
                recipientCount: r.recipientCount ?? 0, inAppCount: r.inAppCount ?? 0, emailQueued: r.emailQueued ?? 0, suppressedCount: r.suppressedCount ?? 0,
                emailStatus: email.get(String(r._id)) ?? {},
            })),
            nextCursor: hasMore ? encodeCursor(page[page.length - 1]._id) : null,
        };
    }

    // ---- katalog + onizleme ---------------------------------------------------------------------------------------------
    getCatalog(): any {
        return { items: getCatalogDto().map((c) => ({ ...c, example: getDefinition(c.code)?.example ?? {} })) };
    }

    /** Yalniz render (gonderim YOK). `params` yoksa katalog ornegi; gecerli degilse 400 (yalniz alan yolu/kural kodu). */
    previewTemplate(i: { code: string; locale: NotificationLocale; channel: 'inApp' | 'email'; params?: Record<string, unknown> }): any {
        const def = getDefinition(i.code) ?? (() => { throw new ApplicationError('Bildirim kodu bulunamadı.', 404, 'NOT_FOUND'); })();
        if (!(NOTIFICATION_LOCALES as readonly string[]).includes(i.locale)) bad('locale geçersiz');
        let params: Record<string, unknown>;
        if (def.legacy) params = (i.params ?? def.example) as Record<string, unknown>;
        else {
            const parsed = def.params.safeParse(i.params ?? def.example);
            if (!parsed.success) bad(`params geçersiz: ${parsed.error.issues.slice(0, 5).map((x) => `${x.path.join('.') || '-'}:${x.code}`).join(', ')}`);
            params = (parsed as { data: Record<string, unknown> }).data;
        }
        if (i.channel === 'inApp') {
            const r = renderNotification(def.code, params, i.locale);
            return { channel: 'inApp', locale: i.locale, title: r.title, message: r.message, actionPath: def.action ? def.action(params) : null, severity: typeof def.severity === 'function' ? def.severity(params) : def.severity };
        }
        const mail = buildInstantEmail({
            code: def.code, params, locale: i.locale, service: def.mandatory, appUrl: this.d.appUrl,
            preferencesUrl: this.d.appUrl ? `${this.d.appUrl}/settings/notifications` : undefined,
            unsubscribeUrl: def.mandatory ? undefined : 'https://example.invalid/unsubscribe-preview',
        });
        return { channel: 'email', locale: i.locale, subject: mail.subject, text: mail.text, html: mail.html };
    }

    // ---- test e-postasi (yoneticinin kendi adresi) -------------------------------------------------------------------------
    async sendTestEmail(actor: BackofficeActor | undefined, i: { reason: string }): Promise<any> {
        if (!(this.d.flags?.().emailEnabled)) {
            audit('backoffice.notifications.test_email', actor, 'fail', { why: 'disabled', reason: i.reason });
            throw new ApplicationError('E-posta şu an gönderilemiyor.', 503, 'NOTIFY_EMAIL_UNAVAILABLE');
        }
        const admin: any = actor?.sub && OID.test(actor.sub)
            ? await this.d.applicationDB.getUserModel!().findOne({ _id: actor.sub, isGlobalAdmin: true }, { email: 1 }).maxTimeMS(QUERY_MAX_TIME_MS).lean()
            : null;
        if (!admin?.email) throw new ApplicationError('Yönetici e-posta adresi bulunamadı.', 404, 'NOT_FOUND');
        const mail = buildInstantEmail({ code: 'PLATFORM_ALERT_DIGEST', params: { newAlertCount: 0 }, locale: 'tr', service: true, appUrl: this.d.appUrl });
        try {
            await this.d.transport!.send({ to: admin.email, subject: `[TEST] ${mail.subject}`, text: mail.text, html: mail.html, headers: { 'Auto-Submitted': 'auto-generated', 'X-Entegrasyonik-Test': '1' } });
        } catch {
            audit('backoffice.notifications.test_email', actor, 'fail', { why: 'send', reason: i.reason });
            throw new ApplicationError('E-posta şu an gönderilemiyor.', 503, 'NOTIFY_EMAIL_UNAVAILABLE');
        }
        audit('backoffice.notifications.test_email', actor, 'ok', { reason: i.reason });
        return { sent: true };
    }
}
