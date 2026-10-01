// C1.1 (F-01) — Stok sağlığı (StockHealthView) + sipariş listesi "Stok durumu" rozeti/filtresi.
// ADR-0015 Karar 5.6: smoke · boş · hata (ham hata sızmaz) · yetki (403) · etkileşim (istek gövdesi) ·
// 3 viewport ekran görüntüsü · axe WCAG 2.1 AA = 0. Sözleşme: docs/API_TENANT_SURFACE.md §2.2–2.3.
// İnceleme görselleri: STOCK_REVIEW_CAPTURE=1 STOCK_REVIEW_WIDTH=1440|390 (docs/design-system-review/w1-stock-*).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError, type MockValue } from '../fixtures/mockApi'
import { expectScreenOpen, gotoAuthed, openScreen, waitForWorkplaceReady } from '../fixtures/nav'
import {
  menuFixtureWithStockHealth,
  ordersWithAllocationFixture,
  stockOverviewBosFixture,
  stockOverviewDoluFixture,
} from '../fixtures/stockHealth'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function openStockHealth(page: Page, overrides: Record<string, MockValue> = {}) {
  await installApiMocks(page, { MenuService: menuFixtureWithStockHealth, 'StockService/getStockOverview': stockOverviewDoluFixture, ...overrides })
  await gotoAuthed(page)
  await openScreen(page, 'StockHealthView')
  return page.locator('.stockHealthView')
}

/** İsteği yakalayıp verilen gövdeyle yanıtlayan mock (istek gövdesi doğrulaması için). */
function capture(bodies: any[], response: any): MockValue {
  return async (route: any, headers: any) => {
    bodies.push(route.request().postDataJSON())
    await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(response) })
  }
}

