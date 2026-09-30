/**
 * /admin-api sözleşmesi — backoffice'in TEK şekil kaynağı (istemci + sahte API + sözleşme testleri bunu kullanır).
 *
 * Kaynaklar (docs/cloud-contracts, origin/main):
 *  - ADR-0026 Karar 4 + "Uygulama notu — Aşama 2-BE" (BackofficeAuthService, startImpersonation, EK_ADMIN, hata kodları)
 *  - BACKOFFICE_PLAN §2 (S2–S5, B2, B3, B10, L6–L8), ERROR_CODES.md (yanıt zarfı)
 *  - Mevcut backend: AdminService/getClients (clientDto.ts beyaz listesi), AdminService/getSystemHealth,
 *    GET /health, GET /ready (health/HealthCheck.ts)
 *
 * Durum etiketleri: [MEVCUT] backend'de var · [2-BE] yerelde yazıldı (bulutta kodu yok, şekil ADR notundan)
 * · [PLAN] uç henüz yok — şekil burada ÖNERİDİR, backend yazılırken bu dosya birlikte güncellenir.
 */

// ---------------------------------------------------------------- Yanıt zarfı (ERROR_CODES.md)
export type ApiErrorCode =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'REAUTH_REQUIRED'
  | 'MFA_REQUIRED'
  | 'IMPERSONATION_UNAVAILABLE'
  | 'LIVE_READONLY'
  | 'QUEUE_UNAVAILABLE'
  | 'INFRA_UNAVAILABLE'
  | 'QUERY_TIMEOUT'
  | 'INTERNAL'

export interface ApiErrorBody {
  error: string
  code?: ApiErrorCode | string
  requestId?: string
  service?: string
  operation?: string
  fields?: Array<{ path: string; message: string }>
  /** Koda özgü sayısal ayrıntı (ör. TRIAL_EXTENSION_LIMIT → remainingDays/usedDays/maxTotalDays). Değer/sır taşımaz. */
  details?: Record<string, unknown>
}

// ---------------------------------------------------------------- BackofficeAuthService [2-BE]
export interface LoginRequest {
  email: string
  password: string
}
/** Parola doğru → yarım oturum (5 dk). `enrollRequired`: TOTP henüz kurulmamış (ilk giriş). */
export interface LoginResponse {
  mfaRequired: boolean
  enrollRequired: boolean
}
export interface EnrollTotpResponse {
  otpauthUri: string
}
export interface ConfirmTotpRequest {
  code: string
}
/** Başarılı kayıt doğrudan tam oturum açar; kodlar YALNIZ bu yanıtta görünür. */
export interface ConfirmTotpResponse {
  recoveryCodes: string[]
}
export type VerifyTotpRequest = { code: string } | { recoveryCode: string }
export interface ReauthRequest {
  password: string
  code: string
}
export interface ReauthResponse {
  reauthAt: string
}
export interface BackofficeMe {
  sub: string
  email: string
  name: string
  mfa: boolean
  /** Oturumun açıldığı an (mutlak üst sınır auth_time + 8 sa). */
  authTime: string
  /** Son adım-yükseltmesi (step-up) anı; 5 dk geçerli. */
  reauthAt?: string
}

// ---------------------------------------------------------------- Müşteriler
/** [MEVCUT] AdminService/getClients — `clientDto.ts` beyaz listesi (dbConfig/depolama anahtarı ASLA dönmez). */
export interface GetClientsRequest {
  search?: string
  page?: number
  limit?: number
  sortField?: 'order' | 'clientId' | 'title' | 'name' | 'status' | 'lastSuccessfulOrderSync' | 'createdAt' | 'updatedAt'
  sortOrder?: 1 | -1
}
export interface ClientDto {
  _id: string
  name?: string
  title: string
  order: number
  clientId: number
  /** Mevcut değerler: 'ACTIVE' | 'PASSIVE' (AdminClientDetailComponent). */
  status: string
  lastSuccessfulOrderSync?: string
  /** Şema `Object`; pratikte dizi (AdminClientDetailComponent `form.integrations`). */
  integrations?: Array<{ integrationCode: string; type?: string; status?: boolean }>
  createdAt: string
  updatedAt: string
}
export interface GetClientsResponse {
  success: boolean
  clients: ClientDto[]
  total: number
  page: number
  limit: number
}

