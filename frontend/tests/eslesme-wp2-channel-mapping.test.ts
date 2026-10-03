// [eslesme-fiyat WP2] Ürün formu kanal eşleme: tek kaynak AttributeMappings (Ek C P0-1), HB değer yükleme (P0-2),
// "içeren" arama (P1-2), boş liste dört durumu (P1-1), eşlemeden doldurma (B-3c). Saf fonksiyonlar + store.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const post = vi.fn()
const get = vi.fn()
vi.mock('@/composables/restapi', () => ({ default: () => ({ post, get }) }))

import { attrOptions, needsValueFetch, valueEmptyState } from '@/components/productDefinitions/variants/channelAttributes'
import { fillFromMappings } from '@/components/productDefinitions/variants/mappingFill'
import { useAttributeMappingStore } from '@/stores/site/attributeMapping'
import { useCategoriesStore } from '@/stores/categoriesStore'

const ROWS = [
  { integrationCode: 'trendyol', localCategoryId: 'c1', isCategoryMapping: true, platformAttributeId: null, platformCategoryId: 411 },
  { integrationCode: 'trendyol', localCategoryId: 'c1', isCategoryMapping: false, platformAttributeId: '47', platformAttributeName: 'Renk', localChoiceId: 'ch1',
    values: [{ localValueId: 'v-red', platformValueId: '9001', platformValueName: 'Kırmızı' }] },
  { integrationCode: 'hepsiburada', localCategoryId: 'c1', isCategoryMapping: false, platformAttributeId: 'renk', platformAttributeName: 'Renk', localChoiceId: 'ch1',
    values: [{ localValueId: 'v-red', platformValueId: null, platformValueName: 'Kırmızı' }] },
]

beforeEach(() => { setActivePinia(createPinia()); post.mockReset(); get.mockReset() })

describe('attrOptions (P1-2)', () => {
  const a = { values: [{ id: 1, title: 'Koyu Mavi' }, { id: 2, title: 'Mavi' }, { id: 3, title: 'Kırmızı' }] }
  it('aranan metni İÇERENLER gelir, başa uyanlar önce', () => {
    expect(attrOptions(a, 'mavi', undefined).map((v) => v.title)).toEqual(['Mavi', 'Koyu Mavi'])
  })
})

describe('needsValueFetch (P0-2)', () => {
  it('liste değerli + boş liste → çekilir (HB lazyValues bayrağı olmasa da); serbest değerli/dolu → çekilmez', () => {
    expect(needsValueFetch({ allowCustom: false, values: [] })).toBe(true)
    expect(needsValueFetch({ allowCustom: true, values: [] })).toBe(false)
    expect(needsValueFetch({ allowCustom: true, lazyValues: true, values: [] })).toBe(true)
    expect(needsValueFetch({ allowCustom: false, values: [{ id: 1 }] })).toBe(false)
  })
})

describe('valueEmptyState (P1-1)', () => {
  it('yükleniyor / aramaya uyan yok / kanal hatası / kanal boş ayrışır', () => {
    expect(valueEmptyState({ loading: true, query: '', valueCount: 0 })).toBe('loading')
    expect(valueEmptyState({ loading: false, query: 'x', valueCount: 5 })).toBe('noMatch')
    expect(valueEmptyState({ loading: false, query: '', valueCount: 0, error: { kind: 'timeout' } })).toBe('channelError')
    expect(valueEmptyState({ loading: false, query: 'x', valueCount: 0 })).toBe('channelEmpty')
  })
})

describe('fillFromMappings (B-3c)', () => {
  it('yerel seçenek → eşlenmiş özellik/değer; mevcut değer EZİLMEZ; eşlemesiz seçenek raporlanır', () => {
    const variants: any[] = [
      { choices: [{ choiceId: 'ch1', choiceValueId: 'v-red' }, { choiceId: 'ch9', choiceValueId: 'x' }] },
      { choices: [{ choiceId: 'ch1', choiceValueId: 'v-red' }], platforms: { trendyol: { attributes: { 47: { attributeName: 'Renk', attributeValue: 'Bordo', attributeValueId: '1' } } } } },
    ]
    const r = fillFromMappings(variants, 'trendyol', 'c1', ROWS)
    expect(r).toEqual({ filled: 1, unmappedChoiceIds: ['ch9'] })
    expect(variants[0].platforms.trendyol.attributes['47']).toEqual({ attributeName: 'Renk', attributeValue: 'Kırmızı', attributeValueId: '9001' })
    expect(variants[1].platforms.trendyol.attributes['47'].attributeValue).toBe('Bordo')
    const hb = fillFromMappings([{ choices: [{ choiceId: 'ch1', choiceValueId: 'v-red' }] }], 'hepsiburada', 'c1', ROWS)
    expect(hb.filled).toBe(1)
  })
  it('başka kategori/kanal eşlemesi kullanılmaz', () => {
    expect(fillFromMappings([{ choices: [{ choiceId: 'ch1', choiceValueId: 'v-red' }] }], 'trendyol', 'c2', ROWS).filled).toBe(0)
  })
})

