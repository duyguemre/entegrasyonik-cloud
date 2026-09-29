// ADR-0020 Aşama C — Entegrasyonlar (liste) ekranı (`IntegrationConfigListView`). Sentetik fixture,
// backend/Redis/Mongo YOK (tüm `/api/**` `mockApi.ts` ile karşılanır — ADR-0011 Karar 4).
//
// NOT (araştırma bulgusu): tüm metin sorguları `.integrationConfigListView` kapsamına ALINIR —
// Dashboard sekmesi (`MarketplaceLinksComponent`, "ENTEGRASYON DURUMU" paneli) `hide-tab-component`
// ile GİZLİ olsa da DOM'da kalıyor (ADR-0015 A3 kalıcı sekme mimarisi) ve AYNI entegrasyon adlarını
// (`EkPlatformMark`) içeriyor — kapsamsız `page.getByText('Trendyol')` bu yüzden strict-mode ihlali
// üretiyordu (kanıt: bu görevin doğrulama koşusu).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { userContextFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixtureWithIntegrationConfig, openScreen } from '../fixtures/nav'

const LIST_FIXTURE = [
  { target: '_engine', displayName: 'Motor ayarları', category: 'engine', publishedVersion: 4, intake: 'on', hasDraft: false },
  { target: 'trendyol', displayName: 'Trendyol', category: 'marketplace', adapterVersion: '2.3.0', publishedVersion: 2, intake: 'on', hasDraft: true, draftLockedBy: 'ayse@entegrasyonik.invalid' },
  { target: 'hepsiburada', displayName: 'Hepsiburada', category: 'marketplace', adapterVersion: '1.1.0', publishedVersion: 0, intake: 'drain', hasDraft: false },
  { target: 'n11', displayName: 'N11', category: 'marketplace', adapterVersion: '1.0.0', publishedVersion: 0, intake: 'on', hasDraft: false },
  { target: 'pazarama', displayName: 'Pazarama', category: 'marketplace', adapterVersion: '1.0.0', publishedVersion: 0, intake: 'off', hasDraft: false },
  { target: 'ideasoft', displayName: 'Ideasoft', category: 'ecommerce', adapterVersion: '1.0.0', publishedVersion: 0, intake: 'on', hasDraft: false },
  { target: 'bizimhesap', displayName: 'Bizimhesap', category: 'erp', adapterVersion: '1.0.0', publishedVersion: 0, intake: 'on', hasDraft: false },
]

const HISTORY_FIXTURE = [
  { version: 2, status: 'published', createdBy: 'admin@entegrasyonik-e2e.invalid', createdAt: '2026-09-20T10:00:00.000Z', publishedBy: 'admin@entegrasyonik-e2e.invalid', publishedAt: '2026-09-20T10:05:00.000Z', reason: 'Oran sınırı ayarı gözden geçirildi.', diff: [{ key: 'resilience.timeoutMs', from: 30000, to: 45000, danger: 'caution' }], origin: { kind: 'manual' } },
  { version: 1, status: 'superseded', createdBy: 'admin@entegrasyonik-e2e.invalid', createdAt: '2026-09-10T09:00:00.000Z', publishedBy: 'admin@entegrasyonik-e2e.invalid', publishedAt: '2026-09-10T09:05:00.000Z', reason: 'İlk yayın.', diff: [], origin: { kind: 'manual' } },
]

function withAdmin(overrides: Record<string, any> = {}, isGlobalAdmin = true) {
  return {
    MenuService: menuFixtureWithIntegrationConfig,
    userContext: { ...userContextFixture, isGlobalAdmin },
    'IntegrationConfigService/list': LIST_FIXTURE,
    'IntegrationConfigService/history': HISTORY_FIXTURE,
    ...overrides,
  }
}