/** B2 yaşam döngüsü tipleri: ./contracts/billing.ts (TenantLifecycle). */
/** [2-BE] BackofficeTenantService/startImpersonation — step-up + gerekçe; tek kullanımlık 60 sn bilet URL'i. */
export interface StartImpersonationRequest {
  tid: number
  reason: string
}
/** K41: destek oturumu sabit 30 dk, uzatılamaz (ADR-0026 §4.9). Geri sayım müşteri uygulamasında `userContext.impersonation.expiresAt`'ten. */
export const IMPERSONATION_SESSION_MINUTES = 30
export interface StartImpersonationResponse {
  /** `<PUBLIC_APP_URL>/impersonate#t=<bilet>` — yalnız window.open'a verilir; saklanmaz/loglanmaz/kopyalanmaz. */
  url: string
  /** Bilet ömrü (60 sn, tek kullanımlık). */
  expiresInSeconds: number
}

// ---------------------------------------------------------------- Sistem durumu
/** [MEVCUT] GET /health (liveness). */
export interface HealthResponse {
  status: 'ok'
}
/** [MEVCUT] GET /ready (readiness; 503 iken de bu gövde döner). */
export interface ReadyResponse {
  ready: boolean
  mongo: 'ok' | 'fail'
  redis: 'ok' | 'fail' | 'n/a'
}
/** [MEVCUT] AdminService/getSystemHealth — backoffice'in kullandığı alt küme. */
export interface SystemHealthResponse {
  success: boolean
  infrastructure: {
    activePods: string[]
    redis: { usedMemory: string; connectedClients: string; uptime: string; version: string }
    queues: Record<'orderSync' | 'export' | 'import', { wait: number; active: number }>
  }
}

// ---------------------------------------------------------------- Genel bakış [2-BE B1 — cloud-contracts/API_BACKOFFICE_OVERVIEW_ENGINE.md]
/** Bölüm 2 sn içinde toplanamadıysa yalnız o bölüm düşer; uç 200 döner. */
export interface DegradedSection {
  status: 'degraded'
  error: 'timeout' | 'error'
}
export type HealthSection<T> = ({ status: 'ok' } & T) | DegradedSection
export interface HealthDependencies {
  ready: boolean
  role: 'web' | 'worker' | 'all'
  mongo: 'ok' | 'fail'
  redis: 'ok' | 'fail' | 'n/a'
}
export interface HealthPod {
  pod: string
  activeLeases: number
  runningJobs: number
  lastSeenAt: string
  self: boolean
}
export interface HealthPods {
  self: string
  windowMinutes: number
  items: HealthPod[]
}
export interface HealthRed {
  windowMinutes: number
  from: string
  requests: number
  byStatusClass: Partial<Record<'2xx' | '3xx' | '4xx' | '5xx', number>>
  errors5xx: number
  /** 5xx / toplam; istek yoksa null. */
  errorRate: number | null
  requestsPerMinute: number
  durationAvgMs: number | null
  /** Histogram kovasının üst sınırı; `null` + overflow = 60 sn üstü. */
  durationP95Ms: number | null
  durationP95Overflow: boolean
  scope: 'platform'
  note?: string
}
export interface HealthQueue {
  name: string
  /** false → Redis hazır değil; sayaçlar null. */
  available: boolean
  backlog: number | null
  active: number | null
  failed: number | null
  dlqPending: number | null
}
export interface HealthIntake {
  allOpen: boolean
  scope: 'process'
  restricted: Array<{ target: string; intake: string }>
}
export interface HealthIssues {
  open: number
  newLast24h: number
}
export type OverviewSectionKey = 'dependencies' | 'pods' | 'red' | 'queues' | 'intake' | 'issues'
export interface OverviewHealthResponse {
  generatedAt: string
  status: 'ok' | 'degraded'
  degradedSections: OverviewSectionKey[]
  dependencies: HealthSection<HealthDependencies>
  pods: HealthSection<HealthPods>
  red: HealthSection<HealthRed>
  queues: HealthSection<{ items: HealthQueue[] }>
  intake: HealthSection<HealthIntake>
  issues: HealthSection<HealthIssues>
}

// ---------------------------------------------------------------- Log Kontrol Merkezi [PLAN L6–L8]
export type LogLevel = 'info' | 'warn' | 'error' | 'fatal'
/** ADR-0026 Karar 7.1 `src`. */
export type LogSource = 'api' | 'engine' | 'adapter' | 'worker' | 'webhook' | 'auth' | 'scheduler' | 'client' | 'legacy-console'
/** İş kategorisi (öneri): `src`+`op`'tan sunucuda türetilir; kontrol merkezinin ana ekseni. */
export type LogCategory = 'integration' | 'order' | 'catalog' | 'auth' | 'billing' | 'platform'
export type IssueStatus = 'open' | 'acknowledged' | 'resolved' | 'muted'
export type LogRange = '1h' | '24h' | '7d'

