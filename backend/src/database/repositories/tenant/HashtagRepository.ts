import { ObjectId } from 'mongodb'
import type { IClientDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-CAT): tenant `Hashtags` koleksiyonu sorguları. Tenant izolasyonu kurucuya verilen tenant
 * tutamağından gelir (sorgularda `clientId` yok). Model her çağrıda tutamaktan alınır.
 */
export class HashtagRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getHashtagModel() }

    async listByTitle(): Promise<any[]> {
        return await this.model.find({}).sort({ title: 1 }).lean()
    }

    async create(document: any): Promise<any> {
        return await this.model.create(document)
    }

    async updateTitleColor(id: string, title: unknown, color: unknown): Promise<any> {
        const query = { _id: new ObjectId(id) }
        const set = { $set: { title, color } }
        return await this.model.updateOne(query, set)
    }

    async remove(id: string): Promise<any> {
        const query = { _id: new ObjectId(id) }
        return await this.model.deleteOne(query)
    }

    /** Aynı başlıklı değer zaten var mı (hashtag _id + values.title). */
    async hasValueTitle(hashtagId: ObjectId, title: unknown): Promise<boolean> {
        const existing = await this.model.findOne({ _id: hashtagId, "values.title": title })
        return !!existing
    }

    async pushValue(hashtagId: ObjectId, title: unknown, color: unknown): Promise<void> {
        await this.model.updateOne({ _id: hashtagId }, { $push: { values: { title, color } } })
    }

    async updateValue(hashtagId: ObjectId, valueId: ObjectId, title: unknown, color: unknown): Promise<any> {
        return await this.model.updateOne(
            { _id: hashtagId, "values._id": valueId },
            { $set: { "values.$.title": title, "values.$.color": color } })
    }

    async pullValue(hashtagId: ObjectId, valueId: ObjectId): Promise<any> {
        return await this.model.updateOne({ _id: hashtagId }, { "$pull": { "values": { _id: valueId } } })
    }
}
