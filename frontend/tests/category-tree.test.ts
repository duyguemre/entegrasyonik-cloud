// Kategoriler ekranı saf yardımcıları: ağaç kurma, Türkçe arama/vurgu, eşleme kapsamı, taşıma kuralları, kanal önerisi.
import { describe, expect, it } from 'vitest'
import {
  buildCategoryTree, canMoveInto, canSwapOrder, computeCoverage, fold, flattenVisible, highlightParts, incompleteVisibleIds,
  indexCategoryMappings, searchCategories, siblingOf,
} from '../src/composables/categoryTree'
import { buildChannelIndex, searchLeaves, suggestLeaves } from '../src/composables/channelCategoryIndex'

const leaf = (id: string, title: string) => ({ _id: id, title, children: [] })
const raw = [
  { _id: 'main', title: 'Ana', isMain: true },
  { _id: 'giyim', title: 'Giyim', children: [
    { _id: 'kadin', title: 'Kadın', children: [leaf('elbise', 'Elbise'), leaf('bluz', 'Bluz')] },
    { _id: 'erkek', title: 'Erkek', children: [leaf('pantolon', 'Pantolon')] },
  ] },
  { _id: 'cicek', title: 'Çiçek ve Bahçe', children: [] },
]

describe('buildCategoryTree', () => {
  it('ana kategoriyi gizler, kimliğini tutar, yolları kurar', () => {
    const t = buildCategoryTree(raw)
    expect(t.mainId).toBe('main')
    expect(t.nodes.map((n) => n.title)).toEqual(['Giyim', 'Çiçek ve Bahçe'])
    expect(t.byId.get('elbise')!.path).toEqual(['Giyim', 'Kadın', 'Elbise'])
    expect(t.byId.get('elbise')!.parentId).toBe('kadin')
    expect(t.byId.get('giyim')!.parentId).toBeNull()
  })
  it('ana kategori altında children taşıyan eski şekli de üst düzey sayar', () => {
    const t = buildCategoryTree([{ _id: 'r', title: 'K', isMain: true, children: [leaf('a', 'A')] }])
    expect(t.nodes.map((n) => n.id)).toEqual(['a'])
  })
  it('boş/undefined girdide çökmez', () => {
    expect(buildCategoryTree(undefined).nodes).toEqual([])
    expect(buildCategoryTree([]).mainId).toBeNull()
  })
})

describe('arama ve vurgu', () => {
  it('Türkçe harfleri katlar (cicek → Çiçek), uzunluk korunur', () => {
    expect(fold('Çiçek ISI İş')).toBe('cicek isi is')
    expect(fold('ğüşöçıİ')).toHaveLength(7)
  })
  it('eşleşeni ve üst dallarını görünür kılar, dalları açar', () => {
    const t = buildCategoryTree(raw)
    const r = searchCategories(t, 'elb')
    expect([...r.matchIds]).toEqual(['elbise'])
    expect([...r.visibleIds].sort()).toEqual(['elbise', 'giyim', 'kadin'])
    expect([...r.openIds].sort()).toEqual(['giyim', 'kadin'])
  })
  it('vurgu parçaları metni yeniden oluşturur', () => {
    const parts = highlightParts('Çiçek ve Bahçe', 'cicek')
    expect(parts.map((p) => p.text).join('')).toBe('Çiçek ve Bahçe')
    expect(parts[0]).toEqual({ text: 'Çiçek', hit: true })
  })
})

