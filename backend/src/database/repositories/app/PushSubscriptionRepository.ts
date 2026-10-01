import type { IApplicationDB } from '@interfaces/index'

/**
 * MOB-04: ApplicationDB `PushSubscriptions` erisimi. TUM kullanici sorgulari (tid, userId) ile suzulur (baskasinin cihazi
 * gorunmez/silinemez). `sub` alani SIFRELI tutulur (sifreleme operations katmaninda). Model her cagrida alinir.
 */
export class PushSubscriptionRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getPushSubscriptionModel() }

    /** Ayni uc (endpointHash) tek kayit: yeniden abonelik/baska kullanici -> sahiplik ve anahtarlar guncellenir. */
    async upsertByHash(endpointHash: string, doc: { tid: number; userId: string; sub: string; deviceLabel?: string; createdAt: Date }): Promise<void> {
        await this.model.updateOne({ endpointHash }, { $set: { ...doc }, $unset: { lastSuccessAt: '' } }, { upsert: true })
    }

    async listByUser(tid: number, userId: string): Promise<any[]> {
        return await this.model.find({ tid, userId }).sort({ createdAt: -1 }).limit(50).lean()
    }

    async deleteOwned(tid: number, userId: string, by: { endpointHash?: string; id?: string }): Promise<number> {
        const filter: Record<string, unknown> = { tid, userId }
        if (by.endpointHash) filter.endpointHash = by.endpointHash
        else if (by.id) filter._id = by.id
        else return 0
        const r = await this.model.deleteOne(filter)
        return r?.deletedCount ?? 0
    }

    async deleteManyByIds(ids: unknown[]): Promise<void> {
        if (ids.length) await this.model.deleteMany({ _id: { $in: ids } })
    }

    async deleteById(id: string): Promise<void> {
        await this.model.deleteOne({ _id: id })
    }

    async markSuccess(id: string, at: Date): Promise<void> {
        await this.model.updateOne({ _id: id }, { $set: { lastSuccessAt: at } })
    }

    /** Verilen kullanicilardan en az bir cihaz aboneligi olanlar (dagitim hedefi on suzgeci). */
    async usersWithSubscriptions(tid: number, userIds: string[]): Promise<string[]> {
        if (!userIds.length) return []
        const rows: any[] = await this.model.distinct('userId', { tid, userId: { $in: userIds } })
        return rows.map(String)
    }
}
