/**
 * frontend/src/design/channels.ts
 *
 * Kanal (pazaryeri/entegrasyon) kimliği: ad + marka rengi. Renk değerleri `tokens/palette.ts` `channelPalette`'te
 * (TEK kaynak, C1: resmi marka rengi + hesaplanmış `onBrand`); CSS'e `--ek-channel-<kod>-{brand,on-brand,secondary}`
 * ve `.ek-ch-<kod>` kapsam sınıfı olarak üretilir. Bileşen yalnız `channelClass(code)` ekler, stilde
 * `var(--ek-ch-brand|on-brand|secondary)`; CSS'e erişemeyen tüketici (grafik vb.) `channelColors(code)` kullanır.
 * Ham kanal hex'i bileşende YAZILMAZ (`tests/theme/channel-single-source.test.ts`). SAF TS (Vue import'u yok).
 */
import { channelPalette, type ChannelCode } from './palette'

export const CHANNEL_NAMES: Record<ChannelCode, string> = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
  n11: 'N11',
  pazarama: 'Pazarama',
  ideasoft: 'Ideasoft',
  bizimhesap: 'Bizimhesap',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
}

/**
 * K13 / FR2 madde 12 — kanalın KISA formu (rozet monogramı, dar sütun, kanal başına durum hücresi). Uzun form = `CHANNEL_NAMES`.
 * Tek kayıt: kısa/uzun her yerde bu iki tablodan (`channelShort` / `channelName`); ekranda elle kısaltma YAZILMAZ.
 */
export const CHANNEL_SHORT: Record<ChannelCode, string> = {
  trendyol: 'TY',
  hepsiburada: 'HB',
  n11: 'N11',
  pazarama: 'PZ',
  ideasoft: 'IS',
  bizimhesap: 'BH',
  shopify: 'SH',
  woocommerce: 'WC',
}

/**
 * FR2 madde 13 — KARGO FİRMASI kaydı (kargoya ver / filtreler). Aynı rozet biçimini kullanır (`EkChannelBadge kind="carrier"`).
 * `aliases`: sipariş/kargo kayıtlarında serbest metin olarak gelen firma adları (büyük/küçük harf ve Türkçe karakter duyarsız).
 * RENK: kargo markalarının renkleri henüz ÖLÇÜLMEDİ (CHANNEL_BRAND_COLORS.md "ölçülmedi → nötr gri" kuralı; K13 "tahmini renk
 * kullanılmaz") → tüm firmalar şimdilik NÖTR rozet. Ölçülen değer `palette.ts` `channelPalette`'e firma koduyla (ör. `yurtici`)
 * eklendiği anda rozet kendiliğinden marka tonunu alır; bileşen değişmez.
 */
export const CARRIERS = {
  yurtici: { name: 'Yurtiçi Kargo', short: 'YK', aliases: ['yurtiçi', 'yurtici', 'yurtiçi kargo', 'yurtici kargo'] },
  aras: { name: 'Aras Kargo', short: 'AR', aliases: ['aras', 'aras kargo'] },
  mng: { name: 'MNG Kargo', short: 'MNG', aliases: ['mng', 'mng kargo', 'dhl ecommerce', 'dhl e-commerce'] },
  surat: { name: 'Sürat Kargo', short: 'SÜ', aliases: ['sürat', 'surat', 'sürat kargo', 'surat kargo'] },
  ptt: { name: 'PTT Kargo', short: 'PTT', aliases: ['ptt', 'ptt kargo'] },
  trendyolexpress: { name: 'Trendyol Express', short: 'TEX', aliases: ['trendyol express', 'tex', 'trendyolexpress'] },
  hepsijet: { name: 'HepsiJET', short: 'HJ', aliases: ['hepsijet', 'hepsi jet'] },
  ups: { name: 'UPS Kargo', short: 'UPS', aliases: ['ups', 'ups kargo'] },
  kolaygelsin: { name: 'Kolay Gelsin', short: 'KG', aliases: ['kolay gelsin', 'kolaygelsin'] },
  sendeo: { name: 'Sendeo', short: 'SD', aliases: ['sendeo'] },
} as const satisfies Record<string, { name: string; short: string; aliases: readonly string[] }>

