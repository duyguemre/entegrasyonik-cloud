/**
 * frontend/src/components/productDefinitions/variants/channelPriceModel.ts
 *
 * FR2-PFORM madde 25 — kanal bazında fiyat ekranının saf mantığı (bileşen: crud/PlatformPriceComponent.vue).
 * Model DEĞİŞMEDİ: ana fiyat `variant.prices.{salePrice,marketPrice}`, kanala özel fiyat
 * `variant.platforms[kod].prices.{salePrice,marketPrice}`. Kanal dönüştürücüleri `platforms[kod].prices || prices`
 * kullanır (backend salt-okunur doğrulandı: trendyol/ProductTransformer) → özel fiyatı olmayan kanal ANA FİYATLA gider.
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

export interface ChannelPriceRow {
  code: string
  title: string
  /** Kanala özel fiyat girilmiş mi (yoksa ana fiyat kullanılır). */
  custom: boolean
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
    const custom = !!own
    const sale = custom ? num(own?.salePrice) : base.sale
    const market = custom ? num(own?.marketPrice) : base.market
    const abs = round2(sale - base.sale)
    return {
      code: c.code,
      title: c.title || c.code,
      custom,
      sale,
      market,
      discountPct: discountPct(sale, market),
      diff: custom ? { abs, pct: base.sale > 0 ? round2((abs / base.sale) * 100) : null } : null,
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
    if (!customPrices(variant, code)) { makeCustom(variant, code); converted++ }
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
