// FR2 madde 21 — ürün listesinde kanal başına durum (yayında / hatalı / bekliyor / kapalı / yok) + yükleme listesi bayrağı.
import { describe, expect, it } from 'vitest'
import { channelStatusOverview, channelStatusText, productChannelStatus } from '@/components/productDefinitions/products/channelStatus'

const up = (status: string, onSale?: boolean) => ({ upload: { TRANSFER: { status }, ...(onSale === undefined ? {} : { onSale }) } })

describe('productChannelStatus', () => {
  it('varyantsız ürün: tek varyantın durumu', () => {
    const p = { variants: [{ platforms: { trendyol: up('COMPLETED', true) } }] }
    expect(productChannelStatus(p, 'trendyol')).toMatchObject({ key: 'live', tone: 'success', counts: { live: 1, total: 1 }, ready: false })
    expect(productChannelStatus(p, 'hepsiburada')).toMatchObject({ key: 'none', tone: 'neutral' })
  })

  it('öncelik: hatalı > bekliyor > yayında > kapalı > yok', () => {
    const v = (s: any) => ({ platforms: { trendyol: s } })
    const pick = (...st: any[]) => productChannelStatus({ variants: st.map(v) }, 'trendyol').key
    expect(pick(up('COMPLETED', true), up('FAILED'), up('WAITING'))).toBe('failed')
    expect(pick(up('COMPLETED', true), up('SENT'))).toBe('waiting')
    expect(pick(up('COMPLETED', true), up('PENDING'))).toBe('waiting') // hazırlanıyor = süreç sürüyor
    expect(pick(up('COMPLETED', false), up('COMPLETED', true))).toBe('live')
    expect(pick(up('COMPLETED', false), {})).toBe('offsale')
    expect(pick({}, {})).toBe('none')
  })

  it('sayımlar ve ilk neden', () => {
    const p = {
      variants: [
        { platforms: { hepsiburada: { upload: { TRANSFER: { status: 'FAILED', messages: ['Kategori özelliği eksik\nayrıntı'] } } } } },
        { platforms: { hepsiburada: up('COMPLETED', true) } },
        {},
      ],
    }
    const s = productChannelStatus(p, 'hepsiburada')
    expect(s.counts).toEqual({ live: 1, offsale: 0, failed: 1, waiting: 0, none: 1, total: 3 })
    expect(s.reason).toBe('Kategori özelliği eksik')
    expect(channelStatusText(s, 'Hepsiburada')).toBe('Hepsiburada: 1 varyant hatalı · 1/3 yayında')
  })

  it('yükleme listesi bayrağı ve eski isUploaded geri uyumu', () => {
    const p = { variants: [{}], platformUploads: { n11: { isReady: true }, pazarama: { isUploaded: true } } }
    const n11 = productChannelStatus(p, 'n11')
    expect(n11).toMatchObject({ key: 'none', ready: true })
    expect(channelStatusText(n11, 'N11')).toBe('N11: Gönderilmedi · yükleme listesinde')
    expect(productChannelStatus(p, 'pazarama').key).toBe('live')
  })

  it('varyant verisi hiç yoksa (boş dizi) tek "yok" satırı', () => {
    expect(productChannelStatus({ variants: [] }, 'trendyol')).toMatchObject({ key: 'none', counts: { total: 1 } })
    expect(productChannelStatus(undefined, 'trendyol').key).toBe('none')
  })

  it('özet: kanal sayıları', () => {
    const p = { variants: [{ platforms: { trendyol: up('COMPLETED', true), hepsiburada: up('FAILED') } }] }
    const list = ['trendyol', 'hepsiburada', 'n11'].map((c) => productChannelStatus(p, c))
    expect(channelStatusOverview(list)).toEqual({ live: 1, failed: 1, waiting: 0, none: 1 })
    expect(channelStatusText(list[0], 'Trendyol')).toBe('Trendyol: Yayında')
  })
})
