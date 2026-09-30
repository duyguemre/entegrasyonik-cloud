/**
 * Ajan ürününün ADI — TEK SABİT (S22, SR2-AGENT madde 2).
 *
 * Ad değiştirmek = yalnızca `AGENT_BRAND` satırı. Buradan türeyenler: sayfa rotası (`src/pages/[ajan].astro`
 * getStaticPaths), SEO kaydı (başlık/ekmek kırıntısı), llms.txt / llms-full.txt, header/footer gezinme etiketi ve
 * hedefi (`navigation.ts`), sayfa ve ana sayfa kopyası (`assistant.ts`), erken erişim e-posta konusu ve eski
 * adreslerden 301 yönlendirme (`dist/_redirects`, astro.config.mjs).
 *
 * Ad değişince eski rota `AGENT_LEGACY_PATHS`'e eklenmelidir (yayındaki bağlantılar kırılmasın; test korur:
 * tests/upcoming.test.ts "ad sabiti"). Üçüncü taraf/rakip ürün adı (ör. "Copilot") kullanılmaz — test korur.
 *
 * Aday adlar (docs/cloud-contracts/SITE_FEEDBACK_R2_2026-09-30.md; kullanıcı seçene kadar varsayılan = 1):
 *   1. Otopilot — "Entegrasyonik Otopilot: operasyon ajanları"   2. Operasyon Ajanları   3. Kontrol Kulesi
 * Bu dosya iddia içermez (yalnızca ad + yol).
 */

export const AGENT_BRAND = 'Otopilot'

/** Adın ne olduğunu söyleyen kısa betimleyici (ad değişse de doğru kalır). */
export const AGENT_DESCRIPTOR = 'operasyon ajanları'

/** Tam ürün adı: "Entegrasyonik Otopilot". */
export const AGENT_NAME = `Entegrasyonik ${AGENT_BRAND}`

const FOLD: Record<string, string> = { ç: 'c', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ı: 'i', â: 'a', î: 'i', û: 'u' }

/** Türkçe karakterleri katlayan URL kısaltması: "Kontrol Kulesi" -> "kontrol-kulesi". */
export function slugify(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çşğüöıâîû]/g, (c) => FOLD[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const AGENT_SLUG = slugify(AGENT_BRAND)
export const AGENT_PATH = `/${AGENT_SLUG}`

/** Eski adresler → `AGENT_PATH`'e 301 (S18 "Asistan" sayfası). Ad değişirse önceki slug buraya eklenir. */
export const AGENT_LEGACY_PATHS: readonly string[] = ['/asistan'].filter((p) => p !== AGENT_PATH)
