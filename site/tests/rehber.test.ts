/**
 * Rehber (bilgi merkezi, S20) testi. KB: docs/research/ECOMMERCE_MARKET_KB_2026-09-30.md (origin/main).
 *
 * (1) Kayıt bütünlüğü: KB §12 öncelik sırası, benzersiz slug/çapa, SEO başlık/açıklama sınırları (S19 ile uyumlu),
 *     yanıt kutusu 2–3 cümle, SSS, ilgili sayfalar ve satır içi bağlantılar gerçek hedeflere gider.
 * (2) Doğruluk: metinlerdeki HER rakam `facts.ts` belirtecidir (resmi kaynak ya da tutarlı iki ikincil kaynak);
 *     KB'de DOĞRULANAMADI olan alanların kalıpları (komisyon oranı, e-Arşiv tutarı, hakediş günü, pazaryeri payı...)
 *     yoktur; kaynak defterinde rakip adı taşıyan kaynak yoktur; sitede rakip adı geçmez.
 * (3) Ürün dürüstlüğü: Entegrasyonik bağlam kutuları claims.test.ts ile AYNI ad/kalıp/mutlak iddia listelerinden geçer;
 *     rehber metninde Entegrasyonik'in fatura/kargo işi yaptığı söylenmez (yalnızca olumsuzlama).
 * (4) Derleme çıktısı: her sayfada tek h1, geçerli JSON-LD (Article/FAQPage/BreadcrumbList/HowTo, hub CollectionPage,
 *     sözlük DefinedTermSet), görünür kaynak listesi + erişim/güncelleme tarihi, menü bağlantısı, satır içi betik yok.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSite } from '../scripts/lib/build.mjs'
import { guides, getGuide, getGuideCta, allGuideCtas, guideTexts, guideHref, relatedOf, clusters, guidesIn, PRIORITY_ORDER, SECOND_WAVE_ORDER, REHBER_PATH, GLOSSARY_PATH } from '../src/data/kb'
import { glossary, GLOSSARY_META } from '../src/data/kb/glossary'
import { sources } from '../src/data/kb/sources'
import { factTokens } from '../src/data/kb/facts'
import { HUB, HUB_FAQ, MARKET_HIGHLIGHT, PRINCIPLES } from '../src/data/kb/hub'
import { kbLinks, plainKb } from '../src/lib/kb-render'
import { AVAILABLE_INTEGRATION_CODES, integrations } from '../src/data/integrations'
import { primaryNav, published } from '../src/data/navigation'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://site.example.test'

// ------------------------------------------------------------------------------------------ yardımcılar
// claims.test.ts ile aynı normalleştirme ve sınır kuralları (orada dışa aktarım yok: test dosyası içe aktarılırsa
// testleri iki kez koşar). Listeler aşağıda aynen tekrar edilir; claims.test.ts değişirse burası da güncellenir.
const FOLD: Record<string, string> = { ç: 'c', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ı: 'i', â: 'a', î: 'i', û: 'u' }
const norm = (s: string): string => s.toLocaleLowerCase('tr-TR').replace(/[çşğüöıâîû]/g, (c) => FOLD[c] ?? c)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const phraseRe = (p: string) => new RegExp(`(?<![\\p{L}\\d])${escapeRe(norm(p))}(?![\\p{L}\\d])`, 'u')
const prefixRe = (p: string) => new RegExp(`(?<![\\p{L}\\d])${escapeRe(norm(p))}`, 'u')

/** claims.test.ts STATIC_FORBIDDEN_NAMES (ürün bağlamında geçemez). */
const PRODUCT_FORBIDDEN_NAMES = [
  'Amazon', 'Çiçeksepeti', 'Sürat Kargo', 'Aras Kargo', 'Yurtiçi Kargo', 'MNG Kargo', 'PTT Kargo', 'PTT', 'Hepsijet', 'Sendeo', 'Oplog', 'UPS',
  'Paraşüt', 'e-fatura', 'efatura', 'e-arşiv', 'e-irsaliye', 'GİB', 'e-Logo', 'Turkcell e-Şirket', 'Trendyol e-Faturam', 'Shopify', 'WooCommerce',
  'Magento', 'Wix', 'Opencart', 'Ticimax', 'AnkaETicaret', 'ETicaretSoft', 'MCP', 'Tauri', 'Electron',
]
const PRODUCT_FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ['kargo API/entegrasyon iddiası', /kargo\s+(api|entegrasyon)/],
  ['e-fatura/e-arşiv varyantı', /(?<![\p{L}\d])e-?(fatura|arsiv|irsaliye)/u],
  ['masaüstü uygulaması', /masaustu\s+uygulama/],
  ['yol haritası dili', /(?<![\p{L}\d])(yakinda|cok yakinda|planlaniyor|yol haritasi|roadmap|beta)(?![\p{L}\d])/u],
]
/** claims.test.ts ABSOLUTE_PREFIXES — rehberin TÜM metinlerinde geçerli. */
const ABSOLUTE_PREFIXES = [
  '%100', '% 100', 'yuzde yuz', 'kesintisiz', 'aninda', 'sinirsiz', 'en iyi', 'bir numara', '1 numara', 'numarali', 'garanti', '7/24', '24/7',
  'her zaman', 'asla', 'hicbir zaman', 'hatasiz', 'risksiz', 'sifir hata', 'sifir risk', 'tamamen otomatik', 'binlerce', 'milyonlarca',
  'yuzlerce', 'lider', 'rakipsiz', 'essiz',
]
const UNPROVEN_INFRA = ['iso 27001', 'soc 2', 'tier 3', 'uptime', 'sla taahhut', '%99', 'veri merkezi', 'onayli entegrator', 'resmi ortak', 'sertifikali']

