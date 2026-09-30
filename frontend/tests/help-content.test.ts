// faz3-fe-help — yardım içerik kaydı bütünlüğü: her ekranın "Sayfa hakkında" içeriği var, "Buraya git" hedefleri geçerli
// ekran, ilgili makaleler var, kısayol tablosu kayıt defteriyle eş, kanal rehberi site connect.ts ile eş, (?) ipuçları
// yerleştirildi, URL kategori listesi kategorilerle eş.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { ARTICLES_TR } from '../src/help/content/tr/articles'
import { ARTICLES_EN } from '../src/help/content/en/articles'
import { PAGE_HELP } from '../src/help/pageHelp'
import { HELP_HINTS } from '../src/help/hints'
import { HELP_CATEGORIES } from '../src/help/categories'
import { HELP_CHANNELS, HELP_CHANNEL_COMMON_STEPS, HELP_CHANNEL_WHERE, HELP_CHANNEL_SCREEN } from '../src/help/channels'
import { shortcutRows, integrationErrorRows, channelGuideRows } from '../src/help/autoBlocks'
import { getHelpArticles, pageHelpFor } from '../src/help'
import { SHORTCUTS } from '@entegrasyonik/ui/shortcuts'
import { SCREENS, resolveScreenByKey } from '../src/navigation/screens'
import { TOUR_STEPS } from '../src/help/tour'

