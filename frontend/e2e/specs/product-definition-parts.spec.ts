// ADR-0015 B5-2 — ProductUpdateView içindeki ürün bileşenleri (karakterizasyon, Protokol 13, ÖNCE yenileme):
//  - crud/ProductImagesComponent          — "Ürün Tanımı" adımındaki "Resim Galerisi" butonu
//  - variants/ProductSingleVariantComponent — varyantsız üründe "Tekil Ürün Bilgisi" adımı
//  - variants/ProductDetailsComponent      — "Detay Bilgiler" adımı
// ProductUpdateView (B5-1) DOKUNULMADI. GİZLİ DAVRANIŞ (not): ProductCompetitivePricesComponent'i açan
// `isCompetitivePricesDialog` hiçbir yerde `true` yapılmaz — arayüzden erişilemez, karakterize EDİLMEZ.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { buildProduct, choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'
import { menuFixtureWithProductUpdate } from '../fixtures/productUpdate'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const singleProduct = buildProduct({
  _id: 'product-e2e-single',
  title: 'E2E Tekil Ürün',
  hasVariant: false,
  variants: [{ tempId: 'single-e2e-1', stockcode: 'SK-E2E-TEKIL', barcode: '8690000000301', choices: [], prices: { salePrice: 99.9, marketPrice: 119.9, isPlatformBasedPrice: false }, stock: 5, images: [], platforms: {} }],
  images: [],
  // "Ürün Tanımı" adımı yalnızca kategori atanmışsa düzenlenebilir (ProductUpdateView).
  category: 'category-e2e-1',
})

async function openUpdate(page: Page) {
  await installApiMocks(page, {
    MenuService: menuFixtureWithProductUpdate,
    ChoiceService: choicesDoluFixture,
    'ProductService/retrieveProduct': { product: singleProduct },
    getImages: { images: [] },
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()
  const root = page.locator(`.productUpdateView${singleProduct._id}`)
  await expect(root.getByText('Tekil Ürün Bilgisi')).toBeVisible({ timeout: 20_000 })
  return root
}

const shot = (page: Page, name: string) =>
  expect(page).toHaveScreenshot(name, { fullPage: false, mask: [page.locator('.v-snackbar__wrapper')] })

async function axeReport(page: Page, testInfo: any, name: string, include: string) {
  await page.waitForTimeout(400)
  const results = await new AxeBuilder({ page }).include(include).withTags(AXE_TAGS).analyze()
  await testInfo.attach(`axe-${name}-sonuclari.json`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  console.log(`[axe] ${name}: ${results.violations.length} WCAG 2.1 AA ihlali`)
}

test.describe('P3 (B5-2) — Ürün düzenleme parçaları (ProductImages / SingleVariant / Details)', () => {
  test('resim galerisi: "Ürün Tanımı" adımındaki galeri butonu "Ürün Resim Galerisi" kartını açar', async ({ page }, testInfo) => {
    const root = await openUpdate(page)
    await root.getByText('Ürün Tanımı').click()
    await root.getByText('Resim Galerisi').first().click()

    const card = page.locator('.v-overlay--active:not(.v-snackbar)').filter({ hasText: 'Ürün Resim Galerisi' }).first()
    await expect(card).toBeVisible()
    await shot(page, 'product-images.png')
    await axeReport(page, testInfo, 'ProductImagesComponent', '.v-overlay--active:not(.v-snackbar)')
  })

  test('tekil ürün: "Tekil Ürün Bilgisi" adımında stok kodu/barkod/fiyat alanları dolu gelir', async ({ page }, testInfo) => {
    const root = await openUpdate(page)
    await root.getByText('Tekil Ürün Bilgisi').click()

    await expect(root.locator('input').and(page.locator('[value="SK-E2E-TEKIL"]'))).toHaveCount(1)
    await expect(root.locator('input').and(page.locator('[value="8690000000301"]'))).toHaveCount(1)
    await expect(root.getByText('Ürün Özellikleri').first()).toBeVisible()
    await shot(page, 'product-single-variant.png')
    await axeReport(page, testInfo, 'ProductSingleVariantComponent', `.productUpdateView${singleProduct._id}`)
  })

  test('detay bilgiler: maksimum satış adedi/kargo süresi/desi/garanti/KDV alanları varsayılanlarla görünür', async ({ page }, testInfo) => {
    const root = await openUpdate(page)
    await root.getByText('Detay Bilgiler').click()

    for (const label of ['Maksimum Satış Adedi', 'Kargo Süresi', 'Desi', 'Garanti Süresi', 'KDV']) {
      await expect(root.getByText(label, { exact: false }).first()).toBeVisible()
    }
    await shot(page, 'product-details.png')
    await axeReport(page, testInfo, 'ProductDetailsComponent', `.productUpdateView${singleProduct._id}`)
  })
})
