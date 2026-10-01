import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `GlobalRoles` (sabit roller). Model her çağrıda tutamaktan alınır. */
export class GlobalRoleRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getGlobalRoleModel() }

    async list(): Promise<any[]> {
        return await this.model.find().lean()
    }
}
