// Aşama 4 uçları: sahte API yanıtları sözleşme şekline birebir uyar (fazla alan yok), imleçli sayfalama, strict gövde,
// gerekçe + step-up, LIVE_READONLY (423), Redis düşük (503) ve sızıntı kuralları. Kaynak: docs/cloud-contracts/API_BACKOFFICE_*.md.
import { describe, expect, it } from 'vitest'
import { createAdminApi } from '../src/api/client'
import { createMockAdapter } from '../src/api/mock/adapter'
import { MockAdminServer } from '../src/api/mock/server'
import { MOCK_ACCOUNTS } from '../src/api/mock/data'
import { MOCK_INVITE_TOKEN } from '../src/api/mock/ops'

type Shape = Record<string, string>
/** Alan → tip ('?' isteğe bağlı; 'null|x' null olabilir). Tanımsız alan varsa düşer. */
function conforms(obj: unknown, shape: Shape, where: string) {
  const o = obj as Record<string, unknown>
  const keys = Object.keys(shape).map((k) => k.replace('?', ''))
  for (const key of Object.keys(o)) expect(keys, `${where}: fazla alan ${key}`).toContain(key)
  for (const [k, type] of Object.entries(shape)) {
    const key = k.replace('?', '')
    const v = o[key]
    if (v === undefined) {
      expect(k.endsWith('?'), `${where}: eksik ${key}`).toBe(true)
      continue
    }
    const actual = v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v
    expect(type.split('|'), `${where}.${key} = ${actual}`).toContain(actual)
  }
}
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

async function signedIn(opts: { reauth?: boolean } = {}) {
  const server = new MockAdminServer()
  const api = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
  await api.call('BackofficeAuthService/login', { email: MOCK_ACCOUNTS.enrolled.email, password: MOCK_ACCOUNTS.password })
  await api.call('BackofficeAuthService/verifyTotp', { code: '123456' })
  if (opts.reauth === false) server.expireReauth()
  return { api, server }
}
const REASON = 'Destek kaydı #örnek: test gerekçesi'