describe('eşleme kapsamı', () => {
  const t = buildCategoryTree(raw)
  const docs = [
    { localCategoryId: 'elbise', integrationCode: 'trendyol', platformCategoryId: '411', platformAttributeId: null, isCategoryMapping: true },
    { localCategoryId: 'elbise', integrationCode: 'trendyol', platformCategoryId: '411', platformAttributeId: 'a1', localChoiceId: 'c1' }, // özellik eşlemesi: sayılmaz
    { localCategoryId: 'bluz', integrationCode: 'hb', platformCategoryId: 'h1', platformAttributeId: null },
  ]
  const idx = indexCategoryMappings(docs)
  it('yalnız kategori eşlemelerini indeksler', () => {
    expect(idx.get('elbise')!.size).toBe(1)
    expect(idx.get('bluz')!.get('hb')).toBe('h1')
  })
  it('yaprak ve üst kategori kapsamını hesaplar', () => {
    const cov = computeCoverage(t, ['trendyol', 'hb'], idx)
    expect(cov.get('elbise')).toMatchObject({ leaf: true, mapped: ['trendyol'], missing: ['hb'] })
    expect(cov.get('pantolon')!.missing).toEqual(['trendyol', 'hb'])
    expect(cov.get('giyim')).toMatchObject({ leaf: false, leafCount: 3, incompleteLeafCount: 3 })
    expect([...incompleteVisibleIds(t, cov)].sort()).toContain('giyim')
  })
})

describe('görünür satırlar ve taşıma kuralları', () => {
  const t = buildCategoryTree(raw)
  it('yalnız açık dalların çocuklarını düzleştirir; ARIA konumu doğru', () => {
    const rows = flattenVisible(t.nodes, { expanded: new Set(['giyim']) })
    expect(rows.map((r) => r.node.id)).toEqual(['giyim', 'kadin', 'erkek', 'cicek'])
    expect(rows[1]).toMatchObject({ level: 1, posInSet: 1, setSize: 2, expanded: false, hasChildren: true })
  })
  it('kendine, kendi altına ve zaten üstü olana taşıma yok', () => {
    const g = t.byId.get('giyim')!
    expect(canMoveInto(g, t.byId.get('giyim')!)).toBe(false)
    expect(canMoveInto(g, t.byId.get('elbise')!)).toBe(false)
    expect(canMoveInto(t.byId.get('elbise')!, t.byId.get('kadin')!)).toBe(false)
    expect(canMoveInto(t.byId.get('elbise')!, t.byId.get('erkek')!)).toBe(true)
    expect(canMoveInto(g, null)).toBe(false) // zaten üst düzey
    expect(canMoveInto(t.byId.get('elbise')!, null)).toBe(true)
  })
  it('sıra değişimi yalnız kardeşler arasında; komşu kardeş bulunur', () => {
    expect(canSwapOrder(t.byId.get('elbise')!, t.byId.get('bluz')!)).toBe(true)
    expect(canSwapOrder(t.byId.get('elbise')!, t.byId.get('pantolon')!)).toBe(false)
    expect(siblingOf(t, t.byId.get('elbise')!, 1)?.id).toBe('bluz')
    expect(siblingOf(t, t.byId.get('elbise')!, -1)).toBeUndefined()
    expect(siblingOf(t, t.byId.get('giyim')!, 1)?.id).toBe('cicek')
  })
})

describe('kanal kategorisi arama + öneri', () => {
  const list: any[] = [
    { _id: 400, title: 'Giyim', children: [{ _id: 401, title: 'Kadın', children: [{ _id: 411, title: 'Elbise', children: [] }, { _id: 412, title: 'Bluz', children: [] }] }] },
    { _id: 401, title: 'Kadın', children: [{ _id: 411, title: 'Elbise', children: [] }, { _id: 412, title: 'Bluz', children: [] }] },
    { _id: 411, title: 'Elbise', children: [] },
    { _id: 412, title: 'Bluz', children: [] },
  ]
  const idx = buildChannelIndex(list)
  it('yalnız yaprakları ve tam yolu döndürür; ≥2 harf ister', () => {
    expect(idx.pathText('411')).toBe('Giyim › Kadın › Elbise')
    expect(searchLeaves(idx, 'e').length).toBe(0)
    expect(searchLeaves(idx, 'kadın').map((h) => h.id).sort()).toEqual(['411', '412'])
  })
  it('yerel ada benzeyeni önerir ve sıralamada öne alır', () => {
    expect(suggestLeaves(idx, 'Elbise').map((h) => h.id)).toEqual(['411'])
    expect(searchLeaves(idx, 'kadin', 'Bluz')[0].id).toBe('412')
  })
})
