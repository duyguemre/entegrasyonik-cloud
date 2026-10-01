// FR2-PFORM (bulut fe-r2c) — inceleme görüntüleri (iddia yok; yalnız `frontend/docs/fe-r2c-review/`).
// Çalıştırma: R2C_REVIEW=before|after npx playwright test -c playwright.cloud.config.ts fe-r2c-review --project=chromium-desktop
// R2C_REVIEW verilmezse atlanır (günlük koşuyu yavaşlatmaz). Görüntüler 1440 ve 390 genişlikte alınır.
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { brandsDoluFixture, categoriesDoluFixture, choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'
import { menuFixtureWithProductUpdate } from '../fixtures/productUpdate'
import { galleryImages, r2cSingleProduct, r2cVariantProduct } from '../fixtures/productFormR2c'

const TAG = process.env.R2C_REVIEW
const OUT = 'docs/fe-r2c-review'
const WIDTHS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
]

test.skip(!TAG, 'R2C_REVIEW=before|after ile çalıştırılır')

async function open(page: Page, product: any, extra: Record<string, any> = {}) {
  await installApiMocks(page, {
    MenuService: menuFixtureWithProductUpdate,
    ChoiceService: choicesDoluFixture,
    BrandService: brandsDoluFixture,
    CategoryService: categoriesDoluFixture,
    'ProductService/retrieveProduct': { product },
    getImages: { images: galleryImages },
    ...extra,
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()
  const root = page.locator(`.productUpdateView${product._id}`)
  await expect(root.getByText('Ürün Tanımı').first()).toBeVisible({ timeout: 20_000 })
  // tanıtım turu kartı ekranın bir kısmını örter — inceleme görüntüsünde kapatılır
  await page.getByRole('button', { name: 'Şimdi değil' }).click({ timeout: 3000 }).catch(() => undefined)
  return root
}

const snap = (page: Page, name: string, w: number) =>
  page.screenshot({ path: `${OUT}/${name}-${TAG}-${w}.png`, animations: 'disabled' })

for (const { w, h } of WIDTHS) {
  test.describe(`r2c inceleme ${w}`, () => {
    test.use({ viewport: { width: w, height: h } })

    test(`marka combobox (yeni marka ekle) ${w}`, async ({ page }) => {
      const root = await open(page, r2cSingleProduct)
      await root.getByText('Ürün Tanımı').first().click()
      const brand = root.locator('[data-pf-field="brand"]')
      await brand.locator('input').first().click()
      await page.waitForTimeout(400)
      await snap(page, 'brand-combobox', w)
      await page.keyboard.type('Yeni Marka')
      await page.waitForTimeout(300)
      await snap(page, 'brand-combobox-typed', w)
    })

    test(`galeri ${w}`, async ({ page }) => {
      const root = await open(page, r2cSingleProduct)
      await root.getByText('Ürün Tanımı').first().click()
      await root.locator('[data-pf-field="gallery"]').click()
      const card = page.locator('.v-overlay--active').filter({ hasText: 'Resim Galerisi' }).first()
      await expect(card).toBeVisible()
      await page.waitForTimeout(600)
      await snap(page, 'gallery', w)
      if (w > 600) {
        // sürükleme anı: 3. görseli tutup sağa taşı (hayalet fare altında olmalı)
        const tile = card.locator('.pig-tile').nth(2)
        const box = (await tile.boundingBox())!
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 10, { steps: 4 })
        await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2 + 40, { steps: 8 })
        await page.waitForTimeout(200)
        await page.mouse.move(box.x + box.width / 2 + 170, box.y + box.height / 2 + 44, { steps: 2 })
        await snap(page, 'gallery-drag', w)
        await page.mouse.up()
      }
    })

    test(`galeri varyant görselleri ${w}`, async ({ page }) => {
      const root = await open(page, r2cVariantProduct)
      await root.getByText('Ürün Tanımı').first().click()
      await root.locator('[data-pf-field="gallery"]').click()
      const card = page.locator('.v-overlay--active').filter({ hasText: 'Resim Galerisi' }).first()
      await expect(card).toBeVisible()
      await card.getByRole('tab', { name: /Varyantlar/ }).click()
      await page.waitForTimeout(600)
      await snap(page, 'gallery-variants', w)
    })

    test(`tekil ürün kanal fiyatı ${w}`, async ({ page }) => {
      const root = await open(page, r2cSingleProduct)
      await root.getByText('Tekil Ürün Bilgisi').first().click()
      await page.waitForTimeout(400)
      await snap(page, 'single-variant', w)
      await root.locator('[data-pf-field="channelPrices"], .psvc-platform-prices').first().click({ timeout: 5000 })
      await page.waitForTimeout(600)
      await snap(page, 'channel-prices', w)
    })

    test(`varyant ızgarası ${w}`, async ({ page }) => {
      const root = await open(page, r2cVariantProduct)
      await root.getByText('Varyant Bilgileri').first().click()
      await expect(root.getByText('SK-R2C-SIYAH-S')).toBeVisible()
      await page.waitForTimeout(500)
      await snap(page, 'variant-grid', w)
      // hücre içi düzenleme: stok hücresine çift tık
      const cell = root.locator('.vg-row').first().locator('.vg-cell').nth(4)
      await cell.dblclick()
      await page.waitForTimeout(300)
      await snap(page, 'variant-inline-edit', w)
    })
  })
}
