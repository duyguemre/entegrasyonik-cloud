import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { ApplicationError } from '../Security'
import { ATTENTION_ALLOCATION_STATES } from '@operations/stock/allocationStates'

const DEFAULT_RECENT_LIMIT = 20
const MAX_RECENT_LIMIT = 50

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
}