describe('B7 motor ve kuyruklar', () => {
  it('getQueues: sayaçlar + 25 noktalı saatlik seri; Redis düşükken available:false, counts:null (200)', async () => {
    const { api, server } = await signedIn()
    const res = await api.call('BackofficeEngineService/getQueues', {})
    conforms(res, { generatedAt: 'string', queues: 'array' }, 'getQueues')
    const q = res.queues[0]
    conforms(q, { name: 'string', available: 'boolean', counts: 'object|null', dlq: 'object', metrics: 'object' }, 'queue')
    conforms(q.counts, { wait: 'number', active: 'number', delayed: 'number', failed: 'number', completed: 'number', paused: 'number' }, 'counts')
    expect(q.metrics.series).toHaveLength(25)
    for (const p of q.metrics.series) conforms(p, { t: 'string', count: 'number', failed: 'number', retried: 'number', waitMsP95Max: 'number|null', procMsP95Max: 'number|null' }, 'series')
    server.setDegraded(true)
    const down = await api.call('BackofficeEngineService/getQueues', {})
    expect(down.queues[0].available).toBe(false)
    expect(down.queues[0].counts).toBeNull()
  })

  it('listFailedJobs: imleçli (tekrarsız, son sayfada null), DLQ şekli, bozuk imleç 400, Redis düşük 503', async () => {
    const { api, server } = await signedIn()
    const seen = new Set<string>()
    let cursor: string | undefined
    let pages = 0
    do {
      const res = await api.call('BackofficeEngineService/listFailedJobs', { queue: 'order-sync-queue', cursor, limit: 10 })
      conforms(res, { source: 'string', queue: 'string', items: 'array', nextCursor: 'string|null' }, 'listFailedJobs')
      for (const j of res.items) {
        conforms(j, { id: 'string', operation: 'string', tenantId: 'number|null', integrationCode: 'string|null', errorCode: 'string', attemptsMade: 'number', maxAttempts: 'number', failedAt: 'string', enqueuedAt: 'string', reqId: 'string|null', traceId: 'null' }, 'job')
        expect(seen.has(j.id)).toBe(false)
        seen.add(j.id)
      }
      cursor = res.nextCursor ?? undefined
      pages++
    } while (cursor && pages < 10)
    expect(seen.size).toBe(37)
    const dlq = await api.call('BackofficeEngineService/listFailedJobs', { queue: 'order-sync-queue', source: 'dlq' })
    for (const d of dlq.items) conforms(d, { id: 'string', originalJobId: 'string', tenantId: 'number|null', integrationCode: 'string|null', errorCode: 'string', dlqType: 'string', status: 'string', failedAt: 'string', reqId: 'string|null', traceId: 'null' }, 'dlq')
    await expect(api.call('BackofficeEngineService/listFailedJobs', { queue: 'order-sync-queue', cursor: 'bozuk' })).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
    await expect(api.call('BackofficeEngineService/listFailedJobs', { queue: 'order-sync-queue', payload: 1 } as never)).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
    server.setDegraded(true)
    await expect(api.call('BackofficeEngineService/listFailedJobs', { queue: 'order-sync-queue' })).rejects.toMatchObject({ status: 503, code: 'QUEUE_UNAVAILABLE' })
    // DLQ Mongo'dan okunur: Redis düşükken de gelir.
    expect((await api.call('BackofficeEngineService/listFailedJobs', { queue: 'order-sync-queue', source: 'dlq' })).items.length).toBeGreaterThan(0)
  })

  it('retryJob/discardJob: gerekçe <10 → 400, step-up yoksa 401 REAUTH_REQUIRED, LIVE_READONLY yalnız retry 423, bilinmeyen 404', async () => {
    const { api, server } = await signedIn()
    const first = (await api.call('BackofficeEngineService/listFailedJobs', { queue: 'order-sync-queue' })).items[0]
    await expect(api.call('BackofficeEngineService/retryJob', { queue: 'order-sync-queue', jobId: first.id, reason: 'kısa' })).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
    server.setLiveReadonly(true)
    await expect(api.call('BackofficeEngineService/retryJob', { queue: 'order-sync-queue', jobId: first.id, reason: REASON })).rejects.toMatchObject({ status: 423, code: 'LIVE_READONLY' })
    const discarded = await api.call('BackofficeEngineService/discardJob', { queue: 'order-sync-queue', jobId: first.id, reason: REASON })
    conforms(discarded, { queue: 'string', jobId: 'string', discarded: 'boolean' }, 'discardJob')
    server.setLiveReadonly(false)
    await expect(api.call('BackofficeEngineService/retryJob', { queue: 'order-sync-queue', jobId: first.id, reason: REASON })).rejects.toMatchObject({ status: 404, code: 'JOB_NOT_FOUND' })
    await expect(api.call('BackofficeEngineService/retryJob', { queue: 'order-sync-queue', jobId: 'push-status-active', reason: REASON })).rejects.toMatchObject({ status: 409, code: 'JOB_NOT_FAILED' })
    server.expireReauth()
    const second = (await api.call('BackofficeEngineService/listFailedJobs', { queue: 'order-sync-queue' })).items[0]
    const err = await api.call('BackofficeEngineService/retryJob', { queue: 'order-sync-queue', jobId: second.id, reason: REASON }).catch((e) => e)
    // Diyalog kancası yok → istemci iptal edildi olarak işaretler.
    expect(err).toMatchObject({ status: 401, code: 'REAUTH_REQUIRED', cancelled: true })
  })

  it('getStateMachineJobs + releaseStuckLease (previousOwner, 409 sağlıklı kira, 404)', async () => {
    const { api } = await signedIn()
    const sm = await api.call('BackofficeEngineService/getStateMachineJobs', {})
    conforms(sm, { generatedAt: 'string', leaseTimeoutMs: 'object', exportSignals: 'object', importJobs: 'object', stuckLeases: 'array', stuckLeaseCount: 'number', stuckListTruncated: 'boolean' }, 'sm')
    for (const l of sm.stuckLeases) {
      conforms(l, { kind: 'string', id: 'string', tenantId: 'number|null', integrationCode: 'string|null', status: 'string', lockedBy: 'string', leaseExpiredAt: 'string|null', lastActivityAt: 'string|null', staleForMs: 'number' }, 'lease')
      expect(l.id).toMatch(/^[a-f0-9]{24}$/)
    }
    const l = sm.stuckLeases[0]
    const rel = await api.call('BackofficeEngineService/releaseStuckLease', { kind: l.kind, id: l.id, reason: REASON })
    expect(rel).toEqual({ kind: l.kind, id: l.id, released: true, previousOwner: l.lockedBy })
    expect((await api.call('BackofficeEngineService/getStateMachineJobs', {})).stuckLeaseCount).toBe(sm.stuckLeaseCount - 1)
    await expect(api.call('BackofficeEngineService/releaseStuckLease', { kind: l.kind, id: l.id, reason: REASON })).rejects.toMatchObject({ status: 404 })
  })

  it('listJobRuns: states yalnız ilk sayfada, filtre, imleç', async () => {
    const { api } = await signedIn()
    const p1 = await api.call('BackofficeEngineService/listJobRuns', { limit: 20 })
    conforms(p1, { items: 'array', nextCursor: 'string|null', retentionDays: 'number', 'states?': 'array' }, 'listJobRuns')
    expect(p1.states!.length).toBeGreaterThan(3)
    for (const s of p1.states!) conforms(s, { job: 'string', lastStatus: 'string|null', lastStartedAt: 'string|null', lastFinishedAt: 'string|null', lastSuccessAt: 'string|null', lastDurationMs: 'number|null', consecutiveFailures: 'number', runningSince: 'string|null', heartbeatAt: 'string|null', pod: 'string|null', expectedIntervalMs: 'number|null', overdue: 'boolean' }, 'state')
    for (const r of p1.items) conforms(r, { id: 'string', job: 'string', runType: 'string', trigger: 'string', status: 'string', startedAt: 'string', finishedAt: 'string|null', durationMs: 'number|null', counts: 'object', skippedReason: 'string|null', error: 'object|null', scope: 'object', corrId: 'string|null', pod: 'string|null' }, 'run')
    const p2 = await api.call('BackofficeEngineService/listJobRuns', { limit: 20, cursor: p1.nextCursor! })
    expect(p2.states).toBeUndefined()
    const failed = await api.call('BackofficeEngineService/listJobRuns', { status: 'failed' })
    expect(failed.items.length).toBeGreaterThan(0)
    expect(failed.items.every((r) => r.status === 'failed' && r.error)).toBe(true)
  })
})

