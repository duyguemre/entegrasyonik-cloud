// ADR-0020 Aşama C — Etkin yapılandırma ekranı (`EffectiveConfigView`, `EkReadonlyPanelTemplate`).
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
      { key: 'resilience.ratePerMin', value: 250, source: 'platform', revision: 2 },
      { key: 'mock.trendyol.enabled', value: false, source: 'env', envVar: 'TY_MOCK_MODE' },
    ],
  }
}

async function baseMocks(page: any, overrides: Record<string, any> = {}) {
  await installApiMocks(page, {
    MenuService: menuFixtureWithIntegrationConfig,
    userContext: { ...userContextFixture, isGlobalAdmin: true },
    'IntegrationConfigService/list': LIST_FIXTURE,
    'IntegrationConfigService/getEffectiveConfig': effectiveConfigFixture(),
    ...overrides,
  })
}

// DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: "Varsayılan dışı" filtresi sayfa içi panelde (onay kutusu), "Sorgula" ile uygulanır.
async function applyNonDefaultFilter(page: any) {
  const view = page.locator('.effectiveConfigView')
  await expect(view.locator('.ek-grid')).toBeVisible()
  const panel = view.locator('.ek-filter')
  const toggle = view.getByRole('button', { name: /Filtreler/ })
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
  await expect(panel.locator('form')).toBeVisible()
  await panel.getByText('Varsayılan dışı', { exact: true }).click()
  await panel.getByRole('button', { name: /Sorgula/ }).click()
}

async function openTrendyolEffectiveConfig(page: any) {
  await gotoAuthed(page)
  await openScreen(page, 'IntegrationConfigListView')
  await page.locator('.integrationConfigListView tbody tr').filter({ hasText: 'Trendyol' }).getByRole('button').click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Trendyol' })
  await dialog.getByRole('button', { name: 'Etkin yapılandırmayı gör' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('.effectiveConfigView:not(.hide-tab-component)')).toBeVisible()
}

test.describe('ADR-0020 Aşama C — Etkin yapılandırma (Trendyol)', () => {
  test('smoke: KPI satırı ve tablo render olur, kaynak çipleri görünür', async ({ page }) => {
    await baseMocks(page)
    await openTrendyolEffectiveConfig(page)
    const view = page.locator('.effectiveConfigView')

    await expect(view.getByText('Yayındaki sürüm', { exact: true })).toBeVisible()
    await expect(view.getByText('HTTP zaman aşımı', { exact: true })).toBeVisible()
    await expect(view.getByText('Platform v2', { exact: true })).toBeVisible()
    await expect(view.getByText('Ortam değişkeni', { exact: true })).toBeVisible()
  })

  test('filtre: "Varsayılan dışı" yalnızca platform/env kaynaklı satırları gösterir', async ({ page }) => {
    await baseMocks(page)
    await openTrendyolEffectiveConfig(page)
    const view = page.locator('.effectiveConfigView')

    await applyNonDefaultFilter(page)
    await expect(view.getByText('HTTP zaman aşımı', { exact: true })).toHaveCount(0)
    await expect(view.getByText('Dakikada istek sınırı', { exact: true })).toBeVisible()
  })

  test('hata durumu: 500 alındığında insan-okunur hata gösterilir', async ({ page }) => {
    await baseMocks(page, { 'IntegrationConfigService/getEffectiveConfig': mockError(500) })
    await openTrendyolEffectiveConfig(page)
    const view = page.locator('.effectiveConfigView')
    // DS-v2 Aşama 2: hata durumu tablo içinde ("Etkin yapılandırma yüklenemedi" + "Tekrar dene").
    await expect(view.getByText('tekrar deneyin', { exact: false }).first()).toBeVisible()
    await expect(view.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(view).not.toContainText('500')
  })

  test('boş durum: hiç değer yoksa filtreyle "sonuç yok" gösterilir', async ({ page }) => {
    await baseMocks(page, { 'IntegrationConfigService/getEffectiveConfig': { target: 'trendyol', publishedVersion: 0, catalogVersion: '2026-09-29.b1', values: [] } })
    await openTrendyolEffectiveConfig(page)
    await applyNonDefaultFilter(page)
    await expect(page.getByText('Sonuç yok', { exact: true })).toBeVisible()
  })

  test('etkileşim: "Dışa aktar (JSON)" bir dosya indirmesi tetikler', async ({ page }) => {
    await baseMocks(page)
    await openTrendyolEffectiveConfig(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Dışa aktar (JSON)' }).click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('trendyol')
  })

  test('ekran görüntüsü tabanı (etkin yapılandırma)', async ({ page }) => {
    await baseMocks(page)
    await openTrendyolEffectiveConfig(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('admin-effective-config.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — etkin yapılandırma', async ({ page }, testInfo) => {
    await baseMocks(page)
    await openTrendyolEffectiveConfig(page)
    await page.waitForTimeout(600)
    const scoped = await new AxeBuilder({ page }).include('.effectiveConfigView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-EffectiveConfigView-sonuclari.json', { body: JSON.stringify(scoped.violations, null, 2), contentType: 'application/json' })
    // DS-v2 Aşama 2: liste EkDataGrid (yerel tablo) — `knownDsIssues` istisnası kaldırıldı.
    expect(scoped.violations, JSON.stringify(scoped.violations, null, 2)).toEqual([])
  })
})
