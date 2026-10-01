import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `Resources` (merkezi yetki listesi). Model her çağrıda tutamaktan alınır. */
export class ResourceRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getResourceModel() }

    async list(): Promise<any[]> {
        return await this.model.find().lean()
    }
}
