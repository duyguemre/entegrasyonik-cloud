/**
 * Yönlendiren genel bakış — `getAttention` + `getPulse` (K51, BO1-DASH). [SÖZLEŞME: docs/cloud-contracts/API_BACKOFFICE_ATTENTION.md]
 * Alan adları sözleşmeden BİREBİR. Ekranlar bu tipleri DOĞRUDAN kullanmaz; `src/api/attention.ts` adaptörü görünüm
 * modeline çevirir (sözleşme değişirse yalnız adaptör değişir). BE-01..06 ekleri bu dosyada değil (bo-r1b kapsamı).
 */

export type AttentionSeverity = 'critical' | 'warning' | 'info'
export type AttentionGroup = 'system' | 'customers'
export type AttentionCountUnit = 'iş' | 'müşteri' | 'çağrı' | 'sorgu' | 'uyarı' | 'kayıt' | 'pod'

/** Kontrol bölümü (`degradedSections.section`). `alerts` iki grubu da besler. */
export type AttentionSection =
  | 'queues'
  | 'circuits'
  | 'apiHealth'
  | 'leases'
  | 'infra'
  | 'alerts'
  | 'slowQueries'
  | 'orderSync'
  | 'subscriptions'
  | 'lifecycle'
  | 'tickets'

export type AttentionAction =
  | { label: string; kind: 'navigate'; target: { route: string; query?: Record<string, string> } }
  | { label: string; kind: 'action'; capabilityId: string }

export interface AttentionItemDto {
  /** `<grup kısaltması>.<kontrol>[:<kapsam>]` — ör. `sys.queue.dlq:order-sync-queue`, `cus.payment.problem`. */
  id: string
  group: AttentionGroup
  severity: AttentionSeverity
  /** TR, ≤ 60 karakter. */
  title: string
  /** Tek cümle, ≤ 200 karakter. */
  why: string
  count: number | null
  countUnit: AttentionCountUnit | null
  /** Tek cümle, ≤ 160 karakter ya da null. */
  impact: string | null
  since: string | null
  /** Yalnız müşteri öğeleri (ve tenant'a özgü sistem öğeleri); ≤ 5 örnek. */
  subjects?: Array<{ tid: number; name: string | null }>
  /** 1..3; ilki önerilen (birincil). */
  actions: AttentionAction[]
}

export interface AttentionGroupDto {
  total: number
  truncated: boolean
  items: AttentionItemDto[]
}

export interface GetAttentionRequest {
  /** 1..50, varsayılan 20 — GRUP başına üst sınır. */
  limit?: number
}

export interface GetAttentionResponse {
  generatedAt: string
  status: 'ok' | 'attention' | 'degraded'
  /** İki grup toplamı (kesmeden önce). */
  summary: Record<AttentionSeverity, number>
  degradedSections: Array<{ section: AttentionSection; error: 'timeout' | 'error' }>
  groups: Record<AttentionGroup, AttentionGroupDto>
}

// ---------------------------------------------------------------- getPulse
type Degraded = { status: 'degraded'; error: 'timeout' | 'error' }
type Ok<T> = { status: 'ok' } & T

export interface PulseHourlyCount {
  t: string
  count: number
}
export interface PulseHourlyRate {
  t: string
  requests: number
  errors5xx: number
  rate: number | null
}

export type PulseTenants = Ok<{ active: number; total: number; byStatus: Record<string, number> }> | Degraded
export type PulseOrders =
  | Ok<{ computable: boolean; last24h: number | null; last7d: number | null; previous24h: number | null; hourly: PulseHourlyCount[]; note?: string }>
  | Degraded
export type PulseCalls =
  | Ok<{
      http: { computable: boolean; last24h: number | null; last7d: number | null; hourly: PulseHourlyCount[]; note?: string }
      integration: { computable: boolean; last24h: number | null; last7d: number | null; note?: string }
    }>
  | Degraded
export type PulseErrorRate =
  | Ok<{
      http: { computable: boolean; hourly: PulseHourlyRate[]; note?: string }
      integration: { computable: boolean; last24h: number | null; last7d: number | null; note?: string }
    }>
  | Degraded
export type PulseMrr =
  | Ok<{ computable: boolean; unit: 'minor'; currency: Record<string, number>; activeSubscriptions: number; trialing: number; lostLast30d: number; note?: string }>
  | Degraded

export interface GetPulseResponse {
  generatedAt: string
  tenants: PulseTenants
  orders: PulseOrders
  calls: PulseCalls
  errorRate: PulseErrorRate
  mrr: PulseMrr
}

declare module '../contract' {
  interface AdminRpc {
    'BackofficeOverviewService/getAttention': [GetAttentionRequest, GetAttentionResponse]
    'BackofficeOverviewService/getPulse': [Record<string, never>, GetPulseResponse]
  }
}
