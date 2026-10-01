import { ObjectId } from 'mongodb'
import type { IClientDB } from '@interfaces/index'

/**
 * ADR-0024 Dalga 3 (P3-CAT): tenant `Products` koleksiyonu sorguları (ürün, ürün görseli alt belgeleri ve ürün özet
 * alanları). Tenant izolasyonu kurucuya verilen tenant tutamağından gelir (`clientId` yok, ADR-0016 §5.1). Model her
 * çağrıda tutamaktan alınır.
 */
export class ProductRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getProductModel() }

    async listOrdered(): Promise<any> {
        return await this.model.find({}).sort({ order: 1 })
    }

    /** Ürün listesi: filtre + sıralama ($facet dışında) + sayfa; her ürüne kısaltılmış varyant özeti eklenir. */
    async searchPageWithVariants(filterQuery: any, sortBy: any, skipCount: number, limit: number): Promise<any[]> {
        return await this.model.aggregate([
            { $match: filterQuery },
            { $sort: sortBy }, // [DB-02] $facet dışında: indeks kullanılabilir
            {
                $facet: {
                    totalNumberOfRecords: [{ $count: 'count' }],
                    products: [
                        { $skip: skipCount },
                        { $limit: limit },
                        {
                            $lookup: {
                                from: 'Variants',
                                localField: '_id',
                                foreignField: 'productId',
                                as: 'variants',
                                pipeline: [
                                    {
                                        $project: {
                                            stock: 1, prices: 1, barcode: 1, stockcode: 1,
                                            choices: 1, shelf: 1, choiceValueTitle: 1, _id: 1,
                                            images: { $slice: ["$images", 1] },
                                            platforms: {
                                                $arrayToObject: {
                                                    $map: {
                                                        input: { $objectToArray: "$platforms" },
                                                        as: "p",
                                                        in: {
                                                            k: "$$p.k",
                                                            v: {
                                                                $arrayToObject: {
                                                                    $filter: {
                                                                        input: { $objectToArray: "$$p.v" },
                                                                        as: "field",
                                                                        cond: { $ne: ["$$field.k", "attributes"] }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                }
            }
        ])
    }

    async findWithVariants(id: any): Promise<any[]> {
        return await this.model.aggregate([
            { $match: { _id: new ObjectId(id.toString()) } },
            { $lookup: { from: 'Variants', localField: '_id', foreignField: 'productId', as: 'variants' } }
        ])
    }

    async upsertByTempId(tempId: string, productInfo: any): Promise<any> {
        return await this.model.findOneAndUpdate(
            { tempId: new ObjectId(tempId as string) },
            { $set: productInfo },
            { upsert: true, returnDocument: 'after' }
        )
    }

    async upsertById(productId: string, productInfo: any): Promise<any> {
        return await this.model.findOneAndUpdate(
            { _id: new ObjectId(productId as string) },
            { $set: productInfo },
            { upsert: true, returnDocument: 'after' }
        )
    }

    async setOnsale(id: string, onsale: unknown): Promise<any> {
        return await this.model.updateOne({ _id: new ObjectId(id as string) }, { $set: { onsale } })
    }

    async delete(id: ObjectId): Promise<any> {
        return await this.model.deleteOne({ _id: id })
    }

    async setStockAndPrices(productId: any, stock: number, prices: { minSalePrice: number; maxSalePrice: number }): Promise<void> {
        await this.model.updateOne({ _id: productId }, { $set: { stock, prices } })
    }

    async setStock(productId: any, stock: number): Promise<void> {
        await this.model.updateOne({ _id: productId }, { $set: { stock } })
    }

    async setPrices(productId: any, prices: unknown): Promise<void> {
        await this.model.updateOne({ _id: productId }, { $set: { prices } })
    }

    async findMaincode(productId: any): Promise<any> {
        return await this.model.findOne({ _id: productId }).select('maincode').lean()
    }

    /** Dışa aktarma: yalnız `title` projeksiyonlu, imleçle akıtılan ürünler. */
    exportCursor(filterQuery: any, batchSize: number): any {
        return this.model.find(filterQuery, { title: 1 }).lean().cursor({ batchSize })
    }

    // --- Ürün görseli alt belgeleri (`images[]`, taslak ürün `tempId` ile adreslenir) ---

    async findImagesByTempId(tempId: any): Promise<any> {
        return await this.model.findOne({ tempId }).select('_id images').lean()
    }

    /** Taslak ürünün görselleri; `productId` ObjectId'ye çevrilir (geçersizse sorgudan ÖNCE fırlar). */
    async findImagesByTempProductId(productId: unknown): Promise<any> {
        const filterQuery: any = { tempId: new ObjectId(productId + '') }
        return await this.model.findOne(filterQuery).select('_id images').lean()
    }

    async findForImageDelete(tempId: any, imageId: any): Promise<any> {
        return await this.model.findOne({ tempId, 'images._id': imageId }).select('tempId maincode images').lean()
    }

    async findForImagesDelete(tempId: any): Promise<any> {
        return await this.model.findOne({ tempId }).select('tempId maincode images').lean()
    }

    async pushDirectImage(tempId: any, imageDocument: any): Promise<void> {
        await this.model.updateOne(
            { tempId },
            { $push: { images: imageDocument }, $setOnInsert: { stockcode: String(Date.now()), maincode: tempId } },
            { upsert: true },
        )
    }

    async pullImage(tempId: any, imageId: any): Promise<void> {
        await this.model.updateOne({ tempId }, { $pull: { images: { _id: imageId } } })
    }

    async pullImages(tempId: any, imageIds: any[]): Promise<void> {
        await this.model.updateOne({ tempId }, { $pull: { images: { _id: { $in: imageIds } } } })
    }

    async bulkWriteImageOrder(updates: any[]): Promise<void> {
        await this.model.bulkWrite(updates)
    }

    async pushImages(tempId: string, imageDocuments: any[]): Promise<any> {
        return await this.model.findOneAndUpdate(
            { tempId },
            { stockcode: String(Date.now()), maincode: tempId, $push: { images: imageDocuments } },
            { new: true, upsert: true } // Güncellenen belgeyi geri döner
        ).lean()
    }

    async findByIdLean(productId: any): Promise<any> {
        return await this.model.findById(productId).lean()
    }

    async setVariants(productId: any, variants: any[]): Promise<any> {
        return await this.model.updateOne({ _id: productId }, { $set: { variants } })
    }
}
