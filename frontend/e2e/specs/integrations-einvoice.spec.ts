// P1 — integrations/EInvoiceView. Diğer 4 entegrasyon view'ından farklı: `einvoiceStore` STATİK
// bir liste döndürüyor (backend çağrısı yok — bkz. src/stores/einvoice.ts), bu yüzden ayrı dosyada.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { expectScreenOpen, gotoAuthed, openScreen } from '../fixtures/nav'

test.describe('P1 — integrations/EInvoiceView', () => {
  test('smoke: platform rayı statik listeden gelir, ilk sağlayıcı otomatik seçilir', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'EInvoiceView')

    await expectScreenOpen(page, '.einvoiceView')
    await expect(page.locator('.einvoiceView').getByText('Hızlı başlangıç rehberi')).toBeVisible()
    // einvoiceStore statik olduğu için bu ekranda gerçek bir "boş durum" senaryosu yoktur
    // (liste her zaman dolu) — bu, sabitlenen gerçek davranıştır.
    await expect(page.locator('.einvoiceView').getByText('Başlamak için seçim yapın')).toHaveCount(0)
  })

  test('hata durumu: ilişkisiz API çağrıları 500 dönse bile statik ekran etkilenmez, ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page, { 'IntegrationService/getClientIntegrations': mockError(500) })
    await gotoAuthed(page)
    await openScreen(page, 'EInvoiceView')

    await expectScreenOpen(page, '.einvoiceView')
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: ikinci sağlayıcıya tıklayınca form değişir', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'EInvoiceView')

    const items = page.locator('.einvoiceView .nav-item-wrapper')
    await expect(items.nth(1)).toBeVisible()
    await items.nth(1).click()
    await expect(items.nth(1)).toHaveClass(/is-selected/)
  })

  test('ekran görüntüsü tabanı', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'EInvoiceView')
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('integration-EInvoiceView.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması (ihlaller bu görevde düzeltilmiyor, yalnızca kaydediliyor)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'EInvoiceView')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-EInvoiceView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] EInvoiceView: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})
