// ADR-0017 Karar 4 / ADR-0029 Karar 7 (NB8): backoffice "Uyarilar" paneli -- liste + susturma. Model ENJEKTE.
// Gizlilik: `detail` yalniz sayi/kod (tid, integ, oranlar); ham hata metni yok. Susturma audit'lidir (RunOperation `backoffice.write` + hedefli olay).
import { ApplicationError } from '@platform/core/errors';
import { AuditLogger } from '@services/audit/AuditLogger';
import { getRequestId } from '@platform/core/context';
import { clampLimit, decodeCursor, encodeCursor, QUERY_MAX_TIME_MS, type BackofficeActor } from '../notifications/backofficeOps';

export const MAX_MUTE_HOURS = 24 * 14;

export interface AlertAdminDeps { model: { find(f: any): any; updateOne(f: any, u: any): Promise<any> }; now?: () => Date }

export function toAlertRow(a: any) {
    return {
        id: String(a._id), ruleId: a.ruleId, scopeKey: a.scopeKey, level: a.level, status: a.status, detail: a.detail ?? {}, firstFiredAt: a.firstFiredAt,
        lastSeenAt: a.lastSeenAt, lastNotifiedAt: a.lastNotifiedAt ?? null, resolvedAt: a.resolvedAt ?? null, mutedUntil: a.mutedUntil ?? null, shadow: a.shadow === true,
    };
}

export class AlertAdmin {
    constructor(private readonly d: AlertAdminDeps) {}
    private now(): Date { return this.d.now ? this.d.now() : new Date(); }

    async list(i: { status?: 'firing' | 'resolved'; level?: string; ruleId?: string; cursor?: string; limit?: number }): Promise<any> {
        const limit = clampLimit(i.limit);
        const match: Record<string, unknown> = {};
        if (i.status !== undefined) match.status = i.status;
        if (i.level !== undefined) match.level = i.level;
        if (i.ruleId !== undefined) match.ruleId = i.ruleId;
        const query = i.cursor !== undefined ? { $and: [match, { _id: { $lt: decodeCursor(i.cursor) } }] } : match;
        const rows: any[] = await this.d.model.find(query).sort({ _id: -1 }).limit(limit + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean();
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        return { items: page.map(toAlertRow), nextCursor: hasMore ? encodeCursor(page[page.length - 1]._id) : null };
    }

    /** `hours` (1..336) sure susturur; 0 susturmayi kaldirir. Yalniz `firing` uyari susturulur. */
    async mute(actor: BackofficeActor | undefined, i: { ruleId: string; scopeKey: string; hours: number; reason: string }): Promise<any> {
        if (!Number.isInteger(i.hours) || i.hours < 0 || i.hours > MAX_MUTE_HOURS) throw new ApplicationError(`hours: 0-${MAX_MUTE_HOURS} aralığında olmalı`, 400, 'VALIDATION');
        const now = this.now();
        const until = i.hours === 0 ? null : new Date(now.getTime() + i.hours * 3_600_000);
        const update = until ? { $set: { mutedUntil: until, mutedBy: actor?.sub } } : { $unset: { mutedUntil: '', mutedBy: '' } };
        const r = await this.d.model.updateOne({ ruleId: i.ruleId, scopeKey: i.scopeKey, status: 'firing' }, update);
        if (!((r?.matchedCount ?? r?.n ?? r?.modifiedCount ?? 0) > 0)) throw new ApplicationError('Uyarı bulunamadı.', 404, 'ALERT_NOT_FOUND');
        void AuditLogger.log({
            event: 'backoffice.alerts.mute', result: 'ok', sub: actor?.sub, ip: actor?.ip, surface: 'backoffice', actorType: 'platform', reqId: getRequestId(),
            meta: { ruleId: i.ruleId, scopeKey: i.scopeKey, hours: i.hours, reason: i.reason },
        });
        return { ruleId: i.ruleId, scopeKey: i.scopeKey, mutedUntil: until };
    }
}
