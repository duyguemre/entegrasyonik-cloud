import { IService } from '@interfaces/index'
import { BaseApi } from '../../BaseApi'
import { ApplicationError } from '@platform/core/security/Security'
import { ObjectId } from 'mongodb'
import { ATTENTION_ALLOCATION_STATES } from '@operations/stock/allocationStates'
import { pickLowStockThreshold, STOCK_POLICY_LIMITS } from '@operations/stock/stockPolicyValidation'
import { getPublishLagSummary, PUBLISH_LAG_WINDOWS, PublishLagWindow } from '@operations/stock/publishLag'

const DEFAULT_RECENT_LIMIT = 20
const MAX_RECENT_LIMIT = 50
const DEFAULT_PAGE_LIMIT = 50
const MAX_PAGE_LIMIT = 200
const QUERY_MAX_TIME_MS = 10_000
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/
const CHANNEL_RE = /^[A-Za-z0-9_-]{1,64}$/

/**
 * StockService — N6 (ADR-0004): tenant başına stok sağlığı özeti (YALNIZCA OKUMA).
 *
 * Tenant kapsamı: `this.clientDB` sunucuda doğrulanmış principal'dan (`userContext.order`) kurulur; istek gövdesi tenant seçemez.
 * DTO beyaz listedir: sipariş satırlarından yalnızca stok/rezervasyon alanları döner — müşteri/adres/fatura/ödeme alanları HİÇ
 * çıkmaz (projeksiyon + alan seçimi). `Variants.allocations` (unbounded geçmiş; anahtarlar dış sipariş kimliği içerir) burada
 * DÖNMEZ; yalnızca toplamlar döner.
 */
export default class StockService extends BaseApi implements IService {

    async get(): Promise<any> {
        // IService gereksinimi; kullanılmıyor
    }

    /**
     * Tenant özeti: açık OVERSOLD / UNMAPPED kalem sayıları (+adet), en son N sipariş (yalnızca dikkat gerektiren kalemler),
     * varyant rezervasyon toplamları ve mutabakat durumu.
     * İstek: `{ limit?: 1..50 }` (varsayılan 20).
     */
    async getStockOverview(): Promise<any> {
        if (!this.clientDB) throw new ApplicationError('Tenant bulunamadı.', 400)

        const rawLimit = this.request?.limit
        let limit = DEFAULT_RECENT_LIMIT
        if (rawLimit !== undefined && rawLimit !== null) {
            if (typeof rawLimit !== 'number' || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_RECENT_LIMIT) {
                throw new ApplicationError(`limit 1 ile ${MAX_RECENT_LIMIT} arasında bir tamsayı olmalıdır.`, 400)
            }
            limit = rawLimit
        }

        const attention = [...ATTENTION_ALLOCATION_STATES]
        const orderMatch = { items: { $elemMatch: { allocationState: { $in: attention } } } }
        const orderModel = this.clientDB.getOrderModel()
        const variantModel = this.clientDB.getVariantModel()

        const [stateRows, recentOrders, variantTotals, withReservations, overReserved, publishPending] = await Promise.all([
            orderModel.aggregate([
                { $match: orderMatch },
                { $unwind: '$items' },
                { $match: { 'items.allocationState': { $in: attention } } },
                { $group: { _id: '$items.allocationState', lines: { $sum: 1 }, units: { $sum: '$items.quantity' } } },
            ]),
            orderModel.aggregate([
                { $match: orderMatch },
                { $sort: { 'dates.orderDate': -1 } },
                { $limit: limit },
                { $project: { orderNumber: 1, externalOrderId: 1, integrationCode: 1, 'dates.orderDate': 1, items: 1 } },
            ]),
            variantModel.aggregate([
                { $group: { _id: null, total: { $sum: 1 }, totalStock: { $sum: '$stock' }, reservedUnits: { $sum: '$reserved' } } },
            ]),
            variantModel.countDocuments({ reserved: { $gt: 0 } }),
            variantModel.countDocuments({ $expr: { $gt: [{ $ifNull: ['$reserved', 0] }, { $ifNull: ['$stock', 0] }] } }),
            variantModel.countDocuments({ stockDirty: true }),
        ])

        const count = (state: string) => {
            const row = (stateRows || []).find((r: any) => r?._id === state)
            return { lines: Number(row?.lines) || 0, units: Number(row?.units) || 0 }
        }
        const totals = (variantTotals || [])[0] || {}
        const totalStock = Number(totals.totalStock) || 0
        const reservedUnits = Number(totals.reservedUnits) || 0

        return {
            generatedAt: new Date(),
            attention: { oversold: count('OVERSOLD'), unmapped: count('UNMAPPED') },
            recentOrders: (recentOrders || []).map((o: any) => ({
                orderId: String(o._id),
                orderNumber: o.orderNumber ?? null,
                externalOrderId: o.externalOrderId ?? null,
                integrationCode: o.integrationCode ?? null,
                orderDate: o.dates?.orderDate ?? null,
                items: (Array.isArray(o.items) ? o.items : [])
                    .filter((it: any) => attention.includes(it?.allocationState))
                    .map((it: any) => ({
                        externalLineItemId: it.externalLineItemId ?? null,
                        sku: it.sku ?? null,
                        barcode: it.barcode ?? null,
                        productName: it.productName ?? null,
                        quantity: it.quantity ?? null,
                        allocationState: it.allocationState,
                        lastAllocationAppliedAt: it.lastAllocationAppliedAt ?? null,
                        oversoldEscalatedAt: it.oversoldEscalatedAt ?? null,
                    })),
            })),
            variants: {
                total: Number(totals.total) || 0,
                totalStock,
                reservedUnits,
                availableUnits: totalStock - reservedUnits,
                withReservations: Number(withReservations) || 0,
                overReserved: Number(overReserved) || 0,
                publishPending: Number(publishPending) || 0,
            },
            // Mutabakat işleri (Internal/ExternalReconciliationJob) sonucu KALICI YAZMIYOR (yalnızca log + stockDirty işareti);
            // sonuç koleksiyonu (FRONTEND_GAP_ANALYSIS N8) gelene dek son koşu bilgisi yoktur.
            reconciliation: { tracked: false, lastRunAt: null },
        }
    }

