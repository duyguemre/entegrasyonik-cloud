// DS-v2 Aşama 2 (diyalog/menü/form) — canlı entegrasyon ayar formlarının GÖNDERİLEN GÖVDE
// karakterizasyonu. Formlar `EkFormGrid` düzenine taşınırken (Trendyol'da iç içe giren/üst üste
// binen alanlar) davranışın değişmediğinin kanıtı: aynı etiketli alanlar doldurulup Kaydet'e
// basılınca `IntegrationService/save*Settings` gövdesi BİREBİR aynı kalır.
// Bu dosya göçten ÖNCE yazıldı ve eski düzende yeşildi; göçten SONRA da yeşil olmalıdır.
// Ek olarak: form ızgarası sözleşmesi (alanlar üst üste binmez) ve axe WCAG 2.1 AA = 0.
import { test, expect, type Page, type Locator } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, openScreen } from '../fixtures/nav'

const platformInfos = {
  shipments: [
    { id: 10, name: 'E2E Kargo A' },
    { id: 20, name: 'E2E Kargo B' },
  ],
  addresses: [
    { id: 501, title: 'E2E Depo' },
    { id: 502, title: 'E2E İade Deposu' },
  ],
}

interface FieldStep {
  kind: 'text' | 'select' | 'switch'
  label: string | RegExp
  value?: string
}

interface FormCase {
  name: string
  screen: 'MarketplaceView' | 'ECommerceView' | 'ErpView'
  container: string
  platformIndex: number
  saveEndpoint: string
  bodyKey: string
  tab1: FieldStep[]
  tab2Label: string
  tab2: FieldStep[]
  expectedSettings: Record<string, unknown>
}

