import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `AuditLogs` okuma sorguları. */
export class AuditLogRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getAuditLogModel() }

    /** Toplam + sayfa (koşut); ikisi de `maxTimeMS` sınırlı. */
    async listPage(filter: any, page: number, limit: number, maxTimeMS: number): Promise<[number, any[]]> {
        const model = this.model
        return await Promise.all([
            model.countDocuments(filter).maxTimeMS(maxTimeMS),
            model.find(filter, { at: 1, event: 1, result: 1, sub: 1, meta: 1, imp: 1 }).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).maxTimeMS(maxTimeMS).lean(),
        ]) as [number, any[]]
    }
}
