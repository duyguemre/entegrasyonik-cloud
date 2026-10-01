import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `ExportFlags` (sinyal kuyruğu) sorguları. */
export class ExportFlagRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getExportFlagModel() }

    async list(filter: any): Promise<any[]> {
        return await this.model.find(filter).lean()
    }
}
