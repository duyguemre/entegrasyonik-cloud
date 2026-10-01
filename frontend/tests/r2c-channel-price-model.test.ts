// FR2-PFORM 25 — kanal bazında fiyat saf mantığı (src/components/productDefinitions/variants/channelPriceModel.ts).
import { describe, expect, it } from 'vitest'
import { applyBulk, applyOp, bulkPreview, channelRows, discountPct, makeCustom, priceIssues, resetToBase } from '@/components/productDefinitions/variants/channelPriceModel'

const channels = [{ code: 'trendyol', title: 'Trendyol' }, { code: 'hepsiburada', title: 'Hepsiburada' }, { code: 'ideasoft', title: 'Ideasoft' }]
const variant = () => ({
  prices: { salePrice: 100, marketPrice: 150, isPlatformBasedPrice: true },
  platforms: { trendyol: { prices: { salePrice: 110, marketPrice: 150 }, attributes: { a: 1 } }, hepsiburada: { attributes: {} } },
})

describe('channelRows', () => {
  it('özel fiyatı olmayan kanal ana fiyatı kullanır (dönüştürücü: platforms[kod].prices || prices)', () => {
    const rows = channelRows(channels, variant())
    expect(rows.map((r) => [r.code, r.custom, r.sale, r.market])).toEqual([
      ['trendyol', true, 110, 150], ['hepsiburada', false, 100, 150], ['ideasoft', false, 100, 150],
    ])
  })
  it('ana fiyata göre fark ve indirim oranı', () => {
    const [ty] = channelRows(channels, variant())
    expect(ty.diff).toEqual({ abs: 10, pct: 10 })
    expect(ty.discountPct).toBeCloseTo(26.67, 2)
  })
})

describe('kurallar', () => {
  it('satış 0 → hata; satış > piyasa → uyarı', () => {
    expect(priceIssues(0, 10).map((i) => i.level)).toEqual(['error'])
    expect(priceIssues(20, 10)[0]).toMatchObject({ level: 'warning' })
    expect(priceIssues(10, 20)).toEqual([])
  })
  it('indirim hesaplanamazsa null', () => {
    expect(discountPct(20, 10)).toBeNull()
    expect(discountPct(10, 0)).toBeNull()
  })
})

describe('özel fiyat aç / ana fiyata dön', () => {
  it('makeCustom ana fiyattan kopyalar, resetToBase yalnız fiyatı siler (özellikler korunur)', () => {
    const v: any = variant()
    makeCustom(v, 'ideasoft')
    expect(v.platforms.ideasoft.prices).toEqual({ salePrice: 100, marketPrice: 150 })
    resetToBase(v, 'trendyol')
    expect(v.platforms.trendyol).toEqual({ attributes: { a: 1 } })
  })
})

describe('toplu değişiklik', () => {
  it('işlemler iki haneye yuvarlar ve 0 altına inmez', () => {
    expect(applyOp(100, 'pctUp', 5)).toBe(105)
    expect(applyOp(99.99, 'pctDown', 10)).toBe(89.99)
    expect(applyOp(10, 'sub', 50)).toBe(0)
    expect(applyOp(10, 'set', 12.345)).toBe(12.35)
  })
  it('ana fiyatlı kanal önce özel fiyata geçer, sonra değişir', () => {
    const v: any = variant()
    const res = applyBulk(v, ['trendyol', 'hepsiburada'], 'salePrice', 'pctUp', 10)
    expect(res).toEqual({ changed: 2, converted: 1 })
    expect(v.platforms.trendyol.prices.salePrice).toBe(121)
    expect(v.platforms.hepsiburada.prices).toEqual({ salePrice: 110, marketPrice: 150 })
    expect(v.prices.salePrice).toBe(100)
  })
  it('önizleme metni örnekli ve dönüşümü söyler', () => {
    const rows = channelRows(channels, variant())
    expect(bulkPreview(rows, 'salePrice', 'pctUp', 10)).toMatch(/^3 kanalda satış fiyatı %10 artar \(ör\. Trendyol: .*110,00 → .*121,00\)\. 2 kanal ana fiyattan özel fiyata geçer\.$/)
    expect(bulkPreview(rows, 'salePrice', 'set', null)).toBe('Bir değer girin.')
  })
})
