// ADR-0015 B5-2 — ProductVariantsComponent'in açtığı varyant diyalogları
// (karakterizasyon, Protokol 13, ÖNCE görsel yenileme).
//
// Kapsanan bileşenler (hepsi `components/productDefinitions/variants/**`):
//  - ProductVariantAttributesComponent (+ platformInfos/*)   — satırdaki kalem butonu
//  - ProductBatchVariantAttributesComponent                  — "Varyant İşlemleri" > "Toplu Özellik Düzenleme"
//  - VariantBulkEditor ("Toplu düzenle" tablosu)               — "Varyant işlemleri" > "Toplu Fiyat Düzenleme" (eski
//    ProductBatchVariantPlatformPricesComponent kartının yerini aldı, FR2-PFORM varyant izgarası)
//  - ProductVariantPlatformPricesComponent (+ crud/PlatformPriceComponent) — "Platform Bazında Fiyat"
//    işaretliyken fiyat hücresine tıklama
//  - (ProductSearchVariantComponent KALDIRILDI: "Ara" artık araç çubuğundaki "Varyantlarda ara" alanına odaklanır)
//  - ProductVariantGeneratorComponent                         — araç çubuğundaki "Varyant oluştur" menüsü
//  - ProductVariantImagesComponent                            — satırdaki varyant küçük resmi
//
// GİZLİ DAVRANIŞ (not): ProductBatchProcessVariantComponent `batchProcessFormMenu` ile açılır, ama
// bu ref ProductVariantsComponent'te HİÇBİR YERDE `true` yapılmaz (grep ile doğrulandı) — bileşen
// arayüzden erişilemez, bu yüzden burada karakterize EDİLMEZ.
//
// Ekran görüntüsü tabanları: view'ın (B5-1, kapsam dışı) kategori adımından gelen hata bildirimi
// rastgele bir destek kodu içerir — maskelenir.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { openVariantStep, variantProduct } from '../fixtures/productUpdate'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function axeReport(page: Page, testInfo: any, name: string, include: string) {
  await expect(page.locator('.v-overlay--active .v-overlay__content').last()).toBeVisible()
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined)))) // geçiş animasyonu bitsin (ara opaklık kontrastı bozar)
  // Paylaşılan bildirim bileşeni (snackbar; view kaynaklı hata bildirimleri) de bir overlay'dir —
  // diyaloğun kendi ihlallerini ölçmek için hariç tutulur.
  const results = await new AxeBuilder({ page }).include(include).withTags(AXE_TAGS).analyze()
  await testInfo.attach(`axe-${name}-sonuclari.json`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  console.log(`[axe] ${name}: ${results.violations.length} WCAG 2.1 AA ihlali`)
}

async function openOpsMenuItem(page: Page, root: Locator, label: string) {
  await root.getByRole('button', { name: 'Varyant işlemleri' }).click()
  // DS-v2 A2: EkContextMenu (role=menu) — eski .v-list seçicisi bilinçli güncellendi.
  const menu = page.locator('.v-overlay--active [role="menu"]').filter({ hasText: 'Varyant İşlemleri' })
  await menu.getByText(label, { exact: true }).click()
}

const shot = (page: Page, name: string) =>
  expect(page).toHaveScreenshot(name, { fullPage: false, mask: [page.locator('.v-snackbar__wrapper')] })

