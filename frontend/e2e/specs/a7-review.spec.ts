// DS-v2 A7 — breadcrumb + sayfa başlığı satırı (EkPageBar) ÖNCE/SONRA inceleme görüntüleri.
// İddia yok; günlük koşuda ATLANIR. Saat sabit, veri sentetik (PII yok).
//   A7_REVIEW=1 A7_REVIEW_WIDTH=1440|390 A7_REVIEW_OUT=docs/a7-review/after \
//     npx playwright test e2e/specs/a7-review.spec.ts --project=chromium-desktop --workers=2
// Dosya adı: `<durum>-<genişlik>.png` (tam görünüm) + `<durum>-<genişlik>-yakin.png` (başlık satırı, 2x).
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { reviewMenuFixture, reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { buildProduct, brandsDoluFixture, categoriesDoluFixture, choicesDoluFixture } from '../fixtures/apiData'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.A7_REVIEW === '1'
const WIDTH = Number(process.env.A7_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.A7_REVIEW_OUT || 'docs/a7-review/after'
const ONLY = (process.env.A7_REVIEW_ONLY || '').split(',').filter(Boolean)
const NOW = new Date('2026-09-30T09:00:00.000Z')
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

const editProduct = buildProduct({
  _id: 'product-a7-edit',
  title: 'Organik pamuklu basic tişört',
  hasVariant: false,
  variants: [{ tempId: 'single-a7', stockcode: 'SK-A7-001', barcode: '8690000000777', choices: [], prices: { salePrice: 249.9, marketPrice: 299.9, isPlatformBasedPrice: false }, stock: 14, images: [], platforms: {} }],
  images: [],
  category: 'cat-e2e-2',
  brand: 'brand-e2e-1',
})

function menu() {
  return [
    ...reviewMenuFixture(),
    { group: 'a7HiddenProductUpdate', links: [{ code: 'ProductUpdateView', parent: '', title: 'productUpdate', singleton: false }] },
  ]
}

async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function open(page: Page, key: string, query = '') {
  await installApiMocks(page, reviewMocks({
    MenuService: menu(),
    CategoryService: categoriesDoluFixture,
    BrandService: brandsDoluFixture,
    ChoiceService: choicesDoluFixture,
    'ProductService/retrieveProduct': { product: editProduct },
    getImages: { images: [] },
  }))
  await page.goto(reviewPath(key) + query)
  await waitForWorkplaceReady(page)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.locator('.workplace-area h1:visible').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await settle(page, 900)
}

async function openDeep(page: Page) {
  await open(page, 'adminPanel/IntegrationConfigListView')
  await page.locator('.integrationConfigListView').getByRole('button', { name: 'Trendyol detayını aç' }).first().click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Trendyol' })
  await dialog.getByRole('button', { name: 'Etkin yapılandırmayı gör' }).click()
  await expect(page.locator('.effectiveConfigView:not(.hide-tab-component) h1')).toBeVisible({ timeout: 15_000 })
  await settle(page, 900)
}

async function shoot(page: Page, name: string) {
  await settle(page, 300)
  await page.mouse.move(1, HEIGHT - 2)
  await page.screenshot({ path: `${OUT}/${name}-${WIDTH}.png` })
  // Yakın çekim: etkin sekmenin başlık satırı (+ çevresi), çözünürlük için CSS ölçeği.
  const bar = page.locator('.workplace-area .ek-page-bar:visible').first()
  const box = await bar.boundingBox()
  if (box) {
    const pad = 16
    await page.screenshot({
      path: `${OUT}/${name}-${WIDTH}-yakin.png`,
      clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - 44), width: Math.min(WIDTH - Math.max(0, box.x - pad), box.width + pad * 2), height: box.height + 44 + pad * 2 },
      scale: 'device',
    })
  }
}

const CASES: Array<{ name: string; run: (p: Page) => Promise<void> }> = [
  {
    name: 'a-liste',
    run: async (p) => {
      await open(p, 'OrderListView')
      await shoot(p, 'a-liste')
    },
  },
  {
    name: 'b-liste-hakkinda',
    run: async (p) => {
      await open(p, 'OrderListView')
      await p.locator('.workplace-area .orderListView').getByRole('button', { name: /^Sayfa hakkında/ }).click()
      await settle(p, 500)
      await shoot(p, 'b-liste-hakkinda')
    },
  },
  {
    name: 'c-derin-rota',
    run: async (p) => {
      await openDeep(p)
      await shoot(p, 'c-derin-rota')
    },
  },
  {
    name: 'd-kayit-detayi',
    run: async (p) => {
      await open(p, 'productDefinitions/ProductListView')
      await p.locator('.productListView tbody tr, .productListView .ek-grid__card').first().locator('button[aria-label="Ürünü düzenle"]').first().click()
      const root = p.locator(`.productUpdateView${editProduct._id}`)
      await expect(root.locator('h1')).toBeVisible({ timeout: 20_000 })
      await settle(p, 900)
      await shoot(p, 'd-kayit-detayi')
    },
  },
  {
    name: 'e-odak',
    run: async (p) => {
      await openDeep(p)
      const bar = p.locator('.workplace-area .ek-page-bar:visible').first()
      await bar.locator('a, button').first().focus()
      await p.keyboard.press('Tab')
      await p.keyboard.press('Shift+Tab')
      await shoot(p, 'e-odak')
    },
  },
]

test.describe('A7 breadcrumb inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca A7_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 2 })
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW)
  })
  for (const c of CASES) {
    if (!want(c.name)) continue
    test(c.name, async ({ page }) => {
      test.setTimeout(60_000)
      await c.run(page)
    })
  }
})
