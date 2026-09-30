// DS-v2 A7 — breadcrumb + sayfa başlığı satırı (EkPageBar). Model kuralları (katlama, dar görünüm, geri oku),
// modül ikonu çözümü ve bileşen sözleşmesi (aria, tek H1, token disiplini, TÜM sayfalarda tek bileşen).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTrail, MAX_VISIBLE_MIDDLE, type EkCrumb } from '../src/components/ds/pageTrail'
import { resolveModuleIcon } from '../src/composables/usePageContext'

const go = () => undefined
const A: EkCrumb = { label: 'Entegrasyonlar', onSelect: go }
const B: EkCrumb = { label: 'Trendyol ayarları', onSelect: go }
const C: EkCrumb = { label: 'Uç noktalar' }
const labels = (c: EkCrumb[]) => c.map((x) => x.label)

describe('A7 — yol modeli (buildTrail)', () => {
  it('kısa yol: kök + tüm ara öğeler, katlama yok', () => {
    const v = buildTrail([A], { narrow: false, hasRoot: true })
    expect(v.showRoot).toBe(true)
    expect(labels(v.middle)).toEqual(['Entegrasyonlar'])
    expect(v.folded).toEqual([])
  })

  it(`uzun yol: ${MAX_VISIBLE_MIDDLE}'den fazla ara öğede ÖNCEKİLER '…' menüsüne katlanır, son ikisi kalır`, () => {
    const v = buildTrail([A, B, C], { narrow: false, hasRoot: true })
    expect(labels(v.folded)).toEqual(['Entegrasyonlar'])
    expect(labels(v.middle)).toEqual(['Trendyol ayarları', 'Uç noktalar'])
  })

  it('sığmadığında (keep) önce 1, sonra 0 ara öğe kalır — sıra korunur', () => {
    expect(labels(buildTrail([A, B], { narrow: false, hasRoot: true, keep: 1 }).folded)).toEqual(['Entegrasyonlar'])
    const none = buildTrail([A, B], { narrow: false, hasRoot: true, keep: 0 })
    expect(none.middle).toEqual([])
    expect(labels(none.folded)).toEqual(['Entegrasyonlar', 'Trendyol ayarları'])
    // keep üst sınırı aşamaz
    expect(buildTrail([A, B, C], { narrow: false, hasRoot: true, keep: 9 }).middle).toHaveLength(MAX_VISIBLE_MIDDLE)
  })

  it('dar: kök gizli, yalnız ebeveyn + başlık (son iki öğe), "…" yok; geri oku en yakın bağlantılı ata', () => {
    const v = buildTrail([A, B, C], { narrow: true, hasRoot: true })
    expect(v.showRoot).toBe(false)
    expect(labels(v.middle)).toEqual(['Uç noktalar'])
    expect(v.folded).toEqual([])
    expect(v.back?.label).toBe('Trendyol ayarları')
  })

  it('dar + ara öğe yok: kök görünür (kök / başlık), geri oku yok (ölü düğme yok)', () => {
    const v = buildTrail(undefined, { narrow: true, hasRoot: true })
    expect(v.showRoot).toBe(true)
    expect(v.middle).toEqual([])
    expect(v.back).toBeNull()
  })

  it('bölüm yoksa kök çizilmez; boş etiketli öğe atılır', () => {
    const v = buildTrail([{ label: '' }, A], { narrow: false, hasRoot: false })
    expect(v.showRoot).toBe(false)
    expect(labels(v.middle)).toEqual(['Entegrasyonlar'])
  })
})

describe('A7 — modül ikonu menü kaydından (resolveModuleIcon)', () => {
  const menu = [
    { group: 'sale', links: [
      { code: 'OrderListView', icon: 'mdi-cart-outline' },
      { code: 'productDefinitions', icon: 'mdi-tag-outline', children: [{ code: 'ProductListView', icon: 'mdi-magnify' }] },
    ] },
    { group: 'admin', links: [{ code: 'adminPanel', icon: 'mdi-shield-account-outline', children: [{ code: 'EffectiveConfigView' }] }] },
  ]
  it('kök öğe kendi ikonu, alt öğe ÜST öğenin (modülün) ikonu', () => {
    expect(resolveModuleIcon(menu, 'OrderListView')).toBe('mdi-cart-outline')
    expect(resolveModuleIcon(menu, 'ProductListView')).toBe('mdi-tag-outline')
  })
  it('klon sekme kodu (Kod_<kimlik>) taban koda düşer; bilinmeyen/boş → undefined', () => {
    expect(resolveModuleIcon(menu, 'EffectiveConfigView_trendyol')).toBe('mdi-shield-account-outline')
    expect(resolveModuleIcon(menu, 'Yok_1')).toBeUndefined()
    expect(resolveModuleIcon(undefined, 'OrderListView')).toBeUndefined()
  })
})

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('A7 — EkPageBar sözleşmesi', () => {
  const src = read('src/components/ds/EkPageBar.vue')
  const template = src.slice(src.indexOf('<template>'), src.indexOf('<script'))
  const style = src.slice(src.indexOf('<style'))

  it('nav landmark + sıralı liste; SON öğe tek H1 ve aria-current="page"', () => {
    expect(template).toMatch(/<nav class="ek-crumbs" aria-label="Sayfa konumu">/)
    expect(template).toMatch(/<ol class="ek-crumbs__list">/)
    expect(template.match(/<h1\b/g)).toHaveLength(1)
    expect(template).toMatch(/<h1[^>]*aria-current="page"/)
  })

  it('ayraç dekoratif (aria-hidden), düğmelerin erişilebilir adı var, odak halkası token', () => {
    for (const m of template.matchAll(/class="ek-crumbs__sep"[^>]*>/g)) expect(m[0]).toMatch(/aria-hidden="true"/)
    // [B4] geri/"…" düğmeleri ayrıca `ek-crumbs__chip` sınıfını taşır (nötr çip görünümü) — iddia aynı: erişilebilir ad var.
    expect(template).toMatch(/ek-crumbs__back[^"]*"[^>]*:aria-label="`Geri: /)
    expect(template).toMatch(/ek-crumbs__more[^"]*"[^>]*\n?[^>]*:aria-label=/)
    expect(template).toMatch(/ek-record-id__copy"[^>]*\n?[^>]*:aria-label=/)
    expect(style).toMatch(/\.ek-crumbs__link:focus-visible[\s\S]*?box-shadow: var\(--ek-focus-ring\)/)
  })

  it('yalnız semantik token (ham renk yok — dark mode hazır), başlık tipografi rolünden', () => {
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
    expect(style).toMatch(/\.ek-page-bar__title \{[\s\S]*?font-size: var\(--ek-type-title-size\)/)
  })

  it('A6b yenile düğmesi ve A5 "Sayfa hakkında" paneli satırda korunur', () => {
    expect(template).toMatch(/<EkRefreshButton\b/)
    expect(template).toMatch(/:aria-controls="panelId"/)
    expect(template).toMatch(/<EkCollapse :id="panelId"/)
  })
})

describe('A7 — TÜM sayfalarda tek breadcrumb bileşeni', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (p.endsWith('.vue')) out.push(p)
    }
    return out
  }
  it('ekranlar kendi breadcrumb\'ını yazmaz (v-breadcrumbs / aria-label="Breadcrumb" yalnız yok)', () => {
    const offenders = walk(join(__dirname, '..', 'src'))
      .filter((f) => !f.includes('/views/dev/'))
      .filter((f) => /<v-breadcrumbs\b|aria-label="Breadcrumb"/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
