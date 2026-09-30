// P2 — Admin paneli / Mağaza Yönetimi (AdminClientListView + AdminClientDetailComponent +
// AdminClientCreateComponent + ClientStatsCard). ADR-0011 Karar 2 tablosu: "admin panel
// ekranları". platformAdmin-only ekranlar (ADR-0001 OPERATION_POLICY platformAdmin katmanı —
// backend `AdminService` yalnızca süper yönetici içindir); menü kaydı ApplicationDB `menus`
// koleksiyonunda olduğundan burada sentetik bir 'adminPanel' grubu (`menuFixtureWithAdmin`,
// nav.ts) `MenuService` override'ıyla kullanılıyor.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { adminClientsBosFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixtureWithAdmin, openScreen } from '../fixtures/nav'

// NOT: `AdminClientListView`'in `v-data-table-server`'ı (CustomerListView/ClaimListView'in AKSİNE)
// `$vuetify.display.mdAndUp` koşuluna BAĞLI DEĞİL — tablo her viewport'ta render oluyor (mobil kart
// düzeni yok). Bu yüzden aşağıdaki testler 3 viewport'un tamamında koşar.

function withAdminMenu(overrides: Record<string, any> = {}) {
  return { MenuService: menuFixtureWithAdmin, ...overrides }
}

