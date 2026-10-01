import type { IClientDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-ADM): StockService için sipariş kalemi stok-dikkat özetleri ve tenant stok politikası okuması.
 * Amaca göre adlandırılmış okuma-yalnız repository'dir (sipariş/ClientIntegration sahipli repository'lerinden ayrı).
 */
export class StockHealthRepository {
    constructor(private readonly db: IClientDB) { }

    /** Dikkat gerektiren (`attention`) kalem durumları için durum başına satır/adet toplamı. */
    async attentionStateTotals(attention: string[]): Promise<any[]> {
        return await this.db.getOrderModel().aggregate([
            { $match: StockHealthRepository.orderMatch(attention) },
            { $unwind: '$items' },
            { $match: { 'items.allocationState': { $in: attention } } },
            { $group: { _id: '$items.allocationState', lines: { $sum: 1 }, units: { $sum: '$items.quantity' } } },
        ])
    }

    /** Dikkat gerektiren kalemi olan en son `limit` sipariş (yalnız stok/rezervasyon alanları). */
    async recentAttentionOrders(attention: string[], limit: number): Promise<any[]> {
        return await this.db.getOrderModel().aggregate([
            { $match: StockHealthRepository.orderMatch(attention) },
            { $sort: { 'dates.orderDate': -1 } },
            { $limit: limit },
            { $project: { orderNumber: 1, externalOrderId: 1, integrationCode: 1, 'dates.orderDate': 1, items: 1 } },
        ])
    }

    async findLowStockThresholdDoc(): Promise<any> {
        return await this.db.getClientIntegrationModel().findOne({}, { 'stockPolicy.lowStockThreshold': 1 }).lean()
    }

    private static orderMatch(attention: string[]) {
        return { items: { $elemMatch: { allocationState: { $in: attention } } } }
    }
}
