import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHANNEL_ACCENT_CODES } from '../src/data/channel-colors'

/*
 * C1S (2026-09-30) — kanal marka renkleri. Kullanıcı: "Entegrasyonların kendi renklerini kullan; sitenin genelinde
 * uyumlu, her yerde aynı renk olsun." Resmi renk, tint değil; frontend ile AYNI değerler.
 *
 * Aşağıdaki tablo docs/cloud-contracts/CHANNEL_BRAND_COLORS.md (TEK KAYNAK, kullanıcı onaylı) "Birincil (marka)"
 * sütununun birebir kopyasıdır. Belge değişirse önce bu sabit, sonra site-tokens.css güncellenir.
 */
const DOC_BRAND_COLORS = {
  trendyol: '#FF6620',
  hepsiburada: '#FF6000',
  n11: '#FF44EE',
  pazarama: '#0137F3',
  ideasoft: '#391EE0',
  bizimhesap: '#20554E',
  shopify: '#7AB55C',
  woocommerce: '#873EFF',
} as const
/**
 * Belgede "Entegrasyon yok, yalnız UI formu" — sitede token'ı da eşlemesi de YOK (nötr); adları site kaynağında
 * geçemez (gizli roadmap, tests/claims.test.ts). Değerleri yalnız frontend taşır.
 */
const UI_ONLY = ['shopify', 'woocommerce']
/** S8'deki eski, doğrulanmamış yaklaşık tonlar — hiçbir yerde kalmamalı. */
const OLD_APPROX_HEX = ['#f27a1a', '#5c2d91', '#6c3ce1', '#0063e5', '#00a86b']

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(siteRoot, 'src')
const read = (p: string) => readFileSync(p, 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')
function walk(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) return walk(p, exts)
    return exts.some((e) => p.endsWith(e)) ? [p] : []
  })
}
const siteTokens = stripComments(read(path.join(src, 'styles/site-tokens.css')))
const globalCss = stripComments(read(path.join(src, 'styles/global.css')))
const sourceFiles = walk(src, ['.astro', '.css', '.ts', '.mjs'])

const token = (name: string) => siteTokens.match(new RegExp(`\\s${name}:\\s*([^;]+);`))?.[1].trim()

// WCAG 2.x göreli parlaklık / kontrast
const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

describe('kanal marka renkleri — tek kaynak (CHANNEL_BRAND_COLORS.md)', () => {
  it('belge yerelde mevcutsa sabit onunla birebir aynı', () => {
    const doc = path.resolve(siteRoot, '../docs/cloud-contracts/CHANNEL_BRAND_COLORS.md')
    if (!existsSync(doc)) return // bulut dalında belge yok; sabit belgeden kopyalandı
    const text = read(doc)
    for (const [code, hex] of Object.entries(DOC_BRAND_COLORS)) {
      const row = text.split('\n').find((l) => l.toLowerCase().startsWith(`| ${code} |`))
      expect(row, code).toBeDefined()
      expect(row!.split('|')[2]).toContain(`\`${hex}\``)
    }
  })

  const implemented = Object.entries(DOC_BRAND_COLORS).filter(([code]) => !UI_ONLY.includes(code))

  it('her uygulanmış kanal için --channel-<kod> belgedeki değerle birebir (tint/karartma yok)', () => {
    expect(implemented.map(([code]) => code)).toEqual([...CHANNEL_ACCENT_CODES])
    for (const [code, hex] of implemented) {
      expect(token(`--channel-${code}`), code).toBe(hex)
    }
    for (const code of UI_ONLY) expect(token(`--channel-${code}`), code).toBeUndefined()
  })

  it('--channel-<kod>-on siyah/beyaz ve ≥4.5:1 (ikisinden daha yüksek kontrastlısı)', () => {
    for (const [code, hex] of implemented) {
      const on = token(`--channel-${code}-on`)
      expect(['#000000', '#FFFFFF'], code).toContain(on)
      expect(contrast(hex, on!), code).toBeGreaterThanOrEqual(4.5)
      const best = contrast(hex, '#000000') >= contrast(hex, '#FFFFFF') ? '#000000' : '#FFFFFF'
      expect(on, code).toBe(best)
    }
  })

  it('nötr kanal token\'ı --ek-* türevi (ham renk değil)', () => {
    expect(token('--channel-neutral')).toMatch(/^var\(--ek-color-/)
    expect(token('--channel-neutral-on')).toMatch(/^var\(--ek-color-/)
  })
})

describe('kanal renkleri — tüm kullanımlar token\'a bağlı', () => {
  it('uygulanmış kanallar [data-code] ile --chan/--chan-on\'a eşlenir; yalnız-UI kanallar eşlenmez', () => {
    const mapped = [...globalCss.matchAll(/\[data-code='([\w-]+)'\]\s*\{([^}]*)\}/g)]
    expect(mapped.map((m) => m[1])).toEqual([...CHANNEL_ACCENT_CODES])
    for (const [, code, body] of mapped) {
      expect(body).toContain(`--chan: var(--channel-${code});`)
      expect(body).toContain(`--chan-on: var(--channel-${code}-on);`)
    }
    for (const code of UI_ONLY) expect(CHANNEL_ACCENT_CODES as readonly string[]).not.toContain(code)
  })

  it('eşlenmemiş kod nötr varsayılana düşer (özgüllük sıfır, plan kartları hariç)', () => {
    expect(globalCss).toMatch(/:where\(\[data-code\]:not\(\[data-part='plan'\]\)\)\s*\{\s*--chan: var\(--channel-neutral\);\s*--chan-on: var\(--channel-neutral-on\);/)
  })

  it('kaynakta ham kanal hex\'i ve eski token/türevler kalmadı', () => {
    const brandHex = Object.values(DOC_BRAND_COLORS).map((h) => h.toLowerCase())
    const offenders: string[] = []
    for (const file of sourceFiles) {
      const rel = path.relative(siteRoot, file)
      const text = stripComments(read(file))
      const lower = text.toLowerCase()
      if (/--site-channel-|--chan-fill/.test(text)) offenders.push(`${rel}: eski token`)
      for (const h of OLD_APPROX_HEX) if (lower.includes(h)) offenders.push(`${rel}: ${h}`)
      if (rel.endsWith('site-tokens.css')) continue
      for (const h of brandHex) if (lower.includes(h)) offenders.push(`${rel}: ${h}`)
    }
    expect(offenders).toEqual([])
  })

  it('monogram rozeti resmi rengi olduğu gibi kullanır (gradyan yok), harf rengi --chan-on', () => {
    const mono = stripComments(read(path.join(src, 'components/pages/ChannelMono.astro')))
    expect(mono).toContain('background: var(--chan, var(--channel-neutral));')
    expect(mono).toContain('color: var(--chan-on, var(--channel-neutral-on));')
    expect(mono).not.toMatch(/gradient/)
  })
})
