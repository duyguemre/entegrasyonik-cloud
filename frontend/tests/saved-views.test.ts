// C2.4 — kayıtlı görünümlerin saf kuralları: görünüme YALNIZ `pickUrlParams` alanları girer
// (serbest metin/PII ve kayıtsız alanlar süzülür), anahtar kimlik kapsamlıdır (e-posta değil).
import { describe, expect, it } from 'vitest'
import { expandViewParams, sameViewParams, sanitizeViewParams, savedViewsStorageKey } from '../src/composables/useSavedViews'

describe('sanitizeViewParams', () => {
  it('sipariş: yalnız durum + stok durumu; arama metni, kanal ve tarih saklanmaz', () => {
    const params = sanitizeViewParams('OrderListView', {
      globalSearch: 'Ayşe Yılmaz 0555 000 00 00',
      integrationCodes: ['trendyol'],
      startDate: '2026-09-01',
      internalStatuses: ['SHIPPED', 'APPROVED'],
      allocationStates: ['OVERSOLD'],
    })
    expect(params).toEqual({ internalStatuses: 'APPROVED,SHIPPED', allocationStates: 'OVERSOLD' })
  })

  it('kapalı kümedeki izinsiz değerler düşer; boş alanlar yazılmaz', () => {
    expect(sanitizeViewParams('OrderListView', { allocationStates: ['UYDURMA'], internalStatuses: [] })).toEqual({})
  })

  it('kayıtsız ekran → hiçbir şey saklanmaz', () => {
    expect(sanitizeViewParams('YokView', { internalStatuses: ['APPROVED'] })).toEqual({})
    expect(sanitizeViewParams('CustomerListView', { globalSearch: 'x' })).toEqual({})
  })
})

describe('expandViewParams / sameViewParams', () => {
  it('çoklu alanlar ekranın okuduğu dizi şekline açılır', () => {
    expect(expandViewParams('ClaimListView', { internalStatuses: 'A,B' })).toEqual({ internalStatuses: ['A', 'B'] })
  })

  it('karşılaştırma anahtar sırasından bağımsız', () => {
    expect(sameViewParams({ a: '1', b: '2' }, { b: '2', a: '1' })).toBe(true)
    expect(sameViewParams({ a: '1' }, { a: '1', b: '2' })).toBe(false)
  })
})

describe('savedViewsStorageKey', () => {
  it('kullanıcı + mağaza kapsamlı; mağaza yoksa default', () => {
    expect(savedViewsStorageKey('u1', 42)).toBe('ek.views.v1.u1.42')
    expect(savedViewsStorageKey('u1', 0)).toBe('ek.views.v1.u1.default')
  })

  it('kimliksiz oturumda anahtar yok (özellik gizlenir)', () => {
    expect(savedViewsStorageKey(undefined, 42)).toBeUndefined()
    expect(savedViewsStorageKey('', 42)).toBeUndefined()
  })
})
