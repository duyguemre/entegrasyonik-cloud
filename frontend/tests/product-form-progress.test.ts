// Ürün formu ilerleme/eksik-zorunlu hesabı (saf fonksiyonlar). Kaynak: useProductFormProgress.ts.
import { describe, it, expect } from 'vitest'
import {
  buildSummaryRows,
  evaluateProductForm,
  isTitleValid,
  resolveTargetStep,
  saveHint,
  stepAccess,
} from '@/composables/useProductFormProgress'

const variant = (o: Record<string, any> = {}) => ({
  stockcode: 'SK-1',
  barcode: '8690000000001',
  stock: 5,
  images: [],
  prices: { isPlatformBasedPrice: false, salePrice: 100, marketPrice: 120 },
  ...o,
})
const single = (o: Record<string, any> = {}) => ({
  category: 'c1',
  brand: 'b1',
  title: 'Ürün',
  hasVariant: false,
  images: [{ url: 'x' }],
  variants: [variant()],
  ...o,
})

describe('isTitleValid', () => {
  it('2–160 karakter (kırpılmış) kabul edilir', () => {
    expect(isTitleValid('ab')).toBe(true)
    expect(isTitleValid('a')).toBe(false)
    expect(isTitleValid('  a ')).toBe(false)
    expect(isTitleValid(undefined)).toBe(false)
    expect(isTitleValid('x'.repeat(160))).toBe(true)
    expect(isTitleValid('x'.repeat(161))).toBe(false)
  })
})

describe('stepAccess', () => {
  it('boş formda yalnız kategori adımı açık', () => {
    expect(stepAccess({ hasVariant: false, variants: [] })).toEqual([true, false, false, false])
  })
  it('kategori seçilince ürün tanımı açılır', () => {
    expect(stepAccess({ category: 'c1' })).toEqual([true, true, false, false])
  })
  it('tekil üründe başlık girilince varyant ve detay adımı açılır', () => {
    expect(stepAccess({ category: 'c1', title: 'Ürün', hasVariant: false })).toEqual([true, true, true, true])
  })
  it('varyantlı üründe varyant adımı ana kod ister, detay adımı istemez', () => {
    expect(stepAccess({ category: 'c1', title: 'Ürün', hasVariant: true })).toEqual([true, true, false, true])
    expect(stepAccess({ category: 'c1', title: 'Ürün', hasVariant: true, maincode: 'MC' })).toEqual([true, true, true, true])
  })
})

describe('evaluateProductForm — tekil ürün', () => {
  it('tam form: eksik yok, kaydedilebilir, tümü tamam', () => {
    const p = evaluateProductForm(single())
    expect(p.missing).toEqual([])
    expect(p.canSave).toBe(true)
    expect(p.requiredDone).toBe(p.requiredTotal)
    expect(p.requiredTotal).toBe(5) // kategori, marka, başlık, stok kodu, barkod
  })

  it('eski Kaydet koşuluyla uyumlu: kategori/marka/stok kodu/barkod eksikse kaydedilemez', () => {
    expect(evaluateProductForm(single({ category: undefined })).canSave).toBe(false)
    expect(evaluateProductForm(single({ brand: undefined })).canSave).toBe(false)
    expect(evaluateProductForm(single({ variants: [variant({ stockcode: '' })] })).canSave).toBe(false)
    expect(evaluateProductForm(single({ variants: [variant({ barcode: undefined })] })).canSave).toBe(false)
  })

  it('gizli zorunlu: geçersiz başlık kaydı engeller ve 2. adımda sayılır', () => {
    const p = evaluateProductForm(single({ title: 'a' }))
    expect(p.canSave).toBe(false)
    expect(p.missing.map((m) => m.key)).toEqual(['title'])
    expect(p.steps[1].missing).toBe(1)
  })

  it('adım başına eksik sayısı ve durumlar', () => {
    const p = evaluateProductForm(single({ category: undefined, brand: undefined, variants: [variant({ stockcode: '', barcode: '' })] }))
    expect(p.steps.map((s) => s.missing)).toEqual([1, 1, 2, 0])
    expect(p.steps[3].optional).toBe(true)
    expect(p.steps[3].complete).toBe(false)
    expect(p.steps[0].complete).toBe(false)
    expect(p.steps[1].locked).toBe(true)
    expect(p.steps[1].lockedReason).toMatch(/kategori/)
  })

  it('boşluk-yalnız kodlar eksik sayılır', () => {
    const p = evaluateProductForm(single({ variants: [variant({ stockcode: '   ', barcode: '  ' })] }))
    expect(p.missing.map((m) => m.key)).toEqual(['stockcode', 'barcode'])
  })
})

