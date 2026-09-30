/**
 * S19 — SEO + LLM görünürlüğü (GEO/AEO) sözleşmesi. Tek GERÇEK `astro build` (yayın modu) çıktısını ve
 * `src/data/seo.ts` kaydını birlikte denetler:
 *  - kayıt bütünlüğü (başlık ≤ 60, açıklama 70–155, benzersizlik, URL kalıbı) ve KAYITSIZ SAYFA YOK
 *  - her sayfa: tek h1 + sıralı başlık hiyerarşisi, title/description/canonical/robots/hreflang/OG/Twitter, görsel alt metni
 *  - JSON-LD: geçerli JSON, zorunlu alanlar, görünür metinle tutarlılık, sahte puan/yorum YOK, ÖRNEK şirket değeri YOK
 *  - sitemap = indekslenen sayfalar (+ gerçek lastmod), robots.txt (AI tarayıcı kararı, önizleme yasağı), yetim sayfa yok
 *  - llms.txt her indekslenen sayfayı içerir; sayfa başına markdown alternatifi var ve temiz
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { buildSite, siteRoot } from '../scripts/lib/build.mjs'
import {
  seoEntries,
  indexableEntries,
  normalizePath,
  fullTitle,
  canonicalPath,
  markdownPath,
  ogImageFor,
  entityDefinition,
  crumbTrail,
  UPCOMING_NOTE,
  TITLE_MAX,
  DESCRIPTION_MIN,
  DESCRIPTION_MAX,
  OG_IMAGE_WIDTH,
  OG_IMAGE_HEIGHT,
  type SeoEntry,
} from '../src/data/seo'
import { buildRobots, AI_CRAWLERS } from '../src/lib/robots'
import { htmlToMarkdown, decodeEntities } from '../src/lib/html-to-markdown.mjs'
import { company, COMPANY_SAMPLE_VALUES } from '../src/data/company'
import { defaultPlanSource } from '../src/data/plans'
import { getPublicFaq } from '../src/data/faq'
import { integrations, getPublicIntegrations } from '../src/data/integrations'
import { LEGAL_REVIEWED } from '../src/data/legal'
import { UPCOMING_SURFACES } from '../src/data/assistant'

const APP = 'https://app.example.test'
const SITE = 'https://entegrasyonik.example.test'
let dir = ''

beforeAll(() => {
  dir = buildSite({ outDir: 'dist-seo', env: { SITE_DRAFT: 'false', PUBLIC_APP_URL: APP, PUBLIC_SITE_URL: SITE }, silent: true })
}, 240_000)

// ---------------------------------------------------------------------------------------------- yardımcılar

const htmlFileFor = (p: string) => path.join(dir, p === '/' ? 'index.html' : p === '/404' ? '404.html' : path.join(p, 'index.html'))
const read = (p: string) => readFileSync(htmlFileFor(p), 'utf8')
const builtEntries = (): SeoEntry[] => seoEntries.filter((e) => !e.previewOnly)
const canonicalUrl = (p: string) => new URL(canonicalPath(p), SITE).href

const meta = (source: string, attr: 'name' | 'property', key: string): string | undefined => {
  const raw = source.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1]
  return raw === undefined ? undefined : decodeEntities(raw)
}
const linkHref = (source: string, rel: string, extra = ''): string | undefined =>
  source.match(new RegExp(`<link rel="${rel}"${extra}[^>]*href="([^"]+)"`))?.[1]

/** Görünür metin: head/script/style atılır, gizli (hidden/aria-hidden) içerik markdown dönüştürücüsüyle aynı kuralla düşer. */
function visibleText(source: string): string {
  const body = source.replace(/<head[\s\S]*?<\/head>/, '')
  return decodeEntities(
    body
      .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  )
}
const squash = (s: string) => s.replace(/\s+/g, ' ').replace(/ ([,.;:!?])/g, '$1').trim()

type Ld = Record<string, unknown> & { '@type': string }
const jsonLd = (source: string): Ld[] =>
  [...source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]))

function walkFiles(d: string, pick: (name: string) => boolean): string[] {
  return readdirSync(d).flatMap((n) => {
    const p = path.join(d, n)
    return statSync(p).isDirectory() ? walkFiles(p, pick) : pick(n) ? [p] : []
  })
}

function deepKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => deepKeys(v, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k)
      deepKeys(v, out)
    }
  }
  return out
}

