// A13 — müşteri kartı premium turu için ÖNCE/SONRA inceleme görüntüleri. İddia yok; günlük koşuda ATLANIR.
//   A13_REVIEW=1 A13_REVIEW_WIDTH=1440|390 A13_REVIEW_OUT=docs/a13-review/after \
//     npx playwright test e2e/specs/a13-review.spec.ts --project=chromium-desktop --workers=2
// Dosya adı: `NN-<konu>-<genişlik>.png`; `zNN-…` = yakın çekim (2× ölçek, yalnız kart). Saat sabit, veri sentetik (PII yok).
import { test, type Page, type Route } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { buildClaim, buildCustomer, buildCustomerDetail, buildOrder } from '../fixtures/apiData'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.A13_REVIEW === '1'
const WIDTH = Number(process.env.A13_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.A13_REVIEW_OUT || 'docs/a13-review/after'
const ONLY = (process.env.A13_REVIEW_ONLY || '').split(',').filter(Boolean)
const NOW = new Date('2026-09-29T11:00:00.000Z')
const file = (name: string) => `${OUT}/${name}-${WIDTH}.png`
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

// Backend modelindeki alanlar (Customer şeması + getCustomers `$addFields` + getCustomerDetail `insights`); sentetik.
const CUSTOMERS = {
  customers: [
    buildCustomer({ createdAt: '2025-03-14T09:00:00.000Z', metrics: { totalSpent: 4250.4, totalOrderCount: 8, totalClaimCount: 1, totalReturnAmount: 349.9, lastOrderDate: '2026-09-25T08:15:00.000Z' }, netRevenue: 3900.5 }),
    buildCustomer({ _id: 'customer-e2e-0002', firstName: 'Mehmet', lastName: 'Demir', externalIdentities: [{ integrationCode: 'hepsiburada' }], phone: '5324445566', email: 'mehmet.demir@e2e.invalid', addresses: [{ city: 'Ankara', state: 'Çankaya' }], returnRate: 32, metrics: { totalSpent: 400, totalOrderCount: 3, totalClaimCount: 1 }, netRevenue: 350 }),
    buildCustomer({ _id: 'customer-e2e-0003', firstName: 'Deniz', lastName: 'Kaya', isCorporate: true, companyName: 'Kaya Tekstil Ltd. Şti.', externalIdentities: [{ integrationCode: 'n11' }], phone: '2125550011', email: 'satinalma@kaya-e2e.invalid', addresses: [{ city: 'İzmir', state: 'Bornova' }], returnRate: 0, metrics: { totalSpent: 18240, totalOrderCount: 21 }, netRevenue: 18240 }),
    buildCustomer({ _id: 'customer-e2e-0004', firstName: 'Elif', lastName: 'Şahin', externalIdentities: [], phone: '', email: 'elif@pazaryeri-maskeli.invalid', isEmailMasked: true, addresses: [], returnRate: 0, metrics: { totalSpent: 0, totalOrderCount: 0 }, netRevenue: 0 }),
  ],
  totalNumberOfRecords: 4,
  totalNumberOfPages: 1,
}

const DETAIL = buildCustomerDetail({
  phone: '5551112233',
  email: 'ayse.yilmaz@e2e.invalid',
  createdAt: '2025-03-14T09:00:00.000Z',
  externalIdentities: [{ integrationCode: 'trendyol', externalCustomerId: 'TY-88120931' }, { integrationCode: 'hepsiburada', externalCustomerId: 'HB-5521907' }],
  addresses: [
    { _id: 'adr-1', title: 'Ev', addressLine: 'Örnek Mah. Deneme Sk. No:1 D:4', city: 'İstanbul', state: 'Kadıköy', postalCode: '34710', isDefaultShipping: true, isDefaultBilling: false },
    { _id: 'adr-2', title: 'İş', addressLine: 'Kurumsal Cad. Plaza No:12 Kat:3', city: 'İstanbul', state: 'Ataşehir', postalCode: '34746', isDefaultShipping: false, isDefaultBilling: true },
  ],
  metrics: { totalOrderCount: 8, totalSpent: 4250.4, totalClaimCount: 1, totalReturnAmount: 349.9, lastOrderDate: '2026-09-25T08:15:00.000Z' },
  insights: { netRevenue: 3900.5, returnRate: 12.5, customerScore: 11 },
  recentOrders: [
    { _id: 'o1', integrationCode: 'trendyol', orderNumber: 'E2E-200431', dates: { orderDate: '2026-09-25T08:15:00.000Z' }, financials: { grandTotal: 1178.8 }, internalStatus: 'SHIPPED' },
    { _id: 'o2', integrationCode: 'hepsiburada', orderNumber: 'E2E-199870', dates: { orderDate: '2026-08-11T14:02:00.000Z' }, financials: { grandTotal: 529 }, internalStatus: 'DELIVERED' },
  ],
  recentClaims: [
    { _id: 'c1', integrationCode: 'trendyol', externalClaimId: 'CLM-E2E-0431', externalCreatedAt: '2026-09-27T10:00:00.000Z', items: [{ reason: 'Beden uymadı' }], totalRefundAmount: 349.9, internalStatus: 'UNDER_REVIEW' },
  ],
})
const DETAIL_NEW = buildCustomerDetail({ _id: 'customer-e2e-0004', firstName: 'Elif', lastName: 'Şahin', phone: '', email: 'elif@pazaryeri-maskeli.invalid', isEmailMasked: true, metrics: { totalOrderCount: 0, totalSpent: 0 }, insights: { netRevenue: 0, returnRate: 0, customerScore: 0 }, recentOrders: [], recentClaims: [], externalIdentities: [], addresses: [] })

const ORDER = buildOrder({
  _id: 'a13-order-1', orderNumber: 'E2E-200431', integrationCode: 'trendyol', internalStatus: 'SHIPPED',
  billingAddress: { firstName: 'Ayşe', lastName: 'Yılmaz', phone: '5551112233', email: 'ayse.yilmaz@e2e.invalid', addressLine1: 'Kurumsal Cad. Plaza No:12 Kat:3', city: 'İstanbul', state: 'Ataşehir', postalCode: '34746', isCorporate: false },
  shippingAddress: { firstName: 'Ayşe', lastName: 'Yılmaz', phone: '5551112233', addressLine1: 'Örnek Mah. Deneme Sk. No:1 D:4', city: 'İstanbul', state: 'Kadıköy', postalCode: '34710' },
  items: [{ externalLineItemId: 'l1', productName: 'Organik pamuk basic tişört — Siyah / M', sku: 'A13-TSH-SYH-M', quantity: 2, unitPrice: 349.9, totalPrice: 699.8, itemStatus: 'ACTIVE' }],
  financials: { currencyCode: 'TRY', subTotal: 699.8, totalDiscount: 0, totalTax: 116.6, shippingFee: 0, grandTotal: 699.8 },
  fulfillment: [{ carrierName: 'Yurtiçi Kargo', trackingCode: 'YK-E2E-7781234', status: 'SHIPPED' }],
  dates: { orderDate: '2026-09-25T08:15:00.000Z', approvedDate: '2026-09-25T09:02:00.000Z', shippedDate: '2026-09-26T15:40:00.000Z' },
})
const ORDER_CORP = buildOrder({
  _id: 'a13-order-2', orderNumber: 'E2E-200432', integrationCode: 'n11', internalStatus: 'APPROVED',
  billingAddress: { firstName: 'Deniz', lastName: 'Kaya', companyName: 'Kaya Tekstil Ltd. Şti.', taxNumber: '1234567890', taxOffice: 'Bornova', phone: '2125550011', email: 'satinalma@kaya-e2e.invalid', addressLine1: 'Sanayi Cad. No:44', city: 'İzmir', state: 'Bornova', isCorporate: true },
  shippingAddress: { firstName: 'Deniz', lastName: 'Kaya', addressLine1: 'Sanayi Cad. No:44', city: 'İzmir', state: 'Bornova' },
  financials: { grandTotal: 18240, currencyCode: 'TRY' },
})
// İade listesi projeksiyonu müşteriden addresses/metrics/externalIdentities'i ÇIKARIR (ClaimService.getClaims).
const CLAIM = buildClaim({
  _id: 'a13-claim-1', externalClaimId: 'CLM-E2E-0431', externalOrderId: 'E2E-200431', internalStatus: 'UNDER_REVIEW',
  items: [{ productName: 'Organik pamuk basic tişört — Siyah / M', quantity: 1, unitPrice: 349.9, reason: 'Beden uymadı' }],
  customer: { _id: 'customer-e2e-0001', firstName: 'Ayşe', lastName: 'Yılmaz', phone: '5551112233', email: 'ayse.yilmaz@e2e.invalid', isCorporate: false, createdAt: '2025-03-14T09:00:00.000Z', status: 'ACTIVE' },
  claimedAt: '2026-09-27T10:00:00.000Z',
})

async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function open(page: Page, key: string, extra: Record<string, unknown> = {}) {
  await installApiMocks(page, reviewMocks({
    'CustomerService/getCustomers': CUSTOMERS,
    'CustomerService/getCustomerDetail': DETAIL,
    'OrderService/getOrders': { orders: [ORDER, ORDER_CORP], totalNumberOfRecords: 2 },
    'ClaimService/getClaims': { claims: [CLAIM], totalNumberOfRecords: 1 },
    ...extra,
  }))
  await page.goto(reviewPath(key))
  await waitForWorkplaceReady(page)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.locator('.workplace-area :is(h1, h2, table, .v-card, .ek-grid):visible').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await settle(page, 900)
}

const view = (p: Page, cls: string) => p.locator(`.${cls}`).first()
async function openRow(p: Page, cls: string, n = 0) {
  await view(p, cls).locator('button:has(.mdi-eye-outline):visible').nth(n).click({ timeout: 5000 })
  await settle(p, 900)
}
const sheet = (p: Page) => p.locator('.ek-detail-sheet__card').first()
const buyerCard = (p: Page) => p.locator('.ek-cust-card, section.ek-info-card:has(h3:text-is("Alıcı")), section.ek-info-card:has(h3:text-is("Müşteri"))').first()
async function scrollTo(p: Page, locator: ReturnType<Page['locator']>) {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined)
  await settle(p, 400)
}
const never = () => new Promise<void>(() => undefined)

