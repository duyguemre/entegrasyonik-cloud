// B7 — Kategoriler / Markalar sayfaları: saf model (ağaç kurma, arama + vurgu, eşleme dizini, süzgeç, düzleştirme,
// taşıma kuralı, baş harf avatarı) ve bileşen sözleşmesi (yalnız sayfa + catalogPages, ham renk yok, ARIA ağacı/listbox,
// mevcut uç noktalar, ortak eşleme panelleri aynen kullanılır).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  brandCoverage,
  brandItems,
  buildCategoryTree,
  canMoveInto,
  categoryMappingIndex,
  filterBrands,
  flattenRows,
  fold,
  groupStats,
  highlightParts,
  initialsOf,
  isLeafMissing,
  mappingShort,
  mappingSpoken,
  mappingSummary,
  matches,
  platformCoverage,
  siblingsOf,
  titleError,
  visibleSpec,
  type PlatformRef,
} from '../src/components/catalogPages/catalogModel'

const P: PlatformRef[] = [
  { code: 'trendyol', name: 'Trendyol' },
  { code: 'hepsiburada', name: 'Hepsiburada' },
]

// Backend biçimi: [ana, ...seviye0] (category-service.ts get).
const RAW = [
  { _id: 'root', parentId: 0, title: 'Kategoriler', isMain: true },
  {
    _id: 'giyim', parentId: 'root', title: 'Giyim', level: 0,
    children: [
      { _id: 'kadin', parentId: 'giyim', title: 'Kadın', level: 1, children: [
        { _id: 'tisort', parentId: 'kadin', title: 'Tişört', level: 2, children: [] },
        { _id: 'bluz', parentId: 'kadin', title: 'Bluz', level: 2, children: [] },
      ] },
      { _id: 'erkek', parentId: 'giyim', title: 'Erkek', level: 1, children: [
        { _id: 'etisort', parentId: 'erkek', title: 'Tişört', level: 2, children: [] },
      ] },
    ],
  },
  { _id: 'kozmetik', parentId: 'root', title: 'Kozmetik', level: 0, children: [] },
]

const MAPS = [
  { localCategoryId: 'tisort', integrationCode: 'trendyol', platformCategoryId: '10', platformAttributeId: null },
  { localCategoryId: { $oid: 'tisort' }, integrationCode: 'hepsiburada', platformCategoryId: '11', platformAttributeId: null },
  { localCategoryId: 'bluz', integrationCode: 'trendyol', platformCategoryId: '12', platformAttributeId: null },
  // nitelik kaydı kategori eşlemesi SAYILMAZ
  { localCategoryId: 'kozmetik', integrationCode: 'trendyol', platformCategoryId: '13', platformAttributeId: '47' },
  // boş platform kategorisi sayılmaz
  { localCategoryId: 'kozmetik', integrationCode: 'hepsiburada', platformCategoryId: '', platformAttributeId: null },
]

