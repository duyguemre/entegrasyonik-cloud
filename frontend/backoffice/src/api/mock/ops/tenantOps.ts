/**
 * Sahte BE-01 `BackofficeTenantService/listTenants` + BE-02 `getHealthSummary` (API_BACKOFFICE_ATTENTION.md). Şekil birebir:
 * strict girdi, süzgeç + sıralama sunucuda (tüm tenant), sonra ofset imleçle sayfalama; Redis yokken (`ctx.degraded`)
 * `failedJobs` yalnız DLQ ve `opsDegraded`/`degradedSections` dolu. Veri örnek müşterilerle (101..112) ve motor/uyarı
 * örnekleriyle tutarlıdır: #104 ve #107 sorunlu, #102 sakin.
 */
import type { ListTenantsResponse, TenantHealthSummary, TenantOpsRow, TenantSortBy } from '../../contracts/ops'
import { HOUR, MIN, UNHANDLED, iso, notFound, page, strict, validation, type MockCtx, type MockDomain } from './context'

const SUB_STATUSES = ['trialing', 'active', 'past_due', 'suspended', 'canceled', 'expired'] as const
const SORTS: TenantSortBy[] = ['tid', 'name', 'openIssues', 'lastErrorAt', 'failedJobs24h']

/** Abonelik örnekleri (ops/billing.ts SEEDS ile aynı sıra: 101..112). */
const SUBS: Array<{ status: (typeof SUB_STATUSES)[number]; plan: string }> = [
  { status: 'active', plan: 'growth' },
  { status: 'active', plan: 'enterprise' },
  { status: 'trialing', plan: 'starter' },
  { status: 'active', plan: 'growth' },
  { status: 'past_due', plan: 'starter' },
  { status: 'active', plan: 'growth' },
  { status: 'active', plan: 'growth' },
  { status: 'trialing', plan: 'starter' },
  { status: 'suspended', plan: 'starter' },
  { status: 'active', plan: 'starter' },
  { status: 'canceled', plan: 'starter' },
  { status: 'active', plan: 'growth' },
]

/** Açık sorun grubu havuzu (log sahnesindeki gruplarla aynı parmak izleri). */
const ISSUES = {
  A: { fp: 'adapter::trendyol::RATE_LIMITED::a1f3', module: 'adapter-trendyol', code: 'RATE_LIMITED', integrationCode: 'trendyol', mins: 4, count: 38 },
  B: { fp: 'adapter::hepsiburada::AUTH::b7c2', module: 'adapter-hepsiburada', code: 'AUTH', integrationCode: 'hepsiburada', mins: 31, count: 12 },
  C: { fp: 'worker::order::UNKNOWN_OUTCOME::c9d4', module: 'worker-order', code: 'UNKNOWN_OUTCOME', integrationCode: 'n11', mins: 95, count: 7 },
  D: { fp: 'engine::catalog::VALIDATION::d2e8', module: 'engine-catalog', code: 'VALIDATION', integrationCode: 'pazarama', mins: 22, count: 19 },
  E: { fp: 'webhook::trendyol::VALIDATION::e5a1', module: 'webhook-trendyol', code: 'VALIDATION', integrationCode: 'trendyol', mins: 9, count: 5 },
  F: { fp: 'api::billing::INTERNAL::a8c3', module: 'api-billing', code: 'INTERNAL', integrationCode: null, mins: 300, count: 2 },
  G: { fp: 'legacy-console::catalog::UNKNOWN::d7f4', module: 'legacy-console', code: 'UNKNOWN', integrationCode: 'ideasoft', mins: 540, count: 3 },
  H: { fp: 'adapter::n11::UNAVAILABLE::c6e2', module: 'adapter-n11', code: 'UNAVAILABLE', integrationCode: 'n11', mins: 60, count: 9 },
} as const
type IssueKey = keyof typeof ISSUES

