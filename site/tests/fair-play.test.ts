/**
 * PRC-MKT (K58) — adil rekabet ilkesi ve hukuki risk bekçisi.
 *
 * (1) Kayıt: `src/data/fair-play.ts` ilkeleri bugün doğru (kanıt dosyası mevcut + atıf metni geçer), kısa, "siz" dilinde;
 *     rakip/pazaryeri adı ve mutlak/garanti dili yok.
 * (2) Bekçi: derlenmiş sitenin TAMAMINDA (pazarlama + rehber + yasal sayfalar + llms metinleri) şunlar geçmez:
 *     hukuki uygunluk garantisi ("yasalara %100 uygun", "hukuken garantili"), Rekabet Kurumu/Kurulu, soruşturma veya
 *     karar atfı; bir pazaryerinin otomatik fiyat aracına atıf; rakip firma adı (K07); rakip hedefleme /
 *     "buybox'a eşitle" / "rakibi otomatik geç" / "fiyat savaşı" dili. Pazarlama sayfalarında ayrıca yayında olmayan
 *     fiyatlama özelliği vaadi (otomatik fiyatlama, buybox) yok (K43 yayın kapısı — "yakında" dahil).
 * (3) Yerleşim: /guvenlik#adil-rekabet (dört ilke), ana sayfa Güvenlik bölümünde tek satır, Otopilot "Kontrol sizde"
 *     maddesi, SSS sorusu.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSite } from '../scripts/lib/build.mjs'
import { FAIR_BANNED, fairPledge, fairPrinciples, fairSection, marketplaceToolPattern, MARKETPLACE_NAMES, normalizeTr } from '../src/data/fair-play'
import { AGENT_CLAIMS } from '../src/data/agent-claims'
import { getPublicFaq } from '../src/data/faq'
import { COMPETITOR_NAMES } from './fixtures/competitors'
import { marketingText } from './fixtures/marketing-text'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const phraseRe = (p: string) => new RegExp(`(?<![\\p{L}\\d])${escapeRe(normalizeTr(p))}(?![\\p{L}\\d])`, 'u')

/** Rehber/sözlük ve yasal metinler kavram tanımı içerebilir: yalnız `scope: 'marketing'` kuralları orada atlanır. */
const NON_MARKETING = /^(rehber|yasal|bilesen-onizleme)\//

export function fairViolations(rel: string, text: string): string[] {
  const t = normalizeTr(text).replace(/\s+/g, ' ')
  const out: string[] = []
  const hit = (why: string, m: RegExpMatchArray | null) => {
    if (!m) return
    const i = m.index ?? 0
    out.push(`${rel}: "${t.slice(Math.max(0, i - 40), i + 60)}" → ${why}`)
  }
  for (const b of FAIR_BANNED) {
    if (b.scope === 'marketing' && NON_MARKETING.test(rel)) continue
    hit(b.why, t.match(b.pattern))
  }
  hit('pazaryeri aracına atıf', t.match(marketplaceToolPattern))
  for (const n of COMPETITOR_NAMES) hit(`rakip firma adı: ${n}`, t.match(phraseRe(n)))
  return out
}

describe('(0) bekçi kendini sınar', () => {
  const bad = [
    'Entegrasyonik yasalara %100 uygundur.',
    'Fiyat kurallarımız hukuken garantilidir.',
    'Mevzuata tamamen uygun otomatik fiyat.',
    'Rekabet Kurumu onaylı fiyat aracı.',
    'Rekabet Kurulu kararıyla uyumlu.',
    'Soruşturma sonrası yenilendi.',
    "Fiyatınızı buybox'a eşitleyin.",
    'Fiyatınızı rakiple eşitleyin.',
    'Rakibi otomatik geçin.',
    'Rakiplerinizi yenin.',
    'Fiyat savaşını kazanın.',
    'Rakip fiyat takibi tek ekranda.',
    'Trendyol otomatik fiyatlandırma aracı gibi çalışır.',
    'Sopyo yerine bizi seçin.',
  ]
  for (const s of bad) it(`yakalar: ${s}`, () => expect(fairViolations('index.html', s).length).toBeGreaterThan(0))

  const ok = [
    'Stoğu tüm kanallarda eşitle',
    'Hiçbir yazılım hizmeti belirli bir sonucu garanti edemez.',
    'Bu bilgi hukuki uygunluk garantisi değildir.',
    'Mutlak güvenlik garantisi verilemez.',
    'Fiyatınız sizin kuralınızla belirlenir.',
    'Belirli bir satıcıyı hedef alan araç sunmayız.',
    'Entegrasyonik ile Trendyol mağazanızı bağlayın.',
    ...fairPrinciples.map((p) => `${p.title}. ${p.value}`),
  ]
  for (const s of ok) it(`serbest bırakır: ${s.slice(0, 50)}`, () => expect(fairViolations('index.html', s)).toEqual([]))

  it('pazarlama dışı kapsam: rehber sözlükte "buybox" kavram olarak geçebilir, eşitleme dili yine yasak', () => {
    expect(fairViolations('rehber/sozluk/index.html', 'Buybox: satın alma kutusu.')).toEqual([])
    expect(fairViolations('index.html', 'Buybox görünürlüğü')).not.toEqual([])
    expect(fairViolations('rehber/sozluk/index.html', "Buybox'a eşitleyin")).not.toEqual([])
  })
})

