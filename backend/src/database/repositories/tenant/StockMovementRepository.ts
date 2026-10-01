import type { IClientDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): tenant `StockMovements` (stok hareket defteri) sorguları. */
export class StockMovementRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getStockMovementModel() }

    /** En yeni önce; `limit + 1` satır döner (sonraki sayfa var mı belirlemek için). */
    async findPage(and: any[], limit: number, maxTimeMS: number): Promise<any[]> {
        return await this.model.find({ $and: and })
            .sort({ at: -1, _id: -1 }).limit(limit + 1).maxTimeMS(maxTimeMS).lean()
    }
}