test.describe('C1.1 — Stok sağlığı (StockHealthView)', () => {
  test('smoke: KPI satırı, dikkat gerektiren kalemler, varyant dengesi ve dürüst mutabakat notu', async ({ page }) => {
    const bodies: any[] = []
    const view = await openStockHealth(page, { 'StockService/getStockOverview': capture(bodies, stockOverviewDoluFixture) })

    await expect(view.getByRole('heading', { level: 1, name: 'Stok sağlığı' })).toBeVisible()
    await expect(view.locator('[data-kpi="oversold"]')).toContainText('2 kalem')
    await expect(view.locator('[data-kpi="oversold"]')).toContainText('5 adet stokta karşılanamadı')
    await expect(view.locator('[data-kpi="unmapped"]')).toContainText('2 kalem')
    await expect(view.locator('[data-kpi="available"]')).toContainText('10 adet')
    await expect(view.locator('[data-kpi="publishPending"]')).toContainText('1 varyant')

    // Her kalem ayrı satır: 3 sipariş, 4 kalem; aşırı satış önce.
    await expect(view.getByText('3 siparişte 4 kalem')).toBeVisible()
    await expect(view.getByText('E2E-300001').first()).toBeVisible()
    await expect(view.getByText('Örnek pamuklu tişört — M').first()).toBeVisible()
    await expect(view.getByText(/Manuel işlem bildirildi/).first()).toBeVisible()

    // Mutabakat sonucu backend'de tutulmuyor → zaman UYDURULMAZ.
    const recon = view.locator('[data-recon]')
    await expect(recon).toContainText('Mutabakat sonuçları henüz kaydedilmiyor')
    await expect(recon).not.toContainText(/\d{2}\.\d{2}\.\d{4}/)

    // Sözleşme: { limit } (1..50), tenant kimliği gövdede YOK.
    // Anasayfa sekmesi (Dashboard StockAttentionCard) aynı uç noktayı { limit: 5 } ile çağırır; ekranın kendi isteği { limit: 20 }.
    expect(bodies).toContainEqual({ limit: 20 })
    expect(bodies.every((b) => Object.keys(b).join() === 'limit')).toBe(true)
  })

  test('boş: açık aşırı satış/eşleşmeyen kalem yoksa sakin metin (sahte "mükemmel" yok, 0 ≠ —)', async ({ page }) => {
    const view = await openStockHealth(page, { 'StockService/getStockOverview': stockOverviewBosFixture })
    await expect(view.getByText('Dikkat gerektiren sipariş yok')).toBeVisible()
    await expect(view.locator('[data-kpi="oversold"]')).toContainText('0 kalem')
    await expect(view.locator('[data-kpi="oversold"]')).toContainText('Açık aşırı satış yok')
    await expect(view.getByRole('button', { name: 'Siparişlerde filtrele' })).toHaveCount(0)
  })

  test('hata: 500 → "Stok sağlığı yüklenemedi" + Tekrar dene (boştan AYRI), ham hata sızmaz', async ({ page }) => {
    const view = await openStockHealth(page, { 'StockService/getStockOverview': mockError(500, { error: 'MongoServerError: connection refused' }) })
    await expect(view.getByText('Stok sağlığı yüklenemedi')).toBeVisible()
    await expect(view.getByRole('button', { name: /Tekrar dene/ })).toBeVisible()
    await expect(view).not.toContainText('500')
    await expect(view).not.toContainText('MongoServerError')
    await expect(view.getByText('Dikkat gerektiren sipariş yok')).toHaveCount(0)
  })

  test('yetki: 403 → "Bu ekrana erişiminiz yok" (hata/boştan ayrı, Yenile yok)', async ({ page }) => {
    const view = await openStockHealth(page, { 'StockService/getStockOverview': mockError(403, { error: 'Forbidden' }) })
    await expect(view.getByText('Bu ekrana erişiminiz yok')).toBeVisible()
    await expect(view).not.toContainText('Forbidden')
    await expect(view.getByRole('button', { name: 'Yenile' })).toHaveCount(0)
  })

  test('yenileme hatası: son başarılı veri zamanıyla ekranda kalır', async ({ page }) => {
    let calls = 0
    const view = await openStockHealth(page, {
      'StockService/getStockOverview': async (route: any, headers: any) => {
        // Dashboard'un { limit: 5 } çağrısı sayılmaz — yalnız Stok sağlığı ekranının kendi isteği ({ limit: 20 }).
        if (route.request().postDataJSON()?.limit !== 20) return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(stockOverviewDoluFixture) })
        calls += 1
        if (calls === 1) return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(stockOverviewDoluFixture) })
        return route.fulfill({ status: 500, headers, contentType: 'application/json', body: '{"error":"x"}' })
      },
    })
    await expect(view.locator('[data-kpi="oversold"]')).toContainText('2 kalem')
    await view.getByRole('button', { name: 'Yenile' }).click()
    await expect(view.getByRole('status')).toContainText('Güncel veriler alınamadı')
    await expect(view.locator('[data-kpi="oversold"]')).toContainText('2 kalem')
  })

  test('etkileşim: sipariş no → sipariş listesi allocationStates + sipariş no ile açılır (URL yalnız kapalı küme)', async ({ page }) => {
    const bodies: any[] = []
    const view = await openStockHealth(page, { 'OrderService/getOrders': capture(bodies, ordersWithAllocationFixture) })
    await view.getByRole('button', { name: 'E2E-300001 siparişini sipariş listesinde aç' }).first().click()

    await expectScreenOpen(page, '.orderListView')
    await expect.poll(() => bodies.at(-1)?.searchOrderForm?.filter?.allocationStates).toEqual(['OVERSOLD'])
    expect(bodies.at(-1)?.searchOrderForm?.filter?.globalSearch).toBe('E2E-300001')
    await expect(page).toHaveURL(/\/orders\?allocationStates=OVERSOLD$/)
    expect(page.url()).not.toContain('E2E-300001')
    await expect(page.locator('.orderListView').getByRole('group', { name: 'Aktif filtreler' })).toContainText('Aşırı satış')
  })

  test('etkileşim: "Siparişlerde filtrele" → aşırı satış + eşleşmeyen', async ({ page }) => {
    const bodies: any[] = []
    const view = await openStockHealth(page, { 'OrderService/getOrders': capture(bodies, ordersWithAllocationFixture) })
    await view.getByRole('button', { name: 'Siparişlerde filtrele' }).click()
    await expectScreenOpen(page, '.orderListView')
    await expect.poll(() => bodies.at(-1)?.searchOrderForm?.filter?.allocationStates).toEqual(['OVERSOLD', 'UNMAPPED'])
    expect(bodies.at(-1)?.searchOrderForm?.filter?.globalSearch ?? '').toBe('')
  })

  test('derin bağlantı: /catalog/stock-health ekranı açar', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithStockHealth, 'StockService/getStockOverview': stockOverviewDoluFixture })
    await page.goto('/catalog/stock-health')
    await waitForWorkplaceReady(page)
    await expectScreenOpen(page, '.stockHealthView')
    await expect(page.locator('.stockHealthView [data-kpi="oversold"]')).toContainText('2 kalem')
  })

  test('ekran görüntüsü tabanı (stok sağlığı)', async ({ page }) => {
    const view = await openStockHealth(page)
    await expect(view.locator('[data-kpi="oversold"]')).toContainText('2 kalem')
    await page.mouse.move(0, 0)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('stock-health.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA — stok sağlığı ekranında 0 ihlal', async ({ page }, testInfo) => {
    const view = await openStockHealth(page)
    await expect(view.locator('[data-kpi="oversold"]')).toContainText('2 kalem')
    const results = await new AxeBuilder({ page }).include('.stockHealthView').withTags(AXE_TAGS).analyze()
    await testInfo.attach('axe-StockHealthView.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
})

test.describe('C1.1 — Sipariş listesi stok durumu (OrderListView)', () => {
  test('rozet: kalemlerin en önemli tahsis durumu gösterilir (karışıksa n/m kalem)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Tablo hücresi iddiası masaüstünde')
    await installApiMocks(page, { 'OrderService/getOrders': ordersWithAllocationFixture })
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    const first = page.locator('.orderListView tbody tr').filter({ hasText: 'E2E-100001' })
    await expect(first).toContainText('Aşırı satış')
    await expect(first).toContainText('1/2 kalem')
    const second = page.locator('.orderListView tbody tr').filter({ hasText: 'E2E-100002' })
    await expect(second).toContainText('Rezerve')
  })

  test('filtre: "Stok durumu" seçimi getOrders gövdesinde filter.allocationStates olarak gider + çip', async ({ page }) => {
    const bodies: any[] = []
    await installApiMocks(page, { 'OrderService/getOrders': capture(bodies, ordersWithAllocationFixture) })
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    // FR2 kabuk: ilk ziyaret "Uygulamayı tanıyın" teklif kartı (mobilde alt şerit, fixed) açılır listenin öğelerini örter.
    await page.getByRole('button', { name: 'Şimdi değil' }).click({ timeout: 3000 }).catch(() => undefined)
    const view = page.locator('.orderListView')
    const toggle = view.getByRole('button', { name: /Filtreler/ })
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
    const panel = view.locator('.ek-filter')
    await panel.locator('.v-select').filter({ hasText: 'Stok durumu' }).click()
    await page.getByRole('option', { name: 'Aşırı satış' }).click()
    await page.getByRole('option', { name: 'Eşleşmedi' }).click()
    await page.keyboard.press('Escape')
    await panel.getByRole('button', { name: /Sorgula/ }).click()

    await expect.poll(() => bodies.at(-1)?.searchOrderForm?.filter?.allocationStates).toEqual(['OVERSOLD', 'UNMAPPED'])
    const chips = view.getByRole('group', { name: 'Aktif filtreler' })
    await expect(chips).toContainText('Stok durumu')
    await expect(chips).toContainText('Aşırı satış, Eşleşmedi')

    await chips.getByRole('button', { name: /Stok durumu filtresini kaldır/ }).click()
    await expect.poll(() => bodies.at(-1)?.searchOrderForm?.filter?.allocationStates).toEqual([])
  })

  test('derin bağlantı: /orders?allocationStates=OVERSOLD,UNMAPPED filtreyi uygular, izinsiz değer atılır', async ({ page }) => {
    const bodies: any[] = []
    await installApiMocks(page, { 'OrderService/getOrders': capture(bodies, ordersWithAllocationFixture) })
    await page.goto('/orders?allocationStates=OVERSOLD,UNMAPPED,HACK')
    await waitForWorkplaceReady(page)
    await expectScreenOpen(page, '.orderListView')
    await expect.poll(() => bodies.at(-1)?.searchOrderForm?.filter?.allocationStates).toEqual(['OVERSOLD', 'UNMAPPED'])
  })
})

test.describe('İnceleme görselleri (stok sağlığı)', () => {
  test.skip(!process.env.STOCK_REVIEW_CAPTURE, 'Yalnız STOCK_REVIEW_CAPTURE=1 ile (inceleme görselleri)')
  const width = Number(process.env.STOCK_REVIEW_WIDTH || 1440)
  const height = width < 768 ? 844 : 900
  test.use({ viewport: { width, height } })
  const out = (name: string) => `docs/design-system-review/w1-stock-${name}-${width}.png`

  test('stok sağlığı ekranı', async ({ page }) => {
    const view = await openStockHealth(page)
    await expect(view.locator('[data-kpi="oversold"]')).toContainText('2 kalem')
    await page.mouse.move(0, 0)
    await page.waitForTimeout(400)
    await page.screenshot({ path: out('health'), fullPage: false })
    await view.locator('.sh-scroll').evaluate((el) => { el.scrollTo(0, el.scrollHeight) })
    await page.waitForTimeout(200)
    await page.screenshot({ path: out('health-alt'), fullPage: false })
  })

  test('sipariş listesi stok durumu', async ({ page }) => {
    await installApiMocks(page, { 'OrderService/getOrders': ordersWithAllocationFixture })
    await gotoAuthed(page)
    await page.goto('/orders?allocationStates=OVERSOLD')
    await waitForWorkplaceReady(page)
    await expectScreenOpen(page, '.orderListView')
    await expect(page.locator('.orderListView').getByText('E2E-100001').first()).toBeVisible()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(400)
    await page.screenshot({ path: out('orders'), fullPage: false })
  })
})
