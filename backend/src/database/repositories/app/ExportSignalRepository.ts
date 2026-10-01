import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `ExportSignals` koleksiyonu sorguları (yönetici metrikleri). */
export class ExportSignalRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getExportSignalModel() }

    /** Duruma göre sayım (`{ _id: status, count }`). */
    async countByStatus(match: any): Promise<any[]> {
        return await this.model.aggregate([
            { $match: match },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ])
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

    async listPage(query: any, sort: any, skip: number, limit: number): Promise<any[]> {
        return await this.model
            .find(query)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .lean()
    }

    async count(query: any): Promise<number> {
        return await this.model.countDocuments(query)
    }

    async timeline(query: any): Promise<any[]> {
        return await this.model.aggregate([
            { $match: query },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    itemCount: { $sum: "$itemCount" }
                }
            },
            { $sort: { "_id": 1 } }
        ])
    }

    async sumByMode(query: any): Promise<any[]> {
        return await this.model.aggregate([
            { $match: query },
            { $group: { _id: "$mode", value: { $sum: "$itemCount" } } }
        ])
    }

    async sumByStatus(query: any): Promise<any[]> {
        return await this.model.aggregate([
            { $match: query },
            { $group: { _id: "$status", value: { $sum: "$itemCount" } } }
        ])
    }
}
