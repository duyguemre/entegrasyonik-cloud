import type { IClientDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-CAT): tenant `Statistics` koleksiyonu sorguları. */
export class StatisticsRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getStatisticsModel() }

    async findVariantStats(): Promise<any> {
        return await this.model.findOne({ _id: "variant_stats" }).lean()
    }
}
