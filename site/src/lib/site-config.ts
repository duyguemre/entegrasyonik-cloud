/**
 * Site çalışma zamanı yapılandırması (ADR-0014 Karar 1 — "Ortam").
 *
 * Kaynak YALNIZCA ortam değişkenleridir (`process.env`); `.env` dosyası okunmaz —
 * `astro.config.mjs` ile sayfa kodu aynı değerleri görsün diye tek kaynak. `.env.example`
 * değişken adlarını belgeler.
 *
 * - `SITE_DRAFT` (varsayılan `true`): `noindex,nofollow` + TASLAK bandı. `false` yalnızca
 *   insan onayıyla (ADR-0014, Protokol 12).
 * - `PUBLIC_APP_URL`: uygulamanın taban adresi (Giriş / Ücretsiz dene bağlantıları).
 *   Yerel varsayılan `http://localhost:3000`; üretim adresi insan kararıdır.
 * - `PUBLIC_SITE_URL`: sitenin kendi adresi (canonical + sitemap). Yalnızca `SITE_DRAFT=false`
 *   iken zorunludur.
 */

export type Env = Record<string, string | undefined>

export interface SiteConfig {
  draft: boolean
  appUrl: string
  siteUrl: string | undefined
}

export const DEFAULT_APP_URL = 'http://localhost:3000'

/** `true`/`false` dışındaki her değer (boş dahil) güvenli tarafa düşer: TASLAK. */
function parseDraft(raw: string | undefined): boolean {
  if (raw === undefined) return true
  return raw.trim().toLowerCase() !== 'false'
}

function normalizeBase(url: string): string {
  const parsed = new URL(url) // geçersizse burada fail-fast
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`URL http(s) olmalı: ${url}`)
  }
  return parsed.origin + parsed.pathname.replace(/\/+$/, '')
}

export function resolveSiteConfig(env: Env): SiteConfig {
  const draft = parseDraft(env.SITE_DRAFT)
  const rawApp = env.PUBLIC_APP_URL?.trim()
  const rawSite = env.PUBLIC_SITE_URL?.trim()

  if (!draft) {
    if (!rawApp) throw new Error('SITE_DRAFT=false iken PUBLIC_APP_URL zorunlu (uygulama adresi).')
    if (!rawSite) throw new Error('SITE_DRAFT=false iken PUBLIC_SITE_URL zorunlu (canonical/sitemap).')
  }

  return {
    draft,
    appUrl: normalizeBase(rawApp || DEFAULT_APP_URL),
    siteUrl: rawSite ? normalizeBase(rawSite) : undefined,
  }
}

export type BillingInterval = 'month' | 'year'

const PLAN_CODE = /^[a-z0-9][a-z0-9-]{0,31}$/

export interface RegisterOptions {
  plan?: string
  interval?: BillingInterval | string
}

/** Uygulama bağlantıları — parametre sözleşmesi ADR-0014 Karar 2'de sabitlenmiştir. */
export function createAppUrls(appUrl: string) {
  return {
    login: () => `${appUrl}/login`,
    /**
     * `/login?mode=register[&plan=<kod>][&interval=<month|year>]`.
     * Bilinmeyen/biçimsiz `plan` veya `interval` SESSİZCE yok sayılır (ADR-0012 ile aynı disiplin).
     */
    register: (options: RegisterOptions = {}) => {
      const params = new URLSearchParams({ mode: 'register' })
      if (options.plan && PLAN_CODE.test(options.plan)) params.set('plan', options.plan)
      if (options.interval === 'month' || options.interval === 'year') {
        params.set('interval', options.interval)
      }
      return `${appUrl}/login?${params.toString()}`
    },
  }
}

export const siteConfig: SiteConfig = resolveSiteConfig(process.env)
export const appUrls = createAppUrls(siteConfig.appUrl)