const root = resolve(__dirname, '..')
const menuSrc = readFileSync(join(root, 'src/stores/site/menu.ts'), 'utf8')
/** `stores/site/menu.ts` `views` Map anahtarları (ekran kayıt defteri; bileşen içe aktarmadan statik okunur). */
const VIEW_KEYS = [...menuSrc.matchAll(/\['([^']+)', shallowRef\(/g)].map((m) => m[1])
const LEGACY = ['productDefinitions/TEST', 'adminPanel/AdminView']
const ARTICLE_IDS = new Set(ARTICLES_TR.map((a) => a.id))

describe('makale kaydı', () => {
  it('kimlikler benzersiz, kebab-case; her kategoride en az bir makale', () => {
    expect(ARTICLE_IDS.size).toBe(ARTICLES_TR.length)
    for (const a of ARTICLES_TR) expect(a.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    for (const c of HELP_CATEGORIES) expect(ARTICLES_TR.some((a) => a.category === c.id), c.id).toBe(true)
  })

  it('istenen kapsam: başlarken, sorun giderme, SSS, destek ve kritik konular var', () => {
    for (const id of ['gs-account', 'gs-first-integration', 'gs-first-product-transfer', 'app-shortcuts', 'app-filters-views', 'app-bulk-actions', 'cat-mapping', 'cat-required-attributes', 'stock-reservation', 'stock-channel-policy', 'ord-lifecycle', 'ord-returns', 'ord-messages-sla', 'int-channel-connect', 'int-scope', 'int-errors', 'acc-privacy', 'acc-users', 'ts-product-not-sent', 'ts-order-missing', 'ts-stock-mismatch', 'faq-general', 'support-ticket']) {
      expect(ARTICLE_IDS.has(id), id).toBe(true)
    }
  })

  it('her makalede özet ve gövde; ilgili makaleler var ve kendini göstermiyor', () => {
    for (const a of ARTICLES_TR) {
      expect(a.summary.length, a.id).toBeGreaterThan(10)
      expect(a.body.length, a.id).toBeGreaterThan(0)
      for (const r of a.related ?? []) {
        expect(ARTICLE_IDS.has(r), `${a.id} → ${r}`).toBe(true)
        expect(r).not.toBe(a.id)
      }
    }
  })

  it('"Buraya git" hedefleri geçerli ekran anahtarı (views kaydı), yönetim ekranı değil', () => {
    for (const a of ARTICLES_TR) {
      for (const g of a.goTo ?? []) {
        expect(VIEW_KEYS, `${a.id} → ${g.screen}`).toContain(g.screen)
        expect(g.screen.startsWith('adminPanel/')).toBe(false)
        expect(g.label.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('otomatik bloklar doğru makalelerde; kısayol tuşları elle yazılmaz', () => {
    const has = (id: string, type: string) => ARTICLES_TR.find((a) => a.id === id)!.body.some((b) => b.type === type)
    expect(has('app-shortcuts', 'shortcuts')).toBe(true)
    expect(has('int-errors', 'integrationErrors')).toBe(true)
    expect(has('int-channel-connect', 'channelGuides')).toBe(true)
    const text = JSON.stringify(ARTICLES_TR)
    expect(text).not.toMatch(/Ctrl\s*\+|Alt\s*\+\s*[A-Z0-9]/)
  })

  it('EN: her makalenin başlık + özeti var, fazladan anahtar yok; getHelpArticles("en") TR gövdeye düşer', () => {
    expect(Object.keys(ARTICLES_EN).sort()).toEqual([...ARTICLE_IDS].sort())
    for (const [id, t] of Object.entries(ARTICLES_EN)) {
      expect(t.title.trim().length, id).toBeGreaterThan(0)
      expect(t.summary.trim().length, id).toBeGreaterThan(0)
    }
    const en = getHelpArticles('en')
    expect(en.find((a) => a.id === 'gs-account')!.bodyLocale).toBe('en')
    expect(en.find((a) => a.id === 'faq-general')!.bodyLocale).toBe('tr')
  })

  it('rakip/uydurma ifade yok (yalnız bağlanabilen 6 kanal adıyla konuşulur)', () => {
    const text = JSON.stringify(ARTICLES_TR).toLocaleLowerCase('tr-TR')
    for (const banned of ['amazon', 'çiçeksepeti', 'shopify', 'woocommerce', 'paraşüt']) expect(text, banned).not.toContain(banned)
  })
})

describe('sayfa yardımı (Sayfa hakkında paneli)', () => {
  it('views kaydındaki HER ekranın içeriği var (eski/test ekranları hariç), fazladan anahtar yok', () => {
    const expected = VIEW_KEYS.filter((k) => !LEGACY.includes(k)).sort()
    expect(Object.keys(PAGE_HELP).sort()).toEqual(expected)
  })

  it('amaç + 3-5 ipucu + geçerli kısayol kimlikleri + var olan makale', () => {
    const ids = new Set(SHORTCUTS.map((s) => s.id))
    for (const [key, h] of Object.entries(PAGE_HELP)) {
      expect(h.purpose.length, key).toBeGreaterThan(15)
      expect(h.tips.length, key).toBeGreaterThanOrEqual(3)
      expect(h.tips.length, key).toBeLessThanOrEqual(5)
      for (const s of h.shortcuts ?? []) expect(ids.has(s as any), `${key} → ${s}`).toBe(true)
      expect(ARTICLE_IDS.has(h.article), `${key} → ${h.article}`).toBe(true)
    }
  })

  it('sekme kodundan çözümleme: kod, tam anahtar ve klon sekme kodu', () => {
    expect(pageHelpFor('OrderListView')?.key).toBe('OrderListView')
    expect(pageHelpFor('ProductListView')?.key).toBe('productDefinitions/ProductListView')
    expect(pageHelpFor('ProductUpdateView_66f1c0a2')?.key).toBe('ProductUpdateView')
    expect(pageHelpFor('IntegrationSettingsView_trendyol')?.key).toBe('adminPanel/IntegrationSettingsView')
    expect(pageHelpFor('Yok')).toBeUndefined()
  })

  it('mevcut e2e iddialarıyla uyumlu açıklamalar korunur', () => {
    expect(PAGE_HELP.OrderListView.purpose.startsWith('Tüm pazaryeri siparişlerinizi buradan yönetin.')).toBe(true)
    expect(PAGE_HELP.ClaimListView.purpose).toMatch(/iade\/talep süreçlerini/)
  })
})

describe('otomatik tablolar tek kaynaktan', () => {
  it('kısayol tablosu kayıt defteriyle birebir (sıra, tuşlar, etiket)', () => {
    const rows = shortcutRows()
    expect(rows.map((r) => r.label).sort()).toEqual(SHORTCUTS.map((s) => s.label).sort())
    for (const s of SHORTCUTS) {
      const row = rows.find((r) => r.label === s.label)!
      expect(row.keys).toEqual([...s.keys])
      expect(row.group).toBe(s.group)
      expect(row.inEditable).toBe(!!s.allowInEditable)
    }
  })

  it('entegrasyon hata tablosu sınıflandırıcının tüm türlerini kapsar ve metinleri boş değil', () => {
    const rows = integrationErrorRows()
    expect(rows.map((r) => r.id)).toEqual(['timeout', 'server', 'rate', 'auth', 'notFound', 'network', 'empty', 'unknown'])
    for (const r of rows) {
      expect(r.title && r.cause && r.action).toBeTruthy()
    }
    expect(rows.find((r) => r.id === 'auth')!.retry).toBe(false)
    expect(rows.find((r) => r.id === 'network')!.settings).toBe(false)
  })

  it('kanal rehberi site/src/data/connect.ts ile eş (kanal, etiket, not, adım metinleri)', () => {
    const site = readFileSync(resolve(root, '../site/src/data/connect.ts'), 'utf8')
    const siteCodes = [...site.matchAll(/code: '([a-z0-9]+)',\r?\n\s+credentials: \[([^\]]+)\]/g)].map((m) => ({
      code: m[1],
      creds: [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]),
    }))
    expect(siteCodes.map((c) => c.code)).toEqual(HELP_CHANNELS.map((c) => c.code))
    for (const c of siteCodes) expect(HELP_CHANNELS.find((h) => h.code === c.code)!.credentials).toEqual(c.creds)
    for (const ch of HELP_CHANNELS) if (ch.note) expect(site).toContain(ch.note)
    for (const w of Object.values(HELP_CHANNEL_WHERE)) expect(site).toContain(w)
    for (const s of HELP_CHANNEL_COMMON_STEPS) expect(site).toContain(s)
    for (const screen of Object.values(HELP_CHANNEL_SCREEN)) expect(VIEW_KEYS).toContain(screen)
    expect(channelGuideRows()[0].steps[0]).toBe(HELP_CHANNEL_WHERE.marketplace)
  })
})

describe('(?) ipuçları ve kabuk kaydı', () => {
  const vueFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? vueFiles(p) : p.endsWith('.vue') ? [p] : []
    })
  const used = new Set(
    vueFiles(join(root, 'src')).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<EkHelpHint hint="([^"]+)"/g)].map((m) => m[1])),
  )

  it('her ipucunun metni ve (varsa) makalesi geçerli; kanal ipuçları connect.ts etiketlerini içerir', () => {
    for (const [id, h] of Object.entries(HELP_HINTS)) {
      expect(h.title && h.text, id).toBeTruthy()
      if (h.article) expect(ARTICLE_IDS.has(h.article), id).toBe(true)
    }
    for (const ch of HELP_CHANNELS) {
      const hint = (HELP_HINTS as Record<string, { text: string }>)[`integration.credentials.${ch.code}`]
      for (const c of ch.credentials) expect(hint.text.toLocaleLowerCase('tr-TR'), `${ch.code}: ${c}`).toContain(c.toLocaleLowerCase('tr-TR'))
    }
  })

  it('kritik alan ipuçları ekranlara yerleştirildi; kullanılan her kimlik kayıtta var', () => {
    for (const id of used) expect(Object.keys(HELP_HINTS), id).toContain(id)
    const required = Object.keys(HELP_HINTS).filter((k) => k !== 'integration.credentials.generic')
    for (const id of required) expect(used.has(id), id).toBe(true)
  })

  it('yardım merkezi ekranı kayıtlı; kategori URL parametresi kategorilerle eş; tur adımları kabuk çapalarına bağlı', () => {
    const screen = resolveScreenByKey('HelpCenterView')!
    expect(screen.slug).toBe('help')
    expect(VIEW_KEYS).toContain('HelpCenterView')
    expect(screen.urlParams?.find((p) => p.name === 'category')?.allowed).toEqual(HELP_CATEGORIES.map((c) => c.id))
    expect(SCREENS.filter((s) => s.slug === 'help')).toHaveLength(1)
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(4)
    for (const s of TOUR_STEPS) expect(s.targets.length).toBeGreaterThan(0)
  })
})
