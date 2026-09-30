/**
 * frontend/src/design/channels.ts
 *
 * DS-v2 Aşama 5 — kanal (pazaryeri/entegrasyon) kimliği: ad + renk kapsam sınıfı. Renk değerleri
 * `tokens/palette.ts` `channelPalette`'te (TEK kaynak); CSS'e `--ek-channel-<kod>-*` ve `.ek-ch-<kod>`
 * kapsam sınıfı olarak üretilir. Bileşen yalnız `channelClass(code)` ekler, stilde `var(--ek-ch-solid|subtle|border|text)`.
 * SAF TS (Vue import'u yok).
 */
import { channelPalette, type ChannelCode } from './tokens/palette'

export const CHANNEL_NAMES: Record<ChannelCode, string> = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
  n11: 'N11',
  pazarama: 'Pazarama',
  ideasoft: 'Ideasoft',
  bizimhesap: 'Bizimhesap',
}

/** Bilinen kanal kodu (küçük harf) ya da tanımsız. */
export function channelCode(code?: string | null): ChannelCode | undefined {
  const key = String(code ?? '').toLowerCase()
  return key in channelPalette ? (key as ChannelCode) : undefined
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
