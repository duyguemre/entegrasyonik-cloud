// PRC-R2 (cloud/prc-r2) — sahte PricingService kural/öneri/geçmiş yanıtları (sözleşme: docs/PRICING_COMPETITION.md §R2.5).
// Sentetik veri (Protokol 7): gerçek mağaza/barkod/fiyat yok. Rakip kimliği yok (K16).
import { menuFixture } from './nav'

export const PRICING_RULES_ICON = 'mdi-tag-arrow-down-outline'

/** `menuFixture` + "Fiyat kuralları" (gerçek menü kaydı yerel iştir; derin bağlantı menü ağacında arar). */
export const menuFixtureWithPricingRules = menuFixture.map((group: any) =>
  group.group === 'sale'
    ? { ...group, links: [...group.links, {
      code: 'pricing', parent: '', title: 'pricingRules', icon: PRICING_RULES_ICON,
      children: [{ code: 'PricingRulesView', parent: 'pricing', title: 'pricingRules', icon: PRICING_RULES_ICON, singleton: true }],
    }] }
    : group,
)

const LIMITS = { maxIncreasePercentPerDay: 10, maxIncreasePercent30d: 25, maxChangesPerDay: 24, minCooldownMin: 15, maxDropPercent: 50 }
const CONSENT = {
  version: '2026-10-01-draft', draft: true,
  text: {
    tr: 'Fiyat kuralları yalnız sizin girdiğiniz değerlerle çalışır ve yalnız öneri üretir; fiyatınız ancak siz onayladığınızda değişir. Taban ve tavan fiyatı siz belirlersiniz. Fiyat kararlarınızın sorumluluğu size aittir. Verileriniz başka hiçbir satıcının fiyatlandırmasında kullanılmaz.',
    en: 'Pricing rules work only with the values you enter and only produce suggestions; your price changes only when you approve it.',
  },
}
const DUAL = {
  tr: 'Pazaryerinin kendi otomatik fiyatlandırma aracını aynı ürünlerde kapatın. İki araç birbirini tetikleyebilir. Fiyat Entegrasyonik dışında değişirse kural duraklatılır.',
  en: "Turn off the marketplace's own automatic pricing tool for the same products.",
}

export function rule(over: Record<string, unknown> = {}) {
  return {
    id: '650000000000000000000001', type: 'competition', name: 'Buybox altında kal', enabled: true, version: 3, integrationCode: 'trendyol',
    scope: { productIds: [], barcodes: [] },
    competition: { mode: 'below', deltaAmount: 1, deltaPercent: null, floorMarginPercent: 10, ceiling: 400, step: 0.1, maxChangesPerDay: 6, cooldownMin: 60, maxIncreasePercentPerDay: 5, excludeIfOutOfStock: true },
    pausedReason: null, pausedAt: null, updatedAt: '2026-10-01T08:00:00.000Z', suggestions: { open: 2, blocked: 1 }, ...over,
  }
}

export function rulesState(over: Record<string, unknown> = {}) {
  return {
    channel: 'trendyol', platformEnabled: true, competitionEnabled: true, active: true, inactiveReason: null,
    settings: { enabled: true, consent: { acceptedVersion: CONSENT.version, acceptedAt: '2026-10-01T07:30:00.000Z' }, dualEngineAcknowledgedAt: '2026-10-01T07:30:00.000Z' },
    consent: CONSENT, dualEngineWarning: DUAL, limits: LIMITS,
    rules: [
      rule(),
      rule({ id: '650000000000000000000002', name: 'Seçili ürünlerde üstünde kal', version: 1, enabled: true, pausedReason: 'external_change', pausedAt: '2026-10-01T09:00:00.000Z',
        scope: { productIds: [], barcodes: ['8690000000201', '8690000000202'] },
        competition: { mode: 'above', deltaAmount: null, deltaPercent: 2, floorMarginPercent: 15, ceiling: 250, step: 0.01, maxChangesPerDay: 4, cooldownMin: 120, maxIncreasePercentPerDay: 3, excludeIfOutOfStock: false },
        suggestions: { open: 0, blocked: 0 } }),
    ],
    ...over,
  }
}

