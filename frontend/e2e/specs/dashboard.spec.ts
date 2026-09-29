// P1 — DashboardView + NavigationLinksComponent* (ADR-0011 Karar 2, K1: bounce/motion ihlali).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed, waitForPlatformListStable } from '../fixtures/nav'

// NOT (araştırma bulgusu, gizli davranış — BACKLOG.md): `.dashboard` kök elemanının kendi
// `getBoundingClientRect()` yüksekliği 0 ölçülüyor (bkz. e2e/fixtures/nav.ts başındaki not);
// bu yüzden kutu-tabanlı `.toBeVisible()` yerine gerçek boyutu olan bir metin düğümü kullanılıyor.
const DASHBOARD_READY_TEXT = 'İŞLETME PERFORMANSI'

test.describe('P1 — Dashboard', () => {
  test('smoke: istatistik kartları ve kısayol kartları render olur', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)

    await expect(page.getByText(DASHBOARD_READY_TEXT)).toBeVisible()
    // StatisticsComponent DOLU veriyle toplam sipariş sayısını göstermeli.
    await expect(page.locator('.dashboard').first()).toContainText('12')
  })

  test('boş durum: sipariş içgörüleri sıfırken kart çökmeden 0 gösterir', async ({ page }) => {
    await installApiMocks(page, {
      'OrderService/getOrderDashboardInsights': {
        totals: { orderCount: 0, revenue: 0, returnCount: 0, returnAmount: 0 },
        today: { count: 0, revenue: 0 },
        trend: { countChange: 0, revenueChange: 0 },
        statusDistribution: { UNAPPROVED: 0, AWAITING_APPROVAL: 0, APPROVED: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0, RETURNED: 0, total: 0 },
        pending: { invoiceCount: 0, shippingCount: 0, claimCount: 0, messageCount: 0 },
        last7Days: [],
      },
    })
    await gotoAuthed(page)
    await expect(page.getByText(DASHBOARD_READY_TEXT)).toBeVisible()
    await expect(page.locator('body')).not.toContainText('NaN')
  })

  test('hata durumu: 500 alındığında sessizce varsayılan (sıfır) durum korunur, ham hata sızmaz (gizli davranış)', async ({ page }) => {
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md): StatisticsComponent.loadData()
    // try/catch içinde yalnızca console.error basıyor; kullanıcıya HİÇBİR hata/uyarı göstermiyor,
    // kart sessizce `mkDefault()` (tüm alanlar 0) değeriyle kalıyor.
    await installApiMocks(page, { 'OrderService/getOrderDashboardInsights': mockError(500) })
    await gotoAuthed(page)

    await expect(page.getByText(DASHBOARD_READY_TEXT)).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
    await expect(page.locator('body')).not.toContainText('Error')
  })

  test('etkileşim: Ürünler kısayol kartına tıklayınca Ürünler sekmesi açılır', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)

    await page.locator('.large-stat-card').first().click()
    await expect(page.getByText('E2E Test Ürünü')).toBeVisible()
  })

  test('ekran görüntüsü tabanı (dashboard)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await waitForPlatformListStable(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('dashboard.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması (ihlaller bu görevde düzeltilmiyor, yalnızca kaydediliyor)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-dashboard-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] Dashboard: ${results.violations.length} WCAG 2.1 AA ihlali (bkz. ek: axe-dashboard-sonuclari.json)`)
  })
})
