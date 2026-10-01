/** Sahte BackofficeEngineService (B7a-d) — sözleşme şekli birebir; yük/hata metni yok (yalnız kod). */
import { RETRY_JOBS_MAX, type DlqRecord, type FailedBullJob, type JobRun, type JobRunStatus, type JobState, type ListFailedJobsResponse, type RetryJobsResponse, type StuckLease } from '../../contract'
import { rng } from '../data'
import { MockHttpError } from '../errors'
import { DAY, HOUR, MIN, UNHANDLED, conflict, hex24, iso, liveReadonly, notFound, page, strict, validation, type MockCtx, type MockDomain } from './context'

const QUEUE = 'order-sync-queue'
const CODES = ['UNAVAILABLE', 'RATE_LIMITED', 'AUTH', 'UNKNOWN_OUTCOME', 'VALIDATION', 'UNKNOWN']
const CHANNELS = ['trendyol', 'hepsiburada', 'n11', 'pazarama']
const OPS = ['fetch-orders', 'push-status', 'push-cargo', 'fetch-claims']
const PODS = ['api-1', 'api-2', 'worker-1']
const JOBS: Array<{ job: string; every: number; failEvery?: number }> = [
  { job: 'stock-sync', every: 5 * MIN, failEvery: 17 },
  { job: 'order-pull', every: 10 * MIN, failEvery: 23 },
  { job: 'metric-flush', every: MIN },
  { job: 'trial-expiry', every: HOUR },
  { job: 'dlq-sweeper', every: 30 * MIN },
  { job: 'catalog-sentinel', every: 15 * MIN, failEvery: 9 },
]

