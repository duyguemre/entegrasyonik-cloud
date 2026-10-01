import type { ObjectId } from 'mongodb'
import type { IClientDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-CAT): tenant `AttributeMappings` (kategori + özellik eşlemeleri) sorguları. Tenant izolasyonu
 * kurucuya verilen tenant tutamağından gelir (sorgularda `clientId` yok). Model her çağrıda tutamaktan alınır.
 *
 * `updateMany`/`deleteMany` geçişleri, `operations/catalog/mapping/mappingCleanup.ts` işlevlerinin beklediği
 * `{ updateMany, deleteMany }` şekline uyar (depo doğrudan "model" yerine geçirilir).
 */
export class AttributeMappingRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getAttributeMappingModel() }

    /** Türkçe harmanlamalı liste; integrationCode süzgeci ve skip/limit opsiyonel. */
    async list(filter: Record<string, unknown>, page: { skip?: unknown; limit?: unknown } = {}): Promise<any[]> {
        let query = this.model.find(filter).collation({ locale: "tr", strength: 2 })
        if (page.skip) query = query.skip(Number(page.skip))
        if (page.limit) query = query.limit(Number(page.limit))
        return await query.lean()
    }

    async listByIntegration(integrationCode: string): Promise<any[]> {
        return await this.model.find({ integrationCode }).lean()
    }

    async findOne(filter: Record<string, unknown>): Promise<any> {
        return await this.model.findOne(filter).lean()
    }

    /** Platform kategorisinden yerel kategori çözümü için en çok 2 kategori-eşleme satırı. */
    async findCategoryMappingsByPlatformCategory(integrationCode: string, platformCategoryId: string): Promise<any[]> {
        return await this.model
            .find({ integrationCode, platformCategoryId, platformAttributeId: null, isCategoryMapping: true }).limit(2).lean()
    }

    async upsertOne(query: Record<string, unknown>, update: unknown): Promise<any> {
        return await this.model.updateOne(query, update, { upsert: true })
    }

    /**
     * Aggregation-pipeline güncellemeli upsert. Aynı anahtarla eşzamanlı ilk yazmada benzersiz indeks yarışını
     * kaybeden (11000) çağrı, belge artık var olduğundan güvenle bir kez daha denenir.
     */
    async upsertWithRaceRetry(query: Record<string, unknown>, pipeline: unknown): Promise<any> {
        const model = this.model
        try {
            return await model.updateOne(query, pipeline as any, { upsert: true })
        } catch (e: any) {
            if (e?.code !== 11000) throw e
            return await model.updateOne(query, pipeline as any, { upsert: true })
        }
    }

    async bulkWrite(ops: any[]): Promise<any> {
        return await this.model.bulkWrite(ops, { ordered: false })
    }

    async deleteAllOfCategory(localCategoryId: ObjectId, integrationCode: string): Promise<any> {
        return await this.model.deleteMany({ localCategoryId, integrationCode })
    }

    updateMany(filter: any, update: any): Promise<any> { return this.model.updateMany(filter, update) }
    deleteMany(filter: any): Promise<any> { return this.model.deleteMany(filter) }
}
