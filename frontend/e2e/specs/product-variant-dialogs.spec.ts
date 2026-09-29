// ADR-0015 B5-2 — ProductVariantsComponent'in açtığı varyant diyalogları
// (karakterizasyon, Protokol 13, ÖNCE görsel yenileme).
//
// Kapsanan bileşenler (hepsi `components/productDefinitions/variants/**`):
//  - ProductVariantAttributesComponent (+ platformInfos/*)   — satırdaki kalem butonu
//  - ProductBatchVariantAttributesComponent                  — "Varyant İşlemleri" > "Toplu Özellik Düzenleme"
//  - ProductBatchVariantPlatformPricesComponent               — "Varyant İşlemleri" > "Toplu Fiyat Düzenleme"
//  - ProductVariantPlatformPricesComponent (+ crud/PlatformPriceComponent) — "Platform Bazında Fiyat"
//    işaretliyken fiyat hücresine tıklama
//  - ProductSearchVariantComponent                            — "Varyant İşlemleri" > "Ara"
//  - ProductVariantGeneratorComponent                         — başlıktaki yeşil "+" menüsü
//  - ProductVariantImagesComponent (+ crud/ImageUploaderComponent, ProductVariantImageEditComponent)
//    — satırdaki varyant resmi
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
  await page.waitForTimeout(400) // geçiş animasyonu bitsin (ara opaklık kontrastı bozar)
  // Paylaşılan bildirim bileşeni (snackbar; view kaynaklı hata bildirimleri) de bir overlay'dir —
  // diyaloğun kendi ihlallerini ölçmek için hariç tutulur.
  const results = await new AxeBuilder({ page }).include(include).withTags(AXE_TAGS).analyze()
  await testInfo.attach(`axe-${name}-sonuclari.json`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
  console.log(`[axe] ${name}: ${results.violations.length} WCAG 2.1 AA ihlali`)
}

async function openOpsMenuItem(page: Page, root: Locator, label: string) {
  await root.locator('thead').getByRole('button').filter({ has: page.locator('.mdi-menu') }).click()
  // DS-v2 A2: EkContextMenu (role=menu) — eski .v-list seçicisi bilinçli güncellendi.
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

  test('toplu fiyat düzenleme: satış/piyasa fiyatı alanları ve platform bazında fiyat seçeneği görünür', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    await openOpsMenuItem(page, root, 'Toplu Fiyat Düzenleme')

    const card = page.locator('.v-overlay--active').filter({ has: page.getByLabel('Satış Fiyatı', { exact: true }) }).first()
    await expect(card).toBeVisible()
    await expect(card.getByLabel('Piyasa Fiyatı', { exact: true })).toBeVisible()
    await expect(card.getByText('Platform Bazında Fiyat').first()).toBeVisible()
    await shot(page, 'variant-batch-prices.png')
    await axeReport(page, testInfo, 'ProductBatchVariantPlatformPricesComponent', '.v-overlay--active:not(.v-snackbar)')
  })

  test('platform bazında varyant fiyatı: işaretlenip fiyat hücresine tıklanınca platform fiyat kartı açılır', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    const row = root.locator('tbody tr').filter({ hasText: 'SK-E2E-SIYAH' })
    await row.getByLabel('Platform Bazında Fiyat').check()
    await row.getByText('Satış Fiyatı').first().click()

    const card = page.locator('.v-overlay--active').filter({ hasText: 'Platform Bazında Varyant Fiyatları' }).first()
    await expect(card).toBeVisible()
    await shot(page, 'variant-platform-prices.png')
    await axeReport(page, testInfo, 'ProductVariantPlatformPricesComponent', '.v-overlay--active:not(.v-snackbar)')
  })

  test('varyant arama: "Ara" arama formunu (stok kodu/barkod/stok/raf) açar', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    await openOpsMenuItem(page, root, 'Ara')

    const card = page.locator('.v-overlay--active').filter({ has: page.locator('.mdi-magnify') }).last()
    await expect(card).toBeVisible()
    await shot(page, 'variant-search.png')
    await axeReport(page, testInfo, 'ProductSearchVariantComponent', '.v-overlay--active:not(.v-snackbar)')
  })

  test('varyant oluşturucu: yeşil "+" menüsü seçenek gruplarını listeler', async ({ page }, testInfo) => {
    const root = await openVariantStep(page)
    await root.locator('thead').getByRole('button').filter({ has: page.locator('.mdi-plus') }).first().click()

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
    await root.locator('tbody tr').filter({ hasText: 'SK-E2E-SIYAH' }).locator('td').nth(1).locator('.elevation-1 > *').first().click()

    const card = page.locator('.v-overlay--active').filter({ hasText: 'Varyant Resimleri' }).first()
    await expect(card).toBeVisible()
    await shot(page, 'variant-images.png')
    await axeReport(page, testInfo, 'ProductVariantImagesComponent', '.v-overlay--active:not(.v-snackbar)')
  })
})
