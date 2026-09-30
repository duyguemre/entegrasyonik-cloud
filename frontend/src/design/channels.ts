/**
 * frontend/src/design/channels.ts
 *
 * Kanal (pazaryeri/entegrasyon) kimliği: ad + marka rengi. Renk değerleri `tokens/palette.ts` `channelPalette`'te
 * (TEK kaynak, C1: resmi marka rengi + hesaplanmış `onBrand`); CSS'e `--ek-channel-<kod>-{brand,on-brand,secondary}`
 * ve `.ek-ch-<kod>` kapsam sınıfı olarak üretilir. Bileşen yalnız `channelClass(code)` ekler, stilde
 * `var(--ek-ch-brand|on-brand|secondary)`; CSS'e erişemeyen tüketici (grafik vb.) `channelColors(code)` kullanır.
 * Ham kanal hex'i bileşende YAZILMAZ (`tests/theme/channel-single-source.test.ts`). SAF TS (Vue import'u yok).
 */
import { channelPalette, type ChannelCode } from './tokens/palette'

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