describe('B4 abonelikler + B2 yaşam döngüsü', () => {
  it('listSubscriptions şekli (kart yalnız maskeli, sağlayıcı ref yok), filtre, imleç, boş durum', async () => {
    const { api } = await signedIn()
    const all = await api.call('BackofficeBillingService/listSubscriptions', { limit: 5 })
    expect(all.items).toHaveLength(5)
    expect(all.nextCursor).toBeTruthy()
    for (const s of all.items) {
      conforms(s, {
        tid: 'number', tenantName: 'string|null', planCode: 'string', planVersion: 'number', status: 'string', trialEndsAt: 'string|null',
        currentPeriodStart: 'string|null', currentPeriodEnd: 'string|null', cancelAtPeriodEnd: 'boolean', graceUntil: 'string|null', billingExempt: 'boolean',
        provider: 'string', hasProviderRef: 'boolean', cardLast4: 'string|null', cardBrand: 'string|null', createdAt: 'string', updatedAt: 'string',
      }, `sub ${s.tid}`)
      if (s.cardLast4) expect(s.cardLast4).toMatch(/^\d{4}$/)
    }
    const trialing = await api.call('BackofficeBillingService/listSubscriptions', { status: 'trialing' })
    expect(trialing.items.every((s) => s.status === 'trialing')).toBe(true)
    expect(await api.call('BackofficeBillingService/listSubscriptions', { status: 'expired' })).toEqual({ items: [], nextCursor: null })
  })

  it('getSubscription + extendTrial/changePlan/cancel kuralları (409 kodları, 423, 404)', async () => {
    const { api, server } = await signedIn()
    const d = await api.call('BackofficeBillingService/getSubscription', { tid: 103 })
    expect(d.subscription.plan).toMatchObject({ code: 'starter', currency: 'TRY' })
    for (const e of d.events) conforms(e, { id: 'string', at: 'string', provider: 'string', type: 'string', status: 'string', failureReason: 'string|null', payload: 'object|null' }, 'event')
    const ext = await api.call('BackofficeBillingService/extendTrial', { tid: 103, days: 7, reason: REASON })
    conforms(ext, { tid: 'number', status: 'string', trialEndsAt: 'string', previousTrialEndsAt: 'string|null', extendedDays: 'number', totalExtensionDays: 'number', remainingExtensionDays: 'number', reopened: 'boolean' }, 'extendTrial')
    // 103 örnekte 45 gün kullanmış: 7 gün sonra toplam 52, kalan 8.
    expect(ext).toMatchObject({ totalExtensionDays: 52, remainingExtensionDays: 8, reopened: false })
    expect(Date.parse(ext.trialEndsAt) - Date.parse(ext.previousTrialEndsAt!)).toBe(7 * 86_400_000)
    expect((await api.call('BackofficeBillingService/getSubscription', { tid: 103 })).events[0].type).toBe('subscription.trial_extended')
    await expect(api.call('BackofficeBillingService/extendTrial', { tid: 101, days: 7, reason: REASON })).rejects.toMatchObject({ status: 409, code: 'TRIAL_NOT_ACTIVE' })
    await expect(api.call('BackofficeBillingService/extendTrial', { tid: 103, days: 31, reason: REASON })).rejects.toMatchObject({ status: 400 })
    await expect(api.call('BackofficeBillingService/changePlan', { tid: 101, planCode: 'growth', reason: REASON })).rejects.toMatchObject({ code: 'SAME_PLAN' })
    await expect(api.call('BackofficeBillingService/changePlan', { tid: 101, planCode: 'enterprise', reason: REASON })).rejects.toMatchObject({ code: 'PLAN_REQUIRES_QUOTE' })
    server.setLiveReadonly(true)
    await expect(api.call('BackofficeBillingService/changePlan', { tid: 101, planCode: 'starter', reason: REASON })).rejects.toMatchObject({ status: 423 })
    server.setLiveReadonly(false)
    expect(await api.call('BackofficeBillingService/changePlan', { tid: 101, planCode: 'starter', reason: REASON })).toEqual({ tid: 101, status: 'active', planCode: 'starter', planVersion: 1 })
    const c = await api.call('BackofficeBillingService/cancelSubscription', { tid: 101, atPeriodEnd: true, reason: REASON })
    conforms(c, { tid: 'number', status: 'string', cancelAtPeriodEnd: 'boolean', currentPeriodEnd: 'string|null', external: 'boolean' }, 'cancelSubscription')
    expect(c).toMatchObject({ tid: 101, status: 'active', cancelAtPeriodEnd: true, external: true })
    await expect(api.call('BackofficeBillingService/getSubscription', { tid: 999 })).rejects.toMatchObject({ status: 404, code: 'SUBSCRIPTION_NOT_FOUND' })
  })

  it('K40: toplam uzatma ≤60 gün (409 TRIAL_EXTENSION_LIMIT + details), askıdaki kartsız deneme yeniden açılır', async () => {
    const { api } = await signedIn()
    // 103: 45 gün kullanılmış → 16 gün reddedilir, ayrıntı sayısal.
    const err = await api.call('BackofficeBillingService/extendTrial', { tid: 103, days: 16, reason: REASON }).catch((e) => e)
    expect(err).toMatchObject({ status: 409, code: 'TRIAL_EXTENSION_LIMIT', details: { remainingDays: 15, usedDays: 45, maxTotalDays: 60 } })
    expect(await api.call('BackofficeBillingService/extendTrial', { tid: 103, days: 15, reason: REASON })).toMatchObject({ totalExtensionDays: 60, remainingExtensionDays: 0 })
    await expect(api.call('BackofficeBillingService/extendTrial', { tid: 103, days: 1, reason: REASON })).rejects.toMatchObject({ code: 'TRIAL_EXTENSION_LIMIT', details: { remainingDays: 0 } })
    // 109: denemesi bitmiş, askıda, kartsız → uzatma yeniden `trialing` yapar; yeni bitiş şimdi + gün.
    const before = await api.call('BackofficeBillingService/getSubscription', { tid: 109 })
    expect(before.subscription).toMatchObject({ status: 'suspended', hasProviderRef: false })
    const r = await api.call('BackofficeBillingService/extendTrial', { tid: 109, days: 10, reason: REASON })
    expect(r).toMatchObject({ status: 'trialing', reopened: true, extendedDays: 10, totalExtensionDays: 10, remainingExtensionDays: 50 })
    expect(Date.parse(r.trialEndsAt)).toBeGreaterThan(Date.now() + 9 * 86_400_000)
    const after = await api.call('BackofficeBillingService/getSubscription', { tid: 109 })
    expect(after.subscription.status).toBe('trialing')
    expect(after.events[0]).toMatchObject({ type: 'subscription.trial_extended', payload: { reopened: true, totalExtensionDays: 10 } })
    // Muaf ve kartlı-aktif abonelik uzatılamaz.
    await expect(api.call('BackofficeBillingService/extendTrial', { tid: 104, days: 1, reason: REASON })).rejects.toMatchObject({ code: 'SUBSCRIPTION_EXEMPT' })
  })

  it('K40: kartsız abonelikte iptal yerel ve doğrudan (external:false, LIVE_READONLY etkilemez); kartlıda 423', async () => {
    const { api, server } = await signedIn()
    server.setLiveReadonly(true)
    const local = await api.call('BackofficeBillingService/cancelSubscription', { tid: 103, atPeriodEnd: true, reason: REASON })
    expect(local).toMatchObject({ tid: 103, status: 'canceled', cancelAtPeriodEnd: false, external: false })
    await expect(api.call('BackofficeBillingService/cancelSubscription', { tid: 101, atPeriodEnd: false, reason: REASON })).rejects.toMatchObject({ status: 423 })
    server.setLiveReadonly(false)
    expect(await api.call('BackofficeBillingService/cancelSubscription', { tid: 101, atPeriodEnd: false, reason: REASON })).toMatchObject({ status: 'canceled', external: true })
    await expect(api.call('BackofficeBillingService/cancelSubscription', { tid: 103, atPeriodEnd: false, reason: REASON })).rejects.toMatchObject({ code: 'SUBSCRIPTION_NOT_CANCELABLE' })
  })

  it('getRevenueMetrics şekli; oranlar null olabilir; tutarlar kuruş', async () => {
    const { api } = await signedIn()
    for (const range of ['7d', '30d', '90d'] as const) {
      const m = await api.call('BackofficeBillingService/getRevenueMetrics', { range })
      conforms(m, { range: 'string', from: 'string', to: 'string', mrr: 'object', statusDistribution: 'object', exemptSubscriptions: 'number', trialConversion: 'object', churn: 'object', paymentEvents: 'object' }, 'revenue')
      conforms(m.mrr, { byCurrency: 'object', byPlan: 'array', billedSubscriptions: 'number', quoteBasedSubscriptions: 'number', unpricedSubscriptions: 'number' }, 'mrr')
      expect(Object.keys(m.statusDistribution).sort()).toEqual(['active', 'canceled', 'expired', 'past_due', 'suspended', 'trialing'])
      conforms(m.trialConversion, { cohort: 'number', converted: 'number', rate: 'number|null' }, 'trialConversion')
      const sum = m.mrr.byPlan.reduce((s, p) => s + p.mrrMinor, 0)
      expect(m.mrr.byCurrency.TRY ?? 0).toBe(sum)
    }
  })

  it('getLifecycle (B2) şekli, adım sırası; cancelDeletion step-up + gerekçe → ACTIVE; startImpersonation yalnız ACTIVE', async () => {
    const { api } = await signedIn()
    const l = await api.call('BackofficeTenantService/getLifecycle', { tid: 111 })
    expect(l.status).toBe('DELETION_PENDING')
    conforms(l.deletion, { requestedAt: 'string|null', requestedBy: 'string|null', scheduledAt: 'string|null', daysUntilPurge: 'number|null', canCancel: 'boolean', purgedAt: 'string|null', purgeFailedStep: 'string|null' }, 'deletion')
    expect(l.provisioning.steps.map((s) => s.step)).toEqual(['client', 'order-limit', 'central-user', 'tenant-seed', 'tenant-user', 'subscription', 'activate'])
    for (const e of l.recentEvents) conforms(e, { at: 'string', event: 'string', result: 'string', actorType: 'string|null', surface: 'string|null', imp: 'boolean' }, 'recentEvent')
    const failed = await api.call('BackofficeTenantService/getLifecycle', { tid: 108 })
    expect(failed.provisioning.steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'failed', 'pending', 'pending'])
    await expect(api.call('BackofficeTenantService/startImpersonation', { tid: 111, reason: REASON })).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
    expect(await api.call('BackofficeTenantService/cancelDeletion', { tid: 111, reason: REASON })).toEqual({ order: 111, status: 'ACTIVE' })
    await expect(api.call('BackofficeTenantService/cancelDeletion', { tid: 111, reason: REASON })).rejects.toMatchObject({ status: 409 })
    const imp = await api.call('BackofficeTenantService/startImpersonation', { tid: 111, reason: REASON })
    expect(imp.expiresInSeconds).toBe(60)
    expect(imp.url).toMatch(/\/impersonate#t=[0-9a-f]+$/)
    await expect(api.call('BackofficeTenantService/getLifecycle', { tid: 5 })).rejects.toMatchObject({ status: 404 })
  })
})

