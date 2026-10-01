import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `Plans` sorguları. */
export class PlanRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getPlanModel() }

    async listPublicActive(): Promise<any[]> {
        return await this.model
            .find({ active: true, public: true })
            .sort({ priceMinor: 1 })
            .lean()
    }

    async findByCode(code: string): Promise<any> {
        return await this.model.findOne({ code }).lean()
    }

    async findActiveByCode(code: string): Promise<any> {
        return await this.model.findOne({ code, active: true }).lean()
    }
}
