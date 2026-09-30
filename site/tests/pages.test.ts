/**
 * İç sayfalar testi (ADR-0014 S2b): `/entegrasyonlar`, 6 detay, `/ozellikler`, `/guvenlik`, `/sss`, `/iletisim`.
 * İki GERÇEK `astro build` çalıştırılır (taslak + yayın modu; `site/dist-pages-*`, git-ignored) ve çıktı HTML'i denetlenir:
 * tek h1, SEO/OG meta, gizli öğe yok, detay sayfası sayısı = fabrika kodu sayısı, iç bağlantılar kırık değil,
 * `mailto` iletişim (form yok), JS'siz akordeon, sabit rakam/mutlak iddia yok.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSite } from '../scripts/lib/build.mjs'
import { PATHS } from '../src/data/evidence'
import { integrations, AVAILABLE_INTEGRATION_CODES, getPublicIntegrations } from '../src/data/integrations'
import { getPublicCapabilities, getStockReservationStory } from '../src/data/capabilities'
import { getPublicFaq, getPublicFaqByCategory, getSupportCategories } from '../src/data/faq'
import { connectGuides, getConnectGuide } from '../src/data/connect'
import { featureDetails } from '../src/data/feature-details'
import { legalNav, primaryNav, published } from '../src/data/navigation'
import { resolveContactEmail, mailtoHref, DEFAULT_CONTACT_EMAIL } from '../src/lib/contact'
import { company } from '../src/data/company'
import { securityPrinciples } from '../src/data/security-principles'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(siteRoot, '..')

const APP = 'https://app.example.test'
const SITE = 'https://site.example.test'
const EMAIL = 'iletisim@example.test'

const INNER_PAGES = [
  '/entegrasyonlar',
  ...AVAILABLE_INTEGRATION_CODES.map((c) => `/entegrasyonlar/${c}`),
  '/ozellikler',
  '/guvenlik',
  '/sss',
  '/iletisim',
  '/ozellikler/stok-rezervasyonu',
  '/destek',
]

let draftDir = ''
let finalDir = ''

beforeAll(() => {
  draftDir = buildSite({ outDir: 'dist-pages-draft', env: { SITE_DRAFT: 'true', PUBLIC_APP_URL: APP, PUBLIC_CONTACT_EMAIL: '' }, silent: true })
  finalDir = buildSite({
    outDir: 'dist-pages-final',
    env: { SITE_DRAFT: 'false', PUBLIC_APP_URL: APP, PUBLIC_SITE_URL: SITE, PUBLIC_CONTACT_EMAIL: EMAIL },
    silent: true,
  })
}, 240_000)

const htmlPath = (dir: string, route: string) => path.join(dir, route, 'index.html')
const html = (dir: string, route: string) => readFileSync(htmlPath(dir, route), 'utf8')
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Görünür metin: script/style/head/header/footer atılır (yıl, gezinme gibi sayfa-dışı öğeler hariç). */
function visibleText(source: string): string {
  return source
    .replace(/<head[\s\S]*?<\/head>/g, '')
    .replace(/<(script|style|header|footer)[\s\S]*?<\/\1>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

const meta = (source: string, attr: 'name' | 'property', key: string): string | undefined =>
  source.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1]

describe('rota kümesi', () => {
  it("entegrasyon detay sayfası sayısı = fabrika kodu sayısı (6) ve slug'lar kodlarla birebir", () => {
    expect(AVAILABLE_INTEGRATION_CODES.length).toBe(6)
    const dir = path.join(draftDir, 'entegrasyonlar')
    const slugs = readdirSync(dir).filter((n) => statSync(path.join(dir, n)).isDirectory())
    expect(slugs.sort()).toEqual([...AVAILABLE_INTEGRATION_CODES].sort())
  })

  it('yol haritası öğeleri için sayfa üretilmez', () => {
    for (const r of integrations.filter((i) => i.status === 'roadmap')) {
      expect(existsSync(path.join(draftDir, 'entegrasyonlar', r.code)), r.code).toBe(false)
    }
  })

  it('tüm iç sayfalar derlenmiş', () => {
    for (const route of INNER_PAGES) expect(existsSync(htmlPath(draftDir, route)), route).toBe(true)
  })

  it('ana gezinmedeki 5 iç sayfa ve fiyat sayfası (S4b) yayımlı', () => {
    const on = published(primaryNav).map((i) => i.href)
    for (const h of ['/ozellikler', '/entegrasyonlar', '/guvenlik', '/sss', '/iletisim', '/fiyatlandirma', '/destek']) expect(on).toContain(h)
  })
})

describe('her sayfa: tek h1, başlık, meta, breadcrumb', () => {
  for (const route of INNER_PAGES) {
    it(route, () => {
      const draft = html(draftDir, route)
      expect((draft.match(/<h1[\s>]/g) ?? []).length, 'tek h1').toBe(1)
      expect(draft).toMatch(/<html lang="tr"/)
      expect(draft).toMatch(/<title>[^<]{3,}· Entegrasyonik<\/title>/)
      const description = meta(draft, 'name', 'description')
      expect(description && description.length > 40, 'description').toBe(true)
      // TASLAK: noindex, canonical yok (site geneli bant kaldırıldı)
      expect(meta(draft, 'name', 'robots')).toBe('noindex,nofollow')
      expect(draft).not.toContain('rel="canonical"')
      expect(draft).not.toContain('data-testid="draft-banner"')
      // Open Graph / Twitter (og:url yalnızca yayın modunda)
      expect(meta(draft, 'property', 'og:title')).toMatch(/· Entegrasyonik$/)
      expect(meta(draft, 'property', 'og:description')).toBe(description)
      expect(meta(draft, 'property', 'og:locale')).toBe('tr_TR')
      expect(meta(draft, 'name', 'twitter:card')).toBe('summary')
      expect(meta(draft, 'property', 'og:url')).toBeUndefined()
      // breadcrumb: nav + geçerli sayfa + JSON-LD
      expect(draft).toMatch(/<nav class="[^"]*breadcrumb[^"]*" aria-label="Sayfa yolu"/)
      expect(draft).toContain('aria-current="page"')
      expect(draft).toContain('"@type":"BreadcrumbList"')

      // YAYIN modu: indexlenebilir + canonical + og:url (derleme dizin biçimi: sondaki eğik çizgi olabilir)
      const final = html(finalDir, route)
      const abs = new RegExp(`^${escapeRe(SITE + route)}/?$`)
      expect(meta(final, 'name', 'robots')).toBe('index,follow')
      const canonical = final.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
      expect(canonical, 'canonical').toMatch(abs)
      expect(meta(final, 'property', 'og:url')).toMatch(abs)
      expect(final).not.toContain('data-testid="draft-banner"')
    })
  }

  it('başlıklar benzersiz', () => {
    const titles = INNER_PAGES.map((r) => html(draftDir, r).match(/<title>([^<]*)<\/title>/)![1])
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('satır içi çalıştırılabilir betik yok (CSP script-src self): yalnızca ld+json veri blokları', () => {
    for (const route of INNER_PAGES) {
      const scripts = [...html(draftDir, route).matchAll(/<script\b([^>]*)>/g)].map((m) => m[1])
      for (const attrs of scripts) {
        expect(/type="application\/ld\+json"/.test(attrs) || /\bsrc="/.test(attrs), `${route}: ${attrs}`).toBe(true)
      }
    }
  })
})

/**
 * S16 kapsam özeti sayaçları (`data-stat`): kayıttan HESAPLANAN sayılar. Her değer burada aynı kayıttan yeniden
 * hesaplanıp birebir karşılaştırılır (uyuşmazsa hata); doğrulananlar "sabit rakam yok" taramasından çıkarılır.
 * Başka hiçbir rakam serbest değildir.
 */
const EXPECTED_STATS: Record<string, number> = {
  integrations: getPublicIntegrations().length,
  marketplaces: getPublicIntegrations('marketplace').length,
  kinds: new Set(getPublicIntegrations().map((i) => i.kind)).size,
  capabilities: new Set(getPublicIntegrations().flatMap((i) => i.capabilities.map((c) => c.key))).size,
  'kind-marketplace': getPublicIntegrations('marketplace').length,
  'kind-ecommerce': getPublicIntegrations('ecommerce').length,
  'kind-erp': getPublicIntegrations('erp').length,
  // S17 /ozellikler "Bir bakışta": çekirdek yetenek kaydından
  features: getPublicCapabilities('core').length,
  'features-available': getPublicCapabilities('core').filter((c) => c.status === 'available').length,
  'features-partial': getPublicCapabilities('core').filter((c) => c.status === 'partial').length,
  // S17 /sss sekme sayaçları: SSS kaydından
  'faq-total': getPublicFaq().length,
  ...Object.fromEntries(getPublicFaqByCategory().map((c) => [`faq-cat-${c.id}`, c.items.length])),
}
function withoutVerifiedStats(source: string): string {
  return source.replace(/<(dd|span)([^>]*)\sdata-stat="([^"]+)"([^>]*)>\s*(\d+)\s*<\/\1>/g, (_m, _tag, _a, id: string, _b, value: string) => {
    expect(EXPECTED_STATS[id], `bilinmeyen sayaç: ${id}`).toBeDefined()
    expect(Number(value), `sayaç ${id}`).toBe(EXPECTED_STATS[id])
    return ''
  })
}

describe('gizli öğe yok (roadmap, evidence, dahili notlar)', () => {
  const roadmap = integrations.filter((i) => i.status === 'roadmap').flatMap((i) => [i.name, ...i.aliases])
  const internal = integrations.flatMap((i) => i.internalNotes.slice(0, 2).map((n) => n.slice(0, 30)))
  const FOLD: Record<string, string> = { ç: 'c', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ı: 'i' }
  const norm = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/[çşğüöı]/g, (c) => FOLD[c] ?? c)
  const wholeWord = (name: string) => new RegExp(`(?<![\\p{L}\\d])${escapeRe(norm(name))}(?![\\p{L}\\d])`, 'u')

  it('hiçbir iç sayfada roadmap adı (tam sözcük), evidence/registry atfı veya dahili not geçmez', () => {
    for (const route of INNER_PAGES) {
      const raw = html(draftDir, route)
      const text = norm(visibleText(raw))
      for (const name of roadmap) expect(wholeWord(name).test(text), `${route}: ${name}`).toBe(false)
      expect(raw, route).not.toContain('INTEGRATIONS_REGISTRY')
      expect(raw, route).not.toMatch(/"evidence"|internalNotes/)
      for (const n of internal) expect(raw, route).not.toContain(n)
    }
  })

  it('yol haritası bölümü/başlığı yok', () => {
    for (const route of INNER_PAGES) {
      expect(visibleText(html(draftDir, route)).toLocaleLowerCase('tr-TR'), route).not.toMatch(/yol haritası|yakında|planlanıyor/)
    }
  })

  it('doğrulanamaz mutlak/sertifika iddiası ve sabit rakam yok', () => {
    const banned = ['%100', 'kesintisiz', 'sınırsız', 'garanti', '7/24', 'iso 27001', 'soc 2', 'veri merkezi', 'uptime', 'sertifikalı', 'en iyi', 'binlerce']
    for (const route of INNER_PAGES) {
      const text = visibleText(withoutVerifiedStats(html(draftDir, route)))
      const lower = text.toLocaleLowerCase('tr-TR')
      for (const b of banned) expect(lower, `${route}: ${b}`).not.toContain(b)
      // rakam yalnızca kanıtlı belirteçlerde (claims.test.ts NUMERIC_ALLOWLIST ile aynı)
      // künye alanları (src/data/company.ts: adres, telefon, MERSİS) iddia değil, iletişim bilgisidir
      const kunye = [company.address, company.phone, company.mersisNo].filter((v) => v.trim().length > 0)
      const stripped = kunye.reduce((t, v) => t.split(v).join(''), text).split('N11').join('').split('AES-256-GCM').join('')
      expect(/\d/.test(stripped), `${route}: rakam -> ${stripped.match(/.{0,30}\d.{0,30}/)?.[0]}`).toBe(false)
    }
  })
})