function pngSize(file: string): { width: number; height: number } {
  const b = readFileSync(file)
  expect(b.subarray(1, 4).toString('ascii'), file).toBe('PNG')
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

// ------------------------------------------------------------------------------------------ kayıt bütünlüğü

describe('SEO kaydı (src/data/seo.ts)', () => {
  it('yollar benzersiz ve URL kalıbına uyar (küçük harf ASCII, tire, sondaki eğik çizgi yok)', () => {
    const paths = seoEntries.map((e) => e.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const p of paths) expect(p, p).toMatch(/^\/([a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*)?$/)
  })

  it(`tam başlık ≤ ${TITLE_MAX} karakter, marka sonda, benzersiz`, () => {
    const titles = seoEntries.map(fullTitle)
    for (const t of titles) {
      expect(t.length, t).toBeLessThanOrEqual(TITLE_MAX)
      expect(t, t).toMatch(/Entegrasyonik$/)
    }
    expect(new Set(titles).size).toBe(titles.length)
  })

  it(`açıklama ${DESCRIPTION_MIN}–${DESCRIPTION_MAX} karakter ve benzersiz`, () => {
    for (const e of seoEntries) {
      expect(e.description.length, `${e.path} (${e.description.length})`).toBeGreaterThanOrEqual(DESCRIPTION_MIN)
      expect(e.description.length, `${e.path} (${e.description.length})`).toBeLessThanOrEqual(DESCRIPTION_MAX)
    }
    const d = seoEntries.map((e) => e.description)
    expect(new Set(d).size).toBe(d.length)
  })

  it('indekslenen her sayfanın llms özeti ve ekmek kırıntısı var; kaynak dosyaları mevcut', () => {
    for (const e of seoEntries) {
      if (e.index) expect(e.llmsSummary.length, e.path).toBeGreaterThan(20)
      if (e.index && e.path !== '/') expect(e.crumb, e.path).toBeTruthy()
      for (const s of e.sources) expect(existsSync(path.join(siteRoot, s)), `${e.path}: ${s}`).toBe(true)
    }
  })

  it('karar: 404 ve önizleme noindex; yasal sayfalar hukuki onaya (LEGAL_REVIEWED) bağlı', () => {
    expect(seoEntries.find((e) => e.path === '/404')!.index).toBe(false)
    for (const e of seoEntries.filter((x) => x.previewOnly)) expect(e.index).toBe(false)
    for (const e of seoEntries.filter((x) => x.section === 'legal')) expect(e.index, e.path).toBe(LEGAL_REVIEWED)
  })

  it('Product/Review/AggregateRating türü kayıtta hiç yok', () => {
    const types = new Set(seoEntries.flatMap((e) => e.schema as string[]))
    for (const t of ['Product', 'Review', 'AggregateRating', 'Service']) expect(types.has(t), t).toBe(false)
  })
})

describe('varlık tanımı ("Entegrasyonik nedir?")', () => {
  const def = entityDefinition()

  it('yalnızca mevcut (available) entegrasyonları adıyla sayar, roadmap adı geçmez', () => {
    for (const i of getPublicIntegrations()) expect(def, i.name).toContain(i.name)
    for (const r of integrations.filter((i) => i.status === 'roadmap')) {
      for (const n of [r.name, ...r.aliases]) expect(def.toLocaleLowerCase('tr-TR'), n).not.toContain(n.toLocaleLowerCase('tr-TR'))
    }
  })

  // S23 (SR2-ENTITY 8): Entegrasyonik bir yazılım değil PLATFORMDUR (kategori terimi korunur, öz-tanım "platform").
  it('kategori ifadesi net: pazaryeri entegrasyonu ve stok yönetimi platformu', () => {
    expect(def).toMatch(/^Entegrasyonik, .*pazaryeri entegrasyonu ve stok yönetimi platformudur\./)
  })
})

// ------------------------------------------------------------------------------------ derlenmiş sayfalar

describe('derleme çıktısı: kayıtsız sayfa yok', () => {
  it('her HTML dosyası kayıtlı, her kayıtlı (önizleme dışı) sayfa derlenmiş', () => {
    const files = walkFiles(dir, (n) => n.endsWith('.html'))
    const built = files.map((f) => normalizePath('/' + path.relative(dir, f).split(path.sep).join('/')))
    const registered = new Set(seoEntries.map((e) => e.path))
    expect(built.filter((p) => !registered.has(p)), 'kayıtsız sayfalar').toEqual([])
    for (const e of builtEntries()) expect(existsSync(htmlFileFor(e.path)), e.path).toBe(true)
  })

  it('önizleme sayfası üretim derlemesinde yok', () => {
    for (const e of seoEntries.filter((x) => x.previewOnly)) expect(existsSync(htmlFileFor(e.path)), e.path).toBe(false)
  })
})

describe('her sayfa: başlık hiyerarşisi, meta, OG, JSON-LD', () => {
  for (const e of seoEntries.filter((x) => !x.previewOnly)) {
    describe(e.path, () => {
      let html = ''
      let ld: Ld[] = []
      beforeAll(() => {
        html = read(e.path)
        ld = jsonLd(html)
      })

      it('tek h1; <main> içinde başlık düzeyleri atlamadan iner', () => {
        expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1)
        const main = html.match(/<main\b[\s\S]*<\/main>/)![0]
        const levels = [...main.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]))
        expect(levels[0], 'ilk başlık h1').toBe(1)
        for (let i = 1; i < levels.length; i++) {
          expect(levels[i] - levels[i - 1], `h${levels[i - 1]} → h${levels[i]} (sıra ${i})`).toBeLessThanOrEqual(1)
        }
      })

      it('title/description/robots/canonical/hreflang kayıttan', () => {
        expect(html).toContain(`<title>${fullTitle(e).replace(/&/g, '&amp;').replace(/'/g, '&#39;')}</title>`)
        expect(meta(html, 'name', 'description')).toBe(e.description)
        expect(meta(html, 'name', 'robots')).toBe(e.index ? 'index,follow' : 'noindex,nofollow')
        expect(linkHref(html, 'canonical')).toBe(canonicalUrl(e.path))
        const hreflang = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]])
        expect(hreflang).toEqual(e.index ? [['tr', canonicalUrl(e.path)], ['x-default', canonicalUrl(e.path)]] : [])
        expect(html).not.toMatch(/hreflang="en/)
      })

      it('Open Graph + Twitter kartı tam; OG görseli 1200×630 PNG olarak derlenmiş', () => {
        expect(meta(html, 'property', 'og:title')).toBe(fullTitle(e))
        expect(meta(html, 'property', 'og:description')).toBe(e.description)
        expect(meta(html, 'property', 'og:url')).toBe(canonicalUrl(e.path))
        expect(meta(html, 'property', 'og:type')).toBe('website')
        expect(meta(html, 'property', 'og:locale')).toBe('tr_TR')
        expect(meta(html, 'property', 'og:site_name')).toBe('Entegrasyonik')
        const img = meta(html, 'property', 'og:image')!
        expect(img).toBe(new URL(ogImageFor(e), SITE).href)
        expect(meta(html, 'property', 'og:image:alt')!.length).toBeGreaterThan(10)
        expect(meta(html, 'name', 'twitter:card')).toBe('summary_large_image')
        expect(meta(html, 'name', 'twitter:image')).toBe(img)
        const size = pngSize(path.join(dir, new URL(img).pathname))
        expect(size).toEqual({ width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT })
      })

      it('markdown alternatifi yalnızca indekslenen sayfada (bağlantı + dosya)', () => {
        const md = linkHref(html, 'alternate', ' type="text/markdown"')
        const file = path.join(dir, markdownPath(e.path))
        if (e.index) {
          expect(md).toBe(markdownPath(e.path))
          expect(existsSync(file), file).toBe(true)
        } else {
          expect(md).toBeUndefined()
          expect(existsSync(file), file).toBe(false)
        }
      })

      it('görsellerin alt metni var; footer varlık tanımı görünür', () => {
        for (const m of html.matchAll(/<img\b[^>]*>/g)) expect(m[0], m[0]).toMatch(/\balt="/)
        expect(squash(visibleText(html))).toContain(entityDefinition())
      })

      it('JSON-LD: geçerli, @context schema.org, sahte puan/yorum ve ürün türü yok', () => {
        expect(ld.length).toBeGreaterThan(0)
        for (const node of ld) {
          expect(node['@context']).toBe('https://schema.org')
          expect(typeof node['@type']).toBe('string')
          expect(['Product', 'Review', 'AggregateRating', 'Service']).not.toContain(node['@type'])
        }
        const keys = deepKeys(ld)
        for (const k of ['aggregateRating', 'review', 'reviewRating', 'ratingValue', 'reviewCount']) expect(keys, k).not.toContain(k)
      })

      it('JSON-LD sayfa düğümü canonical ile aynı; iç sayfada BreadcrumbList görünür kırıntıyla birebir', () => {
        const page = ld.find((n) => ['WebPage', 'CollectionPage', 'ContactPage', 'FAQPage'].includes(n['@type']))!
        expect(page, 'sayfa düğümü').toBeTruthy()
        expect(page.url).toBe(canonicalUrl(e.path))
        expect(page.name).toBe(fullTitle(e))
        expect(page.inLanguage).toBe('tr-TR')
        const bc = ld.find((n) => n['@type'] === 'BreadcrumbList') as { itemListElement: Array<{ position: number; name: string; item: string }> } | undefined
        const trail = crumbTrail(e.path)
        if (trail.length === 0) {
          expect(bc).toBeUndefined()
          return
        }
        expect(bc, 'BreadcrumbList').toBeTruthy()
        expect(bc!.itemListElement.map((x) => x.position)).toEqual(trail.map((_, i) => i + 1))
        expect(bc!.itemListElement.map((x) => x.item)).toEqual(trail.map((c) => canonicalUrl(c.path)))
        const nav = html.match(/<nav class="[^"]*breadcrumb[^"]*" aria-label="Sayfa yolu"[^>]*>([\s\S]*?)<\/nav>/)![1]
        const visible = [...nav.matchAll(/<(?:a|span) class="breadcrumb__(?:link|current)"[^>]*>([\s\S]*?)<\/(?:a|span)>/g)].map((m) =>
          squash(decodeEntities(m[1])),
        )
        expect(bc!.itemListElement.map((x) => x.name)).toEqual(visible)
      })
    })
  }
})

