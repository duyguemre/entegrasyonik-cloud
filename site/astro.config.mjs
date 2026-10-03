// @ts-check
// ADR-0014 Karar 1 — Astro statik çıktı, sıkı CSP uyumu, token'ların repo içinden doğrudan import'u.
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveSiteConfig } from './src/lib/site-config.ts'
import { buildHeadersFile } from './src/lib/headers.mjs'

const config = resolveSiteConfig(process.env)
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

/** `dist/_headers` (CSP vb.) — hosting'den bağımsız statik başlık dosyası. */
const securityHeaders = {
  name: 'entegrasyonik-security-headers',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      await writeFile(path.join(fileURLToPath(dir), '_headers'), buildHeadersFile(config.appUrl), 'utf8')
    },
  },
}

/**
 * Yalnızca `SITE_PREVIEW_ROUTES=true` (yerel/E2E derlemesi) iken bileşen önizleme sayfasını
 * ekler; normal ve production derlemesinde YOK. Sayfa her zaman noindex.
 */
const previewRoutes = {
  name: 'entegrasyonik-preview-routes',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      if (process.env.SITE_PREVIEW_ROUTES !== 'true') return
      injectRoute({ pattern: '/bilesen-onizleme', entrypoint: './src/dev/bilesen-onizleme.astro' })
    },
  },
}

export default defineConfig({
  output: 'static',
  // Alan adı henüz belirsiz (ADR-0014 Açık Soru 2): `site` yalnızca PUBLIC_SITE_URL verilince.
  site: config.siteUrl,
  outDir: process.env.SITE_OUT_DIR ?? 'dist',
  devToolbar: { enabled: false },
  trailingSlash: 'ignore',
  build: {
    // CSP `style-src 'self'`: satır içi <style> yok, tüm CSS harici dosya.
    inlineStylesheets: 'never',
  },
  integrations: [
    ...(config.draft ? [] : [sitemap()]), // taslakta sitemap üretilmez (noindex)
    securityHeaders,
    previewRoutes,
  ],
  vite: {
    build: {
      // CSP `script-src 'self'`: küçük betikler bile data: URI / satır içi olmasın.
      assetsInlineLimit: 0,
      // Tek CSS dosyası: iç sayfalarda 6+ ayrı engelleyici stil isteği LCP'yi geciktiriyordu (Lighthouse, mobil).
      cssCodeSplit: false,
    },
    server: {
      // tokens.static.css repo kökündeki frontend/ altında (ADR-0011: kopya yok → drift yok).
      fs: { allow: [repoRoot] },
    },
  },
})
