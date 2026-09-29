// ADR-0015 B5-2 — ProductVariantListComponent + ProductVariantListTooltipComponent
// (karakterizasyon, Protokol 13, ÖNCE görsel yenileme).
//
// Bileşen yalnızca `ProductListView.vue` (B1 kapsamı, DOKUNULMADI) içinde, varyantlı bir ürün
// satırının ilk hücresine tıklanınca (`selectProduct`) o satırın altındaki
// `#variant-target-<id>` hedefine teleport edilir. Satırdaki platform logoları bir v-menu açar;
// menü içeriği `ProductVariantListTooltipComponent`'tir (platform yükleme/satış durumu).
// Bileşen salt görüntüleme yapar (API çağrısı yok); veri `productsDoluFixture` benzeri sentetik
// bir varyantlı üründen (Protokol 7) gelir, platform listesi varsayılan
// `IntegrationService/getClientIntegrations` fixture'ından (trendyol, hepsiburada, ideasoft,
// bizimhesap) çözülür.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { buildProduct, choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'

function buildListVariant(overrides: Record<string, any> = {}) {
  return {
    _id: 'variant-list-e2e-1',
    stockcode: 'VL-E2E-SIYAH',
    barcode: '8690000000201',
    choices: [{ choiceId: 'choice-e2e-1', choiceValueId: 'choiceval-e2e-1', slicer: true }],
    prices: { salePrice: 149.9, marketPrice: 179.9, isPlatformBasedPrice: false },
    stock: 7,
    shelf: 'B-02',
    images: [],
    platforms: {
      trendyol: {
        upload: { TRANSFER: { status: 'COMPLETED', updatedAt: '2026-09-20T10:00:00.000Z' } },
        prices: { salePrice: 149.9, marketPrice: 179.9 },
        stock: 7,
      },
    },
    onsale: true,
    ...overrides,
  }
}

const listProduct = buildProduct({
  _id: 'product-e2e-varlist',
  title: 'E2E Varyant Listesi Ürünü',
  hasVariant: true,
  variants: [
    buildListVariant(),
    buildListVariant({
      _id: 'variant-list-e2e-2',
      stockcode: 'VL-E2E-BEYAZ',
      barcode: '8690000000202',
      choices: [{ choiceId: 'choice-e2e-1', choiceValueId: 'choiceval-e2e-2', slicer: true }],
      stock: 0,
      shelf: undefined,
      platforms: {},
    }),
  ],
})

async function openVariantList(page: Page) {
  await installApiMocks(page, {
    ChoiceService: choicesDoluFixture,
    'ProductService/getProducts': { products: [listProduct], totalNumberOfRecords: 1, fromTo: '1-1 / 1', isFiltered: false },
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  const productRow = page.locator('.productListView tbody tr').filter({ hasText: 'E2E Varyant Listesi Ürünü' }).first()
  await productRow.getByText('(2 Seçenek)').click()
  const list = page.locator(`#variant-target-${listProduct._id} .v-data-table`)
  await expect(list).toBeVisible({ timeout: 20_000 })
  return list
}

test.describe('P3 (B5-2) — Ürün listesi varyant açılımı (ProductVariantListComponent)', () => {
  test('smoke: "(n Seçenek)" tıklanınca varyant tablosu stok kodu/barkod/grup/fiyat/stok ile açılır', async ({ page }) => {
    const list = await openVariantList(page)

    await expect(list.getByText('VL-E2E-SIYAH')).toBeVisible()
    await expect(list.getByText('8690000000201')).toBeVisible()
    await expect(list.getByText('VL-E2E-BEYAZ')).toBeVisible()
    // Slicer seçeneği (rowspan'li "Grup" sütunu) ChoiceService fixture'ından çözülür.
    await expect(list.locator('td').getByText('Siyah', { exact: true })).toBeVisible()
    await expect(list.locator('td').getByText('Beyaz', { exact: true })).toBeVisible()
    await expect(list.getByText('₺149,90').first()).toBeVisible()
    await expect(list.getByText('B-02')).toBeVisible()
    // Başlıklar: Stok Kodu | Barkod, Grup, Satış | Piyasa Fiyatı, Stok Adedi, Platform Yükleme Durumları.
    for (const title of ['Stok Kodu', 'Grup', 'Satış Fiyatı', 'Piyasa Fiyatı', 'Stok Adedi', 'Platform Yükleme Durumları']) {
      await expect(list.locator('thead').getByText(title, { exact: true })).toBeVisible()
    }
  })

  test('seçim: satır onay kutusu işaretlenince tümünü-seç kutusu belirsiz (indeterminate) olur', async ({ page }) => {
    const list = await openVariantList(page)

    const rowCheckbox = list.locator('tbody tr').filter({ hasText: 'VL-E2E-SIYAH' }).locator('input[type="checkbox"]')
    await rowCheckbox.check()
    await expect(rowCheckbox).toBeChecked()
    await expect(list.locator('thead .v-selection-control--dirty, thead .mdi-minus-box')).toHaveCount(1)
  })

  test('platform durumu: platform logosuna tıklayınca satış/yükleme durumu kartı açılır', async ({ page }) => {
    const list = await openVariantList(page)

    const row = list.locator('tbody tr').filter({ hasText: 'VL-E2E-SIYAH' })
    await row.locator('.platform-mini-card').first().click()
    const card = page.locator('.v-overlay--active .premium-status-container')
    await expect(card).toBeVisible()
    await expect(card.getByText('Satış Durumu')).toBeVisible()
    await expect(card.getByText('Pazaryerinde Yayında')).toBeVisible()
    await expect(card.getByText('Ürün Gönderimi')).toBeVisible()
    await expect(card.getByText('Pazaryeri Stoğu')).toBeVisible()
  })

  test('platform durumu (veri yok): yüklenmemiş varyantta "Satışa Kapalı" gösterilir', async ({ page }) => {
    const list = await openVariantList(page)

    const row = list.locator('tbody tr').filter({ hasText: 'VL-E2E-BEYAZ' })
    await row.locator('.platform-mini-card').first().click()
    const card = page.locator('.v-overlay--active .premium-status-container')
    await expect(card.getByText('Satışa Kapalı')).toBeVisible()
    await expect(card.getByText('İşlem Yok')).toBeVisible()
  })

  test('ekran görüntüsü tabanı (varyant açılımı)', async ({ page }) => {
    await openVariantList(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('product-variant-list.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması (tablo + durum kartı)', async ({ page }, testInfo) => {
    const list = await openVariantList(page)
    const table = await new AxeBuilder({ page }).include(`#variant-target-${listProduct._id}`).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await list.locator('tbody tr').filter({ hasText: 'VL-E2E-SIYAH' }).locator('.platform-mini-card').first().click()
    await expect(page.locator('.v-overlay--active .premium-status-container')).toBeVisible()
    await page.waitForTimeout(500) // scale-transition bitsin (ara opaklık kontrastı bozar)
    const card = await new AxeBuilder({ page }).include('.v-overlay--active .premium-status-container').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-ProductVariantListComponent-sonuclari.json', { body: JSON.stringify(table.violations, null, 2), contentType: 'application/json' })
    await testInfo.attach('axe-ProductVariantListTooltipComponent-sonuclari.json', { body: JSON.stringify(card.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] ProductVariantListComponent: ${table.violations.length}, Tooltip: ${card.violations.length} WCAG 2.1 AA ihlali`)
  })
})
