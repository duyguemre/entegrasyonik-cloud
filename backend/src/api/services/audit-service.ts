import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'
import { sanitizeMeta } from '@services/audit/AuditLogger'

const DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_WINDOW_DAYS = 30
const MAX_WINDOW_DAYS = 366
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100
const QUERY_MAX_TIME_MS = 5000
const EVENT_RE = /^[A-Za-z0-9_.:-]{1,64}$/
const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const RESULTS = ['ok', 'fail', 'error']

/** Platform-içi olaylar (süper yönetici yazma kayıtları: `admin.write`, `admin.*`) tenant'a gösterilmez. */
const PLATFORM_INTERNAL_EVENT_PREFIX = 'admin.'

const IMPERSONATION_EVENT_PREFIX = 'impersonation.'
const SUPPORT_ACTOR_LABEL = 'Entegrasyonik Destek'

// [GV-01] ortak yardımcı (@utils/search): aynı kaçış kuralı, tek kaynak
import { escapeRegex } from '@utils/search'

function parseDate(v: any, field: string): Date {
    const d = typeof v === 'string' || typeof v === 'number' ? new Date(v) : new Date(NaN)
    if (Number.isNaN(d.getTime())) throw new ApplicationError(`${field} geçerli bir tarih olmalıdır.`, 400)
    return d
}

/**
 * AuditService — N10 (ADR-0001 Karar 11): tenant sahibi/yöneticisi için KENDİ tenant'ının `AuditLogs` kayıtlarını okuma (YALNIZCA OKUMA).
 *
 * Tenant izolasyonu: filtre HER ZAMAN `{ tid: <sunucudaki doğrulanmış tenant> }` içerir; istek gövdesindeki `tid/clientId/order`
 * alanları okunmaz. Sızıntı önlemi: DTO beyaz listedir (parola özeti/token/istek gövdesi zaten yazılmaz; ayrıca `ip` ve `meta`
 * dışındaki hiçbir ham alan dönmez; `meta` okurken yeniden sanitize edilir). IP adresi kişisel veri sayıldığından DÖNMEZ.
 * Performans notu: `tid` üzerinde indeks YOKTUR (yalnızca TTL `at`, `event+at`, `sub+at`); sorgu varsayılan olarak son 30 günle
 * daraltılır (`at` indeksi) ve `maxTimeMS` ile sınırlanır. `{tid:1, at:-1}` indeksi önerilir (insan onayı gerekir; bkz. docs/API_TENANT_SURFACE.md).
 */
export default class AuditService extends BaseApi implements IService {

    async get(): Promise<any> {
        // IService gereksinimi; kullanılmıyor
    }

    /**
     * İstek: `{ page?, limit? (1..100, vars. 25), from?, to? (ISO; vars. son 30 gün; aralık ≤ 366 gün), event?, eventPrefix?, userId?, result? }`
     */
    async getAuditLogs(): Promise<any> {
        const tid = Number(this.clientId)
        if (!Number.isInteger(tid)) throw new ApplicationError('Tenant bulunamadı.', 400)
        const req = this.request || {}

        const page = req.page === undefined || req.page === null ? 1 : req.page
        const limit = req.limit === undefined || req.limit === null ? DEFAULT_LIMIT : req.limit
        if (!Number.isInteger(page) || page < 1 || page > 100000) throw new ApplicationError('page geçersiz.', 400)
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new ApplicationError(`limit 1 ile ${MAX_LIMIT} arasında bir tamsayı olmalıdır.`, 400)

        const now = Date.now()
        const to = req.to !== undefined && req.to !== null ? parseDate(req.to, 'to') : new Date(now)
        const from = req.from !== undefined && req.from !== null ? parseDate(req.from, 'from') : new Date(to.getTime() - DEFAULT_WINDOW_DAYS * DAY_MS)
        if (from.getTime() > to.getTime()) throw new ApplicationError('from, to değerinden büyük olamaz.', 400)
        if (to.getTime() - from.getTime() > MAX_WINDOW_DAYS * DAY_MS) throw new ApplicationError(`Tarih aralığı en fazla ${MAX_WINDOW_DAYS} gün olabilir.`, 400)

        const filter: any = { tid, at: { $gte: from, $lte: to } }
        const and: any[] = []

        if (req.event !== undefined && req.event !== null) {
            if (typeof req.event !== 'string' || !EVENT_RE.test(req.event)) throw new ApplicationError('event geçersiz.', 400)
            if (req.event.startsWith(PLATFORM_INTERNAL_EVENT_PREFIX)) throw new ApplicationError('event geçersiz.', 400)
            filter.event = req.event
        }
        if (req.eventPrefix !== undefined && req.eventPrefix !== null) {
            if (typeof req.eventPrefix !== 'string' || !EVENT_RE.test(req.eventPrefix)) throw new ApplicationError('eventPrefix geçersiz.', 400)
            and.push({ event: { $regex: '^' + escapeRegex(req.eventPrefix) } })
        }
        // platform-içi olaylar HER ZAMAN dışarıda (filtreyle geri getirilemez)
        and.push({ event: { $not: { $regex: '^' + escapeRegex(PLATFORM_INTERNAL_EVENT_PREFIX) } } })
        if (and.length) filter.$and = and

        if (req.userId !== undefined && req.userId !== null) {
            if (typeof req.userId !== 'string' || !USER_ID_RE.test(req.userId)) throw new ApplicationError('userId geçersiz.', 400)
            filter.sub = req.userId
        }
        if (req.result !== undefined && req.result !== null) {
            if (typeof req.result !== 'string' || !RESULTS.includes(req.result)) throw new ApplicationError('result geçersiz.', 400)
            filter.result = req.result
        }

        const model = this.applicationDB.getAuditLogModel()
        const [total, rows] = await Promise.all([
            model.countDocuments(filter).maxTimeMS(QUERY_MAX_TIME_MS),
            model.find(filter, { at: 1, event: 1, result: 1, sub: 1, meta: 1, imp: 1 }).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).maxTimeMS(QUERY_MAX_TIME_MS).lean(),
        ])

        return {
            logs: (rows || []).map((r: any) => {
                // [B3 / ADR-0028 Karar 9] Destek (impersonation) kayıtlarında platform yöneticisinin kimliği tenant'a SIZMAZ: userId yerine sabit etiket.
                const support = r.imp === true || (typeof r.event === 'string' && r.event.startsWith(IMPERSONATION_EVENT_PREFIX))
                return {
                    id: String(r._id),
                    at: r.at,
                    event: r.event,
                    result: r.result,
                    userId: support ? null : (r.sub ?? null),
                    ...(support ? { actorLabel: SUPPORT_ACTOR_LABEL } : {}),
                    meta: sanitizeMeta(r.meta) ?? null,
                }
            }),
            page,
            limit,
            totalNumberOfRecords: total,
            totalNumberOfPages: Math.ceil(total / limit) || 1,
            from,
            to,
        }
    }
}
