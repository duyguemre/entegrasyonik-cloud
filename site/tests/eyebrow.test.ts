/**
 * S27b — N6 (ELEV A14): tek eyebrow biçimi. Bölüm/sayfa başlıklarının üst etiketi yalnız `Eyebrow.astro`'dan gelir;
 * biçim yalnız `--site-eyebrow-*` tokenlarıyla (ham değer yok); çizgi işareti her yerde aynı.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string) => readFileSync(path.join(siteRoot, p), 'utf8')
const style = (p: string) => [...read(p).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')

describe('tek Eyebrow bileşeni', () => {
  it('bölüm/sayfa başlık bileşenleri Eyebrow kullanır, kendi eyebrow biçimini tanımlamaz', () => {
    for (const f of ['src/components/home/SectionHeading.astro', 'src/components/pages/SectionHead.astro', 'src/components/pages/PageHero.astro', 'src/pages/fiyatlandirma.astro', 'src/components/Header.astro']) {
      expect(read(f), f).toMatch(/import Eyebrow from/)
      expect(style(f), f).not.toMatch(/__eyebrow[\w-]*\s*\{[^}]*text-transform/)
    }
  })

  it('Eyebrow biçimi yalnız --site-eyebrow-* tokenlarından; tokenlar site-tokens.css\'te tanımlı', () => {
    const css = style('src/components/Eyebrow.astro')
    for (const prop of ['color', 'font-size', 'font-weight', 'letter-spacing']) {
      expect(css).toMatch(new RegExp(`${prop}:\\s*var\\(--site-eyebrow-`))
    }
    const tokens = read('src/styles/site-tokens.css')
    for (const t of ['size', 'weight', 'tracking', 'color', 'gap', 'mark-width', 'mark-height']) expect(tokens).toContain(`--site-eyebrow-${t}:`)
  })
})
