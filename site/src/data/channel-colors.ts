/**
 * Pazaryeri/entegrasyon marka rengi eşlemesi (S8, 2026-09-29 — 2. tur: gerçek yaklaşık marka tonları).
 *
 * Gerçek renk DEĞERLERİ `src/styles/site-tokens.css` içindeki `--site-channel-*` token'larındadır. Bu
 * ALTI değişken, projenin "ham hex yasak" kuralının açıkça belgelenmiş TEK istisnasıdır (bkz. site-tokens.css
 * başındaki not + tests/tokens.test.ts `CHANNEL_HEX_EXCEPTIONS`); dosyanın geri kalanı hâlâ yalnızca
 * `--ek-color-*` türevi kullanır. Bileşenler yalnızca entegrasyon kodunu `data-code={code}` olarak DOM'a
 * yazar; rengi `src/styles/global.css` içindeki `[data-code='…']` eşlemesi çözer (`--chan` ham ton,
 * `--chan-fill` beyaz harfli dolu rozetler için karartılmış AA-güvenli ton). Bu üç dosya (burası +
 * site-tokens.css + global.css) TEK doğruluk kaynağıdır — yeni bir kanal eklenirse üçü birden güncellenir.
 *
 * Yaklaşık marka tonu, LOGO DEĞİL: değerler resmî marka kılavuzundan doğrulanmadı (araştırılıp en yakın
 * tahminle girildi), gerçek pazaryeri logoları kullanılmaz (marka izni açık soru, ADR-0014 Açık Soru 3).
 * Trendyol ve Hepsiburada ikisi de turuncu olduğundan ayırt edici monogram harfiyle (T/H) birlikte kullanılır.
 */
export const CHANNEL_ACCENT_CODES = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap'] as const

export type ChannelAccentCode = (typeof CHANNEL_ACCENT_CODES)[number]

/** `code` için tanımlı bir vurgu rengi var mı (yalnızca `[data-code]` uygulanabilir kodlar). */
export function hasChannelAccent(code: string): code is ChannelAccentCode {
  return (CHANNEL_ACCENT_CODES as readonly string[]).includes(code)
}
