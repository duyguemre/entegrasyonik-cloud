import { ObjectId } from 'mongodb'
import type { IClientDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-CAT): tenant `Categories` koleksiyonu sorguları. Tenant izolasyonu kurucuya verilen tenant
 * tutamağından gelir (sorgularda `clientId` yok). Model her çağrıda tutamaktan alınır.
 */
export class CategoryRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getCategoryModel() }

    /** Tüm kategoriler, `order` artan (düz liste; ağaç kurma handler'da). */
    async listOrdered(): Promise<any[]> {
        return await this.model.find({}).sort({ order: 1 }).lean()
    }

    /** autoMatch için tüm kategoriler (lean DEĞİL, sıralama yok). */
    async findAll(): Promise<any[]> {
        return await this.model.find({})
    }

    async findMain(): Promise<any> {
        return await this.model.findOne({ isMain: true })
    }

    async create(document: any): Promise<any> {
        return await this.model.create(document)
    }

    async updateTitle(id: string, title: unknown): Promise<any> {
        const query = { _id: new ObjectId(id) }
        return await this.model.updateOne(query, { $set: { title } })
    }

    /** `parentId` istekten geldiği gibi yazılır (dönüştürme yok). */
    async setParent(id: string, parentId: unknown): Promise<any> {
        const query = { _id: new ObjectId(id) }
        return await this.model.updateOne(query, { $set: { parentId } })
    }

    /** İki kategoriyi (hydrate edilmiş belgeler) getirir; kimlik dönüşümü sorgudan ÖNCE yapılır. */
    async findPair(idA: string, idB: string): Promise<any[]> {
        const filter = { $or: [{ '_id': new ObjectId(idA) }, { '_id': new ObjectId(idB) }] }
        return await this.model.find(filter)
    }

    async setOrder(id: string, order: unknown): Promise<any> {
        const query = { _id: new ObjectId(id) }
        return await this.model.updateOne(query, { $set: { order } })
    }

    async remove(id: string): Promise<any> {
        const query = { _id: new ObjectId(id) }
        return await this.model.deleteOne(query)
    }
}