describe('(1) ilke kaydı bugün doğru ve sade', () => {
  it('dört ilke, benzersiz kimlik, kısa metin', () => {
    expect(fairPrinciples).toHaveLength(4)
    expect(new Set(fairPrinciples.map((p) => p.id)).size).toBe(4)
    for (const p of fairPrinciples) {
      expect(p.title.split(/\s+/).length, p.id).toBeLessThanOrEqual(7)
      expect(p.value.length, p.id).toBeLessThanOrEqual(170)
    }
    expect(fairSection.title.split(/\s+/).length).toBeLessThanOrEqual(7)
  })

  it('her ilkenin kanıtı mevcut ve atıf metni dosyada geçiyor', () => {
    for (const p of fairPrinciples) {
      expect(p.evidence.length, p.id).toBeGreaterThan(0)
      for (const e of p.evidence) {
        const file = path.join(repoRoot, e.path)
        expect(existsSync(file), `${p.id}: ${e.path}`).toBe(true)
        if (e.contains) expect(readFileSync(file, 'utf8').includes(e.contains), `${p.id}: ${e.path} ⊅ ${e.contains}`).toBe(true)
      }
    }
  })

  it('mutlak/garanti dili, "müşteri" hitabı, pazaryeri veya rakip adı yok', () => {
    const texts = [fairSection.title, fairSection.lead, fairPledge.text, fairPledge.label, ...fairPrinciples.flatMap((p) => [p.title, p.value])]
    const ABSOLUTE = ['%100', 'garanti', 'asla', 'hicbir', 'her zaman', 'kesinlikle', 'tamamen', 'yasal', 'hukuk', 'kanun', 'mevzuat']
    for (const raw of texts) {
      const t = normalizeTr(raw)
      for (const a of ABSOLUTE) expect(t.includes(a), `${raw} ⊃ ${a}`).toBe(false)
      expect(/musteri/.test(t), raw).toBe(false)
      for (const m of MARKETPLACE_NAMES) expect(phraseRe(m).test(t), `${raw} ⊃ ${m}`).toBe(false)
      expect(fairViolations('index.html', raw)).toEqual([])
    }
  })

  it('Otopilot karşılığı kayıtlı ve ilke dilinde (özellik vaadi yok)', () => {
    const t = AGENT_CLAIMS['trust-price']
    expect(t.readiness.status).not.toBe('planned')
    expect(normalizeTr(t.text)).toMatch(/sizin yerinize vermez/)
    expect(fairViolations('otopilot/index.html', t.text)).toEqual([])
  })

  it('SSS: fiyat kararı / veri paylaşımı sorusu var', () => {
    const q = getPublicFaq().find((f) => f.id === 'fiyat-karari')
    expect(q?.answer).toMatch(/^Hayır\./)
    expect(fairViolations('sss/index.html', `${q?.question} ${q?.answer}`)).toEqual([])
  })
})

function walk(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    return statSync(p).isDirectory() ? walk(p, exts) : exts.some((e) => p.endsWith(e)) ? [p] : []
  })
}

describe('(2) derlenmiş site: hukuki risk dili yok, (3) yerleşim', () => {
  let outDir = ''
  beforeAll(() => {
    outDir = buildSite({
      outDir: 'dist-fair',
      env: { SITE_DRAFT: 'false', PUBLIC_APP_URL: 'https://app.example.test', PUBLIC_SITE_URL: 'https://www.example.test' },
      silent: true,
    })
  }, 240_000)

  const read = (rel: string) => readFileSync(path.join(outDir, rel), 'utf8')

  it('tüm HTML sayfaları ve llms metinleri (rehber + yasal dahil): ihlal yok', () => {
    const files = walk(outDir, ['.html', '.txt']).map((f) => ({ rel: path.relative(outDir, f).split(path.sep).join('/'), f }))
    expect(files.length).toBeGreaterThan(20)
    const found = files.flatMap(({ rel, f }) => {
      const raw = readFileSync(f, 'utf8')
      return fairViolations(rel, rel.endsWith('.html') ? marketingText(raw) : raw)
    })
    expect(found).toEqual([])
  })

  it('/guvenlik: "Adil rekabet" bölümü dört ilkeyle, hero eylemlerinden erişilir', () => {
    const html = read('guvenlik/index.html')
    expect(html).toMatch(new RegExp(`<section[^>]*id="${fairSection.id}"`))
    expect(html).toContain('data-testid="fair-play"')
    expect([...html.matchAll(/data-fair="([^"]+)"/g)].map((m) => m[1])).toEqual(fairPrinciples.map((p) => p.id))
    expect(html).toContain(`href="#${fairSection.id}"`)
    expect(marketingText(html)).toContain(fairSection.title)
  })

  it('ana sayfa: Güvenlik bölümünde tek satırlık ilke + /guvenlik#adil-rekabet bağlantısı', () => {
    const html = read('index.html')
    const pledges = html.match(/data-testid="fair-pledge"/g) ?? []
    expect(pledges).toHaveLength(1)
    expect(html).toContain(`/guvenlik#${fairSection.id}`)
    expect(marketingText(html)).toContain(fairPledge.text)
  })

  it('Otopilot: "Fiyatınız, sizin kuralınız" güvence maddesi görünür', () => {
    const file = walk(outDir, ['.html']).find((f) => readFileSync(f, 'utf8').includes('id="kontrol-title"'))
    expect(file, 'Otopilot sayfası').toBeTruthy()
    expect(marketingText(readFileSync(file!, 'utf8'))).toContain(AGENT_CLAIMS['trust-price'].text)
  })
})
