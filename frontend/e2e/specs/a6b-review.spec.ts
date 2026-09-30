// DS-v2 Aşama 6b — uygulama geneli TUTARLILIK turu (12 standart) için ÖNCE/SONRA inceleme görüntüleri.
// İddia yok; günlük koşuda ATLANIR.
//   A6B_REVIEW=1 A6B_REVIEW_WIDTH=1440|390 A6B_REVIEW_OUT=docs/a6b-review/after \
//     npx playwright test e2e/specs/a6b-review.spec.ts --project=chromium-desktop --workers=2
// Dosya adı: `sNN-<konu>-<genişlik>.png` (NN = standart numarası). Saat sabit, veri sentetik fixture (PII yok).
import { test, type Page, type Route } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { buildClaim, buildOrder, ordersBosFixture } from '../fixtures/apiData'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.A6B_REVIEW === '1'
const WIDTH = Number(process.env.A6B_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.A6B_REVIEW_OUT || 'docs/a6b-review/after'
const ONLY = (process.env.A6B_REVIEW_ONLY || '').split(',').filter(Boolean)
const NOW = new Date('2026-09-29T11:00:00.000Z')
const file = (name: string) => `${OUT}/${name}-${WIDTH}.png`
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

// Zengin sipariş / iade (backend modelindeki alanlar; sentetik).
const RICH_ORDER = buildOrder({
  _id: 'a6b-order-1', orderNumber: 'E2E-200431', integrationCode: 'trendyol', internalStatus: 'SHIPPED',
  billingAddress: { firstName: 'Ayşe', lastName: 'Yılmaz', phone: '5550000000', email: 'ayse@entegrasyonik-e2e.invalid', addressLine1: 'Örnek Mah. Deneme Sk. No:1', city: 'İstanbul', state: 'Kadıköy', isCorporate: false },
  shippingAddress: { firstName: 'Ayşe', lastName: 'Yılmaz', addressLine1: 'Örnek Mah. Deneme Sk. No:1', city: 'İstanbul', state: 'Kadıköy' },
  items: [
    { externalLineItemId: 'l1', productName: 'Organik pamuk basic tişört — Siyah / M', sku: 'A6B-TSH-SYH-M', barcode: '8690000000301', quantity: 2, unitPrice: 349.9, totalPrice: 699.8, itemStatus: 'ACTIVE' },
    { externalLineItemId: 'l2', productName: 'Keten gömlek — Beyaz / L', sku: 'A6B-GML-BYZ-L', barcode: '8690000000410', quantity: 1, unitPrice: 529, totalPrice: 529, itemStatus: 'ACTIVE' },
  ],
  financials: { currencyCode: 'TRY', subTotal: 1228.8, totalDiscount: 50, totalTax: 204.8, shippingFee: 0, grandTotal: 1178.8 },
  invoice: { invoiceNumber: 'EKA2026000000431', invoiceMethod: 'E_ARCHIVE', invoicedAt: '2026-09-26T09:30:00.000Z' },
  fulfillment: [{ carrierName: 'Yurtiçi Kargo', trackingCode: 'YK-E2E-7781234', status: 'SHIPPED' }],
  flags: { isInvoiceGenerated: true },
  dates: { orderDate: '2026-09-25T08:15:00.000Z', approvedDate: '2026-09-25T09:02:00.000Z', invoiceDate: '2026-09-26T09:30:00.000Z', shippedDate: '2026-09-26T15:40:00.000Z', estimatedDeliveryDate: '2026-09-29T15:00:00.000Z' },
})
const RICH_CLAIM = buildClaim({
  _id: 'a6b-claim-1', externalClaimId: 'CLM-E2E-0431', externalOrderId: 'E2E-200431', internalStatus: 'UNDER_REVIEW',
  items: [{ productName: 'Organik pamuk basic tişört — Siyah / M', sku: 'A6B-TSH-SYH-M', barcode: '8690000000301', quantity: 1, unitPrice: 349.9, reason: 'Beden uymadı', description: 'Bir beden büyüğü ile değişim istiyorum.' }],
  totalRefundAmount: 349.9,
  fulfillment: { carrierName: 'Yurtiçi Kargo', trackingCode: 'YK-E2E-RET-0431' },
  history: [
    { status: 'WAITING', changedAt: '2026-09-27T10:00:00.000Z', description: 'İade talebi oluşturuldu' },
    { status: 'UNDER_REVIEW', changedAt: '2026-09-28T08:20:00.000Z', description: 'Ürün depoya ulaştı, inceleniyor' },
  ],
  claimedAt: '2026-09-27T10:00:00.000Z',
})
const ORDERS = { orders: [RICH_ORDER, buildOrder({ _id: 'a6b-order-2', orderNumber: 'E2E-200432', integrationCode: 'hepsiburada', internalStatus: 'APPROVED', financials: { grandTotal: 129.5, currencyCode: 'TRY' } }), buildOrder({ _id: 'a6b-order-3', orderNumber: 'E2E-200433', integrationCode: 'n11', internalStatus: 'CANCELLED' })], totalNumberOfRecords: 3 }
const CLAIMS = { claims: [RICH_CLAIM, buildClaim({ _id: 'a6b-claim-2', externalClaimId: 'CLM-E2E-0432', integrationCode: 'hepsiburada', internalStatus: 'WAITING' })], totalNumberOfRecords: 2 }

async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function open(page: Page, key: string, extra: Record<string, unknown> = {}, query = '') {
  await installApiMocks(page, reviewMocks({ 'OrderService/getOrders': ORDERS, 'ClaimService/getClaims': CLAIMS, ...extra }))
  await page.goto(reviewPath(key) + query)
  await waitForWorkplaceReady(page)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.locator('.workplace-area :is(h1, h2, table, .v-card, .ek-grid):visible').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await settle(page, 900)
}

async function openMany(page: Page, keys: string[]) {
  await installApiMocks(page, reviewMocks({ 'OrderService/getOrders': ORDERS, 'ClaimService/getClaims': CLAIMS }))
  for (const key of keys) {
    // Uygulama yönlendiricisi adresi `replace` ile güncelleyince önceki gezinme ERR_ABORTED olabilir — zararsız.
    await page.goto(reviewPath(key)).catch(() => undefined)
    await waitForWorkplaceReady(page)
    await settle(page, 400)
  }
  await settle(page, 600)
}

const view = (p: Page, cls: string) => p.locator(`.${cls}`).first()
const firstRow = (p: Page, cls: string) => view(p, cls).locator('tbody tr').first()

async function openOrderDetail(p: Page) {
  await firstRow(p, 'orderListView').locator('button:has(.mdi-eye-outline)').first().click()
  await settle(p, 900)
}
async function openClaimDetail(p: Page) {
  await firstRow(p, 'claimListView').locator('button:has(.mdi-eye-outline)').first().click({ timeout: 4000 })
  await settle(p, 900)
}
async function selectRows(p: Page, cls: string, n = 2) {
  const boxes = view(p, cls).locator('tbody tr input[type="checkbox"]')
  const count = Math.min(n, await boxes.count())
  for (let i = 0; i < count; i++) await boxes.nth(i).check({ force: true }).catch(() => undefined)
  await settle(p, 400)
}
async function openFilters(p: Page, cls: string) {
  const tg = view(p, cls).locator('.ek-filter__toggle').first()
  if ((await tg.getAttribute('aria-expanded').catch(() => 'true')) === 'false') { await tg.click(); await settle(p, 500) }
}

const never = () => new Promise<void>(() => undefined)

const cases: Array<{ name: string; run: (page: Page) => Promise<void> }> = [
  // Vitrin §13 — geri bildirim, yükleme, eylem ikonları, satır eylemleri (Standart 1/3/8/10 tek bakışta).
  {
    name: 's00-vitrin',
    run: async (p) => {
      await installApiMocks(p, reviewMocks())
      await p.goto('/design-system#geri-bildirim')
      const sec = p.locator('#geri-bildirim')
      await sec.waitFor({ timeout: 15000 })
      await sec.scrollIntoViewIfNeeded()
      await settle(p, 900)
      await sec.screenshot({ path: file('s00-vitrin-geri-bildirim') })
      await p.locator('[data-ds="toast-error"]').click()
      await p.getByRole('button', { name: 'Başarı' }).click()
      await settle(p, 500)
      await p.screenshot({ path: file('s00-vitrin-toast') })
    },
  },
  // 1 — hata / uyarı / bilgi / boş
  { name: 's01-hata-liste', run: async (p) => { await open(p, 'OrderListView', { 'OrderService/getOrders': mockError(500, { error: 'Beklenmeyen bir hata oluştu.', requestId: 'req-e2e-a6b' }) }); await p.screenshot({ path: file('s01-hata-liste') }) } },
  { name: 's01-bos-liste', run: async (p) => { await open(p, 'OrderListView', { 'OrderService/getOrders': ordersBosFixture }); await p.screenshot({ path: file('s01-bos-liste') }) } },
  { name: 's01-uyari-detay', run: async (p) => { await open(p, 'OrderListView', { 'OrderService/getOrders': { orders: [{ ...RICH_ORDER, platformDiscrepancy: { hasDiscrepancy: true, message: 'Platformdaki tutar ile yerel kayıt arasında 12,50 ₺ fark var.' } }], totalNumberOfRecords: 1 } }); await openOrderDetail(p); await p.screenshot({ path: file('s01-uyari-detay') }) } },
  { name: 's01-hata-pano', run: async (p) => { await open(p, 'integrations/IntegrationHealthView', { 'IntegrationService/getIntegrationHealth': mockError(503, { error: 'Servis geçici olarak kullanılamıyor.' }) }); await p.screenshot({ path: file('s01-hata-pano') }) } },
  // 2 — mobilde tablo → kart
  { name: 's02-kart-siparis', run: async (p) => { await open(p, 'OrderListView'); await p.screenshot({ path: file('s02-kart-siparis') }) } },
  { name: 's02-kart-urun', run: async (p) => { await open(p, 'productDefinitions/ProductListView'); await p.screenshot({ path: file('s02-kart-urun') }) } },
  { name: 's02-kart-bildirim', run: async (p) => { await open(p, 'NotificationCenterView'); await p.screenshot({ path: file('s02-kart-bildirim') }) } },
  { name: 's02-kart-detay-kalem', run: async (p) => { await open(p, 'OrderListView'); await openOrderDetail(p); const b = p.locator('.ek-detail-sheet__body, .ek-order-detail').first(); await b.getByText('Ürünler').first().scrollIntoViewIfNeeded().catch(() => undefined); await settle(p, 300); await p.screenshot({ path: file('s02-kart-detay-kalem') }) } },
  // 3 — toplu + bağlam
  { name: 's03-toplu-siparis', run: async (p) => { await open(p, 'OrderListView'); await selectRows(p, 'orderListView'); await p.screenshot({ path: file('s03-toplu-siparis') }) } },
  { name: 's03-toplu-bildirim', run: async (p) => { await open(p, 'NotificationCenterView'); await selectRows(p, 'workplace-area'); await p.screenshot({ path: file('s03-toplu-bildirim') }) } },
  { name: 's03-baglam-siparis', run: async (p) => { await open(p, 'OrderListView'); await firstRow(p, 'orderListView').locator('button:has(.mdi-dots-horizontal), button:has(.mdi-dots-horizontal)').first().click().catch(() => undefined); await settle(p, 500); await p.screenshot({ path: file('s03-baglam-siparis') }) } },
  { name: 's03-baglam-urun', run: async (p) => { await open(p, 'productDefinitions/ProductListView'); await p.screenshot({ path: file('s03-baglam-urun') }) } },
  // 4 — ana sekmeler dar ekranda
  {
    name: 's04-sekmeler',
    run: async (p) => {
      await openMany(p, ['OrderListView', 'productDefinitions/ProductListView', 'ClaimListView', 'CustomerListView', 'InvoiceListView', 'MessageListView', 'FinancialListView'])
      await p.screenshot({ path: file('s04-sekmeler'), clip: { x: 0, y: 0, width: WIDTH, height: 180 } })
      const list = p.getByRole('button', { name: /Açık sekmeler/i }).first()
      if (await list.isVisible().catch(() => false)) { await list.click(); await settle(p, 500) }
      await p.screenshot({ path: file('s04-sekmeler-liste') })
    },
  },
  // 5 — sayfa içi sekmeler
  { name: 's05-ic-sekme-finans', run: async (p) => { await open(p, 'FinancialListView'); await p.screenshot({ path: file('s05-ic-sekme-finans') }) } },
  { name: 's05-ic-sekme-log', run: async (p) => { await open(p, 'LogListView'); await p.screenshot({ path: file('s05-ic-sekme-log') }) } },
  { name: 's05-ic-sekme-entegrasyon', run: async (p) => { await open(p, 'integrations/MarketplaceView'); await p.screenshot({ path: file('s05-ic-sekme-entegrasyon') }) } },
  // 6 — sipariş + iade
  { name: 's06-siparis-liste', run: async (p) => { await open(p, 'OrderListView'); await p.screenshot({ path: file('s06-siparis-liste') }) } },
  { name: 's06-siparis-detay', run: async (p) => { await open(p, 'OrderListView'); await openOrderDetail(p); await p.screenshot({ path: file('s06-siparis-detay') }) } },
  { name: 's06-iade-liste', run: async (p) => { await open(p, 'ClaimListView'); await p.screenshot({ path: file('s06-iade-liste') }) } },
  { name: 's06-iade-detay', run: async (p) => { await open(p, 'ClaimListView'); await openClaimDetail(p); await p.screenshot({ path: file('s06-iade-detay') }) } },
  // 7 — sekme sınırında kalan overlay
  {
    name: 's07-overlay-sekme',
    run: async (p) => {
      await openMany(p, ['ClaimListView', 'OrderListView'])
      await openOrderDetail(p)
      await p.screenshot({ path: file('s07-overlay-1-siparis-detay') })
      // Diğer sekmeye geç (şerit kullanılabilir mi?) → iade detayını aç → geri dön.
      await p.locator('[role="tab"]').filter({ hasText: /İade/i }).first().click({ timeout: 3000 }).catch(() => undefined)
      await settle(p, 700)
      await p.screenshot({ path: file('s07-overlay-2-diger-sekme') })
      await openClaimDetail(p).catch(() => undefined)
      await settle(p, 300)
      await p.screenshot({ path: file('s07-overlay-3-ikinci-diyalog') })
      await p.locator('[role="tab"]').filter({ hasText: /Sipariş/i }).first().click({ timeout: 3000 }).catch(() => undefined)
      await settle(p, 700)
      await p.screenshot({ path: file('s07-overlay-4-geri-donus') })
    },
  },
  // 8 — yükleme
  {
    name: 's08-yukleme-liste',
    run: async (p) => {
      await installApiMocks(p, reviewMocks({ 'OrderService/getOrders': async (_r: Route) => { await never() } }))
      await p.goto(reviewPath('OrderListView'))
      await waitForWorkplaceReady(p)
      await settle(p, 1200)
      await p.screenshot({ path: file('s08-yukleme-liste') })
    },
  },
  {
    name: 's08-yukleme-overlay',
    run: async (p) => {
      await installApiMocks(p, reviewMocks({ 'ProductService/getProducts': async (_r: Route) => { await never() } }))
      await p.goto(reviewPath('productDefinitions/ProductListView'))
      await waitForWorkplaceReady(p)
      await settle(p, 1500)
      await p.screenshot({ path: file('s08-yukleme-overlay') })
    },
  },
  // 9 — yenile
  { name: 's09-yenile-liste', run: async (p) => { await open(p, 'OrderListView'); await p.screenshot({ path: file('s09-yenile-liste'), clip: { x: 0, y: 0, width: WIDTH, height: 200 } }) } },
  { name: 's09-yenile-pano', run: async (p) => { await open(p, 'DashboardView'); await p.screenshot({ path: file('s09-yenile-pano'), clip: { x: 0, y: 0, width: WIDTH, height: 200 } }) } },
  // 10 — eylem ikonları
  { name: 's10-ikon-urun', run: async (p) => { await open(p, 'productDefinitions/ProductListView'); await p.screenshot({ path: file('s10-ikon-urun') }) } },
  { name: 's10-ikon-fatura', run: async (p) => { await open(p, 'InvoiceListView'); await p.screenshot({ path: file('s10-ikon-fatura') }) } },
  { name: 's10-ikon-talep', run: async (p) => { await open(p, 'adminPanel/AdminTicketListView'); await p.screenshot({ path: file('s10-ikon-talep') }) } },
  // 11 — form elemanları
  { name: 's11-form-filtre', run: async (p) => { await open(p, 'OrderListView'); await openFilters(p, 'orderListView'); await p.screenshot({ path: file('s11-form-filtre') }) } },
  { name: 's11-form-stok', run: async (p) => { await open(p, 'StockPolicyView'); await p.screenshot({ path: file('s11-form-stok') }) } },
  { name: 's11-form-hesap', run: async (p) => { await open(p, 'AccountSecurityView'); await p.screenshot({ path: file('s11-form-hesap') }) } },
  // 12 — açılır listeler
  {
    name: 's12-select-kanal',
    run: async (p) => {
      await open(p, 'OrderListView')
      await openFilters(p, 'orderListView')
      await view(p, 'orderListView').locator('.ek-filter .v-select').first().click()
      await settle(p, 600)
      await p.screenshot({ path: file('s12-select-kanal') })
    },
  },
  {
    name: 's12-select-durum',
    run: async (p) => {
      await open(p, 'OrderListView')
      await openFilters(p, 'orderListView')
      await view(p, 'orderListView').locator('.ek-filter .v-select').nth(1).click()
      await settle(p, 600)
      await p.screenshot({ path: file('s12-select-durum') })
    },
  },
]

test.describe('A6b inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca A6B_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW)
  })
  for (const c of cases) {
    if (!want(c.name)) continue
    test(c.name, async ({ page }) => {
      test.setTimeout(90_000)
      await c.run(page)
    })
  }
})
