// C2b (ADR-0029 Karar 4-5, plan §2.3) — bildirim tercihleri modeli: varsayılanlar, savunmacı okuma, kilitli
// kategorilerin kayıt gövdesinden çıkarılması, doğrulama.
import { describe, expect, it } from 'vitest'
import { FALLBACK_CATALOG, buildCategories } from '@/stores/notificationCatalog'
import {
  defaultPreferences,
  normalizePreferences,
  preferencesBody,
  samePreferences,
  usesDigest,
  validatePreferences,
} from '@/stores/notificationPreferences'

const cats = buildCategories(FALLBACK_CATALOG)

describe('defaultPreferences', () => {
  it('plan §2.3 matrisi + günlük 09:00 özet + sessiz saat kapalı + tr', () => {
    const p = defaultPreferences(cats)
    expect(p.categories.order).toEqual({ inApp: true, email: 'dig' })
    expect(p.categories.catalog).toEqual({ inApp: true, email: 'off' })
    expect(p.categories.security).toEqual({ inApp: true, email: 'inst' })
    expect(p.digest).toEqual({ frequency: 'daily', hour: 9 })
    expect(p.quietHours.enabled).toBe(false)
    expect(p.locale).toBe('tr')
  })
})

describe('normalizePreferences', () => {
  it('sunucu değerleri varsayılanın üstüne; geçersiz değerler yok sayılır', () => {
    const p = normalizePreferences(
      {
        result: true,
        data: {
          categories: { order: { inApp: false, email: 'off' }, catalog: { email: 'weekly' }, finance: 'x' },
          digest: { frequency: 'hourly', hour: 42 },
          quietHours: { enabled: true, start: '23:30', end: '7:00' },
          locale: 'en',
        },
      },
      cats,
    )
    expect(p.categories.order).toEqual({ inApp: false, email: 'off' })
    expect(p.categories.catalog).toEqual({ inApp: true, email: 'off' })
    expect(p.categories.finance).toEqual({ inApp: true, email: 'dig' })
    expect(p.digest).toEqual({ frequency: 'hourly', hour: 9 })
    expect(p.quietHours).toEqual({ enabled: true, start: '23:30', end: '08:00' })
    expect(p.locale).toBe('en')
  })

  it('kilitli (tümü zorunlu) kategori sunucu kapalı dese de açık kalır', () => {
    const p = normalizePreferences({ data: { categories: { billing: { inApp: false, email: 'off' } } } }, cats)
    expect(p.categories.billing).toEqual({ inApp: true, email: 'inst' })
  })

  it('boş/bozuk yanıt → varsayılan', () => {
    expect(normalizePreferences(undefined, cats)).toEqual(defaultPreferences(cats))
    expect(normalizePreferences({ data: 'x' }, cats)).toEqual(defaultPreferences(cats))
  })
})

describe('preferencesBody', () => {
  it('kilitli kategoriler gönderilmez; kısmen zorunlu (stok) gönderilir', () => {
    const body = preferencesBody(defaultPreferences(cats), cats)
    expect(Object.keys(body.categories)).toEqual(['order', 'stock', 'integration', 'catalog', 'finance', 'system'])
    expect(body).toMatchObject({ digest: { frequency: 'daily', hour: 9 }, quietHours: { enabled: false }, locale: 'tr' })
  })

  it('samePreferences: değişiklik algılanır', () => {
    const a = defaultPreferences(cats)
    const b = defaultPreferences(cats)
    expect(samePreferences(a, b)).toBe(true)
    b.categories.order.email = 'inst'
    expect(samePreferences(a, b)).toBe(false)
  })
})

describe('doğrulama ve özet', () => {
  it('sessiz saat: açıkken başlangıç = bitiş reddedilir', () => {
    const p = defaultPreferences(cats)
    expect(validatePreferences(p)).toBeNull()
    p.quietHours = { enabled: true, start: '22:00', end: '22:00' }
    expect(validatePreferences(p)).toMatch(/aynı olamaz/)
  })
  it('usesDigest: özet seçili kategori yoksa false', () => {
    const p = defaultPreferences(cats)
    expect(usesDigest(p)).toBe(true)
    for (const k of Object.keys(p.categories) as Array<keyof typeof p.categories>) p.categories[k].email = 'off'
    expect(usesDigest(p)).toBe(false)
  })
})
