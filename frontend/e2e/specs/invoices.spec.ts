// P2 — InvoiceListView + InvoiceDetailComponent (ADR-0011 Karar 2 tablosu).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { invoicesBosFixture, invoicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'

// NOT (orders.spec.ts ile aynı gerçek davranış): `v-data-table-server` yalnızca
// `$vuetify.display.mdAndUp` (>=960px) iken render oluyor; `chromium-tablet` (800px) de mobil
// kart düzenine düşüyor. Göz ikonu etkileşimi bu yüzden yalnızca `chromium-desktop`'ta.

test.describe('P2 — Faturalar (InvoiceListView)', () => {
  test('smoke: arama kutusu + fatura satırları render olur', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'InvoiceListView')

    await expect(page.locator('.invoiceListView')).toBeVisible()
    await expect(page.getByLabel('Fatura No, Sipariş No veya Pazar Yeri Kodu Filtrele').first()).toBeVisible()
    await expect(page.getByText('INV-E2E-0001')).toBeVisible()
    await expect(page.getByText('INV-E2E-0002')).toBeVisible()
  })

  test('boş durum: sonuç yoksa "Fatura Bulunamadı" kartı gösterilir (BİLİNÇLİ TAMAMLAMA — bkz. BACKLOG.md)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor — bkz. dosya başı NOT')
    // BİLİNÇLİ TAMAMLAMA (characterization AŞAMASINDA bugünkü davranış Vuetify'ın kendi `tr`
    // locale varsayılanıydı — "Bu görünümde veri yok.", node_modules/vuetify/lib/locale/tr.js
    // `noDataText` — InvoiceListView.vue'nin masaüstü `v-data-table-server`'ında diğer 3 P2
    // ekranından FARKLI olarak `template v-slot:no-data` YOKTU). Token+a11y göçünde (ADR-0011
    // Karar 2 KAPSAM: "eksik boş/hata/yükleniyor durumlarını tamamla") bu eksik durum diğer 3
    // ekranla AYNI `EmptyState` bileşeniyle TAMAMLANDI — iş mantığı (veri çekme/filtreleme)
    // DEĞİŞMEDİ, yalnızca bu görsel durum eklendi; bu test o bilinçli değişiklikle güncellendi.
    await installApiMocks(page, { 'InvoiceService/getInvoices': invoicesBosFixture })
    await gotoAuthed(page)
    await openScreen(page, 'InvoiceListView')

    await expect(page.getByText('Fatura Bulunamadı')).toBeVisible()
  })

  test('hata durumu: 500 alındığında "Faturalar yüklenemedi" + Tekrar dene gösterilir (boştan AYRI), ham hata sızmaz', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor — bkz. dosya başı NOT')
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md): `restApi.post` HİÇBİR ZAMAN
    // reddetmiyor (bkz. restapi.ts `postService`); bu yüzden `getInvoices`'daki `catch` bloğu
    // (snackbar) da HİÇ TETİKLENMİYOR, `res.invoices` undefined kalıp liste güncellenmiyor —
    // kullanıcı "hata" ile "gerçekten kayıt yok" durumunu AYIRT EDEMİYOR. Boş-durum metni yukarıdaki
    // testle AYNI bilinçli tamamlamaya tabi (EmptyState).
    await installApiMocks(page, { 'InvoiceService/getInvoices': mockError(500) })
    await gotoAuthed(page)
    await openScreen(page, 'InvoiceListView')

    // DS-v2 Aşama 2 — BİLİNÇLİ DAVRANIŞ DEĞİŞİKLİĞİ: hata artık boş durumdan ayrı (isRequestError); API çağrısı AYNI.
    await expect(page.getByText('Faturalar yüklenemedi')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: göz ikonuna tıklayınca fatura detayı açılır', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor')
    await installApiMocks(page, { 'InvoiceService/getInvoices': invoicesDoluFixture })
    await gotoAuthed(page)
    await openScreen(page, 'InvoiceListView')

    await page.locator('.invoiceListView tbody tr').first().locator('button:has(.mdi-eye)').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'INV-E2E-0001' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Fatura Detayları')
  })

  test('ekran görüntüsü tabanı (fatura listesi)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'InvoiceListView')
    // bkz. claims.spec.ts aynı yorumu — ekran görüntüsü öncesi içeriğin GERÇEKTEN göründüğü
    // bekleniyor (test determinizmi, kod DEĞİŞMEDİ).
    await expect(page.getByText('INV-E2E-0001')).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('invoices-list.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — fatura listesi (ADR-0015 Aşama B çıkış kapısı: ekranın KENDİ içeriğinde 0 ihlal; kabuk/menü A grubunun kapsamıdır, ayrıca izlenir)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'InvoiceListView')
    await expect(page.getByText('INV-E2E-0001')).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.invoiceListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-InvoiceListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] InvoiceListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
    // A-yaması gerekli (bkz. customers.spec.ts aynı not) — EkDataTable role=table + nested <table>.
    const knownDsIssues = new Set(['aria-required-children'])
    const ownViolations = results.violations.filter(v => !knownDsIssues.has(v.id))
    expect(ownViolations, JSON.stringify(ownViolations, null, 2)).toEqual([])
  })
})
