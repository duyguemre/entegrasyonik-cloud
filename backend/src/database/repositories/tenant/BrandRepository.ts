import { ObjectId } from 'mongodb'
import type { IClientDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-CAT): tenant `Brands` koleksiyonu sorguları. Tenant izolasyonu kurucuya verilen tenant
 * tutamağından gelir (sorgularda `clientId` yok, ADR-0016 §5.1). Model her çağrıda tutamaktan alınır.
 */
export class BrandRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getBrandModel() }

    /** Türkçe harmanlamalı, ana markalar önce, başlığa göre; skip/limit verilirse uygulanır. */
    async list(page: { skip?: unknown; limit?: unknown } = {}): Promise<any[]> {
        let query = this.model.find({}).collation({ locale: "tr", strength: 2 }).sort({ isMain: -1, title: 1 })
        if (page.skip) query = query.skip(Number(page.skip))
        if (page.limit) query = query.limit(Number(page.limit))
        return await query.lean()
    }

    async create(title: unknown): Promise<{ _id: any }> {
        const resp = await this.model.create({ title })
        return { _id: resp._id }
    }

    /** `platforms.<integrationCode>` eşlemesini yazar; tek belge değiştiyse true. */
    async setPlatformBrand(brandId: string, integrationCode: string, integrationBrand: unknown): Promise<boolean> {
        const resp = await this.model.updateOne({ _id: new ObjectId(brandId) }, { $set: { ['platforms.' + integrationCode]: integrationBrand } })
        return resp.modifiedCount == 1
    }

    async updateTitle(brandId: string, title: unknown): Promise<boolean> {
        const resp = await this.model.updateOne({ _id: new ObjectId(brandId) }, { $set: { title } })
        return resp.modifiedCount == 1
    }

    async delete(brandId: string): Promise<any> {
        return await this.model.deleteOne({ _id: new ObjectId(brandId) })
    }
}
