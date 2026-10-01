/**
 * Rekabet ayarları (PRC-CFG, K57-S5). [BE HAZIR] Kaynak: docs/PRICING_COMPETITION.md §3,
 * backend/src/operations/backoffice/competitionAdmin.ts + operations/pricing/competitionSettings.ts.
 * Plan varsayılanları/bütçe/gölge mod `_platform` kataloğundadır (grup `platform.pricing`) ve MEVCUT
 * `IntegrationConfigService` taslak → yayın akışıyla değişir; burada yalnız okuma özeti ve tenant istisnası uçları vardır.
 */
export type CompetitionPriority = 'changed_first' | 'stocked_only' | 'oldest_first'
export type CompetitionField = 'skuCap' | 'refreshMin' | 'freshnessMin' | 'priority'
export type CompetitionPlanCode = 'starter' | 'growth' | 'enterprise'

/** Tenant istisnası: yalnız dolu alanlar gelir (boş alan = plan değeri). */
export interface CompetitionOverride {
  skuCap?: number
  refreshMin?: number
  freshnessMin?: number
  priority?: CompetitionPriority
}
export interface EffectiveCompetition {
  plan: CompetitionPlanCode
  planCode: string | null
  skuCap: number
  refreshMin: number
  freshnessMin: number
  priority: CompetitionPriority
  /** Alan başına kaynak: plan değeri mi, tenant istisnası mı. */
  sources: Record<CompetitionField, 'plan' | 'tenant'>
}
export interface CompetitionLimits {
  skuCap: { min: number; max: number }
  refreshMin: { min: number; max: number }
  freshnessMin: { min: number; max: number }
  budgetPerMin: { min: number; max: number }
}
export interface CompetitionPlanRow {
  plan: CompetitionPlanCode
  skuCap: number
  refreshMin: number
  freshnessMin: number
  priority: CompetitionPriority
  /** Her alanın `_platform` katalog anahtarı (taslak yamasında kullanılır). */
  keys: Record<CompetitionField, string>
}
export interface CompetitionOverrideRow {
  tid: number
  tenantName: string | null
  planCode: string | null
  override: CompetitionOverride
  effective: EffectiveCompetition
  updatedAt: string | null
  note: string | null
}
export interface GetCompetitionSettingsResponse {
  plans: CompetitionPlanRow[]
  budgets: Array<{ channel: string; perMin: number; key: string }>
  notify: { shadow: boolean; cooldownHours: number }
  overrides: CompetitionOverrideRow[]
  limits: CompetitionLimits
  priorities: CompetitionPriority[]
}
export interface GetTenantCompetitionResponse {
  tid: number
  planCode: string | null
  billingExempt: boolean
  override: CompetitionOverride
  effective: EffectiveCompetition
}
export interface SetCompetitionOverrideRequest {
  tid: number
  /** `null` ya da boş nesne istisnayı kaldırır. */
  override: CompetitionOverride | null
  note?: string
  reason: string
}
export interface SetCompetitionOverrideResponse {
  tid: number
  cleared: boolean
  before: CompetitionOverride
  after: CompetitionOverride
  effective: EffectiveCompetition
}

declare module '../contract' {
  interface AdminRpc {
    'BackofficeBillingService/getCompetitionSettings': [Record<string, never>, GetCompetitionSettingsResponse]
    'BackofficeBillingService/getTenantCompetition': [{ tid: number }, GetTenantCompetitionResponse]
    'BackofficeBillingService/setCompetitionOverride': [SetCompetitionOverrideRequest, SetCompetitionOverrideResponse]
  }
}
