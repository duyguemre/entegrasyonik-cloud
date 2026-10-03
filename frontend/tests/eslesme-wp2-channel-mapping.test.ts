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