describe('/entegrasyonlar', () => {
  const page = () => html(draftDir, '/entegrasyonlar')

  it('yalnızca mevcut entegrasyon kartları (her koda tam 1 kart), "Kanal bazında kapsam" bölümü var (S12: ana sayfadan taşındı)', () => {
    const codes = [...page().matchAll(/data-testid="integration-card" data-code="([a-z0-9]+)"/g)].map((m) => m[1])
    expect(codes.sort()).toEqual([...AVAILABLE_INTEGRATION_CODES].sort())
    expect(page()).toMatch(/<section[^>]*id="kapsam"/)
    expect(page()).toContain('data-testid="coverage-matrix"')
    expect(page()).toContain('href="#kapsam"')
  })

  it('dürüst ve sakin kapsam gösterimi: destekleniyor / temel düzeyde / bu kanalda yok etiketleri ve kapsam rozetleri görünür', () => {
    const text = visibleText(page())
    expect(text).toContain('Temel düzeyde')
    expect(text).toContain('Bu kanalda yok')
    expect(text).toContain('Destekleniyor')
    for (const i of getPublicIntegrations()) expect(text).toContain(i.coverageLabel)
  })

  it('kapsam matrisi: caption, her kanala bir satır (detay bağlantılı), her hücre durumu metinle; mobil kompakt kartlar aynı veriyle', () => {
    const matrix = page().match(/<table[\s\S]*?<\/table>/)![0]
    expect(matrix).toMatch(/<caption class="sr-only"[^>]*>[^<]+<\/caption>/)
    expect([...matrix.matchAll(/<tr class="cm__row"/g)]).toHaveLength(AVAILABLE_INTEGRATION_CODES.length)
    for (const c of AVAILABLE_INTEGRATION_CODES) expect(matrix, c).toContain(`href="/entegrasyonlar/${c}"`)
    // her satırda 8 hücre, her hücrede ekran okuyucu metni
    expect([...matrix.matchAll(/<td\b/g)]).toHaveLength(AVAILABLE_INTEGRATION_CODES.length * 8)
    expect([...matrix.matchAll(/<td\b[^>]*>[\s\S]*?class="sr-only"[\s\S]*?<\/td>/g)]).toHaveLength(AVAILABLE_INTEGRATION_CODES.length * 8)
    const cards = page().match(/<ul class="cm__cards[^"]*"[\s\S]*?<\/ul>\s*<\/div>/)![0]
    expect(cards.match(/^<ul[^>]*>/)![0]).toMatch(/aria-label="[^"]+"/)
    expect([...cards.matchAll(/<li class="cm__card"/g)]).toHaveLength(AVAILABLE_INTEGRATION_CODES.length)
    // kapsam verisi kayıtla birebir: Bizimhesap stok/fiyat yazmaz -> "Bu kanalda yok"
    expect(visibleText(cards)).toMatch(/Stok ve fiyat güncelleme: Bu kanalda yok/)
  })

  it('S16: kapsam özeti sayaçları kayıttan; süzgeç yalnızca kayıttaki türler; her kartta kayıttan türeyen durum rozeti', () => {
    const p = page()
    const stats = [...p.matchAll(/data-stat="([^"]+)"[^>]*>\s*(\d+)\s*</g)].map((m) => [m[1], Number(m[2])] as const)
    expect(stats.length).toBeGreaterThanOrEqual(4)
    for (const [id, v] of stats) expect(v, id).toBe(EXPECTED_STATS[id])
    const filters = [...p.matchAll(/data-filter="([a-z]+)"/g)].map((m) => m[1])
    expect(filters).toEqual(['all', ...new Set(getPublicIntegrations().map((i) => i.kind))])
    const statuses = [...p.matchAll(/data-testid="integration-status"[^>]*>([\s\S]*?)<\/span>\s*<\/div>|data-testid="integration-status"/g)]
    expect(statuses.length).toBe(AVAILABLE_INTEGRATION_CODES.length)
    expect(visibleText(p)).toContain('Kullanılabilir')
    expect(visibleText(p)).not.toMatch(/Canlı|Yakında/)
  })

  it('her kart kendi detay sayfasına bağlanır', () => {
    for (const c of AVAILABLE_INTEGRATION_CODES) expect(page()).toContain(`href="/entegrasyonlar/${c}"`)
  })
})