const cases: FormCase[] = [
  {
    name: 'Trendyol',
    screen: 'MarketplaceView',
    container: '.marketplaceView',
    platformIndex: 0,
    saveEndpoint: 'IntegrationService/saveClientMarketplaceSettings',
    bodyKey: 'clientMarketplace',
    tab1: [
      { kind: 'text', label: 'Mağaza Adı', value: 'E2E Mağaza' },
      { kind: 'text', label: 'Satıcı Id', value: '248113' },
      { kind: 'text', label: 'API Key (Merchant ID)', value: 'key-1' },
      { kind: 'text', label: 'API Secret', value: 'secret-1' },
      { kind: 'switch', label: 'Entegrasyon Durumu' },
    ],
    tab2Label: 'Varsayılan Bilgiler',
    tab2: [
      { kind: 'select', label: 'Kargo Firması', value: 'E2E Kargo B' },
      { kind: 'text', label: /Kargo Süresi/, value: '4' },
      { kind: 'select', label: 'Sevkiyat Adresi', value: 'E2E Depo' },
      { kind: 'select', label: 'İade Adresi', value: 'E2E İade Deposu' },
      { kind: 'select', label: 'KDV Oranı', value: '20' },
      { kind: 'select', label: 'Özel Teslimat Seçeneği', value: 'Aynı Gün Teslimat' },
      { kind: 'text', label: /Maksimum Satılabilir Adet/, value: '12' },
      { kind: 'switch', label: 'Siparişler Otomatik İşleme Alınsın' },
      { kind: 'switch', label: 'Ortak Barcode Entegrasyonu' },
      { kind: 'text', label: 'Sabit Ürün Açıklaması', value: 'İade 14 gün' },
    ],
    expectedSettings: {
      note: 'e2e sentetik ayar',
      storename: 'E2E Mağaza',
      SELLERID: '248113',
      APIKEY: 'key-1',
      APISECRET: 'secret-1',
      status: true,
      shippingId: 20,
      shippingDuration: 4,
      shipmentAddressId: 501,
      returningAddressId: 502,
      taxPercentage: 20,
      fastDeliveryType: 'SAME_DAY_SHIPPING',
      maxPurchaseQuantity: 12,
      autoProcessOrders: true,
      barcodeIntegration: true,
      constantProductDesc: 'İade 14 gün',
    },
  },
  {
    name: 'Hepsiburada',
    screen: 'MarketplaceView',
    container: '.marketplaceView',
    platformIndex: 1,
    saveEndpoint: 'IntegrationService/saveClientMarketplaceSettings',
    bodyKey: 'clientMarketplace',
    tab1: [
      { kind: 'text', label: 'Mağaza Adı', value: 'E2E HB' },
      { kind: 'text', label: 'Satıcı ID (Merchant ID)', value: 'm-77' },
      { kind: 'text', label: 'API Key (Merchant ID)', value: 'hb-key' },
      { kind: 'text', label: 'API Secret', value: 'hb-secret' },
      { kind: 'switch', label: 'Entegrasyon Durumu' },
    ],
    tab2Label: 'Varsayılan Bilgiler',
    tab2: [
      { kind: 'select', label: 'Kargo Firması', value: 'E2E Kargo A' },
      { kind: 'text', label: /Kargo Süresi/, value: '2' },
      { kind: 'text', label: 'Sevkiyat Adresi', value: 'Depo 1' },
      { kind: 'text', label: 'İade Adresi', value: 'Depo 2' },
      { kind: 'select', label: 'Varsayılan KDV Oranı', value: '10' },
      { kind: 'text', label: /Maksimum Satılabilir Adet/, value: '5' },
      { kind: 'switch', label: 'Siparişler Otomatik İşleme Alınsın' },
      { kind: 'text', label: 'Sabit Ürün Açıklaması', value: 'HB açıklama' },
    ],
    expectedSettings: {
      note: 'e2e sentetik ayar',
      storename: 'E2E HB',
      SELLERID: 'm-77',
      APIKEY: 'hb-key',
      APISECRET: 'hb-secret',
      status: true,
      shippingId: 10,
      shippingDuration: 2,
      shippingaddress: 'Depo 1',
      returnaddress: 'Depo 2',
      taxPercentage: 10,
      maxPurchaseQuantity: 5,
      autoProcessOrders: true,
      constantProductDesc: 'HB açıklama',
    },
  },
  {
    name: 'Ideasoft',
    screen: 'ECommerceView',
    container: '.ecommerceView',
    platformIndex: 0,
    saveEndpoint: 'IntegrationService/saveClientECommerceSettings',
    bodyKey: 'clientECommerce',
    tab1: [
      { kind: 'text', label: 'Mağaza Adı', value: 'E2E Ideasoft' },
      { kind: 'text', label: 'Client ID', value: 'cid-1' },
      { kind: 'text', label: 'Client Secret', value: 'csec-1' },
    ],
    tab2Label: 'Varsayılan Bilgiler',
    tab2: [
      { kind: 'select', label: 'KDV Oranı', value: '8' },
      { kind: 'text', label: 'Varsayılan Desi', value: '3' },
      { kind: 'text', label: 'Varsayılan Garanti', value: '24' },
      { kind: 'select', label: 'Ürünün Stok Tipi', value: 'Kilogram' },
      { kind: 'select', label: 'Hediye Durumu', value: 'Hediyeli' },
    ],
    expectedSettings: {
      note: 'e2e sentetik ayar',
      storeName: 'E2E Ideasoft',
      key: 'cid-1',
      secret: 'csec-1',
      taxPercentage: 8,
      desi: '3',
      warranty: '24',
      stockTypeLabel: 'kg',
      hasGift: 1,
    },
  },
  {
    name: 'Bizimhesap',
    screen: 'ErpView',
    container: '.erpView',
    platformIndex: 0,
    saveEndpoint: 'IntegrationService/saveClientErpSettings',
    bodyKey: 'clientErp',
    tab1: [
      { kind: 'text', label: 'Bizimhesap ID', value: 'bh-1' },
      { kind: 'text', label: 'Api Key', value: 'bh-key' },
      { kind: 'switch', label: 'Entegrasyon Durumu' },
    ],
    tab2Label: 'Kargo Bilgileri',
    tab2: [
      { kind: 'text', label: 'Varsayılan Desi', value: '2' },
      { kind: 'text', label: 'Varsayılan Ağırlık', value: '1.5' },
      { kind: 'text', label: 'Şube', value: 'Merkez' },
      { kind: 'text', label: 'Posta Çeki Hesap Numarası', value: '12345' },
      { kind: 'switch', label: 'Gelen sipariş barkodu otomatik oluşturulsun' },
      { kind: 'switch', label: 'Gelen sipariş otomatik kargoya gönderilsin' },
    ],
    expectedSettings: {
      note: 'e2e sentetik ayar',
      barcode: {},
      key: 'bh-1',
      secret: 'bh-key',
      status: true,
      desi: '2',
      weight: '1.5',
      branch: 'Merkez',
      cheque: '12345',
      isAutoBarcode: true,
      isAutoShipment: true,
    },
  },
]

