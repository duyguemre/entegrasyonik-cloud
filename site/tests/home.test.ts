/**
 * Ana sayfa testi (ADR-0014 S2a): gerçek `astro build` çıktısını (dist-home/index.html) tarar.
 *  - bölümler, tek h1, landmark/başlık ilişkileri, sahne yer tutucuları (S3 sözleşmesi)
 *  - CTA bağlantıları (site-config parametre sözleşmesi), yayımlanmamış sayfalara bağlantı yok
 *  - entegrasyon vitrini seçici çıktısıyla birebir (mevcut 6), gizli roadmap/iç alanlar görünmez
 *  - CSP uyumu: satır içi stil/betik yok
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { buildSite, siteRoot } from '../scripts/lib/build.mjs'
import { getPublicIntegrations, integrations, AVAILABLE_INTEGRATION_CODES, getEcosystemNodes, ecosystemPromises } from '../src/data/integrations'
import { getPublicPlans, getPlanSourceNotice, getPublicTrial } from '../src/data/plans'
import { getPublicCapabilities, getHomePillars } from '../src/data/capabilities'
import { getPublicFaq } from '../src/data/faq'

const APP_URL = 'https://app.example.test'
let html = ''
let outDir = ''

const decode = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const textOf = (fragment: string) => decode(fragment.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
const attrValues = (re: RegExp) => [...html.matchAll(re)].map((m) => decode(m[1]))

beforeAll(() => {
  outDir = buildSite({ outDir: 'dist-home', env: { SITE_DRAFT: 'true', PUBLIC_APP_URL: APP_URL }, silent: true })
  html = readFileSync(path.join(outDir, 'index.html'), 'utf8')
}, 180_000)

describe('yapı: bölümler, başlıklar, landmark', () => {
  it('tek h1 (hero) ve sıralı bölüm başlıkları (h2): ADR sırası + S7 senaryo bölümü', () => {
    expect([...html.matchAll(/<h1[\s>]/g)]).toHaveLength(1)
    const h2Ids = attrValues(/<h2[^>]*\bid="([^"]+)"/g)
    const main = h2Ids.filter((id) => !id.startsWith('footer-'))
    expect(main).toEqual([
      'sorun-cozum-baslik',
      'senaryo-baslik',
      'yetenek-baslik',
      'entegrasyon-baslik',
      'nasil-baslik',
      'fiyat-baslik',
      'guvenlik-baslik',
      'sss-baslik',
      'kapanis-baslik',
    ])
    expect(html).toContain('id="hero-title"')
  })

  it('her <section> aria-labelledby ile var olan bir başlığa (veya aria-label ile ad) bağlı; <main> tek', () => {
    const sections = [...html.matchAll(/<section\b[^>]*>/g)].map((m) => m[0])
    expect(sections.length).toBeGreaterThanOrEqual(10)
    for (const s of sections) {
      const ref = s.match(/aria-labelledby="([^"]+)"/)?.[1]
      if (!ref) {
        // kanıt şeridi: başlıksız, kısa bir ad (aria-label) taşır
        expect(s, s).toMatch(/aria-label="[^"]+"/)
        continue
      }
      expect(html, s).toContain(`id="${ref}"`)
    }
    expect([...html.matchAll(/<main\b/g)]).toHaveLength(1)
  })

  it('başlık seviyeleri atlamaz (h1 -> h2 -> h3)', () => {
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]))
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `h${levels[i - 1]}->h${levels[i]}`).toBeLessThanOrEqual(1)
  })

  it('bölüm içi bağlantı hedefleri (#…) sayfada var', () => {
    const anchors = attrValues(/href="#([^"]+)"/g).filter((a) => a !== 'main')
    expect(anchors).toContain('nasil-calisir')
    for (const a of anchors) expect(html, a).toContain(`id="${a}"`)
    expect(html).toContain('id="main"')
  })
})

describe('sahne kancaları (S2a yer tutucuları + S3 sahneleri + S7 sahneleri)', () => {
  /** Tekil sahneler (sayfada bir kez); tekrarlayan sahneler aşağıda. */
  const UNIQUE = [
    'hero-mock',
    'hero-bg',
    'stat-counters',
    'marquee',
    'problem-solution',
    'stock-single-winner',
    'orders-merge',
    'integration-status',
    'secret-encryption',
    'tenant-isolation',
    'request-guard',
    'ecosystem',
  ]
  /** Birden çok öğede kullanılan sahneler: en az bu kadar. */
  const REPEATED: Record<string, number> = { 'section-head': 8, reveal: 3, tile: 5, 'story-step': 5, 'how-progress': 3 }

  it('sahneler: tekil sahneler bir kez, tekrarlayanlar beklenen sayıda; fiyat vurgusu ve kapanış dahil', () => {
    const found = attrValues(/data-scene="([^"]+)"/g)
    for (const s of UNIQUE) expect(found.filter((f) => f === s), s).toHaveLength(1)
    for (const [s, min] of Object.entries(REPEATED)) expect(found.filter((f) => f === s).length, s).toBeGreaterThanOrEqual(min)
    expect(found).toContain('price-emphasis')
    expect(found).toContain('cta-reveal')
    // bilinmeyen sahne yok (CSS/JS karşılığı olmayan kanca)
    const known = new Set([...UNIQUE, ...Object.keys(REPEATED), 'price-emphasis', 'cta-reveal'])
    for (const f of found) expect(known.has(f), f).toBe(true)
  })

  it('görsel sahneler aria-hidden (anlam çevredeki metindedir); içerik taşıyan sahneler gerçek DOM (ol / kart + aria-hidden şemalar)', () => {
    for (const scene of ['hero-mock', 'hero-bg', 'stock-single-winner', 'orders-merge', 'integration-status', 'secret-encryption', 'tenant-isolation', 'request-guard']) {
      const tag = html.match(new RegExp(`<[a-z]+[^>]*data-scene="${scene}"[^>]*>`))![0]
      expect(tag, scene).toContain('aria-hidden="true"')
    }
    expect(html).toMatch(/<li[^>]*data-scene="how-progress"/)
    expect(html).toMatch(/<ol[^>]*data-testid="story-steps"/)
    const ps = html.match(/data-scene="problem-solution"[\s\S]*?<\/section>/)![0]
    expect(ps).toContain('id="ps-before-title"')
    expect(ps).toContain('id="ps-after-title"')
    expect([...ps.matchAll(/<svg[^>]*aria-hidden="true"/g)].length).toBeGreaterThanOrEqual(2)
  })
})

