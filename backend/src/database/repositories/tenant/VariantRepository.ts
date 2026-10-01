import type { IClientDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-CAT / P3-ADM stock): tenant `Variants` koleksiyonu sorguları. Tenant izolasyonu kurucuya
 * verilen tenant tutamağından gelir (`clientId` yok, ADR-0016 §5.1). Model her çağrıda tutamaktan alınır.
 */
export class VariantRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getVariantModel() }

    /** `findStockChanges` (operations/stock) gibi modeli doğrudan isteyen operasyonlara verilir; her çağrıda tutamaktan alınır. */
    queryModel(): any { return this.model }

    async listByProduct(productId: any): Promise<any[]> {
        return await this.model.find({ productId }).lean()
    }

    async listSummaryByProduct(productId: any, projection: any): Promise<any[]> {
        return await this.model.find({ productId }, projection).lean()
    }

    /** Verilen varyant filtresine uyan varyantların benzersiz `productId` satırları (`{ _id: productId }`). */
    async distinctProductIds(variantFilterQuery: any): Promise<any[]> {
        return await this.model.aggregate([
            { $match: variantFilterQuery },
            { $group: { _id: '$productId' } }
        ])
    }

    async sumStockByProduct(productId: any): Promise<any[]> {
        return await this.model.aggregate([
            { $match: { productId } },
            { $group: { _id: null, totalStock: { $sum: '$stock' } } }
        ])
    }

    /** Ürün grubu varyantları, yalnız `projection` alanlarıyla (dışa aktarma). */
    async listForExport(productIds: any[], projection: any): Promise<any> {
        return await this.model.find({ productId: { $in: productIds } }, projection).lean()
    }

    /** Toplu stok güncellemesi öncesi (hareket defteri) kapsamdaki varyantların stok görüntüsü; üst sınır 5000. */
    async findStockSnapshot(filter: any): Promise<any[]> {
        return await this.model.find(filter, { stock: 1, reserved: 1, stockcode: 1, barcode: 1 }).limit(5000).lean()
    }

    async insertMany(docs: any[]): Promise<any> {
        return await this.model.insertMany(docs)
    }

    async create(doc: any): Promise<any> {
        return await this.model.create(doc)
    }

    async bulkWrite(operations: any[]): Promise<any> {
        return await this.model.bulkWrite(operations)
    }

    async updateMany(filter: any, set: any): Promise<any> {
        return await this.model.updateMany(filter, { $set: set })
    }

    /** Aynı `maincode`'lu varyantların `images` dizisinden tek görsel URL'sini çeker. */
    async pullImageUrl(maincode: any, url: any): Promise<any> {
        return await this.model.updateMany({ maincode }, { $pull: { images: url } })
    }

    async pullImageUrls(maincode: any, urls: any[]): Promise<any> {
        return await this.model.updateMany({ maincode }, { $pull: { images: { $in: urls } } })
    }

    async deleteMany(filter: any): Promise<any> {
        return await this.model.deleteMany(filter)
    }

    async deleteOneById(variantId: any): Promise<any> {
        return await this.model.deleteOne({ _id: variantId })
    }

    // --- Stok özeti (StockService) ---

    async stockTotals(): Promise<any[]> {
        return await this.model.aggregate([
            { $group: { _id: null, total: { $sum: 1 }, totalStock: { $sum: '$stock' }, reservedUnits: { $sum: '$reserved' } } },
        ])
    }

    async countWithReservations(): Promise<number> {
        return await this.model.countDocuments({ reserved: { $gt: 0 } })
    }

    async countOverReserved(): Promise<number> {
        return await this.model.countDocuments({ $expr: { $gt: [{ $ifNull: ['$reserved', 0] }, { $ifNull: ['$stock', 0] }] } })
    }

    async countPublishPending(): Promise<number> {
        return await this.model.countDocuments({ stockDirty: true })
    }

    async aggregateWithMaxTime(pipeline: any[], maxTimeMS: number): Promise<any[]> {
        return await this.model.aggregate(pipeline).option({ maxTimeMS })
    }

    async findIdByBarcode(barcode: string): Promise<any> {
        return await this.model.findOne({ barcode }, { _id: 1 }).lean()
    }
}
