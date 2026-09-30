// C1 — kanal marka renkleri (tek kaynak) ÖNCE/SONRA inceleme görüntüleri. İddia yok; günlük koşuda ATLANIR.
//   C1_REVIEW=1 C1_REVIEW_OUT=docs/c1-review/after [C1_REVIEW_DARK=1] [C1_REVIEW_WIDTH=1440] \
//     npx playwright test e2e/specs/c1-review.spec.ts --project=chromium-desktop
// Dosya adı: `<ekran>[-dark]-<genişlik>.png` (+ `-yakin` 2x yakın çekim). Ekranlar: ürün listesi (varyant kanal çipleri),
// sipariş listesi (satır kanal şeridi + çip), pazaryeri entegrasyonları (platform rayı). 6 kanal birlikte görünür.
// Veri sentetik (PII yok); yalnız mevcut fixture şekilleri.
import { test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { buildOrder, buildProduct, buildChoice } from '../fixtures/apiData'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.C1_REVIEW === '1'
const WIDTH = Number(process.env.C1_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.C1_REVIEW_OUT || 'docs/c1-review/after'
const DARK = process.env.C1_REVIEW_DARK === '1'
const ONLY = (process.env.C1_REVIEW_ONLY || '').split(',').filter(Boolean)
const NOW = new Date('2026-09-29T11:00:00.000Z')
const file = (name: string, suffix = '') => `${OUT}/${name}${DARK ? '-dark' : ''}-${WIDTH}${suffix}.png`
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

const CHANNELS = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap']
const CLIENT_INTEGRATIONS = {
  marketplace: ['trendyol', 'hepsiburada', 'n11', 'pazarama'].map((code, i) => ({ code, order: i + 1, settings: { apiKey: 'e2e-fake-key' } })),
  ecommerce: [{ code: 'ideasoft', order: 1, settings: { apiKey: 'e2e-fake-key' } }],
  erp: [{ code: 'bizimhesap', order: 1, settings: { apiKey: 'e2e-fake-key' } }],
  shipment: [],
}

const ok = (price: number) => ({ upload: { TRANSFER: { status: 'COMPLETED', updatedAt: '2026-09-20T10:00:00.000Z' }, onSale: true }, prices: { salePrice: price, marketPrice: price + 80 }, stock: 8 })
const failed = { upload: { TRANSFER: { status: 'FAILED', updatedAt: '2026-09-21T10:00:00.000Z', messages: ['Kategori eşleşmesi eksik.'] } } }
const SIZES = [{ _id: 's-s', title: 'S' }, { _id: 's-m', title: 'M' }, { _id: 's-l', title: 'L' }]
const CHOICES = [buildChoice({ _id: 'ch-beden', title: 'Beden', isSlicer: false, isVarianter: true, values: SIZES })]
const variant = (i: number) => ({
  _id: `c1-var-${i}`,
  stockcode: `TSH-${SIZES[i].title}`,
  barcode: `86900000${String(5000 + i).padStart(5, '0')}`,
  choices: [{ choiceId: 'ch-beden', choiceValueId: SIZES[i]._id }],
  prices: { salePrice: 349.9, marketPrice: 429.9, isPlatformBasedPrice: false },
  stock: [12, 3, 0][i],
  images: [],
  platforms: { trendyol: ok(349.9), hepsiburada: i === 1 ? failed : ok(359.9), n11: ok(349.9), pazarama: ok(339.9), ideasoft: ok(349.9) },
  onsale: true,
})
const PRODUCT = buildProduct({ _id: 'c1-prod', title: 'Organik pamuk basic tişört', hasVariant: true, variants: [0, 1, 2].map(variant) })
const ORDERS = {
  orders: CHANNELS.slice(0, 5).map((code, i) =>
    buildOrder({ _id: `c1-order-${i}`, orderNumber: `E2E-2000${i}`, integrationCode: code, internalStatus: i % 2 ? 'APPROVED' : 'AWAITING_APPROVAL', financials: { grandTotal: 129.5 + i * 40, currencyCode: 'TRY' } }),
  ),
  totalNumberOfRecords: 5,
}

async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function open(page: Page, key: string) {
  await installApiMocks(page, reviewMocks({
    'IntegrationService/getClientIntegrations': CLIENT_INTEGRATIONS,
    ChoiceService: CHOICES,
    'ProductService/getProducts': { products: [PRODUCT, buildProduct({ _id: 'c1-single', title: 'Keten gömlek — tek beden' })], totalNumberOfRecords: 2, fromTo: '1-2 / 2', isFiltered: false },
    'OrderService/getOrders': ORDERS,
  }))
  await page.goto(reviewPath(key))
  await waitForWorkplaceReady(page)
  // Uygulamada tema anahtarı yok (defaultTheme light): dark görüntü için Vuetify teması sayfa içinden çevrilir.
  if (DARK) {
    const applied = await page.evaluate(() => {
      const app = (document.querySelector('#app') as any)?.__vue_app__
      const gp = app?.config.globalProperties ?? {}
      const theme = gp.$vuetify?.theme ?? (() => { const pr = app?._context?.provides ?? {}; return Reflect.ownKeys(pr).map((k) => pr[k]).find((v: any) => v?.global?.name && v?.themes) })()
      if (!theme) return Object.keys(gp).join(',')
      ;(theme as any).global.name.value = 'darkTheme'
      return 'ok'
    })
    if (applied !== 'ok') throw new Error(`dark tema uygulanamadı: ${applied}`)
    await settle(page, 400)
  }
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.locator('.workplace-area :is(h1, table, .v-card, .ek-grid):visible').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await settle(page, 900)
}

const SCENARIOS: { name: string; run: (p: Page) => Promise<void> }[] = [
  {
    name: 'urun-listesi',
    run: async (p) => {
      await open(p, 'productDefinitions/ProductListView')
      await p.locator('.productListView').getByRole('button', { name: /3 seçenek/i }).first().click().catch(() => undefined)
      const target = p.locator(`#variant-target-${PRODUCT._id}`)
      await target.waitFor({ timeout: 10000 }).catch(() => undefined)
      await settle(p, 900)
      await p.screenshot({ path: file('urun-listesi') })
      const box = await target.boundingBox().catch(() => null)
      if (box) await p.screenshot({ path: file('urun-listesi', '-yakin'), clip: { x: box.x, y: Math.max(0, box.y - 8), width: Math.min(box.width, WIDTH - box.x), height: Math.min(box.height + 16, HEIGHT - box.y) } })
    },
  },
  {
    name: 'siparis-listesi',
    run: async (p) => {
      await open(p, 'OrderListView')
      await p.screenshot({ path: file('siparis-listesi') })
      const grid = await p.locator('.workplace-area .ek-grid, .workplace-area table').first().boundingBox().catch(() => null)
      if (grid) await p.screenshot({ path: file('siparis-listesi', '-yakin'), clip: { x: grid.x, y: grid.y, width: Math.min(grid.width, 760), height: Math.min(grid.height, 420) } })
    },
  },
  {
    name: 'entegrasyonlar',
    run: async (p) => {
      await open(p, 'integrations/MarketplaceView')
      await p.screenshot({ path: file('entegrasyonlar') })
      const rail = await p.locator('.workplace-area .ek-integration-rail').first().boundingBox().catch(() => null)
      if (rail) await p.screenshot({ path: file('entegrasyonlar', '-yakin'), clip: { x: rail.x, y: rail.y, width: Math.min(rail.width, WIDTH - rail.x), height: Math.min(rail.height, 520) } })
    },
  },
]

// Bulut: PW_CHROMIUM=/opt/pw-browsers/chromium (yüklü Playwright sürümünün tarayıcısı indirilemiyorsa).
if (process.env.PW_CHROMIUM) test.use({ launchOptions: { executablePath: process.env.PW_CHROMIUM } })

test.describe('C1 kanal renkleri inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'yalnız C1_REVIEW=1 ile')
  test.use({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  })

  for (const s of SCENARIOS.filter((x) => want(x.name))) {
    test(s.name, async ({ page }) => {
      test.setTimeout(90_000)
      await page.clock.setFixedTime(NOW)
      if (DARK) await page.emulateMedia({ colorScheme: 'dark' })
      await s.run(page)
    })
  }
})