describe('B7 — kategori ağacı modeli', () => {
  const tree = buildCategoryTree(RAW)

  it('backend biçimini okur: ana kayıt köke alınmaz, seviye/yol/yaprak sayısı', () => {
    expect(tree.mainId).toBe('root')
    expect(tree.roots.map((r) => r.title)).toEqual(['Giyim', 'Kozmetik'])
    expect(tree.total).toBe(7)
    expect(tree.leafCount).toBe(4)
    expect(tree.byId.get('tisort')!.path).toEqual(['Giyim', 'Kadın', 'Tişört'])
    expect(tree.byId.get('tisort')!.depth).toBe(2)
    expect(tree.byId.get('tisort')!.raw).toBe(RAW[1].children![0].children![0])
  })

  it('eski fixture biçimi (seviye 0 ana kaydın children\'ında) ve boş/bozuk girdi', () => {
    const legacy = buildCategoryTree([{ _id: 'r', title: 'Kategoriler', isMain: true, children: [{ _id: 'a', title: 'A', children: [] }] }])
    expect(legacy.roots.map((r) => r.id)).toEqual(['a'])
    expect(buildCategoryTree(undefined).total).toBe(0)
    expect(buildCategoryTree([null, undefined] as any).total).toBe(0)
  })

  it('eşleme dizini: yalnız kategori düzeyi kayıtlar, $oid kimlikleri', () => {
    const idx = categoryMappingIndex(MAPS)
    expect([...idx.get('tisort')!]).toEqual(['trendyol', 'hepsiburada'])
    expect([...idx.get('bluz')!]).toEqual(['trendyol'])
    expect(idx.has('kozmetik')).toBe(false)
  })

  it('grup istatistiği: eksik yaprak sayısı yukarı toplanır; platform yoksa eksik yok', () => {
    const idx = categoryMappingIndex(MAPS)
    const st = groupStats(tree, idx, P)
    expect(st.get('kadin')).toEqual({ leaves: 2, missing: 1 })
    expect(st.get('giyim')).toEqual({ leaves: 3, missing: 2 })
    expect(st.get('kozmetik')).toEqual({ leaves: 1, missing: 1 })
    expect(isLeafMissing('tisort', idx, [])).toBe(false)
    expect(platformCoverage(tree, idx, P)).toEqual([
      { code: 'trendyol', name: 'Trendyol', mapped: 2, total: 4 },
      { code: 'hepsiburada', name: 'Hepsiburada', mapped: 1, total: 4 },
    ])
  })

  it('arama: eşleşen + ataları görünür, atalar açılır; eşleşen grubun alt ağacı görünür', () => {
    const idx = categoryMappingIndex(MAPS)
    const s = visibleSpec(tree, 'tisort', false, idx, P)
    expect([...s.hits].sort()).toEqual(['etisort', 'tisort'])
    expect([...s.expand].sort()).toEqual(['erkek', 'giyim', 'kadin'])
    expect(s.visible!.has('bluz')).toBe(false)
    const g = visibleSpec(tree, 'kadın', false, idx, P)
    expect(g.visible!.has('bluz')).toBe(true) // grubun çocukları
    expect(g.expand.has('kadin')).toBe(false) // grup kendisi kapalı başlar
  })

  it('"eşlemesi eksik" süzgeci: yalnız eksik yapraklar + ataları', () => {
    const idx = categoryMappingIndex(MAPS)
    const s = visibleSpec(tree, '', true, idx, P)
    expect([...s.visible!].sort()).toEqual(['bluz', 'erkek', 'etisort', 'giyim', 'kadin', 'kozmetik'])
    expect(s.visible!.has('tisort')).toBe(false)
    expect(visibleSpec(tree, '', false, idx, P).visible).toBeNull()
  })

  it('düzleştirme: yalnız açık düğümlerin çocukları; aria set/pos', () => {
    const rows = flattenRows(tree, new Set(['giyim']), null)
    expect(rows.map((r) => r.node.id)).toEqual(['giyim', 'kadin', 'erkek', 'kozmetik'])
    expect(rows[0]).toMatchObject({ expanded: true, hasChildren: true, posinset: 1, setsize: 2 })
    expect(rows[1]).toMatchObject({ depth: 1, expanded: false, posinset: 1, setsize: 2 })
    // görünür küme ile: süzülen kardeşler set boyutunu küçültür
    const vis = new Set(['giyim', 'erkek', 'etisort'])
    expect(flattenRows(tree, new Set(['giyim', 'erkek']), vis).map((r) => [r.node.id, r.setsize])).toEqual([['giyim', 1], ['erkek', 1], ['etisort', 1]])
  })

  it('taşıma kuralı eski ağaçla aynı: kendisi, alt ağacı ve mevcut ebeveyni hedef olamaz', () => {
    expect(canMoveInto(tree, 'kadin', 'kadin')).toBe(false)
    expect(canMoveInto(tree, 'giyim', 'tisort')).toBe(false)
    expect(canMoveInto(tree, 'tisort', 'kadin')).toBe(false)
    expect(canMoveInto(tree, 'tisort', 'erkek')).toBe(true)
    expect(siblingsOf(tree, 'kadin').map((n) => n.id)).toEqual(['kadin', 'erkek'])
    expect(siblingsOf(tree, 'kozmetik').map((n) => n.id)).toEqual(['giyim', 'kozmetik'])
  })

  it('ad kuralı eski formlarla aynı (zorunlu, 2–160)', () => {
    expect(titleError('')).toBeTruthy()
    expect(titleError(' a ')).toBeTruthy()
    expect(titleError('ab')).toBeNull()
    expect(titleError('x'.repeat(161))).toBeTruthy()
  })
})

