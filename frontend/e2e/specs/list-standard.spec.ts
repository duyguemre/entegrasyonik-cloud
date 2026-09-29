// DS-v2 Aşama 2 — liste standardı (EkListScreen: EkListFrame + EkFilterPanel + EkActiveFilters +
// EkBulkBar + EkDataGrid + EkPagerBar). Ekran başına değil STANDART başına sözleşme:
//  - filtre paneli sayfa İÇİ ve sekmeye yerel (overlay/popup açılmaz; başka sekmenin paneli etkilenmez)
//  - aktif filtre çipi tek tıkla kaldırılır, "Tümünü temizle" hepsini kaldırır
//  - tablo başlığı yapışkan, sayfalama çerçevenin altına sabit (satırlar kayarken yerinde kalır)
//  - boş (hiç veri yok) ≠ boş (filtre sonucu) ≠ hata; yüklenirken iskelet
//  - axe WCAG 2.1 AA = 0 (liste kapsayıcısı)
// İnceleme görselleri: LIST_REVIEW_CAPTURE=1 LIST_REVIEW_WIDTH=1440|390 (docs/design-system-review/a2-lists-*).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, type MockValue } from '../fixtures/mockApi'
import { buildOrder, buildProduct, ordersBosFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixtureWithLogs, openScreen } from '../fixtures/nav'