test.describe('ADR-0020 Aşama C — Entegrasyonlar (liste)', () => {
  test('smoke: başlık, satırlar ve kabul durumu rozetleri render olur', async ({ page }) => {
    await installApiMocks(page, withAdmin())
    await gotoAuthed(page)
    await openScreen(page, 'IntegrationConfigListView')

    const view = page.locator('.integrationConfigListView')
    await expect(view).toBeVisible()
    await expect(view.getByRole('heading', { name: 'Entegrasyonlar' })).toBeVisible()
    await expect(view.getByText('Trendyol', { exact: true })).toBeVisible()
    await expect(view.getByText('Motor ayarları', { exact: true })).toBeVisible()
    await expect(view.locator('tbody tr')).toHaveCount(7)
    await expect(view.getByText('Taslak var')).toBeVisible()
  })

  test('boş durum: liste boşsa "Henüz entegrasyon tanımı yok" gösterilir', async ({ page }) => {
    await installApiMocks(page, withAdmin({ 'IntegrationConfigService/list': [] }))
    await gotoAuthed(page)
    await openScreen(page, 'IntegrationConfigListView')

    await expect(page.locator('.integrationConfigListView').getByText('Henüz entegrasyon tanımı yok', { exact: true })).toBeVisible()
  })

  test('hata durumu: liste 500 alındığında insan-okunur hata gösterilir, ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page, withAdmin({ 'IntegrationConfigService/list': mockError(500) }))
    await gotoAuthed(page)
    await openScreen(page, 'IntegrationConfigListView')

    const view = page.locator('.integrationConfigListView')
    await expect(view.getByText('tekrar deneyin', { exact: false })).toBeVisible()
    await expect(view).not.toContainText('500')
    await expect(view).not.toContainText('INTERNAL')
  })

  test('etkileşim: satır detayına tıklayınca çekmece açılır, son revizyonlar görünür', async ({ page }) => {
    await installApiMocks(page, withAdmin())
    await gotoAuthed(page)
    await openScreen(page, 'IntegrationConfigListView')

    await page.locator('.integrationConfigListView tbody tr').filter({ hasText: 'Trendyol' }).getByRole('button').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Trendyol' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Açık', { exact: true })).toBeVisible()
    await expect(dialog.locator('tbody tr')).toHaveCount(2)
    await expect(dialog.getByText('Yayında', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Yerini aldı', { exact: true })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Ayarları düzenle' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Etkin yapılandırmayı gör' })).toBeVisible()
  })

  test('filtre: "Yalnızca taslağı olanlar" tek satıra indirger', async ({ page }) => {
    await installApiMocks(page, withAdmin())
    await gotoAuthed(page)
    await openScreen(page, 'IntegrationConfigListView')

    const view = page.locator('.integrationConfigListView')
    // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: filtre sayfa içi panelde (onay kutusu) ve "Sorgula" ile uygulanır.
    await expect(view.locator('tbody tr').first()).toBeVisible()
    const panel = view.locator('.ek-filter')
    const toggle = view.getByRole('button', { name: /Filtreler/ })
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
    await expect(panel.locator('form')).toBeVisible()
    await panel.getByText('Yalnızca taslağı olanlar', { exact: true }).click()
    await panel.getByRole('button', { name: /Sorgula/ }).click()
    await expect(view.locator('tbody tr')).toHaveCount(1)
    await expect(view.getByText('Trendyol', { exact: true })).toBeVisible()
  })

  test('yetkisiz: platformAdmin OLMAYAN kullanıcıya "yalnız platform yöneticileri içindir" gösterilir', async ({ page }) => {
    await installApiMocks(page, withAdmin({}, false))
    await gotoAuthed(page)
    await openScreen(page, 'IntegrationConfigListView')

    const view = page.locator('.integrationConfigListView')
    await expect(view.getByText('Bu ekran yalnız platform yöneticileri içindir.', { exact: true })).toBeVisible()
    await expect(view.getByText('Trendyol', { exact: true })).toHaveCount(0)
  })

  test('ekran görüntüsü tabanı (liste)', async ({ page }) => {
    await installApiMocks(page, withAdmin())
    await gotoAuthed(page)
    await openScreen(page, 'IntegrationConfigListView')
    await expect(page.locator('.integrationConfigListView').getByText('Trendyol', { exact: true })).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('admin-integration-config-list.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — entegrasyonlar listesi', async ({ page }, testInfo) => {
    await installApiMocks(page, withAdmin())
    await gotoAuthed(page)
    await openScreen(page, 'IntegrationConfigListView')
    await expect(page.locator('.integrationConfigListView').getByText('Trendyol', { exact: true })).toBeVisible()
    await page.waitForTimeout(600)
    const scoped = await new AxeBuilder({ page }).include('.integrationConfigListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-IntegrationConfigListView-sonuclari.json', { body: JSON.stringify(scoped.violations, null, 2), contentType: 'application/json' })
    // DS-v2 Aşama 2: liste EkDataGrid (yerel tablo) — `knownDsIssues` istisnası kaldırıldı.
    expect(scoped.violations, JSON.stringify(scoped.violations, null, 2)).toEqual([])
  })
})