/** Rakip / entegratör adları (docs/research/COMPETITORS_2026-09.md + KB §14 kaynakları). Sitede geçmez. */
const COMPETITOR_NAMES = [
  'Entegra', 'entegrabilisim', 'Sopyo', 'Yengeç', 'Paraşüt', 'BirFatura', 'Sovos', 'ikas', 'Sentos', 'Dopigo', 'StockMount', 'Ticimax', 'T-Soft',
  'Akinon', 'Kolaysoft', 'Logo İşbaşı',
]
/** KB §14: [RAKİP-ADI] etiketli + yalnız tanıtım (S50) kaynakları — defterde ve sitede bulunamaz. */
const BANNED_KB_SOURCES = ['S9', 'S10', 'S11', 'S12', 'S31', 'S33', 'S34', 'S38', 'S42', 'S48', 'S49', 'S50']
const BANNED_DOMAINS = ['parasut.com', 'birfatura.com', 'sovos.com', 'ikas.com', 'milliyet.com.tr/advertorial', 'ideasoft.com.tr/e-ticaret-icin', 'ideasoft.com.tr/hepsiburada', 'ideasoft.com.tr/amazonda']

/**
 * KB'de DOĞRULANAMADI olan alanların kalıpları (KB §2 F8, F14–F16; §3 hakediş/komisyon/onay süresi; §13).
 * Rakam belirteç kuralı zaten yakalar; bu kalıplar sözle yazılmış hâllerini ve anlamlı bağlamı da yakalar.
 */
const UNVERIFIED_PATTERNS: Array<[string, RegExp]> = [
  ['komisyon oranı', /komisyon[^.]{0,40}%\s?\d|%\s?\d[^.]{0,40}komisyon/],
  ['e-Arşiv sınır tutarı', /e-?arsiv[^.]{0,80}\d[\d.,]*\s*(bin|milyon)?\s*(tl|lira)|\d[\d.,]*\s*(bin|milyon)?\s*(tl|lira)[^.]{0,80}e-?arsiv/],
  ['hakediş/ödeme günü', /(pazartesi|sali|carsamba|persembe|cuma)[^.]{0,40}(odeme|hakedis)|(odeme|hakedis)[^.]{0,40}(pazartesi|sali|carsamba|persembe|cuma)/],
  ['ödeme sıklığı', /(haftada (bir|iki)|iki haftada bir|ayda bir)[^.]{0,30}(odeme|hakedis)/],
  ['pazaryeri payı oranı', /pazaryer[^.]{0,30}pay[^.]{0,30}%\s?\d/],
  ['saklama/düzenleme süresi (tek kaynak)', /(\d+|on)\s*yil[^.]{0,20}sakla|yedi gun|(?<!\d)7 gun/],
  ['onay süresi (tahmini)', /\d+\s*-\s*\d+\s*gun/],
  ['sıfır komisyon kampanyası', /sifir komisyon/],
  ['eşik yılı çelişkisi', /(2022|2023)\s*(ve sonrasi|yilindan itibaren)/],
]