export interface LogFilter {
  range: LogRange
  level?: LogLevel[]
  src?: LogSource[]
  category?: LogCategory[]
  integ?: string
  tid?: number
  reqId?: string
  /** Şablon öneki (regex YOK). */
  text?: string
}
export interface LogEvent {
  id: string
  t: string
  level: LogLevel
  src: LogSource
  category: LogCategory
  /** Maskeli, şablonlaştırılmış ileti. */
  msg: string
  fp?: string
  reqId?: string
  tid?: number
  integ?: string
  op?: string
  errClass?: string
  pod: string
}
export interface ListLogsRequest extends LogFilter {
  cursor?: string
  limit?: number
}
export interface ListLogsResponse {
  items: LogEvent[]
  nextCursor?: string
  /** Seçili aralıkta, diğer yüz filtreleri uygulanmış sayımlar (yüz başına kendi filtresi hariç). */
  facets: {
    level: Partial<Record<LogLevel, number>>
    src: Partial<Record<LogSource, number>>
    category: Partial<Record<LogCategory, number>>
  }
}
export interface IssueGroup {
  fp: string
  /** Parmak izi şablonu (rakamlar `#`). */
  title: string
  level: LogLevel
  src: LogSource
  category: LogCategory
  errClass?: string
  integ?: string
  op?: string
  status: IssueStatus
  count: number
  tenantCount: number
  firstSeen: string
  lastSeen: string
  /** firstSeen seçili aralık içinde. */
  isNew: boolean
  /** YYYYMMDD → sayı (son 14 gün). */
  daily: Record<string, number>
  sampleReqId?: string
}
export interface GetIssueGroupsRequest {
  range: LogRange
  status?: IssueStatus[]
  category?: LogCategory[]
  src?: LogSource[]
  sort?: 'lastSeen' | 'count' | 'tenantCount' | 'new'
}
export interface GetIssueGroupsResponse {
  items: IssueGroup[]
}
export interface GetIssueTrendRequest {
  fp: string
  range: LogRange
}
export interface GetIssueTrendResponse {
  bucket: 'hour' | 'day'
  points: Array<{ t: string; count: number }>
  /** Örnek olay (maskeli) + ilgili istek kimlikleri. */
  sample: { msg: string; t: string; op?: string; tid?: number }
  reqIds: string[]
  tenants: number[]
}
export interface GetVolumeByCategoryRequest {
  range: LogRange
}
export interface GetVolumeByCategoryResponse {
  bucket: 'hour' | 'day'
  categories: Array<{
    category: LogCategory
    total: number
    warn: number
    error: number
    /** Seçili aralığın kovaları (eski → yeni), yalnız warn+error. */
    series: number[]
  }>
}
export interface TraceEvent {
  t: string
  kind: 'log' | 'audit' | 'call'
  title: string
  level?: LogLevel
  src?: LogSource
  integ?: string
  durationMs?: number
  status?: string
}
export interface GetTraceResponse {
  reqId: string
  tid?: number
  startedAt: string
  durationMs: number
  events: TraceEvent[]
}

// ---------------------------------------------------------------- Denetim [PLAN B10; alanlar 2-BE AuditLogs şeması]
export interface AuditRecord {
  id: string
  at: string
  /** ör. backoffice.write, backoffice.sensitive_read, app.write, impersonation.start, login */
  event: string
  sub?: string
  tid?: number
  ip?: string
  result: 'ok' | 'fail' | 'error'
  surface?: 'app' | 'backoffice'
  actorType?: 'user' | 'platform' | 'system'
  onBehalfOf?: number
  imp?: boolean
  reqId?: string
  /** Düz meta: `op`, `reason`; değişiklikte önceki `b_<alan>` ve sonraki `a_<alan>` değerleri. */
  meta?: Record<string, string | number | boolean>
}
export interface SearchAuditRequest {
  range: LogRange
  event?: string
  result?: AuditRecord['result']
  surface?: AuditRecord['surface']
  tid?: number
  reqId?: string
  cursor?: string
  limit?: number
}
export interface SearchAuditResponse {
  items: AuditRecord[]
  nextCursor?: string
}

