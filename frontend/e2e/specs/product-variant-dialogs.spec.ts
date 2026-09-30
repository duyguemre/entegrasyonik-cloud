// ADR-0015 B5-2 — ProductVariantsComponent'in açtığı varyant diyalogları
// (karakterizasyon, Protokol 13, ÖNCE görsel yenileme).
//
// Kapsanan bileşenler (hepsi `components/productDefinitions/variants/**`):
//  - ProductVariantAttributesComponent (+ platformInfos/*)   — satırdaki kalem butonu
//  - ProductBatchVariantAttributesComponent                  — "Varyant İşlemleri" > "Toplu Özellik Düzenleme"
//  - grid/VariantBulkEditor (DS-v2 A6a; eski ProductBatchVariantPlatformPricesComponent'in yerine)
//                                                             — "Varyant İşlemleri" > "Toplu Fiyat Düzenleme"
//  - ProductVariantPlatformPricesComponent (+ crud/PlatformPriceComponent) — "Platform Bazında Fiyat"
//    işaretliyken fiyat hücresine tıklama
//  - araç çubuğu süzme alanı (DS-v2 A6a; eski ProductSearchVariantComponent'in yerine) — "Varyant İşlemleri" > "Ara"
//  - ProductVariantGeneratorComponent                         — başlıktaki yeşil "+" menüsü
//  - ProductVariantImagesComponent (+ crud/ImageUploaderComponent, ProductVariantImageEditComponent)
//    — satırdaki varyant resmi
//
// DS-v2 A6a: arayüzden erişilemeyen ProductBatchProcessVariantComponent ve yerini alan iki panel
// (ProductBatchVariantPlatformPricesComponent, ProductSearchVariantComponent) silindi.
//
// Ekran görüntüsü tabanları: view'ın (B5-1, kapsam dışı) kategori adımından gelen hata bildirimi
// rastgele bir destek kodu içerir — maskelenir.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { openVariantStep, variantProduct } from '../fixtures/productUpdate'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function axeReport(page: Page, testInfo: any, name: string, include: string) {
  await page.waitForTimeout(400) // geçiş animasyonu bitsin (ara opaklık kontrastı bozar)
  // Paylaşılan bildirim bileşeni (snackbar; view kaynaklı hata bildirimleri) de bir overlay'dir —
  // diyaloğun kendi ihlallerini ölçmek için hariç tutulur.
  const results = await new AxeBuilder({ page }).include(include).withTags(AXE_TAGS).analyze()
  await testInfo.attach(`axe-${name}-sonuclari.json`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  console.log(`[axe] ${name}: ${results.violations.length} WCAG 2.1 AA ihlali`, results.violations.map((v) => v.id + ':' + v.nodes.map((n) => n.target.join(' ')).join(' / ')).join(' | '))
}

async function openOpsMenuItem(page: Page, root: Locator, label: string) {
  // DS-v2 A6a (kasten): "Varyant işlemleri" düğmesi tablo başlığından araç çubuğuna taşındı.
  await root.getByRole('button', { name: 'Varyant işlemleri' }).click()
  const menu = page.locator('.v-overlay--active [role="menu"]').filter({ hasText: 'Varyant İşlemleri' })
  await menu.getByText(label, { exact: true }).click()
}

const shot = (page: Page, name: string) =>
  expect(page).toHaveScreenshot(name, { fullPage: false, mask: [page.locator('.v-snackbar__wrapper')] })

