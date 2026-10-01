import type { IApplicationDB } from '@interfaces/index'
import { RedisService } from '@services/redis/RedisService'
import { ExportSignalRepository } from '@database/repositories/app/ExportSignalRepository'
import { ImportJobRepository } from '@database/repositories/app/ImportJobRepository'
import { ExportFlagRepository } from '@database/repositories/app/ExportFlagRepository'
import { OperationLogRepository } from '@database/repositories/app/OperationLogRepository'
import { ClientRepository } from '@database/repositories/app/ClientRepository'

/**
 * AdminService.getSystemHealth iş kuralı (ADR-0024 P3-ADM): platform genelindeki iş trafiği, kuyruk, pod, Redis,
 * en aktif mağazalar ve operasyon günlüğü içgörülerini toplar. `buildCacheDump` api katmanında yaşar; operations
 * katmanı api'yi içe aktaramadığından çağıran taraf enjekte eder.
 */
export async function buildSystemHealth(
    db: IApplicationDB,
    req: { timeFrame?: any; targetClientId?: any },
    deps: { buildCacheDump: () => any },
) {
    const { timeFrame, targetClientId } = req // DAY, WEEK, MONTH, ALL, targetClientId
    const exportsRepo = new ExportSignalRepository(db)
    const importsRepo = new ImportJobRepository(db)
    const flagsRepo = new ExportFlagRepository(db)
    const opLogs = new OperationLogRepository(db)
    const clientsRepo = new ClientRepository(db)

    let startDate: Date | null = new Date(Date.now() - 24 * 60 * 60 * 1000) // Default DAY
    if (timeFrame === 'WEEK') startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    else if (timeFrame === 'MONTH') startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    else if (timeFrame === 'ALL') startDate = null

    const trafficFilter: any = {}
    if (targetClientId) trafficFilter.clientId = Number(targetClientId)

    const trafficQuery: any = { ...trafficFilter }
    if (startDate) {
        trafficQuery.updatedAt = { $gte: startDate }
    }

    // 1. Global İş Trafiği (Filtrelenmiş)
    const [exportStatsRaw, importStatsRaw] = await Promise.all([
        exportsRepo.countByStatus(trafficQuery),
        importsRepo.countByStatus(startDate ? { ...trafficFilter, updatedAt: { $gte: startDate } } : trafficFilter)
    ])

    const exportStats = exportStatsRaw || []
    const importStats = importStatsRaw || []

    // 1.1 Export Flag (Sinyal Kuyruğu) Verisi - Gerçek Zamanlı Kuyruk
    const flagFilter: any = {}
    if (targetClientId) flagFilter.clientId = String(targetClientId)
    const exportFlags = await flagsRepo.list(flagFilter)
    const flagQueuedCount = exportFlags.reduce((sum: number, f: any) => sum + (f.queuedCount || 0), 0)

    // UI'da "Bekleyen" olarak görünmesi için listeye ekliyoruz (Global trafik için)
    if (flagQueuedCount > 0) {
        const existingQueued = exportStats.find((s: any) => s._id === 'QUEUED')
        if (existingQueued) existingQueued.count += flagQueuedCount
        else exportStats.push({ _id: 'QUEUED', count: flagQueuedCount })
    }

    // 1.2 Import Kuyruğu (Global trafik için)
    const importQueuedCount = await importsRepo.countQueued(trafficFilter)

    // 2. Aktif Calışanlar (Podlar) - Son 15 dakikada işlem yapmış olanlar
    const podThreshold = new Date(Date.now() - 15 * 60 * 1000)
    const [activeExportWorkers, activeImportWorkers] = await Promise.all([
        exportsRepo.distinctActiveWorkers(podThreshold),
        importsRepo.distinctActiveWorkers(podThreshold)
    ])

    const uniquePods = Array.from(new Set([...activeExportWorkers, ...activeImportWorkers]))
        .filter(p => p && typeof p === 'string')
        .map(p => p.trim())

    // 3. Redis & Cache Bilgileri
    const redisClient = RedisService.getInstance()
    const redisInfoRaw = await redisClient.info()

    const redisMetrics = {
        usedMemory: redisInfoRaw.match(/used_memory_human:([^\r\n]*)/)?.[1]?.trim() || 'Unknown',
        connectedClients: redisInfoRaw.match(/connected_clients:([^\r\n]*)/)?.[1]?.trim() || '0',
        uptime: redisInfoRaw.match(/uptime_in_seconds:([^\r\n]*)/)?.[1]?.trim() || '0',
        version: redisInfoRaw.match(/redis_version:([^\r\n]*)/)?.[1]?.trim() || 'Unknown'
    }

    const waitCount = await redisClient.llen('bull:order-sync-queue:wait').catch(() => 0)
    let activeCount = 0
    try {
        activeCount = await redisClient.llen('bull:order-sync-queue:active').catch(() => 0)
        if (activeCount === 0) {
            activeCount = await redisClient.zcard('bull:order-sync-queue:active').catch(() => 0)
        }
    } catch (e) { }

    // Diğer kuyrukların da bilgisini ekliyoruz
    const exportActiveCount = await exportsRepo.countLocked(trafficFilter)
    const importActiveCount = await importsRepo.countLocked(trafficFilter)

    // 4. Bellek Cache (NodeCache) İstatistikleri ve Detayı
    // WP10: aile bazında sayılar; ham anahtar/tenant kimliği yanıta girmez (bkz. cacheDump.ts).
    const cacheDump = deps.buildCacheDump()

    // 5. En Aktif 5 Müşteri (Ayrı Ayrı Export ve Import) - Filtrelenebilir
    const aggregateActivity = async (repo: { aggregatePipeline(p: any[]): Promise<any[]> }, dateField: string = 'createdAt') => {
        const pipeline: any[] = []

        // Match logic
        const matchStage: any = {}
        if (startDate) matchStage[dateField] = { $gte: startDate }
        if (targetClientId) matchStage.clientId = Number(targetClientId)

        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage })
        }

        pipeline.push({
            $group: {
                _id: {
                    clientId: "$clientId",
                    status: "$status"
                },
                count: { $sum: 1 }
            }
        })

        const raw = await repo.aggregatePipeline(pipeline)

        // Pivot data by clientId
        const clients: Record<number, any> = {}
        raw.forEach((item: any) => {
            const cid = Number(item._id.clientId)
            if (isNaN(cid)) return

            if (!clients[cid]) clients[cid] = { total: 0, completed: 0, pending: 0, failed: 0 }
            clients[cid].total += item.count

            const s = item._id.status?.toUpperCase()
            if (['COMPLETED', 'SUCCESS'].includes(s)) clients[cid].completed += item.count
            else if (['FAILED', 'CANCELLED', 'ERROR', 'FAILED_LOG'].includes(s)) clients[cid].failed += item.count
            else clients[cid].pending += item.count
        })

        const sortedIds = Object.entries(clients)
            .sort((a: any, b: any) => b[1].total - a[1].total)
            .slice(0, targetClientId ? 1 : 5) // Specific client selected -> only 1 store
            .map(([id]) => Number(id))

        if (sortedIds.length === 0) return []

        const clientDetails = await clientsRepo.findIdTitleByClientIds(sortedIds)

        return sortedIds.map(id => {
            const detail = clientDetails.find((c: any) => Number(c.clientId) === id)
            return {
                name: detail?.title || `Store #${id}`,
                data: clients[id]
            }
        })
    }

    // 5. Operation Log Insights (New)
    const opLogQuery: any = { ...trafficFilter }
    if (startDate) opLogQuery.startedAt = { $gte: startDate }

    const [opTypeStats, opStatusStats, opTimeline, opOverallMetrics] = await Promise.all([
        opLogs.statsByType(opLogQuery),
        opLogs.statsByStatus(opLogQuery),
        opLogs.dailyTimeline(opLogQuery),
        opLogs.overallMetrics(opLogQuery)
    ])

    const [topExports, topImports, allClientsListRaw] = await Promise.all([
        aggregateActivity(exportsRepo, 'updatedAt'),
        aggregateActivity(importsRepo, 'updatedAt'),
        clientsRepo.listAllIdTitleByTitle()
    ])

    const allClientsList = allClientsListRaw.map((c: any) => ({
        clientId: Number(c.clientId),
        title: c.title
    }))

    return {
        success: true,
        clients: allClientsList,
        traffic: {
            exports: exportStats,
            imports: importStats
        },
        infrastructure: {
            activePods: uniquePods,
            redis: redisMetrics,
            queues: {
                orderSync: { wait: waitCount, active: activeCount },
                export: { wait: flagQueuedCount, active: exportActiveCount },
                import: { wait: importQueuedCount, active: importActiveCount }
            },
            memoryCache: cacheDump,
            topExports,
            topImports
        },
        operationInsights: {
            types: opTypeStats,
            statuses: opStatusStats,
            timeline: opTimeline,
            metrics: opOverallMetrics[0] || { totalFetched: 0, totalInserted: 0, totalUpdated: 0, totalFailed: 0, totalSkipped: 0, avgDuration: 0 }
        }
    }
}