describe('B7 — arama katlama ve vurgu', () => {
  it('Türkçe harf yoksa aksan katlanır; varsa harf bilinçli (ça → Çanta, Olcay değil)', () => {
    expect(fold('İPEK Işık Şahin')).toBe('ipek isik sahin')
    expect(matches('Tişört', 'tisort')).toBe(true)
    expect(matches('Tişört', 'TİŞ')).toBe(true)
    expect(matches('Şahin Çanta', 'ça')).toBe(true)
    expect(matches('Olcay Saat', 'ça')).toBe(false)
    expect(matches('Olcay Saat', 'ca')).toBe(true)
    expect(matches('Herhangi', '  ')).toBe(true)
  })

  it('vurgu parçaları özgün yazımı korur, birden çok eşleşme', () => {
    expect(highlightParts('Üst Giyim', 'ust')).toEqual([{ text: 'Üst', match: true }, { text: ' Giyim', match: false }])
    expect(highlightParts('Ana ana', 'ana').filter((p) => p.match).map((p) => p.text)).toEqual(['Ana', 'ana'])
    expect(highlightParts('Bot', '')).toEqual([{ text: 'Bot', match: false }])
  })
})

describe('B7 — markalar modeli', () => {
  const RAWB = [
    { _id: 'm', title: 'Markalar', isMain: true },
    { _id: 'a', title: 'Ege Pamuk', platforms: { trendyol: { id: 5, title: 'Ege Pamuk' }, hepsiburada: {} } },
    { _id: 'b', title: 'İpek Yolu', platforms: {} },
    { _id: 'c', title: 'kuzey', platforms: { trendyol: { id: 0 }, hepsiburada: { id: 'hb-1' } } },
  ]

  it('ana kayıt dışlanır; eşleme `platforms.<kod>.id` ile (0 geçerli kimlik)', () => {
    const items = brandItems(RAWB, P)
    expect(items.map((b) => b.id)).toEqual(['a', 'b', 'c'])
    expect(items[0].mapping.map((m) => m.mapped)).toEqual([true, false])
    expect(items[2].mappedCount).toBe(2)
    expect(brandCoverage(items, P)).toEqual([
      { code: 'trendyol', name: 'Trendyol', mapped: 2, total: 3 },
      { code: 'hepsiburada', name: 'Hepsiburada', mapped: 1, total: 3 },
    ])
  })

  it('süzgeç: arama + yalnız eksikler', () => {
    const items = brandItems(RAWB, P)
    expect(filterBrands(items, 'ipek', false).map((b) => b.id)).toEqual(['b'])
    expect(filterBrands(items, '', true).map((b) => b.id)).toEqual(['a', 'b'])
    // platform yoksa hiçbir marka "eksik" sayılmaz
    expect(filterBrands(brandItems(RAWB, []), '', true)).toEqual([])
  })

  it('baş harf avatarı: iki kelime → iki baş harf (Türkçe büyük harf), tek kelime → ilk iki harf', () => {
    expect(initialsOf('Ege Pamuk')).toBe('EP')
    expect(initialsOf('ipek yolu')).toBe('İY')
    expect(initialsOf('lavin')).toBe('LA')
    expect(initialsOf('  & Co  ')).toBe('CO')
    expect(initialsOf('')).toBe('?')
  })

  it('özet metinleri: renk tek başına anlam taşımaz', () => {
    const s = [
      { code: 'trendyol', name: 'Trendyol', mapped: true },
      { code: 'hepsiburada', name: 'Hepsiburada', mapped: false },
    ]
    expect(mappingSummary(s)).toBe('1/2 platformda eşli')
    expect(mappingShort(s)).toBe('1/2 eşli')
    expect(mappingSpoken(s)).toBe('Trendyol: eşli, Hepsiburada: eşli değil')
    expect(mappingSummary([])).toBe('Bağlı platform yok')
    expect(mappingShort(s.map((x) => ({ ...x, mapped: true })))).toBe('Tamamı eşli')
  })
})