describe('JSON-LD türleri ve içerik tutarlılığı', () => {
  it('ana sayfa: Organization + WebSite + SoftwareApplication, zorunlu alanlar', () => {
    const ld = jsonLd(read('/'))
    const org = ld.find((n) => n['@type'] === 'Organization')!
    expect(org.name).toBe('Entegrasyonik')
    expect(org.url).toBe(`${SITE}/`)
    expect((org.logo as { url: string }).url).toBe(`${SITE}/icon-512.png`)
    expect(org.description).toBe(entityDefinition())
    const web = ld.find((n) => n['@type'] === 'WebSite')!
    expect(web.url).toBe(`${SITE}/`)
    expect(web.potentialAction, 'SearchAction yok (sitede genel arama yok)').toBeUndefined()
    const app = ld.find((n) => n['@type'] === 'SoftwareApplication')!
    expect(app.applicationCategory).toBe('BusinessApplication')
    expect(app.operatingSystem).toBe('Web')
    expect(app.name).toBe('Entegrasyonik')
  })

  it('SoftwareApplication fiyatı yalnızca NİHAİ fiyat kaynağından (öneri fiyat yapılandırılmış veriye girmez)', () => {
    const app = jsonLd(read('/')).find((n) => n['@type'] === 'SoftwareApplication')!
    if (defaultPlanSource.proposal) expect(app.offers).toBeUndefined()
    else expect(Array.isArray(app.offers)).toBe(true)
  })

  it('ÖRNEK şirket değerleri (COMPANY_SAMPLE_VALUES) hiçbir JSON-LD bloğuna yazılmaz', () => {
    const all = builtEntries()
      .map((e) => [...read(e.path).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n'))
      .join('\n')
    if (COMPANY_SAMPLE_VALUES) {
      for (const v of [company.address, company.phone, company.legalName, company.mersisNo]) if (v) expect(all, v).not.toContain(v)
      expect(all).not.toContain('"telephone"')
      expect(all).not.toContain('"address"')
    }
  })

  it('FAQPage yalnızca /sss ve kayıtta FAQPage taşıyan rehber sayfaları; soru ve cevaplar görünür metinle birebir', () => {
    for (const e of builtEntries().filter((x) => x.path !== '/sss')) {
      const faqLd = jsonLd(read(e.path)).find((n) => n['@type'] === 'FAQPage') as
        | { mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }> }
        | undefined
      // S20b: rehber (hub + rehber sayfaları) kendi görünür SSS'sini taşır; başka hiçbir sayfada FAQPage yok.
      expect(!!faqLd, e.path).toBe(e.schema.includes('FAQPage') && e.section === 'rehber')
      if (!faqLd) continue
      const text = squash(visibleText(read(e.path)))
      for (const q of faqLd.mainEntity) {
        expect(text, `${e.path}: ${q.name}`).toContain(squash(q.name))
        expect(text, `${e.path}: ${q.name}`).toContain(squash(q.acceptedAnswer.text))
      }
    }
    const html = read('/sss')
    const text = squash(visibleText(html))
    const faqLd = jsonLd(html).find((n) => n['@type'] === 'FAQPage') as {
      mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>
    }
    const faq = getPublicFaq()
    expect(faqLd.mainEntity.map((q) => q.name)).toEqual(faq.map((f) => f.question))
    for (const q of faqLd.mainEntity) {
      expect(text, q.name).toContain(squash(q.name))
      expect(text, q.name).toContain(squash(q.acceptedAnswer.text))
    }
  })

  it('HowTo yalnızca bağlantı rehberi olan entegrasyon sayfalarında; adımlar görünür', () => {
    for (const e of builtEntries()) {
      const html = read(e.path)
      const howTo = jsonLd(html).find((n) => n['@type'] === 'HowTo') as { step: Array<{ text: string; position: number }> } | undefined
      expect(!!howTo, e.path).toBe(e.schema.includes('HowTo'))
      if (!howTo) continue
      const text = squash(visibleText(html))
      howTo.step.forEach((s, i) => {
        expect(s.position).toBe(i + 1)
        expect(text, s.text).toContain(squash(s.text))
      })
    }
  })
})

// --------------------------------------------------------------------------------- sitemap / robots / grafik

describe('sitemap', () => {
  const locs = () => {
    const xml = readFileSync(path.join(dir, 'sitemap-0.xml'), 'utf8')
    return { xml, urls: [...xml.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)].map((m) => ({ loc: m[1], lastmod: m[2] })) }
  }

  it('yalnızca indekslenen sayfalar, canonical biçimde (noindex yasal/404 yok)', () => {
    const { urls } = locs()
    expect(urls.map((u) => u.loc).sort()).toEqual(indexableEntries().map((e) => canonicalUrl(e.path)).sort())
  })

  it('her URL gerçek bir lastmod taşır (geçerli tarih, gelecekte değil); priority/changefreq yok', () => {
    const { xml, urls } = locs()
    for (const u of urls) {
      expect(u.lastmod, u.loc).toBeTruthy()
      const t = Date.parse(u.lastmod!)
      expect(Number.isNaN(t), u.loc).toBe(false)
      expect(t, u.loc).toBeLessThanOrEqual(Date.now() + 60_000)
    }
    expect(xml).not.toContain('<priority>')
    expect(xml).not.toContain('<changefreq>')
  })

  it('sitemap-index robots.txt tarafından gösterilir', () => {
    expect(existsSync(path.join(dir, 'sitemap-index.xml'))).toBe(true)
    expect(readFileSync(path.join(dir, 'robots.txt'), 'utf8')).toContain(`Sitemap: ${SITE}/sitemap-index.xml`)
  })
})

