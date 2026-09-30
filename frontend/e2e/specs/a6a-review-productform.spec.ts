// DS-v2 A6a — ürün ekleme/düzenleme sihirbazı inceleme görüntüleri (alan: productform).
// İddia yok; yalnızca inceleme görüntüsü üretir. Günlük koşuda ATLANIR. Saat sabit.
//   A6A_REVIEW=1 A6A_PHASE=before A6A_WIDTH=1440 E2E_PORT=4373 \
//     npx playwright test e2e/specs/a6a-review-productform.spec.ts --project=chromium-desktop --workers=1
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { buildProduct, brandsDoluFixture, categoriesDoluFixture, choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixture, openScreen } from '../fixtures/nav'

const ENABLED = process.env.A6A_REVIEW === '1'
const PHASE = process.env.A6A_PHASE === 'after' ? 'after' : 'before'
const WIDTH = Number(process.env.A6A_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 1000
const OUT = process.env.A6A_OUT || 'docs/a6a-review'
const NOW = new Date('2026-09-30T09:00:00.000Z')

const menu = [
  ...menuFixture,
  {
    group: 'a6aHiddenProductForm',
    links: [
      { code: 'ProductDefinitionView', parent: 'definitions', title: 'productDefinition', singleton: true },
      { code: 'ProductUpdateView', parent: '', title: 'productUpdate', singleton: false },
    ],
  },
]

const editProduct = buildProduct({
  _id: 'product-a6a-edit',
  title: 'Organik pamuklu basic tişört',
  hasVariant: false,
  variants: [{ tempId: 'single-a6a', stockcode: 'SK-A6A-001', barcode: '8690000000777', choices: [], prices: { salePrice: 249.9, marketPrice: 299.9, isPlatformBasedPrice: false }, stock: 14, images: [], platforms: {} }],
  images: [],
  category: 'cat-e2e-2',
  brand: 'brand-e2e-1',
})

const fileName = (name: string) => `${OUT}/productform-${name}-${PHASE}-${WIDTH}.png`

async function settle(page: Page, ms = 500) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function shoot(page: Page, name: string) {
  await settle(page, 400)
  await page.screenshot({ path: fileName(name) })
}

async function mocks(page: Page) {
  await installApiMocks(page, {
    MenuService: menu,
    CategoryService: categoriesDoluFixture,
    BrandService: brandsDoluFixture,
    ChoiceService: choicesDoluFixture,
    'ProductService/retrieveProduct': { product: editProduct },
    getImages: { images: [] },
  })
}

async function openAdd(page: Page) {
  await mocks(page)
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.getByRole('button', { name: 'Yeni ürün', exact: true }).click()
  const root = page.locator('.productDefinitionView')
  await expect(root).toBeVisible()
  await settle(page, 700)
  return root
}

async function pickCategory(page: Page, root: ReturnType<Page['locator']>) {
  await root.getByText('E2E Kategori Bir').first().click()
  await root.getByText('E2E Alt Kategori').first().click()
  await settle(page, 300)
}

test.describe('A6a ürün formu inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca A6A_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW)
  })

  test('ekleme: kategori adımı', async ({ page }) => {
    await openAdd(page)
    await shoot(page, 'ekle-kategori')
  })

  test('ekleme: ürün tanımı adımı (eksik alanlarla)', async ({ page }) => {
    const root = await openAdd(page)
    await pickCategory(page, root)
    await root.getByText('Ürün Tanımı', { exact: true }).click()
    await settle(page, 600)
    await shoot(page, 'ekle-tanim')
  })

  test('ekleme: tekil ürün adımı (boş)', async ({ page }) => {
    const root = await openAdd(page)
    await pickCategory(page, root)
    await root.getByText('Ürün Tanımı', { exact: true }).click()
    await root.getByLabel(/Ürün Başlığı/).first().fill('Organik pamuklu basic tişört')
    await root.getByText('Tekil Ürün Bilgisi', { exact: true }).click()
    await settle(page, 600)
    await shoot(page, 'ekle-tekil')
  })

  test('ekleme: detay adımı', async ({ page }) => {
    const root = await openAdd(page)
    await pickCategory(page, root)
    await root.getByText('Ürün Tanımı', { exact: true }).click()
    await root.getByLabel(/Ürün Başlığı/).first().fill('Organik pamuklu basic tişört')
    await root.getByText('Detay Bilgiler', { exact: true }).click()
    await settle(page, 600)
    await shoot(page, 'ekle-detay')
  })

  test('ekleme: kaydet öncesi eksikler', async ({ page }) => {
    const root = await openAdd(page)
    await pickCategory(page, root)
    await root.getByText('Ürün Tanımı', { exact: true }).click()
    await root.getByLabel(/Ürün Başlığı/).first().fill('Organik pamuklu basic tişört')
    await root.getByText('Tekil Ürün Bilgisi', { exact: true }).click()
    await root.getByLabel(/Stok Kodu/).first().fill('SK-A6A-001')
    await settle(page, 300)
    if (PHASE === 'after') {
      await root.getByRole('button', { name: 'Eksikleri göster' }).click()
      await settle(page, 500)
    }
    await shoot(page, 'ekle-eksikler')
  })

  test('düzenleme: platform bazında fiyat kartı (kanal bölümleri)', async ({ page }) => {
    const channelProduct = buildProduct({
      ...editProduct,
      _id: 'product-a6a-channels',
      variants: [{ ...editProduct.variants[0], tempId: 'single-a6a-ch', prices: { salePrice: 249.9, marketPrice: 299.9, isPlatformBasedPrice: true }, platforms: { trendyol: { attributes: {}, prices: { salePrice: 249.9, marketPrice: 299.9 } } } }],
    })
    await installApiMocks(page, {
      MenuService: menu,
      CategoryService: categoriesDoluFixture,
      BrandService: brandsDoluFixture,
      ChoiceService: choicesDoluFixture,
      'ProductService/retrieveProduct': { product: channelProduct },
      getImages: { images: [] },
    })
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()
    const root = page.locator(`.productUpdateView${channelProduct._id}`)
    await expect(root.getByText('Tekil Ürün Bilgisi')).toBeVisible({ timeout: 20_000 })
    await root.getByText('Tekil Ürün Bilgisi', { exact: true }).click()
    await root.getByRole('button', { name: /Platform fiyatlarını düzenle/ }).click()
    await expect(page.locator('.v-overlay--active').filter({ hasText: 'Platform Bazında Varyant Fiyatları' }).first()).toBeVisible()
    await settle(page, 600)
    await shoot(page, 'kanal-fiyatlari')
  })

  test('düzenleme: ürün tanımı adımı', async ({ page }) => {
    await mocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()
    const root = page.locator(`.productUpdateView${editProduct._id}`)
    await expect(root.getByText('Tekil Ürün Bilgisi')).toBeVisible({ timeout: 20_000 })
    await settle(page, 600)
    await shoot(page, 'duzenle-acilis')
    await root.getByText('Ürün Tanımı', { exact: true }).click()
    await settle(page, 600)
    await shoot(page, 'duzenle-tanim')
  })
})
