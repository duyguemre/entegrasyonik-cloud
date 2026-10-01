import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `Menu` koleksiyonu sorguları. Model her çağrıda tutamaktan alınır. */
export class MenuRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getMenuModel() }

    async findById(id: string): Promise<any> {
        return await this.model.findOne({ _id: id }).lean()
    }
}
