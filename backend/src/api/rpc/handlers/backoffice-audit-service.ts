import { IService } from '@interfaces/index'
import { Types } from 'mongoose'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'
import { sanitizeMeta } from '@services/audit/AuditLogger'
import { auditSensitiveRead } from './backoffice-support'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_RANGE_MS = 31 * DAY_MS
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200
const QUERY_MAX_TIME_MS = 5000

const bad = (m: string): never => { throw new ApplicationError(m, 400, 'VALIDATION') }

function encodeCursor(at: Date, id: unknown): string { return Buffer.from(`${at.getTime()}:${String(id)}`, 'utf8').toString('base64url') }
function decodeCursor(c: string): { at: Date; id: Types.ObjectId } {
    const m = /^(\d{1,15}):([a-f0-9]{24})$/.exec(Buffer.from(c, 'base64url').toString('utf8'))
    if (!m) return bad('cursor: imleç geçersiz')
    return { at: new Date(Number(m[1])), id: new Types.ObjectId(m[2]) }
}

/**
 * ADR-0026 WP-LOG L2 -- platform geneli denetim sorgusu (`AuditLogs`, YALNIZCA OKUMA; yalnız platformAdmin, `/admin-api`).
 * Tenant servisinin (`audit-service.ts`) aksine `tid` zorunlu DEĞİL ve `admin.*`/`backoffice.*` olayları dahildir. Aralık <=31 gün (aşılırsa 400),
 * keyset imleç (at,_id), sayfa <=200, maxTimeMS 5 sn; `meta` okurken yeniden `sanitizeMeta`'dan geçer. Mevcut indeksler (tid+at, event+at, sub+at) yeter;
 * yalnız `imp`/`service`/`operation`/`result` tek başına filtrelendiğinde `at` TTL indeksi üzerinden aralık taraması yapılır (<=31 gün ile sınırlı).
 */
export default class BackofficeAuditService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    async list(): Promise<any> {
        const r = this.request || {}
        const to = r.to ? new Date(r.to) : new Date()
        const from = r.from ? new Date(r.from) : new Date(to.getTime() - 7 * DAY_MS)
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) bad('aralık: geçersiz tarih')
        if (from.getTime() > to.getTime()) bad('aralık: from > to')
        if (to.getTime() - from.getTime() > MAX_RANGE_MS) bad('aralık en fazla 31 gün olabilir')
        const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isInteger(r.limit) ? r.limit : DEFAULT_LIMIT))

        const match: Record<string, any> = { at: { $gte: from, $lte: to } }
        if (r.tid !== undefined) match.tid = r.tid
        if (r.event !== undefined) match.event = r.event
        if (r.actor !== undefined) match.sub = r.actor
        if (r.imp !== undefined) match.imp = r.imp === true ? true : { $ne: true }
        if (r.result !== undefined) match.result = r.result
        if (r.service !== undefined) match['meta.service'] = r.service
        if (r.operation !== undefined) match['meta.operation'] = r.operation
        let query: Record<string, any> = match
        if (r.cursor !== undefined) {
            const c = decodeCursor(r.cursor)
            query = { $and: [match, { $or: [{ at: { $lt: c.at } }, { at: c.at, _id: { $lt: c.id } }] }] }
        }
        const rows: any[] = await this.applicationDB.getAuditLogModel().find(query).sort({ at: -1, _id: -1 }).limit(limit + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean()
        const hasMore = rows.length > limit
        const page = hasMore ? rows.slice(0, limit) : rows
        const last = page[page.length - 1]
        auditSensitiveRead(this.request, 'BackofficeAuditService', 'list', { from: r.from, to: r.to, tid: r.tid, event: r.event, actor: r.actor, imp: r.imp, result: r.result }, page.length)
        return {
            items: page.map((x: any) => ({
                id: String(x._id), at: x.at, event: x.event, result: x.result, actor: x.sub ?? null, tid: x.tid ?? null, onBehalfOf: x.onBehalfOf ?? null,
                actorType: x.actorType ?? null, surface: x.surface ?? null, imp: x.imp === true, reqId: x.reqId ?? null, ip: x.ip ?? null, meta: sanitizeMeta(x.meta) ?? null,
            })),
            nextCursor: hasMore && last ? encodeCursor(last.at, last._id) : null,
            from, to,
        }
    }
}
