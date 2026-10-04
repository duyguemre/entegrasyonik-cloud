// [eslesme-fiyat WP5] FE fiyat modeli backend `effectiveChannelPrice` ile aynı sırada: kanal özel fiyatı (yalnız bayrakla) → kural fiyatı →
// ana fiyat; bekleyen (kanala gönderilmedi) ve dış fiyat farkı; kanal kuralı formu (K4 boş başlar, K9 liste keep|same).
import { describe, expect, it } from 'vitest'
import { applyBulk, channelRows, isCustom, makeCustom } from '@/components/productDefinitions/variants/channelPriceModel'
import { CHANNEL_BLOCK_TEXT, channelFormFromRule, channelFormMissing, channelRuleRequest, emptyChannelForm } from '@/composables/useChannelRulesApi'

const channels = [{ code: 'trendyol', title: 'Trendyol' }, { code: 'n11', title: 'N11' }, { code: 'hepsiburada', title: 'HB' }]
const v = (o: any = {}) => ({ prices: { salePrice: 100, marketPrice: 150, isPlatformBasedPrice: false }, platforms: {}, ...o })

describe('channelRows — kaynak sırası', () => {
  it('bayrak kapalıyken eski kanal nesnesi ana fiyatla gösterilir (kanala gitmez)', () => {
    const rows = channelRows(channels, v({ platforms: { trendyol: { prices: { salePrice: 90, marketPrice: 95 } } } }))
    expect(rows[0]).toMatchObject({ code: 'trendyol', custom: false, source: 'base', sale: 100, market: 150 })
    expect(isCustom(v({ platforms: { trendyol: { prices: { salePrice: 90 } } } }), 'trendyol')).toBe(false)
  })
  it('kural fiyatı (gerekçeli), özel fiyat kuralı ezer; bekleyen ve fark bilgisi', () => {
    const variant = v({
      prices: { salePrice: 100, marketPrice: 150, isPlatformBasedPrice: true },
      platforms: {
        trendyol: { prices: { salePrice: 90, marketPrice: 95 }, rulePrice: { salePrice: 120 } },
        n11: { rulePrice: { salePrice: 110.5, marketPrice: 140, reasons: ['ana fiyat 100,00 +%10'] }, observed: { drift: true, salePrice: 99, expectedSalePrice: 110.5 } },
      },
      pricePending: { n11: { reason: 'rule_channel' } },
    })
    const [ty, n11, hb] = channelRows(channels, variant)
    expect(ty).toMatchObject({ source: 'channel', custom: true, sale: 90, pending: false, drift: null })
    expect(n11).toMatchObject({ source: 'rule', custom: false, sale: 110.5, market: 140, ruleReasons: ['ana fiyat 100,00 +%10'], pending: true, drift: { observed: 99, expected: 110.5 } })
    expect(n11.diff).toEqual({ abs: 10.5, pct: 10.5 })
    expect(hb).toMatchObject({ source: 'base', sale: 100, diff: null })
  })
})

describe('makeCustom / applyBulk — bayrak', () => {
  it('özel fiyat açılınca bayrak açılır, diğer kanallardaki etkisiz eski nesneler kaldırılır (canlanmasın)', () => {
    const variant: any = v({ platforms: { trendyol: {}, n11: { prices: { salePrice: 1 }, attributes: { a: 1 } } } })
    makeCustom(variant, 'trendyol')
    expect(variant.prices.isPlatformBasedPrice).toBe(true)
    expect(variant.platforms.trendyol.prices).toEqual({ salePrice: 100, marketPrice: 150 })
    expect(variant.platforms.n11).toEqual({ attributes: { a: 1 } })
    expect(channelRows(channels, variant)[1]).toMatchObject({ source: 'base', sale: 100 })
  })
  it('toplu değişiklik bayrak kapalı kanalları özel fiyata çevirir', () => {
    const variant: any = v({ platforms: { trendyol: { prices: { salePrice: 50 } } } })
    const r = applyBulk(variant, ['trendyol'], 'salePrice', 'pctUp', 10)
    expect(r).toEqual({ changed: 1, converted: 1 })
    expect(variant.platforms.trendyol.prices.salePrice).toBe(110)
  })
})

describe('kanal kuralı formu', () => {
  it('K4: boş başlar; eksik alanlar; istek gövdesi tabana göre alanları süzer', () => {
    const f = emptyChannelForm()
    expect([f.marginPercent, f.cargoCost, f.roundingStep, f.integrationCode]).toEqual(['', '', '', ''])
    expect(channelFormMissing(f)).toEqual(['name', 'integrationCode', 'marginPercent', 'cargoCost', 'roundingStep'])
    Object.assign(f, { name: 'TY maliyet', integrationCode: 'trendyol', marginPercent: '12,5', cargoCost: '20', roundingStep: '1', psychological: true, barcodes: 'A1, A2' })
    expect(channelFormMissing(f)).toEqual([])
    const req = channelRuleRequest(f)
    expect(req).toMatchObject({ type: 'channel', integrationCode: 'trendyol', scope: { barcodes: ['A1', 'A2'] } })
    expect(req.channel).toMatchObject({ base: 'cost', marginPercent: 12.5, adjustPercent: null, cargoCost: 20, rounding: { step: 1, direction: 'up', psychological: true }, listPrice: { strategy: 'keep' }, autoApply: false })
    expect(channelFormMissing({ ...f, base: 'salePrice' })).toEqual(['adjustPercent'])
    expect(channelFormMissing({ ...f, commissionSource: 'static' })).toEqual(['commissionRate'])
  })
  it('kayıtlı kuraldan form ve geri (gidiş-dönüş)', () => {
    const rule: any = { id: 'r1', type: 'channel', name: 'x', enabled: true, version: 2, integrationCode: 'n11', scope: { productIds: [], barcodes: [] }, updatedAt: null,
      channel: { base: 'salePrice', adjustPercent: 5, adjustAmount: null, commission: { source: 'auto' }, cargoCost: 0, rounding: { step: 0.01, direction: 'nearest', psychological: false }, floorMarginPercent: null, ceiling: 500, listPrice: { strategy: 'same' }, maxChangePercent: 20, autoApply: true } }
    const back = channelRuleRequest(channelFormFromRule(rule))
    expect(back).toMatchObject({ id: 'r1', channel: { base: 'salePrice', adjustPercent: 5, ceiling: 500, listPrice: { strategy: 'same' }, maxChangePercent: 20, autoApply: true } })
    expect(Object.keys(CHANNEL_BLOCK_TEXT)).toHaveLength(8)
  })
})
