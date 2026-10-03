// ADR-0015 B5-2 — ProductVariantsComponent (karakterizasyon, Protokol 13, ÖNCE görsel yenileme).
//
// Bileşen yalnızca `views/secure/definitions/ProductUpdateView.vue` ve `ProductDefinitionView.vue`
// içinde, "Varyant Bilgileri" adımında (stepper == 2) ve ürün `hasVariant: true` iken render olur.
// En kısa canlı yol: ProductListView satırındaki "Ürünü düzenle" -> ProductUpdateView -> "Varyant
// Bilgileri" adımı. Bu iki view B5-1'in kapsamıdır (DOKUNULMADI); `ProductUpdateView`'in menü
// kaydı paylaşılan `menuFixture`'da olmadığı için, B5-1'in `product-definitions.spec.ts`'indeki
// AYNI desenle bu dosyaya özel sentetik (sidebar'da görünmeyen) bir menü grubu eklenir.
//
// FR2-PFORM (varyant izgarası): eski v-data-table yerine sanal kaydırmalı tablo-ızgara (VariantGrid, role=grid);
// seçenekler ayrı sütun yerine stok kodunun altında tek satır, işlem menüsü "Varyant işlemleri" (EkContextMenu).
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
  // FR2 kabuk: ilk ziyaret "Uygulamayı tanıyın" teklif kartı (sağ alt/mobilde alt şerit, fixed) alttaki satır eylemlerini örter.
  await page.getByRole('button', { name: 'Şimdi değil' }).click({ timeout: 3000 }).catch(() => undefined)
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
    const grid = root.getByRole('grid', { name: 'Varyantlar' })

    await expect(root.getByRole('heading', { level: 2, name: 'Varyantlar' })).toBeVisible()
    await expect(root.getByText('2 varyant')).toBeVisible()
    await expect(grid.getByText('SK-E2E-SIYAH', { exact: true })).toBeVisible()
    await expect(grid.getByText('8690000000101', { exact: true })).toBeVisible()
    await expect(grid.getByText('SK-E2E-BEYAZ', { exact: true })).toBeVisible()
    // Birinci seçenek (rowspan'li grup sütunu, rowheader) değer adı ChoiceService fixture'ından çözülür.
    await expect(grid.getByRole('rowheader', { name: /Siyah/ })).toBeVisible()
    await expect(grid.getByRole('rowheader', { name: /Beyaz/ })).toBeVisible()
    // Fiyatlar tr-TR TRY biçiminde (Intl.NumberFormat), stok ve raf ('-' yoksa) gösterilir.
    await expect(grid.getByText('₺249,90').first()).toBeVisible()
    await expect(grid.getByText('₺299,90').first()).toBeVisible()
    await expect(grid.getByText('A-01', { exact: true })).toBeVisible()
    // Başlık sütunları — grup sütununun başlığı seçenek grubunun adıdır (ChoiceService), yoksa "Grup".
    for (const name of ['E2E Renk Grubu', 'Stok kodu', 'Barkod', 'Satış fiyatı', 'Piyasa fiyatı', 'Kanal fiyatı', 'Stok', 'Raf']) {
      await expect(grid.getByRole('columnheader', { name, exact: true })).toBeVisible()
    }
    // Her satırda düzenle (kalem) + sil butonu vardır (hasVariant).
    const row = grid.getByRole('row').filter({ hasText: 'SK-E2E-SIYAH' })
    await expect(row.getByRole('button', { name: 'Varyantı düzenle' })).toHaveCount(1)
    await expect(row.getByRole('button', { name: 'Varyantı sil' })).toHaveCount(1)
  })

  test('satır içi düzenleme: stok kodu hücresine çift tıklayınca hücre girdiye dönüşür, Enter değeri işler', async ({ page }) => {
    const root = await openVariantStep(page)
    const grid = root.getByRole('grid', { name: 'Varyantlar' })

    await grid.getByRole('gridcell').filter({ hasText: 'SK-E2E-SIYAH' }).dblclick()
    const input = grid.getByRole('textbox', { name: /^Stok kodu/ })
    await expect(input).toHaveValue('SK-E2E-SIYAH')
    await input.fill('SK-E2E-DEGISTI')
    await input.press('Enter')
    await expect(grid.getByText('SK-E2E-DEGISTI', { exact: true })).toBeVisible()
    await expect(root.getByRole('status').filter({ hasText: 'kaydedilmedi' })).toContainText('1 hücre değişti')
  })

  test('varyant işlemleri menüsü: menü butonu "Varyant İşlemleri" listesini açar', async ({ page }) => {
    const root = await openVariantStep(page)

    await root.getByRole('button', { name: 'Varyant işlemleri' }).click()
    // DS-v2 A2: EkContextMenu (role=menu) — eski .v-list seçicisi bilinçli güncellendi.
    const menu = page.locator('.v-overlay--active [role="menu"]').filter({ hasText: 'Varyant İşlemleri' })
    await expect(menu).toBeVisible()
    for (const label of ['Ara', 'Toplu düzenle', 'Toplu özellik düzenle', 'Toplu Seçenek Eşleştir', 'Stok kodlarını oluştur', 'Barkodları oluştur', 'Toplu Silme']) {
      await expect(menu.getByText(label, { exact: true })).toBeVisible()
    }
  })

  test('silme: kaydedilmemiş (_id yok) varyant onay sonrası formdan kalkar, API çağırmaz', async ({ page }) => {
    // Eski GİZLİ DAVRANIŞ ("sil butonu hiçbir şey yapmıyor", satır tabloda kalıyordu) FR2 ızgarasında GİDERİLDİ:
    // sil → EkConfirmDialog ("Varyant formdan kaldırılır; ürünü kaydedene kadar kalıcı olmaz.") → satır kalkar;
    // `_id` yoksa VariantService/deleteVariant ÇAĞRILMAZ (kayıtlı varyantta çağrılır).
    let deleteCalled = false
    const root = await openVariantStep(page, variantProduct, {
      'VariantService/deleteVariant': async (route: any, headers: any) => {
        deleteCalled = true
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ result: true }) })
      },
    })
    const grid = root.getByRole('grid', { name: 'Varyantlar' })

    await grid.getByRole('row').filter({ hasText: 'SK-E2E-BEYAZ' }).getByRole('button', { name: 'Varyantı sil' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog.getByRole('heading', { level: 2 })).toHaveText("'SK-E2E-BEYAZ' silinsin mi?")
    await expect(dialog).toContainText('Varyant formdan kaldırılır')
    await dialog.getByRole('button', { name: 'Sil' }).click()
    await expect(grid.getByText('SK-E2E-BEYAZ', { exact: true })).toHaveCount(0)
    await expect(grid.getByText('SK-E2E-SIYAH', { exact: true })).toBeVisible()
    expect(deleteCalled).toBe(false)
  })

  test('ekran görüntüsü tabanı (ürün varyantları)', async ({ page }) => {
    const root = await openVariantStep(page)
    await expect(root.getByRole('grid', { name: 'Varyantlar' }).getByText('SK-E2E-BEYAZ', { exact: true })).toBeVisible()
    // View'ın (B5-1, kapsam dışı) kategori adımından gelen hata bildirimi rastgele bir destek kodu
    // içerir — kararlı taban için maskelenir.
    await expect(page).toHaveScreenshot('product-variants.png', { fullPage: false, mask: [page.locator('.v-snackbar__wrapper')] })
  })

  test('axe: WCAG 2.1 AA taraması', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    await expect(root.getByText('SK-E2E-SIYAH')).toBeVisible()
    const results = await new AxeBuilder({ page })
      .include(`.productUpdateView${variantProduct._id} .pv-frame`)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    await testInfo.attach('axe-ProductVariantsComponent-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] ProductVariantsComponent: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})
