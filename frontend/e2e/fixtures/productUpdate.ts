// ADR-0015 B5-2 — ProductUpdateView "Varyant Bilgileri" adımına kadar açılış yardımcısı.
// `product-variants.spec.ts` ile AYNI yol (o dosya kendi kopyasını taşır, değiştirilmedi);
// varyant diyalogları spec'i bunu paylaşır. Veri tamamen sentetiktir (Protokol 7).
import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { installApiMocks } from './mockApi'
import { buildProduct, choicesDoluFixture } from './apiData'
import { gotoAuthed, menuFixture, openScreen } from './nav'

export const menuFixtureWithProductUpdate = [
  ...menuFixture,
  {
    group: 'b5_2HiddenProductUpdate',
    links: [
      // `ProductUpdateView`'in `views` Map anahtarı önek TAŞIMAZ (bkz. stores/site/menu.ts) -> parent ''.
      { code: 'ProductUpdateView', parent: '', title: 'productUpdate', singleton: false },
    ],
  },
]

export function buildVariant(overrides: Record<string, any> = {}) {
  return {
    tempId: 'variant-e2e-1',
    stockcode: 'SK-E2E-SIYAH',
    barcode: '8690000000101',
    choices: [{ choiceId: 'choice-e2e-1', choiceValueId: 'choiceval-e2e-1' }],
    prices: { salePrice: 249.9, marketPrice: 299.9, isPlatformBasedPrice: false },
    stock: 12,
    shelf: 'A-01',
    images: [],
    platforms: {},
    order: 0,
    ...overrides,
  }
}

export const variantProduct = buildProduct({
  _id: 'product-e2e-variant',
  title: 'E2E Varyantlı Ürün',
  hasVariant: true,
  maincode: 'MC-E2E-001',
  variants: [
    buildVariant(),
    buildVariant({ tempId: 'variant-e2e-2', stockcode: 'SK-E2E-BEYAZ', barcode: '8690000000102', choices: [{ choiceId: 'choice-e2e-1', choiceValueId: 'choiceval-e2e-2' }], stock: 0, shelf: undefined, order: 1 }),
  ],
})

/** ProductListView -> "Ürünü düzenle" -> ProductUpdateView -> "Varyant Bilgileri"; view kökünü döndürür. */
export async function openVariantStep(page: Page, product: any = variantProduct, overrides: Record<string, any> = {}) {
  await installApiMocks(page, {
    MenuService: menuFixtureWithProductUpdate,
    ChoiceService: choicesDoluFixture,
    'ProductService/retrieveProduct': { product },
    ...overrides,
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()
  const root = page.locator(`.productUpdateView${product._id}`)
  // İlk açılışta view/bileşen parçaları (async chunk) derlenir — geniş bekleme.
  await expect(root.getByText('Varyant Bilgileri')).toBeVisible({ timeout: 20_000 })
  await root.getByText('Varyant Bilgileri').click()
  await expect(root.getByText('SK-E2E-SIYAH')).toBeVisible()
  return root
}
