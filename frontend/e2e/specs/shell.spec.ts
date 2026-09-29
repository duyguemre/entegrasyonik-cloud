// P1 — Kabuk: SecureLayout + NavigationMenu + ApplicationBar (ADR-0011 Karar 2 tablosu).
// DEĞİŞTİRİLMEMİŞ koda karşı characterization: menüden tıklama gerçek kullanıcı yolu (Açık Soru 3).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed, openDrawer, openScreen, waitForShellReady, waitForPlatformListStable } from '../fixtures/nav'

test.describe('P1 — Kabuk (SecureLayout/NavigationMenu/ApplicationBar)', () => {
  test('smoke: kabuk mount olur, dashboard sekmesi otomatik açılır', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)

    await expect(page.locator('.workplace-tabs')).toBeVisible()
    // .dashboard kökünün kutu-tabanlı görünürlüğü yerine metin kullanılıyor — bkz. nav.ts notu.
    await expect(page.getByText('İŞLETME PERFORMANSI')).toBeVisible()
    // ApplicationBar marka işareti + arama kutusu gerçekten render oluyor mu.
    // [ADR-0015 Karar 5.1 izinli değişiklik 1] `img[src="/assets/images/logo6.png"]` yerine —
    // logo artık `EkBrandLogo` (inline SVG, `role="img"`) ile render ediliyor; niyet ("logo render
    // oluyor") AYNEN korunur.
    await expect(page.getByRole('img', { name: 'Entegrasyonik' })).toBeVisible()
  })

  test('boş durum: MenuService boş dizi döndürürse kabuk sessizce içeriksiz kalır (gizli davranış — bkz. BACKLOG.md)', async ({ page }) => {
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md'ye "incelenmesi gereken davranış" olarak eklendi):
    // menuStore.init() boş diziyi (`[]`) geçerli/işlenmiş kabul etmiyor (`menu.value.length > 0` şartı),
    // ama SecureLayout.init() `!menuList` kontrolüyle boş diziyi de "menü geldi" sayıp bekleme döngüsünden çıkıyor.
    // Sonuç: dashboard sekmesi HİÇBİR ZAMAN otomatik açılmıyor, kullanıcıya hata/boş-durum mesajı da gösterilmiyor —
    // sessizce boş bir çalışma alanı kalıyor.
    await installApiMocks(page, { MenuService: [] })
    await page.goto('/')

    await expect(page.locator('.v-layout')).toBeVisible()
    await page.waitForTimeout(500)
    await expect(page.locator('.dashboard')).toHaveCount(0)
    // Ham hata/stack metni sızmıyor.
    await expect(page.locator('body')).not.toContainText('TypeError')
    await expect(page.locator('body')).not.toContainText('undefined is not')
  })

  test('hata durumu: MenuService 500 döndürürse aynı sessiz boş davranış tekrarlanır (gizli davranış)', async ({ page }) => {
    await installApiMocks(page, { MenuService: mockError(500) })
    await page.goto('/')

    await page.waitForTimeout(500)
    await expect(page.locator('.dashboard')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('500')
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })

  // [ADR-0015 Karar 5.1 izinli değişiklik 2] Başlık metni güncellendi (yalnız metin — kalıcı
  // kabukta masaüstü varsayılanı zaten açıktır, "logoya tıklayınca" artık her viewport'ta doğru
  // değil); iddia (menü açılır + menüden gidilir) `openDrawer()`/`openScreen()` yardımcılarına
  // taşınmış durumda AYNEN sürüyor.
  test('etkileşim: sol menü (kalıcı/ray/geçici) açılır, menüden Siparişler ekranına gidilir', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)

    await openDrawer(page)
    await expect(page.locator('.v-navigation-drawer.soft-nav')).toBeVisible()

    await openScreen(page, 'OrderListView')
    await expect(page.locator('.orderListView')).toBeVisible()
  })

  test('ekran görüntüsü tabanı (kabuk + dashboard)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await waitForPlatformListStable(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('shell-dashboard.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması (ihlaller bu görevde düzeltilmiyor, yalnızca kaydediliyor)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-kabuk-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] Kabuk: ${results.violations.length} WCAG 2.1 AA ihlali (bkz. ek: axe-kabuk-sonuclari.json)`)
    // Bilinçli olarak assert edilmiyor: ADR-0011 Karar 4 ihlallerin bu görevde KAYDEDİLMESİNİ, düzeltilmesini DEĞİL istiyor.
  })
})