describe('evaluateProductForm — varyantlı ürün', () => {
  const multi = (o: Record<string, any> = {}) =>
    single({ hasVariant: true, maincode: 'MC-1', variants: [variant(), variant({ stockcode: 'SK-2', barcode: '8690000000002' })], ...o })

  it('tam form kaydedilebilir', () => {
    const p = evaluateProductForm(multi())
    expect(p.canSave).toBe(true)
    expect(p.requiredTotal).toBe(7) // kategori, marka, başlık, ana kod, varyant var, stok kodu, barkod
  })

  it('ana kod ve varyant yoksa iki ayrı eksik', () => {
    const p = evaluateProductForm(multi({ maincode: '', variants: [] }))
    expect(p.missing.map((m) => m.key)).toEqual(['maincode', 'variants'])
  })

  it('eksik kod sayısı varyant bazında raporlanır', () => {
    const p = evaluateProductForm(multi({ variants: [variant({ stockcode: '' }), variant({ stockcode: '', barcode: 'B2' }), variant({ stockcode: 'OK', barcode: 'B3' })] }))
    const stock = p.missing.find((m) => m.key === 'stockcode')!
    expect(stock.label).toBe('2 varyantta stok kodu eksik')
  })

  it('yinelenen stok kodu ve barkod engelleyicidir', () => {
    const p = evaluateProductForm(multi({ variants: [variant(), variant()] }))
    expect(p.missing.map((m) => m.key)).toEqual(['duplicateStockcode', 'duplicateBarcode'])
    expect(p.canSave).toBe(false)
  })

  it('boş kodlar yinelenen sayılmaz', () => {
    const p = evaluateProductForm(multi({ variants: [variant({ stockcode: '' }), variant({ stockcode: '', barcode: 'B2' })] }))
    expect(p.missing.some((m) => m.key === 'duplicateStockcode')).toBe(false)
  })
})

describe('uyarılar (engellemez)', () => {
  it('satış fiyatı 0 ve satış > piyasa uyarı üretir, kaydı engellemez', () => {
    const zero = evaluateProductForm(single({ variants: [variant({ prices: { isPlatformBasedPrice: false, salePrice: 0, marketPrice: 100 } })] }))
    expect(zero.warnings.map((w) => w.key)).toEqual(['salePrice'])
    expect(zero.canSave).toBe(true)
    const inverted = evaluateProductForm(single({ variants: [variant({ prices: { isPlatformBasedPrice: false, salePrice: 150, marketPrice: 100 } })] }))
    expect(inverted.warnings.map((w) => w.key)).toEqual(['priceOrder'])
  })

  it('platform bazlı fiyatta ürün-düzeyi fiyat uyarısı verilmez', () => {
    const p = evaluateProductForm(single({ variants: [variant({ prices: { isPlatformBasedPrice: true, salePrice: 0, marketPrice: 0 } })] }))
    expect(p.warnings).toEqual([])
  })

  it('resim yoksa bilgi uyarısı; varyant resmi varsa yok', () => {
    expect(evaluateProductForm(single({ images: [] })).warnings.map((w) => w.key)).toEqual(['images'])
    expect(evaluateProductForm(single({ images: [], variants: [variant({ images: ['u'] })] })).warnings).toEqual([])
  })
})

describe('saveHint / resolveTargetStep / buildSummaryRows', () => {
  it('eksik varken ilk eksiği söyler', () => {
    const p = evaluateProductForm(single({ brand: undefined }))
    expect(saveHint(p, 'Kaydet')).toBe('Kaydet için 1 zorunlu bilgi eksik: marka seçin.')
  })
  it('çok eksikte sayıyı ve ilkini söyler', () => {
    const p = evaluateProductForm(single({ category: undefined, brand: undefined }))
    expect(saveHint(p, 'Güncelle')).toBe('Güncelle için 2 zorunlu bilgi eksik. İlki: kategori seçin.')
  })
  it('hazırken uyarı sayısını belirtir', () => {
    expect(saveHint(evaluateProductForm(single()), 'Kaydet')).toBe('Kaydet için hazır.')
    expect(saveHint(evaluateProductForm(single({ images: [] })), 'Kaydet')).toBe('Kaydet için hazır — 1 uyarı var, kaydı engellemez.')
  })
  it('kilitli adımdaki eksik, kilidi açacak ilk eksiğin adımına gider', () => {
    const p = evaluateProductForm(single({ category: undefined, variants: [variant({ stockcode: '' })] }))
    const stock = p.missing.find((m) => m.key === 'stockcode')!
    expect(p.steps[2].locked).toBe(false) // başlık geçerli, tekil ürün
    expect(resolveTargetStep(stock, p)).toBe(2)
    const p2 = evaluateProductForm(single({ title: '', variants: [variant({ stockcode: '' })] }))
    const stock2 = p2.missing.find((m) => m.key === 'stockcode')!
    expect(p2.steps[2].locked).toBe(true)
    expect(resolveTargetStep(stock2, p2)).toBe(1)
  })
  it('özet satırları yalnız formdaki değerleri içerir', () => {
    const rows = buildSummaryRows(single(), { category: 'Tişört', brand: 'Marka' })
    expect(rows.map((r) => r.label)).toEqual(['Ürün tipi', 'Kategori', 'Marka', 'Ürün başlığı', 'Stok kodu', 'Barkod', 'Toplam stok'])
    expect(rows.find((r) => r.label === 'Toplam stok')!.value).toBe('5')
    const multiRows = buildSummaryRows(single({ hasVariant: true, maincode: 'MC', variants: [variant(), variant()] }), {})
    expect(multiRows.find((r) => r.label === 'Varyant sayısı')!.value).toBe('2')
    expect(multiRows.find((r) => r.label === 'Toplam stok')!.value).toBe('10')
  })
})
