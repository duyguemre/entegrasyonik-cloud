// ADR-0015 B5-2 — ProductListView "Toplu işlemler" menüsü: BatchActionsRootComponent +
// BatchActionMenu + BatchProcessDialog + BatchDeleteDialog (karakterizasyon, Protokol 13, ÖNCE yenileme).
//
// Yol: ProductListView (B1, DOKUNULMADI) tablo başlığındaki "Toplu işlemler" (⋮) butonu → v-menu
// içinde BatchActionsRootComponent; menüden bir işlem seçilince BatchProcessDialog
// (ActionDialogComponent, "Toplu İşlem Merkezi") açılır.
//
// GİZLİ DAVRANIŞ (not): ProductListView'daki ProductTransferComponent (`transferProductFormMenu`) ve
// ProductBatchProcessComponent (`batchProcessFormMenu`) hiçbir yerde `true` yapılmaz — arayüzden
// erişilemezler, burada karakterize EDİLMEZLER.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, openScreen } from '../fixtures/nav'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function openBatchMenu(page: Page) {
  await installApiMocks(page, {})
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  // FR2 kabuk: ilk ziyaret "Uygulamayı tanıyın" teklif kartı (sağ alt, fixed) uzun menünün alt öğelerini ("Toplu Sil") örter.
  await page.getByRole('button', { name: 'Şimdi değil' }).click({ timeout: 3000 }).catch(() => undefined)
  await page.locator('.productListView').getByRole('button', { name: 'Toplu işlemler' }).click()
  // DS-v2 A2: menü içeriği EkMenuPanel (role=menu) — eski `.v-list` seçicisi bilinçli güncellendi.
  const menu = page.locator('.v-overlay--active [role="menu"]').filter({ hasText: 'Toplu Ürün İşlemleri' })
  await expect(menu).toBeVisible({ timeout: 15_000 })
  return menu
}

test.describe('P3 (B5-2) — Ürün toplu işlemleri (BatchActions)', () => {
  test('menü: "Toplu Ürün İşlemleri" başlığı ve işlem listesi görünür', async ({ page }, testInfo) => {
    const menu = await openBatchMenu(page)
    for (const label of ['Kanallara yükle', 'Kanallarda güncelle', 'Platform Fiyatlarını Güncelle', 'Platform Stoklarını Güncelle', 'Platformdan Ürün Yükle', "Excel'e Aktar", "Excel'den Güncelle", 'Satış Durum Değiştir', 'Kategori Ata / Değiştir', 'Marka Ata / Değiştir', 'Etiket (Tag) Ata / Değiştir', 'Toplu Sil']) {
      await expect(menu.getByText(label, { exact: true })).toBeVisible()
    }
    await page.waitForTimeout(300)
    const results = await new AxeBuilder({ page }).include('.v-overlay--active:not(.v-snackbar) [role="menu"]').withTags(AXE_TAGS).analyze()
    await testInfo.attach('axe-BatchActionMenu-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    expect(results.violations.map((v) => v.id)).toEqual([])
    // Klavye: menü açılınca odak ilk işlemde; ↓ sonraki işleme gider.
    await expect(menu.getByRole('menuitem', { name: 'Kanallara yükle' })).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(menu.getByRole('menuitem', { name: 'Kanallarda güncelle' })).toBeFocused()
    // Tehlikeli öğe en sonda.
    await expect(menu.getByRole('menuitem').last()).toHaveText('Toplu Sil')
  })

  test('platform işlemi: "Kanallara yükle" toplu işlem diyaloğunu açar; seçim yoksa uyarı gösterilir', async ({ page }, testInfo) => {
    const menu = await openBatchMenu(page)
    await menu.getByText('Kanallara yükle', { exact: true }).click()

    const dialog = page.locator('.v-overlay--active').filter({ hasText: 'Toplu İşlem Merkezi' }).last()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Kanallara ürün yükleme')).toBeVisible()
    await expect(dialog.getByText('İşlem yapılacak kanallar')).toBeVisible()
    await expect(dialog.getByText('Tablodan ürün seçilmedi. Lütfen seçim yapın veya kapsamı değiştirin.')).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('batch-process-dialog.png', { fullPage: false })
    const results = await new AxeBuilder({ page }).include('.v-overlay--active:not(.v-snackbar)').withTags(AXE_TAGS).analyze()
    await testInfo.attach('axe-BatchProcessDialog-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] BatchProcessDialog: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })

  test('satış durumu: "Satış Durum Değiştir" diyaloğunda Satış Durumu anahtarı görünür', async ({ page }) => {
    const menu = await openBatchMenu(page)
    await menu.getByText('Satış Durum Değiştir', { exact: true }).click()

    const dialog = page.locator('.v-overlay--active').filter({ hasText: 'Toplu İşlem Merkezi' }).last()
    await expect(dialog.getByText('Satış Durumunu Değiştir')).toBeVisible()
    await expect(dialog.getByText('Satış Durumu:')).toBeVisible()
  })

  test('platformdan ürün yükle: kapsam seçimi yerine "Platform Seçimi" kartı gösterilir', async ({ page }) => {
    const menu = await openBatchMenu(page)
    await menu.getByText('Platformdan Ürün Yükle', { exact: true }).click()

    const dialog = page.locator('.v-overlay--active').filter({ hasText: 'Toplu İşlem Merkezi' }).last()
    await expect(dialog.getByText('Platform Seçimi')).toBeVisible()
    await expect(dialog.getByText('Tablodan ürün seçilmedi.', { exact: false })).toHaveCount(0)
  })

  test('toplu silme: "Toplu Sil" silme yapılandırmalı toplu işlem diyaloğunu açar', async ({ page }) => {
    const menu = await openBatchMenu(page)
    await menu.getByText('Toplu Sil', { exact: true }).click()

    const dialog = page.locator('.v-overlay--active').filter({ hasText: 'Toplu İşlem Merkezi' }).last()
    await expect(dialog.getByText('Toplu Ürün Silme')).toBeVisible()
    await expect(dialog.getByText('Ürünleri sistemden kalıcı olarak siler.')).toBeVisible()
  })

  test('menü ekran görüntüsü tabanı', async ({ page }) => {
    await openBatchMenu(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('batch-action-menu.png', { fullPage: false })
  })
})
