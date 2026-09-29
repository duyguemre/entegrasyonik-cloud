// P2 — CustomerListView + CustomerDetailComponent (ADR-0011 Karar 2 tablosu).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { buildCustomerDetail, customersBosFixture, customersDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'

// NOT (orders.spec.ts ile aynı gerçek davranış): `v-data-table-server` yalnızca
// `$vuetify.display.mdAndUp` (>=960px) iken render oluyor; `chromium-tablet` (800px) de mobil
// kart düzenine düşüyor. Göz ikonu etkileşimi bu yüzden yalnızca `chromium-desktop`'ta.

test.describe('P2 — Müşteriler (CustomerListView)', () => {
  test('smoke: arama kutusu + müşteri satırları render olur', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'CustomerListView')

    await expect(page.locator('.customerListView')).toBeVisible()
    await expect(page.getByLabel('İsim, Telefon, E-posta veya Vergi No').first()).toBeVisible()
    await expect(page.getByText('Ayşe Yılmaz')).toBeVisible()
    await expect(page.getByText('Mehmet Demir')).toBeVisible()
  })

  test('boş durum: sonuç yoksa "Müşteri Bulunamadı" kartı gösterilir', async ({ page }) => {
    await installApiMocks(page, { 'CustomerService/getCustomers': customersBosFixture })
    await gotoAuthed(page)
    await openScreen(page, 'CustomerListView')

    await expect(page.getByText('Müşteri Bulunamadı')).toBeVisible()
  })

  test('hata durumu: 500 alındığında da aynı "Müşteri Bulunamadı" boş-durumuna düşülür, ham hata sızmaz (gizli davranış — bkz. BACKLOG.md)', async ({ page }) => {
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md): `restApi.post` HİÇBİR ZAMAN
    // reddetmiyor (bkz. restapi.ts `postService` — hata `resolve(error)` ile çözülüyor); bu yüzden
    // `getCustomersInternal`'daki `catch` bloğu (snackbar) da HİÇ TETİKLENMİYOR, `res.customers`
    // undefined kalıp liste güncellenmiyor — kullanıcı "hata" ile "gerçekten kayıt yok" durumunu
    // AYIRT EDEMİYOR (OrderListView ile birebir aynı desen).
    await installApiMocks(page, { 'CustomerService/getCustomers': mockError(500) })
    await gotoAuthed(page)
    await openScreen(page, 'CustomerListView')

    await expect(page.getByText('Müşteri Bulunamadı')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: göz ikonuna tıklayınca müşteri karnesi açılır', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor')
    await installApiMocks(page, {
      'CustomerService/getCustomers': customersDoluFixture,
      'CustomerService/getCustomerDetail': buildCustomerDetail(),
    })
    await gotoAuthed(page)
    await openScreen(page, 'CustomerListView')

    await page.locator('.customerListView tbody tr').first().locator('button:has(.mdi-eye)').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Müşteri Kartı' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Ayşe Yılmaz')
  })

  test('ekran görüntüsü tabanı (müşteri listesi)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'CustomerListView')
    // bkz. claims.spec.ts aynı yorumu — ekran görüntüsü öncesi içeriğin GERÇEKTEN göründüğü
    // bekleniyor (test determinizmi, kod DEĞİŞMEDİ).
    await expect(page.getByText('Ayşe Yılmaz')).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('customers-list.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — müşteri listesi (ADR-0015 Aşama B çıkış kapısı: ekranın KENDİ içeriğinde 0 ihlal; kabuk/menü A grubunun kapsamıdır, ayrıca izlenir)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'CustomerListView')
    await expect(page.getByText('Ayşe Yılmaz')).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.customerListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-CustomerListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] CustomerListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
    // A-yaması gerekli (bu görevin kapsamı DIŞI — src/components/ds/** dokunulamaz):
    // `EkDataTable.vue` kök `<div role="table">` ile İÇİNDE gerçek bir `<table>` render ediyor;
    // axe `aria-required-children` bunu "role=table öğesinin izin verilmeyen <table> çocuğu var"
    // olarak işaretliyor (DS bileşeninin KENDİSİNDEN kaynaklanıyor, bu ekrana özgü değil — TÜM
    // `EkDataTable` kullanan ekranlarda tekrarlanacak). Düzeltme: wrapper'daki `role="table"`
    // kaldırılmalı (native `<table>` zaten doğru semantiği sağlıyor). Orkestratöre bildirildi.
    const knownDsIssues = new Set(['aria-required-children'])
    const ownViolations = results.violations.filter(v => !knownDsIssues.has(v.id))
    expect(ownViolations, JSON.stringify(ownViolations, null, 2)).toEqual([])
  })
})
