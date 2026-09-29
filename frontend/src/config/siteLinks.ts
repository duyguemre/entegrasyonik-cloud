/**
 * frontend/src/config/siteLinks.ts
 *
 * ADR-0014 — tanıtım sitesine (ayrı origin) bağlantılar: "Ana site" ve kayıt formundaki yasal metinler.
 * Taban adres derleme zamanında `VITE_SITE_URL` ortam değişkeninden gelir (bkz. `.env.example`);
 * üretim alan adı KAYNAK KODA GÖMÜLMEZ (ADR-0014 Açık Soru 2 — insan kararı). Verilmezse yerel
 * geliştirme varsayılanı (`site/` Astro dev sunucusu). Yalnızca http(s) kabul edilir; geçersiz değer
 * varsayılana düşer (`javascript:` vb. şemalar bağlantıya ASLA girmez).
 *
 * SAF TS: `resolveSiteBase` testte doğrudan çağrılır.
 */

export const DEFAULT_SITE_URL = 'http://localhost:4321'

export function resolveSiteBase(raw: string | undefined | null): string {
  const value = (raw ?? '').trim()
  if (!value) return DEFAULT_SITE_URL
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return DEFAULT_SITE_URL
    return parsed.origin + parsed.pathname.replace(/\/+$/, '')
  } catch {
    return DEFAULT_SITE_URL
  }
}

export const siteBaseUrl = resolveSiteBase((import.meta as any).env?.VITE_SITE_URL)

/** Sitedeki yasal sayfa yolları (`site/src/data/navigation.ts` `legalNav` ile aynı — testle korunur). */
export const SITE_LEGAL_PATHS = {
  kvkk: '/yasal/kvkk-aydinlatma',
  terms: '/yasal/kullanim-kosullari',
  subscription: '/yasal/abonelik-sozlesmesi',
  preInfo: '/yasal/on-bilgilendirme',
} as const

export type SiteLegalKey = keyof typeof SITE_LEGAL_PATHS

export function siteUrl(path: string, base: string = siteBaseUrl): string {
  return `${base}${path}`
}
