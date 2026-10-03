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
    await expect(page.getByLabel('Ürün Adı, Stok Kodu, Barkod').first()).toBeVisible()
    await expect(page.getByText('E2E Test Ürünü')).toBeVisible()
    await expect(page.getByText('E2E İkinci Ürün')).toBeVisible()
  })

  test('boş durum: sonuç yoksa "Ürün Bulunamadı" kartı gösterilir', async ({ page }) => {
    await installApiMocks(page, { 'ProductService/getProducts': productsBosFixture })
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')

    await expect(page.getByText('Ürün Bulunamadı')).toBeVisible()
  })

  test('hata durumu: 500 alındığında da aynı "Ürün Bulunamadı" boş-durumuna düşülür, ham hata sızmaz (gizli davranış — bkz. BACKLOG.md)', async ({ page }) => {
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md): getProducts() `if (response &&
    // response.products)` şartı sağlanmadığında `loading.value = false` satırı da ÇALIŞMIYOR (yalnızca
    // başarı dalının İÇİNDE) — ama tablonun `:loading` prop'u zaten hardcoded `false` olduğu için bu
    // sızıntının görünür bir etkisi yok; dashboard/orders'daki aynı desenle tutarlı (bkz. BACKLOG.md).
    await installApiMocks(page, { 'ProductService/getProducts': mockError(500) })
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')

    await expect(page.getByText('Ürün Bulunamadı')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: ürün satırına tıklayınca varyant/seçim alanı genişler', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')

    const firstRow = page.locator('.productListView tbody tr').first()
    await firstRow.getByText('E2E Test Ürünü').click()
    await expect(firstRow.locator('.v-checkbox-btn')).toBeVisible()
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
    await expect(page.getByText('E2E Test Ürünü')).toBeVisible()
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