describe('robots.txt', () => {
  it('AI tarayıcılarına bilinçli izin (yorumlu karar), önizleme yolları yasak, yasal sayfalar yasaklanmaz', () => {
    const robots = readFileSync(path.join(dir, 'robots.txt'), 'utf8')
    expect(robots).toMatch(/Yapay zeka tarayıcıları: BİLİNÇLİ OLARAK İZİN VERİLİR/)
    for (const ua of ['GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot', 'CCBot']) expect(AI_CRAWLERS as readonly string[]).toContain(ua)
    for (const ua of AI_CRAWLERS) expect(robots).toContain(`User-agent: ${ua}\n`)
    const groups = robots.split(/\n\n+/).filter((g) => g.includes('User-agent:'))
    expect(groups.length).toBe(2)
    for (const g of groups) {
      expect(g).toContain('Allow: /')
      expect(g).not.toMatch(/^Disallow: \/$/m)
      for (const e of seoEntries.filter((x) => x.previewOnly)) expect(g).toContain(`Disallow: ${e.path}`)
      for (const e of seoEntries.filter((x) => x.section === 'legal')) expect(g).not.toContain(`Disallow: ${e.path}`)
    }
  })

  it('TASLAK derlemede her şey kapalı', () => {
    expect(buildRobots({ draft: true, siteUrl: SITE, disallow: [] })).toMatch(/User-agent: \*\nDisallow: \/\n/)
    expect(buildRobots({ draft: false, siteUrl: undefined, disallow: [] })).toMatch(/Disallow: \/\n/)
  })
})

