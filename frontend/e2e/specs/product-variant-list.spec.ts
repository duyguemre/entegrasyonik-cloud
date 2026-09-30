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

async function openVariantList(page: Page, product = listProduct) {
  await installApiMocks(page, {
    ChoiceService: choicesDoluFixture,
    'ProductService/getProducts': { products: [product], totalNumberOfRecords: 1, fromTo: '1-1 / 1', isFiltered: false },
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  const productRow = page.locator('.productListView tbody tr').filter({ hasText: product.title }).first()
  // [DS-v2 A5, KASITLI] Açma düğmesi "(2 Seçenek)" metninden "2 seçenek" çip düğmesine döndü (madde 11).
  await productRow.getByRole('button', { name: `${product.variants.length} seçenek` }).click()
  // [A11, KASITLI] Varyant alanı artık Vuetify `v-data-table` değil: özet şeridi + yerel tablo (`.pvl-table`), dar kapta kart.
  const list = page.locator(`#variant-target-${product._id} .pvl`)
  await expect(list).toBeVisible({ timeout: 20_000 })
  return list
}

test.describe('P3 (B5-2) — Ürün listesi varyant açılımı (ProductVariantListComponent)', () => {
  test('smoke: "n seçenek" tıklanınca varyant tablosu stok kodu/barkod/grup/fiyat/stok ile açılır', async ({ page }) => {
    const list = await openVariantList(page)

    await expect(list.getByText('VL-E2E-SIYAH')).toBeVisible()
    await expect(list.getByText('8690000000201')).toBeVisible()
    await expect(list.getByText('VL-E2E-BEYAZ')).toBeVisible()
    // Ayırıcı seçenek değeri ChoiceService fixture'ından çözülür ([A11] grup sütunu yerine satır çipi / grup başlığı).
    await expect(list.getByText('Siyah', { exact: true })).toBeVisible()
    await expect(list.getByText('Beyaz', { exact: true })).toBeVisible()
    await expect(list.getByText('₺149,90').first()).toBeVisible()
    await expect(list.getByText('Raf B-02')).toBeVisible()
    // [A11, KASITLI] Başlıklar sadeleşti: Varyant, Barkod, Fiyat, Stok, Kanal durumu (stok kodu satırda mono; piyasa fiyatı satırda).
    for (const title of ['Varyant', 'Barkod', 'Fiyat', 'Stok', 'Kanal durumu']) {
      await expect(list.getByRole('columnheader', { name: title, exact: true })).toHaveCount(1)
    }
  })

  test('seçim: satır onay kutusu işaretlenince tümünü-seç kutusu belirsiz (indeterminate) olur', async ({ page }) => {
    const list = await openVariantList(page)

    const rowCheckbox = list.locator('tbody tr').filter({ hasText: 'VL-E2E-SIYAH' }).locator('input[type="checkbox"]')
    await rowCheckbox.check()
    await expect(rowCheckbox).toBeChecked()
    // [A11, KASITLI] Yerel checkbox: belirsizlik `indeterminate` özelliğiyle (Vuetify sınıfı yerine).
    await expect(list.locator('thead input[type="checkbox"]')).toHaveJSProperty('indeterminate', true)
    await expect(list.locator('.pvl-flag.is-selected')).toContainText('1 seçili')
  })

  test('platform durumu: kanal çipine tıklayınca satış/yükleme durumu kartı açılır', async ({ page }) => {
    const list = await openVariantList(page)

    const row = list.locator('tbody tr').filter({ hasText: 'VL-E2E-SIYAH' })
    // [A11, KASITLI] `.platform-mini-card` → `.pvl-ch` (kanal çipi düğmesi).
    await row.locator('button.pvl-ch').first().click()
    const card = page.locator('.v-overlay--active .premium-status-container')
    await expect(card).toBeVisible()
    await expect(card.getByText('Satış Durumu')).toBeVisible()
    await expect(card.getByText('Pazaryerinde Yayında')).toBeVisible()
    await expect(card.getByText('Ürün Gönderimi')).toBeVisible()
    await expect(card.getByText('Pazaryeri Stoğu')).toBeVisible()
  })

  test('platform durumu (veri yok): gönderilmemiş kanallar tek soluk çipte toplanır, tıklanabilir kart açmaz', async ({ page }) => {
    // [A11, KASITLI] Önce her kanal ayrı çipti ve "Satışa Kapalı" kartı açıyordu; gürültü azaltıldı.
    const list = await openVariantList(page)

    const row = list.locator('tbody tr').filter({ hasText: 'VL-E2E-BEYAZ' })
    await expect(row.locator('button.pvl-ch')).toHaveCount(0)
    await expect(row.locator('.pvl-ch.is-unsent')).toHaveText('Kanala gönderilmedi')
  })

  test('A11 özet şeridi: varyant sayısı, toplam stok, tükenen ve kanal kapsamı', async ({ page }) => {
    const list = await openVariantList(page)
    const summary = list.locator('.pvl-summary')
    await expect(summary).toContainText('2 varyant')
    await expect(summary).toContainText('Toplam stok 7')
    await expect(summary.locator('.pvl-flag.is-out')).toContainText('1 tükendi')
    await expect(summary.locator('.pvl-cov').filter({ hasText: 'Trendyol' })).toContainText('1/2 yayında')
  })

  test('A11 hatalı kanal: çip hata tonunda, ipucunda kısa neden', async ({ page }) => {
    const product = buildProduct({
      _id: 'product-e2e-varerr', title: 'E2E Hatalı Kanal Ürünü', hasVariant: true,
      variants: [buildListVariant({ platforms: { trendyol: { upload: { TRANSFER: { status: 'FAILED', messages: ['Kategori eşleşmesi eksik'] } } } } })],
    })
    const list = await openVariantList(page, product)
    const chip = list.locator('button.pvl-ch.is-danger')
    await expect(chip).toHaveAttribute('aria-label', /Reddedildi — Kategori eşleşmesi eksik/)
    await expect(list.locator('.pvl-cov__err')).toContainText('1 hata')
    await chip.hover()
    await expect(page.locator('.v-tooltip .pvl-tip')).toContainText('Kategori eşleşmesi eksik')
  })

  test('A11 çok varyant (> 8): ilk 8 satır + "Tümünü gör" (aria-expanded)', async ({ page }) => {
    const many = buildProduct({
      _id: 'product-e2e-varmany', title: 'E2E Çok Varyantlı Ürün', hasVariant: true,
      variants: Array.from({ length: 11 }, (_, i) => buildListVariant({ _id: `vm-${i}`, stockcode: `VM-${String(i).padStart(2, '0')}`, barcode: `86900000009${String(i).padStart(2, '0')}` })),
    })
    const list = await openVariantList(page, many)
    await expect(list.locator('tbody tr.pvl-row')).toHaveCount(8)
    const more = list.getByRole('button', { name: /Tümünü gör/ })
    await expect(more).toHaveAttribute('aria-expanded', 'false')
    await more.click()
    await expect(list.locator('tbody tr.pvl-row')).toHaveCount(11)
    await expect(list.getByRole('button', { name: 'Daha az göster' })).toHaveAttribute('aria-expanded', 'true')
  })

  test('A11 klavye: genişletme düğmesi Enter/Space ile açılır-kapanır, aria-expanded + aria-controls', async ({ page }) => {
    await installApiMocks(page, {
      ChoiceService: choicesDoluFixture,
      'ProductService/getProducts': { products: [listProduct], totalNumberOfRecords: 1, fromTo: '1-1 / 1', isFiltered: false },
    })
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    const toggle = page.locator('.productListView').getByRole('button', { name: '2 seçenek' })
    await expect(toggle).toHaveAttribute('aria-controls', `variant-target-${listProduct._id}`)
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator(`#variant-target-${listProduct._id} .pvl`)).toBeVisible()
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  test('ekran görüntüsü tabanı (varyant açılımı)', async ({ page }) => {
    await openVariantList(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('product-variant-list.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması (tablo + durum kartı)', async ({ page }, testInfo) => {
    const list = await openVariantList(page)
    const table = await new AxeBuilder({ page }).include(`#variant-target-${listProduct._id}`).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await list.locator('tbody tr').filter({ hasText: 'VL-E2E-SIYAH' }).locator('button.pvl-ch').first().click()
    await expect(page.locator('.v-overlay--active .premium-status-container')).toBeVisible()
    await page.waitForTimeout(500) // geçiş bitsin (ara opaklık kontrastı bozar)
    const card = await new AxeBuilder({ page }).include('.v-overlay--active .premium-status-container').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-ProductVariantListComponent-sonuclari.json', { body: JSON.stringify(table.violations, null, 2), contentType: 'application/json' })
    await testInfo.attach('axe-ProductVariantListTooltipComponent-sonuclari.json', { body: JSON.stringify(card.violations, null, 2), contentType: 'application/json' })
    // [A11] Yalnız kayıt değil, iddia: yeni varyant alanı ve durum kartı AA ihlalsiz.
    expect(table.violations.map((v) => v.id)).toEqual([])
    expect(card.violations.map((v) => v.id)).toEqual([])
  })
})