describe('B7 — bileşen sözleşmesi (statik)', () => {
  const root = join(__dirname, '..', 'src')
  const dir = join(root, 'components', 'catalogPages')
  const files = readdirSync(dir).map((f) => join(dir, f))
  const pages = ['CategoryListView.vue', 'BrandListView.vue'].map((f) => join(root, 'views', 'secure', 'productDefinitions', f))
  const read = (p: string) => readFileSync(p, 'utf8')
  const styles = (src: string) => (src.match(/<style[\s\S]*?<\/style>/g) ?? []).join('\n')

  it('ham renk / literal hareket yok (token disiplini, dark hazır)', () => {
    for (const f of [...files, ...pages]) {
      const src = read(f)
      expect(src, f).not.toMatch(/(?<![0-9a-fA-F&])#[0-9a-fA-F]{3,8}\b(?![-\w])/)
      expect(src, f).not.toMatch(/rgba?\(/)
      expect(src, f).not.toMatch(/\bstyle="/)
      expect(styles(src), f).not.toMatch(/\d{3}ms|cubic-bezier/)
    }
  })

  it('sayfalar tek başlık satırı (EkPageHeader) + ana-detay kullanır; eski sol/sağ kök bileşenler bu sayfalarda yok', () => {
    const cat = read(pages[0])
    const brand = read(pages[1])
    for (const src of [cat, brand]) {
      expect(src).toMatch(/<EkPageHeader[\s\S]*section="Katalog"/)
      expect(src).toMatch(/<CatalogSplit/)
      expect(src).toMatch(/refreshable/)
    }
    expect(cat).not.toMatch(/import .*(CategoryListComponent|CategoryTreeComponent)/)
    expect(brand).not.toMatch(/import .*BrandListComponent/)
    // mevcut eşleme panelleri aynen (ortak bileşen değişmeden) detayda
    expect(read(join(dir, 'CategoryDetail.vue'))).toMatch(/<CategorySyncComponent v-model="syncModel" \/>/)
    expect(read(join(dir, 'BrandDetail.vue'))).toMatch(/<BrandSyncComponent v-model="syncModel" \/>/)
    // kök sınıflar korunur (panellerin örtü/onay `attach` hedefi)
    expect(cat).toMatch(/class="categoryListView /)
    expect(brand).toMatch(/class="brandDefinition /)
  })

  it('yalnız mevcut uç noktalar (sözleşme değişmedi)', () => {
    const all = [...files, ...pages].map(read).join('\n')
    const used = [...all.matchAll(/restApi\.(?:get|post)\('([^']+)'/g)].map((m) => m[1]).sort()
    expect([...new Set(used)]).toEqual([
      'AttributeMappingService/autoMatchAllCategories',
      'BrandService',
      'BrandService/addBrand',
      'CategoryService',
      'CategoryService/addCategory',
      'CategoryService/changeOrderCategory',
      'CategoryService/moveCategory',
      'CategoryService/updateCategory',
    ])
    expect(all).toMatch(/'CategoryService\/moveCategory', \{ moveCategoryId: n\.id, moveInCategoryId: newParentId \}/)
    expect(all).toMatch(/'CategoryService\/changeOrderCategory', \{ fromCategoryId: n\.id, toCategoryId: target\.id \}/)
    expect(all).toMatch(/'CategoryService\/updateCategory', \{ categoryId: n\.id, title \}/)
    expect(all).toMatch(/'BrandService\/addBrand', \{ title \}/)
  })

  it('ARIA: ağaç (tree/treeitem + level/setsize/posinset/expanded/selected), marka listbox/option, dolaşan tabindex', () => {
    const tree = read(join(dir, 'CategoryTree.vue'))
    const row = read(join(dir, 'CategoryTreeRow.vue'))
    const col = read(join(dir, 'BrandCollection.vue'))
    expect(tree).toMatch(/role="tree"/)
    for (const a of ['role="treeitem"', ':aria-level', ':aria-setsize', ':aria-posinset', ':aria-expanded', ':aria-selected', ':tabindex="tabbable ? 0 : -1"']) expect(row).toContain(a)
    expect(col).toMatch(/role="listbox"/)
    expect(col).toMatch(/role="option"/)
    expect(col).toMatch(/:aria-selected/)
    for (const k of ["'ArrowDown'", "'ArrowUp'", "'ArrowRight'", "'ArrowLeft'", "'Home'", "'End'", "'F2'"]) expect(tree).toContain(k)
    // canlı bölge + satır içi düğmeler sekme durağı değil
    expect(tree).toMatch(/aria-live="polite"/)
    expect(row).toMatch(/tabindex="-1"/)
  })

  it('sanallaştırma eşiği ve sabit satır yüksekliği (40px) tutarlı', () => {
    const tree = read(join(dir, 'CategoryTree.vue'))
    const row = read(join(dir, 'CategoryTreeRow.vue'))
    expect(tree).toMatch(/const ROW_H = 40/)
    expect(tree).toMatch(/const VIRTUAL_AT = 300/)
    expect(tree).toMatch(/<v-virtual-scroll v-if="virtual"/)
    expect(row).toMatch(/\.cat-row \{[\s\S]*?height: 40px;/)
  })

  it('hareket yalnız token süreleri + opaklık/kısa kayma (hoplama yok)', () => {
    for (const f of [...files, ...pages]) {
      const css = styles(read(f))
      expect(css, f).not.toMatch(/scale\(|bounce|@keyframes/)
      for (const m of css.matchAll(/transition:[^;]+;/g)) expect(m[0], f).toMatch(/var\(--ek-(duration|transition)/)
    }
  })
})