describe('iç bağlantı grafiği', () => {
  const internalLinks = (html: string): string[] =>
    [...html.matchAll(/<a\b[^>]*href="(\/[^"#?]*)[^"]*"/g)].map((m) => normalizePath(m[1])).filter((p) => !/\.[a-z]+$/.test(p))

  it('yetim sayfa yok: indekslenen her sayfaya başka bir sayfadan bağlantı var', () => {
    const inbound = new Map<string, Set<string>>()
    for (const e of builtEntries()) {
      for (const target of internalLinks(read(e.path))) {
        if (target === e.path) continue
        if (!inbound.has(target)) inbound.set(target, new Set())
        inbound.get(target)!.add(e.path)
      }
    }
    const orphans = indexableEntries().filter((e) => (inbound.get(e.path)?.size ?? 0) === 0).map((e) => e.path)
    expect(orphans).toEqual([])
  })

  it('iç bağlantılar yalnızca kayıtlı sayfalara gider', () => {
    const known = new Set(seoEntries.map((e) => e.path))
    const bad: string[] = []
    for (const e of builtEntries()) for (const t of internalLinks(read(e.path))) if (!known.has(t)) bad.push(`${e.path} → ${t}`)
    expect(bad).toEqual([])
  })
})

// -------------------------------------------------------------------------------------------- LLM çıktıları

describe('LLM görünürlüğü: llms.txt, llms-full.txt, markdown alternatifleri', () => {
  const llms = () => readFileSync(path.join(dir, 'llms.txt'), 'utf8')
  const llmsFull = () => readFileSync(path.join(dir, 'llms-full.txt'), 'utf8')

  it('llms.txt indekslenen HER sayfayı canonical URL + markdown bağlantısıyla içerir; noindex sayfalar yalnızca Optional altında', () => {
    const text = llms()
    for (const e of indexableEntries()) {
      expect(text, e.path).toContain(canonicalUrl(e.path))
      expect(text, e.path).toContain(new URL(markdownPath(e.path), SITE).href)
    }
    const optional = text.slice(text.indexOf('## Optional'))
    for (const e of seoEntries.filter((x) => x.section === 'legal' && !x.index)) {
      expect(optional, e.path).toContain(canonicalUrl(e.path))
      expect(text.slice(0, text.indexOf('## Optional')), e.path).not.toContain(canonicalUrl(e.path))
    }
  })

  it('llms.txt ve llms-full.txt aynı varlık tanımını taşır', () => {
    expect(llms()).toContain(entityDefinition())
    expect(llmsFull()).toContain(entityDefinition())
  })

  it('geliştirme aşamasındaki sayfalar LLM metinlerinde notla geçer', () => {
    for (const e of indexableEntries().filter((x) => x.upcoming)) {
      const lineOf = (t: string) => t.split('\n').find((l) => l.includes(canonicalUrl(e.path))) ?? ''
      expect(lineOf(llms()), e.path).toContain(UPCOMING_NOTE)
      expect(lineOf(llmsFull()), e.path).toContain(UPCOMING_NOTE)
    }
  })

  it('markdown: tek H1 (sayfanın h1\'i), açıklama alıntısı, varlık tanımı; HTML/betik kalıntısı yok', () => {
    for (const e of indexableEntries()) {
      const md = readFileSync(path.join(dir, markdownPath(e.path)), 'utf8')
      const h1 = squash(decodeEntities(read(e.path).match(/<h1[^>]*>([\s\S]*?)<\/h1>/)![1].replace(/<[^>]+>/g, ' ')))
      const h1s = md.split('\n').filter((l) => /^# /.test(l))
      expect(h1s.length, e.path).toBe(1)
      expect(squash(h1s[0].slice(2)).replace(/\\/g, ''), e.path).toBe(h1)
      expect(md).toContain(`> ${e.description}`)
      expect(md).toContain(entityDefinition())
      const body = md.replace(/^<!--[^\n]*-->\n/, '')
      expect(body, e.path).not.toMatch(/<(script|style|svg|div|span|a )\b/)
      expect(body, e.path).not.toContain('application/ld+json')
    }
  })

  it('markdown: roadmap/mevcut olmayan kanal adı ve yol haritası dili geçmez', () => {
    const roadmap = integrations.filter((i) => i.status === 'roadmap').flatMap((i) => [i.name, ...i.aliases])
    const hits: string[] = []
    // S18 dar istisnası: "yolda" dili yalnızca UPCOMING_SURFACES sayfalarında serbest (tests/upcoming.test.ts); o sayfaların
    // markdown'ı yerine "geliştirme aşamasında" notunun varlığı zorunlu.
    const upcomingPages = new Set<string>(UPCOMING_SURFACES.pages)
    // UPCOMING bileşeni (ana sayfa Asistan bandı, `UPCOMING_SURFACES.components`) aynı istisnayı taşır: denetim, o bant
    // çıkarılmış HTML'in markdown'ı üzerinde yapılır (bandın dışında "yolda" dili yine yasak).
    const withoutUpcomingBand = (html: string) => html.replace(/<section\b[^>]*\bid="asistan"[\s\S]*?<\/section>/g, '')
    for (const e of indexableEntries()) {
      const html = read(e.path)
      const md = (html.includes('data-testid="assistant-teaser"')
        ? htmlToMarkdown(withoutUpcomingBand(html))
        : readFileSync(path.join(dir, markdownPath(e.path)), 'utf8')
      ).toLocaleLowerCase('tr-TR')
      // S20b DAR İSTİSNA: rehber sayfaları pazarı anlatır (ör. pazaryerleri genel bakışı kayıtta "roadmap" olan
      // kanalları KONU olarak adlandırabilir) → YALNIZCA kanal adı taramasından muaf; yol haritası dili yasağı sürer.
      // Rehber metninin ad/rakip korumaları tests/rehber.test.ts'te.
      const names = e.section === 'rehber' ? [] : roadmap
      if (upcomingPages.has(e.path)) {
        expect(e.upcoming, e.path).toBe(true)
        expect(md, e.path).toContain(UPCOMING_NOTE)
        continue
      }
      for (const n of names) if (new RegExp(`(?<![\\p{L}\\d])${n.toLocaleLowerCase('tr-TR').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'u').test(md)) hits.push(`${e.path}: ${n}`)
      if (/(?<![\p{L}\d])(yakında|çok yakında|planlanıyor|yol haritası|roadmap|beta)(?![\p{L}\d])/u.test(md)) hits.push(`${e.path}: yol haritası dili`)
    }
    expect(hits).toEqual([])
  })

  it('dönüştürücü: gizli içerik, betik ve gezinme düşer; liste/bağlantı/akordeon korunur', () => {
    const md = htmlToMarkdown(
      '<main><nav>kırıntı</nav><h1>Başlık</h1><p hidden>gizli</p><span aria-hidden="true">süs</span>' +
        '<script>x()</script><ul><li><strong>A</strong><span>açıklama</span></li></ul>' +
        '<p>Bkz. <a href="/sss">SSS</a> &amp; daha</p><h2>Sorular</h2><details><summary>Soru?</summary><p>Cevap.</p></details></main>',
      { resolveHref: (h) => `https://x.test${h}` },
    )
    expect(md).toBe('# Başlık\n\n- **A** açıklama\n\nBkz. [SSS](https://x.test/sss) & daha\n\n## Sorular\n\n### Soru?\n\nCevap.\n')
  })
})

describe('simgeler ve manifest', () => {
  it('PNG simgeler doğru boyutta; manifest simgeleri ve dil doğru', () => {
    expect(pngSize(path.join(dir, 'apple-touch-icon.png'))).toEqual({ width: 180, height: 180 })
    expect(pngSize(path.join(dir, 'icon-192.png'))).toEqual({ width: 192, height: 192 })
    expect(pngSize(path.join(dir, 'icon-512.png'))).toEqual({ width: 512, height: 512 })
    const m = JSON.parse(readFileSync(path.join(dir, 'site.webmanifest'), 'utf8'))
    expect(m.lang).toBe('tr')
    expect(m.icons.map((i: { src: string }) => i.src)).toEqual(['/icon-192.png', '/icon-512.png', '/favicon.svg'])
    for (const i of m.icons.filter((x: { type: string }) => x.type === 'image/png')) expect(existsSync(path.join(dir, i.src))).toBe(true)
  })
})