interface TenantSeed {
  issues: IssueKey[]
  /** Son 24 sa başarısız iş: BullMQ + DLQ (DLQ = elle inceleme bekleyen). */
  bullmq: number
  dlq: number
  /** Son hata çağrısı kaç dk önce (null = son 7 günde yok). */
  lastErrorMin: number | null
}
const SEEDS: Record<number, TenantSeed> = {
  101: { issues: ['A'], bullmq: 0, dlq: 0, lastErrorMin: 300 },
  102: { issues: [], bullmq: 0, dlq: 0, lastErrorMin: null },
  103: { issues: ['H'], bullmq: 1, dlq: 0, lastErrorMin: 2 },
  104: { issues: ['A', 'D', 'H'], bullmq: 5, dlq: 1, lastErrorMin: 12 },
  105: { issues: ['F'], bullmq: 0, dlq: 0, lastErrorMin: 26 * 60 },
  106: { issues: [], bullmq: 0, dlq: 0, lastErrorMin: null },
  107: { issues: ['A', 'C', 'D', 'H'], bullmq: 12, dlq: 2, lastErrorMin: 1 },
  108: { issues: [], bullmq: 0, dlq: 0, lastErrorMin: null },
  109: { issues: ['G'], bullmq: 0, dlq: 0, lastErrorMin: 9 * 60 },
  110: { issues: ['B', 'H'], bullmq: 1, dlq: 1, lastErrorMin: 30 },
  111: { issues: ['D'], bullmq: 0, dlq: 0, lastErrorMin: 4 * 60 },
  112: { issues: ['A', 'E'], bullmq: 1, dlq: 0, lastErrorMin: 9 },
}
const CALM: TenantSeed = { issues: [], bullmq: 0, dlq: 0, lastErrorMin: null }

/** Entegrasyon çağrısı hatası alan (son başarılı çağrısı olmayan) örnekler: tid → kodlar. */
const NO_SUCCESS: Record<number, string[]> = { 107: ['trendyol'], 110: ['hepsiburada'] }
/** Firing uyarılar (ops/notifications.ts ile aynı): tid → uyarı. */
const FIRING: Record<number, Array<{ ruleId: string; scopeKey: string; level: 'critical' | 'warning'; mins: number; muteHours?: number }>> = {
  107: [{ ruleId: 'R1', scopeKey: 'trendyol:107', level: 'critical', mins: 52 }],
  103: [{ ruleId: 'R2', scopeKey: 'auth:n11:103', level: 'critical', mins: 180, muteHours: 5 }],
}

const seedOf = (tid: number) => SEEDS[tid] ?? CALM

