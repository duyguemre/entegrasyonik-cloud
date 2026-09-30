// FR2 (cloud/fe-r2b) — kanal rozeti + ürün listesi İNCELEME görüntüleri (belge görselleri; Playwright tabanı DEĞİLDİR).
// Yalnız `FE_R2B_CAPTURE=<etiket>` (ör. `once`, `sonra`) verildiğinde çalışır ve `frontend/docs/fe-r2b-review/`
// altına `<ad>-<genişlik>-<etiket>.png` yazar. Görseller sahte ağdan (route) üretilen SVG ürün fotoğraflarıdır.
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { buildProduct, choicesDoluFixture, ordersDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'

const LABEL = process.env.FE_R2B_CAPTURE
const OUT = 'docs/fe-r2b-review'
const WIDTHS = [1440, 390] as const

const IMG = (name: string) => `https://img.e2e.invalid/${name}.svg`
const PHOTO: Record<string, [string, string, string]> = {
  // ad → [zemin, ürün gövdesi, vurgu] — yalnız sahte fotoğraf üretimi için (uygulama rengi değil)
  tshirt: ['#F4F1EC', '#2F4B7C', '#E9E4DA'],
  tshirt2: ['#F4F1EC', '#B8433A', '#E9E4DA'],
  sneaker: ['#FFFFFF', '#EDEDED', '#1F1F1F'],
  mug: ['#EEF3F6', '#FFFFFF', '#6B8FA3'],
  lamp: ['#F7F3EA', '#C9A15B', '#3B3B3B'],
  bag: ['#FAF7F2', '#8A5A3B', '#D9C3A5'],
}

function photoSvg(name: string, w = 800, h = 1000): string {
  const [bg, body, accent] = PHOTO[name.replace(/-\d+$/, '')] ?? ['#EEE', '#999', '#555']
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="100%" height="100%" fill="${bg}"/>
  <ellipse cx="${w / 2}" cy="${h * 0.86}" rx="${w * 0.32}" ry="${h * 0.03}" fill="#000" opacity=".08"/>
  <rect x="${w * 0.22}" y="${h * 0.2}" width="${w * 0.56}" height="${h * 0.62}" rx="${w * 0.08}" fill="${body}"/>
  <rect x="${w * 0.3}" y="${h * 0.3}" width="${w * 0.4}" height="${h * 0.12}" rx="${w * 0.03}" fill="${accent}"/>
</svg>`
}

async function routeImages(page: Page) {
  await page.route('https://img.e2e.invalid/**', (route) => {
    const name = new URL(route.request().url()).pathname.slice(1).replace(/\.svg$/, '')
    const wide = name.endsWith('-2')
    return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: wide ? photoSvg(name, 1200, 800) : photoSvg(name) })
  })
}

const up = (status: string, onSale?: boolean) => ({ upload: { TRANSFER: { status }, ...(onSale === undefined ? {} : { onSale }) } })

function variant(i: number, choiceValueId: string, platforms: Record<string, any>, extra: Record<string, any> = {}) {
  return {
    _id: `v-r2b-${i}`,
    stockcode: `TS-${i}`,
    barcode: `86900000003${String(i).padStart(2, '0')}`,
    choices: [{ choiceId: 'choice-e2e-1', choiceValueId, slicer: true }],
    prices: { salePrice: 249.9, marketPrice: 299.9, isPlatformBasedPrice: false },
    stock: 12 - i * 3,
    images: [IMG(i % 2 ? 'tshirt2' : 'tshirt')],
    platforms,
    ...extra,
  }
}

const products = [
  buildProduct({
    _id: 'p-r2b-1', title: 'Basic pamuklu tişört — oversize kesim', hasVariant: true, stock: 21,
    images: [{ url: IMG('tshirt'), order: 0 }, { url: IMG('tshirt2'), order: 1 }, { url: IMG('tshirt-2'), order: 2 }],
    prices: { minSalePrice: 249.9, maxSalePrice: 279.9 },
    variants: [
      variant(1, 'choiceval-e2e-1', { trendyol: up('COMPLETED', true), hepsiburada: up('FAILED') }),
      variant(2, 'choiceval-e2e-2', { trendyol: up('COMPLETED', true), hepsiburada: up('WAITING') }),
      variant(3, 'choiceval-e2e-1', { trendyol: up('COMPLETED', false) }),
    ],
  }),
  buildProduct({
    _id: 'p-r2b-2', title: 'Koşu ayakkabısı Air Lite', stock: 8,
    images: [{ url: IMG('sneaker-2'), order: 0 }, { url: IMG('sneaker'), order: 1 }],
    variants: [{ stockcode: 'SN-001', barcode: '8690000000401', order: 0, platforms: { trendyol: up('COMPLETED', true), hepsiburada: up('COMPLETED', true), ideasoft: up('SENT') } }],
    platformUploads: { trendyol: { isUploaded: true, isReady: true }, hepsiburada: { isUploaded: true, isReady: true }, ideasoft: { isReady: true } },
  }),
  buildProduct({
    _id: 'p-r2b-3', title: 'Seramik kupa 350 ml', stock: 0, onsale: false,
    images: [{ url: IMG('mug'), order: 0 }],
    variants: [{ stockcode: 'MG-350', barcode: '8690000000402', order: 0, platforms: { trendyol: up('FAILED') } }],
    platformUploads: { trendyol: { isReady: true } },
  }),
  buildProduct({
    _id: 'p-r2b-4', title: 'Masa lambası (görselsiz ürün)', stock: 4, images: [],
    variants: [{ stockcode: 'LM-01', barcode: '8690000000403', order: 0 }],
  }),
  buildProduct({
    _id: 'p-r2b-5', title: 'Deri sırt çantası', stock: 15,
    images: [{ url: IMG('bag'), order: 0 }, { url: IMG('bag-2'), order: 1 }, { url: IMG('lamp'), order: 2 }, { url: IMG('mug'), order: 3 }, { url: IMG('sneaker'), order: 4 }, { url: IMG('tshirt'), order: 5 }],
    variants: [{ stockcode: 'BG-01', barcode: '8690000000404', order: 0, platforms: { hepsiburada: up('COMPLETED', true), ideasoft: up('PENDING') } }],
    platformUploads: { hepsiburada: { isUploaded: true } },
  }),
]

async function openProducts(page: Page) {
  await routeImages(page)
  await installApiMocks(page, {
    ChoiceService: choicesDoluFixture,
    'ProductService/getProducts': { products, totalNumberOfRecords: products.length, fromTo: `1-${products.length} / ${products.length}`, isFiltered: false },
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await expect(page.locator('.productListView').getByText('Koşu ayakkabısı Air Lite', { exact: true })).toBeVisible()
  await page.waitForTimeout(600)
}

async function dismissTour(page: Page) {
  const later = page.getByRole('button', { name: 'Şimdi değil' })
  if (await later.isVisible().catch(() => false)) await later.click()
}

const shot = async (page: Page, name: string, w: number, fullPage = false) => {
  await dismissTour(page)
  await page.waitForTimeout(250)
  return page.screenshot({ path: `${OUT}/${name}-${w}-${LABEL}.png`, fullPage, animations: 'disabled' })
}

test.describe('FR2 fe-r2b inceleme görüntüleri', () => {
  test.skip(!LABEL, 'FE_R2B_CAPTURE verilmedi')
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'chromium-desktop', 'yalnız bir projede'))

  for (const w of WIDTHS) {
    test(`ürün listesi ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w > 600 ? 900 : 844 })
      await openProducts(page)
      await shot(page, 'urun-listesi', w)
    })

    test(`varyant açılımı ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w > 600 ? 900 : 844 })
      await openProducts(page)
      const row = page.locator('.productListView tbody tr').filter({ hasText: 'Basic pamuklu tişört' }).first()
      await dismissTour(page)
      await row.locator('.plv-variants-toggle').click()
      await expect(page.locator('#variant-target-p-r2b-1 table')).toBeVisible({ timeout: 20_000 })
      await page.waitForTimeout(500)
      await page.locator('#variant-target-p-r2b-1').scrollIntoViewIfNeeded()
      await shot(page, 'varyant-acilimi', w)
    })

    test(`sipariş listesi kanal rozetleri ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w > 600 ? 900 : 844 })
      await installApiMocks(page, { 'OrderService/getOrders': ordersDoluFixture })
      await gotoAuthed(page)
      await openScreen(page, 'OrderListView')
      await page.waitForTimeout(800)
      await shot(page, 'siparis-listesi', w)
    })

    test(`vitrin rozet bölümü ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w > 600 ? 900 : 844 })
      await installApiMocks(page)
      await page.goto('/design-system')
      await page.locator('#rozet').scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
      await page.locator('#rozet').screenshot({ path: `${OUT}/vitrin-rozet-${w}-${LABEL}.png`, animations: 'disabled' })
    })
  }

  test('hover önizleme 1440', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openProducts(page)
    const row = page.locator('.productListView tbody tr').filter({ hasText: 'Deri sırt çantası' }).first()
    await dismissTour(page)
    await row.locator('.pth').first().hover()
    await page.waitForTimeout(1200)
    await shot(page, 'hover-onizleme', 1440)
  })

  for (const w of WIDTHS) {
    test(`kanal durumu paneli ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w > 600 ? 900 : 844 })
      await openProducts(page)
      await dismissTour(page)
      const row = page.locator('.productListView tbody tr').filter({ hasText: 'Seramik kupa' }).first()
      await row.locator('.pcs').click()
      await expect(page.locator('.pcs-panel')).toBeVisible()
      await page.waitForTimeout(400)
      await shot(page, 'kanal-paneli', w)
    })

    test(`galeri ${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w > 600 ? 900 : 844 })
      await openProducts(page)
      await dismissTour(page)
      const row = page.locator('.productListView tbody tr').filter({ hasText: 'Deri sırt çantası' }).first()
      await row.locator('button.pth').click()
      await expect(page.locator('.pgd')).toBeVisible()
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(600)
      await shot(page, 'galeri', w)
    })
  }
})