/** Sayfalarda gösterilen tüm metin yaprakları (rehber + sözlük + hub). */
function allTexts(): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = []
  for (const g of guides) for (const t of guideTexts(g)) out.push({ where: g.slug, text: t })
  for (const t of glossary) out.push({ where: `sozluk#${t.id}`, text: `${t.term} ${t.alternate ?? ''} ${t.definition}` })
  for (const t of [GLOSSARY_META.note, GLOSSARY_META.title, GLOSSARY_META.description, GLOSSARY_META.lead]) out.push({ where: 'sozluk', text: t })
  for (const t of [HUB.title, HUB.seoTitle, HUB.description, HUB.lead, HUB.answer, MARKET_HIGHLIGHT.title, ...MARKET_HIGHLIGHT.stats.flatMap((s) => [s.value, s.label]), ...PRINCIPLES.flatMap((p) => [p.title, p.text]), ...HUB_FAQ.flatMap((f) => [f.question, f.answer]), ...clusters.flatMap((c) => [c.title, c.lead])])
    out.push({ where: 'hub', text: t })
  return out
}

const sentences = (t: string) => plainKb(t).split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0)

// ------------------------------------------------------------------------------------------ (1) kayıt bütünlüğü

describe('(1) kayıt bütünlüğü', () => {
  it('KB §12: öncelikli 15 sayfanın 14 rehberi + sözlük öncelik sırasıyla, ardından sonraki dalga', () => {
    expect(guides.map((g) => g.kbId)).toEqual([...PRIORITY_ORDER, ...SECOND_WAVE_ORDER])
    expect(PRIORITY_ORDER.length + 1).toBe(15)
    expect(glossary.length).toBe(48)
  })

  it('slug, başlık ve açıklamalar benzersiz; SEO sınırları (S19: tam başlık ≤ 60, açıklama 70–155)', () => {
    const pages = [...guides.map((g) => ({ id: g.slug, title: g.seoTitle, description: g.description })), { id: 'hub', title: HUB.seoTitle, description: HUB.description }]
    expect(new Set(guides.map((g) => g.slug)).size).toBe(guides.length)
    expect(new Set(pages.map((p) => p.title)).size).toBe(pages.length)
    expect(new Set(pages.map((p) => p.description)).size).toBe(pages.length)
    for (const p of pages) {
      expect(`${p.title} · Entegrasyonik`.length, p.id).toBeLessThanOrEqual(60)
      expect(p.description.length, p.id).toBeGreaterThanOrEqual(70)
      expect(p.description.length, p.id).toBeLessThanOrEqual(155)
    }
  })

  it('her sayfa: 2–3 cümlelik yanıt, ≤ 4 ana madde, ≥ 3 bölüm, ≥ 3 SSS, kaynak, ilgili sayfa, tarih', () => {
    for (const g of guides) {
      const n = sentences(g.answer).length
      expect(n >= 2 && n <= 3, `${g.slug}: yanıt ${n} cümle`).toBe(true)
      expect(g.keyPoints.length, g.slug).toBeLessThanOrEqual(4)
      expect(g.sections.length, g.slug).toBeGreaterThanOrEqual(3)
      expect(g.faq.length, g.slug).toBeGreaterThanOrEqual(3)
      expect(g.sources.length, g.slug).toBeGreaterThanOrEqual(1)
      expect(relatedOf(g).length, g.slug).toBe(g.related.length)
      expect(g.related.length, g.slug).toBeGreaterThanOrEqual(2)
      expect(g.related, g.slug).not.toContain(g.slug)
      for (const d of [g.datePublished, g.dateModified, g.reviewBy]) expect(d, g.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(g.reviewBy > g.dateModified, `${g.slug}: gözden geçirme tarihi ileride`).toBe(true)
    }
  })

  it('mevzuat kümesi hukuki/mali tavsiye notunu taşır; güncelleme politikası (sık değişen ≤ 90, mevzuat ≤ 180 gün)', () => {
    const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000
    for (const g of guidesIn('mevzuat')) {
      expect(g.legal, g.slug).toBe(true)
      expect(days(g.dateModified, g.reviewBy), g.slug).toBeLessThanOrEqual(180)
    }
    for (const g of guides.filter((x) => x.volatile)) expect(days(g.dateModified, g.reviewBy), g.slug).toBeLessThanOrEqual(90)
  })

  it('çapalar benzersiz ve sabit çapalarla (kisa-yanit, sss, kaynaklar) çakışmaz', () => {
    for (const g of guides) {
      const ids = [...g.sections.map((s) => s.id), ...g.faq.map((f) => `sss-${f.id}`), 'kisa-yanit', 'sss', 'kaynaklar']
      expect(new Set(ids).size, g.slug).toBe(ids.length)
      for (const id of ids) expect(id, g.slug).toMatch(/^[a-z0-9-]+$/)
    }
    expect(new Set(glossary.map((t) => t.id)).size).toBe(glossary.length)
  })

  it('satır içi bağlantılar gerçek hedeflere gider (rehber, sözlük çapası, sayfa içi çapa)', () => {
    const bad: string[] = []
    for (const g of guides) {
      const own = new Set(g.sections.map((s) => s.id))
      for (const t of guideTexts(g)) {
        for (const href of kbLinks(t)) {
          const [p, hash] = href.split('#')
          if (p === '') {
            if (!own.has(hash)) bad.push(`${g.slug}: ${href}`)
          } else if (p === GLOSSARY_PATH) {
            if (!glossary.some((x) => x.id === hash)) bad.push(`${g.slug}: ${href}`)
          } else if (p.startsWith(`${REHBER_PATH}/`)) {
            if (!getGuide(p.slice(REHBER_PATH.length + 1))) bad.push(`${g.slug}: ${href}`)
          } else bad.push(`${g.slug}: beklenmeyen hedef ${href}`)
        }
      }
    }
    for (const t of glossary) if (t.guide && !getGuide(t.guide)) bad.push(`sozluk#${t.id}: ${t.guide}`)
    expect(bad).toEqual([])
  })

  it('hub: dört konu kümesi (Pazaryerleri, Mevzuat ve vergi, Operasyon ve stok, Seçim rehberi); her rehber bir kümede', () => {
    expect(clusters.map((c) => c.title)).toEqual(['Pazaryerleri', 'Mevzuat ve vergi', 'Operasyon ve stok', 'Seçim rehberi'])
    for (const c of clusters) expect(guidesIn(c.id).length, c.id).toBeGreaterThan(0)
    expect(clusters.flatMap((c) => guidesIn(c.id)).length).toBe(guides.length)
  })

  it('menü: "Rehber" yayımlı gezinme öğesi', () => {
    expect(published(primaryNav).map((i) => i.href)).toContain(REHBER_PATH)
  })
})

// ------------------------------------------------------------------------------------------ (2) doğruluk

describe('(2) doğruluk: yalnız doğrulanmış rakam, doğrulanamayan alan yok, rakip adı yok', () => {
  const texts = allTexts()

  it('tarama kümesi boş değil', () => {
    expect(texts.length).toBeGreaterThan(400)
  })

  it('her olgu belirteci: resmi kaynağa ya da tutarlı iki ikincil kaynağa dayanır', () => {
    for (const f of factTokens) {
      if (f.basis === 'R') expect(f.kbRefs.some((id) => (sources as Record<string, { trust: string }>)[id]?.trust === 'R'), f.token).toBe(true)
      if (f.basis === '2İ') expect(new Set(f.kbRefs).size, f.token).toBeGreaterThanOrEqual(2)
    }
  })

  it('metinlerdeki HER rakam bir olgu belirtecinin parçasıdır (kanıtsız sayı yok)', () => {
    const tokens = [...factTokens.map((f) => f.token)].sort((a, b) => b.length - a.length)
    const hits: string[] = []
    for (const { where, text } of texts) {
      let t = plainKb(text) // bağlantı hedefleri (URL) metin değildir
      for (const tok of tokens) t = t.split(tok).join('')
      if (/\d/.test(t)) hits.push(`${where}: ${t.match(/.{0,40}\d.{0,40}/)?.[0]}`)
    }
    expect(hits).toEqual([])
  })

  it('KB DOĞRULANAMADI alanları (komisyon oranı, e-Arşiv tutarı, ödeme günü, pazaryeri payı, saklama süresi...) yazılmaz', () => {
    const hits: string[] = []
    for (const { where, text } of texts) for (const [label, re] of UNVERIFIED_PATTERNS) if (re.test(norm(text))) hits.push(`${where}: ${label}`)
    expect(hits).toEqual([])
  })

  it('kalıplar gerçekten yakalıyor (kendi kendini sınama)', () => {
    const hit = (s: string) => UNVERIFIED_PATTERNS.some(([, re]) => re.test(norm(s)))
    expect(hit('Komisyon oranı %15 civarındadır.')).toBe(true)
    expect(hit('e-Arşiv sınırı 3.000 TL üzeridir.')).toBe(true)
    expect(hit('Ödemeler Pazartesi ve Perşembe yapılır.')).toBe(true)
    expect(hit('Faturalar 10 yıl saklanır.')).toBe(true)
    expect(hit('Onay 15-20 gün sürer.')).toBe(true)
    expect(hit('Komisyon kategori bazlıdır; satıcı panelinize bakın.')).toBe(false)
  })

  it('doğrulanamaz mutlak/üstünlük iddiası yok (claims.test.ts listesi)', () => {
    const hits: string[] = []
    for (const { where, text } of texts) for (const p of ABSOLUTE_PREFIXES) if (prefixRe(p).test(norm(text))) hits.push(`${where}: "${p}"`)
    expect(hits).toEqual([])
  })

  it('rakip/entegratör adı geçmez', () => {
    const hits: string[] = []
    for (const { where, text } of texts) for (const n of COMPETITOR_NAMES) if (phraseRe(n).test(norm(text))) hits.push(`${where}: ${n}`)
    expect(hits).toEqual([])
  })

  it('kaynak defteri: rakip adı taşıyan KB kaynağı ve alan adı yok; her kaynakta https URL + erişim tarihi', () => {
    for (const id of BANNED_KB_SOURCES) expect(Object.keys(sources), id).not.toContain(id)
    for (const s of Object.values(sources)) {
      expect(s.url, s.id).toMatch(/^https:\/\//)
      expect(s.accessed, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      for (const d of BANNED_DOMAINS) expect(s.url, s.id).not.toContain(d)
      for (const n of COMPETITOR_NAMES) expect(phraseRe(n).test(norm(`${s.title} ${s.publisher}`)), `${s.id}: ${n}`).toBe(false)
    }
  })

  it('site altyapıları: yalnızca UI formu olan altyapılar (Shopify, WooCommerce...) rehberde anılmaz (KB §4)', () => {
    for (const { where, text } of texts) for (const n of ['Shopify', 'WooCommerce', 'Magento', 'Wix', 'Opencart']) expect(phraseRe(n).test(norm(text)), `${where}: ${n}`).toBe(false)
  })
})

// ------------------------------------------------------------------------------------------ (3) ürün dürüstlüğü

describe('(3) ürün dürüstlüğü: Entegrasyonik bağlamı kayıtlara dayanır, yapmadığını yapıyor gibi göstermez', () => {
  it('bağlam kutuları claims.test.ts ad/kalıp/mutlak/altyapı listelerinden geçer; rakam yalnızca kanıtlı belirteçte', () => {
    const hits: string[] = []
    for (const c of allGuideCtas()) {
      const text = norm(`${c.title} ${c.text} ${c.note ?? ''} ${c.link.label}`)
      for (const n of PRODUCT_FORBIDDEN_NAMES) if (phraseRe(n).test(text)) hits.push(`${c.title}: "${n}"`)
      for (const [label, re] of PRODUCT_FORBIDDEN_PATTERNS) if (re.test(text)) hits.push(`${c.title}: ${label}`)
      for (const p of [...ABSOLUTE_PREFIXES, ...UNPROVEN_INFRA]) if (prefixRe(p).test(text)) hits.push(`${c.title}: "${p}"`)
      if (/\d/.test(text.split(norm('AES-256-GCM')).join('').split('n11').join(''))) hits.push(`${c.title}: rakam`)
    }
    expect(hits).toEqual([])
  })

  it('bağlam kutusu kanal kodları yalnızca mevcut entegrasyonlar; roadmap adı geçmez', () => {
    for (const g of guides) if (g.ctaChannel) expect(AVAILABLE_INTEGRATION_CODES, g.slug).toContain(g.ctaChannel)
    const roadmap = integrations.filter((i) => i.status === 'roadmap').flatMap((i) => [i.name, ...i.aliases])
    const text = norm(JSON.stringify(allGuideCtas()))
    for (const n of roadmap) expect(phraseRe(n).test(text), n).toBe(false)
  })

  it('fatura bağlamı "fatura düzenlemez" olumsuzlamasıyla başlar ve yalnız bildirimi olan kanalları sayar', () => {
    const c = getGuideCta('invoice')
    expect(c.text.startsWith('Entegrasyonik fatura düzenlemez.')).toBe(true)
    const withNotice = integrations.filter((i) => i.status === 'available' && i.capabilities.some((x) => x.key === 'invoiceNotice')).map((i) => i.name)
    for (const i of integrations.filter((x) => x.status === 'available')) expect(c.text.includes(i.name), i.name).toBe(withNotice.includes(i.name))
  })

  it('rehber metninde "Entegrasyonik" geçen cümle fatura/kargo işi iddia etmez (yalnızca olumsuzlama)', () => {
    const NEG = /(duzenlemez|yoktur|yok\b|degildir|sunmaz|kurmaz|bulunmaz|hayir)/
    const hits: string[] = []
    for (const { where, text } of allTexts()) {
      for (const s of sentences(text)) {
        const n = norm(s)
        if (!n.includes('entegrasyonik') || n.trim().endsWith('?')) continue // soru cümlesi iddia değildir
        if (/(e-?fatura|e-?arsiv|e-?irsaliye|kargo|fatura duzenle|entegrator)/.test(n) && !NEG.test(n)) hits.push(`${where}: ${s}`)
      }
    }
    expect(hits).toEqual([])
  })
})

// ------------------------------------------------------------------------------------------ (4) derleme çıktısı

let draftDir = ''
let finalDir = ''
beforeAll(() => {
  draftDir = buildSite({ outDir: 'dist-rehber-draft', env: { SITE_DRAFT: 'true' }, silent: true })
  finalDir = buildSite({ outDir: 'dist-rehber-final', env: { SITE_DRAFT: 'false', PUBLIC_SITE_URL: SITE, PUBLIC_APP_URL: 'https://app.example.test' }, silent: true })
}, 240_000)

const htmlOf = (dir: string, route: string) => readFileSync(path.join(dir, route, 'index.html'), 'utf8')
const jsonLdOf = (html: string): Array<Record<string, any>> =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
const visible = (html: string) =>
  html
    .replace(/<head[\s\S]*?<\/head>/g, '')
    .replace(/<(script|style|header|footer)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')

const ROUTES = [REHBER_PATH, GLOSSARY_PATH, ...guides.map((g) => guideHref(g.slug))]

describe('(4) derleme çıktısı', () => {
  it('tüm rehber rotaları derlenmiş', () => {
    for (const r of ROUTES) expect(existsSync(path.join(draftDir, r, 'index.html')), r).toBe(true)
  })

  it('her sayfa: tek h1, başlık, JSON-LD geçerli JSON ve BreadcrumbList; satır içi çalıştırılabilir betik yok', () => {
    for (const r of ROUTES) {
      const html = htmlOf(draftDir, r)
      expect((html.match(/<h1[\s>]/g) ?? []).length, r).toBe(1)
      expect(html, r).toMatch(/<title>[^<]{3,}· Entegrasyonik<\/title>/)
      const ld = jsonLdOf(html)
      expect(ld.length, r).toBeGreaterThan(0)
      expect(ld.map((x) => x['@type']), r).toContain('BreadcrumbList')
      for (const x of ld) expect(x['@context'], r).toBe('https://schema.org')
      for (const m of html.matchAll(/<script\b([^>]*)>/g)) expect(/type="application\/ld\+json"/.test(m[1]) || /\bsrc="/.test(m[1]), `${r}: ${m[1]}`).toBe(true)
    }
  })

  it('rehber sayfası: Article (tarih + citation), FAQPage görünür SSS ile birebir, HowTo görünür adımlarla birebir', () => {
    for (const g of guides) {
      const html = htmlOf(draftDir, guideHref(g.slug))
      const ld = jsonLdOf(html)
      const article = ld.find((x) => x['@type'] === 'Article')!
      expect(article, g.slug).toBeDefined()
      expect(article.headline).toBe(g.title)
      expect(article.datePublished).toBe(g.datePublished)
      expect(article.dateModified).toBe(g.dateModified)
      expect(article.citation.map((c: any) => c.url)).toEqual(g.sources.map((id) => sources[id].url))
      const faq = ld.find((x) => x['@type'] === 'FAQPage')!
      expect(faq.mainEntity.map((q: any) => q.name)).toEqual(g.faq.map((f) => f.question))
      for (const f of g.faq) expect(visible(html), `${g.slug}: ${f.id}`).toContain(f.question)
      const howTo = ld.find((x) => x['@type'] === 'HowTo')
      expect(Boolean(howTo), g.slug).toBe(Boolean(g.howTo))
      if (howTo) {
        const firstSteps = g.sections.flatMap((s) => s.blocks).find((b) => b.type === 'steps')
        expect(firstSteps && firstSteps.type === 'steps' && howTo.step.map((s: any) => s.name)).toEqual(firstSteps && firstSteps.type === 'steps' ? firstSteps.items.map((s) => s.name) : [])
      }
    }
  })

  it('her sayfada: kısa yanıt, görünür kaynak listesi (dış https bağlantısı + erişim tarihi) ve son güncelleme tarihi', () => {
    for (const r of [GLOSSARY_PATH, ...guides.map((g) => guideHref(g.slug))]) {
      const html = htmlOf(draftDir, r)
      const block = html.match(/data-testid="guide-sources"[\s\S]*?data-testid="guide-updated"[\s\S]*?<\/p>/)?.[0] ?? ''
      expect(block, r).not.toBe('')
      expect((block.match(/href="https:\/\//g) ?? []).length, r).toBeGreaterThan(0)
      expect(block, r).toMatch(/Erişim: <time datetime="\d{4}-\d{2}-\d{2}"/)
      expect(block, r).toMatch(/Son güncelleme: <time datetime="\d{4}-\d{2}-\d{2}"/)
    }
    for (const g of guides) {
      const html = htmlOf(draftDir, guideHref(g.slug))
      expect(html, g.slug).toContain('data-testid="guide-answer"')
      expect(html, g.slug).toContain('data-testid="guide-cta"')
      if (g.legal) expect(visible(html), g.slug).toContain('hukuki veya mali tavsiye değildir')
    }
  })

  it('hub: CollectionPage tüm rehberleri + sözlüğü listeler; FAQPage; dört küme kartı', () => {
    const html = htmlOf(draftDir, REHBER_PATH)
    const ld = jsonLdOf(html)
    const col = ld.find((x) => x['@type'] === 'CollectionPage')!
    expect(col.mainEntity.itemListElement.length).toBe(guides.length + 1)
    expect(ld.map((x) => x['@type'])).toContain('FAQPage')
    expect((html.match(/data-testid="hub-cluster"/g) ?? []).length).toBe(4)
    for (const g of guides) expect(html, g.slug).toContain(`href="${guideHref(g.slug)}"`)
  })

  it('sözlük: DefinedTermSet, 48 DefinedTerm (inDefinedTermSet), her terimin görünür çapası', () => {
    const html = htmlOf(draftDir, GLOSSARY_PATH)
    const set = jsonLdOf(html).find((x) => x['@type'] === 'DefinedTermSet')!
    expect(set.hasDefinedTerm.length).toBe(glossary.length)
    for (const t of set.hasDefinedTerm) {
      expect(t['@type']).toBe('DefinedTerm')
      expect(t.inDefinedTermSet).toBe(set['@id'])
    }
    for (const t of glossary) expect(html, t.id).toContain(`id="${t.id}"`)
  })

  it('yayın modu: canonical + mutlak JSON-LD URL; menü ve footer "Rehber" bağlantısı', () => {
    for (const r of ROUTES) {
      const html = htmlOf(finalDir, r)
      expect(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1], r).toMatch(new RegExp(`^${escapeRe(SITE + r)}/?$`))
    }
    const art = jsonLdOf(htmlOf(finalDir, guideHref(guides[0].slug))).find((x) => x['@type'] === 'Article')!
    expect(art.mainEntityOfPage.startsWith(SITE)).toBe(true)
    const home = readFileSync(path.join(draftDir, 'index.html'), 'utf8')
    expect((home.match(/href="\/rehber"/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('derlenmiş rehber sayfalarında rakip adı, rakip kaynak alan adı ve mutlak iddia yok', () => {
    for (const r of ROUTES) {
      const html = htmlOf(draftDir, r)
      const text = norm(visible(html))
      for (const n of COMPETITOR_NAMES) expect(phraseRe(n).test(text), `${r}: ${n}`).toBe(false)
      for (const d of BANNED_DOMAINS) expect(html, `${r}: ${d}`).not.toContain(d)
      for (const p of ABSOLUTE_PREFIXES) expect(prefixRe(p).test(text), `${r}: ${p}`).toBe(false)
    }
  })
})
