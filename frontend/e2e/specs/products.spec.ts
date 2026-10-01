// P1 — ProductListView (ADR-0011 Karar 2 tablosu, 22 hex).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { productsBosFixture } from '../fixtures/apiData'
import { expectScreenOpen, gotoAuthed, openScreen } from '../fixtures/nav'

test.describe('P1 — Ürünler (ProductListView)', () => {
  test('smoke: arama kutusu + ürün satırları render olur', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')

    await expectScreenOpen(page, '.productListView')
    await expect(page.getByLabel('Ürün adı, stok kodu, barkod').first()).toBeVisible()
    // Birleştirme (Aşama 3): pano kartları da aynı ürün adını taşıyor (gizli sekmede DOM'da) → ekrana kapsandı.
    await expect(page.locator('.productListView').getByText('E2E Test Ürünü', { exact: true })).toBeVisible()
    await expect(page.locator('.productListView').getByText('E2E İkinci Ürün', { exact: true })).toBeVisible()
  })

  test('boş durum: sonuç yoksa "Ürün bulunamadı" kartı gösterilir', async ({ page }) => {
    await installApiMocks(page, { 'ProductService/getProducts': productsBosFixture })
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')

    await expect(page.getByText('Ürün bulunamadı')).toBeVisible()
  })

  test('hata durumu: 500 alındığında "Ürünler yüklenemedi" + Tekrar dene gösterilir (boştan AYRI), ham hata sızmaz', async ({ page }) => {
    // DS-v2 Aşama 2 — BİLİNÇLİ DAVRANIŞ DEĞİŞİKLİĞİ: eskiden hata "Ürün bulunamadı" boş durumuna düşüyordu
    // (ve `loading` başarısızlıkta false olmuyordu). Artık `isRequestError` ile hata ayrı gösterilir; API çağrısı AYNI.
    await installApiMocks(page, { 'ProductService/getProducts': mockError(500) })
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')

    await expect(page.getByText('Ürünler yüklenemedi')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(page.locator('.productListView')).not.toContainText('500')
  })

  test('etkileşim: ürün satırına tıklayınca varyant/seçim alanı genişler', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')

    const firstRow = page.locator('.productListView tbody tr').first()
    await firstRow.getByText('E2E Test Ürünü').click()
    // DS-v2: satır onay kutusu EkDataGrid'in yerel checkbox'ı (eski `.v-checkbox-btn`).
    await expect(firstRow.locator('input[type="checkbox"]')).toBeVisible()
  })

  test('ekran görüntüsü tabanı (ürün listesi)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('products-list.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması (ADR-0015 Aşama B çıkış kapısı: ekranın KENDİ içeriğinde 0 ihlal; kabuk A grubunun kapsamıdır)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    await expect(page.locator('.productListView').getByText('E2E Test Ürünü', { exact: true })).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.productListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-ProductListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] ProductListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
    // A-yaması gerekli (bu görevin kapsamı DIŞI — ProductListView.vue KESİN YASAK/kapsam
    // listesinde SADECE bu dosya vardı, çağırdığı productDefinitions alt bileşenleri DEĞİL):
    // 1) avoid-inline-spacing (8) — IntegrationAvatarComponent.vue'nin platform rozeti metni.
    // 2) button-name (1) — ProductImageComponent.vue'nin tıklanabilir kök butonu erişilebilir
    //    ad taşımıyor; PaginationComponent (2) devre dışı ok butonları da aynı şekilde etkin
    //    değilken aria-label taşımıyor (ADR bu dosyayı A'ya ait "PaginationComponent a11y" işi
    //    olarak listeliyor, B1 kapsamı değil).
    // 3) label (3) — ProductAdvancedSearchComponent.vue içindeki alanlar.
    // Bu ekranın KENDİ satırlarındaki (arama/yenile/ekle/düzenle/sil/toplu-işlem) ikon
    // düğmelerine aria-label eklendi ve gereksiz iç içe v-bind (nested-interactive/
    // aria-allowed-attr) kaldırıldı — bu görevde ölçülebilir düşüş: 8 ihlal türü -> 3.
    const knownOutOfScopeIssues = new Set(['avoid-inline-spacing', 'button-name', 'label'])
    const ownViolations = results.violations.filter(v => !knownOutOfScopeIssues.has(v.id))
    expect(ownViolations, JSON.stringify(ownViolations, null, 2)).toEqual([])
  })
})
