import type { IApplicationDB } from '@interfaces/index'
import { ExportSignalRepository } from '@database/repositories/app/ExportSignalRepository'
import { ClientRepository } from '@database/repositories/app/ClientRepository'

/**
 * AdminService.getExportDetails iş kuralı (ADR-0024 P3-ADM): export sinyallerinin filtreli sayfası + analitik
 * (zaman çizgisi / mod / durum dağılımı) + mağaza adı eşlemesi. Sayfa/sıralama girdisi çağıran tarafından çözülür.
 */
export async function buildExportDetails(
    db: IApplicationDB,
    req: { status?: any; mode?: any; integrationCode?: any; targetClientId?: any; sortField?: any; sortOrder?: any; timeFrame?: any },
    page: number,
    limit: number,
) {
    const { status, mode, integrationCode, targetClientId, sortField = 'createdAt', sortOrder = -1, timeFrame } = req
    const signals = new ExportSignalRepository(db)
    const clientsRepo = new ClientRepository(db)
    const query: any = {}

    if (status) query.status = status
    if (mode) query.mode = mode
    if (integrationCode) query.integrationCode = integrationCode
    if (targetClientId) query.clientId = Number(targetClientId)

    // Timeframe filtering
    if (timeFrame && timeFrame !== 'ALL') {
        const startDate = new Date()
        if (timeFrame === 'DAY') startDate.setHours(0, 0, 0, 0)
        else if (timeFrame === 'WEEK') startDate.setDate(startDate.getDate() - 7)
        else if (timeFrame === 'MONTH') startDate.setMonth(startDate.getMonth() - 1)
        query.createdAt = { $gte: startDate }
    }

    const skip = (Number(page) - 1) * Number(limit)
    const sort: any = {}
    sort[sortField] = Number(sortOrder)

    const [exports, total, timeline, modeStats, statusStats] = await Promise.all([
        signals.listPage(query, sort, skip, Number(limit)),
        signals.count(query),
        signals.timeline(query),
        signals.sumByMode(query),
        signals.sumByStatus(query)
    ])

    // Client isimlerini çekelim
    const clientIds = Array.from(new Set(exports.map((e: any) => e.clientId)))
    const clients = await clientsRepo.findIdTitleByClientIds(clientIds)
    const clientMap = new Map(clients.map((c: any) => [c.clientId, c.title]))

    const data = exports.map((e: any) => ({
        ...e,
        clientName: clientMap.get(e.clientId) || `Store #${e.clientId}`
    }))

    return {
        success: true,
        data,
        total,
        page: Number(page),
        limit: Number(limit),
        analytics: {
            timeline: timeline.map((t: any) => ({ date: t._id, value: t.itemCount })),
            modes: modeStats.map((m: any) => ({ name: m._id, value: m.value })),
            statuses: statusStats.map((s: any) => ({ name: s._id, value: s.value }))
        }
    }
}
