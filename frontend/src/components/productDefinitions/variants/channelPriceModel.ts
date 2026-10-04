/**
 * frontend/src/components/productDefinitions/variants/channelPriceModel.ts
 *
 * FR2-PFORM madde 25 — kanal bazında fiyat ekranının saf mantığı (bileşen: crud/PlatformPriceComponent.vue).
 * Model: ana fiyat `variant.prices.{salePrice,marketPrice}`, kanala özel fiyat `variant.platforms[kod].prices.{salePrice,marketPrice}`.
 * [eslesme-fiyat WP5] Kanala giden fiyat backend `effectiveChannelPrice` ile aynı sırada çözülür: kanal özel fiyatı (YALNIZ
 * `prices.isPlatformBasedPrice === true` iken) → kanal fiyat kuralı sonucu (`platforms[kod].rulePrice`) → ana fiyat.
 */
import { formatMoney } from '@entegrasyonik/ui/format'

export interface PricePair {
  salePrice?: number | null
  marketPrice?: number | null
}

export interface ChannelLike {
  code: string
  title?: string
}

export type PriceIssueLevel = 'error' | 'warning'
export interface PriceIssue {
  level: PriceIssueLevel
  message: string
}

export type PriceSourceKind = 'channel' | 'rule' | 'base'

export interface ChannelPriceRow {
  code: string
  title: string
  /** Kanala özel fiyat girilmiş mi (yoksa kural fiyatı ya da ana fiyat kullanılır). */
  custom: boolean
  /** [eslesme-fiyat WP5] Kanala giden fiyatın kaynağı — backend `effectiveChannelPrice` ile aynı sıra. */
  source: PriceSourceKind
  /** Kanal fiyat kuralı gerekçeleri (kaynak `rule` iken). */
  ruleReasons: string[]
  /** Fiyat değişti ama kanala henüz gönderilmedi (otomatik yayın bekliyor). */
  pending: boolean
  /** Kanalda gözlenen fiyat bizimkinden farklı (dış değişiklik). */
  drift: { observed: number | null; expected: number | null } | null
  /** Kanala giden (etkin) fiyatlar. */
  sale: number
  market: number
  /** Piyasa fiyatına göre indirim oranı (0–100), hesaplanamazsa null. */
  discountPct: number | null
  /** Ana satış fiyatına göre fark (yalnız özel fiyatta). */
  diff: { abs: number; pct: number | null } | null
  issues: PriceIssue[]
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function basePrices(variant: any): { sale: number; market: number } {
  return { sale: num(variant?.prices?.salePrice), market: num(variant?.prices?.marketPrice) }
}

export function customPrices(variant: any, code: string): PricePair | undefined {
  return variant?.platforms?.[code]?.prices
}

/**
 * [eslesme-fiyat WP5] Kanal özel fiyatı ETKİN mi: backend `effectiveChannelPrice` ile aynı kural — `prices.isPlatformBasedPrice === true`
 * VE kanal nesnesinde satış fiyatı var. Bayrak kapalıyken eski (içe aktarmadan kalma) kanal nesnesi kanala GİTMEZ.
 */
export function isCustom(variant: any, code: string): boolean {
  const own = customPrices(variant, code)
  return variant?.prices?.isPlatformBasedPrice === true && !!own && own.salePrice !== null && own.salePrice !== undefined && (own.salePrice as any) !== ''
}

export function discountPct(sale: number, market: number): number | null {
  if (!(market > 0) || !(sale >= 0) || sale > market) return null
  return round2(((market - sale) / market) * 100)
}

/** Kural: satış > 0; satış ≤ piyasa (pazaryerleri piyasa fiyatını aşan satış fiyatını reddeder). */
export function priceIssues(sale: number, market: number): PriceIssue[] {
  const out: PriceIssue[] = []
  if (!(sale > 0)) out.push({ level: 'error', message: 'Satış fiyatı 0’dan büyük olmalı.' })
  if (market > 0 && sale > market) out.push({ level: 'warning', message: 'Satış fiyatı piyasa fiyatını aşıyor — kanal reddedebilir.' })
  if (!(market > 0)) out.push({ level: 'warning', message: 'Piyasa fiyatı girilmemiş.' })
  return out
}

export function channelRows(channels: readonly ChannelLike[], variant: any): ChannelPriceRow[] {
  const base = basePrices(variant)
  return channels.map((c) => {
    const own = customPrices(variant, c.code)
    const custom = isCustom(variant, c.code)
    const rule = variant?.platforms?.[c.code]?.rulePrice
    const hasRule = !custom && rule && Number.isFinite(Number(rule.salePrice))
    const source: PriceSourceKind = custom ? 'channel' : hasRule ? 'rule' : 'base'
    const sale = custom ? num(own?.salePrice) : hasRule ? num(rule.salePrice) : base.sale
    const market = custom ? num(own?.marketPrice) : hasRule ? num(rule.marketPrice ?? rule.salePrice) : base.market
    const abs = round2(sale - base.sale)
    const obs = variant?.platforms?.[c.code]?.observed
    return {
      code: c.code,
      title: c.title || c.code,
      custom,
      source,
      ruleReasons: hasRule && Array.isArray(rule.reasons) ? rule.reasons : [],
      pending: !!variant?.pricePending?.[c.code],
      drift: obs?.drift === true ? { observed: Number.isFinite(Number(obs.salePrice)) ? Number(obs.salePrice) : null, expected: Number.isFinite(Number(obs.expectedSalePrice)) ? Number(obs.expectedSalePrice) : null } : null,
      sale,
      market,
      discountPct: discountPct(sale, market),
      diff: source !== 'base' ? { abs, pct: base.sale > 0 ? round2((abs / base.sale) * 100) : null } : null,
      issues: priceIssues(sale, market),
    }
  })
}

/** Kanala özel fiyat açar: ana fiyattan kopyalanır (0'dan başlamaz). */
export function makeCustom(variant: any, code: string): void {
  const base = basePrices(variant)
  variant.platforms = variant.platforms || {}
  variant.platforms[code] = variant.platforms[code] || {}
  variant.platforms[code].prices = { salePrice: base.sale, marketPrice: base.market }
  // [WP5] özel fiyat yalnız bayrakla etkin (backend effectiveChannelPrice); bayrak açılırken diğer kanallardaki eski etkisiz nesneler
  // ana fiyata dönsün diye kaldırılır (aksi halde bayrakla birlikte canlanırlardı).
  variant.prices = variant.prices || {}
  if (variant.prices.isPlatformBasedPrice !== true) {
    for (const other of Object.keys(variant.platforms)) if (other !== code && variant.platforms[other]?.prices) delete variant.platforms[other].prices
    variant.prices.isPlatformBasedPrice = true
  }
}

/** Özel fiyatı kaldırır → kanal ana fiyatı kullanır (kanalın diğer alanları — özellikler vb. — korunur). */
export function resetToBase(variant: any, code: string): void {
  const p = variant?.platforms?.[code]
  if (p && 'prices' in p) delete p.prices
}

export type BulkField = 'salePrice' | 'marketPrice'
export type BulkOp = 'set' | 'add' | 'sub' | 'pctUp' | 'pctDown'

export const BULK_OPS: ReadonlyArray<{ value: BulkOp; title: string; unit: '₺' | '%' }> = [
  { value: 'set', title: 'Şu fiyatı ata', unit: '₺' },
  { value: 'pctUp', title: 'Yüzde artır', unit: '%' },
  { value: 'pctDown', title: 'Yüzde azalt', unit: '%' },
  { value: 'add', title: 'Tutar ekle', unit: '₺' },
  { value: 'sub', title: 'Tutar düş', unit: '₺' },
]

export function applyOp(current: number, op: BulkOp, value: number): number {
  const v = num(value)
  let next = current
  if (op === 'set') next = v
  else if (op === 'add') next = current + v
  else if (op === 'sub') next = current - v
  else if (op === 'pctUp') next = current * (1 + v / 100)
  else if (op === 'pctDown') next = current * (1 - v / 100)
  return Math.max(0, round2(next))
}

/**
 * Toplu değişikliği seçili kanallara uygular. Ana fiyatı kullanan kanal önce ana fiyattan özel fiyata geçer
 * (değişiklik o kanala yazılabilsin). Dönüş: kaç kanal değişti, kaçı özel fiyata geçti.
 */
export function applyBulk(variant: any, codes: readonly string[], field: BulkField, op: BulkOp, value: number): { changed: number; converted: number } {
  let changed = 0
  let converted = 0
  for (const code of codes) {
    if (!isCustom(variant, code)) { makeCustom(variant, code); converted++ }
    const prices = variant.platforms[code].prices
    const before = num(prices[field])
    const after = applyOp(before, op, value)
    prices[field] = after
    if (after !== before) changed++
  }
  return { changed, converted }
}

export function bulkPreview(rows: readonly ChannelPriceRow[], field: BulkField, op: BulkOp, value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'Bir değer girin.'
  const n = rows.length
  if (!n) return 'Bağlı kanal yok.'
  const fieldName = field === 'salePrice' ? 'satış' : 'piyasa'
  const conv = rows.filter((r) => !r.custom).length
  const sample = rows[0]
  const from = field === 'salePrice' ? sample.sale : sample.market
  const to = applyOp(from, op, Number(value))
  const opText: Record<BulkOp, string> = {
    set: `${fieldName} fiyatı ${fmtTry(Number(value))} olur`,
    add: `${fieldName} fiyatına ${fmtTry(Number(value))} eklenir`,
    sub: `${fieldName} fiyatından ${fmtTry(Number(value))} düşülür`,
    pctUp: `${fieldName} fiyatı %${Number(value)} artar`,
    pctDown: `${fieldName} fiyatı %${Number(value)} azalır`,
  }
  const convText = conv ? ` ${conv} kanal ana fiyattan özel fiyata geçer.` : ''
  return `${n} kanalda ${opText[op]} (ör. ${sample.title}: ${fmtTry(from)} → ${fmtTry(to)}).${convText}`
}

const fmtTry = (n: number): string => formatMoney(n)