export const rulesStateOff = () => rulesState({
  active: false, inactiveReason: 'tenant_disabled',
  settings: { enabled: false, consent: { acceptedVersion: null, acceptedAt: null }, dualEngineAcknowledgedAt: null }, rules: [],
})
export const rulesStatePlatformOff = () => rulesState({ platformEnabled: false, active: false, inactiveReason: 'platform_disabled' })

export function suggestion(over: Record<string, unknown> = {}) {
  return {
    id: '660000000000000000000001', ruleId: '650000000000000000000001', ruleVersion: 3, integrationCode: 'trendyol', variantId: 'var-prc-1', productId: 'product-e2e-0001',
    barcode: '8690000000101', sku: 'SK-E2E-SIYAH', status: 'open', beforePrice: 249.9, afterPrice: 218.9, listPrice: 249.9, floor: 151.3, ceiling: 400,
    profitBefore: 62.4, profitAfter: 41.15, buyboxPrice: 219.9, buyboxOrder: 3, buyboxObservedAt: '2026-10-01T09:40:00.000Z',
    reasons: ['mode_below', 'buybox_held_by_other', 'price_down'], warnings: [], blockedReason: null, closedReason: null,
    createdAt: '2026-10-01T09:41:00.000Z', updatedAt: '2026-10-01T09:41:00.000Z', appliedAt: null, lowestPrice10d: 239.9, ...over,
  }
}

export const suggestionsOpen = () => ({
  channel: 'trendyol', active: true, inactiveReason: null, summary: { open: 3, blocked: 1 }, applyMax: 50, nextCursor: null,
  items: [
    suggestion(),
    suggestion({ id: '660000000000000000000002', variantId: 'var-prc-2', barcode: '8690000000102', sku: 'SK-E2E-BEYAZ', beforePrice: 189.9, afterPrice: 172.4, listPrice: 229.9,
      profitBefore: 44.1, profitAfter: 31.2, buyboxPrice: 173.4, buyboxOrder: 2, warnings: ['discount_display_active'], lowestPrice10d: 184.9 }),
    suggestion({ id: '660000000000000000000003', variantId: 'var-prc-3', barcode: '8690000000103', sku: 'SK-E2E-MAVI', beforePrice: 99.9, afterPrice: 94.5, listPrice: 99.9,
      profitBefore: 18.4, profitAfter: 14.6, buyboxPrice: 95.5, buyboxOrder: 4, warnings: ['partial_deductions'], lowestPrice10d: 99.9 }),
  ],
})
export const suggestionsBlocked = () => ({
  channel: 'trendyol', active: true, inactiveReason: null, summary: { open: 3, blocked: 1 }, applyMax: 50, nextCursor: null,
  items: [suggestion({ id: '660000000000000000000009', status: 'blocked', afterPrice: null, profitAfter: null, blockedReason: 'below_floor', barcode: '8690000000109', sku: 'SK-E2E-YESIL' })],
})
export const suggestionsEmpty = () => ({ channel: 'trendyol', active: false, inactiveReason: 'tenant_disabled', summary: { open: 0, blocked: 0 }, applyMax: 50, nextCursor: null, items: [] })

export const historyOk = () => ({
  channel: 'trendyol', nextCursor: null,
  items: [
    { id: 'h1', at: '2026-10-01T10:05:00.000Z', barcode: '8690000000104', variantId: 'var-prc-4', source: 'suggestion', previousPrice: 159.9, salePrice: 149.9, listPrice: 179.9,
      ruleId: '650000000000000000000001', ruleVersion: 3, suggestionId: '660000000000000000000004', buyboxPrice: 150.9, buyboxObservedAt: '2026-10-01T09:58:00.000Z', actor: 'u-e2e' },
    { id: 'h2', at: '2026-10-01T09:00:00.000Z', barcode: '8690000000201', variantId: 'var-prc-5', source: 'external', previousPrice: 120, salePrice: 109.9, listPrice: null,
      ruleId: null, ruleVersion: null, suggestionId: null, buyboxPrice: 109.9, buyboxObservedAt: '2026-10-01T09:00:00.000Z', actor: null },
  ],
})

export const applyPartial = {
  applied: [{ suggestionId: '660000000000000000000001', barcode: '8690000000101', before: 249.9, after: 218.9 }],
  rejected: [{ suggestionId: '660000000000000000000002', barcode: '8690000000102', reason: 'suggestion_changed' }],
  published: 1,
}
