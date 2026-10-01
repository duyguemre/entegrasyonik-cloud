import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `ImportJobs` koleksiyonu sorguları (platform geneli yönetici metrikleri; tenant filtresi YOK — tenant kapsamlı sorgular `ImportJobRepository`, P3-INT). */
export class PlatformImportJobStatsRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getImportJobModel() }

    async countByStatus(match: any): Promise<any[]> {
        return await this.model.aggregate([
            { $match: match },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ])
    }

    async countQueued(filter: any): Promise<number> {
        return await this.model.countDocuments({ ...filter, status: 'QUEUED' })
    }

    async distinctActiveWorkers(since: Date): Promise<any[]> {
        return await this.model.distinct('lockedBy', {
            lockedBy: { $ne: null },
            updatedAt: { $gte: since }
        })
    }

    async countLocked(filter: any): Promise<number> {
        return await this.model.countDocuments({ ...filter, lockedBy: { $ne: null } })
    }

    /** Müşteri/durum kırılımı toplulaştırması (en aktif müşteriler). */
    async aggregatePipeline(pipeline: any[]): Promise<any[]> {
        return await this.model.aggregate(pipeline)
    }
}