describe('/entegrasyonlar/[kod]', () => {
  for (const i of getPublicIntegrations()) {
    it(`${i.code}: matris, sınırlamalar, bağlantı türleri`, () => {
      const page = html(draftDir, `/entegrasyonlar/${i.code}`)
      const text = visibleText(page)
      expect(text).toContain(i.name)
      // yetenek matrisi: her yetenek etiketi + notu
      for (const c of i.capabilities) {
        expect(text, `${i.code}/${c.key}`).toContain(c.label)
        expect(text).toContain(c.note)
      }
      // sınırlamalar ve sunulmayanlar
      for (const l of i.limitations) expect(text).toContain(l)
      for (const n of i.notProvided) expect(text).toContain(n)
      if (i.limitations.length > 0) expect(page).toContain('data-testid="limitations"')
      if (i.notProvided.length > 0) expect(page).toContain('data-testid="not-provided"')
      // nasıl bağlanır: kimlik bilgisi TÜRLERİ
      const guide = getConnectGuide(i.code, i.kind)!
      expect(page).toContain('data-testid="credential-types"')
      for (const label of guide.credentials) expect(text).toContain(label)
      for (const step of guide.steps) expect(text).toContain(step)
      // breadcrumb son öğesi = entegrasyon adı
      expect(page).toMatch(new RegExp(`aria-current="page"[^>]*>\\s*${escapeRe(i.name)}\\s*<`))
    })
  }

  it('Bizimhesap detayı yalnızca okuma sınırını, Ideasoft detayı OAuth sınırını açıkça yazar', () => {
    expect(visibleText(html(draftDir, '/entegrasyonlar/bizimhesap'))).toMatch(/Yalnızca okuma/)
    expect(visibleText(html(draftDir, '/entegrasyonlar/ideasoft'))).toMatch(/OAuth/)
  })

  it('kimlik bilgisi alanlarında sır/örnek değer kalıbı yok (anahtar=değer, uzun rastgele dize)', () => {
    for (const i of getPublicIntegrations()) {
      const page = visibleText(html(draftDir, `/entegrasyonlar/${i.code}`))
      expect(page).not.toMatch(/[A-Za-z0-9]{32,}/)
      expect(page).not.toMatch(/(api[_ -]?key|secret|token)\s*[:=]\s*\S+/i)
    }
  })
})