test.describe('P2 — Admin / Mağaza Yönetimi (AdminClientListView)', () => {
  test('smoke: arama kutusu + özet çubuğu + mağaza satırları render olur', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')

    await expect(page.locator('.adminClientListView')).toBeVisible()
    await expect(page.getByLabel('Müşteri / Mağaza Ara').first()).toBeVisible()
    await expect(page.getByText('E2E Örnek Mağaza', { exact: true })).toBeVisible()
    await expect(page.getByText('E2E Pasif Mağaza', { exact: true })).toBeVisible()
    await expect(page.getByText('Toplam Mağaza')).toBeVisible()
    await expect(page.locator('.adminClientListView tbody tr')).toHaveCount(2)
  })

  test('boş durum: sonuç yoksa "Mağaza bulunamadı" kartı gösterilir (BİLİNÇLİ TAMAMLAMA — bkz. BACKLOG.md)', async ({ page }) => {
    // BİLİNÇLİ TAMAMLAMA (characterization AŞAMASINDA bugünkü davranış Vuetify'ın kendi `tr` locale
    // varsayılanıydı — "Bu görünümde veri yok." — `v-slot:no-data` YOKTU; diğer P2 ekranlarındaki
    // (Customer/Claim/Invoice/Message/Log) aynı eksiklik). Token+a11y göçünde `EmptyState` ile
    // TAMAMLANDI — iş mantığı DEĞİŞMEDİ, yalnızca bu görsel durum eklendi.
    await installApiMocks(page, withAdminMenu({ 'AdminService/getClients': adminClientsBosFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')

    await expect(page.getByText('Mağaza bulunamadı', { exact: true })).toBeVisible()
  })

  test('hata durumu: 500 alındığında "Mağazalar yüklenemedi" + Tekrar dene gösterilir, ham hata sızmaz', async ({ page }) => {
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md): `restApi.post` HİÇBİR ZAMAN
    // reddetmiyor (bkz. restapi.ts `postService`); `loadClients` yalnızca `try/finally` kullanıyor
    // (catch YOK) ve `res?.success` falsy olunca `clients` başlangıç değeri `[]`'de kalıyor —
    // kullanıcı "hata" ile "gerçekten mağaza yok" durumunu AYIRT EDEMİYOR (diğer P2 ekranlarıyla
    // aynı desen; snackbar da tetiklenmiyor).
    await installApiMocks(page, withAdminMenu({ 'AdminService/getClients': mockError(500) }))
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')

    // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: hata artık boş durumdan AYRI ("Mağazalar yüklenemedi" + "Tekrar dene").
    await expect(page.getByText('Mağazalar yüklenemedi', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: satıra/göz ikonuna tıklayınca mağaza detay analizi açılır, sekmeler arası geçilir', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')

    await page.locator('.adminClientListView tbody tr').first().locator('button:has(.mdi-eye-outline)').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Mağaza Detay Analizi' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('E2E Örnek Mağaza')
    // Genel bakış sekmesi: ClientStatsCard'lar (Toplam Ürün / Siparişler) + entegrasyonlar.
    await expect(dialog.getByText('Toplam Ürün')).toBeVisible()
    await expect(dialog.getByText('Aktif Entegrasyonlar')).toBeVisible()

    // Aşama 6b: EkPageTabs cümle düzeni (iddia aynı).
    await dialog.getByRole('tab', { name: /Operasyonel izleme/i }).click()
    await expect(dialog.getByText('EXPORT DURUMU')).toBeVisible()
    await expect(dialog.getByText('IMPORT DURUMU')).toBeVisible()
  })

  test('etkileşim: "+" düğmesi yeni mağaza oluşturma diyaloğunu açar', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')

    // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: "+" başlık düğmesi yerine başlık eylemi "Yeni mağaza oluştur".
    await page.getByRole('button', { name: 'Yeni mağaza oluştur' }).click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Yeni Mağaza Oluştur' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Mağaza Adı')).toBeVisible()
    await expect(dialog.getByLabel('E-Posta Adresi')).toBeVisible()
  })

  test('etkileşim: silme düğmesi önce onay ister; onaylanınca deleteClient çağrılır (yıkıcı işlem)', async ({ page }) => {
    const deleteBodies: any[] = []
    await installApiMocks(page, withAdminMenu({
      'AdminService/deleteClient': async (route: any, headers: Record<string, string>) => {
        deleteBodies.push(route.request().postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ success: true }) })
      },
    }))
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')

    await page.locator('.adminClientListView tbody tr').first().locator('button:has(.mdi-trash-can-outline)').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Müşteri Sil' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Bu işlem geri alınamaz')
    // Onay verilmeden hiçbir silme isteği gitmemeli.
    expect(deleteBodies).toHaveLength(0)

    await dialog.getByRole('button', { name: /Evet, Sil/i }).click()
    await expect.poll(() => deleteBodies.length).toBe(1)
    // İstemci hedef mağazayı `order` (mağaza sıra no) ile tanımlıyor.
    expect(deleteBodies[0]).toEqual({ targetClientId: 1001 })
  })

  test('ekran görüntüsü tabanı (mağaza listesi)', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')
    await expect(page.getByText('E2E Örnek Mağaza', { exact: true })).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('admin-clients-list.png', { fullPage: false })
  })

  test('ekran görüntüsü tabanı (mağaza detay analizi)', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')
    await page.locator('.adminClientListView tbody tr').first().locator('button:has(.mdi-eye-outline)').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Mağaza Detay Analizi' })
    await expect(dialog.getByText('Aktif Entegrasyonlar')).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('admin-clients-detail.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — mağaza listesi', async ({ page }, testInfo) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')
    await expect(page.getByText('E2E Örnek Mağaza', { exact: true })).toBeVisible()
    // Geçiş animasyonu (sekme/diyalog opaklık geçişi) bitmeden ölçülürse yarı saydam renkler yanlış kontrast
    // sonucu üretir — ölçüm ÖNCESİ oturmasını bekle.
    await page.waitForTimeout(600)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-AdminClientListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] AdminClientListView (tüm sayfa, kabuk dahil): ${results.violations.length} WCAG 2.1 AA ihlali — ${results.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
    // Ekranın KENDİ payı: yalnızca `.adminClientListView` alt ağacı (kabuk/appbar ihlalleri hariç).
    const scoped = await new AxeBuilder({ page }).include('.adminClientListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    console.log(`[axe] AdminClientListView (yalnız ekran): ${scoped.violations.length} ihlal — ${scoped.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
  })

  test('axe: WCAG 2.1 AA taraması — mağaza detay analizi diyaloğu', async ({ page }, testInfo) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')
    await page.locator('.adminClientListView tbody tr').first().locator('button:has(.mdi-eye-outline)').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Mağaza Detay Analizi' })
    await expect(dialog.getByText('Aktif Entegrasyonlar')).toBeVisible()
    // Geçiş animasyonu (sekme/diyalog opaklık geçişi) bitmeden ölçülürse yarı saydam renkler yanlış kontrast
    // sonucu üretir — ölçüm ÖNCESİ oturmasını bekle.
    await page.waitForTimeout(600)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-AdminClientDetailComponent-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] AdminClientDetailComponent (tüm sayfa, kabuk dahil): ${results.violations.length} WCAG 2.1 AA ihlali — ${results.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
    // Diyaloğun KENDİ payı: yalnızca açık `role="dialog"` overlay içeriği.
    const scoped = await new AxeBuilder({ page }).include('.v-overlay--active .v-overlay__content').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    console.log(`[axe] AdminClientDetailComponent (yalnız diyalog): ${scoped.violations.length} ihlal — ${scoped.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
  })
})