export type CarrierCode = keyof typeof CARRIERS

const foldTr = (s: string) => s.trim().toLocaleLowerCase('tr-TR')

/** Kargo firması kodu: kod ya da (serbest metin) firma adı → bilinen kod; bilinmiyorsa `undefined`. */
export function carrierCode(codeOrName?: string | null): CarrierCode | undefined {
  const key = foldTr(String(codeOrName ?? ''))
  if (!key) return undefined
  if (Object.prototype.hasOwnProperty.call(CARRIERS, key)) return key as CarrierCode
  for (const [code, c] of Object.entries(CARRIERS)) {
    if (foldTr(c.name) === key || (c.aliases as readonly string[]).includes(key)) return code as CarrierCode
  }
  return undefined
}

/** Kargo firması seçenekleri (seçim listesi): değer = görünen ad (mevcut kayıtlarla uyumlu), `carrier` = kod. */
export function carrierOptions(extra: string[] = ['Diğer']): Array<{ value: string; title: string; carrier: string }> {
  const list = Object.entries(CARRIERS).map(([code, c]) => ({ value: c.name as string, title: c.name as string, carrier: code }))
  return [...list, ...extra.map((t) => ({ value: t, title: t, carrier: '' }))]
}

/** Baş harflerden kısa form (bilinmeyen kanal/firma): "Özel Mağaza" → "ÖM", "Amazon" → "AM". */
function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase('tr-TR')
  return (words[0][0] + words[1][0]).toLocaleUpperCase('tr-TR')
}

/**
 * Kısa form: bilinen kanal → `CHANNEL_SHORT`; bilinen kargo firması → `CARRIERS[..].short`; diğerleri → addan baş harfler.
 */
export function channelShort(code?: string | null, name?: string | null): string {
  const known = channelCode(code)
  if (known) return CHANNEL_SHORT[known]
  const carrier = carrierCode(code) ?? carrierCode(name)
  if (carrier) return CARRIERS[carrier].short
  return initials(name || String(code ?? '') || '?')
}

/** Uzun form (kanal ya da kargo firması): verilen ad → kanal adı → kargo firması adı → kodun baş harfi büyük hali. */
export function brandName(code?: string | null, name?: string | null): string {
  if (name) return name
  if (channelCode(code)) return channelName(code)
  const carrier = carrierCode(code)
  if (carrier) return CARRIERS[carrier].name
  return channelName(code)
}

/** Bilinen kanal kodu (küçük harf) ya da tanımsız. */
export function channelCode(code?: string | null): ChannelCode | undefined {
  const key = String(code ?? '').trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(channelPalette, key) ? (key as ChannelCode) : undefined
}

/** Renk kapsam sınıfı: bilinen kanal → `ek-ch-<kod>`, diğerleri → `ek-ch-neutral`. */
export function channelClass(code?: string | null): string {
  return `ek-ch-${channelCode(code) ?? 'neutral'}`
}

/** Görünen ad: verilen ad → bilinen kanal adı → kodun baş harfi büyük hali → "Bilinmeyen". */
export function channelName(code?: string | null, name?: string | null): string {
  if (name) return name
  const known = channelCode(code)
  if (known) return CHANNEL_NAMES[known]
  const raw = String(code ?? '')
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Bilinmeyen'
}

/** Kanal renkleri (CSS dışı tüketici için): bilinen kanal → marka/onBrand/ikincil; diğerleri → `undefined` (nötr). */
export function channelColors(code?: string | null): { brand: string; onBrand: string; secondary?: string } | undefined {
  const known = channelCode(code)
  if (!known) return undefined
  const t = channelPalette[known] as { brand: string; onBrand: string; secondary?: string }
  return { brand: t.brand, onBrand: t.onBrand, secondary: t.secondary }
}