    // ------------------------------------------------------------------------------------------------------------
    // Faz-3 stok özellikleri (docs/API_STOCK_FEATURES.md). Hepsi YALNIZCA OKUMA; tenant = doğrulanmış principal'ın clientDB'si.
    // ------------------------------------------------------------------------------------------------------------

    private parseLimit(): number {
        const raw = this.request?.limit
        if (raw === undefined || raw === null) return DEFAULT_PAGE_LIMIT
        if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > MAX_PAGE_LIMIT) {
            throw new ApplicationError(`limit 1 ile ${MAX_PAGE_LIMIT} arasında bir tamsayı olmalıdır.`, 400)
        }
        return raw
    }

    private decodeCursor(): [string, string] | null {
        const raw = this.request?.cursor
        if (raw === undefined || raw === null || raw === '') return null
        try {
            if (typeof raw !== 'string' || raw.length > 200) throw new Error('bad')
            const arr = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
            if (!Array.isArray(arr) || arr.length !== 2 || typeof arr[1] !== 'string' || !OBJECT_ID_RE.test(arr[1])) throw new Error('bad')
            if (typeof arr[0] !== 'number' && typeof arr[0] !== 'string') throw new Error('bad')
            return [String(arr[0]), arr[1]]
        } catch { throw new ApplicationError('cursor geçersiz.', 400) }
    }

    private encodeCursor(a: number | string, id: any): string {
        return Buffer.from(JSON.stringify([a, String(id)]), 'utf8').toString('base64url')
    }

    /**
     * Düşük stok listesi: kullanılabilir stok (`stock - reserved`) <= eşik olan varyantlar, en düşük önce (`available` artan, `_id`).
     * Eşik: `threshold` istekte verilirse o, yoksa tenant `stockPolicy.lowStockThreshold`; ikisi de yoksa özellik KAPALI
     * (`enabled:false`, boş liste). `channel` verilirse yalnız o kanalda yayında (TRANSFER COMPLETED) varyantlar + son yayınlanan adet.
     * Sayfalama: imleç (`nextCursor`), `limit` 1..200. Sorgu tam koleksiyon taramasıdır (hesaplanan alan; `maxTimeMS` 10 sn) — `{stock:1}`
     * indeksi `stock - reserved` ifadesine yardım etmez, bu yüzden göç YAZILMADI (BACKLOG notu).
     */
    async listLowStock(): Promise<any> {
        if (!this.clientDB) throw new ApplicationError('Tenant bulunamadı.', 400)
        const req = this.request || {}
        const limit = this.parseLimit()

        let requested: number | undefined
        if (req.threshold !== undefined && req.threshold !== null) {
            if (typeof req.threshold !== 'number' || !Number.isInteger(req.threshold) || req.threshold < 0 || req.threshold > STOCK_POLICY_LIMITS.lowStockThresholdMax) {
                throw new ApplicationError(`threshold 0 ile ${STOCK_POLICY_LIMITS.lowStockThresholdMax} arasında bir tamsayı olmalıdır.`, 400)
            }
            requested = req.threshold
        }
        let channel: string | undefined
        if (req.channel !== undefined && req.channel !== null) {
            if (typeof req.channel !== 'string' || !CHANNEL_RE.test(req.channel)) throw new ApplicationError('channel geçersiz.', 400)
            channel = req.channel
        }
        const cursor = this.decodeCursor()

        let threshold: number | null = requested ?? null
        let thresholdSource: 'request' | 'tenant' | null = requested !== undefined ? 'request' : null
        if (threshold === null) {
            const doc: any = await this.clientDB.getClientIntegrationModel().findOne({}, { 'stockPolicy.lowStockThreshold': 1 }).lean()
            threshold = pickLowStockThreshold(doc?.stockPolicy?.lowStockThreshold)
            if (threshold !== null) thresholdSource = 'tenant'
        }
        if (threshold === null) return { enabled: false, threshold: null, thresholdSource: null, channel: channel ?? null, items: [], nextCursor: null }

        const publishedField = channel ? `platforms.${channel}.stockSync.lastPublishedQty` : undefined
        const pipeline: any[] = []
        if (channel) pipeline.push({ $match: { [`platforms.${channel}.upload.TRANSFER.status`]: 'COMPLETED' } })
        pipeline.push({ $addFields: { _avail: { $subtract: [{ $ifNull: ['$stock', 0] }, { $ifNull: ['$reserved', 0] }] } } })
        pipeline.push({ $match: { _avail: { $lte: threshold } } })
        if (cursor) {
            const a = Number(cursor[0])
            if (!Number.isFinite(a)) throw new ApplicationError('cursor geçersiz.', 400)
            pipeline.push({ $match: { $or: [{ _avail: { $gt: a } }, { _avail: a, _id: { $gt: new ObjectId(cursor[1]) } }] } })
        }
        pipeline.push({ $sort: { _avail: 1, _id: 1 } }, { $limit: limit + 1 })
        pipeline.push({ $project: { productId: 1, stockcode: 1, barcode: 1, stock: 1, reserved: 1, _avail: 1, ...(publishedField ? { _published: `$${publishedField}` } : {}) } })

        const rows: any[] = await this.clientDB.getVariantModel().aggregate(pipeline).option({ maxTimeMS: QUERY_MAX_TIME_MS })
        const page = rows.slice(0, limit)
        const last = page[page.length - 1]
        return {
            enabled: true,
            threshold,
            thresholdSource,
            channel: channel ?? null,
            items: page.map((r: any) => ({
                variantId: String(r._id),
                productId: r.productId ? String(r.productId) : null,
                sku: r.stockcode ?? null,
                barcode: r.barcode ?? null,
                stock: Number(r.stock) || 0,
                reserved: Number(r.reserved) || 0,
                available: Number(r._avail) || 0,
                ...(channel ? { channelPublishedQty: typeof r._published === 'number' ? r._published : null } : {}),
            })),
            nextCursor: rows.length > limit && last ? this.encodeCursor(last._avail, last._id) : null,
        }
    }

    /**
     * Stok hareket defteri (`StockMovements`, ADR-0021 D14): bir varyantın (`variantId` XOR `barcode`) hareketleri, en yeni önce,
     * `from`/`to` (ISO tarih, dahil) aralığı ve imleç sayfalama. Yanıtta dış sipariş anahtarı (`ref.key`) DÖNMEZ; `ref.kind/id` döner.
     */
    async listMovements(): Promise<any> {
        if (!this.clientDB) throw new ApplicationError('Tenant bulunamadı.', 400)
        const req = this.request || {}
        const limit = this.parseLimit()
        const hasId = req.variantId !== undefined && req.variantId !== null
        const hasBarcode = req.barcode !== undefined && req.barcode !== null
        if (hasId === hasBarcode) throw new ApplicationError('variantId ya da barcode (yalnız biri) zorunludur.', 400)

        const parseDate = (v: any, name: string): Date | undefined => {
            if (v === undefined || v === null) return undefined
            const d = typeof v === 'string' ? new Date(v) : null
            if (!d || Number.isNaN(d.getTime())) throw new ApplicationError(`${name} geçerli bir ISO tarih olmalıdır.`, 400)
            return d
        }
        const from = parseDate(req.from, 'from')
        const to = parseDate(req.to, 'to')
        if (from && to && from > to) throw new ApplicationError('from, to tarihinden büyük olamaz.', 400)
        const cursor = this.decodeCursor()

        let variantId: ObjectId
        if (hasId) {
            if (typeof req.variantId !== 'string' || !OBJECT_ID_RE.test(req.variantId)) throw new ApplicationError('variantId geçersiz.', 400)
            variantId = new ObjectId(req.variantId)
        } else {
            if (typeof req.barcode !== 'string' || req.barcode.length < 1 || req.barcode.length > 200) throw new ApplicationError('barcode geçersiz.', 400)
            const v: any = await this.clientDB.getVariantModel().findOne({ barcode: req.barcode }, { _id: 1 }).lean()
            if (!v) return { variantId: null, items: [], nextCursor: null }
            variantId = new ObjectId(String(v._id))
        }

        const and: any[] = [{ variantId }]
        if (from || to) and.push({ at: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } })
        if (cursor) {
            const at = new Date(cursor[0])
            if (Number.isNaN(at.getTime())) throw new ApplicationError('cursor geçersiz.', 400)
            and.push({ $or: [{ at: { $lt: at } }, { at, _id: { $lt: new ObjectId(cursor[1]) } }] })
        }
        const rows: any[] = await this.clientDB.getStockMovementModel().find({ $and: and })
            .sort({ at: -1, _id: -1 }).limit(limit + 1).maxTimeMS(QUERY_MAX_TIME_MS).lean()
        const page = rows.slice(0, limit)
        const last = page[page.length - 1]
        return {
            variantId: String(variantId),
            items: page.map((m: any) => ({
                movementId: String(m._id),
                at: m.at,
                reason: m.reason,
                delta: m.delta, before: m.before, after: m.after,
                stockAfter: m.stockAfter ?? null,
                channel: m.channel ?? null,
                ref: m.ref ? { kind: m.ref.kind ?? null, id: m.ref.id ?? null } : null,
                actor: m.actor ? { type: m.actor.type ?? null, id: m.actor.id ?? null } : null,
                sku: m.sku ?? null,
            })),
            nextCursor: rows.length > limit && last ? this.encodeCursor(new Date(last.at).toISOString(), last._id) : null,
        }
    }

    /**
     * Stok yayın gecikmesi özeti (p50/p95; `stock_publish_lag_ms`). `window`: '1h' (varsayılan) | '24h'. Kapsam PLATFORM geneli
     * (metrikte tenant etiketi yok) -> kademe admin+. p50/p95 60 sn üstüne düşerse `null` + `*Overflow:true` (X12 kova sınırı).
     */
    async getPublishLagSummary(): Promise<any> {
        const window = this.request?.window ?? '1h'
        if (!(PUBLISH_LAG_WINDOWS as ReadonlyArray<string>).includes(window)) throw new ApplicationError("window '1h' ya da '24h' olmalıdır.", 400)
        return getPublishLagSummary(this.applicationDB.getMetricRollupModel(), window as PublishLagWindow)
    }
}