describe('kategori eşleme tek kaynak (P0-1)', () => {
  it('categoriesStore kanal kategori kimliğini ve eşleme durumunu AttributeMappings\'ten türetir', async () => {
    get.mockResolvedValue(ROWS)
    const am = useAttributeMappingStore()
    await am.ensureLoaded()
    await am.ensureLoaded() // ikinci çağrı istek atmaz
    expect(get).toHaveBeenCalledTimes(1)
    const cs = useCategoriesStore()
    expect(cs.getIntegrationCategoryId('trendyol', 'c1')).toBe('411')
    expect(cs.checkCategoryPlatformMapping('c1', 'trendyol').code).toBe('SUCCESS')
    expect(cs.checkCategoryPlatformMapping('c1', 'n11').code).toBe('PLATFORM')
    expect(am.attributeMappingsFor('trendyol', 'c1').map((m: any) => m.platformAttributeId)).toEqual(['47'])
  })
  it('copyMappingsFromCategory başarıda listeyi tazeler', async () => {
    get.mockResolvedValue(ROWS)
    post.mockResolvedValue({ result: true, total: 2, copied: 2, skipped: 0 })
    const am = useAttributeMappingStore()
    const r = await am.copyMappingsFromCategory({ sourceLocalCategoryId: 'p', targetLocalCategoryId: 'c1', integrationCode: 'trendyol' })
    expect(post).toHaveBeenCalledWith('AttributeMappingService/copyMappingsFromCategory', { sourceLocalCategoryId: 'p', targetLocalCategoryId: 'c1', integrationCode: 'trendyol' })
    expect(r.copied).toBe(2)
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('marka eşleme kanalı (P1-10, K-C)', () => {
  it('katalog biçimi öncelikli: yalnız id eşlenebilir; katalog yoksa eski bayrak', async () => {
    const { isBrandMappable } = await import('@/composables/brandChannels')
    expect(isBrandMappable('id', false)).toBe(true)
    expect(isBrandMappable('name', true)).toBe(false)
    expect(isBrandMappable('attribute', undefined)).toBe(false)
    expect(isBrandMappable(undefined, undefined)).toBe(true)
    expect(isBrandMappable(undefined, false)).toBe(false)
  })
  it('normalizeCatalog brandMapping alanını taşır; bilinmeyen değer atılır', async () => {
    const { normalizeCatalog } = await import('@/components/integrations/integrationCatalog')
    const out = normalizeCatalog([{ code: 'TRENDYOL', capabilities: {}, brandMapping: 'id' }, { code: 'x', capabilities: {}, brandMapping: 'evil' }])!
    expect(out.map((e) => e.brandMapping)).toEqual(['id', undefined])
  })
})

describe('kategori kapsamı özellik/değer boyutu (P1-9) ve kopya kaynakları', () => {
  it('stale ya da değersiz zorunlu özellik → partial; kategori eşli olmayan kanal partial sayılmaz', async () => {
    const { buildCategoryTree, indexCategoryMappings, indexAttributeIssues, computeCoverage } = await import('@/composables/categoryTree')
    const tree = buildCategoryTree([{ _id: 'root', title: 'Ana', isMain: true, children: [{ _id: 'c1', title: 'Elbise', parentId: 'root', children: [] }, { _id: 'c2', title: 'Etek', parentId: 'root', children: [] }] }])
    const docs = [
      { integrationCode: 'trendyol', localCategoryId: 'c1', isCategoryMapping: true, platformAttributeId: null, platformCategoryId: 1 },
      { integrationCode: 'trendyol', localCategoryId: 'c1', platformAttributeId: '47', isRequired: true, values: [] },
      { integrationCode: 'trendyol', localCategoryId: 'c2', isCategoryMapping: true, platformAttributeId: null, platformCategoryId: 2 },
      { integrationCode: 'trendyol', localCategoryId: 'c2', platformAttributeId: '48', isRequired: true, allowCustom: true, values: [] },
      { integrationCode: 'n11', localCategoryId: 'c2', platformAttributeId: '9', stale: { reason: 'ATTRIBUTE_GONE' } },
    ]
    const cov = computeCoverage(tree, ['trendyol', 'n11'], indexCategoryMappings(docs), indexAttributeIssues(docs))
    expect(cov.get('c1')).toMatchObject({ mapped: ['trendyol'], partial: ['trendyol'], missing: ['n11'] })
    expect(cov.get('c2')).toMatchObject({ mapped: ['trendyol'], partial: [] })
  })
  it('copySourcesFor: bu kanalda eşli üst → kardeş → diğer; kendisi hariç', async () => {
    const { buildCategoryTree, indexCategoryMappings, copySourcesFor } = await import('@/composables/categoryTree')
    const tree = buildCategoryTree([{ _id: 'root', title: 'Ana', isMain: true, children: [
      { _id: 'p', title: 'Giyim', parentId: 'root', children: [{ _id: 'a', title: 'Elbise', parentId: 'p', children: [] }, { _id: 'b', title: 'Etek', parentId: 'p', children: [] }] },
      { _id: 'z', title: 'Ayakkabı', parentId: 'root', children: [] }] }])
    const idx = indexCategoryMappings(['p', 'b', 'z', 'a'].map((id) => ({ integrationCode: 'trendyol', localCategoryId: id, isCategoryMapping: true, platformCategoryId: 1 })))
    const node = tree.byId.get('a')!
    expect(copySourcesFor(tree, node, 'trendyol', idx).map((s) => [s.id, s.relation])).toEqual([['p', 'parent'], ['b', 'sibling'], ['z', 'other']])
    expect(copySourcesFor(tree, node, 'n11', idx)).toEqual([])
  })
})
