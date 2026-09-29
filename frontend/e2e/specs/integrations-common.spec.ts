// P1 — integrations/* (Marketplace, ECommerce, ERP): ortak desenli 3 view.
// Not (araştırma bulgusu): `views/secure/integrations/IntegrationsView.vue` yalnızca `<router-view>`
// içeren bir kabuk dosyasıdır; menü/sekme sistemi (menuStore.views Map'i) bu dosyayı hiç
// referans almıyor — sekmeli gezinmede ("menüden tıklayarak", ADR-0011 Karar 4) gerçekten
// ulaşılabilen 5 leaf view var (Marketplace/ECommerce/Shipping/EInvoice/Erp). Bu yüzden P1
// tablosundaki "6 view" ifadesi ADR'de dosya sayısını sayıyor; testler yalnızca gerçek kullanıcı
// yolundan ulaşılabilen 5 view'ı kapsıyor (Shipping ayrı — bkz. not en altta).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { clientIntegrationsBosFixture } from '../fixtures/apiData'
import { expectScreenOpen, gotoAuthed, openScreen } from '../fixtures/nav'

interface CommonIntegrationScreen {
  code: 'MarketplaceView' | 'ECommerceView' | 'ErpView'
  containerClass: string
  retrieveEndpoint: string
  clientKey: 'marketplace' | 'ecommerce' | 'erp'
  firstPlatformCode: string
  secondPlatformCode?: string
}

const screens: CommonIntegrationScreen[] = [
  { code: 'MarketplaceView', containerClass: '.marketplaceView', retrieveEndpoint: 'IntegrationService/retrieveClientMarketplaceSettings', clientKey: 'marketplace', firstPlatformCode: 'trendyol', secondPlatformCode: 'hepsiburada' },
  { code: 'ECommerceView', containerClass: '.ecommerceView', retrieveEndpoint: 'IntegrationService/retrieveClientECommerceSettings', clientKey: 'ecommerce', firstPlatformCode: 'ideasoft' },
  { code: 'ErpView', containerClass: '.erpView', retrieveEndpoint: 'IntegrationService/retrieveClientErpSettings', clientKey: 'erp', firstPlatformCode: 'bizimhesap' },
]

for (const s of screens) {
  test.describe(`P1 — integrations/${s.code}`, () => {
    test(`${s.code} smoke: platform rayı + ilk platformun ayar formu render olur`, async ({ page }) => {
      await installApiMocks(page)
      await gotoAuthed(page)
      await openScreen(page, s.code)

      await expectScreenOpen(page, s.containerClass)
      await expect(page.locator(s.containerClass).getByText('Hızlı Başlangıç Rehberi')).toBeVisible()
      // onMounted ilk platformu otomatik seçip ayar formunu getiriyor (empty-state GÖRÜNMEMELİ).
      await expect(page.locator(s.containerClass).getByText('Başlamak İçin Seçim Yapın')).toHaveCount(0)
    })

    test(`${s.code} boş durum: mağazada bu tür entegrasyon yoksa boş-durum kartı gösterilir`, async ({ page }) => {
      const bos = { ...clientIntegrationsBosFixture }
      await installApiMocks(page, { 'IntegrationService/getClientIntegrations': bos })
      await gotoAuthed(page)
      await openScreen(page, s.code)

      await expect(page.locator(s.containerClass).getByText('Başlamak İçin Seçim Yapın')).toBeVisible()
    })

    test(`${s.code} hata durumu: ayar getirme 500 dönerse sessizce boş-durum kartına düşer (gizli davranış — bkz. BACKLOG.md)`, async ({ page }) => {
      // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md): üstteki platform rayında
      // entegrasyon seçili görünse bile, ayar getirme isteği hata dönerse `editingClientIntegration`
      // hiç güncellenmiyor (`response && response.settings` şartı sağlanmıyor) ve ekran BOŞ-DURUM
      // kartını gösteriyor — kullanıcıya "bir şeyler ters gitti" denmiyor, seçim sıfırlanmış gibi görünüyor.
      await installApiMocks(page, { [s.retrieveEndpoint]: mockError(500) })
      await gotoAuthed(page)
      await openScreen(page, s.code)

      await expect(page.locator(s.containerClass).getByText('Başlamak İçin Seçim Yapın')).toBeVisible()
      await expect(page.locator('body')).not.toContainText('500')
    })

    if (s.secondPlatformCode) {
      test(`${s.code} etkileşim: ikinci platforma tıklayınca seçim/ayar formu değişir`, async ({ page }) => {
        await installApiMocks(page)
        await gotoAuthed(page)
        await openScreen(page, s.code)

        const icons = page.locator(s.containerClass).locator('.nav-item-wrapper')
        await expect(icons).toHaveCount(2)
        await icons.nth(1).click()
        await expect(icons.nth(1)).toHaveClass(/is-selected/)
      })
    }

    test(`${s.code} ekran görüntüsü tabanı`, async ({ page }) => {
      await installApiMocks(page)
      await gotoAuthed(page)
      await openScreen(page, s.code)
      await page.waitForTimeout(300)
      await expect(page).toHaveScreenshot(`integration-${s.code}.png`, { fullPage: false })
    })

    test(`${s.code} axe: WCAG 2.1 AA taraması (ihlaller bu görevde düzeltilmiyor, yalnızca kaydediliyor)`, async ({ page }, testInfo) => {
      await installApiMocks(page)
      await gotoAuthed(page)
      await openScreen(page, s.code)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      await testInfo.attach(`axe-${s.code}-sonuclari.json`, { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
      console.log(`[axe] ${s.code}: ${results.violations.length} WCAG 2.1 AA ihlali`)
    })
  })
}

// Shipping: CLAUDE.md'ye göre gerçek backend entegrasyonu YOK — clientIntegrations.shipment DOLU
// fixture'da da her zaman [] (bkz. apiData.ts). Bu yüzden ekran, gerçek uygulamada da, DAİMA
// boş-durum kartını gösterir; ayrı bir "dolu" senaryosu yoktur (bu, sabitlenen gerçek davranıştır).
test.describe('P1 — integrations/ShippingView', () => {
  test('smoke + boş durum: kargo entegrasyonu backend’de yok, ekran daima boş-durum kartı gösterir', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ShippingView')

    await expectScreenOpen(page, '.shippingView')
    await expect(page.locator('.shippingView').getByText('Başlamak İçin Seçim Yapın')).toBeVisible()
  })

  test('hata durumu: IntegrationService/getClientIntegrations 500 dönse bile ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page, { 'IntegrationService/getClientIntegrations': mockError(500) })
    await gotoAuthed(page)
    await openScreen(page, 'ShippingView')

    await expectScreenOpen(page, '.shippingView')
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('ekran görüntüsü tabanı', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ShippingView')
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('integration-ShippingView.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması (ihlaller bu görevde düzeltilmiyor, yalnızca kaydediliyor)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ShippingView')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-ShippingView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] ShippingView: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})
