import { IClientDB } from '@interfaces/index';

/**
 * ADR-0024 Dalga 3 (P3-ORD): satıcı paneli (RPC) sevkiyat sorguları (sevkiyatlar `Orders` koleksiyonundadır). Kurucu tenant
 * DB tutamacını alır (ADR-0016 §5.1: `clientId` parametresi yok). Model her çağrıda `getOrderModel()` ile alınır.
 */
export class ShipmentPanelRepository {
    constructor(private readonly db: IClientDB) { }

    /** `$match → $sort → $facet{totalNumberOfRecords, orders}`; `{ total, orders }` döner. */
    async listPage(match: Record<string, any>, sort: Record<string, number>, skip: number, limit: number): Promise<{ total: number; orders: any[] }> {
        const result = await this.db.getOrderModel().aggregate([
            { $match: match },
            { $sort: sort }, // [DB-02] $facet dışında: indeks kullanılabilir
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
            },
        ]);
        const aggregationResult = result[0] || {};
        return {
            total: aggregationResult.totalNumberOfRecords?.[0]?.count || 0,
            orders: aggregationResult.orders || [],
        };
    }

    findOrderById(orderId: any): Promise<any> {
        return this.db.getOrderModel().findById(orderId);
    }

    /** Yalnızca `orderNumber` alanı (toplu yolda yanıt etiketi için). */
    findOrderNumberById(orderId: any): Promise<any> {
        return this.db.getOrderModel().findById(orderId).select('orderNumber');
    }

    /** `findByIdAndUpdate(id, update[, options])` — seçenek verilmezse üçüncü argüman GÖNDERİLMEZ. */
    updateOrderById(orderId: any, update: Record<string, any>, options?: Record<string, any>): Promise<any> {
        return options === undefined
            ? this.db.getOrderModel().findByIdAndUpdate(orderId, update)
            : this.db.getOrderModel().findByIdAndUpdate(orderId, update, options);
    }
}
