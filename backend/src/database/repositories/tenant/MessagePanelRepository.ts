import { ObjectId } from 'mongodb';
import { IClientDB } from '@interfaces/index';

/**
 * ADR-0024 Dalga 3 (P3-ORD): satıcı paneli (RPC) mesaj sorguları. Kurucu tenant DB tutamacını alır (ADR-0016 §5.1:
 * `clientId` parametresi yok; izolasyon tenant DB seçimiyle). Motor içe alım yolu ayrıdır: `MessageRepository`.
 * Model her çağrıda `getMessageModel()` ile alınır (önbelleğe alınmaz).
 */
export class MessagePanelRepository {
    constructor(private readonly db: IClientDB) { }

    /** `$match → $sort → $facet{metadata, data(+müşteri/sipariş lookup)}`; `{ total, messages }` döner. */
    async listPage(match: Record<string, any>, sort: Record<string, any>, skip: number, limit: number): Promise<{ total: number; messages: any[] }> {
        const result = await this.db.getMessageModel().aggregate([
            // PERFORMANS NOTU: Match her zaman ilk aşama olmalı
            { $match: match },
            { $sort: sort }, // [DB-02] $facet dışında: indeks kullanılabilir
            {
                $facet: {
                    metadata: [{ $count: 'total' }],
                    data: [
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
                            $lookup: {
                                from: 'Orders',
                                localField: 'orderId',
                                foreignField: '_id',
                                as: 'order'
                            }
                        },
                        { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } }
                    ]
                }
            }
        ]);
        return { total: result[0].metadata[0]?.total || 0, messages: result[0].data };
    }

    findById(messageId: any): Promise<any> {
        return this.db.getMessageModel().findById(messageId);
    }

    /** `findByIdAndUpdate(id, update, options)` — üç argüman. */
    updateById(messageId: any, update: Record<string, any>, options: Record<string, any>): Promise<any> {
        return this.db.getMessageModel().findByIdAndUpdate(messageId, update, options);
    }

    deleteById(messageId: any): Promise<any> {
        return this.db.getMessageModel().findByIdAndDelete(messageId);
    }

    /** Verilen id listesini (string → ObjectId dönüşümüyle) toplu siler. */
    deleteManyByIds(messageIds: any[]): Promise<any> {
        return this.db.getMessageModel().deleteMany({ _id: { $in: messageIds.map(id => new ObjectId(id)) } });
    }
}