test.describe('P3 (B5-2) — Varyant diyalogları (ProductVariantsComponent alt bileşenleri)', () => {
  test('varyant özellikleri: kalem butonu "Varyant Bilgileri" kartını ("Varyanta Ata") açar', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    await root.locator('tbody tr').filter({ hasText: 'SK-E2E-SIYAH' }).getByRole('button').filter({ has: page.locator('.mdi-pencil') }).click()

    const card = page.locator('.v-overlay--active').filter({ hasText: 'Platform Bazında Bilgiler' }).first()
    await expect(card).toBeVisible()
    await expect(card.getByRole('button', { name: 'Varyanta Ata' })).toBeVisible()
    await shot(page, 'variant-attributes.png')
    await axeReport(page, testInfo, 'ProductVariantAttributesComponent', '.v-overlay--active:not(.v-snackbar)')
  })

  test('toplu özellik düzenleme: "Toplu Varyant Bilgileri" kartı açılır', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    await openOpsMenuItem(page, root, 'Toplu Özellik Düzenleme')

    const card = page.locator('.v-overlay--active').filter({ hasText: 'Toplu Varyant Bilgileri' }).first()
    await expect(card).toBeVisible()
    await expect(card.getByText('Platform Bazında Bilgiler')).toBeVisible()
    await shot(page, 'variant-batch-attributes.png')
    await axeReport(page, testInfo, 'ProductBatchVariantAttributesComponent', '.v-overlay--active:not(.v-snackbar)')
  })

  // DS-v2 A6a (kasten): "Toplu Fiyat Düzenleme" artık toplu düzenleyiciyi kanal fiyatları görünümünde açar
  // (eski tek-değer kartı yerine hücre seçimi + toplu uygula + önizleme). Kanal kolonları kanal adıyla gruplu.
  test('toplu fiyat düzenleme: toplu düzenleyici kanal fiyatları görünümünde açılır', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    await openOpsMenuItem(page, root, 'Toplu Fiyat Düzenleme')

    const card = page.locator('.v-overlay--active .vbe-root')
    await expect(card).toBeVisible()
    await expect(card.getByRole('radio', { name: 'Kanal fiyatları' })).toHaveAttribute('aria-checked', 'true')
    await expect(card.getByRole('button', { name: 'Trendyol Satış fiyatı kolonunu seç' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Seçime uygula' })).toBeVisible()
    await shot(page, 'variant-batch-prices.png')
    await axeReport(page, testInfo, 'VariantBulkEditor', '.v-overlay--active:not(.v-snackbar)')
  })

  test('platform bazında varyant fiyatı: işaretlenip fiyat hücresine tıklanınca platform fiyat kartı açılır', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    const row = root.locator('tbody tr').filter({ hasText: 'SK-E2E-SIYAH' })
    await row.getByLabel('Platform Bazında Fiyat').check()
    // DS-v2 A6a (kasten): kanal bazında satırda fiyat hücresi "Kanal fiyatlarını düzenle" düğmesine dönüşür.
    await row.getByRole('button', { name: /Kanal fiyatlarını düzenle/ }).click()

    const card = page.locator('.v-overlay--active').filter({ hasText: 'Platform Bazında Varyant Fiyatları' }).first()
    await expect(card).toBeVisible()
    await shot(page, 'variant-platform-prices.png')
    await axeReport(page, testInfo, 'ProductVariantPlatformPricesComponent', '.v-overlay--active:not(.v-snackbar)')
  })

  // DS-v2 A6a (kasten): "Ara" artık araç çubuğundaki anlık süzme alanına odaklanır (eski arama kartının
  // süzgeci kodda devre dışıydı — hiçbir şeyi süzmüyordu). Süzme stok kodu/barkod/raf/seçenek adında çalışır.
  test('varyant arama: "Ara" süzme alanına odaklanır, yazınca satırlar süzülür', async ({ page }) => {
    const root = await openVariantStep(page)
    await openOpsMenuItem(page, root, 'Ara')

    const search = root.getByRole('textbox', { name: 'Varyantlarda ara' })
    await expect(search).toBeFocused()
    await search.fill('beyaz')
    await expect(root.getByText('SK-E2E-BEYAZ')).toBeVisible()
    await expect(root.getByText('SK-E2E-SIYAH')).toHaveCount(0)
    await search.fill('yok-boyle-bir-sey')
    await expect(root.getByText('Aramaya uyan varyant yok')).toBeVisible()
  })

  test('varyant oluşturucu: yeşil "+" menüsü seçenek gruplarını listeler', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    // DS-v2 A6a (kasten): başlıktaki yeşil "+" → araç çubuğunda "Varyant oluştur".
    await root.getByRole('button', { name: 'Varyant oluştur' }).first().click()

    const menu = page.locator('.v-overlay--active').last()
    await expect(menu).toBeVisible()
    await expect(menu.getByText('E2E Renk Grubu').first()).toBeVisible()
    await shot(page, 'variant-generator.png')
    await axeReport(page, testInfo, 'ProductVariantGeneratorComponent', '.v-overlay--active:not(.v-snackbar)')
  })

  test('varyant resimleri: satırdaki resim "Varyant Resimleri" kartını açar', async ({ page }, testInfo) => {
    const root = await openVariantStep(page, variantProduct, {
      getImages: { images: [] },
    })
    // DS-v2 A6a (kasten): resim küçük görseli stok kodu hücresinde, adlandırılmış düğme.
    await root.locator('tbody tr').filter({ hasText: 'SK-E2E-SIYAH' }).getByRole('button', { name: /^Varyant resimleri/ }).click()

    const card = page.locator('.v-overlay--active').filter({ hasText: 'Varyant Resimleri' }).first()
    await expect(card).toBeVisible()
    await shot(page, 'variant-images.png')
    await axeReport(page, testInfo, 'ProductVariantImagesComponent', '.v-overlay--active:not(.v-snackbar)')
  })
})

