// C1.5 (F-06) — bildirim merkezi (NotificationCenterView) + üst bar rozeti (getUnreadCount).
// YENİ spec (ADR-0015 Karar 5.1). Menü kaydı gerçek ortamda ApplicationDB `menus`'tadır (yerel iş);
// burada yalnız bu spec'in menüsüne sentetik bir giriş eklenir (paylaşılan `menuFixture` DEĞİŞMEZ).
// `NC_REVIEW_CAPTURE=1` → inceleme görselleri docs/design-system-review/w1-notifications-*.png
// (belge görseli; Playwright tabanı DEĞİLDİR).
import { test, expect, type Page, type Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { menuFixture, waitForWorkplaceReady, gotoAuthed } from '../fixtures/nav'

const AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const menuWithCenter = menuFixture.map((group) =>
  group.group === 'dashboard'
    ? {
        ...group,
        links: [
          ...group.links,
          { code: 'NotificationCenterView', parent: '', title: 'notifications', icon: 'mdi-bell-badge-outline', singleton: true },
        ],
      }
    : group,
)

const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()

function buildNotifications() {
  return [
    {
      _id: 'nc-e2e-0001',
      type: 'IMPORT_READY',
      mode: 'IMPORT',
      severity: 'success',
      title: 'E2E içe aktarma tamamlandı',
      message: 'Trendyol kataloğunuzdan 42 ürün aktarıldı.',
      actionUrl: '/orders',
      isRead: false,
      createdAt: iso(5),
      metaData: { integrationCode: 'trendyol', totalCount: 45, processedCount: 42, invalidCount: 3 },
    },
    {
      _id: 'nc-e2e-0002',
      type: 'STOCK_ALERT',
      severity: 'error',
      title: 'E2E aşırı satış uyarısı',
      message: 'SKU E2E-TSH-01 için stoktan fazla sipariş alındı.',
      isRead: false,
      createdAt: iso(180),
    },
    {
      _id: 'nc-e2e-0003',
      type: 'ORDER',
      severity: 'info',
      title: 'E2E yeni sipariş',
      message: 'Hepsiburada kanalından 3 yeni sipariş geldi.',
      isRead: true,
      createdAt: iso(30),
    },
    {
      _id: 'nc-e2e-0004',
      type: 'SYSTEM',
      severity: 'warning',
      title: 'E2E sistem bakımı',
      message: 'Planlı bakım gece 02:00-03:00 arasında yapılacak.',
      actionUrl: 'https://dis-adres.example/bakim',
      isRead: true,
      createdAt: iso(600),
    },
    {
      _id: 'nc-e2e-0005',
      type: 'EXPORT_READY',
      mode: 'EXPORT',
      severity: 'info',
      title: 'E2E dışa aktarma hazır',
      message: 'Ürün listesi dışa aktarımı tamamlandı.',
      isRead: true,
      createdAt: iso(1440),
    },
  ]
}

interface Harness {
  getBodies: any[]
  markBodies: any[]
  deleteBodies: any[]
  unread: () => number
}

/** Durumlu mock: okundu işaretleme/silme sonrası liste ve sayım gerçekten değişir. */
function statefulMocks(overrides: Record<string, any> = {}): { routes: Record<string, any>; h: Harness } {
  let items = buildNotifications()
  const h: Harness = { getBodies: [], markBodies: [], deleteBodies: [], unread: () => items.filter((n) => !n.isRead).length }
  const json = (route: Route, headers: Record<string, string>, body: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })
  const routes: Record<string, any> = {
    MenuService: menuWithCenter,
    NotificationService: (route: Route, headers: Record<string, string>) => json(route, headers, { result: true, data: items.slice(0, 20), unreadCount: h.unread() }),
    'NotificationService/get': (route: Route, headers: Record<string, string>) => {
      const body = route.request().postDataJSON?.() ?? {}
      h.getBodies.push(body)
      const data = body.onlyUnread ? items.filter((n) => !n.isRead) : items
      return json(route, headers, { result: true, data, unreadCount: h.unread() })
    },
    'NotificationService/getUnreadCount': (route: Route, headers: Record<string, string>) => json(route, headers, { result: true, unreadCount: h.unread() }),
    'NotificationService/markAsRead': (route: Route, headers: Record<string, string>) => {
      const body = route.request().postDataJSON?.() ?? {}
      h.markBodies.push(body)
      items = items.map((n) => (body.all || body.notificationIds?.includes(n._id) ? { ...n, isRead: true } : n))
      return json(route, headers, { result: true })
    },
    'NotificationService/delete': (route: Route, headers: Record<string, string>) => {
      const body = route.request().postDataJSON?.() ?? {}
      h.deleteBodies.push(body)
      items = items.filter((n) => !body.notificationIds?.includes(n._id))
      return json(route, headers, { result: true })
    },
    ...overrides,
  }
  return { routes, h }
}

