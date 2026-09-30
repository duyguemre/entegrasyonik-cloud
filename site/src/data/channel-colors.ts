/**
 * Pazaryeri/entegrasyon marka rengi eşlemesi (C1S, 2026-09-30 — resmi, ölçülmüş marka renkleri).
 *
 * TEK KAYNAK: docs/cloud-contracts/CHANNEL_BRAND_COLORS.md (kullanıcı onaylı). Değerler
 * `src/styles/site-tokens.css` içindeki `--channel-<kod>` (marka) + `--channel-<kod>-on` (zemindeki metin:
 * siyah/beyaz, ≥4.5:1) token'larındadır; frontend aynı değerleri `channel.<kod>.brand/onBrand` olarak taşır.
 * Bu değişkenler projenin "ham hex yasak" kuralının belgelenmiş TEK istisnasıdır (tests/tokens.test.ts).
 * Bileşenler yalnızca entegrasyon kodunu `data-code={code}` olarak DOM'a yazar; rengi `src/styles/global.css`
 * içindeki `[data-code='…']` eşlemesi çözer (`--chan` marka rengi, `--chan-on` metin rengi). Marka rengi
 * değiştirilmez (tint/karartma yok). Listede olmayan (yalnız-UI/ölçülmemiş) kodlar nötr gri alır.
 *
 * LOGO DEĞİL: gerçek pazaryeri logoları kullanılmaz (marka izni açık soru, ADR-0014 Açık Soru 3).
 * Trendyol ve Hepsiburada ikisi de turuncu olduğundan ayırt edici monogram harfiyle (T/H) birlikte kullanılır.
 */
export const CHANNEL_ACCENT_CODES = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap'] as const

export type ChannelAccentCode = (typeof CHANNEL_ACCENT_CODES)[number]

/** `code` için tanımlı bir vurgu rengi var mı (yalnızca `[data-code]` uygulanabilir kodlar). */
export function hasChannelAccent(code: string): code is ChannelAccentCode {
  return (CHANNEL_ACCENT_CODES as readonly string[]).includes(code)
}
