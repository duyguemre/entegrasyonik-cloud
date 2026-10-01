/**
 * Motor ve kuyruklar — B7a-d (docs/cloud-contracts/API_BACKOFFICE_OVERVIEW_ENGINE.md). [BE HAZIR]
 * Kaynak: backend/src/api/services/backoffice-engine-service.ts, şema rpc-input/backoffice-engine.ts (strict gövde).
 * Yük (payload), hata METNİ, outputSummary ASLA dönmez; yalnız kimlik, tenant numarası, kod, sayaç, zaman.
 */

/** Şema enum'u şimdilik tek değer; FE kuyruk listesini `getQueues` yanıtından okur (sabit kodlamaz). */
export type QueueName = string

export interface QueueCounts {
  wait: number
  active: number
  delayed: number
  failed: number
  completed: number
  paused: number
}
export interface QueueSeriesPoint {
  t: string
  count: number
  failed: number
  retried: number
  /** Saat içindeki dakikalık p95'lerin en büyüğü (gerçek saatlik p95 DEĞİL); boş saatte null. */
  waitMsP95Max: number | null
  procMsP95Max: number | null
}
export interface EngineQueue {
  name: QueueName
  /** false → Redis hazır değil; `counts:null` (uç yine 200). */
  available: boolean
  counts: QueueCounts | null
  dlq: { pendingReview: number | null }
  metrics: { resolution: '1h'; from: string; to: string; series: QueueSeriesPoint[] }
}
export interface GetQueuesResponse {
  generatedAt: string
  queues: EngineQueue[]
}

export type FailedJobSource = 'bullmq' | 'dlq'
export interface ListFailedJobsRequest {
  queue: QueueName
  source?: FailedJobSource
  cursor?: string
  limit?: number
}
export interface FailedBullJob {
  id: string
  operation: string
  tenantId: number | null
  integrationCode: string | null
  /** `[KOD]` öneki; yoksa UNKNOWN. */
  errorCode: string
  attemptsMade: number
  maxAttempts: number
  failedAt: string
  enqueuedAt: string
}
export interface DlqRecord {
  id: string
  originalJobId: string
  tenantId: number | null
  integrationCode: string | null
  errorCode: string
  dlqType: 'FATAL_ERROR' | 'MAX_RETRIES_EXCEEDED'
  status: string
  failedAt: string
}
export interface ListFailedJobsResponse<T = FailedBullJob | DlqRecord> {
  source: FailedJobSource
  queue: QueueName
  items: T[]
  nextCursor: string | null
}
export interface JobActionRequest {
  queue: QueueName
  jobId: string
  /** ≥10, ≤500 karakter (requireReason). */
  reason: string
}

export type ExportStatus = 'QUEUED' | 'PREPARING' | 'PENDING' | 'SENT' | 'WAITING' | 'COMPLETED' | 'FAILED'
export type ImportStatus = 'WAITING_FOR_FETCH' | 'FETCHING' | 'READY_TO_SYNC' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'ARCHIVED'
export type LeaseKind = 'export' | 'import'
export interface StuckLease {
  kind: LeaseKind
  /** 24 hex. */
  id: string
  tenantId: number | null
  integrationCode: string | null
  status: string
  lockedBy: string
  leaseExpiredAt: string | null
  lastActivityAt: string | null
  staleForMs: number
}
export interface GetStateMachineJobsResponse {
  generatedAt: string
  leaseTimeoutMs: { export: number; import: number }
  exportSignals: { byStatus: Partial<Record<ExportStatus, number>>; locked: number }
  importJobs: { byStatus: Partial<Record<ImportStatus, number>>; locked: number }
  stuckLeases: StuckLease[]
  stuckLeaseCount: number
  stuckListTruncated: boolean
}
export interface ReleaseStuckLeaseRequest {
  kind: LeaseKind
  id: string
  reason: string
}

export type JobRunStatus = 'ok' | 'partial' | 'failed' | 'skipped'
export interface JobRun {
  id: string
  job: string
  runType: string
  trigger: string
  status: JobRunStatus
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  /** Yalnız sayısal değerler (≤20 anahtar). */
  counts: Record<string, number>
  skippedReason: string | null
  /** message ≤500, yazımda redakte. */
  error: { code: string; message: string } | null
  scope: { level: 'platform' | 'tenant'; tenantId?: number; integrationCode?: string }
  corrId: string | null
  pod: string | null
}
export interface JobState {
  job: string
  lastStatus: JobRunStatus | null
  lastStartedAt: string | null
  lastFinishedAt: string | null
  lastSuccessAt: string | null
  lastDurationMs: number | null
  consecutiveFailures: number
  runningSince: string | null
  heartbeatAt: string | null
  pod: string | null
  expectedIntervalMs: number | null
  overdue: boolean
}
export interface ListJobRunsRequest {
  job?: string
  status?: JobRunStatus
  cursor?: string
  limit?: number
}
export interface ListJobRunsResponse {
  items: JobRun[]
  nextCursor: string | null
  retentionDays: number
  /** Yalnız ilk sayfada (imleçsiz istek). */
  states?: JobState[]
}

declare module '../contract' {
  interface AdminRpc {
    'BackofficeEngineService/getQueues': [Record<string, never>, GetQueuesResponse]
    'BackofficeEngineService/listFailedJobs': [ListFailedJobsRequest, ListFailedJobsResponse]
    'BackofficeEngineService/retryJob': [JobActionRequest, { queue: QueueName; jobId: string; retried: true }]
    'BackofficeEngineService/discardJob': [JobActionRequest, { queue: QueueName; jobId: string; discarded: true }]
    'BackofficeEngineService/getStateMachineJobs': [Record<string, never>, GetStateMachineJobsResponse]
    'BackofficeEngineService/releaseStuckLease': [ReleaseStuckLeaseRequest, { kind: LeaseKind; id: string; released: true; previousOwner: string }]
    'BackofficeEngineService/listJobRuns': [ListJobRunsRequest, ListJobRunsResponse]
  }
}
