// DS-v2 Aşama 5 — kullanıcı geri bildirimi (11 madde) için ÖNCE/SONRA inceleme görüntüleri. İddia yok; günlük koşuda ATLANIR.
//   A5_REVIEW=1 A5_REVIEW_WIDTH=1440|800|390 A5_REVIEW_OUT=docs/a5-review/after \
//     npx playwright test e2e/specs/a5-review.spec.ts --project=chromium-desktop
// Dosya adı: `mNN-<konu>-<genişlik>.png` (madde numarası = kullanıcı listesindeki sıra). Saat sabit.
import { test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { buildProduct, choicesDoluFixture } from '../fixtures/apiData'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.A5_REVIEW === '1'
const WIDTH = Number(process.env.A5_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.A5_REVIEW_OUT || 'docs/a5-review/after'
const ONLY = (process.env.A5_REVIEW_ONLY || '').split(',').filter(Boolean)
const NOW = new Date('2026-09-29T11:00:00.000Z')
const file = (name: string) => `${OUT}/${name}-${WIDTH}.png`
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

// Varyantlı ürün (product-variant-list.spec ile aynı şekil; sentetik, PII yok).
function variant(o: Record<string, any> = {}) {
  return {
    _id: 'a5-var-1', stockcode: 'A5-TSH-SIYAH-M', barcode: '8690000000301',
    choices: [{ choiceId: 'choice-e2e-1', choiceValueId: 'choiceval-e2e-1', slicer: true }],
    prices: { salePrice: 349.9, marketPrice: 429.9, isPlatformBasedPrice: false }, stock: 12, shelf: 'B-02', images: [],
    platforms: {
      trendyol: { upload: { TRANSFER: { status: 'COMPLETED', updatedAt: '2026-09-20T10:00:00.000Z' }, onSale: true }, prices: { salePrice: 349.9, marketPrice: 429.9 }, stock: 12 },
      hepsiburada: { upload: { TRANSFER: { status: 'FAILED', updatedAt: '2026-09-21T10:00:00.000Z' } } },
    },
    onsale: true, ...o,
  }
}
const VARIANT_PRODUCT = buildProduct({
  _id: 'a5-product-var', title: 'Organik pamuk basic tişört', hasVariant: true,
  variants: [
    variant(),
    variant({ _id: 'a5-var-2', stockcode: 'A5-TSH-BEYAZ-M', barcode: '8690000000302', choices: [{ choiceId: 'choice-e2e-1', choiceValueId: 'choiceval-e2e-2', slicer: true }], stock: 0, shelf: undefined, platforms: { trendyol: { upload: { TRANSFER: { status: 'PENDING' } } } } }),
    variant({ _id: 'a5-var-3', stockcode: 'A5-TSH-SIYAH-L', barcode: '8690000000303', stock: 4, prices: { salePrice: 369.9, marketPrice: 449.9, isPlatformBasedPrice: false } }),
  ],
})
const SINGLE_PRODUCT = buildProduct({ _id: 'a5-product-single', title: 'Keten gömlek — tek beden' })

async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function open(page: Page, key: string, extra: Record<string, unknown> = {}, query = '') {
  await installApiMocks(page, reviewMocks(extra))
  await page.goto(reviewPath(key) + query)
  await waitForWorkplaceReady(page)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.locator('.workplace-area :is(h1, h2, table, .v-card, .ek-grid):visible').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await settle(page, 900)
}

/** Aynı oturumda (sessionStorage) birkaç ekran açar → sekme şeridinde çok sekme. */
async function openMany(page: Page, keys: string[]) {
  await installApiMocks(page, reviewMocks())
  for (const key of keys) {
    await page.goto(reviewPath(key))
    await waitForWorkplaceReady(page)
    await settle(page, 500)
  }
  await settle(page, 600)
}

const topClip = (h = 180) => ({ x: 0, y: 0, width: WIDTH, height: h })

const cases: Array<{ name: string; run: (page: Page) => Promise<void> }> = [
  { name: 'm01-hiyerarsi-siparis', run: async (p) => { await open(p, 'OrderListView'); await p.screenshot({ path: file('m01-hiyerarsi-siparis') }) } },
  { name: 'm01-hiyerarsi-pano', run: async (p) => { await open(p, 'DashboardView'); await p.screenshot({ path: file('m01-hiyerarsi-pano') }) } },
  {
    name: 'm02-cipler',
    run: async (p) => {
      await open(p, 'OrderListView', {}, '?internalStatuses=AWAITING_APPROVAL')
      await p.screenshot({ path: file('m02-cipler') })
    },
  },
  { name: 'm03-kanal-siparis', run: async (p) => { await open(p, 'OrderListView'); await p.screenshot({ path: file('m03-kanal-siparis') }) } },
  { name: 'm03-kanal-pazaryeri', run: async (p) => { await open(p, 'integrations/MarketplaceView'); await p.screenshot({ path: file('m03-kanal-pazaryeri') }) } },
  { name: 'm03-kanal-iade', run: async (p) => { await open(p, 'ClaimListView'); await p.screenshot({ path: file('m03-kanal-iade') }) } },
  {
    name: 'm04-aktif-sekme',
    run: async (p) => {
      await openMany(p, ['OrderListView', 'productDefinitions/ProductListView', 'ClaimListView', 'CustomerListView'])
      await p.screenshot({ path: file('m04-aktif-sekme'), clip: topClip(220) })
    },
  },
  {
    name: 'm05-sekme-kaydirma',
    run: async (p) => {
      await openMany(p, ['OrderListView', 'productDefinitions/ProductListView', 'ClaimListView', 'CustomerListView', 'InvoiceListView', 'MessageListView', 'FinancialListView', 'LogListView'])
      await p.screenshot({ path: file('m05-sekme-kaydirma'), clip: topClip(140) })
    },
  },
  { name: 'm06-baslik-iade', run: async (p) => { await open(p, 'ClaimListView'); await p.screenshot({ path: file('m06-baslik-iade') }) } },
  {
    name: 'm06-baslik-acik',
    run: async (p) => {
      await open(p, 'ClaimListView')
      const info = p.getByRole('button', { name: /Sayfa hakkında/ }).first()
      if (await info.isVisible().catch(() => false)) { await info.click(); await settle(p, 500) }
      await p.screenshot({ path: file('m06-baslik-acik') })
    },
  },
  { name: 'm06-baslik-ayarlar', run: async (p) => { await open(p, 'AccountSecurityView'); await p.screenshot({ path: file('m06-baslik-ayarlar') }) } },
  {
    name: 'm07-filtre',
    run: async (p) => {
      await open(p, 'OrderListView')
      const toggle = p.locator('.orderListView .ek-filter__toggle').first()
      await p.screenshot({ path: file('m07-filtre-1-acik') })
      await toggle.click()
      await p.waitForTimeout(90)
      await p.screenshot({ path: file('m07-filtre-2-gecis') })
      await settle(p, 500)
      await p.screenshot({ path: file('m07-filtre-3-kapali') })
    },
  },
  {
    name: 'm08-etiket',
    run: async (p) => {
      await open(p, 'OrderListView')
      const tg = p.locator('.orderListView .ek-filter__toggle').first()
      if ((await tg.getAttribute('aria-expanded')) === 'false') { await tg.click(); await settle(p, 500) }
      const field = p.locator('.orderListView .ek-filter .v-field').first()
      const box = (await field.boundingBox())!
      const clip = { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 14), width: Math.min(360, box.width + 16), height: box.height + 24 }
      await p.screenshot({ path: file('m08-etiket-1-bos'), clip })
      await field.click()
      await p.waitForTimeout(60)
      await p.screenshot({ path: file('m08-etiket-2-gecis'), clip })
      await settle(p, 400)
      await p.screenshot({ path: file('m08-etiket-3-odak'), clip })
    },
  },
  {
    name: 'm09-ust-daralt',
    run: async (p) => {
      await open(p, 'OrderListView')
      await p.screenshot({ path: file('m09-ust-1-normal'), clip: topClip(160) })
      const toggle = p.locator('.ek-chrome-handle__pill').first()
      if (await toggle.isVisible().catch(() => false)) await toggle.hover({ position: { x: 26, y: 24 } })
      await settle(p, 700)
      await p.screenshot({ path: file('m09-ust-2-hover'), clip: topClip(160) })
      await p.mouse.move(700, 500)
      await p.keyboard.press('Control+Shift+H')
      await settle(p, 700)
      await p.screenshot({ path: file('m09-ust-3-daraltilmis'), clip: topClip(160) })
    },
  },
  { name: 'm10-ust-bar', run: async (p) => { await openMany(p, ['OrderListView', 'productDefinitions/ProductListView']); await p.screenshot({ path: file('m10-ust-bar'), clip: topClip(64) }) } },
  {
    name: 'm11-urun-secenek',
    run: async (p) => {
      await open(p, 'productDefinitions/ProductListView', {
        ChoiceService: choicesDoluFixture,
        'ProductService/getProducts': { products: [VARIANT_PRODUCT, SINGLE_PRODUCT], totalNumberOfRecords: 2, fromTo: '1-2 / 2', isFiltered: false },
      })
      await p.locator('.productListView').getByText(/\(3 Seçenek\)|3 seçenek/i).first().click()
      await p.locator('#variant-target-a5-product-var').waitFor({ timeout: 10000 }).catch(() => undefined)
      await settle(p, 900)
      await p.screenshot({ path: file('m11-urun-secenek') })
    },
  },
]

test.describe('A5 inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca A5_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: Number(process.env.A5_REVIEW_SCALE) || 1 })
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
