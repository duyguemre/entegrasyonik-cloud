/**
 * frontend/src/composables/useIntegrationHealthApi.ts
 *
 * ADR-0015 B4-P1c — N7 "Entegrasyon sağlığı" (tenant, YALNIZCA OKUMA) istemcisi + saf yardımcılar.
 * Sözleşme: `docs/API_TENANT_SURFACE.md` §3 — `IntegrationService/getIntegrationHealth` (admin, owner dahil).
 * Backend karşılığı (salt-okunur, grep ile doğrulandı): `backend/src/api/services/integration-service.ts`
 * `getIntegrationHealth` → `backend/src/operations/integrations/health.ts`
 * (`IntegrationHealthDto` alanları birebir aşağıdaki tiplerdir; uydurma alan YOK).
 *
 * Yorum kuralları (§3):
 *  - (a) `lastSuccessfulSyncAt` provisioning anında `now` ile tohumlanır → `credentialsConfigured !== true`
 *    iken bu tarih "son başarılı senkron" olarak GÖSTERİLMEZ; "hiç bağlanmadı" yorumlanır.
 *  - `circuit.stale === true` → gözlem 10 dk'dan eski; kesici artık kapanmış olabilir ("eski gözlem").
 *  - `lastError` yalnızca kod + HTTP durumu + işlem; ham mesaj DÖNMEZ ve burada da üretilmez.
 */
import useRestApi from '@/composables/restapi'
import type { StatusTone } from '@/design/status-map'

export type IntegrationHealthStatus = 'not_configured' | 'no_data' | 'healthy' | 'degraded' | 'down'
export type CircuitState = 'closed' | 'open' | 'half_open'

export interface IntegrationHealthItem {
  integrationCode: string
  type: string | null
  enabled: boolean
  credentialsConfigured: boolean | null
  lastSuccessfulSyncAt: string | null
  /** [eslesme-fiyat WP7b] Tür başına senkron durumu (eski backend'de yok → isteğe bağlı). */
  sync?: Partial<Record<'orders' | 'claims' | 'messages' | 'finance' | 'products' | 'catalog', {
    lastSuccessAt: string | null
    lastAttemptAt: string | null
    lastError: { code: string; at: string } | null
  }>>
  /** [WP7a F-04 / WP7b] Art arda AUTH vb. nedeniyle iş üretimi durdu. */
  needsAttention?: { reason: string; since: string | null } | null
  webhook: { healthy: boolean | null; lastReceivedAt: string | null } | null
  lastError: { at: string; code: string; httpStatus: number | null; operation: string } | null
  circuit: { state: CircuitState; observedAt: string; stale: boolean } | null
  last24h: { total: number; success: number; error: number; errorsByCode: Record<string, number> }
  health: IntegrationHealthStatus
}

export interface IntegrationHealthResponse {
  generatedAt: string
  windowHours: number
  integrations: IntegrationHealthItem[]
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number | null }

/** `restapi.post` hata durumunda axios hata nesnesini RESOLVE eder (bkz. restapi.ts) — HTTP durumunu çıkarır. */
export function apiErrorStatus(res: any): number | null | undefined {
  if (res === undefined || res === null) return null
  if (res instanceof Error || res?.isAxiosError === true || (typeof res === 'object' && 'response' in res && 'config' in res)) {
    const status = res?.response?.status
    return typeof status === 'number' ? status : null
  }
  return undefined
}

export function isIntegrationHealthResponse(value: any): value is IntegrationHealthResponse {
  return !!value && typeof value === 'object' && Array.isArray(value.integrations)
}

export function useIntegrationHealthApi() {
  const restApi = useRestApi()
  async function getIntegrationHealth(): Promise<ApiResult<IntegrationHealthResponse>> {
    const res: any = await restApi.post('IntegrationService/getIntegrationHealth', {})
    const status = apiErrorStatus(res)
    if (status !== undefined) return { ok: false, status }
    if (!isIntegrationHealthResponse(res)) return { ok: false, status: null }
    return { ok: true, data: res }
  }
  return { getIntegrationHealth }
}

// ---- Sunum eşlemeleri (ekran renk SEÇMEZ; ton buradan gelir) ----

export interface HealthPresentation {
  tone: StatusTone
  /** `EkIconTile` tonu (status-map `danger` ↔ ikon kapsülü `error`). */
  iconTone: 'success' | 'warning' | 'error' | 'info' | 'neutral'
  icon: string
  labelKey: string
}

export const HEALTH_PRESENTATION: Record<IntegrationHealthStatus, HealthPresentation> = {
  healthy: { tone: 'success', iconTone: 'success', icon: 'mdi-check-circle-outline', labelKey: 'integrationHealth.status.healthy' },
  degraded: { tone: 'warning', iconTone: 'warning', icon: 'mdi-alert-outline', labelKey: 'integrationHealth.status.degraded' },
  down: { tone: 'danger', iconTone: 'error', icon: 'mdi-lan-disconnect', labelKey: 'integrationHealth.status.down' },
  no_data: { tone: 'neutral', iconTone: 'neutral', icon: 'mdi-timer-sand-empty', labelKey: 'integrationHealth.status.no_data' },
  not_configured: { tone: 'neutral', iconTone: 'neutral', icon: 'mdi-key-remove', labelKey: 'integrationHealth.status.not_configured' },
}

