// fe-r3d — P12 (K49): e-fatura sağlayıcılarının kısa/uzun adı tek kayıttan (baş harf türetmesi "TE/TE/E-/Gİ" veriyordu).
import { describe, expect, it } from 'vitest'
import { brandName, channelShort, einvoiceProviderCode } from '../packages/ui/src/tokens/channels'

describe('P12 — e-fatura sağlayıcı kısa adları', () => {
  it('ad ile (canlı olmayan rayda kod verilmez) benzersiz kısa ad', () => {
    const shorts = ['Trendyol e-Faturam', 'Turkcell e-Şirket', 'e-Logo', 'Gelir İdaresi (GİB)'].map((n) => channelShort(undefined, n))
    expect(shorts).toEqual(['TEF', 'TCL', 'ELG', 'GİB'])
    expect(new Set(shorts).size).toBe(4)
  })
  it('kod ile de çözülür; uzun ad kayıttan', () => {
    expect(einvoiceProviderCode('elogo')).toBe('elogo')
    expect(channelShort('geliridaresi')).toBe('GİB')
    expect(brandName('turkcellesirket')).toBe('Turkcell e-Şirket')
  })
  it('kanal ve kargo kısa adları etkilenmez', () => {
    expect(channelShort('trendyol')).toBe('TY')
    expect(channelShort(undefined, 'Yurtiçi Kargo')).toBe('YK')
  })
})