describe('/ozellikler', () => {
  const page = () => html(draftDir, '/ozellikler')

  it('her gösterilebilir çekirdek yetenek için bir bölüm; roadmap yetenekleri yok', () => {
    const core = getPublicCapabilities('core')
    expect((page().match(/data-testid="feature"/g) ?? []).length).toBe(core.length)
    for (const c of core) expect(visibleText(page())).toContain(c.title)
  })

  it('aşırı satış anlatımı kanıtlı maddelerle; kısmi yeteneklerde kapsam notu görünür', () => {
    const text = visibleText(page())
    for (const p of featureDetails['stock-reservation']) expect(text).toContain(p.text)
    expect(text).toContain('Kapsam notu:')
  })
})

describe('/guvenlik', () => {
  const page = () => html(draftDir, '/guvenlik')

  it('her kayıtlı güvenlik iddiası tam bir kez görünür (kayıt kaybolmaz)', () => {
    const ids = [...page().matchAll(/data-testid="security-claim" data-claim="([a-z-]+)"/g)].map((m) => m[1])
    expect([...ids].sort()).toEqual(getPublicCapabilities('security').map((c) => c.id).sort())
    for (const id of ['secrets-encryption', 'session-cookie', 'role-based-access', 'integration-resilience', 'tenant-database']) {
      expect(ids).toContain(id)
    }
  })

  it('S16: dört-altı güvence ilkesi; her güvenlik kaydı tam bir ilkede; her ilke maddesi repoda kanıtlı', () => {
    expect(securityPrinciples.length).toBeGreaterThanOrEqual(4)
    expect(securityPrinciples.length).toBeLessThanOrEqual(6)
    const ids = getPublicCapabilities('security').map((c) => c.id)
    const assigned = securityPrinciples.flatMap((p) => p.capabilityIds)
    expect([...assigned].sort()).toEqual([...ids].sort())
    for (const pr of securityPrinciples) {
      expect(pr.capabilityIds.length + pr.points.length, pr.id).toBeGreaterThan(0)
      for (const pt of pr.points) {
        expect(pt.evidence.length, pt.text).toBeGreaterThan(0)
        for (const e of pt.evidence) {
          const file = path.join(repoRoot, e.path)
          expect(existsSync(file), e.path).toBe(true)
          if (e.contains) expect(readFileSync(file, 'utf8').includes(e.contains), `${e.path}: ${e.contains}`).toBe(true)
        }
      }
    }
    const p = page()
    expect([...p.matchAll(/data-principle="([a-z]+)"/g)].map((m) => m[1])).toEqual(securityPrinciples.map((x) => x.id))
    // ayrıntılar JS'siz <details>; değer cümlesi her zaman görünür
    expect((p.match(/<details class="principle__more/g) ?? []).length).toBe(securityPrinciples.length)
    for (const pr of securityPrinciples) expect(visibleText(p)).toContain(pr.value)
  })

  it('AES-256-GCM, HTTP-only, dayanıklılık ifadeleri kayıttan gelir', () => {
    const text = visibleText(page())
    expect(text).toContain('AES-256-GCM')
    expect(text).toContain('HTTP-only')
    expect(text).toMatch(/devre kesici/)
  })

  it('sertifika/uyumluluk/veri konumu iddiası yok; kapsam sınırı yazılı', () => {
    const text = visibleText(page()).toLocaleLowerCase('tr-TR')
    for (const b of ['iso', 'soc', 'sertifikalı', 'onaylı', "türkiye'de", 'veri konumu', 'uptime', 'pci']) {
      expect(text, b).not.toMatch(new RegExp(`(?<![a-zçğıöşü])${escapeRe(b)}`))
    }
    expect(text).toContain('sertifikasyon veya bağımsız denetim belgesi değildir')
  })

  it('KVKK bağlantısı yalnızca yasal sayfa yayımlıysa verilir (bayrak kuralı)', () => {
    const kvkk = published(legalNav).some((i) => i.href === '/yasal/kvkk-aydinlatma')
    expect(page().includes('href="/yasal/kvkk-aydinlatma"')).toBe(kvkk)
    expect(page().includes('data-testid="kvkk-pending"')).toBe(!kvkk)
  })
})

describe('/sss', () => {
  const page = () => html(draftDir, '/sss')

  it("her soru bir <details>; JS'siz akordeon; FAQPage şeması kayıtla eşleşir", () => {
    const faq = getPublicFaq()
    expect((page().match(/<details class="acc__item/g) ?? []).length).toBe(faq.length)
    expect((page().match(/<summary class="acc__summary/g) ?? []).length).toBe(faq.length)
    const ld = [...page().matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
    const faqLd = ld.find((x) => x['@type'] === 'FAQPage')
    expect(faqLd.mainEntity.map((q: { name: string }) => q.name)).toEqual(faq.map((q) => q.question))
    for (const q of faq) expect(visibleText(page())).toContain(q.question)
  })
})

describe('/iletisim', () => {
  // S16 (kasıtlı davranış değişikliği): env boşken önceden yer tutucu gösteriliyor ve "Bize yazın" mailto düğmeleri
  // HİÇ üretilmiyordu (kullanıcının bildirdiği hata). Artık şirket kaydındaki genel adres varsayılandır.
  it('env boş: varsayılan şirket adresiyle konu bazlı mailto düğmeleri + kopyala düğmesi; yer tutucu ve form YOK', () => {
    const p = html(draftDir, '/iletisim')
    expect(DEFAULT_CONTACT_EMAIL).toBe('bilgi@entegrasyonik.com.tr')
    expect(p).toContain(`href="mailto:${DEFAULT_CONTACT_EMAIL}"`)
    expect((p.match(/data-testid="contact-mailto"/g) ?? []).length).toBe(4)
    expect(p).toMatch(new RegExp(`href="mailto:${escapeRe(DEFAULT_CONTACT_EMAIL)}\\?subject=Kurumsal%20teklif%20talebi"`))
    expect(p).toMatch(new RegExp(`data-copy="${escapeRe(DEFAULT_CONTACT_EMAIL)}"`))
    expect(p).toMatch(/data-copy-status[^>]*aria-live="polite"|aria-live="polite"[^>]*data-copy-status/)
    expect(p).not.toContain('contact-placeholder')
    expect(visibleText(p)).not.toContain('{{İLETİŞİM_E_POSTA}}')
    expect(visibleText(p)).not.toContain('yayın öncesinde eklenecektir')
    expect(p).not.toMatch(/<form\b/)
    expect(p).not.toMatch(/<input\b|<textarea\b/)
  })

  it('env verilince o adres kullanılır (konu ön dolgulu), yine form YOK', () => {
    const p = html(finalDir, '/iletisim')
    expect(p).toContain(`href="mailto:${EMAIL}"`)
    expect((p.match(/data-testid="contact-mailto"/g) ?? []).length).toBe(4)
    expect(p).toMatch(new RegExp(`mailto:${escapeRe(EMAIL)}\\?subject=`))
    expect(p).not.toContain(`mailto:${DEFAULT_CONTACT_EMAIL}`)
    expect(p).not.toMatch(/<form\b/)
    expect(p).not.toContain('contact-placeholder')
  })

  it('künye alanları company.ts dosyasından gelir: doluysa satır görünür, boşsa gizlenir; ham {{…}} görünmez', () => {
    const p = html(draftDir, '/iletisim')
    const v = visibleText(p)
    expect(p.includes('data-testid="kunye-address"')).toBe(company.address.trim().length > 0)
    expect(p.includes('data-testid="kunye-legal-name"')).toBe(company.legalName.trim().length > 0)
    expect(p.includes('data-testid="kunye-mersis"')).toBe(company.mersisNo.trim().length > 0)
    if (company.address) expect(v).toContain(company.address)
    if (company.legalName) expect(v).toContain(company.legalName)
    expect(v).not.toContain('{{ADRES}}')
  })

  it('yanıt süresi/destek saati iddiası yok; boş künye alanları ham {{…}} olarak görünmez', () => {
    const t = visibleText(html(draftDir, '/iletisim')).toLocaleLowerCase('tr-TR')
    expect(t).not.toMatch(/yanıt süresi|saat içinde|iş günü|7\/24|hızlıca dönüş/)
    expect(html(draftDir, '/iletisim')).toContain('data-testid="kunye-details"')
    const v = visibleText(html(draftDir, '/iletisim'))
    expect(v).not.toContain('{{ŞİRKET_UNVANI}}')
    expect(v).not.toContain('{{MERSİS_NO}}')
  })
})

describe('S14: /ozellikler/stok-rezervasyonu', () => {
  const page = () => html(draftDir, '/ozellikler/stok-rezervasyonu')

  it('sorun → nasıl çalışır → fayda: tüm anlatı maddeleri, yetenek özeti, kanıtlı maddeler ve kapsam notu görünür', () => {
    const text = visibleText(page())
    const story = getStockReservationStory()
    for (const x of [...story.problems, ...story.steps, ...story.benefits]) {
      expect(text, x.title).toContain(x.title)
      expect(text, x.title).toContain(x.text)
    }
    const cap = getPublicCapabilities('core').find((c) => c.id === 'stock-reservation')!
    expect(text).toContain(cap.summary)
    expect(text).toContain(cap.caveat!)
    for (const p of featureDetails['stock-reservation']) expect(text).toContain(p.text)
    expect(page()).toMatch(/<section[^>]*id="nasil-calisir"/)
  })

  it('animasyonlu sahne: hareket kontrolü var, sahne dekoratif (aria-hidden) ve SSS akordeonu var', () => {
    expect(page()).toContain('data-motion-toggle')
    expect(page()).toMatch(/data-scene="stock-flow"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*data-scene="stock-flow"/)
    expect(page()).toContain('data-testid="accordion"')
  })

  it('/ozellikler somut akış cümlelerini gösterir ve derin sayfaya bağlanır', () => {
    const oz = html(draftDir, '/ozellikler')
    for (const c of getPublicCapabilities('core')) expect(visibleText(oz), c.id).toContain(c.action!)
    expect(oz).toContain('href="/ozellikler/stok-rezervasyonu"')
  })
})

describe('S14: /destek', () => {
  const page = () => html(draftDir, '/destek')

  it('beş kategori kartı; her kategori SSS kayıtlarına (/sss#id) bağlanır; arama kutusu yok', () => {
    expect((page().match(/data-testid="support-category"/g) ?? []).length).toBe(5)
    for (const c of getSupportCategories()) {
      expect(page()).toMatch(new RegExp(`id="${c.id}"`))
      for (const q of c.items) {
        expect(page(), q.id).toContain(`href="/sss#${q.id}"`)
        expect(visibleText(page())).toContain(q.question)
      }
    }
    expect(page()).not.toMatch(/type="search"/)
  })

  it('kanal bağlama kategorisi her mevcut entegrasyonun bağlantı rehberine bağlanır', () => {
    for (const c of AVAILABLE_INTEGRATION_CODES) expect(page(), c).toContain(`href="/entegrasyonlar/${c}#baglanti-rehberi"`)
  })

  it('gezinme ve footer destek merkezine, footer stok rezervasyonu sayfasına bağlanır', () => {
    const home = readFileSync(path.join(draftDir, 'index.html'), 'utf8')
    expect(home.match(/<header[\s\S]*?<\/header>/)![0]).toContain('href="/destek"')
    const footer = home.match(/<footer[\s\S]*?<\/footer>/)![0]
    expect(footer).toContain('href="/destek"')
    expect(footer).toContain('href="/ozellikler/stok-rezervasyonu"')
  })
})

describe('S14: kanal bağlantı rehberi', () => {
  for (const i of getPublicIntegrations()) {
    it(`${i.code}: numaralı rehber, HowTo şeması adımlarla birebir, SEO başlığı`, () => {
      const page = html(draftDir, `/entegrasyonlar/${i.code}`)
      expect(page).toMatch(/<section[^>]*id="baglanti-rehberi"/)
      expect(page).toMatch(new RegExp(`<title>${escapeRe(i.name)} entegrasyonu: bağlantı rehberi ve kapsam · Entegrasyonik</title>`))
      const ld = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))
      const howTo = ld.find((x) => x['@type'] === 'HowTo')
      expect(howTo, 'HowTo').toBeTruthy()
      const text = visibleText(page)
      for (const step of howTo.step) expect(text).toContain(step.text)
      const guide = getConnectGuide(i.code, i.kind)!
      expect(howTo.supply.map((s: { name: string }) => s.name)).toEqual(guide.credentials)
    })
  }
})

describe('bağlantı denetimi (iç bağlantılar 404 vermez)', () => {
  const allPages = (dir: string): string[] => {
    const out: string[] = []
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n)
        if (statSync(p).isDirectory()) walk(p)
        else if (n === 'index.html' || n === '404.html') out.push(p)
      }
    }
    walk(dir)
    return out
  }

  const resolves = (dir: string, href: string): boolean => {
    const clean = href.split('#')[0].split('?')[0]
    if (clean === '') return true
    const target = path.join(dir, clean)
    return existsSync(path.join(target, 'index.html')) || (existsSync(target) && statSync(target).isFile())
  }

  it("taslak derleme: tüm iç href/src hedefleri mevcut; sayfa içi #bağlantıların id'si var", () => {
    const broken: string[] = []
    for (const file of allPages(draftDir)) {
      const source = readFileSync(file, 'utf8')
      const rel = path.relative(draftDir, file)
      for (const m of source.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const href = m[1]
        if (/^(https?:|mailto:|tel:|data:)/.test(href)) continue
        if (href.startsWith('#')) {
          if (href.length > 1 && !source.includes(`id="${href.slice(1)}"`)) broken.push(`${rel}: ${href} (id yok)`)
          continue
        }
        if (href.startsWith('/') && !resolves(draftDir, href)) broken.push(`${rel}: ${href}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('iç sayfalardan dışarı giden mutlak bağlantılar yalnızca yapılandırılmış uygulama adresine gider', () => {
    for (const route of INNER_PAGES) {
      const hrefs = [...html(draftDir, route).matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1])
      for (const h of hrefs) expect(h.startsWith(APP), `${route}: ${h}`).toBe(true)
    }
  })
})

describe('veri kayıtları (yeni: connect, feature-details)', () => {
  const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8')

  it('bağlantı kılavuzu kodları = mevcut entegrasyon kodları; her evidence dosyada geçiyor', () => {
    expect(connectGuides.map((g) => g.code).sort()).toEqual([...AVAILABLE_INTEGRATION_CODES].sort())
    for (const g of connectGuides) {
      expect(g.evidence.length, g.code).toBeGreaterThan(0)
      for (const e of g.evidence) {
        expect(existsSync(path.join(repoRoot, e.path)), e.path).toBe(true)
        expect(read(e.path).includes(e.contains!), `${g.code}: ${e.contains}`).toBe(true)
      }
    }
  })

  it('kimlik bilgisi sayısı fabrikadaki zorunlu ayar sayısıyla uyumlu (eksik/fazla alan yazılmaz)', () => {
    const required: Record<string, number> = { trendyol: 3, hepsiburada: 3, n11: 2, pazarama: 2, ideasoft: 3, bizimhesap: 2 }
    for (const g of connectGuides) expect(g.credentials.length, g.code).toBe(required[g.code])
  })

  it('seçici evidence sızdırmaz; roadmap kodu için kılavuz yok', () => {
    const json = JSON.stringify(getConnectGuide('trendyol', 'marketplace'))
    expect(json).not.toContain('evidence')
    expect(getConnectGuide('amazon', 'marketplace')).toBeUndefined()
  })

  it('özellik maddelerinin kanıtı dosyada geçiyor ve yalnızca kayıtlı yeteneklere bağlı', () => {
    const ids = new Set(getPublicCapabilities().map((c) => c.id))
    for (const [id, points] of Object.entries(featureDetails)) {
      expect(ids.has(id), id).toBe(true)
      for (const p of points) for (const e of p.evidence) expect(read(e.path).includes(e.contains!), e.contains).toBe(true)
    }
    expect(PATHS.adr0004).toBeTruthy()
  })
})

describe('iletişim adresi çözümleyici', () => {
  it('boş -> şirket varsayılanı (S16); geçerli -> adres; biçimsiz -> fail-fast', () => {
    expect(resolveContactEmail({})).toBe('bilgi@entegrasyonik.com.tr')
    expect(resolveContactEmail({ PUBLIC_CONTACT_EMAIL: '  ' })).toBe('bilgi@entegrasyonik.com.tr')
    expect(resolveContactEmail({ PUBLIC_CONTACT_EMAIL: EMAIL })).toBe(EMAIL)
    for (const bad of ['yok', 'a@b', 'a b@c.d', '<x>@y.z', 'a@b.c,d@e.f']) {
      expect(() => resolveContactEmail({ PUBLIC_CONTACT_EMAIL: bad }), bad).toThrow()
    }
  })

  it('mailto konusu kodlanır', () => {
    expect(mailtoHref(EMAIL, 'Kurumsal teklif talebi')).toBe(`mailto:${EMAIL}?subject=Kurumsal%20teklif%20talebi`)
    expect(mailtoHref(EMAIL)).toBe(`mailto:${EMAIL}`)
  })
})
