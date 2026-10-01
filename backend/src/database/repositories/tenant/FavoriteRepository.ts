import type { IClientDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): tenant `Favorites` koleksiyonu sorguları. Tenant izolasyonu kurucudaki tutamaktan gelir. */
export class FavoriteRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getFavoriteModel() }

    async listOrdered(): Promise<any[]> {
        return await this.model.find({}).sort({ order: 1 }).lean()
    }

    /** En yüksek `order` değerinden bir fazlasıyla ekler (yoksa 1). */
    async add(code: unknown): Promise<any> {
        const maxOrder = await this.model.findOne().sort({ order: -1 }).exec()
        const newOrderValue = maxOrder ? maxOrder.order + 1 : 1
        return await this.model.create({ code, order: newOrderValue })
    }

    async deleteByCode(code: unknown): Promise<any> {
        return await this.model.deleteOne({ code })
    }

    async sort(sortedCodes: any): Promise<any> {
        let order = 1
        const updates: any[] = []
        for (const code of sortedCodes) {
            updates.push({
                updateOne: {
                    filter: { code: code },
                    update: { $set: { 'order': order++ } }
                }
            })
        }
        return await this.model.bulkWrite(updates)
    }
}
