// P2 — LogListView (ExportLogList/ImportLogList sekmeleri + DetailedExportLogReport/
// DetailedImportLogReport detay diyalogları). ADR-0011 Karar 2 tablosu "log listeleri
// (DetailedExport/ImportLogReport yüksek hex)".
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { exportJobsBosFixture, exportJobsDoluFixture, importJobsBosFixture, importJobsDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixtureWithLogs, openScreen } from '../fixtures/nav'

// NOT (claims/customers/invoices/messages.spec.ts ile AYNI gerçek davranış, ADR-0011
// Karar 1): `v-data-table-server` yalnızca `$vuetify.display.mdAndUp` (>=960px) iken
// render oluyor; `chromium-tablet` (800px) de mobil kart düzenine düşüyor. Masaüstü
// tabloya bağlı testler (göz ikonu, boş/hata-durumu metni) bu yüzden yalnızca
// `chromium-desktop`'ta çalışır.

// `LogListView` bağlantısı YALNIZCA bu spec'in menüsünde var (bkz. nav.ts `menuFixtureWithLogs`
// notu) — paylaşılan `menuFixture`'a eklemek dashboard/shell ekran görüntülerini kaydırıyordu.
function withLogsMenu(overrides: Record<string, any> = {}) {
  return { MenuService: menuFixtureWithLogs, ...overrides }
}

async function openImportTab(page: Page) {
  await page.getByRole('tab', { name: 'Ürün çekim işlemleri' }).click()
  await expect(page.locator('.importLogList')).toBeVisible()
}

