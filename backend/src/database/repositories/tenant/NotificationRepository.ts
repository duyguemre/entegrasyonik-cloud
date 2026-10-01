import type { IClientDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-ADM): tenant `Notifications` koleksiyonu sorguları. Filtreler çağıranda kurulur (`operations/notifications/inAppRepository`,
 * N-01 kullanıcı kapsamı); bu sınıf yalnız çalıştırır. Model her çağrıda tutamaktan alınır.
 */
export class NotificationRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getNotificationModel() }

    /** `_id` azalan sıralı, `limit` kadar satır (çağıran sonraki-sayfa için limit+1 ister). */
    async findPage(filter: any, limit: number): Promise<any[]> {
        return await this.model.find(filter).sort({ _id: -1 }).limit(limit).lean()
    }

    async countDocuments(filter: any): Promise<number> {
        return await this.model.countDocuments(filter)
    }

    /** aggregate() Mongoose şema dönüşümü yapmaz: `match` içindeki userId çağıranda ObjectId'ye çevrilmiş olmalı. */
    async countByCategory(match: any): Promise<Array<{ _id: string | null; n: number }>> {
        return await this.model.aggregate([{ $match: match }, { $group: { _id: '$category', n: { $sum: 1 } } }])
    }

    async updateMany(filter: any, set: Record<string, unknown>): Promise<any> {
        return await this.model.updateMany(filter, { $set: set })
    }
}