test.describe('P3 (B5-2) — Varyant diyalogları (ProductVariantsComponent alt bileşenleri)', () => {
  test('varyant bilgileri: kalem butonu kanal seçici + kanal bilgileri + özellik tablosu olan diyaloğu açar', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    await root.getByRole('row').filter({ hasText: 'SK-E2E-SIYAH' }).getByRole('button', { name: 'Varyantı düzenle' }).click()

    const card = page.locator('.v-overlay--active').filter({ hasText: 'Varyant bilgileri' }).first()
    await expect(card).toBeVisible()
    await expect(card.getByRole('radiogroup', { name: 'Özellikleri düzenlenen kanal' })).toBeVisible()
    await expect(card.getByRole('button', { name: /Değişiklikleri gözden geçir/ })).toBeVisible()
    await shot(page, 'variant-attributes.png')
    await axeReport(page, testInfo, 'ProductVariantAttributesComponent', '.v-overlay--active:not(.v-snackbar)')
  })

  test('toplu özellik düzenle: kanal seçici + kanal bilgileri + özellik tablosu açılır', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    await openOpsMenuItem(page, root, 'Toplu özellik düzenle')

    const card = page.locator('.v-overlay--active').filter({ hasText: 'Toplu özellik düzenle' }).first()
    await expect(card).toBeVisible()
    await expect(card.getByRole('radiogroup', { name: 'Özellikleri düzenlenen kanal' })).toBeVisible()
    await expect(card.getByRole('button', { name: /kanal bilgileri/ })).toBeVisible()
    await shot(page, 'variant-batch-attributes.png')
    await axeReport(page, testInfo, 'ProductBatchVariantAttributesComponent', '.v-overlay--active:not(.v-snackbar)')
  })

  test('toplu düzenle: tablo satış/piyasa fiyatı kolonlarıyla açılır (ayrı "Toplu Fiyat Düzenleme" kaldırıldı)', async ({ page }, testInfo) => {
    // "Toplu Fiyat Düzenleme" aynı ekranı açtığı için menüden kaldırıldı; kanal fiyatları tablodaki "Kanal fiyatları" görünümünde.
    const root = await openVariantStep(page)
    await openOpsMenuItem(page, root, 'Toplu düzenle')

    const card = page.locator('.v-overlay--active').filter({ has: page.getByRole('grid', { name: 'Toplu düzenleme tablosu' }) }).first()
    await expect(card).toBeVisible()
    await expect(card.getByText('Toplu düzenle', { exact: true }).first()).toBeVisible()
    const table = card.getByRole('grid', { name: 'Toplu düzenleme tablosu' })
    await expect(table.getByRole('gridcell', { name: /249,90/ }).first()).toBeVisible()
    await shot(page, 'variant-batch-prices.png')
    await axeReport(page, testInfo, 'VariantBulkEditor', '.v-overlay--active:not(.v-snackbar)')
  })

  test('platform bazında varyant fiyatı: işaretlenince fiyat hücresi "Kanal fiyatlarını düzenle" olur ve platform fiyat kartı açılır', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    const row = root.getByRole('row').filter({ hasText: 'SK-E2E-SIYAH' })
    await row.getByRole('checkbox', { name: /^Platform Bazında Fiyat/i }).check()
    await row.getByRole('button', { name: /^Kanal fiyatlarını düzenle/ }).click()

    const card = page.locator('.v-overlay--active').filter({ hasText: 'Kanal bazında fiyatlar' }).first()
    await expect(card).toBeVisible()
    await shot(page, 'variant-platform-prices.png')
    await axeReport(page, testInfo, 'ProductVariantPlatformPricesComponent', '.v-overlay--active:not(.v-snackbar)')
  })

  test('varyant arama: "Ara" menü öğesi "Varyantlarda ara" alanına odaklanır ve satırları süzer', async ({ page }) => {
    // ProductSearchVariantComponent (stok kodu/barkod/stok/raf arama formu diyaloğu) kaldırıldı;
    // yerine araç çubuğunda her zaman görünen "Varyantlarda ara" alanı geldi.
    const root = await openVariantStep(page)
    await openOpsMenuItem(page, root, 'Ara')

    const search = root.getByRole('textbox', { name: 'Varyantlarda ara' })
    await expect(search).toBeFocused()
    await search.fill('BEYAZ')
    const grid = root.getByRole('grid', { name: 'Varyantlar' })
    await expect(grid.getByText('SK-E2E-BEYAZ', { exact: true })).toBeVisible()
    await expect(grid.getByText('SK-E2E-SIYAH', { exact: true })).toHaveCount(0)
  })

  test('varyant oluşturucu: "Varyant oluştur" menüsü seçenek gruplarını listeler', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    await root.getByRole('button', { name: 'Varyant oluştur' }).click()

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
    await root.getByRole('button', { name: /^Varyant resimleri: SK-E2E-SIYAH/ }).click()

    const card = page.locator('.v-overlay--active').filter({ hasText: 'Varyant Resimleri' }).first()
    await expect(card).toBeVisible()
    await shot(page, 'variant-images.png')
    await axeReport(page, testInfo, 'ProductVariantImagesComponent', '.v-overlay--active:not(.v-snackbar)')
  })
})