export function createEngineMock(t0: number): MockDomain {
  const r = rng(2026)
  let failed: FailedBullJob[] = Array.from({ length: 37 }, (_, i) => {
    const code = CHANNELS[i % CHANNELS.length]
    const at = t0 - Math.floor(i * 47 * MIN + r() * 20 * MIN)
    return {
      id: `${OPS[i % OPS.length]}-${1200 - i}`,
      operation: `${OPS[i % OPS.length]}-${code}`,
      tenantId: 101 + ((i * 5) % 12),
      integrationCode: code,
      errorCode: CODES[(i * 7) % CODES.length],
      attemptsMade: 5,
      maxAttempts: 5,
      failedAt: iso(at),
      enqueuedAt: iso(at - Math.floor(3 * MIN + r() * 40 * MIN)),
      // BE-04: üçte biri korelasyon kimliği taşımaz (null); periyodik işler `ord_…`, webhook `req_…`.
      reqId: i % 3 === 0 ? null : i % 3 === 1 ? `ord_${hex24(300 + i).slice(0, 12)}` : `req_${hex24(300 + i).slice(0, 12)}`,
      traceId: null,
    }
  })
  /** Toplu denemede "zaten işleniyor" gibi davranan iş (önceki denemede kuyruğa alınmış): JOB_NOT_FAILED, listede kalır. */
  const racing = new Set([failed[12].id])
  const dlq: DlqRecord[] = Array.from({ length: 8 }, (_, i) => ({
    id: hex24(700 + i),
    originalJobId: `fetch-orders-${880 - i * 13}`,
    tenantId: 101 + ((i * 3) % 12),
    integrationCode: CHANNELS[(i + 1) % CHANNELS.length],
    errorCode: i % 3 ? 'AUTH' : 'VALIDATION',
    dlqType: i % 3 ? 'MAX_RETRIES_EXCEEDED' : 'FATAL_ERROR',
    status: i < 5 ? 'PENDING_MANUAL_REVIEW' : 'RESOLVED',
    failedAt: iso(t0 - (i + 1) * 7 * HOUR),
    reqId: i % 2 ? `ord_${hex24(500 + i).slice(0, 12)}` : null,
    traceId: null,
  }))
  let stuck: StuckLease[] = [
    { kind: 'export', id: hex24(901), tenantId: 104, integrationCode: 'trendyol', status: 'PENDING', lockedBy: 'worker-1', leaseExpiredAt: iso(t0 - 45 * MIN), lastActivityAt: iso(t0 - 75 * MIN), staleForMs: 45 * MIN },
    { kind: 'export', id: hex24(902), tenantId: 107, integrationCode: 'pazarama', status: 'SENT', lockedBy: 'api-2', leaseExpiredAt: iso(t0 - 2 * HOUR), lastActivityAt: iso(t0 - 150 * MIN), staleForMs: 2 * HOUR },
    { kind: 'import', id: hex24(903), tenantId: 102, integrationCode: 'n11', status: 'PROCESSING', lockedBy: 'worker-1', leaseExpiredAt: null, lastActivityAt: iso(t0 - 52 * MIN), staleForMs: 52 * MIN },
  ]
  /** Sağlıklı kira örneği: bırakma denemesi 409 LEASE_NOT_STUCK. */
  const healthyLease = hex24(990)

  const runs: JobRun[] = []
  const states: JobState[] = []
  for (const [j, spec] of JOBS.entries()) {
    // Anlamlı turlar: saatte en az bir + başarısız/kısmi/atlama.
    const step = Math.max(spec.every, HOUR)
    let consecutive = 0
    for (let k = 0; k * step < 14 * DAY && k < 120; k++) {
      const start = t0 - k * step - Math.floor(r() * MIN)
      const status: JobRunStatus = spec.failEvery && k % spec.failEvery === 1 ? 'failed' : spec.failEvery && k % spec.failEvery === 4 ? 'partial' : k % 29 === 7 ? 'skipped' : 'ok'
      if (k === 0 && status === 'failed') consecutive = 1
      const dur = Math.floor(200 + r() * (spec.job === 'catalog-sentinel' ? 9000 : 2400))
      runs.push({
        id: hex24(10_000 + j * 1000 + k),
        job: spec.job,
        runType: 'scheduler',
        trigger: 'interval',
        status,
        startedAt: iso(start),
        finishedAt: iso(start + dur),
        durationMs: dur,
        counts: status === 'skipped' ? {} : { processed: Math.floor(r() * 400), ...(status === 'partial' ? { failed: 1 + Math.floor(r() * 6) } : {}) },
        skippedReason: status === 'skipped' ? 'lock_busy' : null,
        error: status === 'failed' ? { code: k % 2 ? 'UNAVAILABLE' : 'RATE_LIMITED', message: 'Dış servis geçici olarak kullanılamıyor.' } : null,
        scope: j === 1 && k % 3 === 0 ? { level: 'tenant', tenantId: 101 + (k % 12), integrationCode: 'trendyol' } : { level: 'platform' },
        corrId: `job_${hex24(k + j).slice(0, 12)}`,
        pod: PODS[(j + k) % PODS.length],
      })
    }
    const last = runs.filter((x) => x.job === spec.job)[0]
    const lastOk = runs.find((x) => x.job === spec.job && x.status === 'ok')
    const overdue = spec.job === 'dlq-sweeper'
    states.push({
      job: spec.job,
      lastStatus: last.status,
      lastStartedAt: overdue ? iso(t0 - 4 * HOUR) : last.startedAt,
      lastFinishedAt: overdue ? iso(t0 - 4 * HOUR + 900) : last.finishedAt,
      lastSuccessAt: lastOk?.finishedAt ?? null,
      lastDurationMs: last.durationMs,
      consecutiveFailures: consecutive,
      runningSince: spec.job === 'metric-flush' ? iso(t0 - 8_000) : null,
      heartbeatAt: spec.job === 'metric-flush' ? iso(t0 - 2_000) : null,
      pod: last.pod,
      expectedIntervalMs: spec.every,
      overdue,
    })
  }
  runs.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))

  function series(ctx: MockCtx) {
    const hourStart = Math.floor(ctx.t0 / HOUR) * HOUR
    return Array.from({ length: 25 }, (_, i) => {
      const t = hourStart - (24 - i) * HOUR
      const hour = new Date(t).getHours()
      const busy = hour >= 9 && hour <= 22
      const count = Math.floor((busy ? 60 : 12) + r() * (busy ? 50 : 10))
      const idle = i === 5 || i === 6
      return {
        t: iso(t),
        count: idle ? 0 : count,
        failed: idle ? 0 : Math.floor(count * (i > 20 ? 0.09 : 0.02)),
        retried: idle ? 0 : Math.floor(count * 0.04),
        waitMsP95Max: idle ? null : Math.floor(120 + r() * (i > 20 ? 1800 : 400)),
        procMsP95Max: idle ? null : Math.floor(600 + r() * 1400),
      }
    })
  }
  const metricSeries = series({ t0 } as MockCtx)

  function checkQueue(body: Record<string, unknown>) {
    if (body.queue !== QUEUE) throw validation('queue', 'bilinmeyen kuyruk')
  }
  function checkJobId(body: Record<string, unknown>) {
    if (typeof body.jobId !== 'string' || !/^[A-Za-z0-9:_.-]{1,128}$/.test(body.jobId)) throw validation('jobId', 'geçersiz iş kimliği')
  }

  return {
    handle(op, body, ctx) {
      switch (op) {
        case 'BackofficeEngineService/getQueues': {
          strict(body, [])
          const failedCount = failed.length
          return {
            generatedAt: iso(ctx.now),
            queues: [
              {
                name: QUEUE,
                available: !ctx.degraded,
                counts: ctx.degraded ? null : { wait: 7, active: 2, delayed: 3, failed: failedCount, completed: 1840, paused: 0 },
                dlq: { pendingReview: dlq.filter((d) => d.status === 'PENDING_MANUAL_REVIEW').length },
                metrics: { resolution: '1h', from: metricSeries[0].t, to: iso(Date.parse(metricSeries[24].t) + HOUR), series: metricSeries },
              },
            ],
          }
        }
        case 'BackofficeEngineService/listFailedJobs': {
          strict(body, ['queue', 'source', 'cursor', 'limit', 'tid', 'integrationCode', 'errorCode'])
          checkQueue(body)
          if (body.tid !== undefined && (!Number.isInteger(body.tid) || (body.tid as number) < 1)) throw validation('tid', 'pozitif tam sayı')
          if (body.integrationCode !== undefined && (typeof body.integrationCode !== 'string' || !/^[a-z0-9_-]{1,32}$/i.test(body.integrationCode))) throw validation('integrationCode', 'geçersiz entegrasyon kodu')
          if (body.errorCode !== undefined && (typeof body.errorCode !== 'string' || !/^[A-Z_]{2,32}$/.test(body.errorCode))) throw validation('errorCode', 'A-Z ve _ (2..32)')
          const source = (body.source as string) ?? 'bullmq'
          if (source !== 'bullmq' && source !== 'dlq') throw validation('source', 'bullmq | dlq')
          if (source === 'bullmq' && ctx.degraded) throw new MockHttpError(503, 'QUEUE_UNAVAILABLE', 'Kuyruk şu an kullanılamıyor.')
          const filter = {
            ...(body.tid !== undefined ? { tid: body.tid as number } : {}),
            ...(body.integrationCode !== undefined ? { integrationCode: body.integrationCode as string } : {}),
            ...(body.errorCode !== undefined ? { errorCode: body.errorCode as string } : {}),
          }
          const base: Array<FailedBullJob | DlqRecord> = source === 'dlq' ? dlq : failed
          const list = base.filter((j) => (filter.tid === undefined || j.tenantId === filter.tid) && (filter.integrationCode === undefined || j.integrationCode === filter.integrationCode) && (filter.errorCode === undefined || j.errorCode === filter.errorCode))
          const res: ListFailedJobsResponse = { source, queue: QUEUE, ...page<FailedBullJob | DlqRecord>(list, body) }
          if (Object.keys(filter).length) res.filter = { tid: filter.tid ?? null, integrationCode: filter.integrationCode ?? null, errorCode: filter.errorCode ?? null }
          if (source === 'bullmq' && Object.keys(filter).length) res.total = list.length
          return res
        }
        case 'BackofficeEngineService/retryJobs': {
          strict(body, ['queue', 'jobIds', 'reason'])
          checkQueue(body)
          const ids = body.jobIds
          if (!Array.isArray(ids) || ids.length < 1 || ids.length > RETRY_JOBS_MAX) throw validation('jobIds', `1..${RETRY_JOBS_MAX} iş kimliği`)
          for (const id of ids) if (typeof id !== 'string' || !/^[A-Za-z0-9:_.-]{1,128}$/.test(id)) throw validation('jobIds', 'geçersiz iş kimliği')
          if (ctx.liveReadonly) throw liveReadonly()
          if (ctx.degraded) throw new MockHttpError(503, 'QUEUE_UNAVAILABLE', 'Kuyruk şu an kullanılamıyor.')
          const results: RetryJobsResponse['results'] = [...new Set(ids as string[])].map((jobId) => {
            if (racing.has(jobId) || jobId === 'push-status-active') return { jobId, ok: false, error: 'JOB_NOT_FAILED' }
            const job = failed.find((j) => j.id === jobId)
            if (!job) return { jobId, ok: false, error: 'JOB_NOT_FOUND' }
            failed = failed.filter((j) => j !== job)
            return { jobId, ok: true }
          })
          const succeeded = results.filter((x) => x.ok).length
          return { queue: QUEUE, requested: results.length, succeeded, failed: results.length - succeeded, results } satisfies RetryJobsResponse
        }
        case 'BackofficeEngineService/retryJob':
        case 'BackofficeEngineService/discardJob': {
          strict(body, ['queue', 'jobId', 'reason'])
          checkQueue(body)
          checkJobId(body)
          const retry = op.endsWith('retryJob')
          if (retry && ctx.liveReadonly) throw liveReadonly()
          if (ctx.degraded) throw new MockHttpError(503, 'QUEUE_UNAVAILABLE', 'Kuyruk şu an kullanılamıyor.')
          const jobId = String(body.jobId)
          if (jobId === 'push-status-active') throw conflict('JOB_NOT_FAILED', 'İş başarısız durumda değil (güncel durum: active).')
          const job = failed.find((j) => j.id === jobId)
          if (!job) throw notFound('İş bulunamadı.', 'JOB_NOT_FOUND')
          failed = failed.filter((j) => j !== job)
          return retry ? { queue: QUEUE, jobId, retried: true } : { queue: QUEUE, jobId, discarded: true }
        }
        case 'BackofficeEngineService/getStateMachineJobs':
          strict(body, [])
          return {
            generatedAt: iso(ctx.now),
            leaseTimeoutMs: { export: 1_800_000, import: 1_800_000 },
            exportSignals: { byStatus: { QUEUED: 14, PREPARING: 2, PENDING: 5 + stuck.filter((s) => s.kind === 'export').length, SENT: 3, WAITING: 1, COMPLETED: 18_240, FAILED: 37 }, locked: 4 + stuck.filter((s) => s.kind === 'export').length },
            importJobs: { byStatus: { WAITING_FOR_FETCH: 2, FETCHING: 1, READY_TO_SYNC: 0, PROCESSING: 1 + stuck.filter((s) => s.kind === 'import').length, COMPLETED: 3120, FAILED: 12, CANCELLED: 4, ARCHIVED: 410 }, locked: 1 + stuck.filter((s) => s.kind === 'import').length },
            stuckLeases: stuck,
            stuckLeaseCount: stuck.length,
            stuckListTruncated: false,
          }
        case 'BackofficeEngineService/releaseStuckLease': {
          strict(body, ['kind', 'id', 'reason'])
          if (body.kind !== 'export' && body.kind !== 'import') throw validation('kind', 'export | import')
          if (typeof body.id !== 'string' || !/^[a-f0-9]{24}$/i.test(body.id)) throw validation('id', '24 hex')
          if (body.id === healthyLease) throw conflict('LEASE_NOT_STUCK', 'Kira takılı değil.')
          const lease = stuck.find((s) => s.id === body.id && s.kind === body.kind)
          if (!lease) throw notFound('İş bulunamadı.', 'JOB_NOT_FOUND')
          stuck = stuck.filter((s) => s !== lease)
          return { kind: lease.kind, id: lease.id, released: true, previousOwner: lease.lockedBy }
        }
        case 'BackofficeEngineService/listJobRuns': {
          strict(body, ['job', 'status', 'cursor', 'limit'])
          if (body.status !== undefined && !['ok', 'partial', 'failed', 'skipped'].includes(String(body.status))) throw validation('status', 'ok|partial|failed|skipped')
          const list = runs.filter((x) => (!body.job || x.job === body.job) && (!body.status || x.status === body.status))
          const res = page(list, body)
          return { ...res, retentionDays: 14, ...(body.cursor ? {} : { states }) }
        }
      }
      return UNHANDLED
    },
  }
}