const cases: Array<{ name: string; run: (page: Page) => Promise<void> }> = [
  { name: '01-liste', run: async (p) => { await open(p, 'CustomerListView'); await p.screenshot({ path: file('01-liste') }) } },
  { name: '02-detay', run: async (p) => { await open(p, 'CustomerListView'); await openRow(p, 'customerListView'); await p.screenshot({ path: file('02-detay') }) } },
  {
    name: '03-detay-alt',
    run: async (p) => {
      await open(p, 'CustomerListView'); await openRow(p, 'customerListView')
      await p.locator('.ek-detail-sheet__body').first().evaluate((el) => el.scrollTo({ top: el.scrollHeight })).catch(() => undefined)
      await settle(p, 400)
      await p.screenshot({ path: file('03-detay-alt') })
    },
  },
  { name: '04-detay-yeni-musteri', run: async (p) => { await open(p, 'CustomerListView', { 'CustomerService/getCustomerDetail': DETAIL_NEW }); await openRow(p, 'customerListView', 3); await p.screenshot({ path: file('04-detay-yeni-musteri') }) } },
  {
    name: '05-detay-yukleniyor',
    run: async (p) => {
      await open(p, 'CustomerListView', { 'CustomerService/getCustomerDetail': async (_r: Route) => { await never() } })
      await view(p, 'customerListView').locator('button:has(.mdi-eye-outline)').first().click({ timeout: 5000 })
      await settle(p, 900)
      await p.screenshot({ path: file('05-detay-yukleniyor') })
    },
  },
  {
    name: '06-detay-hata',
    run: async (p) => {
      await open(p, 'CustomerListView', { 'CustomerService/getCustomerDetail': mockError(500, { error: 'Beklenmeyen bir hata oluştu.' }) })
      await view(p, 'customerListView').locator('button:has(.mdi-eye-outline)').first().click({ timeout: 5000 })
      await settle(p, 1200)
      await p.screenshot({ path: file('06-detay-hata') })
    },
  },
  {
    name: '07-siparis-alici',
    run: async (p) => {
      await open(p, 'OrderListView'); await openRow(p, 'orderListView')
      await scrollTo(p, buyerCard(p))
      await p.screenshot({ path: file('07-siparis-alici') })
    },
  },
  {
    name: '08-iade-musteri',
    run: async (p) => {
      await open(p, 'ClaimListView'); await openRow(p, 'claimListView')
      await scrollTo(p, buyerCard(p))
      await p.screenshot({ path: file('08-iade-musteri') })
    },
  },
]

