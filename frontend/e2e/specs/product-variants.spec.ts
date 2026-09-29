// ADR-0015 B5-2 — ProductVariantsComponent (karakterizasyon, Protokol 13, ÖNCE görsel yenileme).
//
// Bileşen yalnızca `views/secure/definitions/ProductUpdateView.vue` ve `ProductDefinitionView.vue`
// içinde, "Varyant Bilgileri" adımında (stepper == 2) ve ürün `hasVariant: true` iken render olur.
// En kısa canlı yol: ProductListView satırındaki "Ürünü düzenle" -> ProductUpdateView -> "Varyant
// Bilgileri" adımı. Bu iki view B5-1'in kapsamıdır (DOKUNULMADI); `ProductUpdateView`'in menü
// kaydı paylaşılan `menuFixture`'da olmadığı için, B5-1'in `product-definitions.spec.ts`'indeki
// AYNI desenle bu dosyaya özel sentetik (sidebar'da görünmeyen) bir menü grubu eklenir.
//
// Bileşen tamamen istemci tarafı veriyle çalışır (`productInfoForm.variants`); satır içi düzenleme,
// sıralama ve toplu işlemler API çağırmaz (yalnızca kayıtlı bir varyantın silinmesi
// `VariantService/deleteVariant` çağırır). Seçenek adları açılışta yüklenen `ChoiceService`
// fixture'ından (`choicesDoluFixture`) çözülür.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { buildProduct, choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixture, openScreen } from '../fixtures/nav'

const menuFixtureWithProductUpdate = [
  ...menuFixture,
  {
    group: 'b5_2HiddenProductUpdate',
    links: [
      // `ProductUpdateView`'in `views` Map anahtarı önek TAŞIMAZ (bkz. stores/site/menu.ts) -> parent ''.
      { code: 'ProductUpdateView', parent: '', title: 'productUpdate', singleton: false },
    ],
  },
]

function buildVariant(overrides: Record<string, any> = {}) {
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

const variantProduct = buildProduct({
  _id: 'product-e2e-variant',
  title: 'E2E Varyantlı Ürün',
  hasVariant: true,
  maincode: 'MC-E2E-001',
  variants: [
    buildVariant(),
    buildVariant({ tempId: 'variant-e2e-2', stockcode: 'SK-E2E-BEYAZ', barcode: '8690000000102', choices: [{ choiceId: 'choice-e2e-1', choiceValueId: 'choiceval-e2e-2' }], stock: 0, shelf: undefined, order: 1 }),
  ],
})

async function openVariantStep(page: Page, product: any = variantProduct, overrides: Record<string, any> = {}) {
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
  return root
}

test.describe('P3 (B5-2) — Ürün varyantları (ProductVariantsComponent)', () => {
  test('smoke: varyant satırları stok kodu/barkod/seçenek/fiyat/stok ile render olur', async ({ page }) => {
    const root = await openVariantStep(page)

    await expect(root.getByText('SK-E2E-SIYAH')).toBeVisible()
    await expect(root.getByText('8690000000101')).toBeVisible()
    await expect(root.getByText('SK-E2E-BEYAZ')).toBeVisible()
    // Birinci seçenek (rowspan'li "Varyant" sütunu) değer adı ChoiceService fixture'ından çözülür.
    await expect(root.locator('td').getByText('Siyah', { exact: true })).toBeVisible()
    await expect(root.locator('td').getByText('Beyaz', { exact: true })).toBeVisible()
    // Fiyatlar tr-TR TRY biçiminde (Intl.NumberFormat), stok ve raf ('-' yoksa) gösterilir.
    await expect(root.getByText('₺249,90').first()).toBeVisible()
    await expect(root.getByText('₺299,90').first()).toBeVisible()
    await expect(root.getByText('A-01')).toBeVisible()
    // Başlık sütunları (multipleVariantHeaders) — "Grup" başlığı header.choiceTitle slot'undan gelir.
    await expect(root.getByText('Satış Fiyatı').first()).toBeVisible()
    await expect(root.getByText('Grup', { exact: true })).toBeVisible()
    // Her satırda düzenle (kalem) + sil butonu vardır (hasVariant).
    await expect(root.locator('tbody tr').filter({ hasText: 'SK-E2E-SIYAH' }).locator('.mdi-pencil')).toHaveCount(1)
    await expect(root.locator('tbody tr').filter({ hasText: 'SK-E2E-SIYAH' }).locator('.mdi-delete')).toHaveCount(1)
  })

  test('satır içi düzenleme: stok kodu hücresine tıklayınca Stok Kodu/Barkod alanları açılır', async ({ page }) => {
    const root = await openVariantStep(page)

    await root.getByText('SK-E2E-SIYAH').click()
    await expect(root.getByLabel('Stok Kodu')).toHaveValue('SK-E2E-SIYAH')
    await expect(root.getByLabel('Barkod')).toHaveValue('8690000000101')
  })

  test('varyant işlemleri menüsü: menü butonu "Varyant İşlemleri" listesini açar', async ({ page }) => {
    const root = await openVariantStep(page)

    await root.locator('thead').getByRole('button').filter({ has: page.locator('.mdi-menu') }).click()
    const menu = page.locator('.v-overlay--active .v-list').filter({ hasText: 'Varyant İşlemleri' })
    await expect(menu).toBeVisible()
    for (const label of ['Ara', 'Toplu Özellik Düzenleme', 'Toplu Fiyat Düzenleme', 'Toplu Seçenek Eşleştir', 'Toplu Silme']) {
      await expect(menu.getByText(label, { exact: true })).toBeVisible()
    }
  })

  test('silme (GİZLİ DAVRANIŞ): kaydedilmemiş (_id yok) varyantın sil butonu API çağırmaz ve satır tabloda KALIR', async ({ page }) => {
    // GİZLİ DAVRANIŞ (karakterizasyon, DÜZELTİLMEDİ — BACKLOG önerisi): `deleteVariant()` varyantı
    // `productInfoForm.variants`'tan splice etmeye çalışır, `_id` yoksa API çağırmadan döner; ancak
    // tablo (`originalVariants`, değişmeyen `watch(variants)` yalnızca referans değişiminde tetiklenir)
    // güncellenmez — satır, başka bir satıra tıklanıp yeniden çizildikten SONRA da görünür kalır
    // (bu oturumda Playwright ile gözlendi). Kullanıcı açısından sil butonu "hiçbir şey yapmıyor".
    let deleteCalled = false
    const root = await openVariantStep(page, variantProduct, {
      'VariantService/deleteVariant': async (route: any, headers: any) => {
        deleteCalled = true
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ result: true }) })
      },
    })

    const row = root.locator('tbody tr').filter({ hasText: 'SK-E2E-BEYAZ' })
    await row.getByRole('button').filter({ has: page.locator('.mdi-delete') }).click()
    await page.waitForTimeout(500)
    await expect(root.getByText('SK-E2E-BEYAZ')).toHaveCount(1)
    await expect(root.getByText('SK-E2E-SIYAH')).toBeVisible()
    expect(deleteCalled).toBe(false)
  })

  test('ekran görüntüsü tabanı (ürün varyantları)', async ({ page }) => {
    await openVariantStep(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('product-variants.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    await expect(root.getByText('SK-E2E-SIYAH')).toBeVisible()
    const results = await new AxeBuilder({ page })
      .include(`.productUpdateView${variantProduct._id} .v-data-table`)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    await testInfo.attach('axe-ProductVariantsComponent-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] ProductVariantsComponent: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})