describe('CTA ve bağlantılar', () => {
  it('birincil CTA "Ücretsiz dene" -> kayıt; ikincil "Nasıl çalışır" -> #nasil-calisir; kapanış CTA', () => {
    const tag = (id: string) => html.match(new RegExp(`<a[^>]*data-testid="${id}"[^>]*>`))![0]
    expect(tag('hero-cta-primary')).toContain(`href="${APP_URL}/login?mode=register"`)
    expect(tag('hero-cta-secondary')).toContain('href="#nasil-calisir"')
    expect(tag('closing-cta-primary')).toContain(`href="${APP_URL}/login?mode=register"`)
    expect(tag('closing-cta-login')).toContain(`href="${APP_URL}/login"`)
    expect(html).toMatch(/data-testid="hero-cta-primary"[^>]*>\s*Ücretsiz dene/)
    expect(html).toMatch(/data-testid="hero-cta-secondary"[^>]*>\s*Nasıl çalışır/)
  })

  it('plan CTA\'ları plan kodu + aralık parametresi taşır; özel teklif planı kayıt bağlantısı taşımaz', () => {
    for (const p of getPublicPlans()) {
      const tag = html.match(new RegExp(`<a[^>]*data-testid="plan-cta-${p.code}"[^>]*>`))?.[0]
      if (p.cta === 'trial') {
        expect(decode(tag ?? ''), p.code).toContain(`href="${APP_URL}/login?mode=register&plan=${p.code}&interval=${p.interval}"`)
      } else {
        expect(tag === undefined || !tag.includes('mode=register'), p.code).toBe(true)
      }
    }
  })

  it('yayımlanmamış sayfalara (S2b/S4/S5) bağlantı yok: her iç bağlantı dist içinde bir sayfa/dosyadır', () => {
    const internal = attrValues(/href="(\/[^"#?]*)"/g)
    expect(internal.length).toBeGreaterThan(0)
    for (const href of internal) {
      const rel = href.replace(/^\//, '')
      const ok = href === '/' || existsSync(path.join(outDir, rel)) || existsSync(path.join(outDir, `${rel}.html`)) || existsSync(path.join(outDir, rel, 'index.html'))
      expect(ok, href).toBe(true)
    }
  })
})

describe('entegrasyon ekosistemi (S12: vizyon dili; kanal adı ve durum dili ana mesajda yok)', () => {
  const available = getPublicIntegrations()
  const sectionOf = (id: string) => html.match(new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`))![0]

  it('mevcut sayı 6: 6 hero kanal noktası + 6 durum satırı; entegrasyon kartları ekosistem şemasına dönüştü (S12); fayda şeridinde durum sayacı/kanal adı yok', () => {
    expect(available).toHaveLength(6)
    expect(AVAILABLE_INTEGRATION_CODES).toHaveLength(6)
    expect([...html.matchAll(/data-part="chan"/g)]).toHaveLength(6)
    expect([...html.matchAll(/data-part="istat-row"/g)]).toHaveLength(6)
    // S12: "uygulanan entegrasyon" sayacı kaldırıldı; tek sayaç deneme günüdür (statik metin = kayıttaki değer)
    expect(html).not.toContain('data-testid="integration-count"')
    const trial = getPublicTrial()
    expect(html).toMatch(new RegExp(`data-testid="trial-stat"[\\s\\S]*?data-count="${trial.days}"[^>]*>${trial.days}<`))
    const proof = html.match(/<section class="proof[\s\S]*?<\/section>/)![0]
    const proofText = textOf(proof)
    for (const i of available) expect(proofText, i.name).not.toContain(i.name)
    expect(proofText.toLocaleLowerCase('tr-TR')).not.toMatch(/uygulanan|bugün bağlanabilen|aes-256/)
    // S15: görünür şerit başlığı ("Tek panelde yönettikleriniz") kaldırıldı; grup erişilebilir adını aria-label ile taşır
    expect(proofText).not.toMatch(/Tek panelde|yönettikleriniz/)
    expect(proof).toMatch(/data-scene="marquee" role="group" aria-label="[^"]+"/)
    // S15: kartlar koyu sahnenin devamı (beyaz blok değil) — bölüm koyu yüzey işaretli, vurgu açık teal varyantına döner
    expect(proof).toMatch(/^<section class="proof"[^>]*data-surface="dark"/)
    // şerit: erişilebilir birinci küme + aria-hidden kopya küme
    const marquee = html.match(/data-testid="marquee"[\s\S]*?<\/section>/)![0]
    const sets = [...marquee.matchAll(/<ul class="marquee__set[^"]*"[^>]*>[\s\S]*?<\/ul>/g)].map((m) => m[0])
    expect(sets).toHaveLength(2)
    expect([...sets[0].matchAll(/<li class="marquee__item/g)].length).toBeGreaterThanOrEqual(6)
    expect(sets[0].match(/^<ul[^>]*>/)![0]).not.toContain('aria-hidden') // erişilebilir liste birinci kümedir
    expect(sets[1].match(/^<ul[^>]*>/)![0]).toContain('aria-hidden="true"') // ikinci küme yalnızca kesintisiz döngü için kopya
  })

  it('ekosistem düğümleri seçiciden (dayanağı olan dört düğüm) ve vizyon cümleleri görünür; kapsam matrisi ana sayfada YOK', () => {
    const nodes = getEcosystemNodes()
    expect(nodes.map((n) => n.id)).toEqual(['marketplaces', 'ecommerce', 'erp', 'fulfilment'])
    const eco = html.match(/data-testid="ecosystem"[\s\S]*?data-testid="ecosystem-promises"/)![0]
    expect([...eco.matchAll(/data-part="eco-node"/g)]).toHaveLength(nodes.length)
    const t = textOf(eco)
    for (const n of nodes) {
      expect(t, n.id).toContain(n.title)
      expect(t, n.id).toContain(n.line)
    }
    for (const p of ecosystemPromises) expect(textOf(sectionOf('entegrasyonlar')), p.id).toContain(p.line)
    // kanal ayrımı yalnızca isimsiz renkli noktalar (data-code) — aria-hidden
    expect(eco).toMatch(/<span class="eco__dots[^"]*"[^>]*aria-hidden="true"/)
    // kapsam matrisi /entegrasyonlar sayfasına taşındı
    expect(html).not.toContain('data-testid="integration-matrix"')
    expect(html).not.toContain('data-testid="coverage-matrix"')
    expect(html).toMatch(/href="\/entegrasyonlar#kapsam"/)
  })

  it('Yetenekler ve Entegrasyon bölümlerinde kanal adı, durum rozeti veya eksik/sınır dili yok (S12 geri bildirimi)', () => {
    for (const id of ['ozellikler', 'entegrasyonlar']) {
      const t = textOf(sectionOf(id))
      for (const i of available) expect(t, `${id}: ${i.name}`).not.toContain(i.name)
      for (const phrase of ['Mevcut', 'Kısmi', 'Sınırlı', 'sınırlı', 'Bilinmesi gerekenler', 'mevcut değildir', 'Bugün bağlanabilen', 'Sunulmuyor', 'kapsam notu']) {
        expect(t, `${id}: ${phrase}`).not.toContain(phrase)
      }
    }
  })

  it('gizli roadmap öğeleri, takma adları ve iç alanlar sayfada yok', () => {
    const text = textOf(html).toLocaleLowerCase('tr-TR')
    const hidden = integrations.filter((i) => i.status === 'roadmap').flatMap((i) => [i.name, ...i.aliases])
    expect(hidden.length).toBeGreaterThan(0)
    // Sözcük sınırıyla (claims.test.ts ile aynı mantık): "GİB" adı "gibi" sözcüğünde geçmiş sayılmaz.
    const wordRe = (n: string) => new RegExp(`(?<![\\p{L}\\d])${n.toLocaleLowerCase('tr-TR').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, 'u')
    for (const name of hidden) expect(wordRe(name).test(text), name).toBe(false)
    for (const k of ['internalNotes', 'INTEGRATIONS_REGISTRY', 'IntegrationFactory', '"evidence"']) expect(html.includes(k), k).toBe(false)
  })
})

describe('içerik kayıttan gelir', () => {
  const text = () => textOf(html)

  it('yetenekler: dört değer sütunu + her çekirdek yeteneğin ana sayfa başlığı/fayda cümlesi görünür; sınır notu ve durum rozeti ana sayfada YOK (alt sayfalarda)', () => {
    const caps = textOf(html.match(/<section[^>]*id="ozellikler"[\s\S]*?<\/section>/)![0])
    for (const p of getHomePillars()) {
      expect(caps, p.id).toContain(p.title)
      expect(caps, p.id).toContain(p.line)
      for (const item of p.points) expect(caps, `${p.id}: ${item}`).toContain(item)
    }
    for (const c of getPublicCapabilities('core')) {
      expect(c.home, `${c.id}: home metni`).toBeDefined()
      expect(caps, c.id).toContain(c.home!.title)
      expect(caps, `${c.id} fayda`).toContain(c.home!.line)
      if (c.caveat) expect(caps, `${c.id} sınır notu ana sayfada olmamalı`).not.toContain(c.caveat)
    }
    expect(html).toContain('Aşırı satış olarak işaretlendi')
  })

  it('güvenlik: yalnızca kanıtlı iddialar (AES-256-GCM, kiracı DB, RBAC, barındırılan ödeme); sertifika iddiası yok', () => {
    for (const c of getPublicCapabilities('security')) expect(text(), c.id).toContain(c.title)
    expect(text()).toContain('AES-256-GCM')
    expect(text()).toContain('test (sandbox) aşamasında')
    expect(text().toLocaleLowerCase('tr-TR')).not.toMatch(/iso 27001|soc 2|tier 3|uptime|veri merkezi|sertifika/)
  })

  it('fiyat: plan adı, fiyat etiketi, KDV notu ve ÖNERİ uyarısı görünür; özel teklif planında rakam yok', () => {
    const plans = getPublicPlans()
    expect(plans.length).toBeGreaterThanOrEqual(3)
    for (const p of plans) {
      expect(text(), p.name).toContain(p.name)
      expect(text(), `${p.name} fiyat`).toContain(p.priceLabel)
    }
    const notice = getPlanSourceNotice()
    expect(notice).toBeDefined()
    expect(text()).toContain(notice!)
    expect(text()).toContain('KDV hariç')
    const quote = plans.find((p) => p.priceKind === 'quote')!
    expect(text()).toContain('Özel teklif')
    expect(quote.limits.every((l) => l.value === null)).toBe(true)
  })

  it('deneme bilgisi seçiciden: gün sayısı ve "kart bilgisi gerekmez"', () => {
    const t = getPublicTrial()
    expect(text()).toContain(`${t.days} gün ücretsiz deneme`)
    expect(text()).toContain('kart bilgisi gerekmez')
  })

  it('SSS önizleme: yerel <details>; her sorunun cevabı kayıttaki metinle aynı', () => {
    const items = [...html.matchAll(/<details[^>]*data-part="faq-item"[\s\S]*?<\/details>/g)].map((m) => m[0])
    expect(items.length).toBeGreaterThanOrEqual(4)
    const byQuestion = new Map(getPublicFaq().map((f) => [f.question, f.answer]))
    for (const item of items) {
      const q = textOf(item.match(/<summary[\s\S]*?<\/summary>/)![0])
      expect(byQuestion.has(q), q).toBe(true)
      expect(textOf(item)).toContain(byQuestion.get(q)!)
    }
  })

  it('nasıl çalışır: dört adım, numaralı ve sıralı liste (S8: hesap -> kanal -> ürün aktarımı -> yönetim)', () => {
    const block = html.match(/<ol[^>]*data-testid="how-steps"[\s\S]*?<\/ol>/)![0]
    // mini arayüzlerde iç içe listeler olabilir: yalnızca adım öğeleri sayılır
    expect([...block.matchAll(/<li\b[^>]*class="how__step/g)]).toHaveLength(4)
    expect([...block.matchAll(/class="how__marker[^"]*"[^>]*>(\d)</g)].map((m) => m[1])).toEqual(['1', '2', '3', '4'])
    // sabit sütundaki adım göstergesi dekoratif (aria-hidden) ve dört öğeli
    const nav = html.match(/<ul[^>]*class="hw__nav[^"]*"[^>]*aria-hidden="true"[\s\S]*?<\/ul>/)![0]
    expect([...nav.matchAll(/data-spy-link=/g)]).toHaveLength(4)
  })

  it('senaryo (zaman çizgisi): beş adım, her adım yayımlanmış bir yetenek kaydına bağlı; kanal adı yok; örnek beyanı bölüm girişinde (S12 + S15-B)', () => {
    const block = html.match(/<ol[^>]*data-testid="story-steps"[\s\S]*?<\/ol>/)![0]
    const steps = [...block.matchAll(/<li[^>]*data-scene="story-step"[^>]*>/g)].map((m) => m[0])
    expect(steps).toHaveLength(5)
    const caps = steps.map((s) => s.match(/data-cap="([^"]+)"/)?.[1])
    expect(caps).toEqual(['unified-orders', 'stock-reservation', 'multi-channel-products', 'shipping-invoice-notice', 'returns'])
    const published = getPublicCapabilities('core').map((c) => c.id)
    for (const id of caps) expect(published, id).toContain(id)
    const t = textOf(block)
    for (const title of ['Sipariş gelir', 'Stok rezerve edilir', 'Tüm kanallar güncellenir', 'Kargo ve fatura bilgisi iletilir', 'İade talebi yönetilir']) {
      expect(t, title).toContain(title)
    }
    // anlam korunur: rezervasyon ve iade metinleri kaydın söylediğinin ötesine geçmez
    expect(t).toContain('yalnızca mevcut stok kadar rezervasyon yapılır')
    expect(t).toContain('onaylanır veya reddedilir')
    for (const i of getPublicIntegrations()) expect(t, i.name).not.toContain(i.name)
    // S15-B (S15-C deseniyle uyum): sahne başına görünür "Örnek görünüm" etiketi YOK; sayıların örnek olduğunu
    // bölüm girişindeki tek cümle beyan eder (uydurma veri iddiası yok). Sahneler aria-hidden kalır.
    expect(block).not.toMatch(/Örnek görünüm/)
    expect([...block.matchAll(/<div class="viz"[^>]*>/g)].every((m) => m[0].includes('aria-hidden="true"'))).toBe(true)
    const section = html.match(/<section[^>]*id="senaryo"[\s\S]*?<\/section>/)![0]
    expect(textOf(section.split('data-testid="story-steps"')[0])).toContain('Aşağıdaki sahneler örnek görünümdür.')
  })

  it('sorun -> çözüm: tek kurgu (kaos + marka kartı); alttaki karşılaştırma tablosu yok; faydalar kanıtlı (S12)', () => {
    const ps = html.match(/data-scene="problem-solution"[\s\S]*?<\/section>/)![0]
    expect(ps).toContain('data-scroll-progress')
    expect(ps).not.toContain('ps__compare')
    const t = textOf(ps)
    for (const g of ['Merkezi stok yönetimi', 'Aşırı satışa karşı rezervasyon', 'Tek sipariş akışı', 'Kurumsal düzeyde güvenlik']) expect(t, g).toContain(g)
    for (const i of getPublicIntegrations()) expect(t, i.name).not.toContain(i.name)
  })

  it('sorun -> çözüm tek merkez akışı (S15-B): isimsiz kanal çipleri; statik HTML senkron son durumu taşır (tüm çiplerde aynı değer)', () => {
    const ps = html.match(/data-scene="problem-solution"[\s\S]*?<\/section>/)![0]
    const net = ps.match(/<div class="ps__net[^"]*"[^>]*aria-hidden="true"[\s\S]*?class="ps__result/)![0]
    const chips = [...net.matchAll(/<li class="ps__node[^"]*"[^>]*data-code="([^"]+)"/g)].map((m) => m[1])
    expect(chips).toHaveLength(4)
    const synced = [...net.matchAll(/data-part="chip-new"[^>]*>(\d+)</g)].map((m) => m[1])
    expect(synced).toHaveLength(4)
    expect(new Set(synced).size).toBe(1)
    // tek stok değeri: sonuç kartı ile kanal çipleri aynı sayıyı gösterir
    expect(ps).toMatch(new RegExp(`class="ps__result-num[^"]*"[^>]*>${synced[0]}<`))
    // akış parçaları: gidiş/dönüş paketi her kanalda, gövde paketi ve iki göbek halkası
    expect([...net.matchAll(/data-part="packet"/g)]).toHaveLength(4)
    expect([...net.matchAll(/data-part="packet-back"/g)]).toHaveLength(4)
    expect([...net.matchAll(/data-part="hub-ring"/g)]).toHaveLength(2)
    expect(net).toContain('data-part="stem-packet"')
    const t = textOf(net)
    for (const i of getPublicIntegrations()) expect(t, i.name).not.toContain(i.name)
  })

  it('hero mock: dekoratif (aria-hidden), "Örnek görünüm" rozeti yok (S15); kanal noktaları seçiciden (renk kodu), panelde ve hero metninde kanal ADI yok (S12)', () => {
    const hero = html.match(/data-testid="hero"[\s\S]*?<\/section>/)![0]
    const mock = html.match(/data-testid="hero-mock"[\s\S]*?<\/section>/)![0]
    // S15: görünür rozet kullanıcı isteğiyle kaldırıldı; panel ekran okuyucuya veri olarak sunulmaz (dekoratif sahne)
    expect(mock).not.toContain('Örnek görünüm')
    expect(html).toMatch(/<div[^>]*data-scene="hero-mock"[^>]*aria-hidden="true"[^>]*data-testid="hero-mock"/)
    const dots = [...mock.matchAll(/<li[^>]*data-part="chan"[^>]*>/g)].map((m) => m[0].match(/data-code="([^"]+)"/)?.[1])
    expect(dots).toEqual(getPublicIntegrations().map((i) => i.code))
    // S12: ana mesajda pazaryeri adları ön plana çıkmaz ("pazaryerleri" denir); panel genel etiket kullanır
    const heroText = textOf(hero)
    for (const i of getPublicIntegrations()) expect(heroText, i.name).not.toContain(i.name)
    expect(heroText).toContain('Pazaryeri siparişi')
    expect(heroText).toContain('pazaryerleriniz')
    // S12: durum/backlog dili yok
    expect(heroText.toLocaleLowerCase('tr-TR')).not.toMatch(/uygulanan|bugün bağlanabilen/)
  })

  it('hero fayda maddeleri üst seviye ve her biri kanıtlı bir yetenek kaydına dayanır (S12)', () => {
    const list = html.match(/<ul[^>]*data-testid="hero-benefits"[\s\S]*?<\/ul>/)![0]
    const items = [...list.matchAll(/<li\b[\s\S]*?<\/li>/g)].map((m) => textOf(m[0]))
    expect(items).toEqual(['Merkezi stok yönetimi', 'Tüm siparişler tek ekranda', 'Kurumsal düzeyde güvenlik'])
    const ids = getPublicCapabilities().map((c) => c.id)
    for (const id of ['stock-reservation', 'multi-channel-products', 'unified-orders', 'secrets-encryption', 'tenant-database', 'role-based-access']) {
      expect(ids, id).toContain(id)
    }
  })
})

describe('CSP ve erişilebilirlik ön koşulları', () => {
  it('satır içi stil/betik yok; harici betikler yalnızca aynı origin', () => {
    expect(html).not.toMatch(/\sstyle="/)
    expect(html).not.toMatch(/<style\b/)
    const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/g)]
    expect(inline).toEqual([])
    for (const src of attrValues(/<script[^>]*\bsrc="([^"]+)"/g)) expect(src.startsWith('/'), src).toBe(true)
  })

  it('dekoratif SVG\'ler aria-hidden ve odaklanamaz; görsellerin (img) hepsi alt taşır', () => {
    for (const svg of html.matchAll(/<svg\b[^>]*>/g)) {
      expect(svg[0], svg[0]).toMatch(/aria-hidden="true"|class="stock__arrow"|class="ps__diagram"/)
    }
    for (const img of html.matchAll(/<img\b[^>]*>/g)) expect(img[0]).toContain('alt=')
  })

  it('site kökü doğru çözülür (test kendini sınar)', () => {
    expect(existsSync(path.join(siteRoot, 'dist-home', 'index.html'))).toBe(true)
  })
})

describe('animasyon sahneleri: betik, durdurma kontrolü, CSP (ADR-0014 S3)', () => {
  const assetsDir = () => path.join(outDir, '_astro')
  const scriptFiles = () => readdirSync(assetsDir()).filter((f) => f.endsWith('.js'))
  const gz = (f: string) => gzipSync(readFileSync(path.join(assetsDir(), f))).length

  it('durdurma kontrolü header içinde, düğme, aria-pressed=false, sabit erişilebilir ad; yalnızca sahneli sayfada', () => {
    const header = html.match(/<header\b[\s\S]*?<\/header>/)![0]
    const btn = header.match(/<button\b[^>]*data-motion-toggle[^>]*>[\s\S]*?<\/button>/)![0]
    expect(btn).toContain('type="button"')
    expect(btn).toContain('aria-pressed="false"')
    // erişilebilir ad sabit; görünür kısa etiket ("Hareket") aria-hidden ve adın içinde geçer (WCAG 2.5.3)
    const name = textOf(btn.replace(/<span[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/span>/g, ''))
    expect(name).toBe('Hareketi durdur')
    expect(btn).toMatch(/aria-hidden="true"[^>]*>Hareket</)
    expect([...html.matchAll(/data-motion-toggle/g)]).toHaveLength(1)
    // sahnesi olmayan iç sayfada kontrol ve sahne öğesi yok
    const inner = readFileSync(path.join(outDir, 'ozellikler', 'index.html'), 'utf8')
    expect(inner).not.toContain('data-motion-toggle')
    expect(inner).not.toContain('data-scene=')
  })

  it('JS bütçesi: sayfa başına <= 40 KB gzip (ADR-0014 Karar 1); sahne betiği <= 4 KB gzip (S7: sayaç + gösterge takibi dahil)', () => {
    const total = scriptFiles().reduce((sum, f) => sum + gz(f), 0)
    expect(total).toBeGreaterThan(0)
    expect(total).toBeLessThanOrEqual(40 * 1024)
    const scenes = scriptFiles().find((f) => readFileSync(path.join(assetsDir(), f), 'utf8').includes('ek-site-motion'))
    expect(scenes, 'sahne betiği derlemede var').toBeTruthy()
    expect(gz(scenes!)).toBeLessThanOrEqual(4 * 1024)
  })

  it('GSAP/Lottie/WebGL yok; betikler çerez yazmaz; satır içi betik yok', () => {
    for (const f of scriptFiles()) {
      const code = readFileSync(path.join(assetsDir(), f), 'utf8')
      expect(code, f).not.toMatch(/gsap|lottie|WebGLRenderingContext|three\.js/i)
      expect(code, f).not.toContain('document.cookie')
    }
    expect(html).not.toMatch(/<script\b(?![^>]*\bsrc=)[^>]*>/)
  })

  it('derlenmiş CSS: sahne animasyonları reduced-motion: no-preference altında ve data-motion=play ister', () => {
    const css = readdirSync(assetsDir())
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(path.join(assetsDir(), f), 'utf8'))
      .join('\n')
    expect(css).toMatch(/prefers-reduced-motion:\s*no-preference/)
    expect(css).toMatch(/data-motion[=\]]/)
    for (const scene of ['hero-mock', 'hero-bg', 'marquee', 'problem-solution', 'stock-single-winner', 'orders-merge', 'integration-status', 'secret-encryption', 'tenant-isolation', 'story-step', 'how-progress', 'request-guard', 'price-emphasis']) {
      expect(css, scene).toContain(scene)
    }
    // döngüsel hareket yalnızca oynatma durumunda ve görünürken çalışır
    expect(css).toMatch(/data-visible=["']?true/)
  })
})

