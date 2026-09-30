// @ts-check
// ADR-0014 Karar 1 — Astro statik çıktı, sıkı CSP uyumu, token'ların repo içinden doğrudan import'u.
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import { fileURLToPath } from 'node:url'
import { writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveSiteConfig } from './src/lib/site-config.ts'
import { buildHeadersFile } from './src/lib/headers.mjs'
import { htmlToMarkdown } from './src/lib/html-to-markdown.mjs'
import { lastModified } from './src/lib/lastmod.mjs'
import { findSeoEntry, indexableEntries, markdownPath, canonicalPath, entityDefinition, fullTitle } from './src/data/seo.ts'

const config = resolveSiteConfig(process.env)
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const siteRoot = fileURLToPath(new URL('.', import.meta.url))
const buildDate = new Date()

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
 * S19 — sayfa başına markdown alternatifi (`/sss.md`, ana sayfa `/index.md`): yalnızca indekslenebilir (SEO kaydında
 * `index: true`) sayfalar. İçerik derlenmiş HTML'in <main>'inden (src/lib/html-to-markdown.mjs); başa kaynak/canonical
 * bilgisi, sona tutarlı "Entegrasyonik nedir?" varlık tanımı eklenir. HTML'de `<link rel="alternate" type="text/markdown">`.
 */
const markdownAlternates = {
  name: 'entegrasyonik-markdown-alternates',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const out = fileURLToPath(dir)
      const origin = config.siteUrl
      const absUrl = (p) => (origin ? new URL(p, origin).href : p)
      for (const entry of indexableEntries()) {
        const htmlFile = path.join(out, entry.path === '/' ? 'index.html' : path.join(entry.path, 'index.html'))
        const html = await readFile(htmlFile, 'utf8')
        const body = htmlToMarkdown(html, {
          resolveHref: (href) => (href.startsWith('/') && !href.startsWith('//') ? absUrl(href) : href),
        })
        const md = [
          `<!-- ${fullTitle(entry)} — ${absUrl(canonicalPath(entry.path))} (markdown sürümü; kaynak: sayfanın görünür içeriği) -->`,
          '',
          `> ${entry.description}`,
          '',
          body.trim(),
          '',
          '## Entegrasyonik nedir?',
          '',
          entityDefinition(),
          '',
          `Kaynak sayfa: ${absUrl(canonicalPath(entry.path))} · Site özeti: ${absUrl('/llms.txt')}`,
          '',
        ].join('\n')
        await writeFile(path.join(out, markdownPath(entry.path)), md, 'utf8')
      }
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
    // Taslakta sitemap üretilmez (noindex). S19: yalnızca SEO kaydında `index: true` sayfalar (noindex yasal/404 YOK);
    // lastmod = kaynak dosyaların son git commit tarihi; priority/changefreq yazılmaz; kullanılmayan ad alanları kapalı.
    ...(config.draft
      ? []
      : [
          sitemap({
            filter: (page) => findSeoEntry(new URL(page).pathname)?.index === true,
            serialize: (item) => {
              const entry = findSeoEntry(new URL(item.url).pathname)
              return { url: item.url, lastmod: entry ? lastModified(entry.sources, siteRoot, buildDate).toISOString() : undefined }
            },
            namespaces: { news: false, xhtml: false, image: false, video: false },
          }),
        ]),
    securityHeaders,
    markdownAlternates,
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
