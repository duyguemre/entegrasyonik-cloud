import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `MetricRollups` koleksiyonu. */
export class MetricRollupRepository {
    constructor(private readonly db: IApplicationDB) { }

    /** `find(filter).maxTimeMS().lean()` destekleyen modeli operations'a (publishLag) verir; her çağrıda tutamaktan alınır. */
    queryModel(): any { return this.db.getMetricRollupModel() }
}
