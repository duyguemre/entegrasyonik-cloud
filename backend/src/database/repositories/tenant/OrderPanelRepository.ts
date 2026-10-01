import { IClientDB } from '@interfaces/index';

/**
 * ADR-0024 Dalga 3 (P3-ORD): satıcı paneli (RPC) sipariş sorguları. Kurucu tenant DB tutamacını alır (ADR-0016 §5.1:
 * `clientId` parametresi yok; izolasyon tenant DB seçimiyle). Motor içe alım yolu ayrıdır: `OrderRepository`.
 * Model her çağrıda `getOrderModel()` ile alınır (tutamaç yoksa sorgu anında TypeError — mevcut davranış).
 */
export class OrderPanelRepository {
    constructor(private readonly db: IClientDB) { }

    /** `$match → $sort → $facet{totalNumberOfRecords, orders}`; `{ total, orders }` döner. */
    async listPage(match: Record<string, any>, sort: Record<string, number>, skip: number, limit: number): Promise<{ total: number; orders: any[] }> {
        const result = await this.db.getOrderModel().aggregate([
            { $match: match },
            { $sort: sort },
            {
                $facet: {
                    totalNumberOfRecords: [
                        { $count: 'count' }
                    ],
                    orders: [
                        { $skip: skip },
                        { $limit: limit }
                    ]
                }
            }
        ]);
        const aggregationResult = result[0] || {};
        return {
            total: aggregationResult.totalNumberOfRecords?.[0]?.count || 0,
            orders: aggregationResult.orders || [],
        };
    }

    findById(orderId: any): Promise<any> {
        return this.db.getOrderModel().findById(orderId);
    }

    /** `findByIdAndUpdate(id, update[, options])` — seçenek verilmezse üçüncü argüman GÖNDERİLMEZ (toplu yolların mevcut çağrısı). */
    updateById(orderId: any, update: Record<string, any>, options?: Record<string, any>): Promise<any> {
        return options === undefined
            ? this.db.getOrderModel().findByIdAndUpdate(orderId, update)
            : this.db.getOrderModel().findByIdAndUpdate(orderId, update, options);
    }

    /** Pano: 10 paralel sorgu (sipariş/iade/mesaj). Gün sınırları çağırandan (platform saat dilimi). */
    dashboardAggregates(bounds: { todayStart: Date; yesterdayStart: Date; sevenDaysAgo: Date; timeZone: string }): Promise<any[]> {
        const { todayStart, yesterdayStart, sevenDaysAgo, timeZone } = bounds;
        const orderModel = this.db.getOrderModel();
        const claimModel = this.db.getClaimModel();
        const messageModel = this.db.getMessageModel();
        return Promise.all([
            // 1. Tüm zamanlar: Durum dağılımı
            orderModel.aggregate([
                { $group: { _id: '$internalStatus', count: { $sum: 1 } } }
            ]),
            // 2. Tüm zamanlar: Toplam ciro (iptal edilmeyenler)
            orderModel.aggregate([
                { $match: { internalStatus: { $nin: ['CANCELLED'] } } },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: '$financials.grandTotal' },
                        totalCount: { $sum: 1 }
                    }
                }
            ]),
            // 3. Son 7 gün: Günlük sipariş + ciro (sparkline)
            orderModel.aggregate([
                { $match: { 'dates.orderDate': { $gte: sevenDaysAgo } } },
                {
                    $group: {
                        _id: {
                            year: { $year: { date: '$dates.orderDate', timezone: timeZone } },
                            month: { $month: { date: '$dates.orderDate', timezone: timeZone } },
                            day: { $dayOfMonth: { date: '$dates.orderDate', timezone: timeZone } }
                        },
                        count: { $sum: 1 },
                        revenue: { $sum: '$financials.grandTotal' }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
            ]),
            // 4. Bugün
            orderModel.aggregate([
                { $match: { 'dates.orderDate': { $gte: todayStart } } },
                { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$financials.grandTotal' } } }
            ]),
            // 5. Dün
            orderModel.aggregate([
                { $match: { 'dates.orderDate': { $gte: yesterdayStart, $lt: todayStart } } },
                { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$financials.grandTotal' } } }
            ]),
            // 6. İade: toplam sayı ve iade tutarı
            claimModel.aggregate([
                { $match: { internalStatus: { $nin: ['CANCELLED', 'REJECTED'] } } },
                {
                    $group: {
                        _id: null,
                        totalReturnCount: { $sum: 1 },
                        totalReturnAmount: { $sum: '$totalRefundAmount' }
                    }
                }
            ]),
            // 7. Fatura bekleyen sipariş sayısı (APPROVED ama fatura henüz kesilmemiş)
            orderModel.countDocuments({ internalStatus: 'APPROVED', 'flags.isInvoiceGenerated': { $ne: true } }),
            // 8. Kargo bekleyen sipariş sayısı (Onaylı ama kargoya verilmemiş)
            orderModel.countDocuments({ internalStatus: 'APPROVED' }),
            // 9. İşlem bekleyen claim sayısı
            claimModel.countDocuments({ internalStatus: { $in: ['WAITING', 'SHIPPED', 'DELIVERED'] } }),
            // 10. Bekleyen mesaj sayısı (henüz cevaplanmamış)
            messageModel.countDocuments({ status: 'WAITING_SELLER', isRejected: { $ne: true } })
        ]);
    }
}
