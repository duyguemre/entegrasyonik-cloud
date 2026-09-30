/**
 * S25 — seçkin üst menü ve K46 (ajan ürünü her planda) kuralları.
 *
 *  (1) Menü içeriği TEK kayıttan (`navigation.ts` → `nav-menu.ts`): her kart ikon + başlık + fayda satırı taşır, her
 *      panelde öne çıkan kart ve alt şerit var, Çözümler satırları mevcut kanalların TAMAMINI bir kez gösterir; derlenmiş
 *      header kayıttaki her bağlantıyı içerir (markup'ta serbest bağlantı/metin yok).
 *  (2) K46: ajan ürünü her planda dahil; alt plan sınırlı, üst planlar zamanlanmış/otonom ajan + yüksek kota; nitel
 *      kota (rakam yok); kullanıcının açıklama cümlesi birebir; kredi/token ve "sınırsız/ücretsiz yapay zekâ" dili yok.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { menuGroups, flatLinks } from '../src/data/nav-menu'
import { navGroups, primaryNav, featureNav, solutionNav, published, navFeatureCopy } from '../src/data/navigation'
import { getPublicIntegrations } from '../src/data/integrations'
import { getPublicPlans, getPublicTrial } from '../src/data/plans'
import { getPlanAgentRows, getPlanAgentSummary, getPricingFaq, planAgentIntro } from '../src/data/pricing'
import { AGENT_BRAND, AGENT_PATH } from '../src/data/agent-brand'
import { buildSite } from '../scripts/lib/build.mjs'

const siteRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FOLD: Record<string, string> = { ç: 'c', ş: 's', ğ: 'g', ü: 'u', ö: 'o', ı: 'i', â: 'a', î: 'i', û: 'u' }
const norm = (s: string): string => s.toLocaleLowerCase('tr-TR').replace(/[çşğüöıâîû]/g, (c) => FOLD[c] ?? c)
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"')
const text = (html: string) => decode(html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ')

let distDir = ''
beforeAll(() => {
  distDir = buildSite({ outDir: 'dist-nav', env: { SITE_DRAFT: 'true' }, silent: true })
}, 240_000)
const page = (route: string) => readFileSync(path.join(distDir, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`), 'utf8')
const header = (route: string) => page(route).match(/<header class="site-header[\s\S]*?<\/header>/)![0]

describe('S25 menü: tek kayıt, premium içerik', () => {
  const groups = menuGroups()

  it('üç panel (Ürün / Çözümler / Kaynaklar) + tek doğrudan bağlantı (Fiyatlandırma); üst öğe sayısı 4', () => {
    expect(groups.map((g) => g.label)).toEqual(['Ürün', 'Çözümler', 'Kaynaklar'])
    expect(published(primaryNav).filter((i) => !i.group).map((i) => i.label)).toEqual(['Fiyatlandırma'])
  })

  it('her kart: ikon + başlık + tek satır fayda açıklaması (kısa: en çok 60 karakter)', () => {
    for (const g of groups) {
      expect(g.links.length, g.id).toBeGreaterThanOrEqual(3)
      for (const l of g.links) {
        expect(l.icon, `${g.id}/${l.label}`).toBeTruthy()
        expect(l.description?.trim().length, `${g.id}/${l.label}`).toBeGreaterThan(10)
        expect(l.description!.length, `${g.id}/${l.label}`).toBeLessThanOrEqual(60)
      }
    }
  })

  it('her panelde öne çıkan kart ve alt şerit var; şerit bağlantıları yayımlı sayfalara gider', () => {
    for (const g of groups) {
      expect(g.feature, g.id).toBeTruthy()
      expect(g.feature!.title.length, g.id).toBeGreaterThan(3)
      expect(g.feature!.cta.href, g.id).toBeTruthy()
      expect(g.footer.text.length, g.id).toBeGreaterThan(10)
      expect(g.footer.links.length, g.id).toBeGreaterThanOrEqual(1)
    }
    expect(groups.find((g) => g.id === 'product')!.feature).toMatchObject({ kind: 'agent', title: AGENT_BRAND, badge: 'Yeni', cta: { href: AGENT_PATH } })
    expect(groups.find((g) => g.id === 'solutions')!.feature!.kind).toBe('trial')
    expect(groups.find((g) => g.id === 'resources')!.feature!.kind).toBe('guide')
  })

  it('deneme kartı süreyi ve kart şartını PLAN KAYDINDAN alır (kopyada rakam yok)', () => {
    const t = getPublicTrial()
    const trial = groups.find((g) => g.id === 'solutions')!.feature!
    expect(trial.meta).toContain(`${t.days} gün ücretsiz`)
    if (!t.cardRequired) expect(trial.meta).toContain('Kart gerekmez')
    for (const v of Object.values(navFeatureCopy)) expect(JSON.stringify(v)).not.toMatch(/\d/)
  })

  it('Çözümler satırları mevcut kanalların tamamını bir kez gösterir (tür başına satır)', () => {
    const solutions = groups.find((g) => g.id === 'solutions')!
    const shown = solutions.links.flatMap((l) => (l.channels ?? []).map((c) => c.code)).sort()
    expect(shown).toEqual(getPublicIntegrations().map((i) => i.code).sort())
    for (const l of solutions.links) expect(l.channels?.length, l.label).toBeGreaterThan(0)
  })

  it('panel başlığı ve şerit kopyası reklam dilinde; "müşteri" hitabı ve teknik terim yok', () => {
    const copy = [...navGroups.flatMap((g) => [g.lead, g.strip]), ...[...primaryNav, ...featureNav, ...solutionNav].flatMap((i) => [i.label, i.description ?? '', i.cta ?? ''])]
    for (const c of copy.map(norm)) {
      expect(c).not.toMatch(/(?<![\p{L}])musteri/u)
      expect(c).not.toMatch(/(?<![\p{L}])(api|mcp|veritabani|kiraci|protokol|token)(?![\p{L}])/u)
    }
  })

  it('derlenmiş header kayıttaki HER bağlantıyı içerir; öne çıkan kart ve alt şerit her panelde', () => {
    const h = header('/')
    for (const g of groups) {
      // panel = kendi id'sinden bir sonraki üst öğeye (grup düğmesi / doğrudan bağlantı) kadar
      const start = h.indexOf(`id="mega-${g.id}"`)
      const rest = h.slice(start)
      const panel = rest.slice(0, rest.search(/data-nav-trigger=|class="nav-link nav-top"/) >>> 0 || rest.length)
      expect(start, g.id).toBeGreaterThan(0)
      expect(panel).toContain('class="mega__foot"')
      for (const l of [...g.links, ...g.footer.links]) expect(panel, `${g.id}: ${l.href}`).toContain(`href="${l.href.replace(/&/g, '&amp;')}"`)
      expect(panel).toContain(`data-testid="nav-feature-${g.feature!.kind}"`)
      for (const l of g.links) if (l.description) expect(decode(panel)).toContain(l.description)
    }
    for (const l of groups.flatMap(flatLinks)) expect(h, l.href).toContain(`href="${l.href.replace(/&/g, '&amp;')}"`)
    // CSP: satır içi style yok
    expect(h).not.toMatch(/\sstyle="/)
  })

  it('mobil çekmece: her grup akordeon, altta sabit CTA (Giriş + Ücretsiz dene), ajan kartı', () => {
    const h = header('/')
    const drawer = h.match(/<nav class="nav-mobile__panel"[\s\S]*?<\/nav>/)![0]
    for (const g of groups) expect(drawer).toContain(`data-drawer-group="${g.id}"`)
    expect(drawer).toMatch(/class="nav-mobile__actions"[\s\S]*data-testid="login-link-mobile"[\s\S]*data-testid="register-link-mobile"/)
    expect(drawer).toContain('data-testid="drawer-feature"')
  })

  it('yetim sayfa korunur: footer da menüyle aynı modelden her grup sayfasına bağlanır', () => {
    const footer = page('/').match(/<footer class="site-footer[\s\S]*?<\/footer>/)![0]
    for (const g of groups) for (const l of flatLinks(g)) expect(footer, l.href).toContain(`href="${l.href.replace(/&/g, '&amp;')}"`)
  })
})

describe('S25 K46: ajan ürünü her planda, ayrı yapay zekâ ücreti yok', () => {
  const plans = getPublicPlans()
  const rows = getPlanAgentRows(plans)
  const cell = (key: string, code: string) => rows.find((r) => r.key === key)!.cells.find((c) => c.planCode === code)!.cell

  it('kullanıcının açıklama cümlesi birebir', () => {
    expect(planAgentIntro.text).toBe(
      'Kendi yapay zekâ anahtarınızı getirirsiniz; yapay zekâ için bize ekstra ücret ödemezsiniz. Her pakette başlayın, büyüdükçe ajanlarınıza daha fazla yetki verin.',
    )
  })

  it('her plan: sohbetle sorgulama/raporlar ve onaylı öneriler dahil; kota nitel (rakamsız)', () => {
    for (const p of plans) {
      expect(cell('chat', p.code), p.code).toEqual({ kind: 'check' })
      expect(cell('approved', p.code), p.code).toEqual({ kind: 'check' })
      const q = cell('quota', p.code)
      expect(q.kind, p.code).toBe('text')
      expect(q.kind === 'text' && /\d/.test(q.text), p.code).toBe(false)
      expect(getPlanAgentSummary(p.code), p.code).toBeTruthy()
    }
  })

  it('alt plan sınırlı (zamanlanmış/otonom yok); üst planlarda zamanlanmış ve otonom ajanlar', () => {
    const [first, ...upper] = plans
    expect(cell('scheduled', first.code)).toEqual({ kind: 'none' })
    expect(cell('autonomous', first.code)).toEqual({ kind: 'none' })
    expect(cell('quota', first.code)).toEqual({ kind: 'text', text: 'Sınırlı' })
    for (const p of upper) {
      expect(cell('scheduled', p.code), p.code).toEqual({ kind: 'check' })
      expect(cell('autonomous', p.code), p.code).toEqual({ kind: 'check' })
    }
  })

  it('yasak dil yok: kredi/token, "sınırsız" ve "ücretsiz/bedava yapay zekâ" (veri + derlenmiş sayfa)', () => {
    const data = norm(JSON.stringify({ planAgentIntro, rows, s: plans.map((p) => getPlanAgentSummary(p.code)), faq: getPricingFaq() }))
    const built = norm(text(page('/fiyatlandirma')))
    for (const t of [data, built]) {
      expect(t).not.toMatch(/(?<![\p{L}])(kredi|token|jeton)/u)
      expect(t).not.toMatch(/sinirsiz/)
      expect(t).not.toMatch(/(ucretsiz|bedava)\s+(yapay zeka|ai)/)
      expect(t).not.toMatch(/(yapay zeka|ai)\s+(ucretsiz|bedava)/)
    }
  })

  it('fiyat sayfası: bölüm, her plan kartında ajan özeti, karşılaştırmada ajan satırları ve SSS yanıtı', () => {
    const html = page('/fiyatlandirma')
    const t = text(html)
    expect(html).toContain('data-testid="plan-ai"')
    expect(t).toContain(planAgentIntro.text)
    expect(html.match(/data-testid="plan-agent"/g)?.length).toBe(plans.length)
    expect(html.match(/data-row-kind="agent"/g)?.length).toBe(rows.length)
    for (const r of rows) expect(t).toContain(r.label)
    expect(getPricingFaq().some((f) => f.answer.includes(planAgentIntro.text))).toBe(true)
  })
})
