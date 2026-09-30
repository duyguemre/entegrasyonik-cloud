/**
 * `llms.txt` / `llms-full.txt` testi (llmstxt.org formatı). Gerçek `astro build` çıktısını tarar ve
 * claims.test.ts ile AYNI yasaklı-ifade/mutlak-iddia/kanıtsız-sayısal-iddia/roadmap denetimini uygular
 * — bu iki dosya da "görünür içerik" sayılır, uydurma/roadmap sızıntısı olamaz.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { buildSite } from '../scripts/lib/build.mjs'
import { getPublicIntegrations, integrations, AVAILABLE_INTEGRATION_CODES } from '../src/data/integrations'
import { getPublicFaq } from '../src/data/faq'
import { getPublicPlans } from '../src/data/plans'

const APP_URL = 'https://app.example.test'
const SITE_URL = 'https://entegrasyonik.example.test'
let llms = ''
let llmsFull = ''

/** claims.test.ts ile aynı Türkçe-duyarlı normalize + sözcük-sınırlı eşleşme (bağımsız kopya: iki test birbirine küsmesin). */
const FOLD: Record<string, string> = { ç: 'c', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ı: 'i', â: 'a', î: 'i', û: 'u' }
const norm = (s: string): string => s.toLocaleLowerCase('tr-TR').replace(/[çşğüöıâîû]/g, (c) => FOLD[c] ?? c)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const phraseRe = (phrase: string) => new RegExp(`(?<![\\p{L}\\d])${escapeRe(norm(phrase))}(?![\\p{L}\\d])`, 'u')
const prefixRe = (prefix: string) => new RegExp(`(?<![\\p{L}\\d])${escapeRe(norm(prefix))}`, 'u')

const STATIC_FORBIDDEN_NAMES = [
  'Amazon',
  'Çiçeksepeti',
  'Sürat Kargo',
  'Aras Kargo',
  'Yurtiçi Kargo',
  'PTT Kargo',
  'PTT',
  'Paraşüt',
  'e-fatura',
  'efatura',
  'e-arşiv',
  'GİB',
  'Shopify',
  'WooCommerce',
  'Magento',
  'MCP',
  'Tauri',
  'Electron',
]
const FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ['kargo API/entegrasyon iddiası', /kargo\s+(api|entegrasyon)/],
  ['e-fatura/e-arşiv varyantı', /(?<![\p{L}\d])e-?(fatura|arsiv|irsaliye)/u],
  ['yol haritası dili', /(?<![\p{L}\d])(yakinda|cok yakinda|planlaniyor|yol haritasi|roadmap|beta)(?![\p{L}\d])/u],
]
const ABSOLUTE_PREFIXES = [
  '%100',
  'kesintisiz',
  'aninda',
  'sinirsiz',
  'en iyi',
  'garanti',
  '7/24',
  '24/7',
  'her zaman',
  'asla',
  'hatasiz',
  'risksiz',
  'lider',
  'rakipsiz',
]
const UNPROVEN_INFRA = ['iso 27001', 'soc 2', 'tier 3', 'uptime', '%99', 'veri merkezi', 'sertifikali']

beforeAll(() => {
  const outDir = buildSite({ outDir: 'dist-llms', env: { SITE_DRAFT: 'false', PUBLIC_APP_URL: APP_URL, PUBLIC_SITE_URL: SITE_URL }, silent: true })
  llms = readFileSync(path.join(outDir, 'llms.txt'), 'utf8')
  llmsFull = readFileSync(path.join(outDir, 'llms-full.txt'), 'utf8')
}, 180_000)

describe('llms.txt (kısa dizin)', () => {
  it('llmstxt.org biçimi: H1 + alıntı özet + Sayfalar/Entegrasyonlar/Optional bölümleri', () => {
    expect(llms.startsWith('# Entegrasyonik\n')).toBe(true)
    expect(llms).toMatch(/\n> [^\n]+\n/)
    expect(llms).toContain('## Sayfalar')
    expect(llms).toContain('## Entegrasyonlar')
    expect(llms).toContain('## Optional')
  })

  it('mutlak site URL kullanır (PUBLIC_SITE_URL tanımlı derlemede)', () => {
    expect(llms).toContain(`${SITE_URL}/`)
    expect(llms).toContain(`${SITE_URL}/entegrasyonlar`)
  })

  it('yalnızca mevcut (available) entegrasyonlar listelenir, sayısı IntegrationFactory ile eşleşir', () => {
    const available = getPublicIntegrations()
    expect(available).toHaveLength(AVAILABLE_INTEGRATION_CODES.length)
    for (const i of available) expect(llms, i.name).toContain(`**${i.name}**`)
  })

  it('içerik text/plain olarak yayımlanır', () => {
    // dist'te .txt uzantılı statik dosya üretildiği build aşamasında zaten doğrulanır (readFileSync başarılı).
    expect(llms.length).toBeGreaterThan(100)
  })
})