// DS-v2 A6a — pazaryeri özellik listesi alınamazsa toplu özellik panelinde anlaşılır hata + Tekrar dene
// (eskiden sonsuz "yükleniyor" ve genel "Bir şeyler ters gitti" bildirimleri). Eşleme ekranlarıyla aynı
// `useIntegrationError` eşlemesi. Kanal seçimi artık adlı sekmeler (role=tab).
test.describe('A6a — varyant özellik panelinde pazaryeri hatası', () => {
  test('500 → hata paneli; Tekrar dene başarılı olunca özellikler gelir; kanal sekmeleri klavyeyle gezilir', async ({ page }, testInfo) => {
    let fail = true
    const root = await openVariantStep(page, variantProduct, {
      'IntegrationService/retrieveCategoryAttributesFromIntegration': async (route: any, headers: any) => {
        if (fail) return route.fulfill({ status: 500, contentType: 'application/json', headers, body: JSON.stringify({ error: 'Beklenmeyen bir hata oluştu.', code: 'INTERNAL' }) })
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify([{ _id: 'attr-1', title: 'Kumaş', required: true, varianter: false, slicer: false, allowCustom: true, values: [] }]) })
      },
    })
    await openOpsMenuItem(page, root, 'Toplu Özellik Düzenleme')
    const card = page.locator('.v-overlay--active').filter({ hasText: 'Toplu Varyant Bilgileri' }).first()
    const trendyol = card.getByRole('tab', { name: /Trendyol/ })
    await trendyol.click()
    await expect(trendyol).toHaveAttribute('aria-selected', 'true')
    await expect(card.getByText('Trendyol kategori özellikleri şu an alınamadı')).toBeVisible()
    await expect(page.locator('.v-snackbar__wrapper').filter({ hasText: 'Bir şeyler ters gitti' })).toHaveCount(0)
    await axeReport(page, testInfo, 'ProductBatchVariantAttributes-hata', '.v-overlay--active:not(.v-snackbar)')
    await trendyol.press('ArrowDown')
    await expect(card.getByRole('tab', { name: /Hepsiburada/ })).toBeFocused()
    await card.getByRole('tab', { name: /Trendyol/ }).click()
    fail = false
    await card.getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(card.getByText('Zorunlu Özellikleri (*)')).toBeVisible()
    await expect(card.getByText('Trendyol kategori özellikleri şu an alınamadı')).toHaveCount(0)
  })
})