export function createTenantOpsMock(_t0: number): MockDomain {
  function row(ctx: MockCtx, c: MockCtx['clients'][number]): TenantOpsRow & { _failed: number } {
    const s = seedOf(c.clientId)
    const sub = SUBS[c.clientId - 101]
    const failed = ctx.degraded ? s.dlq : s.bullmq + s.dlq
    return {
      tid: c.clientId,
      name: c.title,
      status: c.status,
      ops: {
        planCode: sub?.plan ?? null,
        subscriptionStatus: sub?.status ?? null,
        openIssues: s.issues.length,
        openIssuesApprox: true,
        failedJobs24h: failed,
        lastErrorAt: s.lastErrorMin === null ? null : iso(ctx.t0 - s.lastErrorMin * MIN),
      },
      _failed: failed,
    }
  }

  function listTenants(body: Record<string, unknown>, ctx: MockCtx): ListTenantsResponse {
    strict(body, ['hasIssues', 'subscriptionStatus', 'status', 'q', 'sortBy', 'sortDir', 'cursor', 'limit'])
    if (body.hasIssues !== undefined && typeof body.hasIssues !== 'boolean') throw validation('hasIssues', 'boolean olmalı')
    const subs = body.subscriptionStatus
    if (subs !== undefined && (!Array.isArray(subs) || subs.length > 6 || subs.some((x) => !(SUB_STATUSES as readonly unknown[]).includes(x)))) throw validation('subscriptionStatus', 'geçerli abonelik durumları (≤ 6)')
    const status = body.status
    if (status !== undefined && (!Array.isArray(status) || status.length > 10 || status.some((x) => typeof x !== 'string'))) throw validation('status', 'metin dizisi (≤ 10)')
    if (body.q !== undefined && (typeof body.q !== 'string' || body.q.length > 60)) throw validation('q', '≤ 60 karakter')
    if (body.sortBy !== undefined && !SORTS.includes(body.sortBy as TenantSortBy)) throw validation('sortBy', 'geçersiz sıralama alanı')
    if (body.sortDir !== undefined && body.sortDir !== 'asc' && body.sortDir !== 'desc') throw validation('sortDir', 'asc | desc')

    const sortBy = (body.sortBy as TenantSortBy | undefined) ?? 'tid'
    const dir = (body.sortDir as 'asc' | 'desc' | undefined) ?? (sortBy === 'tid' || sortBy === 'name' ? 'asc' : 'desc')
    const scanned = ctx.clients.length
    const needle = typeof body.q === 'string' ? body.q.toLocaleLowerCase('tr') : ''
    const dayAgo = ctx.t0 - 24 * HOUR

    let rows = ctx.clients.map((c) => row(ctx, c))
    rows = rows.filter((r) => {
      if (body.hasIssues === true && !(r.ops.openIssues > 0 || r.ops.failedJobs24h > 0 || (r.ops.lastErrorAt !== null && Date.parse(r.ops.lastErrorAt) >= dayAgo))) return false
      if (Array.isArray(subs) && subs.length && !(r.ops.subscriptionStatus && subs.includes(r.ops.subscriptionStatus))) return false
      if (Array.isArray(status) && status.length && !status.includes(r.status)) return false
      if (needle && !r.name.toLocaleLowerCase('tr').includes(needle)) return false
      return true
    })
    const key = (r: TenantOpsRow): number | string =>
      sortBy === 'name' ? r.name : sortBy === 'openIssues' ? r.ops.openIssues : sortBy === 'failedJobs24h' ? r.ops.failedJobs24h : sortBy === 'lastErrorAt' ? (r.ops.lastErrorAt ? Date.parse(r.ops.lastErrorAt) : 0) : r.tid
    const sign = dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      const ka = key(a)
      const kb = key(b)
      const cmp = typeof ka === 'string' ? ka.localeCompare(String(kb), 'tr') : (ka as number) - (kb as number)
      return cmp * sign || a.tid - b.tid
    })
    const { items, nextCursor } = page(
      rows.map(({ _failed: _f, ...r }) => r),
      { cursor: body.cursor, limit: body.limit },
    )
    return { items, nextCursor, scanned, scanTruncated: false, opsDegraded: ctx.degraded ? ['failedJobs'] : [] }
  }

  function healthSummary(body: Record<string, unknown>, ctx: MockCtx): TenantHealthSummary {
    strict(body, ['tid'])
    const tid = body.tid
    if (typeof tid !== 'number' || !Number.isInteger(tid) || tid < 1) throw validation('tid', 'pozitif tam sayı olmalı')
    const client = ctx.clients.find((c) => c.clientId === tid)
    if (!client) throw notFound('Müşteri bulunamadı.')
    const s = seedOf(tid)
    const noSuccess = NO_SUCCESS[tid] ?? []
    const lastSyncAt: Record<string, string | null> = {}
    ;(client.integrations ?? []).forEach((i, n) => {
      lastSyncAt[i.integrationCode] = noSuccess.includes(i.integrationCode) || !client.lastSuccessfulOrderSync ? null : iso(ctx.t0 - (3 + n * 2) * MIN)
    })
    return {
      tid,
      generatedAt: iso(ctx.now),
      openIssues: {
        approx: true,
        items: s.issues
          .map((k) => ISSUES[k])
          .sort((a, b) => a.mins - b.mins)
          .map((i) => ({ fp: i.fp, module: i.module, code: i.code, integrationCode: i.integrationCode, lastSeen: iso(ctx.t0 - i.mins * MIN), count: i.count, status: 'open' })),
      },
      failedJobs: ctx.degraded ? { bullmq: null, dlq: s.dlq, bullmqAvailable: false } : { bullmq: s.bullmq, dlq: s.dlq, bullmqAvailable: true },
      lastSyncAt,
      lastOrderSyncAt: client.lastSuccessfulOrderSync ?? null,
      alerts: (FIRING[tid] ?? []).map((a) => ({ ruleId: a.ruleId, scopeKey: a.scopeKey, level: a.level, status: 'firing', firstFiredAt: iso(ctx.t0 - a.mins * MIN), lastSeenAt: iso(ctx.t0 - MIN), mutedUntil: a.muteHours ? iso(ctx.t0 + a.muteHours * HOUR) : null })),
      degradedSections: ctx.degraded ? [{ section: 'failedJobs', error: 'error' }] : [],
    }
  }

  return {
    handle(op, body, ctx) {
      switch (op) {
        case 'BackofficeTenantService/listTenants':
          return listTenants(body, ctx)
        case 'BackofficeTenantService/getHealthSummary':
          return healthSummary(body, ctx)
        default:
          return UNHANDLED
      }
    },
  }
}
