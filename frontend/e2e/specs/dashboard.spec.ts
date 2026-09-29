// P1 — DashboardView (DS-v2 Aşama 2). Tüm sayılar mock yanıtından BİREBİR doğrulanır
// (e2e/fixtures/apiData.ts): uydurma değer/trend olmadığının kanıtı.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { orderDashboardInsightsFixture, stockOverviewBosFixture, userContextFixture } from '../fixtures/apiData'
import { gotoAuthed, expectScreenOpen, waitForPlatformListStable, menuFixture } from '../fixtures/nav'

// `waitForShellReady` (nav.ts) kabuk hazır çapası olarak bu mikro etiketi bekler.
const DASHBOARD_READY_TEXT = 'İŞLETME PERFORMANSI'

const kpi = (page: Page, key: string) => page.locator(`[data-kpi="${key}"]`)
const card = (page: Page, title: string) => page.locator('.dashboard section.ek-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) })

const emptyInsights = {
  totals: { orderCount: 0, revenue: 0, returnCount: 0, returnAmount: 0 },
  today: { count: 0, revenue: 0 },
  trend: { countChange: 0, revenueChange: 0 },
  statusDistribution: { UNAPPROVED: 0, AWAITING_APPROVAL: 0, APPROVED: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0, RETURNED: 0, total: 0 },
  pending: { invoiceCount: 0, shippingCount: 0, claimCount: 0, messageCount: 0 },
  last7Days: [],
}

test.describe('P1 — Dashboard', () => {
  test('KPI satırı: değerler getOrderDashboardInsights mock yanıtıyla birebir', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)

    const f = orderDashboardInsightsFixture
    await expect(kpi(page, 'today-count')).toContainText(String(f.today.count))
    await expect(kpi(page, 'today-revenue')).toContainText('₺349,90')
    // Son 7 gün = last7Days toplamı (0+1+…+6 = 21 sipariş, 21×50 = ₺1.050,00 ciro).
    await expect(kpi(page, 'week-count')).toContainText('21')
    await expect(kpi(page, 'week-count')).toContainText('₺1.050,00')
    await expect(kpi(page, 'pending-shipping')).toContainText(String(f.pending.shippingCount))
    // Değişim yalnızca dün > 0 iken: dün (last7Days[5]) = 5 sipariş → backend countChange %5.
    await expect(kpi(page, 'today-count')).toContainText('%5')
    await expect(kpi(page, 'today-count')).toContainText('Dün (tüm gün): 5 sipariş')
    await expect(kpi(page, 'today-revenue')).toContainText('%3')
  })

  test('özet kartları: bekleyen aksiyonlar, durumlar, stok, sağlık, katalog, son işlemler mock ile birebir', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)

    const pending = card(page, 'Bekleyen aksiyonlar')
    await expect(pending.locator('[data-pending="shipping"]')).toContainText('2')
    await expect(pending.locator('[data-pending="invoice"]')).toContainText('1')
    await expect(pending.locator('[data-pending="claim"]')).toContainText('Bekleyen yok')
    await expect(pending).toContainText('3 kayıt işlem bekliyor')

    const status = card(page, 'Sipariş durumları')
    await expect(status.getByRole('button', { name: /Teslim Edildi: 3 sipariş/ })).toBeVisible()
    await expect(status).toContainText('12')

    const stock = card(page, 'Stok ve eşleşme uyarıları')
    await expect(stock.locator('[data-stock="oversold"]')).toContainText('2 kalem')
    await expect(stock.locator('[data-stock="oversold"]')).toContainText('5 adet')
    await expect(stock.locator('[data-stock="unmapped"]')).toContainText('1 kalem')
    await expect(stock).toContainText('E2E-ORD-9001')

    const health = card(page, 'Entegrasyon sağlığı')
    await expect(health.locator('[data-health="trendyol"]')).toContainText('Sağlıklı')
    await expect(health.locator('[data-health="hepsiburada"]')).toContainText('Sorunlu')
    await expect(health.locator('[data-health="hepsiburada"]')).toContainText('istek sınırı aşıldı')
    await expect(health.locator('[data-health="bizimhesap"]')).toContainText('Kimlik bilgileri girilmemiş')

    const catalog = card(page, 'Katalog ve kanal aktarımı')
    await expect(catalog).toContainText('48')
    await expect(catalog.locator('[data-channel="trendyol"]')).toContainText('88')

    const jobs = card(page, 'Son işlemler')
    await expect(jobs).toContainText('Tamamlandı')
    await expect(jobs).toContainText('Hata oluştu')
  })

  test('yükleniyor: yanıt gelene kadar iskelet, düzen sıçramadan', async ({ page }) => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    await installApiMocks(page, {
      'OrderService/getOrderDashboardInsights': async (route, headers) => {
        await gate
        await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(orderDashboardInsightsFixture) })
      },
    })
    await gotoAuthed(page)
    await expect(page.locator('.dashboard .dash-kpis[aria-busy="true"]')).toBeVisible()
    await expect(kpi(page, 'today-count')).toContainText('Yükleniyor')
    release()
    await expect(kpi(page, 'today-count')).toContainText('2')
  })

  test('boş durum: sipariş yokken dürüst boş durumlar, NaN yok', async ({ page }) => {
    await installApiMocks(page, {
      'OrderService/getOrderDashboardInsights': emptyInsights,
      'StockService/getStockOverview': stockOverviewBosFixture,
      'IntegrationService/getExportJobs': { success: true, data: [], pagination: { totalNumberOfPages: 0, totalNumberOfRecords: 0 } },
    })
    await gotoAuthed(page)
    await expect(page.getByText('Son 7 günde sipariş yok')).toBeVisible()
    await expect(page.getByText('Henüz sipariş yok')).toBeVisible()
    await expect(page.getByText('Dikkat gerektiren sipariş yok')).toBeVisible()
    await expect(page.getByText('Henüz aktarım işlemi yok')).toBeVisible()
    await expect(card(page, 'Bekleyen aksiyonlar')).toContainText('Şu an bekleyen iş yok')
    await expect(kpi(page, 'today-count')).not.toContainText('%')
    await expect(page.locator('body')).not.toContainText('NaN')
  })

  test('hata durumu: 500 → insan-okunur hata + Tekrar dene; ham hata sızmaz, yeniden deneme veriyi getirir', async ({ page }) => {
    let calls = 0
    await installApiMocks(page, {
      'OrderService/getOrderDashboardInsights': async (route, headers) => {
        calls += 1
        if (calls === 1) return route.fulfill({ status: 500, contentType: 'application/json', headers, body: JSON.stringify({ message: 'E2E sentetik hata' }) })
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(orderDashboardInsightsFixture) })
      },
      'StockService/getStockOverview': mockError(500),
    })
    await gotoAuthed(page)

    await expect(page.getByText('Sipariş göstergeleri yüklenemedi')).toBeVisible()
    await expect(page.getByText('Stok uyarıları yüklenemedi')).toBeVisible()
    await expect(page.locator('.dashboard')).not.toContainText('500')
    await expect(page.locator('.dashboard')).not.toContainText('Error')
    await expect(page.locator('.dashboard')).not.toContainText('sentetik')

    await page.locator('.dashboard .dash-section').getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(kpi(page, 'today-count')).toContainText('2')
  })

  test('rol gizleme: üye kademesinde (403) entegrasyon sağlığı ve stok kartı hiç görünmez', async ({ page }) => {
    await installApiMocks(page, {
      userContext: { ...userContextFixture, owner: false, roleCode: 'ROLE_USER' },
      'IntegrationService/getIntegrationHealth': mockError(403, { error: 'Forbidden' }),
      'StockService/getStockOverview': mockError(403, { error: 'Forbidden' }),
    })
    await gotoAuthed(page)
    await expect(kpi(page, 'today-count')).toContainText('2')
    await expect(card(page, 'Son işlemler')).toBeVisible()
    await expect(card(page, 'Entegrasyon sağlığı')).toHaveCount(0)
    await expect(card(page, 'Stok ve eşleşme uyarıları')).toHaveCount(0)
    await expect(page.locator('.dashboard')).not.toContainText('Forbidden')
  })

  test('rol gizleme: menüde olmayan ekranın aksiyon oku/bağlantısı gösterilmez', async ({ page }) => {
    const menuWithoutOrders = menuFixture.map((g: any) => ({
      ...g,
      links: g.links.filter((l: any) => l.code !== 'OrderListView' && l.code !== 'ClaimListView'),
    }))
    await installApiMocks(page, { MenuService: menuWithoutOrders })
    await gotoAuthed(page)
    await expect(kpi(page, 'today-count')).toContainText('2')
    await expect(page.getByRole('button', { name: 'Sipariş listesini aç' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Onaylı siparişleri aç' })).toHaveCount(0)
    await expect(card(page, 'Bekleyen aksiyonlar').locator('button[data-pending="shipping"]')).toHaveCount(0)
    await expect(card(page, 'Bekleyen aksiyonlar').locator('button[data-pending="message"]')).toHaveCount(1)
  })

  test('etkileşim: kart oku ve satırlar ilgili ekranı sekmede açar', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)

    await card(page, 'Bekleyen aksiyonlar').locator('[data-pending="shipping"]').click()
    await expectScreenOpen(page, '.orderListView')

    await page.locator('.workplace-tabs').getByText('ANASAYFA').click()
    await page.getByRole('button', { name: 'Ürün listesini aç' }).click()
    await expectScreenOpen(page, '.productListView')
  })

  test('ekran görüntüsü tabanı (dashboard)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await waitForPlatformListStable(page)
    await expect(kpi(page, 'today-count')).toContainText('2')
    await page.waitForTimeout(400)
    await expect(page).toHaveScreenshot('dashboard.png', { fullPage: false })
  })

  test('axe: dashboard içeriğinde WCAG 2.1 AA ihlali 0', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await expect(kpi(page, 'today-count')).toContainText('2')
    await expect(card(page, 'Entegrasyon sağlığı')).toContainText('Sağlıklı')
    const results = await new AxeBuilder({ page }).include('.dashboard').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-dashboard-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })

  // İnceleme görselleri: DS_REVIEW_CAPTURE=1 npx playwright test e2e/specs/dashboard.spec.ts -g inceleme --project=chromium-desktop
  test('inceleme görselleri (1440/800/390)', async ({ page }) => {
    test.skip(!process.env.DS_REVIEW_CAPTURE, 'yalnızca DS_REVIEW_CAPTURE=1 ile')
    test.setTimeout(90_000)
    await installApiMocks(page)
    for (const [w, h] of [[1440, 900], [800, 1024], [390, 844]] as const) {
      await page.setViewportSize({ width: w, height: h })
      await gotoAuthed(page)
      await expect(kpi(page, 'today-count')).toContainText('2')
      await expect(card(page, 'Entegrasyon sağlığı')).toContainText('Sağlıklı')
      await page.waitForTimeout(600)
      await page.screenshot({ path: `docs/design-system-review/a2-dashboard-${w}.png` })
      // Kaydırılabilir içerik alanının tamamı (kabuk sabit kalır).
      const full = await page.locator('.dash-scroll').evaluate((el) => el.scrollHeight)
      await page.setViewportSize({ width: w, height: Math.min(full + 140, 4000) })
      await page.waitForTimeout(400)
      await page.screenshot({ path: `docs/design-system-review/a2-dashboard-${w}-tam.png` })
    }
  })
})
