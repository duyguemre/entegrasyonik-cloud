import { ObjectId } from 'mongodb'
import type { IClientDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-CAT): tenant `Choices` koleksiyonu sorguları. Tenant izolasyonu kurucuya verilen tenant
 * tutamağından gelir (sorgularda `clientId` yok). Model her çağrıda tutamaktan alınır.
 */
export class ChoiceRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getChoiceModel() }

    /** `order` artan; skip/limit verilirse uygulanır. */
    async list(page: { skip?: unknown; limit?: unknown } = {}): Promise<any[]> {
        let query = this.model.find({}).sort({ order: 1 })
        if (page.skip) query = query.skip(Number(page.skip))
        if (page.limit) query = query.limit(Number(page.limit))
        return await query.lean()
    }

    /** Tüm seçenekler (lean DEĞİL, sıralama yok). autoMatch projeksiyonsuz, VariantService `{}` projeksiyonla çağırır. */
    async findAll(projection?: Record<string, unknown>): Promise<any[]> {
        return projection === undefined ? await this.model.find({}) : await this.model.find({}, projection)
    }

    async create(document: any): Promise<any> {
        return await this.model.create(document)
    }

    async updateFlags(id: string, title: unknown, isVarianter: unknown, isSlicer: unknown): Promise<any> {
        const query = { _id: new ObjectId(id) }
        return await this.model.updateOne(query, { $set: { title, isVarianter, isSlicer } })
    }

    async remove(id: string): Promise<any> {
        const query = { _id: new ObjectId(id) }
        return await this.model.deleteOne(query)
    }

    /** Aynı başlıklı değer var mı (choice _id + values.title). */
    async hasValueTitle(id: string, title: unknown): Promise<boolean> {
        const filter = { _id: new ObjectId(id), "values.title": title }
        const existing = await this.model.findOne(filter)
        return !!existing
    }

    async pushValue(id: string, title: unknown, allowCustom: boolean): Promise<void> {
        const filter = { _id: new ObjectId(id) }
        await this.model.updateOne(filter, { $push: { values: { title, allowCustom } } })
    }

    /** Aynı choice içinde başka bir değerde aynı başlık var mı. */
    async hasDuplicateValueTitle(choiceId: ObjectId, valueId: ObjectId, title: unknown): Promise<boolean> {
        const duplicate = await this.model.findOne({
            _id: choiceId,
            values: { $elemMatch: { title, _id: { $ne: valueId } } }
        })
        return !!duplicate
    }

    async updateValue(choiceId: ObjectId, valueId: ObjectId, title: unknown, allowCustom: unknown): Promise<any> {
        return await this.model.updateOne(
            { _id: choiceId, "values._id": valueId },
            { $set: { "values.$.title": title, "values.$.allowCustom": allowCustom } })
    }

    async pullValue(id: string, valueId: string): Promise<any> {
        const filterQuery = { _id: new ObjectId(id) }
        const updateQuery = { "$pull": { "values": { _id: new ObjectId(valueId) } } }
        return await this.model.updateOne(filterQuery, updateQuery)
    }
}
