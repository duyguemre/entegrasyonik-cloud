// ADR-0020 Aşama C — Motor ayarları ekranı (`EngineSettingsView` → `IntegrationConfigSettingsBody`,
// hedef `_engine`). Taslak (saveDraft) → önizleme (previewPublish) → yayın (publish) uçtan uca akışı,
// GERÇEK istek gövdesi doğrulamasıyla (ADR-0020 Karar 3.2).
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
    target: '_engine',
    publishedVersion: 4,
    catalogVersion: '2026-09-29.b1',
    values: [
      { key: 'export.publisher.chunkSize', value: 30, source: 'default' },
      { key: 'export.validator.chunkSize', value: 50, source: 'default' },
      { key: 'export.dispatcher.leaseTtl', value: 300000, source: 'default' },
      { key: 'export.sentinel.cooldownMinutes', value: 1, source: 'default' },
      { key: 'export.orchestrator.exportLoopDelay', value: 300000, source: 'default' },
      { key: 'import.importer.fetchLimit', value: 50, source: 'default' },
      { key: 'order.syncIntervalMs', value: 60000, source: 'default' },
      { key: 'order.claimSync.intervalMs', value: 900000, source: 'default' },
      { key: 'resilience.retry.maxAttempts', value: 4, source: 'default' },
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

async function openEngineSettings(page: any) {
  await gotoAuthed(page)
  await openScreen(page, 'IntegrationConfigListView')
  await page.locator('.integrationConfigListView tbody tr').filter({ hasText: 'Motor ayarları' }).getByRole('button').click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Motor ayarları' })
  await dialog.getByRole('button', { name: 'Ayarları düzenle' }).click()
  await expect(page.locator('.engineSettingsView:not(.hide-tab-component)')).toBeVisible()
}

test.describe('ADR-0020 Aşama C — Motor ayarları', () => {
  test('smoke: bölümler ve etkin değerler render olur', async ({ page }) => {
    await baseMocks(page)
    await openEngineSettings(page)

    await expect(page.getByText('Ürün gönderimi', { exact: true })).toBeVisible()
    await expect(page.getByText('Ürün içe aktarma', { exact: true })).toBeVisible()
    await expect(page.getByText('Sipariş çekme', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Yayıncı işlem parçası boyutu')).toHaveValue('30')
    await expect(page.getByText('Etkin: 30 · Varsayılan')).toBeVisible()
  })

  test('boş durum: "Stok ve fiyat"/"Önbellek" bölümlerinde henüz ayar yok, sürüm geçmişi boş', async ({ page }) => {
    await baseMocks(page)
    await openEngineSettings(page)

    await expect(page.getByText('Bu bölümde henüz yönetilebilir bir ayar yok').first()).toBeVisible()
    await expect(page.getByText('Henüz hiçbir ayar değiştirilmedi', { exact: true })).toBeVisible()
  })

  test('hata durumu: etkin yapılandırma 500 alındığında insan-okunur hata gösterilir', async ({ page }) => {
    await baseMocks(page, { 'IntegrationConfigService/getEffectiveConfig': mockError(500) })
    await openEngineSettings(page)

    await expect(page.getByText('tekrar deneyin', { exact: false })).toBeVisible()
    await expect(page.locator('.engineSettingsView')).not.toContainText('500')
  })

  test('etkileşim: alan düzenleme → saveDraft GERÇEK gövdeyle çağrılır → önizleme → gerekçeyle yayınla', async ({ page }) => {
    const saveDraftBodies: any[] = []
    const previewCalls: any[] = []
    const publishBodies: any[] = []
    await baseMocks(page, {
      'IntegrationConfigService/saveDraft': async (route: any, headers: Record<string, string>) => {
        const body = route.request().postDataJSON()
        saveDraftBodies.push(body)
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ target: '_engine', version: 5, draftRev: saveDraftBodies.length, overrides: { 'export.publisher.chunkSize': 45 } }) })
      },
      'IntegrationConfigService/previewPublish': async (route: any, headers: Record<string, string>) => {
        previewCalls.push(route.request().postDataJSON())
        return route.fulfill({
          status: 200, contentType: 'application/json', headers,
          body: JSON.stringify({
            target: '_engine', draftVersion: 5, basedOnVersion: 4,
            diff: [{ key: 'export.publisher.chunkSize', from: 30, to: 45, danger: 'caution' }],
            impact: { activeTenants: 1, approximate: false }, danger: 'caution', restartCount: 0,
            requiresReason: true, requiresTypedApproval: false,
          }),
        })
      },
      'IntegrationConfigService/publish': async (route: any, headers: Record<string, string>) => {
        publishBodies.push(route.request().postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ target: '_engine', version: 5, publishedVersion: 5, diff: [{ key: 'export.publisher.chunkSize', from: 30, to: 45, danger: 'caution' }] }) })
      },
    })
    await openEngineSettings(page)

    const field = page.getByLabel('Yayıncı işlem parçası boyutu')
    await field.fill('45')
    await field.blur()

    await expect.poll(() => saveDraftBodies.length).toBeGreaterThan(0)
    const lastSave = saveDraftBodies[saveDraftBodies.length - 1]
    expect(lastSave.target).toBe('_engine')
    expect(lastSave.patch).toEqual({ 'export.publisher.chunkSize': 45 })

    await expect(page.getByText('Taslak kaydedildi', { exact: false })).toBeVisible()

    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect.poll(() => previewCalls.length).toBe(1)
    expect(previewCalls[0]).toEqual({ target: '_engine' })

    const sheet = page.getByRole('dialog').filter({ hasText: 'Yayın önizlemesi' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByText('Yayıncı işlem parçası boyutu')).toBeVisible()
    await sheet.getByLabel('Bu değişikliğin gerekçesi').fill('Oran sınırına takılmamak için parça boyutu artırıldı.')
    await sheet.getByRole('button', { name: 'Yayınla' }).click()

    const confirmDialog = page.getByRole('alertdialog')
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: 'Yayınla' }).click()

    await expect.poll(() => publishBodies.length).toBe(1)
    expect(publishBodies[0].target).toBe('_engine')
    expect(publishBodies[0].reason).toContain('Oran sınırına')
    await expect(sheet).not.toBeVisible()
  })

  test('etkileşim: tehlikeli değişiklik hedef kodu YAZILARAK onaylanana kadar Yayınla devre dışıdır', async ({ page }) => {
    await baseMocks(page, {
      'IntegrationConfigService/saveDraft': { target: '_engine', version: 5, draftRev: 1, overrides: { 'export.dispatcher.leaseTtl': 600000 } },
      'IntegrationConfigService/previewPublish': {
        target: '_engine', draftVersion: 5, basedOnVersion: 4,
        diff: [{ key: 'export.dispatcher.leaseTtl', from: 300000, to: 600000, danger: 'dangerous' }],
        impact: { activeTenants: 1, approximate: false }, danger: 'dangerous', restartCount: 1,
        requiresReason: true, requiresTypedApproval: true,
      },
    })
    await openEngineSettings(page)

    const field = page.getByLabel('Dispatcher kira (lease) süresi')
    await field.fill('600000')
    await field.blur()
    await expect(page.getByText('Taslak kaydedildi', { exact: false })).toBeVisible()

    await page.getByRole('button', { name: 'Kaydet' }).click()
    const sheet = page.getByRole('dialog').filter({ hasText: 'Yayın önizlemesi' })
    await expect(sheet).toBeVisible()
    await sheet.getByLabel('Bu değişikliğin gerekçesi').fill('Kilit süresi işlem hacmine göre uzatıldı.')

    const publishBtn = sheet.getByRole('button', { name: 'Yayınla' })
    await expect(publishBtn).toBeDisabled()

    await sheet.getByLabel('Hedef kodu: _engine').fill('yanlis-kod')
    await expect(publishBtn).toBeDisabled()

    await sheet.getByLabel('Hedef kodu: _engine').fill('_engine')
    await expect(publishBtn).toBeEnabled()
  })

  // NOT (rol-gating kapsam notu, rapora yazıldı): Motor/Entegrasyon Ayarları/Etkin Yapılandırma
  // ekranlarına GİRİŞ yalnızca (zaten platformAdmin'e kapalı) Entegrasyonlar listesinden derin
  // bağlantıyla mümkün (`useOpenIntegrationConfigTab`, bkz. dosya başı yorumu) — bu yüzden bu 3
  // ekranın "olumsuz rol" senaryosu, gezinme yoluyla ASLA tetiklenemez (liste zaten kapıyı kapatır);
  // `PlatformAdminGuard` paylaşılan bileşen olduğundan `admin-integration-config-list.spec.ts`teki
  // negatif test aynı bileşenin AYNI davranışını doğrular. Bu ekranın KENDİ guard'ı savunma
  // derinliğidir (doğrudan URL/deep-link denemesine karşı) ve gezinme testiyle ayrıca KANITLANAMAZ.

  test('ekran görüntüsü tabanı (motor ayarları)', async ({ page }) => {
    await baseMocks(page)
    await openEngineSettings(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('admin-engine-settings.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — motor ayarları', async ({ page }, testInfo) => {
    await baseMocks(page)
    await openEngineSettings(page)
    await page.waitForTimeout(600)
    const scoped = await new AxeBuilder({ page }).include('.engineSettingsView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-EngineSettingsView-sonuclari.json', { body: JSON.stringify(scoped.violations, null, 2), contentType: 'application/json' })
    // Bilinen DS düzeyi borç (bkz. orders.spec.ts/customers.spec.ts AYNI not) — `EkDataTable`
    // (salt-oku, bu görevin DIŞI) `role="table"` div'i içine literal `<table>` yerleştiriyor.
    const knownDsIssues = new Set(['aria-required-children'])
    const ownViolations = scoped.violations.filter((v) => !knownDsIssues.has(v.id))
    expect(ownViolations, JSON.stringify(ownViolations, null, 2)).toEqual([])
  })
})