async function gotoCenter(page: Page) {
  await page.goto('/notifications')
  await waitForWorkplaceReady(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Bildirimler' })).toBeVisible({ timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
}

const center = (page: Page) => page.locator('.ek-notification-center:not(.hide-tab-component)')
const bell = (page: Page) => page.locator('[data-header-action=notifications]')
const rows = (page: Page) => center(page).locator('tbody tr.ek-grid__row')

async function expandFilters(page: Page) {
  const toggle = center(page).locator('.ek-filter__toggle')
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
}

test.describe('C1.5 — bildirim merkezi', () => {
  test('smoke: liste yüklenir (limit 200), dikkat türleri üstte sabit, dış adres için "Görüntüle" yok', async ({ page }) => {
    const { routes, h } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)

    await expect(rows(page)).toHaveCount(5)
    await expect.poll(() => h.getBodies.length).toBeGreaterThan(0)
    expect(h.getBodies[0]).toMatchObject({ limit: 200, onlyUnread: false })

    // STOCK_ALERT + SYSTEM (dikkat) daha eski olsalar da ilk iki satır.
    await expect(rows(page).nth(0)).toContainText('E2E aşırı satış uyarısı')
    await expect(rows(page).nth(1)).toContainText('E2E sistem bakımı')
    await expect(rows(page).nth(0).getByText('Dikkat')).toBeVisible()
    await expect(rows(page).nth(2)).toContainText('E2E içe aktarma tamamlandı')

    // Tür etiketleri i18n'den; iç yol → Görüntüle var, dış adres → yok.
    await expect(rows(page).nth(0)).toContainText('Stok uyarısı')
    await expect(center(page).getByRole('button', { name: 'Görüntüle: E2E içe aktarma tamamlandı' })).toBeVisible()
    await expect(center(page).getByRole('button', { name: 'Görüntüle: E2E sistem bakımı' })).toHaveCount(0)

    // Rozet: hafif sayım ucundan (2 okunmamış).
    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 2 okunmamış')
  })

  test('boş: hiç bildirim yoksa sakin boş durum', async ({ page }) => {
    await installApiMocks(page, {
      MenuService: menuWithCenter,
      'NotificationService/get': { result: true, data: [], unreadCount: 0 },
      'NotificationService/getUnreadCount': { result: true, unreadCount: 0 },
    })
    await gotoCenter(page)
    await expect(center(page).getByText('Henüz bildiriminiz yok')).toBeVisible()
    await expect(center(page).getByRole('button', { name: 'Tümünü okundu işaretle' })).toBeDisabled()
  })

  test('hata: istek başarısızsa hata durumu (ham hata sızmaz), Tekrar dene yeniden ister', async ({ page }) => {
    let calls = 0
    await installApiMocks(page, {
      MenuService: menuWithCenter,
      'NotificationService/get': async (route: Route, headers: Record<string, string>) => {
        calls += 1
        return route.fulfill({ status: 500, contentType: 'application/json', headers, body: JSON.stringify({ message: 'E2E sentetik hata' }) })
      },
      'NotificationService/getUnreadCount': mockError(500),
    })
    await gotoCenter(page)
    await expect(center(page).getByText('Bildirimler yüklenemedi', { exact: false })).toBeVisible()
    await expect(center(page).getByText('Henüz bildiriminiz yok')).toHaveCount(0)
    await expect(page.getByText('E2E sentetik hata')).toHaveCount(0)
    const before = calls
    await center(page).getByRole('button', { name: /Tekrar dene/i }).click()
    await expect.poll(() => calls).toBeGreaterThan(before)
  })

  test('etkileşim: seçili satırı okundu işaretle → gövde {notificationIds}, rozet sayısı güncellenir', async ({ page }) => {
    const { routes, h } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 2 okunmamış')

    await center(page).getByRole('checkbox', { name: 'E2E içe aktarma tamamlandı satırını seç' }).check()
    await expect(center(page).getByText('1 bildirim seçildi')).toBeVisible()
    await center(page).getByRole('button', { name: 'Okundu işaretle', exact: true }).click()

    await expect.poll(() => h.markBodies.length).toBe(1)
    expect(h.markBodies[0]).toEqual({ notificationIds: ['nc-e2e-0001'] })
    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 1 okunmamış')
    await expect(rows(page).filter({ hasText: 'E2E içe aktarma tamamlandı' }).getByText('Okundu')).toBeVisible()
  })

  test('etkileşim: toplu silme onay ister, gövde seçili kimlikleri taşır', async ({ page }) => {
    const { routes, h } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)

    await center(page).getByRole('checkbox', { name: 'E2E yeni sipariş satırını seç' }).check()
    await center(page).getByRole('checkbox', { name: 'E2E dışa aktarma hazır satırını seç' }).check()
    await center(page).getByRole('button', { name: 'Sil', exact: true }).click()

    const dialog = page.getByRole('dialog').filter({ hasText: '2 bildirim silinsin mi?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Sil', exact: true }).click()

    await expect.poll(() => h.deleteBodies.length).toBe(1)
    expect(h.deleteBodies[0].notificationIds.sort()).toEqual(['nc-e2e-0003', 'nc-e2e-0005'])
    expect(h.deleteBodies[0].all).toBeUndefined()
    await expect(rows(page)).toHaveCount(3)
  })

  test('etkileşim: "Okunmamış" filtresi → onlyUnread:true isteği + aktif çip; çip kaldırılınca tüm liste', async ({ page }) => {
    const { routes, h } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await expandFilters(page)

    await center(page).getByRole('combobox').filter({ hasText: 'Okunma durumu' }).click()
    await page.getByRole('option', { name: 'Okunmamış' }).click()
    await center(page).getByRole('button', { name: 'Sorgula' }).click()

    await expect.poll(() => h.getBodies.at(-1)?.onlyUnread).toBe(true)
    await expect(rows(page)).toHaveCount(2)
    const chips = center(page).getByRole('group', { name: 'Aktif filtreler' })
    await expect(chips).toContainText('Okunmamış')

    await chips.getByRole('button', { name: 'Okunma filtresini kaldır' }).click()
    await expect.poll(() => h.getBodies.at(-1)?.onlyUnread).toBe(false)
    await expect(rows(page)).toHaveCount(5)
  })

  test('etkileşim: tür filtresi istemcide uygulanır (i18n etiketli çip)', async ({ page }) => {
    const { routes } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await expandFilters(page)

    await center(page).getByRole('combobox').filter({ hasText: 'Tür' }).click()
    await page.getByRole('option', { name: 'Sipariş' }).click()
    await page.keyboard.press('Escape')
    await center(page).getByRole('button', { name: 'Sorgula' }).click()

    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText('E2E yeni sipariş')
    await expect(center(page).getByRole('group', { name: 'Aktif filtreler' })).toContainText('Tür:')
  })

  test('ayrıntı: satır başlığı ayrıntıyı açar, okunmamışsa okundu işaretlenir; özet metaData\'dan', async ({ page }) => {
    const { routes, h } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)

    await center(page).getByRole('button', { name: 'E2E içe aktarma tamamlandı', exact: true }).click()
    const sheet = page.getByRole('dialog').filter({ hasText: 'Trendyol kataloğunuzdan 42 ürün aktarıldı.' })
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Aktarılan ürün')
    await expect.poll(() => h.markBodies.at(-1)).toEqual({ notificationIds: ['nc-e2e-0001'] })
    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 1 okunmamış')
  })

  test('çekmece: açılınca tam liste çekilir; "Tümünü gör" merkeze götürür', async ({ page }) => {
    const { routes } = statefulMocks()
    let drawerFetches = 0
    const base = routes.NotificationService
    routes.NotificationService = (route: Route, headers: Record<string, string>) => {
      drawerFetches += 1
      return base(route, headers)
    }
    await installApiMocks(page, routes)
    await gotoAuthed(page)
    expect(drawerFetches).toBe(0)

    await bell(page).click()
    await expect(page.locator('.ek-notification-drawer').getByText('E2E içe aktarma tamamlandı')).toBeVisible()
    expect(drawerFetches).toBeGreaterThan(0)

    await page.locator('.ek-notification-drawer').getByRole('button', { name: 'Tümünü gör' }).click()
    await expect(page).toHaveURL(/\/notifications$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Bildirimler' })).toBeVisible()
  })

  test('axe WCAG 2.1 AA: liste + ayrıntı = 0 ihlal', async ({ page }) => {
    const { routes } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await expect(rows(page)).toHaveCount(5)

    const list = await new AxeBuilder({ page }).withTags(AA).include('.ek-notification-center').analyze()
    expect(list.violations, JSON.stringify(list.violations, null, 2)).toEqual([])

    await center(page).getByRole('button', { name: 'E2E aşırı satış uyarısı', exact: true }).click()
    await expect(page.getByRole('dialog').filter({ hasText: 'SKU E2E-TSH-01' })).toBeVisible()
    await page.waitForTimeout(400) // açılış geçişi bitsin (yarı saydam kareler kontrastı yanlış ölçer)
    const sheet = await new AxeBuilder({ page }).withTags(AA).include('.v-overlay--active').analyze()
    expect(sheet.violations, JSON.stringify(sheet.violations, null, 2)).toEqual([])
  })

  test('inceleme görselleri (NC_REVIEW_CAPTURE=1)', async ({ page }, info) => {
    test.skip(!process.env.NC_REVIEW_CAPTURE, 'yalnız inceleme görseli üretiminde')
    test.skip(info.project.name !== 'chromium-desktop', 'tek projede üretilir')
    const w = Number(process.env.NC_REVIEW_WIDTH ?? 1440)
    await page.setViewportSize({ width: w, height: w >= 1024 ? 900 : 844 })
    const { routes } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await expect(rows(page)).toHaveCount(5)
    await page.waitForTimeout(400)
    const dir = 'docs/design-system-review'
    await page.screenshot({ path: `${dir}/w1-notifications-${w}-liste.png` })

    await center(page).getByRole('checkbox', { name: 'E2E yeni sipariş satırını seç' }).check()
    await center(page).getByRole('checkbox', { name: 'E2E dışa aktarma hazır satırını seç' }).check()
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${dir}/w1-notifications-${w}-secim.png` })
    await center(page).getByRole('button', { name: 'Seçimi kaldır' }).click()

    await center(page).getByRole('button', { name: 'E2E içe aktarma tamamlandı', exact: true }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/w1-notifications-${w}-ayrinti.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    await bell(page).click()
    await expect(page.locator('.ek-notification-drawer').getByRole('button', { name: 'Tümünü gör' })).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/w1-notifications-${w}-cekmece.png` })
  })
})