// ---------------------------------------------------------------- Operasyon kaydı
/** Servis/operasyon → istek/yanıt. İstemci ve sahte API bu haritaya göre tiplenir. */
export interface AdminRpc {
  'BackofficeAuthService/login': [LoginRequest, LoginResponse]
  'BackofficeAuthService/enrollTotp': [Record<string, never>, EnrollTotpResponse]
  'BackofficeAuthService/confirmTotp': [ConfirmTotpRequest, ConfirmTotpResponse]
  'BackofficeAuthService/verifyTotp': [VerifyTotpRequest, { ok: true }]
  'BackofficeAuthService/reauth': [ReauthRequest, ReauthResponse]
  'BackofficeAuthService/logout': [Record<string, never>, { ok: true }]
  'BackofficeAuthService/me': [Record<string, never>, BackofficeMe]
  'AdminService/getClients': [GetClientsRequest, GetClientsResponse]
  'AdminService/getSystemHealth': [{ timeFrame?: 'DAY' | 'WEEK' | 'MONTH' | 'ALL' }, SystemHealthResponse]
  'BackofficeOverviewService/getHealth': [Record<string, never>, OverviewHealthResponse]
  'BackofficeTenantService/startImpersonation': [StartImpersonationRequest, StartImpersonationResponse]
  'LogCenterService/listLogs': [ListLogsRequest, ListLogsResponse]
  'LogCenterService/getIssueGroups': [GetIssueGroupsRequest, GetIssueGroupsResponse]
  'LogCenterService/getIssueTrend': [GetIssueTrendRequest, GetIssueTrendResponse]
  'LogCenterService/getVolumeByCategory': [GetVolumeByCategoryRequest, GetVolumeByCategoryResponse]
  'LogCenterService/getTrace': [{ reqId: string }, GetTraceResponse]
  'BackofficeAuditService/search': [SearchAuditRequest, SearchAuditResponse]
}
export type AdminOp = keyof AdminRpc
export type ReqOf<K extends AdminOp> = AdminRpc[K][0]
export type ResOf<K extends AdminOp> = AdminRpc[K][1]

/**
 * Adım-yükseltmesi (son 5 dk parola + TOTP) + gerekçe (≥10) isteyen operasyonlar — backend `admin/stepUp.ts` REAUTH_RPCS ile
 * birebir (tests/contract-ops.test.ts korur). İstemci bunları özel ele almaz (REAUTH_REQUIRED → diyalog); sahte API zorlar.
 */
export const REAUTH_OPS: readonly AdminOp[] = [
  'IntegrationConfigService/publish',
  'IntegrationConfigService/rollback',
  'BackofficeTenantService/startImpersonation',
  'BackofficeTenantService/cancelDeletion',
  'BackofficeBillingService/extendTrial',
  'BackofficeBillingService/cancelSubscription',
  'BackofficeBillingService/changePlan',
  'BackofficeAdminUserService/invite',
  'BackofficeAdminUserService/disable',
  'BackofficeAdminUserService/enable',
  'BackofficeAdminUserService/resetMfa',
  'BackofficeInfraService/flushCacheFamily',
  'BackofficeEngineService/retryJob',
  'BackofficeEngineService/discardJob',
  'BackofficeEngineService/releaseStuckLease',
]
/** Gerekçe alt/üst sınırı (backend REASON_MIN_LENGTH / REASON_MAX_LENGTH). */
export const REASON_MIN = 10
export const REASON_MAX = 500
/** Oturum gerektirmeyen / yarım oturumla çağrılan kimlik operasyonları. */
export const AUTH_FLOW_OPS: readonly AdminOp[] = [
  'BackofficeAuthService/login',
  'BackofficeAuthService/enrollTotp',
  'BackofficeAuthService/confirmTotp',
  'BackofficeAuthService/verifyTotp',
  'BackofficeAuthService/logout',
  'BackofficeAuthService/me',
  // Kimliksiz davet kabulü (oturum açmaz; 401/403 oturum akışını tetiklemez).
  'BackofficeAuthService/acceptInvite',
  // Yanlış parola/kod oturumu düşürmez; diyalog kendi hatasını gösterir.
  'BackofficeAuthService/reauth',
]

// ---------------------------------------------------------------- Aşama 4 uç grupları (BE HAZIR; alan adları sözleşmeden birebir)
export * from './contracts/engine'
export * from './contracts/billing'
export * from './contracts/infra'
export * from './contracts/platform'
