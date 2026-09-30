/**
 * frontend/src/components/productDefinitions/variants/variantListModel.ts
 *
 * A11 — ürün listesinde satır altı varyant gösteriminin SAF mantığı (Vue import'u yok; birim testli).
 * Veri yalnız backend `ProductService/getProducts` varyant projeksiyonundan: `stock`, `prices`, `barcode`, `stockcode`,
 * `choices`, `shelf`, `images[0]`, `platforms.<kod>.{upload, prices, stock}`. Rezerve/kullanılabilir stok bu projeksiyonda
 * YOK (`reserved` dönmez) → gösterilmez; renk kodu seçenek değerinde YOK → renk seçeneği gerçek renk örneği almaz.
 */
import type { StatusTone } from '@/design/status-map'

/** Kanal durum anahtarı (yalnız `upload.TRANSFER.status` + `upload.onSale`). */
export type ChannelStateKey = 'live' | 'offsale' | 'failed' | 'waiting' | 'preparing' | 'none'

export interface ChannelState {
  key: ChannelStateKey
  tone: StatusTone
  icon: string
  label: string
  /** Hata/uyarı varsa kısa neden (ilk ileti). */
  reason?: string
}

const STATES: Record<ChannelStateKey, Omit<ChannelState, 'reason'>> = {
  live: { key: 'live', tone: 'success', icon: 'mdi-check-circle', label: 'Yayında' },
  offsale: { key: 'offsale', tone: 'warning', icon: 'mdi-pause-circle', label: 'Onaylandı, satışa kapalı' },
  failed: { key: 'failed', tone: 'danger', icon: 'mdi-alert-circle', label: 'Reddedildi' },
  waiting: { key: 'waiting', tone: 'info', icon: 'mdi-clock-outline', label: 'Onay bekliyor' },
  preparing: { key: 'preparing', tone: 'info', icon: 'mdi-upload-outline', label: 'Hazırlanıyor' },
  none: { key: 'none', tone: 'neutral', icon: 'mdi-circle-outline', label: 'Gönderilmedi' },
}

/** Kısa neden: gönderim adımının iletisi, yoksa kanal durum iletisi (ilk satır, ≤ 140 karakter). */
export function channelReason(platform: any): string | undefined {
  const upload = platform?.upload
  const raw = [...(upload?.TRANSFER?.messages ?? []), ...(upload?.statusMessages ?? [])].find((m) => typeof m === 'string' && m.trim())
  if (!raw) return undefined
  const line = String(raw).trim().split('\n')[0]
  return line.length > 140 ? `${line.slice(0, 139)}…` : line
}

export function channelState(variant: any, code: string): ChannelState {
  const platform = variant?.platforms?.[code]
  const upload = platform?.upload
  const status = upload?.TRANSFER?.status
  let key: ChannelStateKey = 'none'
  if (status === 'COMPLETED') key = upload?.onSale === true ? 'live' : 'offsale'
  else if (status === 'FAILED') key = 'failed'
  else if (status === 'SENT' || status === 'WAITING') key = 'waiting'
  else if (status === 'PENDING') key = 'preparing'
  const reason = key === 'failed' || key === 'offsale' ? channelReason(platform) : undefined
  return { ...STATES[key], ...(reason ? { reason } : {}) }
}

/** Stok eşiği (yalnız görünüm): bu değer ve altı "Az" uyarı tonunda. Backend'de ürün/varyant başına eşik alanı yok. */
export const LOW_STOCK_THRESHOLD = 5

export type StockTone = 'out' | 'low' | 'ok'

export function stockTone(stock: unknown): StockTone {
  const n = Number(stock)
  if (!Number.isFinite(n) || n <= 0) return 'out'
  return n <= LOW_STOCK_THRESHOLD ? 'low' : 'ok'
}

/** Ayırıcı (slicer) seçenek: `slicer: true` olan, yoksa ilk seçenek. */
export function slicerChoice(choices: any[] | undefined): any {
  return choices?.find((c) => c?.slicer === true) || choices?.[0] || {}
}

/** Satırda gösterilen seçenekler: ayırıcı dışındakiler (gruplu görünümde ayırıcı grup başlığındadır). */
export function rowChoices(choices: any[] | undefined, grouped: boolean): any[] {
  if (!choices?.length) return []
  if (!grouped) return choices
  const s = slicerChoice(choices)
  const rest = choices.filter((c) => c !== s)
  return rest.length ? rest : [s]
}

export interface VariantGroup<T = any> {
  key: string
  /** Ayırıcı seçeneğin choiceId / choiceValueId'si (başlık metni bileşende çözülür). */
  choiceId?: string
  choiceValueId?: string
  variants: T[]
  totalStock: number
}

/** Ardışık varyantları ayırıcı seçenek değerine göre gruplar (sıralama önceden yapılmış olmalı). */
export function groupVariants<T extends { choices?: any[]; stock?: unknown }>(variants: T[]): VariantGroup<T>[] {
  const groups: VariantGroup<T>[] = []
  for (const v of variants) {
    const s = slicerChoice(v.choices)
    const key = String(s.choiceValueId ?? '—')
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) {
      g = { key, choiceId: s.choiceId, choiceValueId: s.choiceValueId, variants: [], totalStock: 0 }
      groups.push(g)
    }
    g.variants.push(v)
    g.totalStock += Math.max(0, Number(v.stock) || 0)
  }
  return groups
}

export interface ChannelCoverage {
  code: string
  live: number
  offsale: number
  failed: number
  waiting: number
  none: number
  /** Kanala gönderilmiş (herhangi bir durumu olan) varyant sayısı. */
  sent: number
}

export interface VariantSummary {
  count: number
  totalStock: number
  outOfStock: number
  lowStock: number
  channels: ChannelCoverage[]
  failedTotal: number
}

export function summarizeVariants(variants: any[], channelCodes: string[]): VariantSummary {
  const channels: ChannelCoverage[] = channelCodes.map((code) => ({ code, live: 0, offsale: 0, failed: 0, waiting: 0, none: 0, sent: 0 }))
  let totalStock = 0
  let outOfStock = 0
  let lowStock = 0
  for (const v of variants) {
    const n = Math.max(0, Number(v?.stock) || 0)
    totalStock += n
    const tone = stockTone(v?.stock)
    if (tone === 'out') outOfStock++
    else if (tone === 'low') lowStock++
    for (const c of channels) {
      const s = channelState(v, c.code).key
      if (s === 'live') c.live++
      else if (s === 'offsale') c.offsale++
      else if (s === 'failed') c.failed++
      else if (s === 'waiting' || s === 'preparing') c.waiting++
      else c.none++
      if (s !== 'none') c.sent++
    }
  }
  return { count: variants.length, totalStock, outOfStock, lowStock, channels, failedTotal: channels.reduce((a, c) => a + c.failed, 0) }
}

/** Çok varyantta ilk görünümde gösterilen satır sayısı (fazlası "Tümünü gör" ile açılır). */
export const COMPACT_LIMIT = 8
