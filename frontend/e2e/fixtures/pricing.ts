// PRC-R0/R1 (cloud/prc-r1) — sahte PricingService yanıtları (sözleşme: docs/PRICING_COMPETITION.md §5). Sentetik veri
// (Protokol 7): gerçek mağaza/barkod/fiyat yok. Yalnız fikstür; backend yok.
import { buildProduct } from './apiData'
import { buildVariant } from './productUpdate'

export const channelsSupport = [
  { code: 'trendyol', displayName: 'Trendyol', level: 'limited', verified: false },
  { code: 'hepsiburada', displayName: 'Hepsiburada', level: 'not_supported', verified: false },
  { code: 'n11', displayName: 'N11', level: 'not_supported', verified: false },
  { code: 'pazarama', displayName: 'Pazarama', level: 'not_supported', verified: false },
]

export const coverage = (percent: number, total = 10) => ({
  items: [], nextCursor: null, staleAfterDays: 90,
  coverage: { total, withCost: Math.round((percent / 100) * total), percent, stale: 0 },
})

const settings = (over: Record<string, unknown> = {}) => ({
  enabled: true, plan: 'starter', skuCap: 100, refreshMin: 360, freshnessMin: 30, priority: 'changed_first', eligible: 3, tracked: 3, ...over,
})

export function bbRow(over: Record<string, unknown> = {}) {
  return {
    variantId: 'var-prc-1', productId: 'product-e2e-0001', barcode: '8690000000101', sku: 'SK-E2E-SIYAH', status: 'losing', buyboxOrder: 3,
    buyboxPrice: 219.9, hasMultipleSeller: true, ownPrice: 249.9, gapAmount: 30, gapPercent: 13.6,
    checkedAt: '2026-10-01T09:40:00.000Z', nextRefreshAt: '2026-10-01T15:40:00.000Z', overdue: false, fresh: true, lostAt: '2026-10-01T08:00:00.000Z', ...over,
  }
}

export const listProducts = {
  products: [
    buildProduct({ _id: 'product-e2e-0001', title: 'E2E Test Ürünü' }),
    buildProduct({ _id: 'product-e2e-0002', title: 'E2E İkinci Ürün', stock: 0, variants: [{ stockcode: 'SK-E2E-002', barcode: '8690000000002', order: 0 }] }),
    buildProduct({ _id: 'product-e2e-0003', title: 'E2E Üçüncü Ürün', variants: [{ stockcode: 'SK-E2E-003', barcode: '8690000000003', order: 0 }] }),
  ],
  totalNumberOfRecords: 3, fromTo: '1-3 / 3', isFiltered: false,
}

export const listBuyboxOk = (enabled = true) => ({
  channel: 'trendyol', channels: channelsSupport, settings: settings({ enabled }),
  summary: { winning: 1, losing: 1, not_found: 0, unchecked: 1 }, nextCursor: null,
  items: [
    bbRow(),
    bbRow({ variantId: 'var-prc-2', productId: 'product-e2e-0002', barcode: '8690000000002', status: 'winning', buyboxOrder: 1, buyboxPrice: 129.5, ownPrice: 129.5, gapAmount: 0, gapPercent: 0 }),
    bbRow({ variantId: 'var-prc-3', productId: 'product-e2e-0003', barcode: '8690000000003', status: 'unchecked', buyboxOrder: null, buyboxPrice: null, ownPrice: 99, gapAmount: null, gapPercent: null, checkedAt: null, nextRefreshAt: null, fresh: false, lostAt: null }),
  ],
})

/** Ürün düzenleme: iki kayıtlı varyant (kimlikli), biri maliyetli. */
export const prcProduct = buildProduct({
  _id: 'product-prc-1', title: 'E2E Rekabet Ürünü', hasVariant: true, maincode: 'MC-PRC-001', category: 'cat-e2e-2', brand: 'brand-e2e-1',
  variants: [
    buildVariant({ _id: 'var-prc-1', costPrice: 80, barcode: '8690000000101' }),
    buildVariant({ _id: 'var-prc-2', tempId: undefined, stockcode: 'SK-E2E-BEYAZ', barcode: '8690000000102', choices: [{ choiceId: 'choice-e2e-1', choiceValueId: 'choiceval-e2e-2' }], stock: 0, shelf: undefined, order: 1 }),
  ],
})

const profit = (price: number, net: number, vat: number, p: number | null, margin: number | null, missing: string[] = []) => ({
  price, net, salesVat: vat, profit: p, marginPercent: margin, confidence: p === null ? 'unknown' : missing.length ? 'partial' : 'estimated', missing,
})

export const marginItem = (over: Record<string, unknown> = {}) => ({
  variantId: 'var-prc-1', barcode: '8690000000101', found: true, productId: 'product-prc-1', sku: 'SK-E2E-SIYAH', priceSource: 'channel', ownPrice: 249.9,
  buybox: { status: 'losing', order: 3, price: 219.9, hasMultipleSeller: true, observedAt: '2026-10-01T09:40:00.000Z', ageMinutes: 20, fresh: true },
  gap: { amount: 30, percent: 13.6 },
  current: profit(249.9, 200, 41.65, 78.35, 31.4),
  atBuybox: profit(219.9, 176, 36.65, 59.35, 27),
  breakEvenPrice: 160, buyboxBelowFloor: false,
  commission: { rate: 12, source: 'actual' }, cost: { price: 80, updatedAt: '2026-09-20T10:00:00.000Z' }, vatRate: 20,
  rulesEligible: true, ineligibleReasons: [], ...over,
})

export const previewOk = (items: unknown[] = [marginItem(), marginItem({
  variantId: 'var-prc-2', barcode: '8690000000102', sku: 'SK-E2E-BEYAZ',
  buybox: { status: 'winning', order: 1, price: 249.9, hasMultipleSeller: false, observedAt: '2026-10-01T09:40:00.000Z', ageMinutes: 20, fresh: true },
  gap: { amount: 0, percent: 0 }, current: profit(249.9, 200, 41.65, null, null, ['cost']), atBuybox: profit(249.9, 200, 41.65, null, null, ['cost']),
  breakEvenPrice: null, cost: { price: null, updatedAt: null }, rulesEligible: false, ineligibleReasons: ['cost_missing'],
})]) => ({ channel: 'trendyol', freshnessMin: 30, items })

export const historyOk = {
  channel: 'trendyol', barcode: '8690000000101', days: 30,
  points: Array.from({ length: 12 }, (_, i) => ({
    at: new Date(Date.UTC(2026, 8, 2 + i * 2, 10)).toISOString(), status: i % 3 === 0 ? 'winning' : 'losing', buyboxOrder: 2,
    buyboxPrice: 215 + ((i * 7) % 18), ownPrice: i < 6 ? 235 : 249.9,
  })),
}
export const historyEmpty = { channel: 'trendyol', barcode: '8690000000101', days: 30, points: [] }

export const setCostsOk = (updated = 1) => ({
  updated, unchanged: 0, notFound: [], changes: [], coverage: { total: 4, withCost: 2, percent: 50, stale: 0 },
})
