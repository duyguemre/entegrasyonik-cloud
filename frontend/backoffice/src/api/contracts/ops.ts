/**
 * BE-01..BE-06 (K51 / BO1) — docs/cloud-contracts/API_BACKOFFICE_ATTENTION.md "BE-0x" bölümleri. [BE HAZIR, origin/main]
 * Müşteri operasyon özeti (BE-01), müşteri sağlık özeti (BE-02), kayıtlı görünümler (BE-05). BE-03/04 alanları
 * `contracts/engine.ts`'te, BE-06 `tid` alanı `GetIssueGroupsRequest`'te (contract.ts).
 * Tenant iş verisi dönmez (ad + tid + sayaç/kod); `openIssues` her zaman YAKLAŞIK (kova eşleşmesi).
 */
import type { SubscriptionStatus } from './billing'

// ---------------------------------------------------------------- BE-01 listTenants
export type TenantSortBy = 'tid' | 'name' | 'openIssues' | 'lastErrorAt' | 'failedJobs24h'
export interface ListTenantsRequest {
  hasIssues?: boolean
  /** ≤ 6 */
  subscriptionStatus?: SubscriptionStatus[]
  /** Clients durumu, ≤ 10 */
  status?: string[]
  /** ≤ 60; başlıkta büyük/küçük harf duyarsız içerir */
  q?: string
  sortBy?: TenantSortBy
  /** Varsayılan: tid/name → asc, diğerleri → desc */
  sortDir?: 'asc' | 'desc'
  cursor?: string
  limit?: number
}
export interface TenantOps {
  planCode: string | null
  subscriptionStatus: SubscriptionStatus | null
  openIssues: number
  /** Her zaman true (256 kovalı sayım; fazla sayabilir, eksik saymaz). */
  openIssuesApprox: boolean
  failedJobs24h: number
  lastErrorAt: string | null
}
export interface TenantOpsRow {
  tid: number
  name: string
  status: string
  ops: TenantOps
}
export type TenantOpsSection = 'subscriptions' | 'openIssues' | 'failedJobs' | 'lastErrorAt'
export interface ListTenantsResponse {
  items: TenantOpsRow[]
  nextCursor: string | null
  /** Süzgeç/sıralamadan önce taranan tenant sayısı (≤ 1000). */
  scanned: number
  scanTruncated: boolean
  /** Okunamayan ops bölümleri (Redis yoksa `failedJobs` yalnız DLQ). */
  opsDegraded: TenantOpsSection[]
}

// ---------------------------------------------------------------- BE-02 getHealthSummary
export interface HealthIssueRef {
  fp: string
  module: string
  code: string
  integrationCode: string | null
  lastSeen: string
  count: number
  status: string
}
export interface HealthAlertRef {
  ruleId: string
  scopeKey: string
  level: 'critical' | 'warning'
  status: string
  firstFiredAt: string
  lastSeenAt: string
  mutedUntil: string | null
}
export type HealthSummarySection = 'openIssues' | 'failedJobs' | 'lastSyncAt' | 'alerts'
export interface TenantHealthSummary {
  tid: number
  generatedAt: string
  /** ≤ 20, lastSeen azalan; örnek mesaj YOK. */
  openIssues: { approx: true; items: HealthIssueRef[] }
  /** dlq = PENDING_MANUAL_REVIEW sayısı; Redis yoksa bullmq null + bullmqAvailable false. */
  failedJobs: { bullmq: number | null; dlq: number | null; bullmqAvailable: boolean }
  /** entegrasyon kodu → son BAŞARILI çağrı (30 gün TTL). */
  lastSyncAt: Record<string, string | null>
  lastOrderSyncAt: string | null
  /** ≤ 20; firing uyarılar. */
  alerts: HealthAlertRef[]
  /** Okunamayan bölüm boş/varsayılan döner — FE "sorun yok" DEMEZ. */
  degradedSections: Array<{ section: HealthSummarySection; error: 'timeout' | 'error' }>
}

// ---------------------------------------------------------------- BE-05 kayıtlı görünümler
export interface SavedView {
  id: string
  /** `^[a-z][a-z0-9-]{0,39}$` — ekran kaydı anahtarı (`tenants`, `engine`, `alerts`…). */
  screen: string
  name: string
  /** Yalnız URL süzgeç modeli (NT-03): ≤ 20 anahtar, değer ≤ 200 karakter. */
  query: Record<string, string | string[]>
  createdAt: string
  updatedAt: string
}
/** Yönetici başına toplam en çok (409 VIEW_LIMIT). */
export const SAVED_VIEW_LIMIT = 20

declare module '../contract' {
  interface AdminRpc {
    'BackofficeTenantService/listTenants': [ListTenantsRequest, ListTenantsResponse]
    'BackofficeTenantService/getHealthSummary': [{ tid: number }, TenantHealthSummary]
    'BackofficePrefsService/listViews': [{ screen?: string }, { items: SavedView[] }]
    'BackofficePrefsService/saveView': [{ screen: string; name: string; query: Record<string, string | string[]> }, { id: string; created: boolean; count: number }]
    'BackofficePrefsService/deleteView': [{ id: string }, { id: string; deleted: boolean }]
  }
}
