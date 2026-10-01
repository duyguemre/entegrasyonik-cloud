import type { IClientDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): tenant `Settings` (tek belge, docId=1) sorguları. Model her çağrıda tutamaktan alınır. */
export class SettingRepository {
    constructor(private readonly db: IClientDB) { }

    private get model() { return this.db.getSettingModel() }

    async findOne(): Promise<any> {
        return await this.model.findOne({}).lean()
    }

    /** `docId: 1` belgesine $set uygular (upsert, yeni belgeyi döner). */
    async upsertSet(set: any): Promise<any> {
        return await this.model.findOneAndUpdate({ docId: 1 }, { $set: set }, { new: true, upsert: true }).lean()
    }
}