/** Bilinmeyen `health` değeri (sözleşme dışı) → `no_data` sunumu; uydurma "sağlıklı" GÖSTERİLMEZ. */
export function healthPresentation(health: string): HealthPresentation {
  return HEALTH_PRESENTATION[health as IntegrationHealthStatus] ?? HEALTH_PRESENTATION.no_data
}

/** Önem sırası: sorunlu olan önce (kartlar bu sırayla dizilir). */
const HEALTH_ORDER: Record<IntegrationHealthStatus, number> = { down: 0, degraded: 1, healthy: 2, no_data: 3, not_configured: 4 }

export function sortByUrgency(items: IntegrationHealthItem[]): IntegrationHealthItem[] {
  return [...items].sort((a, b) => {
    const d = (HEALTH_ORDER[a.health] ?? 9) - (HEALTH_ORDER[b.health] ?? 9)
    return d !== 0 ? d : a.integrationCode.localeCompare(b.integrationCode, 'tr')
  })
}

export interface HealthSummary {
  total: number
  healthy: number
  attention: number
  down: number
  idle: number
  calls: number
  errors: number
}

export function summarizeHealth(items: IntegrationHealthItem[]): HealthSummary {
  const s: HealthSummary = { total: items.length, healthy: 0, attention: 0, down: 0, idle: 0, calls: 0, errors: 0 }
  for (const it of items) {
    if (it.health === 'healthy') s.healthy++
    else if (it.health === 'degraded') s.attention++
    else if (it.health === 'down') s.down++
    else s.idle++
    s.calls += Number(it.last24h?.total) || 0
    s.errors += Number(it.last24h?.error) || 0
  }
  return s
}

/** 24 sa başarı oranı (0..1); çağrı yoksa `null` (0 gösterilmez — veri yok). */
export function successRatio(item: IntegrationHealthItem): number | null {
  const total = Number(item.last24h?.total) || 0
  if (total <= 0) return null
  return (Number(item.last24h?.success) || 0) / total
}

/** §3 uyarı (a): kimlik bilgisi doğrulanmış biçimde girilmemişse senkron tarihi "son başarılı senkron" DEĞİLDİR. */
export function syncInterpretation(item: IntegrationHealthItem): 'never' | 'none' | 'synced' {
  if (item.credentialsConfigured !== true) return 'never'
  return item.lastSuccessfulSyncAt ? 'synced' : 'none'
}

export type CredentialState = 'configured' | 'missing' | 'no_record'
export function credentialState(item: IntegrationHealthItem): CredentialState {
  if (item.credentialsConfigured === true) return 'configured'
  return item.credentialsConfigured === false ? 'missing' : 'no_record'
}

/** Hata kodu dağılımı — çoktan aza; en fazla `limit` kalem + "diğer" toplamı. */
export function errorCodeDistribution(item: IntegrationHealthItem, limit = 4): { code: string; count: number; ratio: number }[] {
  const entries = Object.entries(item.last24h?.errorsByCode ?? {})
    .map(([code, count]) => ({ code, count: Number(count) || 0 }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code))
  const sum = entries.reduce((a, e) => a + e.count, 0)
  if (!sum) return []
  const head = entries.slice(0, limit)
  const rest = entries.slice(limit).reduce((a, e) => a + e.count, 0)
  if (rest > 0) head.push({ code: 'OTHER', count: rest })
  return head.map((e) => ({ ...e, ratio: e.count / sum }))
}

/** `IntegrationError.code` → okunur etiket anahtarı; bilinmeyen kod → ham kod gösterilir (çağıran karar verir). */
export const KNOWN_ERROR_CODES = ['AUTH', 'RATE_LIMITED', 'UNAVAILABLE', 'VALIDATION', 'NOT_FOUND', 'NOT_SUPPORTED', 'UNKNOWN_OUTCOME', 'INTERNAL', 'UNKNOWN', 'OTHER'] as const

/** Entegrasyon türü → mevcut ayar sekmesi (`menuStore.views` anahtarının yaprak kodu). */
export const SETTINGS_SCREEN_BY_TYPE: Record<string, string> = {
  marketplace: 'MarketplaceView',
  ecommerce: 'ECommerceView',
  shipment: 'ShippingView',
  einvoice: 'EInvoiceView',
  erp: 'ErpView',
}

const DISPLAY_NAMES: Record<string, string> = {
  trendyol: 'Trendyol', hepsiburada: 'Hepsiburada', n11: 'N11', pazarama: 'Pazarama', ideasoft: 'Ideasoft', bizimhesap: 'Bizimhesap',
}

export function integrationDisplayName(code: string): string {
  if (!code) return '—'
  return DISPLAY_NAMES[code] ?? code.charAt(0).toUpperCase() + code.slice(1)
}