const CHANNELS = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft']
const STATUSES = ['AWAITING_APPROVAL', 'APPROVED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'APPROVED']
const NAMES = [['Ayşe', 'Yılmaz'], ['Mehmet', 'Demir'], ['Elif', 'Şahin'], ['Burak', 'Tekin'], ['Zeynep', 'Aksoy'], ['Can', 'Yurt'], ['Selin', 'Özer']]

function manyOrders(n = 15) {
  return {
    orders: Array.from({ length: n }, (_, i) =>
      buildOrder({
        _id: `order-e2e-${1000 + i}`,
        orderNumber: `E2E-${100001 + i}`,
        integrationCode: CHANNELS[i % CHANNELS.length],
        internalStatus: STATUSES[i % STATUSES.length],
        billingAddress: { firstName: NAMES[i % NAMES.length][0], lastName: NAMES[i % NAMES.length][1] },
        items: Array.from({ length: (i % 3) + 1 }, (_, k) => ({ productName: `Örnek ürün ${i + 1}-${k + 1}`, quantity: 1 })),
        financials: { grandTotal: 129.9 + i * 87.35, currencyCode: 'TRY' },
        flags: { isInvoiceGenerated: i % 4 === 1 },
        dates: { orderDate: new Date(Date.UTC(2026, 8, 29, 20 - i, 15)).toISOString() },
      }),
    ),
    totalNumberOfRecords: 148,
  }
}

function manyProducts(n = 15) {
  return {
    products: Array.from({ length: n }, (_, i) =>
      buildProduct({
        _id: `product-e2e-${1000 + i}`,
        title: `Örnek ürün ${i + 1}${i % 3 === 0 ? ' — pamuklu, uzun kollu' : ''}`,
        variants: [{ stockcode: `SK-${2000 + i}`, barcode: `86900000${String(10000 + i)}`, order: 0 }],
        prices: { minSalePrice: 99.9 + i * 25, maxSalePrice: 99.9 + i * 25 },
        stock: (i * 7) % 40,
        onsale: i % 5 !== 2,
      }),
    ),
    totalNumberOfRecords: 312,
    fromTo: `1-${n} / 312`,
    isFiltered: false,
  }
}

async function openList(page: Page, code: 'OrderListView' | 'ProductListView' | 'LogListView', overrides: Record<string, MockValue> = {}) {
  await installApiMocks(page, overrides)
  await gotoAuthed(page)
  await openScreen(page, code)
}

test.describe('DS-v2 liste standardı — sipariş listesi', () => {
  test('filtre paneli sayfa içidir: aç/kapa overlay üretmez ve yalnız bu listenin içinde yaşar', async ({ page }) => {
    await openList(page, 'OrderListView', { 'OrderService/getOrders': manyOrders(5) })
    const view = page.locator('.orderListView')
    const toggle = view.getByRole('button', { name: /Filtreler/ })
    // masaüstünde açık, dar ekranda kapalı başlar
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
    await expect(view.locator('.ek-filter').getByText('Kanal', { exact: true }).first()).toBeVisible()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.v-overlay--active .v-dialog')).toHaveCount(0)
    await toggle.click()
    await expect(view.locator('.ek-filter').getByText('Sipariş durumu', { exact: true }).first()).toBeVisible()
  })

  test('filtre sekmeye yereldir: başka bir listenin sekmesi kendi paneliyle açılır, sipariş filtresi ona taşınmaz', async ({ page }) => {
    await openList(page, 'OrderListView', { 'OrderService/getOrders': manyOrders(5) })
    const orders = page.locator('.orderListView')
    await orders.getByRole('button', { name: /Filtreler/ }).click() // sipariş sekmesinde paneli daralt
    await orders.getByLabel('Sipariş No, Müşteri Adı veya Telefon Ara').first().fill('E2E-100003')
    await expect(orders.getByRole('group', { name: 'Aktif filtreler' })).toContainText('E2E-100003')
    await openScreen(page, 'ClaimListView')
    const claims = page.locator('.claimListView')
    await expect(claims).toBeVisible()
    await expect(claims.getByRole('group', { name: 'Aktif filtreler' })).toHaveCount(0)
  })

  test('aktif filtre çipi tek tıkla kaldırılır; Tümünü temizle hepsini kaldırır', async ({ page }) => {
    let lastBody: any = null
    await openList(page, 'OrderListView', {
      'OrderService/getOrders': async (route: any, headers: any) => {
        lastBody = route.request().postDataJSON()
        await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(manyOrders(5)) })
      },
    })
    const view = page.locator('.orderListView')
    await view.getByLabel('Sipariş No, Müşteri Adı veya Telefon Ara').first().fill('Ayşe')
    const chips = view.getByRole('group', { name: 'Aktif filtreler' })
    await expect(chips).toContainText('Arama:')
    await chips.getByRole('button', { name: 'Arama filtresini kaldır' }).click()
    await expect(chips).toHaveCount(0)
    await expect.poll(() => lastBody?.searchOrderForm?.filter?.globalSearch).toBe('')

    await view.getByLabel('Sipariş No, Müşteri Adı veya Telefon Ara').first().fill('Mehmet')
    await expect(chips).toBeVisible()
    await chips.getByRole('button', { name: 'Tümünü temizle' }).click()
    await expect(chips).toHaveCount(0)
  })

  test('yapışkan başlık + alta sabit sayfalama: satırlar kayar, başlık ve sayfalama yerinde kalır', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-mobile', 'Mobilde çerçeve sayfayla kayar (standart §EkListFrame)')
    await openList(page, 'OrderListView', { 'OrderService/getOrders': manyOrders(15) })
    const view = page.locator('.orderListView')
    await expect(view.getByText('E2E-100001')).toBeVisible()
    const pager = view.getByRole('navigation', { name: /sayfalama/ })
    const header = view.locator('thead th').nth(1)
    const pagerBox1 = await pager.boundingBox()
    const headBox1 = await header.boundingBox()
    await view.locator('.ek-grid').evaluate((el) => el.scrollTo(0, el.scrollHeight))
    const pagerBox2 = await pager.boundingBox()
    const headBox2 = await header.boundingBox()
    expect(Math.abs(pagerBox2!.y - pagerBox1!.y)).toBeLessThanOrEqual(1.5)
    expect(Math.abs(headBox2!.y - headBox1!.y)).toBeLessThanOrEqual(1.5)
    // sayfalama liste kapsayıcısının altına yapışık (görünür alanın içinde)
    const viewBox = await view.boundingBox()
    expect(pagerBox1!.y + pagerBox1!.height).toBeLessThanOrEqual(viewBox!.y + viewBox!.height + 1)
    await expect(pager).toContainText('148')
    await expect(pager.getByRole('button', { name: 'Sayfa 1', exact: true })).toHaveAttribute('aria-current', 'page')
  })

  test('boş durumlar ayrışır: hiç veri yok ≠ filtre sonucu yok', async ({ page }) => {
    await openList(page, 'OrderListView', { 'OrderService/getOrders': ordersBosFixture })
    const view = page.locator('.orderListView')
    await expect(view.getByText('Sipariş Bulunamadı')).toBeVisible()
    await expect(view.getByRole('button', { name: 'Filtreleri temizle' })).toHaveCount(0)
    await view.getByLabel('Sipariş No, Müşteri Adı veya Telefon Ara').first().fill('yok-boyle-siparis')
    await expect(view.getByText('Arama kriterlerinize uygun herhangi bir sipariş kaydı bulunamadı.')).toBeVisible()
    await view.getByRole('button', { name: 'Filtreleri temizle' }).click()
    await expect(view.getByRole('group', { name: 'Aktif filtreler' })).toHaveCount(0)
  })

  test('yüklenirken iskelet satırlar gösterilir, başlık korunur', async ({ page }) => {
    await openList(page, 'OrderListView', {
      'OrderService/getOrders': async (route: any, headers: any) => {
        await new Promise((r) => setTimeout(r, 1500))
        await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(manyOrders(3)) })
      },
    })
    const view = page.locator('.orderListView')
    await expect(view.locator('.ek-grid__row--skeleton').first()).toBeVisible()
    await expect(view.locator('.ek-grid[aria-busy="true"] thead')).toBeVisible()
    await expect(view.getByText('E2E-100001')).toBeVisible()
    await expect(view.locator('.ek-grid__row--skeleton')).toHaveCount(0)
  })

  test('sıralama sunucuya gider (sort.field izin listesi)', async ({ page }) => {
    const bodies: any[] = []
    await openList(page, 'OrderListView', {
      'OrderService/getOrders': async (route: any, headers: any) => {
        bodies.push(route.request().postDataJSON())
        await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(manyOrders(3)) })
      },
    })
    const view = page.locator('.orderListView')
    await expect(view.getByText('E2E-100001')).toBeVisible()
    await view.getByRole('button', { name: /Tutar/ }).click()
    await expect.poll(() => bodies.at(-1)?.searchOrderForm?.sort).toEqual({ field: 'financials.grandTotal', direction: 'asc' })
    await expect(view.locator('th[aria-sort="ascending"]')).toContainText('Tutar')
  })

  test('satır seçimi toplu işlem çubuğunu açar; Seçimi kaldır kapatır', async ({ page }) => {
    await openList(page, 'OrderListView', { 'OrderService/getOrders': manyOrders(5) })
    const view = page.locator('.orderListView')
    await view.getByRole('checkbox', { name: 'E2E-100001 satırını seç' }).check()
    await expect(view.getByRole('region', { name: 'Toplu işlemler' })).toContainText('1 sipariş seçildi')
    await view.getByRole('button', { name: 'Seçimi kaldır' }).click()
    await expect(view.getByRole('region', { name: 'Toplu işlemler' })).toHaveCount(0)
  })

  test('axe: WCAG 2.1 AA = 0 (liste standardı, sipariş)', async ({ page }) => {
    await openList(page, 'OrderListView', { 'OrderService/getOrders': manyOrders(8) })
    const view = page.locator('.orderListView')
    await expect(view.getByText('E2E-100001')).toBeVisible()
    await view.getByLabel('Sipariş No, Müşteri Adı veya Telefon Ara').first().fill('Ayşe')
    await expect(view.getByRole('group', { name: 'Aktif filtreler' })).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.orderListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })

  test('hata durumu boştan ayrıdır: "yüklenemedi" + Tekrar dene, ham hata sızmaz', async ({ page }) => {
    let calls = 0
    await openList(page, 'OrderListView', {
      'OrderService/getOrders': async (route: any, headers: any) => {
        calls++
        if (calls === 1) return route.fulfill({ status: 500, headers, contentType: 'application/json', body: '{"message":"x"}' })
        await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(manyOrders(3)) })
      },
    })
    const view = page.locator('.orderListView')
    await expect(view.getByText('Siparişler yüklenemedi')).toBeVisible()
    await expect(view.getByText('Sipariş Bulunamadı')).toHaveCount(0)
    await expect(view).not.toContainText('500')
    await view.getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(view.getByText('E2E-100001')).toBeVisible()
  })
})

