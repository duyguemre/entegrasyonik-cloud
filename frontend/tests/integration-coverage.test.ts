// C1.2 — kanal kapsamı (getCatalog) ve webhook adresi saf yardımcıları.
// Katalog fixture'ı backend manifestolarının birebir kopyasıdır (e2e/fixtures/integrationCatalog.ts).
import { describe, expect, it } from 'vitest'
import {
  FALLBACK_LIVE_CODES, capabilityRows, levelCounts, liveCodesFor, normalizeCatalog, toCatalogCategory, userFacingNote,
} from '../src/components/integrations/integrationCatalog'
import { webhookOrigin, webhookPath, webhookUrl } from '../src/components/integrations/integrationWebhook'
import { integrationCatalogFixture } from '../e2e/fixtures/integrationCatalog'

const catalog = normalizeCatalog(integrationCatalogFixture())!
const byCode = (code: string) => catalog.find((e) => e.code === code)!

describe('normalizeCatalog', () => {
  it('dizi değilse null (hata ≠ boş)', () => {
    expect(normalizeCatalog({})).toBeNull()
    expect(normalizeCatalog(undefined)).toBeNull()
    expect(normalizeCatalog([])).toEqual([])
  })

  it('bilinmeyen düzey not_supported sayılır (fazla vaat yok); geçersiz kayıt atlanır', () => {
    const out = normalizeCatalog([
      { code: 'X', displayName: 'X', category: 'marketplace', status: 'available', capabilities: { orders: { level: 'full' } } },
      { code: 42 },
    ])!
    expect(out).toHaveLength(1)
    expect(out[0].code).toBe('x')
    expect(out[0].capabilities.orders.level).toBe('not_supported')
    expect(out[0].limitations).toEqual([])
  })
})

describe('liveCodesFor', () => {
  it('katalogdaki kodlar = canlı küme (6 adaptör, backend ile birebir)', () => {
    expect(liveCodesFor(catalog, 'marketplace')).toEqual(['trendyol', 'pazarama', 'n11', 'hepsiburada'])
    expect(liveCodesFor(catalog, 'ecommerce')).toEqual(['ideasoft'])
    expect(liveCodesFor(catalog, 'erp')).toEqual(['bizimhesap'])
    expect(liveCodesFor(catalog, 'shipment')).toEqual([])
    expect(liveCodesFor(catalog, 'einvoice')).toEqual([])
  })

  it('katalog yoksa yedek liste aynı 6 kod', () => {
    expect(liveCodesFor(null, 'marketplace')).toEqual(FALLBACK_LIVE_CODES.marketplace)
    expect(Object.values(FALLBACK_LIVE_CODES).flat().sort()).toEqual(catalog.map((e) => e.code).sort())
    expect(toCatalogCategory('shipment')).toBe('shipping')
  })
})

describe('capabilityRows', () => {
  it('sabit sıra; yazılmayan yetenek örtük (implicit) not_supported', () => {
    const hb = capabilityRows(byCode('hepsiburada'))
    expect(hb.map((r) => r.key)).toEqual(['products', 'stockPrice', 'orders', 'orderActions', 'returns', 'questions', 'finance', 'shippingNotice', 'invoiceNotice', 'categories'])
    expect(hb.find((r) => r.key === 'categories')).toEqual({ key: 'categories', level: 'not_supported', implicit: true })
    expect(levelCounts(hb.filter((r) => !r.implicit))).toEqual({ supported: 5, limited: 4, platform_auto: 0, not_supported: 0 })
  })

  it('Trendyol sipariş onayı kanal kendisi yapar; N11 onay/red açıkça desteklenmiyor', () => {
    expect(capabilityRows(byCode('trendyol')).find((r) => r.key === 'orderActions')?.level).toBe('platform_auto')
    const n11 = capabilityRows(byCode('n11')).find((r) => r.key === 'orderActions')!
    expect(n11.level).toBe('not_supported')
    expect(n11.implicit).toBe(false)
  })

  it('ERP kategorisi kendi anahtar kümesini kullanır', () => {
    expect(capabilityRows(byCode('bizimhesap')).map((r) => r.key)).toEqual(['products', 'stockPrice', 'orders', 'categories', 'accountingSync'])
  })
})

