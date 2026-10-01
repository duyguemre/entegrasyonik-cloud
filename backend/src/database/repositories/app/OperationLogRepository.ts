import type { IApplicationDB } from '@interfaces/index'

/** ADR-0024 Dalga 3 (P3-ADM): ApplicationDB `OperationLogs` toplulaştırma sorguları (sistem sağlığı içgörüleri). */
export class OperationLogRepository {
    constructor(private readonly db: IApplicationDB) { }

    private get model() { return this.db.getOperationLogModel() }

    async statsByType(match: any): Promise<any[]> {
        return await this.model.aggregate([
            { $match: match },
            { $group: { _id: "$operationType", count: { $sum: 1 }, avgDuration: { $avg: "$durationMs" } } }
        ])
    }

    async statsByStatus(match: any): Promise<any[]> {
        return await this.model.aggregate([
            { $match: match },
            { $group: { _id: "$status", count: { $sum: 1 } } }
        ])
    }

    async dailyTimeline(match: any): Promise<any[]> {
        return await this.model.aggregate([
            { $match: match },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$startedAt" } },
                    success: { $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] } },
                    failed: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } },
                    partial: { $sum: { $cond: [{ $eq: ["$status", "PARTIAL"] }, 1, 0] } }
                }
            },
            { $sort: { "_id": 1 } }
        ])
    }

    async overallMetrics(match: any): Promise<any[]> {
        return await this.model.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    totalFetched: { $sum: "$fetched" },
                    totalInserted: { $sum: "$inserted" },
                    totalUpdated: { $sum: "$updated" },
                    totalFailed: { $sum: "$failed" },
                    totalSkipped: { $sum: "$skipped" },
                    avgDuration: { $avg: "$durationMs" }
                }
            }
        ])
    }
}
