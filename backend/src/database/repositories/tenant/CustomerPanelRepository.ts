import { ObjectId } from 'mongodb';
import { IClientDB } from '@interfaces/index';

/**
 * ADR-0024 Dalga 3 (P3-ORD): satıcı paneli (RPC) müşteri sorguları. Kurucu tenant DB tutamacını alır (ADR-0016 §5.1:
 * `clientId` parametresi yok; izolasyon tenant DB seçimiyle). Motor içe alım yolu ayrıdır: `CustomerRepository`.
 * Modeller her çağrıda `getXModel()` ile alınır (önbelleğe alınmaz).
 */
export class CustomerPanelRepository {
    constructor(private readonly db: IClientDB) { }

    /** `$match → $sort → $facet{metadata, data(+iade oranı/net kazanç)}`; `{ total, customers }` döner. */
    async listPage(match: Record<string, any>, sort: Record<string, any>, skip: number, limit: number): Promise<{ total: number; customers: any[] }> {
        const result = await this.db.getCustomerModel().aggregate([
            { $match: match },
            { $sort: sort }, // [DB-02] $facet dışında: indeks kullanılabilir
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $addFields: {
                                // İade Oranı Hesaplama (%)
                                returnRate: {
                                    $cond: [
                                        { $gt: ["$metrics.totalOrderCount", 0] },
                                        { $multiply: [{ $divide: ["$metrics.totalClaimCount", "$metrics.totalOrderCount"] }, 100] },
                                        0
                                    ]
                                },
                                // Net Kazanç (Brüt Harcama - İadeler)
                                netRevenue: {
                                    $subtract: [
                                        { $ifNull: ["$metrics.totalSpent", 0] },
                                        { $ifNull: ["$metrics.totalReturnAmount", 0] }
                                    ]
                                }
                            }
                        }
                    ]
                }
            }
        ]);
        return { total: result[0].metadata[0]?.total || 0, customers: result[0].data };
    }

    findLeanById(customerId: any): Promise<any> {
        return this.db.getCustomerModel().findById(customerId).lean();
    }

    /** Müşterinin son `limit` siparişi (createdAt azalan). */
    recentOrders(customerId: any, limit: number): Promise<any[]> {
        return this.db.getOrderModel()
            .find({ customerId: new ObjectId(customerId) })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
    }

    /** Müşterinin son `limit` iade talebi (createdAt azalan). */
    recentClaims(customerId: any, limit: number): Promise<any[]> {
        return this.db.getClaimModel()
            .find({ customerId: new ObjectId(customerId) })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
    }

    /** `findByIdAndUpdate(id, update)` — iki argüman. */
    updateById(customerId: any, update: any): Promise<any> {
        return this.db.getCustomerModel().findByIdAndUpdate(customerId, update);
    }

    /** Anonimleştirme: müşteri kaydının kişisel alanlarını `$set` ile günceller. */
    updateCustomerFields(oid: ObjectId, set: Record<string, any>): Promise<any> {
        return this.db.getCustomerModel().updateOne({ _id: oid }, { $set: set });
    }

    /** Anonimleştirme: müşteriye ait siparişlerin kişisel alanlarını `$set` ile günceller. */
    updateOrderFields(oid: ObjectId, set: Record<string, any>): Promise<any> {
        return this.db.getOrderModel().updateMany({ customerId: oid }, { $set: set });
    }

    /** Anonimleştirme: müşteriye ait mesajların kişisel alanlarını `$set` ile günceller. */
    updateMessageFields(oid: ObjectId, set: Record<string, any>): Promise<any> {
        return this.db.getMessageModel().updateMany({ customerId: oid }, { $set: set });
    }
}