describe('userFacingNote', () => {
  it('iç başvuruları ayıklar, anlamı korur', () => {
    expect(userFacingNote(byCode('trendyol').capabilities.orderActions.note)).toBe('Trendyol siparişi kendisi onaylar.')
    expect(userFacingNote(byCode('trendyol').capabilities.stockPrice.note)).toBe('Stok/fiyat V1-V2 ortak uç; aynı gövde 15 dk içinde tekrarlanamaz.')
    expect(userFacingNote(byCode('trendyol').capabilities.invoiceNotice.note)).toBe('Fatura bağlantısı resmi şemayla iletilir.')
    expect(userFacingNote(byCode('n11').capabilities.orders.note)).toBe('Çekim tek sayfa ile sınırlıdır.')
    expect(userFacingNote(byCode('hepsiburada').capabilities.finance.note)).toContain('daima boş sonuç')
  })

  it('hiçbir notta geliştirici başvurusu kalmaz', () => {
    const texts = catalog.flatMap((e) => [...Object.values(e.capabilities).map((c) => c.note), ...e.limitations]).map((n) => userFacingNote(n))
    for (const text of texts) {
      expect(text).not.toMatch(/BACKLOG|INTEGRATIONS_REGISTRY|§|\.ts\b|`|NOT_SUPPORTED|approveOrder|streamProducts/)
    }
  })

  it('boş / tanımsız', () => {
    expect(userFacingNote(undefined)).toBe('')
    expect(userFacingNote('')).toBe('')
  })
})

describe('webhook adresi', () => {
  it('/api bağlamının DIŞINDA, API sunucusunun kökünde', () => {
    expect(webhookUrl('trendyol', 'abc', 'http://127.0.0.1:5001/api/')).toBe('http://127.0.0.1:5001/hooks/trendyol/abc')
    expect(webhookUrl('trendyol', 'abc', 'https://app.example.invalid/api/')).toBe('https://app.example.invalid/hooks/trendyol/abc')
  })

  it('göreli taban sayfa köküyle çözülür; yol bileşeni kodlanır', () => {
    expect(webhookOrigin('/api/', 'https://panel.example.invalid')).toBe('https://panel.example.invalid')
    expect(webhookPath('trendyol', 'a/b c')).toBe('/hooks/trendyol/a%2Fb%20c')
  })
})

// [eslesme-fiyat WP7b, F-11] Alıcısı olan kanallar ve kanal başına adres (HB: olay adını HB ekler; IS: HMAC imzalı).
describe('webhook kanalları (WP7b)', () => {
  it('trendyol, hepsiburada, ideasoft alıcısı var; n11 yok', async () => {
    const m = await import('@/components/integrations/integrationWebhook')
    expect([...m.WEBHOOK_CHANNELS]).toEqual(['trendyol', 'hepsiburada', 'ideasoft'])
    expect(m.isWebhookChannel('n11')).toBe(false)
    expect(m.webhookUrl('hepsiburada', 'abc', 'https://x.invalid/api/')).toBe('https://x.invalid/hooks/hepsiburada/abc')
    expect(m.webhookUrl('ideasoft', 'abc', 'https://x.invalid/api/')).toBe('https://x.invalid/hooks/ideasoft/abc')
    expect(m.WEBHOOK_CHANNEL_NAMES.hepsiburada).toBe('Hepsiburada')
  })
  it('webhook metinleri kanal adını parametre alır; kanal notları iki dilde var', async () => {
    const tr = (await import('@/plugins/locales/tr.json')).default as any
    const en = (await import('@/plugins/locales/en.json')).default as any
    for (const d of [tr, en]) {
      expect(JSON.stringify(d.integrationWebhook)).not.toContain('Trendyol')
      expect(d.integrationWebhook.confirmCreateText).toContain('{channel}')
      expect(typeof d.integrationWebhook.channelNote.hepsiburada).toBe('string')
      expect(typeof d.integrationWebhook.channelNote.ideasoft).toBe('string')
    }
  })
})
