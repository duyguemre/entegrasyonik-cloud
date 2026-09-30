/**
 * Ürün adının TEK kaynağı (K17 → K39, ADR-0034 Karar 1). Menü, panel başlığı, rota slug'ı, komut paleti etiketi ve
 * i18n metinleri buradan okur; başka yerde ad literal'i yazılmaz (statik test: tests/static-rules.test.ts).
 */
export const CHAT_PRODUCT = { name: 'Otopilot', slug: 'otopilot' } as const

export type ChatProduct = typeof CHAT_PRODUCT

/** Ürün işareti (MDI) — panel başlığı, üst bar düğmesi, palet satırı ve sekme ikonu aynı simgeyi kullanır. */
export const CHAT_ICON = 'mdi-star-four-points-outline'
