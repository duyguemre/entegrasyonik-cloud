import type { IClientDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-CAT): tenant `Images` koleksiyonu (taslak ürün görsel kayıtları) sorguları. */
export class ImageRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getImageModel() }

    async listOrdered(): Promise<any> {
        return await this.model.find({}).sort({ order: 1 }).lean()
    }

    async findByProductId(productId: string): Promise<any[]> {
        return await this.model.find({ productId })
    }

    async bulkWrite(operations: any[]): Promise<void> {
        await this.model.bulkWrite(operations)
    }
}
