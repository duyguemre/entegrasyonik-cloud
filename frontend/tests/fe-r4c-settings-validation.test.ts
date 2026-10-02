// FE R4 C1 (K61) — uygulama ayarları biçim doğrulaması: boş her zaman geçerli, yalnız biçim denetlenir.
import { describe, expect, it } from 'vitest'
import { isValidPhone, isValidTckn, validateSettings } from '@/components/settings/settingsValidation'

const base = () => ({
  storeName: 'Elif Ticaret',
  brandColor: '#10B981',
  logo: '',
  alertEmail: 'hata@example.com',
  supportPhone: '02120000000',
  timezone: 'Europe/London',
  workingDays: [1, 2, 3],
  mersisNo: '0123456789012345',
  ticaretSicilNo: 'TS-4455',
  shippingDuration: 4,
  desi: 2,
  warranty: 24,
  maxPurchaseQuantity: 50,
  taxPercentage: 20,
  invoice: { type: 1, firstname: 'Elif', lastname: 'Yıldız', tckn: '10000000146', phone: '05000000000', companyName: 'X', taxOffice: 'K', taxNumber: '1234567890', address: '', city: '', district: '' },
})

describe('validateSettings', () => {
  it('e2e karakterizasyon verisi (settings.spec) ve boş başlangıç nesnesi geçerlidir — kayıt akışı değişmez', () => {
    expect(validateSettings(base())).toEqual({})
    expect(validateSettings({ storeName: 'E2E Test Mağazası' })).toEqual({})
    expect(validateSettings({ desi: undefined, shippingDuration: undefined, logo: '', brandColor: '#4F46E5', alertEmail: '', supportPhone: '', workingDays: [1, 2, 3, 4, 5], mersisNo: '', invoice: { type: 0, tckn: '', phone: '' } })).toEqual({})
    expect(validateSettings(null)).toEqual({})
  })

  it('biçim hataları alan anahtarıyla, "ne oldu — ne yapmalı" mesajıyla döner', () => {
    const s = base()
    s.alertEmail = 'hata@'
    s.invoice.tckn = '12345678901'
    s.shippingDuration = -1 as any
    s.workingDays = []
    const errors = validateSettings(s)
    expect(Object.keys(errors).sort()).toEqual(['alertEmail', 'shippingDuration', 'tckn', 'workingDays'])
    for (const m of Object.values(errors)) expect(m).toMatch(/ — /)
  })

  it('kurumsal alanlar yalnız kurumsal fatura tipinde denetlenir', () => {
    const s = base()
    s.mersisNo = '123'
    s.invoice.taxNumber = 'abc'
    expect(Object.keys(validateSettings(s)).sort()).toEqual(['mersisNo', 'taxNumber'])
    s.invoice.type = 0
    expect(validateSettings(s)).toEqual({})
  })

  it('logo bağlantısı yalnız URL modunda denetlenir; sayılarda tam sayı ve üst sınır', () => {
    const s = base()
    s.logo = 'logo.png'
    expect(validateSettings(s)).toEqual({})
    expect(Object.keys(validateSettings(s, { useLogoUrl: true }))).toEqual(['logo'])
    s.logo = ''
    s.warranty = 2.5 as any
    s.maxPurchaseQuantity = '' as any
    s.desi = 1.5 as any
    expect(Object.keys(validateSettings(s))).toEqual(['warranty'])
  })

  it('TCKN denetim haneleri ve telefon uzunluğu', () => {
    expect(isValidTckn('10000000146')).toBe(true)
    expect(isValidTckn('10000000147')).toBe(false)
    expect(isValidTckn('01234567890')).toBe(false)
    expect(isValidPhone('+90 (212) 000 00 00')).toBe(true)
    expect(isValidPhone('0212')).toBe(false)
    expect(isValidPhone('0212-ABC-0000')).toBe(false)
  })
})
