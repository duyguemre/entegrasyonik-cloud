import os from 'os'
import { RedisService } from '@services/redis/RedisService'
import { checkReadiness, type AppRole } from '@health/HealthCheck'
import { listNonOpenIntakeTargets } from '@integration/config/platformOverrideStore'
import { OverviewOps } from '../../admin/overviewOps'
import { EngineOps, ENGINE_QUEUES, QUEUE_COUNT_TYPES } from '../../admin/engineOps'
import type { AttentionSources, TenantAt } from '../../admin/attentionOps'
import { productionQueueProvider } from './backoffice-engine-service'
import { buildApiHealth } from '../../../operations/backoffice/apiHealth'
import { readResilienceState } from '../../../operations/backoffice/resilienceState'
import { buildSlowQueries } from '../../../operations/backoffice/slowQueries'
import { tidOfClient, type FailedBullJobs } from '../../../operations/backoffice/tenantOps'

/**
 * K51: `getAttention`/`getPulse`/`listTenants`/`getHealthSummary` için ÜRETİM kablolaması -- mevcut servis/operasyonları (overview/engine/integrations/infra/billing/tenants/alerts)
 * `AttentionSources` portlarına bağlar. İş mantığı `api/admin/attentionOps.ts`/`pulseOps.ts`/`operations/backoffice/tenantOps.ts` (saf, testli) içindedir; burada yalnız bağlama var.
 */
const MAX_ROWS = 500
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const QT = 2500
const currentRole = (): AppRole => { const r = (process.env.APP_ROLE || '').trim().toLowerCase(); return r === 'web' || r === 'worker' ? r : 'all' }

/** BullMQ `failed` kümesi (son 500) -> yalnız (tid, bitiş zamanı). Redis yoksa null. İş yükü/hata metni okunmaz. */
export const productionFailedBullJobs: FailedBullJobs = async () => {
    const q = productionQueueProvider(ENGINE_QUEUES[0])
    if (!q) return null
    try {
        const jobs = await q.getJobs(['failed'], 0, 499, false)
        return jobs.map((j) => { const n = Number(j.data?.clientId); return { tid: Number.isInteger(n) && n > 0 ? n : null, finishedOn: j.finishedOn } })
    } catch { return null }
}