describe('B5/B6/B8/B9 entegrasyon, altyapı, önbellek', () => {
  it('getApiHealth: p95 kova üst sınırı ya da null, oranlar, azalan sıra', async () => {
    const { api } = await signedIn()
    const h = await api.call('BackofficeIntegrationService/getApiHealth', { range: '24h' })
    conforms(h, { range: 'string', since: 'string', until: 'string', items: 'array' }, 'apiHealth')
    const totals = h.items.map((i) => i.total)
    expect(totals).toEqual([...totals].sort((a, b) => b - a))
    for (const i of h.items) {
      conforms(i, { integrationCode: 'string', total: 'number', errors: 'number', errorRate: 'number|null', errorsByCode: 'array', p95Ms: 'number|null', affectedTenants: 'number' }, i.integrationCode)
      if (i.p95Ms !== null) expect([50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000]).toContain(i.p95Ms)
    }
    await expect(api.call('BackofficeIntegrationService/getApiHealth', { range: '30d' as never })).rejects.toMatchObject({ status: 400 })
  })

  it('getResilienceState şekli; Redis yoksa 503 INFRA_UNAVAILABLE', async () => {
    const { api, server } = await signedIn()
    const r = await api.call('BackofficeIntegrationService/getResilienceState', {})
    for (const it of r.items) for (const c of it.pods) conforms(c, { pod: 'string', observedAt: 'string', circuits: 'object', rate: 'object', lastOpenedAt: 'string|null', intake: 'string' }, 'cell')
    server.setDegraded(true)
    await expect(api.call('BackofficeIntegrationService/getResilienceState', {})).rejects.toMatchObject({ status: 503, code: 'INFRA_UNAVAILABLE' })
  })

  it('getCatalog/getEffectiveConfig: hedef süzgeci; _platform 9 anahtar, bayrak yok; bilinmeyen hedef 404', async () => {
    const { api } = await signedIn()
    const p = await api.call('IntegrationConfigService/getCatalog', { target: '_platform' })
    expect(p.items.map((i) => i.key)).toHaveLength(9)
    expect(p.items.some((i) => i.group === 'platform.features')).toBe(false)
    const e = await api.call('IntegrationConfigService/getCatalog', { target: '_engine' })
    expect(e.items.every((i) => i.scope !== 'integration' && i.scope !== 'platform')).toBe(true)
    const eff = await api.call('IntegrationConfigService/getEffectiveConfig', { target: 'trendyol' })
    for (const v of eff.values) expect(['default', 'legacy', 'platform', 'tenant', 'env']).toContain(v.source)
    await expect(api.call('IntegrationConfigService/getCatalog', { target: 'yok' })).rejects.toMatchObject({ status: 404 })
  })

  it('Redis/Mongo: izinsiz DB adı ve ham anahtar yok; koleksiyon imleci = son ad', async () => {
    const { api } = await signedIn()
    const redis = await api.call('BackofficeInfraService/getRedisStatus', {})
    for (const f of redis.keyFamilies.items) expect(f.family).not.toMatch(/:\d|[0-9a-f]{16}/)
    for (const s of redis.slowlog) expect(Object.keys(s).sort()).toEqual(['at', 'command', 'durationMicros'])
    const mongo = await api.call('BackofficeInfraService/getMongoStatus', {})
    const json = JSON.stringify(mongo)
    expect(json).not.toMatch(/entegrasyonik|mongodb:\/\//i)
    for (const d of mongo.databases) expect(d.label).toMatch(/^(app|tenant #\d+)$/)
    const p1 = await api.call('BackofficeInfraService/getMongoCollections', { db: 'app', limit: 10 })
    expect(p1.nextCursor).toBe(p1.items[9].name)
    const p2 = await api.call('BackofficeInfraService/getMongoCollections', { db: 'app', limit: 10, cursor: p1.nextCursor! })
    expect(p2.items[0].name > p1.items[9].name).toBe(true)
    await expect(api.call('BackofficeInfraService/getMongoCollections', { db: 999 })).rejects.toMatchObject({ status: 404 })
  })

  it('flushCacheFamily: tam ad eşleşmesi, step-up + gerekçe, bilinmeyen aile 404', async () => {
    const { api } = await signedIn()
    const m = await api.call('BackofficeInfraService/getCacheMetrics', {})
    conforms(m, { scope: 'string', pod: 'string', hits: 'number', misses: 'number', keys: 'number', sets: 'number', evictions: 'number', maxKeys: 'number', inflight: 'number', totals: 'object', breakdown: 'array' }, 'cache')
    const fam = m.breakdown[0]
    const res = await api.call('BackofficeInfraService/flushCacheFamily', { family: fam.name, reason: REASON })
    expect(res).toEqual({ family: fam.name, removed: fam.count, scope: 'pod', pod: 'api-1' })
    await expect(api.call('BackofficeInfraService/flushCacheFamily', { family: fam.name.split('.')[0], reason: REASON })).rejects.toMatchObject({ status: 404 })
  })
})

describe('B11 platform ayarları + B12 yöneticiler', () => {
  it('_platform: taslak → önizleme → yayın → geçmiş → geri alma; public-config yalnız public anahtarlar', async () => {
    const { api, server } = await signedIn()
    const before = await api.call('IntegrationConfigService/getEffectiveConfig', { target: '_platform' })
    await expect(api.call('IntegrationConfigService/saveDraft', { target: '_platform', patch: { 'ui.listPageSize': 30 } })).rejects.toMatchObject({ status: 400, code: 'VALIDATION' })
    const draft = await api.call('IntegrationConfigService/saveDraft', { target: '_platform', patch: { 'maintenance.enabled': true, 'maintenance.message': 'Planlı bakım' } })
    conforms(draft, { target: 'string', version: 'number', draftRev: 'number', overrides: 'object' }, 'saveDraft')
    const prev = await api.call('IntegrationConfigService/previewPublish', { target: '_platform' })
    expect(prev.danger).toBe('caution')
    expect(prev.requiresReason).toBe(true)
    expect(prev.diff.map((d) => d.key)).toEqual(['maintenance.enabled', 'maintenance.message'])
    await expect(api.call('IntegrationConfigService/publish', { target: '_platform' })).rejects.toMatchObject({ status: 400 })
    const pub = await api.call('IntegrationConfigService/publish', { target: '_platform', reason: REASON })
    expect(pub.publishedVersion).toBe(before.publishedVersion + 1)
    const cfg = server.handle('GET', '/api/public-config', {}).data as { settings: Record<string, unknown>; env: unknown }
    expect(cfg.settings['maintenance.enabled']).toBe(true)
    expect(Object.keys(cfg.env as object)).toEqual(['images'])
    const hist = await api.call('IntegrationConfigService/history', { target: '_platform', limit: 20 })
    expect(hist[0].version).toBe(pub.version)
    const rb = await api.call('IntegrationConfigService/rollback', { target: '_platform', toVersion: before.publishedVersion, reason: REASON })
    expect(rb.publishedVersion).toBe(pub.version + 1)
    expect((server.handle('GET', '/api/public-config', {}).data as { settings: Record<string, unknown> }).settings['maintenance.enabled']).toBe(false)
  })

  it('yönetici listesi beyaz listeli; kendine işlem 403; son yönetici 409; davet/yenileme; acceptInvite kimliksiz', async () => {
    const { api } = await signedIn()
    const { items } = await api.call('BackofficeAdminUserService/list', {})
    for (const a of items) conforms(a, { sub: 'string', email: 'string', name: 'string', surname: 'string', status: 'string', mfaEnabled: 'boolean', lastLoginAt: 'string|null', locked: 'boolean', createdAt: 'string' }, a.email)
    for (const a of items) expect(a.email.endsWith('.test')).toBe(true)
    const self = items.find((a) => a.email === MOCK_ACCOUNTS.enrolled.email)!
    await expect(api.call('BackofficeAdminUserService/disable', { sub: self.sub, reason: REASON })).rejects.toMatchObject({ status: 403, code: 'ADMIN_SELF_ACTION' })
    const inv = await api.call('BackofficeAdminUserService/invite', { email: 'yeni.aday@ornek.test', reason: REASON })
    expect(inv).toMatchObject({ status: 'invited', renewed: false })
    expect((await api.call('BackofficeAdminUserService/invite', { email: 'yeni.aday@ornek.test', reason: REASON })).renewed).toBe(true)
    await expect(api.call('BackofficeAdminUserService/invite', { email: MOCK_ACCOUNTS.enrolled.email, reason: REASON })).rejects.toMatchObject({ status: 409, code: 'ADMIN_INVITE_EXISTING_USER' })
    expect(await api.call('BackofficeAdminUserService/disable', { sub: inv.sub, reason: REASON })).toEqual({ sub: inv.sub, status: 'revoked' })
    // Oturumsuz davet kabulü.
    const server = new MockAdminServer()
    const anon = createAdminApi({ baseURL: '/admin-api', adapter: createMockAdapter({ server }) })
    await expect(anon.call('BackofficeAuthService/acceptInvite', { token: MOCK_INVITE_TOKEN, name: 'Ada', surname: 'Örnek', password: 'kisa1' })).rejects.toMatchObject({ code: 'WEAK_PASSWORD' })
    expect(await anon.call('BackofficeAuthService/acceptInvite', { token: MOCK_INVITE_TOKEN, name: 'Ada', surname: 'Örnek', password: 'uzun-ornek-parola-2026' })).toEqual({ accepted: true })
    await expect(anon.call('BackofficeAuthService/acceptInvite', { token: MOCK_INVITE_TOKEN, name: 'Ada', surname: 'Örnek', password: 'uzun-ornek-parola-2026' })).rejects.toMatchObject({ status: 400, code: 'ADMIN_INVITE_INVALID' })
  })
})

describe('tarih biçimi', () => {
  it('tüm zaman alanları ISO-8601 (ms + Z)', async () => {
    const { api } = await signedIn()
    const q = await api.call('BackofficeEngineService/getQueues', {})
    expect(q.generatedAt).toMatch(ISO)
    const s = await api.call('BackofficeBillingService/listSubscriptions', {})
    for (const x of s.items) expect(x.createdAt).toMatch(ISO)
  })
})