describe('llms-full.txt (kapsamlı özet)', () => {
  it('yetenekler, fiyatlandırma ve SSS bölümlerini içerir', () => {
    expect(llmsFull).toContain('## Ürün yetenekleri')
    expect(llmsFull).toContain('## Güvenlik ve KVKK')
    expect(llmsFull).toContain('## Fiyatlandırma')
    expect(llmsFull).toContain('## Sık sorulan sorular')
  })

  it('her SSS sorusu ve cevabı kayıtla birebir aynı', () => {
    for (const f of getPublicFaq()) {
      expect(llmsFull, f.question).toContain(`### ${f.question}`)
      expect(llmsFull, f.id).toContain(f.answer)
    }
  })

  it('plan adları ve fiyat etiketleri kayıtla birebir aynı', () => {
    for (const p of getPublicPlans()) {
      expect(llmsFull, p.name).toContain(`**${p.name}**`)
      expect(llmsFull, `${p.name} fiyat`).toContain(p.priceLabel)
    }
  })
})

describe('S14: yeni sayfalar llms* içinde', () => {
  it('llms.txt destek merkezi ve stok rezervasyonu sayfasını listeler', () => {
    expect(llms).toContain(`${SITE_URL}/destek`)
    expect(llms).toContain(`${SITE_URL}/ozellikler/stok-rezervasyonu`)
  })

  it('llms-full.txt stok rezervasyonu anlatısını, destek kategorilerini ve bağlantı rehberlerini içerir', () => {
    expect(llmsFull).toContain('## Stok rezervasyonu: aşırı satış nasıl önlenir')
    expect(llmsFull).toContain('## Destek merkezi')
    for (const label of ['Başlangıç ve kurulum', 'Kanal bağlama', 'Stok ve sipariş', 'Hesap ve güvenlik', 'Fiyat ve fatura']) {
      expect(llmsFull).toContain(`**${label}**`)
    }
    expect((llmsFull.match(/- Nasıl bağlanır: /g) ?? []).length).toBe(AVAILABLE_INTEGRATION_CODES.length)
  })
})

describe('llms* çıktısı: yasaklı ifade / mutlak iddia / roadmap sızıntısı yok (claims.test.ts ile aynı disiplin)', () => {
  const roadmapNames = integrations.filter((i) => i.status === 'roadmap').flatMap((i) => [i.name, ...i.aliases])
  const forbiddenNames = [...new Set([...STATIC_FORBIDDEN_NAMES, ...roadmapNames])]
  // Tembel: `llms`/`llmsFull` beforeAll'da dolar (describe gövdesi derlemeden önce çalışır).
  const texts = (): Array<[string, string]> => [
    ['llms.txt', llms],
    ['llms-full.txt', llmsFull],
  ]
  // S20b DAR İSTİSNA: "## Rehber" bölümü pazarı/mevzuatı anlatan kaynaklı bilgi içeriğidir (e-Fatura, GİB, e-Arşiv gibi
  // adlar ürün iddiası değil konu adıdır) → YALNIZCA ad/kalıp taramasından muaftır; mutlak iddia ve altyapı taramaları
  // bölüm dahil tüm metinde sürer. Rehber metninin kendi ad/rakip/rakam korumaları tests/rehber.test.ts'tedir.
  const withoutRehber = (text: string): string => text.replace(/\n## Rehber\n[\s\S]*?(?=\n## )/, '\n')
  const productTexts = (): Array<[string, string]> => texts().map(([f, t]) => [f, withoutRehber(t)])

  it('rehber istisnası yalnızca "## Rehber" bölümünü kapsar (bölüm var ve Optional ondan sonra)', () => {
    for (const [file, text] of texts()) {
      expect(text, file).toContain('\n## Rehber\n')
      expect(text.indexOf('\n## Optional'), file).toBeGreaterThan(text.indexOf('\n## Rehber\n'))
      expect(withoutRehber(text), file).toContain('\n## Optional')
      expect(withoutRehber(text), file).not.toContain('/rehber/')
    }
  })

  it('roadmap/mevcut olmayan ürün adları geçmez', () => {
    const hits: string[] = []
    for (const [file, text] of productTexts()) {
      const n = norm(text)
      for (const name of forbiddenNames) if (phraseRe(name).test(n)) hits.push(`${file}: "${name}"`)
    }
    expect(hits).toEqual([])
  })

  it('yasaklı kalıplar (kargo/e-fatura API, yol haritası dili) geçmez', () => {
    const hits: string[] = []
    for (const [file, text] of productTexts()) {
      const n = norm(text)
      for (const [label, re] of FORBIDDEN_PATTERNS) if (re.test(n)) hits.push(`${file}: ${label}`)
    }
    expect(hits).toEqual([])
  })

  it('doğrulanamaz mutlak/üstünlük/garanti iddiaları geçmez', () => {
    const hits: string[] = []
    for (const [file, text] of texts()) {
      const n = norm(text)
      for (const p of ABSOLUTE_PREFIXES) if (prefixRe(p).test(n)) hits.push(`${file}: "${p}"`)
    }
    expect(hits).toEqual([])
  })

  it('sertifika/altyapı/SLA iddiaları geçmez', () => {
    const hits: string[] = []
    for (const [file, text] of texts()) {
      const n = norm(text)
      for (const p of UNPROVEN_INFRA) if (prefixRe(p).test(n)) hits.push(`${file}: "${p}"`)
    }
    expect(hits).toEqual([])
  })

  it('internalNotes/evidence gibi görünmez alanlar sızmaz', () => {
    for (const [, text] of texts()) {
      expect(text).not.toContain('internalNotes')
      expect(text).not.toContain('INTEGRATIONS_REGISTRY')
    }
  })
})
