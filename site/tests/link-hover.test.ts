/**
 * S27b (SR4-11, K50): site genelinde hover'da ALT ÇİZGİ yok — tek global kural (`src/styles/global.css`).
 * Hover dili: renk geçişi; metin içi bağlantıda yumuşak "işaret" zemini; ok ikonlu bağlantıda ok ileri kayar.
 * Erişilebilirlik: metin içi bağlantı varsayılanda yarı kalın (renk tek başına değil, WCAG 1.4.1); odak halkası korunur.
 * Kaynak taraması + derlenmiş CSS taraması (Astro'nun ürettiği nihai stil dosyaları).
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSite } from '../scripts/lib/build.mjs'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(siteRoot, 'src')

function walk(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) return walk(p, exts)
    return exts.some((e) => p.endsWith(e)) ? [p] : []
  })
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
/** `.astro` dosyasında yalnız <style> blokları; `.css` dosyasının tamamı. */
const styleOf = (p: string) => {
  const raw = readFileSync(p, 'utf8')
  const css = p.endsWith('.css') ? raw : [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
  return stripComments(css)
}
const rel = (p: string) => path.relative(siteRoot, p)

/** Kural blokları: [seçici, gövde]. İç içe @media blokları için yeterli (en içteki kural yakalanır). */
const rules = (css: string) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))

const UNDERLINE = /text-decoration(?:-line)?\s*:[^;]*underline|text-underline-offset|text-decoration-thickness/

describe('hover alt çizgisi yok (kaynak)', () => {
  const files = walk(src, ['.astro', '.css'])

  it('hiçbir stil alt çizgi tanımlamaz (text-decoration: underline, alt çizgi ofseti/kalınlığı)', () => {
    const hits = files.filter((f) => UNDERLINE.test(styleOf(f))).map(rel)
    expect(hits).toEqual([])
  })

  it('hover/odak kuralları alt kenar çizgisiyle sahte alt çizgi üretmez (border-bottom, inset alt gölge)', () => {
    const hits: string[] = []
    for (const f of files) {
      for (const r of rules(styleOf(f))) {
        if (!/:hover|:focus/.test(r.sel)) continue
        if (/border-bottom|box-shadow\s*:\s*inset\s+0\s+-/.test(r.body)) hits.push(`${rel(f)} → ${r.sel}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('global kural: bağlantılar alt çizgisiz; hover renk + metin içinde zemin; ok kayar', () => {
    const g = styleOf(path.join(src, 'styles/global.css'))
    const all = rules(g)
    const a = all.find((r) => r.sel === 'a')
    expect(a?.body).toMatch(/text-decoration:\s*none/)
    expect(all.find((r) => r.sel === 'a:hover')?.body).toMatch(/color:\s*var\(--site-color-link-hover\)/)
    // Metin içi bağlantı: varsayılan yarı kalın (ayırt edicilik), hover/odakta zemin
    expect(all.some((r) => /a:not\(\[class\]\)$/.test(r.sel) && /font-weight/.test(r.body))).toBe(true)
    expect(all.some((r) => /a:not\(\[class\]\):is\(:hover, :focus-visible\)/.test(r.sel) && /background-color/.test(r.body))).toBe(true)
    expect(all.some((r) => /a:hover \.icon\[data-icon='arrow'\]/.test(r.sel) && /transform/.test(r.body))).toBe(true)
    // Odak halkası değişmedi
    expect(all.find((r) => r.sel === ':focus-visible')?.body).toMatch(/outline:/)
  })
})

describe('hover alt çizgisi yok (derlenmiş CSS)', () => {
  let css = ''
  beforeAll(() => {
    const out = buildSite({ outDir: 'dist-hover', env: { SITE_DRAFT: 'true', PUBLIC_APP_URL: 'https://app.example.test' }, silent: true })
    const files = walk(out, ['.css', '.html'])
    css = files
      .map((f) => {
        const raw = readFileSync(f, 'utf8')
        return f.endsWith('.css') ? raw : [...raw.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')
      })
      .join('\n')
  }, 240_000)

  it('nihai stil çıktısında alt çizgi yok', () => {
    expect(css.length).toBeGreaterThan(1000)
    expect(css).not.toMatch(/underline/)
  })
})