test.describe('DS-v2 liste standardı — inceleme görselleri', () => {
  test.skip(!process.env.LIST_REVIEW_CAPTURE, 'Yalnız LIST_REVIEW_CAPTURE=1 ile (inceleme görselleri)')
  const width = Number(process.env.LIST_REVIEW_WIDTH || 1440)
  const height = width < 768 ? 844 : 900
  test.use({ viewport: { width, height } })
  const out = (name: string) => `docs/design-system-review/a2-lists-${name}-${width}.png`

  test('sipariş listesi', async ({ page }) => {
    await openList(page, 'OrderListView', { 'OrderService/getOrders': manyOrders(15) })
    const view = page.locator('.orderListView')
    await expect(view.getByText('E2E-100001')).toBeVisible()
    await view.getByLabel('Sipariş No, Müşteri Adı veya Telefon Ara').first().fill('E2E')
    await view.getByRole('checkbox', { name: 'E2E-100002 satırını seç' }).check()
    await view.getByRole('checkbox', { name: 'E2E-100004 satırını seç' }).check()
    await view.evaluate((el) => el.scrollTo(0, 0))
    await page.mouse.move(0, 0)
    await page.waitForTimeout(400)
    await page.screenshot({ path: out('siparis'), fullPage: false })
  })

  test('ürün listesi', async ({ page }) => {
    await openList(page, 'ProductListView', { 'ProductService/getProducts': manyProducts(15) })
    const view = page.locator('.productListView')
    await expect(view.getByText('Örnek ürün 1 — pamuklu, uzun kollu')).toBeVisible()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(400)
    await page.screenshot({ path: out('urun'), fullPage: false })
  })

  test('log listesi', async ({ page }) => {
    await openList(page, 'LogListView', { MenuService: menuFixtureWithLogs })
    await expect(page.getByText('E2E Test Ürünü - Gönderim')).toBeVisible()
    await page.waitForTimeout(400)
    await page.mouse.move(0, 0)
    await page.screenshot({ path: out('log'), fullPage: false })
  })
})