async function fill(page: Page, scope: Locator, step: FieldStep) {
  if (step.kind === 'text') {
    await scope.getByLabel(step.label).first().fill(step.value ?? '')
  } else if (step.kind === 'switch') {
    await scope.getByLabel(step.label).first().check()
  } else {
    // v-select: alanı aç, açılan listeden seçeneği seç.
    await scope.locator('.v-select').filter({ hasText: step.label }).first().locator('.v-field').click()
    const option = page.locator('.v-overlay--active .v-list-item').filter({ hasText: new RegExp(`^\\s*${step.value}\\s*$`) })
    await option.first().click()
    await expect(page.locator('.v-overlay--active .v-list')).toHaveCount(0)
  }
}

async function openForm(page: Page, c: FormCase, captured: { body: any }) {
  await installApiMocks(page, {
    'IntegrationService/retrievePlatformInfos': platformInfos,
    [c.saveEndpoint]: async (route: any, headers: Record<string, string>) => {
      captured.body = route.request().postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({}) })
    },
  })
  await gotoAuthed(page)
  await openScreen(page, c.screen)
  const root = page.locator(c.container)
  if (c.platformIndex > 0) {
    await root.locator('.nav-item-wrapper').nth(c.platformIndex).click()
    await expect(root.locator('.nav-item-wrapper').nth(c.platformIndex)).toHaveClass(/is-selected/)
  }
  const first = c.tab1[0]
  await expect(root.getByLabel(first.label).first()).toBeVisible()
  return root
}

test.describe('DS-v2 A2 — entegrasyon ayar formları: gönderilen gövde (karakterizasyon)', () => {
  for (const c of cases) {
    test(`${c.name}: iki sekmedeki alanlar doldurulup Kaydet'e basılınca gövde değişmez`, async ({ page }) => {
      const captured: { body: any } = { body: null }
      const root = await openForm(page, c, captured)

      for (const step of c.tab1) await fill(page, root, step)
      await root.getByRole('tab', { name: c.tab2Label }).click()
      for (const step of c.tab2) await fill(page, root, step)

      await root.getByRole('button', { name: 'Kaydet' }).click()
      await expect.poll(() => captured.body).not.toBeNull()
      expect(captured.body[c.bodyKey]._id).toBe(`client-itg-${c.name.toLowerCase()}`)
      expect(captured.body[c.bodyKey].code).toBe(c.name.toLowerCase())
      expect(captured.body[c.bodyKey].settings).toEqual(c.expectedSettings)
    })
  }
})

test.describe('DS-v2 A2 — entegrasyon ayar formları: ızgara ve erişilebilirlik', () => {
  test('Trendyol: alanlar üst üste binmez / iç içe girmez (her iki sekme)', async ({ page }) => {
    const root = await openForm(page, cases[0], { body: null })
    const assertNoOverlap = async () => {
      const boxes = await root.locator('.v-input:visible').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect()
          return { x: r.x, y: r.y, w: r.width, h: r.height }
        }),
      )
      expect(boxes.length).toBeGreaterThan(3)
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]
          const b = boxes[j]
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
          const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
          // 1px'e kadar yuvarlama toleransı; daha fazlası üst üste binmedir.
          expect(overlapX > 1 && overlapY > 1, `alan ${i} ile ${j} üst üste biniyor`).toBe(false)
        }
      }
      // Dikeyde komşu iki alan arasında en az 8px boşluk (kenarlıklar birbirine yapışmaz).
      const sorted = [...boxes].sort((a, b) => a.y - b.y || a.x - b.x)
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]
        const cur = sorted[i]
        const sameColumn = Math.abs(prev.x - cur.x) < 2
        if (sameColumn && cur.y > prev.y) expect(cur.y - (prev.y + prev.h)).toBeGreaterThanOrEqual(8)
      }
    }
    await assertNoOverlap()
    await root.getByRole('tab', { name: 'Varsayılan Bilgiler' }).click()
    await expect(root.locator('.v-select').filter({ hasText: 'Kargo Firması' }).first()).toBeVisible()
    // sekme geçiş animasyonu (v-window) bitsin — iki sekmenin alanları aynı anda ölçülmesin
    await expect(root.locator('.v-window-item--active')).toHaveCount(1)
    await page.waitForTimeout(400)
    await assertNoOverlap()
  })

  test('Trendyol: axe WCAG 2.1 AA = 0 (form alanı)', async ({ page }) => {
    await openForm(page, cases[0], { body: null })
    const results = await new AxeBuilder({ page })
      .include('.ek-integration-frame')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })
})
