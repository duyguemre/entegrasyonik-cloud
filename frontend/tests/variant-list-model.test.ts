// A11 — ürün listesi satır altı varyant gösterimi: saf mantık (kanal durumu + kısa neden, stok tonu, gruplama, özet).
import { describe, it, expect } from 'vitest'
import {
  channelState, channelReason, stockTone, LOW_STOCK_THRESHOLD, isGroupable, rowChoices, slicerChoice, summarizeVariants,
} from '@/components/productDefinitions/variants/variantListModel'

const v = (o: Record<string, any> = {}) => ({ stock: 10, choices: [{ choiceId: 'renk', choiceValueId: 'siyah', slicer: true }, { choiceId: 'beden', choiceValueId: 'm' }], platforms: {}, ...o })

describe('channelState', () => {
  it('COMPLETED → yayında (success); yalnız onSale:false satışa kapalı (warning) — ayrıntı kartıyla aynı kural', () => {
    expect(channelState(v({ platforms: { ty: { upload: { TRANSFER: { status: 'COMPLETED' }, onSale: true } } } }), 'ty')).toMatchObject({ key: 'live', tone: 'success' })
    expect(channelState(v({ platforms: { ty: { upload: { TRANSFER: { status: 'COMPLETED' } } } } }), 'ty')).toMatchObject({ key: 'live' })
    expect(channelState(v({ platforms: { ty: { upload: { TRANSFER: { status: 'COMPLETED' }, onSale: false } } } }), 'ty')).toMatchObject({ key: 'offsale', tone: 'warning' })
  })
  it('FAILED → reddedildi + ilk iletiden kısa neden', () => {
    const s = channelState(v({ platforms: { hb: { upload: { TRANSFER: { status: 'FAILED', messages: ['Kategori eksik\nayrıntı'] } } } } }), 'hb')
    expect(s).toMatchObject({ key: 'failed', tone: 'danger', label: 'Reddedildi', reason: 'Kategori eksik' })
  })
  it('SENT/WAITING → bekliyor; PENDING → hazırlanıyor; veri yok → gönderilmedi (nötr, neden yok)', () => {
    expect(channelState(v({ platforms: { a: { upload: { TRANSFER: { status: 'SENT' } } } } }), 'a').key).toBe('waiting')
    expect(channelState(v({ platforms: { a: { upload: { TRANSFER: { status: 'WAITING' } } } } }), 'a').key).toBe('waiting')
    expect(channelState(v({ platforms: { a: { upload: { TRANSFER: { status: 'PENDING' } } } } }), 'a').key).toBe('preparing')
    const none = channelState(v(), 'a')
    expect(none).toMatchObject({ key: 'none', tone: 'neutral' })
    expect(none.reason).toBeUndefined()
  })
  it('uzun neden 140 karaktere kısaltılır; statusMessages yedek kaynaktır', () => {
    expect(channelReason({ upload: { TRANSFER: { messages: ['x'.repeat(300)] } } })!.length).toBe(140)
    expect(channelReason({ upload: { statusMessages: ['Satışa kapalı: fiyat onayı'] } })).toBe('Satışa kapalı: fiyat onayı')
    expect(channelReason({ upload: {} })).toBeUndefined()
  })
})

describe('stockTone', () => {
  it('0/boş → tükendi, eşik ve altı → az, üstü → normal', () => {
    expect(stockTone(0)).toBe('out')
    expect(stockTone(undefined)).toBe('out')
    expect(stockTone(LOW_STOCK_THRESHOLD)).toBe('low')
    expect(stockTone(1)).toBe('low')
    expect(stockTone(LOW_STOCK_THRESHOLD + 1)).toBe('ok')
  })
})

describe('gruplama ve seçenekler', () => {
  // B1: A11'deki `groupVariants` (listeye özgü gruplama) kaldırıldı — gruplama/rowspan artık ürün güncelle ızgarasıyla ortak
  // (`useVariantGrouping` + `variantSheet.groupRows`, bkz. tests/b1-variant-grouping.test.ts). Burada yalnız "gruplanabilir mi" kuralı.
  it('gruplanabilir: varyantlı + ikinci seçenek var + ayırıcı değerleri tekil değil', () => {
    const beyaz = { choices: [{ choiceId: 'renk', choiceValueId: 'beyaz', slicer: true }, { choiceId: 'beden', choiceValueId: 'm' }] }
    expect(isGroupable([v(), v(), v(beyaz)], true)).toBe(true)
    expect(isGroupable([v(), v(beyaz)], true)).toBe(false) // her grup tek varyant
    expect(isGroupable([v(), v()], false)).toBe(false) // varyantsız ürün
    expect(isGroupable([v({ choices: [{ choiceId: 'renk', choiceValueId: 'siyah' }] }), v({ choices: [{ choiceId: 'renk', choiceValueId: 'siyah' }] })], true)).toBe(false) // tek seçenek
  })
  it('ayırıcı yoksa ilk seçenek; gruplu satırda ayırıcı gösterilmez, tek seçenekse kendisi gösterilir', () => {
    expect(slicerChoice([{ choiceId: 'a', choiceValueId: '1' }])).toMatchObject({ choiceId: 'a' })
    expect(rowChoices(v().choices, true).map((c) => c.choiceId)).toEqual(['beden'])
    expect(rowChoices([{ choiceId: 'renk', choiceValueId: 'x', slicer: true }], true).map((c) => c.choiceId)).toEqual(['renk'])
    expect(rowChoices(v().choices, false)).toHaveLength(2)
  })
})

describe('summarizeVariants', () => {
  it('sayı, toplam stok, tükenen/az, kanal kapsamı ve hata toplamı', () => {
    const s = summarizeVariants([
      v({ stock: 12, platforms: { ty: { upload: { TRANSFER: { status: 'COMPLETED' }, onSale: true } }, hb: { upload: { TRANSFER: { status: 'FAILED' } } } } }),
      v({ stock: 2, platforms: { ty: { upload: { TRANSFER: { status: 'WAITING' } } } } }),
      v({ stock: 0 }),
    ], ['ty', 'hb'])
    expect(s).toMatchObject({ count: 3, totalStock: 14, outOfStock: 1, lowStock: 1, failedTotal: 1 })
    expect(s.channels[0]).toMatchObject({ code: 'ty', live: 1, waiting: 1, none: 1, sent: 2 })
    expect(s.channels[1]).toMatchObject({ code: 'hb', failed: 1, none: 2, sent: 1 })
  })
})
