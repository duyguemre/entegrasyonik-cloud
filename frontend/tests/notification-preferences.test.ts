// C2b (ADR-0029 Karar 4-5, plan §2.3) — bildirim tercihleri modeli: varsayılanlar, savunmacı okuma, kilitli
// kategorilerin kayıt gövdesinden çıkarılması, doğrulama. MOB-04: gerçek backend sözleşmesi (`matrix`, `instant/digest`,
// `digest.cadence/hourLocal`, `quietHours` null) + `push` sütunu.
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
    expect(p.categories.order).toEqual({ inApp: true, email: 'dig', push: true })
    expect(p.categories.catalog).toEqual({ inApp: true, email: 'off', push: false })
    expect(p.categories.security).toEqual({ inApp: true, email: 'inst', push: true })
    expect(p.digest).toEqual({ frequency: 'daily', hour: 9 })
    expect(p.quietHours.enabled).toBe(false)
    expect(p.locale).toBe('tr')
  })
})

describe('normalizePreferences', () => {
  it('eski biçim (categories/frequency/enabled) savunmacı okunur; geçersiz değerler yok sayılır', () => {
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
    expect(p.categories.order).toEqual({ inApp: false, email: 'off', push: true })
    expect(p.categories.catalog).toEqual({ inApp: true, email: 'off', push: false })
    expect(p.categories.finance).toEqual({ inApp: true, email: 'dig', push: false })
    expect(p.digest).toEqual({ frequency: 'hourly', hour: 9 })
    expect(p.quietHours).toEqual({ enabled: true, start: '23:30', end: '08:00' })
    expect(p.locale).toBe('en')
  })

  it('kilitli (tümü zorunlu) kategori sunucu kapalı dese de açık kalır; push ise kapatılabilir', () => {
    const p = normalizePreferences({ data: { matrix: { billing: { inApp: false, email: 'off', push: false } } } }, cats)
    expect(p.categories.billing).toEqual({ inApp: true, email: 'inst', push: false })
  })

  it('backend biçimi: matrix + instant/digest + cadence/hourLocal + quietHours; tenant varsayılanı ve kilit tablosu üst üste', () => {
    const p = normalizePreferences(
      {
        result: true,
        data: { locale: 'en', matrix: { order: { email: 'instant' }, system: { push: true } }, digest: { cadence: 'hourly', hourLocal: 7 }, quietHours: { start: '23:00', end: '07:30', tz: 'Europe/Istanbul' } },
        tenantDefaults: { matrix: { order: { inApp: false, email: 'digest' }, catalog: { email: 'digest' } }, digest: null, quietHours: null },
        locks: [{ category: 'finance', locked: false, catalogDefault: { inApp: true, email: 'digest', push: true } }],
      },
      cats,
    )
    expect(p.categories.order).toEqual({ inApp: false, email: 'inst', push: true })
    expect(p.categories.catalog.email).toBe('dig')
    expect(p.categories.system.push).toBe(true)
    expect(p.categories.finance.push).toBe(true)
    expect(p.digest).toEqual({ frequency: 'hourly', hour: 7 })
    expect(p.quietHours).toEqual({ enabled: true, start: '23:00', end: '07:30' })
    expect(p.locale).toBe('en')
    expect(normalizePreferences({ data: { quietHours: null } }, cats).quietHours.enabled).toBe(false)
  })

  it('boş/bozuk yanıt → varsayılan', () => {
    expect(normalizePreferences(undefined, cats)).toEqual(defaultPreferences(cats))
    expect(normalizePreferences({ data: 'x' }, cats)).toEqual(defaultPreferences(cats))
  })
})

describe('preferencesBody', () => {
  it('backend gövdesi: matrix (kilitli kategoride yalnız push), instant/digest, cadence/hourLocal, sessiz saat kapalı → null', () => {
    const prefs = defaultPreferences(cats)
    const body = preferencesBody(prefs, cats)
    expect(Object.keys(body)).toEqual(['matrix', 'digest', 'quietHours', 'locale'])
    expect(body.matrix.billing).toEqual({ push: true })
    expect(body.matrix.security).toEqual({ push: true })
    expect(body.matrix.order).toEqual({ inApp: true, email: 'digest', push: true })
    expect(body.matrix.catalog).toEqual({ inApp: true, email: 'off', push: false })
    expect(body).toMatchObject({ digest: { cadence: 'daily', hourLocal: 9 }, quietHours: null, locale: 'tr' })
    prefs.quietHours = { enabled: true, start: '22:00', end: '08:00' }
    prefs.categories.order.email = 'inst'
    const b2 = preferencesBody(prefs, cats)
    expect(b2.quietHours).toEqual({ start: '22:00', end: '08:00', tz: 'Europe/Istanbul' })
    expect(b2.matrix.order?.email).toBe('instant')
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
