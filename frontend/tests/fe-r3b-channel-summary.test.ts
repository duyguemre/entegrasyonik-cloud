// FR3 madde 11 — ürün listesi kanal hücresinin "bir bakış" cümlesi (en kritik durum önce).
import { describe, expect, it } from 'vitest'
import { channelStatusSummary, productChannelStatus } from '@/components/productDefinitions/products/channelStatus'

const up = (status: string, onSale?: boolean) => ({ upload: { TRANSFER: { status }, ...(onSale === undefined ? {} : { onSale }) } })
const list = (platforms: Record<string, any>, uploads: Record<string, any> = {}, codes = ['trendyol', 'hepsiburada', 'ideasoft']) =>
  codes.map((c) => productChannelStatus({ variants: [{ platforms }], platformUploads: uploads }, c))

describe('channelStatusSummary', () => {
  it('hata en önce, kalanlar ayrıntıda', () => {
    expect(channelStatusSummary(list({ trendyol: up('COMPLETED', true), hepsiburada: up('FAILED') }))).toEqual({
      tone: 'danger', icon: 'mdi-alert-circle-outline', text: '1 kanalda hata', detail: '1 yayında',
    })
  })
  it('bekleyen > yayında', () => {
    expect(channelStatusSummary(list({ trendyol: up('SENT'), hepsiburada: up('COMPLETED', true) }))).toMatchObject({ tone: 'info', text: '1 kanalda onay bekliyor', detail: '1 yayında' })
  })
  it('tüm kanallarda yayında', () => {
    expect(channelStatusSummary(list({ trendyol: up('COMPLETED', true) }, {}, ['trendyol'])).text).toBe('Tüm kanallarda yayında')
    expect(channelStatusSummary(list({ trendyol: up('COMPLETED', true) })).text).toBe('1 kanalda yayında')
  })
  it('yalnız satışa kapalı', () => {
    expect(channelStatusSummary(list({ trendyol: up('COMPLETED', false) }))).toMatchObject({ tone: 'warning', text: '1 kanalda satışa kapalı' })
  })
  it('hiç gönderilmemiş: hazır işaretliyse aksiyon, değilse nötr', () => {
    expect(channelStatusSummary(list({}, { hepsiburada: { isReady: true } }))).toMatchObject({ tone: 'action', text: 'Gönderime hazır', detail: '1 kanal işaretli' })
    expect(channelStatusSummary(list({}))).toMatchObject({ tone: 'neutral', text: 'Henüz gönderilmedi' })
  })
  it('bağlı kanal yok', () => {
    expect(channelStatusSummary([]).text).toBe('Kanal bağlı değil')
  })
})