export function productionAttentionSources(applicationDB: any): AttentionSources {
    const role = currentRole()
    const clientModel = applicationDB.getClientModel()
    const subModel = applicationDB.getSubscriptionModel()
    const alertModel = applicationDB.getAlertModel()
    const ticketModel = applicationDB.getTicketModel()
    const nowMs = () => Date.now()

    const names = async (tids: number[]): Promise<Map<number, string | null>> => {
        const uniq = [...new Set(tids)].slice(0, MAX_ROWS)
        if (uniq.length === 0) return new Map()
        const rows: any[] = await clientModel.find({ $or: [{ clientId: { $in: uniq } }, { order: { $in: uniq } }] }).select({ clientId: 1, order: 1, title: 1 }).limit(MAX_ROWS).maxTimeMS(QT).lean()
        return new Map(rows.map((c) => [tidOfClient(c) as number, typeof c.title === 'string' ? c.title : null]))
    }
    const subRows = async (filter: Record<string, any>, sort: Record<string, 1 | -1>, atField: string) => {
        const rows: any[] = await subModel.find(filter).select({ clientId: 1, trialEndsAt: 1, graceUntil: 1, updatedAt: 1, status: 1 }).sort(sort).limit(MAX_ROWS).maxTimeMS(QT).lean()
        const nm = await names(rows.map((r) => Number(r.clientId)))
        return rows.map((r) => ({ tid: Number(r.clientId), name: nm.get(Number(r.clientId)) ?? null, at: r[atField] ? new Date(r[atField]) : null, graceUntil: r.graceUntil ? new Date(r.graceUntil) : null }))
    }

    return {
        tenantNames: names,
        async queues() {
            return Promise.all(ENGINE_QUEUES.map(async (name) => {
                const q = productionQueueProvider(name)
                let counts: Record<string, number> | null = null
                if (q) { try { counts = await q.getJobCounts(...QUEUE_COUNT_TYPES) } catch { counts = null } }
                const dlqPending = await applicationDB.getDeadLetterQueueModel().countDocuments({ queueName: name, status: 'PENDING_MANUAL_REVIEW' }).maxTimeMS(QT).catch(() => null)
                const c = (t: string) => Number(counts?.[t]) || 0
                return { name, available: counts !== null, backlog: counts ? c('wait') + c('delayed') : null, failed: counts ? c('failed') : null, dlqPending }
            }))
        },
        async circuits() {
            if (!RedisService.isReady()) throw new Error('redis')
            const st = await readResilienceState(RedisService.getInstance() as any)
            return st.items.map((i) => {
                const pods = i.pods
                const opened = pods.map((p) => p.lastOpenedAt).filter((x): x is string => !!x).sort().pop() ?? null
                return { integrationCode: i.integrationCode, open: pods.reduce((a, p) => a + (p.circuits?.open ?? 0), 0), halfOpen: pods.reduce((a, p) => a + (p.circuits?.half_open ?? 0), 0), lastOpenedAt: opened }
            })
        },
        async apiHealth() {
            const r = await buildApiHealth({ applicationDB, range: '1h' })
            return r.items.map((i) => ({ integrationCode: i.integrationCode, total: i.total, errors: i.errors, errorRate: i.errorRate }))
        },
        async leases() {
            const r = await new EngineOps({ applicationDB, queues: productionQueueProvider }).getStateMachineJobs()
            const oldest = (r.stuckLeases as any[]).map((l) => l.lastActivityAt).filter((x: unknown): x is string => typeof x === 'string').sort()[0] ?? null
            return { count: r.stuckLeaseCount as number, oldestAt: oldest }
        },
        async infra() {
            const h = await new OverviewOps({
                applicationDB, readiness: () => checkReadiness(role, () => RedisService.getInstance()), role, queues: productionQueueProvider,
                intake: () => listNonOpenIntakeTargets(), podName: process.env.POD_NAME || os.hostname(),
            }).getHealth()
            const dep = h.dependencies?.status === 'ok' ? h.dependencies : null
            return {
                ready: dep ? dep.ready === true : false, mongo: String(dep?.mongo ?? 'unknown'), redis: String(dep?.redis ?? 'unknown'),
                degradedSections: (h.degradedSections ?? []) as string[],
                red: h.red?.status === 'ok' ? { requests: h.red.requests, errors5xx: h.red.errors5xx, errorRate: h.red.errorRate } : null,
            }
        },
        async alerts() {
            const now = new Date(nowMs())
            const rows: any[] = await alertModel.find({ status: 'firing', shadow: { $ne: true }, $or: [{ mutedUntil: null }, { mutedUntil: { $lte: now } }] })
                .select({ ruleId: 1, scopeKey: 1, level: 1, detail: 1, firstFiredAt: 1 }).sort({ lastSeenAt: -1 }).limit(MAX_ROWS).maxTimeMS(QT).lean()
            return rows.map((a) => ({ ruleId: String(a.ruleId), scopeKey: String(a.scopeKey), level: a.level === 'critical' ? 'critical' as const : 'warning' as const, detail: a.detail ?? {}, firstFiredAt: a.firstFiredAt ?? null }))
        },
        async slowQueries() {
            const [h1, h24] = await Promise.all([buildSlowQueries({ applicationDB, range: '1h' }), buildSlowQueries({ applicationDB, range: '24h' })])
            const sum = (x: { items: Array<{ count: number }> }) => x.items.reduce((a, b) => a + b.count, 0)
            const last1h = sum(h1)
            return { last1h, prev23hAvgPerHour: Math.max(0, sum(h24) - last1h) / 23, firstAt: null }
        },
        async orderSync() {
            const rows: any[] = await clientModel.find({ status: 'ACTIVE', lastSuccessfulOrderSync: { $lte: new Date(nowMs() - 6 * HOUR_MS) } })
                .select({ clientId: 1, order: 1, title: 1, lastSuccessfulOrderSync: 1 }).sort({ lastSuccessfulOrderSync: 1 }).limit(MAX_ROWS).maxTimeMS(QT).lean()
            return rows.map((c) => ({ tid: tidOfClient(c) as number, name: typeof c.title === 'string' ? c.title : null, at: new Date(c.lastSuccessfulOrderSync) }))
        },
        trialEnding: () => subRows({ status: 'trialing', trialEndsAt: { $lte: new Date(nowMs() + 3 * DAY_MS) } }, { trialEndsAt: 1 }, 'trialEndsAt'),
        suspended: () => subRows({ status: 'suspended' }, { updatedAt: 1 }, 'updatedAt'),
        pastDue: () => subRows({ status: 'past_due' }, { graceUntil: 1 }, 'updatedAt') as Promise<Array<TenantAt & { graceUntil: Date | null }>>,
        async deletionPending() {
            const rows: any[] = await clientModel.find({ status: 'DELETION_PENDING' }).select({ clientId: 1, order: 1, title: 1, deletionScheduledAt: 1 }).sort({ deletionScheduledAt: 1 }).limit(MAX_ROWS).maxTimeMS(QT).lean()
            return rows.map((c) => ({ tid: tidOfClient(c) as number, name: typeof c.title === 'string' ? c.title : null, at: c.deletionScheduledAt ? new Date(c.deletionScheduledAt) : null }))
        },
        async lifecycleFailed() {
            const rows: any[] = await clientModel.find({ status: { $in: ['PROVISIONING_FAILED', 'PURGE_FAILED'] } }).select({ clientId: 1, order: 1, title: 1, status: 1, provisioning: 1 }).limit(MAX_ROWS).maxTimeMS(QT).lean()
            return rows.map((c) => ({ tid: tidOfClient(c) as number, name: typeof c.title === 'string' ? c.title : null, at: c.provisioning?.failedAt ? new Date(c.provisioning.failedAt) : null, status: String(c.status) }))
        },
        async tickets() {
            // Açık (OPEN) ve müşteri yanıtladı/destek bekliyor (IN_PROGRESS) talepler; tenant başına EN ESKİ talep. İçerik/konu okunmaz.
            const rows: any[] = await ticketModel.find({ status: { $in: ['OPEN', 'IN_PROGRESS'] }, createdDate: { $lte: nowMs() - 24 * HOUR_MS } }).select({ clientId: 1, createdDate: 1 }).sort({ createdDate: 1 }).limit(MAX_ROWS).maxTimeMS(QT).lean()
            const oldest = new Map<number, number>()
            for (const r of rows) if (!oldest.has(Number(r.clientId))) oldest.set(Number(r.clientId), Number(r.createdDate))
            const nm = await names([...oldest.keys()])
            return [...oldest.entries()].map(([tid, at]) => ({ tid, name: nm.get(tid) ?? null, at: new Date(at) }))
        },
    }
}