// Yakın çekim: yalnız kart, 2× ölçek.
const closeups: Array<{ name: string; run: (page: Page) => Promise<void> }> = [
  { name: 'z01-liste-satir', run: async (p) => { await open(p, 'CustomerListView'); const r = view(p, 'customerListView').locator('tbody tr, .ek-grid__card, [role="row"]:has(button)').first(); await r.screenshot({ path: file('z01-liste-satir') }) } },
  {
    name: 'z02-detay-kart',
    run: async (p) => {
      await open(p, 'CustomerListView'); await openRow(p, 'customerListView')
      const card = p.locator('.ek-cust-profile, .ek-detail-sheet__body > div').first()
      await card.screenshot({ path: file('z02-detay-kart') })
    },
  },
  {
    name: 'z03-detay-kart-acik',
    run: async (p) => {
      await open(p, 'CustomerListView'); await openRow(p, 'customerListView')
      const reveal = sheet(p).getByRole('button', { name: /Kişisel verileri göster/ }).first()
      if (await reveal.isVisible().catch(() => false)) { await reveal.click(); await settle(p, 300) }
      await p.locator('.ek-cust-profile, .ek-detail-sheet__body > div').first().screenshot({ path: file('z03-detay-kart-acik') })
    },
  },
  { name: 'z04-siparis-alici', run: async (p) => { await open(p, 'OrderListView'); await openRow(p, 'orderListView'); await scrollTo(p, buyerCard(p)); await buyerCard(p).screenshot({ path: file('z04-siparis-alici') }) } },
  { name: 'z05-siparis-kurumsal', run: async (p) => { await open(p, 'OrderListView'); await openRow(p, 'orderListView', 1); await scrollTo(p, buyerCard(p)); await buyerCard(p).screenshot({ path: file('z05-siparis-kurumsal') }) } },
  { name: 'z06-iade-musteri', run: async (p) => { await open(p, 'ClaimListView'); await openRow(p, 'claimListView'); await scrollTo(p, buyerCard(p)); await buyerCard(p).screenshot({ path: file('z06-iade-musteri') }) } },
]

test.describe('A13 inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca A13_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })
  test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(NOW) })
  for (const c of cases) {
    if (!want(c.name)) continue
    test(c.name, async ({ page }) => { test.setTimeout(90_000); await c.run(page) })
  }
})

test.describe('A13 yakın çekim', () => {
  test.skip(!ENABLED, 'Yalnızca A13_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 })
  test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(NOW) })
  for (const c of closeups) {
    if (!want(c.name)) continue
    test(c.name, async ({ page }) => { test.setTimeout(90_000); await c.run(page) })
  }
})
