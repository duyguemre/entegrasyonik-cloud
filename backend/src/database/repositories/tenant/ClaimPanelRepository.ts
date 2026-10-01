import { IClientDB } from '@interfaces/index';

/**
 * ADR-0024 Dalga 3 (P3-ORD): satıcı paneli (RPC) iade/talep sorguları. Kurucu tenant DB tutamacını alır (ADR-0016 §5.1:
 * `clientId` parametresi yok; izolasyon tenant DB seçimiyle). Motor içe alım yolu ayrıdır: `ClaimRepository`.
 * Model her çağrıda `getClaimModel()` ile alınır (önbelleğe alınmaz).
 */
export class ClaimPanelRepository {
    constructor(private readonly db: IClientDB) { }

    /** `$match → $sort → $facet{totalNumberOfRecords, claims(+müşteri lookup)}`; `{ total, claims }` döner. */
    async listPage(match: Record<string, any>, sort: Record<string, any>, skip: number, limit: number): Promise<{ total: number; claims: any[] }> {
        const result = await this.db.getClaimModel().aggregate([
            { $match: match },
            { $sort: sort },
            {
                $facet: {
                    totalNumberOfRecords: [{ $count: 'count' }],
                    claims: [
                        { $skip: skip },
                        { $limit: limit },
                        {
                            $lookup: {
                                from: 'Customers',
                                localField: 'customerId',
                                foreignField: '_id',
                                as: 'customer'
                            }
                        },
                        { $unwind: { path: '$customer', preserveNullAndEmptyArrays: true } },
                        {
                            $project: {
                                "customer.addresses": 0,
                                "customer.metrics": 0,
                                "customer.externalIdentities": 0
                            }
                        }
                    ]
                }
            }
        ]);
        const aggregationResult = result[0] || {};
        return {
            total: aggregationResult.totalNumberOfRecords?.[0]?.count || 0,
            claims: aggregationResult.claims || [],
        };
    }

    findById(claimId: any): Promise<any> {
        return this.db.getClaimModel().findById(claimId);
    }

    /** Detay ekranı: müşteri + sipariş (orderNumber/status) populate edilmiş tekil talep. */
    findByIdPopulated(claimId: any): Promise<any> {
        return this.db.getClaimModel()
            .findById(claimId)
            .populate('customerId')
            .populate('orderId', 'orderNumber status');
    }

    /** `findByIdAndUpdate(id, update[, options])` — seçenek verilmezse üçüncü argüman GÖNDERİLMEZ (toplu onay yolu). */
    updateById(claimId: any, update: Record<string, any>, options?: Record<string, any>): Promise<any> {
        return options === undefined
            ? this.db.getClaimModel().findByIdAndUpdate(claimId, update)
            : this.db.getClaimModel().findByIdAndUpdate(claimId, update, options);
    }
}
