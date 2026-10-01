/**
 * ELEV (marka kimliği, `docs/elev/BRAND.md`) — ses tonu koruması: pazarlama sayfalarının ziyaretçiye görünen metninde
 * (görünür metin + title + meta description) teknik/yabancı terim yok (K44), "erken erişim / örnek görünüm" dili yok (K43).
 * Sözlük: `src/data/brand.ts` → `VOICE_BANNED`. Rehber (bilgi merkezi) ve yasal metinler kapsam dışıdır.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { buildSite } from '../scripts/lib/build.mjs'
import { VOICE_BANNED, MESSAGE_PILLARS, BRAND_SLOGAN } from '../src/data/brand'

const lower = (s: string) => s.toLocaleLowerCase('tr-TR')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : []
  })
}

const decode = (s: string) =>
  s.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** Görünür metin + başlık + meta açıklamalar (JSON-LD ve gizli dev notları hariç). */
export function marketingText(html: string): string {
  const metas = [...html.matchAll(/<meta (?:name|property)="(?:description|og:description|og:title)" content="([^"]*)"/g)].map((m) => m[1])
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''
  const body = html
    .replace(/<head[\s\S]*?<\/head>/g, '')
    .replace(/<(script|style|template)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ')
  return decode([title, ...metas, body].join('\n')).replace(/\s+/g, ' ')
}

export function voiceViolations(rel: string, text: string): string[] {
  const t = lower(text)
  const out: string[] = []
  for (const b of VOICE_BANNED) {
    if (b.allowIn?.some((p) => rel.startsWith(p))) continue
    const m = t.match(b.pattern)
    if (m) {
      const i = m.index ?? 0
      out.push(`${rel}: "${t.slice(Math.max(0, i - 40), i + 40)}" → ${b.use}`)
    }
  }
  return out
}

const OUT_OF_SCOPE = /^(rehber|yasal|bilesen-onizleme)\//

describe('marka sesi: pazarlama sayfalarında teknik terim yok', () => {
  let outDir = ''
  beforeAll(() => {
    outDir = buildSite({
      outDir: 'dist-brand',
      env: { SITE_DRAFT: 'false', PUBLIC_APP_URL: 'https://app.example.test', PUBLIC_SITE_URL: 'https://www.example.test' },
      silent: true,
    })
  }, 240_000)

  it('sözlük kendini sınar', () => {
    expect(voiceViolations('index.html', 'Overselling riskini azaltın')).toHaveLength(1)
    expect(voiceViolations('index.html', 'Ürün varyantı (SKU) hacmi')).toHaveLength(1)
    expect(voiceViolations('index.html', 'Skull değil')).toHaveLength(0)
    expect(voiceViolations('guvenlik/index.html', 'AES-256-GCM ile şifrelenir')).toHaveLength(0)
    expect(voiceViolations('index.html', 'AES-256-GCM ile şifrelenir')).toHaveLength(1)
    expect(voiceViolations('index.html', 'Aşırı satışa karşı stok rezervasyonu')).toHaveLength(0)
  })

  it('marka kaydı tutarlı: dört sütun, kısa slogan', () => {
    expect(MESSAGE_PILLARS.map((p) => p.id)).toEqual(['control', 'accuracy', 'time', 'trust'])
    expect(BRAND_SLOGAN.split(' ').length).toBeLessThanOrEqual(5)
    for (const p of MESSAGE_PILLARS) expect(voiceViolations('index.html', `${p.pain} ${p.answer}`)).toEqual([])
  })

  it('derlenmiş pazarlama sayfaları (rehber ve yasal hariç): ihlal yok', () => {
    const found = walk(outDir)
      .map((f) => ({ rel: path.relative(outDir, f).split(path.sep).join('/'), f }))
      .filter(({ rel }) => !OUT_OF_SCOPE.test(rel))
      .flatMap(({ rel, f }) => voiceViolations(rel, marketingText(readFileSync(f, 'utf8'))))
    expect(found).toEqual([])
  })

  it('footer marka sloganını taşır', () => {
    const home = readFileSync(path.join(outDir, 'index.html'), 'utf8')
    expect(marketingText(home)).toContain(BRAND_SLOGAN)
  })
})
