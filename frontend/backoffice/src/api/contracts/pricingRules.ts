/**
 * Fiyat kuralları (PRC-R2, K19). [BE HAZIR] Kaynak: docs/PRICING_COMPETITION.md §R2.4–R2.6,
 * backend/src/operations/backoffice/pricingRulesAdmin.ts. Yalnız TOPLAM sayaçlar döner: tenant adı/numarası, SKU, fiyat, kural değeri YOK
 * (K2/K5). Platform kill-switch `features.pricingRules` MEVCUT `_platform` taslak → yayın akışıyla değişir (ayrı yazma ucu yok).
 */
export interface PricingRulesOverview {
  killSwitch: { key: string; enabled: boolean; label: { tr: string; en: string } | null; help: { tr: string; en: string } | null }
  /** Otomatik (insan onaysız) uygulama bu sürümde YOK (PRC-R3 avukat yanıtını bekliyor). */
  autoApply: { available: false; reason: string }
  at: string
  scannedTenants: number
  tenantsEnabled: number
  tenantsWithRules: number
  rules: { total: number; enabled: number; pausedExternal: number; pausedOscillation: number }
  suggestions: { open: number; blocked: number; applied7d: number; dismissed7d: number }
  failedTenants: number
  truncated: boolean
}

declare module '../contract' {
  interface AdminRpc {
    'BackofficeBillingService/getPricingRulesOverview': [Record<string, never>, PricingRulesOverview]
  }
}
