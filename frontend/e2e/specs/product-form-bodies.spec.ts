// DS-v2 Aşama 2 (form standardı) — ürün güncelleme formu gönderilen GÖVDE karakterizasyonu.
// "Ürün Tanımı" ve "Detay Bilgiler" adımları EkFormGrid düzenine taşınırken aynı kullanıcı adımlarıyla
// `ProductService/updateProduct` gövdesinin değişmediğinin kanıtı. Göçten ÖNCE yazıldı (eski düzende yeşil).
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { buildProduct, brandsDoluFixture, choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'
import { menuFixtureWithProductUpdate } from '../fixtures/productUpdate'

const product = buildProduct({
  _id: 'product-e2e-form',
  title: 'E2E Form Ürünü',
  hasVariant: false,
  variants: [{ tempId: 'single-e2e-form', stockcode: 'SK-E2E-FORM', barcode: '8690000000999', choices: [], prices: { salePrice: 10, marketPrice: 12, isPlatformBasedPrice: false }, stock: 3, images: [], platforms: {} }],
  images: [],
  category: 'category-e2e-1',
  // Güncelle yalnızca kategori + marka + tamamlanmış varyant varken etkin (isUpdateDisabled).
  brand: 'brand-e2e-1',
})

async function openUpdate(page: Page, captured: { body: any }) {
  await installApiMocks(page, {
    MenuService: menuFixtureWithProductUpdate,
    ChoiceService: choicesDoluFixture,
    BrandService: brandsDoluFixture,
    'ProductService/retrieveProduct': { product },
    getImages: { images: [] },
    'ProductService/updateProduct': async (route: any, headers: Record<string, string>) => {
      captured.body = route.request().postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({}) })
    },
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()
  const root = page.locator(`.productUpdateView${product._id}`)
  await expect(root.getByText('Tekil Ürün Bilgisi')).toBeVisible({ timeout: 20_000 })
  return root
}

test.describe('DS-v2 A2 — ürün güncelleme formu: gönderilen gövde (karakterizasyon)', () => {
  test('Ürün Tanımı başlığı + Detay Bilgiler alanları değişince updateProduct gövdesi', async ({ page }) => {
    const captured: { body: any } = { body: null }
    const root = await openUpdate(page, captured)

    await root.getByText('Ürün Tanımı', { exact: true }).click()
    const title = root.getByLabel(/Ürün Başlığı/).first()
    await expect(title).toHaveValue('E2E Form Ürünü')
    await title.fill('E2E Form Ürünü Yeni')

    await root.getByText('Detay Bilgiler', { exact: true }).click()
    await root.getByLabel(/Maksimum Satış Adedi/).first().fill('7')
    await root.getByLabel(/Kargo Süresi/).first().fill('2')
    await root.getByLabel(/Desi/).first().fill('4')
    await root.getByLabel(/Garanti Süresi/).first().fill('24')

    await root.getByRole('button', { name: 'Güncelle' }).click()
    await expect.poll(() => captured.body).not.toBeNull()
    const info = captured.body.productInfo
    expect(info._id).toBe('product-e2e-form')
    expect(info.title).toBe('E2E Form Ürünü Yeni')
    expect(info.category).toBe('category-e2e-1')
    expect(info.brand).toBe('brand-e2e-1')
    expect(info.hasVariant).toBe(false)
    expect(info.maxPurchaseQuantity).toBe('7')
    expect(info.shippingDuration).toBe('2')
    expect(info.desi).toBe('4')
    expect(info.warranty).toBe('24')
    expect(info.variants.map((v: any) => [v.stockcode, v.barcode])).toEqual([['SK-E2E-FORM', '8690000000999']])
    // Gövdenin anahtar kümesi de sabittir (form düzeni gövdeye alan eklemez/çıkarmaz).
    expect(Object.keys(info).sort()).toEqual(['_id', 'brand', 'category', 'desi', 'hasVariant', 'hashtags', 'images', 'maxPurchaseQuantity', 'onsale', 'platformUploads', 'prices', 'shippingDuration', 'stock', 'title', 'variants', 'warranty'])
  })

  test('Tekil Ürün Bilgisi alanları değişince varyant gövdesi (stok kodu/barkod/stok/raf/fiyat)', async ({ page }) => {
    const captured: { body: any } = { body: null }
    const root = await openUpdate(page, captured)
    await root.getByText('Tekil Ürün Bilgisi', { exact: true }).click()
    await root.getByLabel(/Stok Kodu/).first().fill('SK-E2E-FORM-2')
    await root.getByLabel(/Barkod/).first().fill('8690000000888')
    await root.getByLabel(/Stok Adedi/).first().fill('9')
    await root.getByLabel(/Raf/).first().fill('B-02')
    await root.getByLabel(/Satış Fiyatı/).first().fill('15,50')
    await root.getByLabel(/Satış Fiyatı/).first().blur()
    await root.getByRole('button', { name: 'Güncelle' }).click()
    await expect.poll(() => captured.body).not.toBeNull()
    const v = captured.body.productInfo.variants[0]
    expect(v.stockcode).toBe('SK-E2E-FORM-2')
    expect(v.barcode).toBe('8690000000888')
    expect(v.stock).toBe('9')
    expect(v.shelf).toBe('B-02')
    expect(v.prices).toEqual({ salePrice: 15.5, marketPrice: 12, isPlatformBasedPrice: false })
  })
})