test.describe('P2 — Ürün Gönderim İşlemleri (ExportLogList)', () => {
  test('smoke: arama kutusu + gönderim satırları render olur', async ({ page }) => {
    await installApiMocks(page, withLogsMenu())
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')

    await expect(page.locator('.exportLogList')).toBeVisible()
    await expect(page.getByLabel('Ürün adı, barkod, stok kodu veya kanal').first()).toBeVisible()
    await expect(page.locator('.exportLogList').getByText('E2E Test Ürünü - Gönderim')).toBeVisible()
    await expect(page.locator('.exportLogList').getByText('E2E Test Ürünü 2 - Fiyat güncelleme')).toBeVisible()
  })

  test('boş durum: sonuç yoksa "Gönderim kaydı bulunamadı" kartı gösterilir (BİLİNÇLİ TAMAMLAMA — bkz. BACKLOG.md)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor — bkz. dosya başı NOT')
    // BİLİNÇLİ TAMAMLAMA (characterization AŞAMASINDA bugünkü davranış Vuetify'ın kendi `tr`
    // locale varsayılanıydı — "Bu görünümde veri yok." — ExportLogList.vue'nin masaüstü
    // `v-data-table-server`'ında InvoiceListView/T4f'ten ÖNCEKİ diğer P2 ekranlarıyla AYNI
    // eksiklik vardı: `template v-slot:no-data` YOKTU. Token+a11y göçünde (ADR-0011 Karar 2
    // KAPSAM: "eksik boş/hata/yükleniyor durumlarını tamamla") diğer P2 ekranlarıyla AYNI
    // `EmptyState` bileşeniyle TAMAMLANDI — iş mantığı DEĞİŞMEDİ, yalnızca bu görsel durum eklendi.
    await installApiMocks(page, withLogsMenu({ 'IntegrationService/getExportJobs': exportJobsBosFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')

    await expect(page.getByText('Gönderim kaydı bulunamadı', { exact: true })).toBeVisible()
  })

  test('hata durumu: 500 alındığında "Gönderim kayıtları yüklenemedi" + Tekrar dene gösterilir (boştan AYRI), ham hata sızmaz', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor — bkz. dosya başı NOT')
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md): `restApi.post` HİÇBİR ZAMAN
    // reddetmiyor (bkz. restapi.ts `postService`); `getJobs`'daki `finally` HER ZAMAN tetiklenir
    // ama `res.success` falsy kaldığı için `jobs.value` güncellenmez (başlangıç değeri `[]`'de
    // kalır) — kullanıcı "hata" ile "gerçekten kayıt yok" durumunu AYIRT EDEMİYOR (diğer P2
    // ekranlarıyla aynı desen). Boş-durum metni yukarıdaki testle AYNI bilinçli tamamlamaya tabi.
    await installApiMocks(page, withLogsMenu({ 'IntegrationService/getExportJobs': mockError(500) }))
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')

    // DS-v2 Aşama 2 — BİLİNÇLİ DAVRANIŞ DEĞİŞİKLİĞİ: hata artık boş durumdan ayrı (isRequestError); API çağrısı AYNI.
    await expect(page.getByText('Gönderim kayıtları yüklenemedi')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: göz ikonuna tıklayınca gönderim detay raporu açılır', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor')
    await installApiMocks(page, withLogsMenu({ 'IntegrationService/getExportJobs': exportJobsDoluFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')

    await page.locator('.exportLogList tbody tr').first().locator('button:has(.mdi-eye-outline)').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Pazaryeri Gönderim Detaylı Raporu' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('E2E Test Ürünü - Gönderim')
  })

  test('ekran görüntüsü tabanı (gönderim listesi)', async ({ page }) => {
    await installApiMocks(page, withLogsMenu())
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    // bkz. claims.spec.ts aynı yorumu — ekran görüntüsü öncesi içeriğin GERÇEKTEN göründüğü
    // bekleniyor (test determinizmi, kod DEĞİŞMEDİ).
    await expect(page.locator('.exportLogList').getByText('E2E Test Ürünü - Gönderim')).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('logs-export-list.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — gönderim listesi (ihlaller bu görevde düzeltilmiyor, yalnızca kaydediliyor)', async ({ page }, testInfo) => {
    await installApiMocks(page, withLogsMenu())
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-ExportLogList-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] ExportLogList: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})

test.describe('P2 — Ürün Çekim İşlemleri (ImportLogList)', () => {
  test('smoke: arama kutusu + aktarım satırları render olur', async ({ page }) => {
    await installApiMocks(page, withLogsMenu())
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await openImportTab(page)

    await expect(page.getByLabel('İşlem No ile Ara').first()).toBeVisible()
    await expect(page.locator('.importLogList').getByText('Trendyol')).toBeVisible()
    await expect(page.locator('.importLogList').getByText('Hepsiburada')).toBeVisible()
  })

  test('boş durum: sonuç yoksa "Aktarım kaydı bulunamadı" kartı gösterilir (BİLİNÇLİ TAMAMLAMA — bkz. BACKLOG.md)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor — bkz. dosya başı NOT')
    await installApiMocks(page, withLogsMenu({ 'IntegrationService/getImportJobs': importJobsBosFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await openImportTab(page)

    await expect(page.getByText('Aktarım kaydı bulunamadı', { exact: true })).toBeVisible()
  })

  test('hata durumu: 500 alındığında "Aktarım kayıtları yüklenemedi" + Tekrar dene gösterilir (boştan AYRI), ham hata sızmaz', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor — bkz. dosya başı NOT')
    await installApiMocks(page, withLogsMenu({ 'IntegrationService/getImportJobs': mockError(500) }))
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await openImportTab(page)

    // DS-v2 Aşama 2 — BİLİNÇLİ DAVRANIŞ DEĞİŞİKLİĞİ: hata artık boş durumdan ayrı (isRequestError); API çağrısı AYNI.
    await expect(page.getByText('Aktarım kayıtları yüklenemedi')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: göz ikonuna tıklayınca aktarım detay raporu açılır', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor')
    await installApiMocks(page, withLogsMenu({ 'IntegrationService/getImportJobs': importJobsDoluFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await openImportTab(page)

    await page.locator('.importLogList tbody tr').first().locator('button:has(.mdi-eye-outline)').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Ürün Çekim İşlemi Detaylı Raporu' })
    await expect(dialog).toBeVisible()
  })

  test('ekran görüntüsü tabanı (aktarım listesi)', async ({ page }) => {
    await installApiMocks(page, withLogsMenu())
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await openImportTab(page)
    await expect(page.locator('.importLogList').getByText('Trendyol')).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('logs-import-list.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — aktarım listesi (ihlaller bu görevde düzeltilmiyor, yalnızca kaydediliyor)', async ({ page }, testInfo) => {
    await installApiMocks(page, withLogsMenu())
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await openImportTab(page)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-ImportLogList-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] ImportLogList: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})

test.describe('P2 — Gönderim Detay Raporu (DetailedExportLogReport)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Detay, masaüstü tablodaki göz ikonuyla açılıyor (mdAndUp/>=960px)')
    await installApiMocks(page, withLogsMenu({ 'IntegrationService/getExportJobs': exportJobsDoluFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await page.locator('.exportLogList tbody tr').first().locator('button:has(.mdi-eye-outline)').click()
    await expect(page.getByRole('dialog').filter({ hasText: 'Pazaryeri Gönderim Detaylı Raporu' })).toBeVisible()
  })

  test('smoke: ürün başlığı ve akış adımları render olur', async ({ page }) => {
    const dialog = page.getByRole('dialog').filter({ hasText: 'Pazaryeri Gönderim Detaylı Raporu' })
    await expect(dialog).toContainText('E2E Test Ürünü - Gönderim')
    await expect(dialog).toContainText('Tamamlandı')
  })

  test('ekran görüntüsü tabanı (gönderim detayı)', async ({ page }) => {
    // Playwright `toHaveScreenshot` varsayılanı `animations: 'disabled'` — `.status-pulse-intense`
    // (ADR Bağlam "pulse/ripple ihlali", ClaimDetailComponent'teki T4f göçüyle AYNI desende
    // --ek-duration-slow/--ek-easing-standard'a çekildi) ekran görüntüsü öncesi son duruma
    // sabitleniyor; süre/eğri değişimi fark ÜRETMİYOR.
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('logs-export-detail.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — gönderim detayı (ihlaller bu görevde düzeltilmiyor, yalnızca kaydediliyor)', async ({ page }, testInfo) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-DetailedExportLogReport-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] DetailedExportLogReport: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})

test.describe('P2 — Aktarım Detay Raporu (DetailedImportLogReport)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Detay, masaüstü tablodaki göz ikonuyla açılıyor (mdAndUp/>=960px)')
    await installApiMocks(page, withLogsMenu({ 'IntegrationService/getImportJobs': importJobsDoluFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await openImportTab(page)
    await page.locator('.importLogList tbody tr').first().locator('button:has(.mdi-eye-outline)').click()
    await expect(page.getByRole('dialog').filter({ hasText: 'Ürün Çekim İşlemi Detaylı Raporu' })).toBeVisible()
  })

  test('smoke: akış adımları render olur', async ({ page }) => {
    const dialog = page.getByRole('dialog').filter({ hasText: 'Ürün Çekim İşlemi Detaylı Raporu' })
    await expect(dialog).toBeVisible()
  })

  test('ekran görüntüsü tabanı (aktarım detayı)', async ({ page }) => {
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('logs-import-detail.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — aktarım detayı (ihlaller bu görevde düzeltilmiyor, yalnızca kaydediliyor)', async ({ page }, testInfo) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-DetailedImportLogReport-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] DetailedImportLogReport: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})
