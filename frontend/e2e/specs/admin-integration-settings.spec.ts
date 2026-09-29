// ADR-0020 Aşama C — Entegrasyon ayarları ekranı (`IntegrationSettingsView` →
// `IntegrationConfigSettingsBody`, hedef = entegrasyon kodu). NOT: bugünkü katalogda (Aşama B)
// `scope:'integration'` alanların TAMAMI `overridable:false`dir (bkz. `settingsCatalogMirror.ts`
// dosya başı notu + görev raporu) — bu ekranda GERÇEKTEN düzenlenebilir bir alan YOK; bu yüzden
// birincil etkileşim testi "Motor ayarları" tarafındadır (`admin-engine-settings.spec.ts`). Bu spec
// salt-okunur görünüm + env-kilit gösterimi + "Genel" bölümünü doğrular.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { userContextFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixtureWithIntegrationConfig, openScreen } from '../fixtures/nav'

const LIST_FIXTURE = [
  { target: '_engine', displayName: 'Motor ayarları', category: 'engine', publishedVersion: 4, intake: 'on', hasDraft: false },
  { target: 'trendyol', displayName: 'Trendyol', category: 'marketplace', adapterVersion: '2.3.0', publishedVersion: 2, intake: 'on', hasDraft: false },
]

function effectiveConfigFixture() {
  return {
    target: 'trendyol',
    publishedVersion: 2,
    catalogVersion: '2026-09-29.b1',
    values: [
      { key: 'resilience.timeoutMs', value: 30000, source: 'default' },
      { key: 'resilience.maxConcurrent', value: 10, source: 'default' },
      { key: 'resilience.ratePerMin', value: 200, source: 'default' },
      { key: 'resilience.trendyol.orderListRatePerMin', value: 30, source: 'default' },
      { key: 'mock.trendyol.enabled', value: true, source: 'env', envVar: 'TY_MOCK_MODE' },
      { key: 'mock.trendyol.baseUrl', value: 'http://localhost:4010', source: 'env', envVar: 'TY_MOCK_BASE_URL' },
    ],
  }
}

async function baseMocks(page: any, overrides: Record<string, any> = {}) {
  await installApiMocks(page, {
    MenuService: menuFixtureWithIntegrationConfig,
    userContext: { ...userContextFixture, isGlobalAdmin: true },
    'IntegrationConfigService/list': LIST_FIXTURE,
    'IntegrationConfigService/getEffectiveConfig': effectiveConfigFixture(),
    'IntegrationConfigService/history': [],
    ...overrides,
  })
}

async function openTrendyolSettings(page: any) {
  await gotoAuthed(page)
  await openScreen(page, 'IntegrationConfigListView')
  await page.locator('.integrationConfigListView tbody tr').filter({ hasText: 'Trendyol' }).getByRole('button').click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Trendyol' })
  await dialog.getByRole('button', { name: 'Ayarları düzenle' }).click()
  await expect(page.locator('.integrationSettingsView:not(.hide-tab-component)')).toBeVisible()
}

test.describe('ADR-0020 Aşama C — Entegrasyon ayarları (Trendyol)', () => {
  test('smoke: Genel, Oran sınırları ve Mock bölümleri render olur', async ({ page }) => {
    await baseMocks(page)
    await openTrendyolSettings(page)

    await expect(page.getByText('Genel', { exact: true })).toBeVisible()
    await expect(page.getByText('Oran sınırları ve dayanıklılık', { exact: true })).toBeVisible()
    await expect(page.getByText('Mock / gerçek mod', { exact: true })).toBeVisible()
    await expect(page.getByText('HTTP zaman aşımı', { exact: true })).toBeVisible()
    await expect(page.getByText('trendyol: mock modu', { exact: true })).toBeVisible()
  })

  test('salt-okunur: env-kilitli mock alanı devre dışıdır ve kilit notu gösterir', async ({ page }) => {
    await baseMocks(page)
    await openTrendyolSettings(page)

    await expect(page.getByText('TY_MOCK_MODE', { exact: false })).toBeVisible()
    await expect(page.getByText('ortam değişkeniyle kilitli', { exact: false }).first()).toBeVisible()
  })

  test('boş durum: "Uç noktalar"/"Kapsam beyanı"/"Uyum bulguları" bu sürümde bağlı değil', async ({ page }) => {
    await baseMocks(page)
    await openTrendyolSettings(page)

    await expect(page.getByText('Bu bölüm bu sürümde bağlı değil').first()).toBeVisible()
  })

  test('hata durumu: etkin yapılandırma 500 alındığında insan-okunur hata gösterilir', async ({ page }) => {
    await baseMocks(page, { 'IntegrationConfigService/getEffectiveConfig': mockError(500) })
    await openTrendyolSettings(page)
    await expect(page.getByText('tekrar deneyin', { exact: false })).toBeVisible()
    await expect(page.locator('.integrationSettingsView')).not.toContainText('500')
  })

  test('ekran görüntüsü tabanı (entegrasyon ayarları)', async ({ page }) => {
    await baseMocks(page)
    await openTrendyolSettings(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('admin-integration-settings.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — entegrasyon ayarları', async ({ page }, testInfo) => {
    await baseMocks(page)
    await openTrendyolSettings(page)
    await page.waitForTimeout(600)
    const scoped = await new AxeBuilder({ page }).include('.integrationSettingsView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-IntegrationSettingsView-sonuclari.json', { body: JSON.stringify(scoped.violations, null, 2), contentType: 'application/json' })
    // Bilinen DS düzeyi borç (bkz. orders.spec.ts/customers.spec.ts AYNI not) — `EkDataTable`
    // (salt-oku, bu görevin DIŞI) `role="table"` div'i içine literal `<table>` yerleştiriyor.
    const knownDsIssues = new Set(['aria-required-children'])
    const ownViolations = scoped.violations.filter((v) => !knownDsIssues.has(v.id))
    expect(ownViolations, JSON.stringify(ownViolations, null, 2)).toEqual([])
  })
})
