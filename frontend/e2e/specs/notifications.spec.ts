// C1.5 (F-06) — bildirim merkezi (NotificationCenterView) + üst bar rozeti (getUnreadCount).
// C2b (ADR-0029) — BİLİNÇLİ GÜNCELLEME: sunucu sayfalaması (limit 25 + imleç, "Daha fazla göster"), kategori filtresi
// sunucuda (`category`), önem filtresi istemcide, "dikkat türü üstte sabit" kuralı kalktı (sunucu sırası = en yeni önce;
// kritik önem vurgusu onun yerine), v2 alanları (kod/kategori/grup sayacı/zorunlu), SSE ile canlı ekleme.
// Menü kaydı gerçek ortamda ApplicationDB `menus`'tadır (yerel iş); burada yalnız bu spec'in menüsüne sentetik giriş eklenir.
// `C2B_REVIEW=1` → inceleme görselleri docs/c2b-review/ (Playwright tabanı DEĞİLDİR).
import { test, expect, type Page, type Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { waitForWorkplaceReady, gotoAuthed } from '../fixtures/nav'
import { iso, menuWithNotifications, sseBody, statefulMocks } from '../fixtures/notifications'

const AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function gotoCenter(page: Page) {
  await page.goto('/notifications')
  await waitForWorkplaceReady(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Bildirimler' })).toBeVisible({ timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
}

const center = (page: Page) => page.locator('.ek-notification-center:not(.hide-tab-component)')
const bell = (page: Page) => page.locator('[data-header-action=notifications]')
const rows = (page: Page) => center(page).locator('tbody tr.ek-grid__row')
const wide = (page: Page) => (page.viewportSize()?.width ?? 0) >= 768

async function expandFilters(page: Page) {
  const toggle = center(page).locator('.ek-filter__toggle')
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
}

test.describe('C1.5 + C2b — bildirim merkezi', () => {
  test('smoke: ilk sayfa (limit 25), sunucu sırası, kategori etiketi, dış adres için "Görüntüle" yok', async ({ page }) => {
    const { routes, h } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)

    await expect(rows(page)).toHaveCount(6)
    await expect.poll(() => h.getBodies.length).toBeGreaterThan(0)
    expect(h.getBodies[0]).toEqual({ limit: 25, onlyUnread: false })

    // Sunucu sırası (en yeni önce) korunur; eski "dikkat türü üstte sabit" kuralı yok.
    await expect(rows(page).nth(0)).toContainText('E2E içe aktarma tamamlandı')
    await expect(rows(page).nth(1)).toContainText('E2E aşırı satış: 3 sipariş satırı')

    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 3 okunmamış')
    // Kategori etiketi katalogdan (eski tür → kategori eşlemesi dahil); dar ekranda yalnız ekran okuyucuya.
    await expect(rows(page).nth(3)).toContainText('Stok')
    if (wide(page)) {
      await expect(center(page).getByRole('button', { name: 'Görüntüle: E2E içe aktarma tamamlandı' })).toBeVisible()
      await expect(center(page).getByRole('button', { name: 'Görüntüle: E2E sistem bakımı' })).toHaveCount(0)
    }
    await center(page).getByRole('button', { name: 'E2E sistem bakımı', exact: true }).click()
    const external = page.getByRole('dialog').filter({ hasText: 'Planlı bakım' })
    await expect(external).toBeVisible()
    await expect(external.getByRole('button', { name: 'Görüntüle' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(external).toHaveCount(0)
    await center(page).getByRole('button', { name: 'E2E içe aktarma tamamlandı', exact: true }).click()
    await expect(page.getByRole('dialog').filter({ hasText: '42 ürün aktarıldı' }).getByRole('button', { name: 'Görüntüle' })).toBeVisible()
  })

  test('v2 satırı: kritik çipi, grup rozeti ×23 + "son:", zorunlu kilidi (a11y adı)', async ({ page }) => {
    const { routes } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)
    const row = rows(page).filter({ hasText: 'E2E aşırı satış: 3 sipariş satırı' })
    await expect(row.getByText('Kritik')).toBeVisible()
    await expect(row.getByText('×23')).toBeVisible()
    await expect(row.getByText(/son: /)).toBeVisible()
    await expect(row.getByRole('img', { name: 'Zorunlu bildirim' })).toBeVisible()
    // Zorunlu olmayan satırda kilit yok.
    await expect(rows(page).filter({ hasText: 'E2E yeni sipariş' }).getByRole('img', { name: 'Zorunlu bildirim' })).toHaveCount(0)
    await expect(center(page).getByText('1 okunmamış kritik')).toBeVisible()
  })

  test('sayfalama: nextCursor → "Daha fazla göster" imleçle sonraki sayfayı ekler; sonunda "Hepsi bu kadar"', async ({ page }) => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      _id: `pg-${String(i).padStart(3, '0')}`,
      code: 'ORDER_SYNC_FAILED',
      category: 'order',
      severity: 'error',
      title: `E2E sayfa kaydı ${i + 1}`,
      message: 'Sipariş eşitlenemedi.',
      isRead: true,
      createdAt: iso(i * 10),
    }))
    const { routes, h } = statefulMocks({}, many)
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await expect(rows(page)).toHaveCount(25)
    await expect(center(page).getByText('25 bildirim gösteriliyor')).toBeVisible()
    await center(page).getByRole('button', { name: 'Daha fazla göster' }).click()
    await expect(rows(page)).toHaveCount(30)
    expect(h.getBodies.at(-1)).toEqual({ limit: 25, cursor: 'pg-024', onlyUnread: false })
    await expect(center(page).getByText('Hepsi bu kadar')).toBeVisible()
    await expect(center(page).getByRole('button', { name: 'Daha fazla göster' })).toHaveCount(0)
  })

  test('boş: hiç bildirim yoksa sakin boş durum', async ({ page }) => {
    await installApiMocks(page, {
      MenuService: menuWithNotifications,
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
      MenuService: menuWithNotifications,
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
    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 3 okunmamış')

    await center(page).getByRole('checkbox', { name: 'E2E içe aktarma tamamlandı satırını seç' }).check()
    await expect(center(page).getByText('1 bildirim seçildi')).toBeVisible()
    await center(page).getByRole('button', { name: 'Okundu işaretle', exact: true }).click()

    await expect.poll(() => h.markBodies.length).toBe(1)
    expect(h.markBodies[0]).toEqual({ notificationIds: ['nc-e2e-0001'] })
    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 2 okunmamış')
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
    await expect(rows(page)).toHaveCount(4)
  })

  test('filtre: "Okunmamış" → onlyUnread:true + aktif çip; çip kaldırılınca tüm liste', async ({ page }) => {
    const { routes, h } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await expandFilters(page)

    await center(page).getByRole('combobox').filter({ hasText: 'Okunma durumu' }).click()
    await page.getByRole('option', { name: 'Okunmamış' }).click()
    await center(page).getByRole('button', { name: 'Sorgula' }).click()

    await expect.poll(() => h.getBodies.at(-1)?.onlyUnread).toBe(true)
    await expect(rows(page)).toHaveCount(3)
    const chips = center(page).getByRole('group', { name: 'Aktif filtreler' })
    await expect(chips).toContainText('Okunmamış')

    await chips.getByRole('button', { name: 'Okunma filtresini kaldır' }).click()
    await expect.poll(() => h.getBodies.at(-1)?.onlyUnread).toBe(false)
    await expect(rows(page)).toHaveCount(6)
  })

  test('filtre: kategori SUNUCUDA (category), önem istemcide; seçenekler katalogdan', async ({ page }) => {
    const { routes, h } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await expandFilters(page)

    await center(page).getByRole('combobox').filter({ hasText: 'Kategori' }).click()
    await page.getByRole('option', { name: 'Stok' }).click()
    await center(page).getByRole('button', { name: 'Sorgula' }).click()
    await expect.poll(() => h.getBodies.at(-1)?.category).toBe('stock')
    await expect(rows(page)).toHaveCount(2)
    await expect(center(page).getByRole('group', { name: 'Aktif filtreler' })).toContainText('Kategori:')

    await center(page).getByRole('combobox').filter({ hasText: 'Önem' }).click()
    await page.getByRole('option', { name: 'Kritik' }).click()
    await page.keyboard.press('Escape')
    await center(page).getByRole('button', { name: 'Sorgula' }).click()
    await expect(rows(page)).toHaveCount(1)
    await expect(rows(page).first()).toContainText('E2E aşırı satış: 3 sipariş satırı')
    await expect(center(page).getByText('önem filtresi yüklenen kayıtlara uygulanır')).toBeVisible()
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
    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 2 okunmamış')
  })

  test('ayrıntı → Görüntüle: internalActionPath ile ilgili ekrana gider', async ({ page }) => {
    const { routes } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await center(page).getByRole('button', { name: 'E2E içe aktarma tamamlandı', exact: true }).click()
    await page.getByRole('dialog').filter({ hasText: '42 ürün aktarıldı' }).getByRole('button', { name: 'Görüntüle' }).click()
    await expect(page).toHaveURL(/\/orders/)
  })

  test('SSE: notification olayı → merkez yalnız yenileri (afterId) başa ekler + kritik toast', async ({ page }) => {
    const { routes, h } = statefulMocks()
    const fresh = {
      _id: 'nc-e2e-live',
      code: 'INTEGRATION_AUTH_FAILED',
      category: 'integration',
      severity: 'critical',
      title: 'E2E canlı: Trendyol kimlik doğrulaması başarısız',
      message: 'API anahtarınızı yenileyin.',
      isRead: false,
      createdAt: iso(0),
    }
    let streamCalls = 0
    routes['notifications/stream'] = async (route: Route, headers: Record<string, string>) => {
      streamCalls += 1
      if (streamCalls === 1) {
        // İlk bağlantı: merkez yüklenene dek bekletilir, sonra yeni bildirim yayınlanır.
        await new Promise((r) => setTimeout(r, 2500))
        h.add(fresh)
        return route.fulfill({
          status: 200,
          headers: { ...headers, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
          body: sseBody([{ event: 'notification', id: '1', data: { id: fresh._id, category: 'integration', severity: 'critical', unreadCount: 4 } }]),
        })
      }
      return route.fulfill({ status: 503, headers: { ...headers, 'retry-after': '60' }, body: '' })
    }
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await expect(rows(page)).toHaveCount(6)

    await expect(rows(page).first()).toContainText('E2E canlı', { timeout: 15000 })
    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 4 okunmamış')
    await expect(rows(page).first()).toContainText('E2E canlı: Trendyol kimlik doğrulaması başarısız')
    await expect(rows(page)).toHaveCount(7)
    expect(h.getBodies.some((b) => b.afterId === 'nc-e2e-0001')).toBe(true)
    // Kritik → tek uyarı toast'ı.
    await expect(page.getByText('Kritik bildirim')).toBeVisible()
  })

  test('SSE: liste kapalıyken rozet olaydaki sayıya gelir; kopup yeniden bağlanınca sayım RPC ile tazelenir', async ({ page }) => {
    const { routes } = statefulMocks()
    let counts = 0
    const baseCount = routes['NotificationService/getUnreadCount']
    routes['NotificationService/getUnreadCount'] = (route: Route, headers: Record<string, string>) => {
      counts += 1
      return baseCount(route, headers)
    }
    let streamCalls = 0
    routes['notifications/stream'] = async (route: Route, headers: Record<string, string>) => {
      streamCalls += 1
      await new Promise((r) => setTimeout(r, 1500))
      const sse = { ...headers, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }
      if (streamCalls === 1) return route.fulfill({ status: 200, headers: sse, body: sseBody([{ event: 'notification', id: '1', data: { id: 'x1', unreadCount: 7 } }], 500) })
      if (streamCalls === 2) return route.fulfill({ status: 200, headers: sse, body: sseBody([], 60_000) })
      return route.fulfill({ status: 503, headers, body: '' })
    }
    await installApiMocks(page, routes)
    await gotoAuthed(page)
    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 7 okunmamış', { timeout: 15000 })
    const before = counts
    // Gövde bitti → tarayıcı `retry` (500 ms) sonra yeniden bağlanır → açılışta resync: sayım RPC'si gerçek sayıyı (3) döner.
    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 3 okunmamış', { timeout: 15000 })
    expect(counts).toBeGreaterThan(before)
  })

  test('SSE yok (503) → polling yedeği: durum "Otomatik yenileme"', async ({ page }) => {
    const { routes } = statefulMocks({
      'notifications/stream': (route: Route, headers: Record<string, string>) => route.fulfill({ status: 503, headers: { ...headers, 'retry-after': '60' }, body: '' }),
    })
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await expect(center(page).getByRole('status').filter({ hasText: 'Otomatik yenileme' })).toBeVisible()
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

  test('çekmece: gün grupları, Okunmamış sekmesi, ⋯ → Bildirim tercihleri', async ({ page }) => {
    const { routes } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoAuthed(page)
    await bell(page).click()
    const drawer = page.locator('.ek-notification-drawer')
    await expect(drawer.getByRole('heading', { name: 'Bugün' })).toBeVisible()
    await expect(drawer.getByRole('img', { name: 'Zorunlu bildirim' })).toHaveCount(1)
    await drawer.getByRole('tab', { name: /Okunmamış/ }).click()
    await expect(drawer.getByText('E2E yeni sipariş')).toHaveCount(0)
    await expect(drawer.getByText('E2E içe aktarma tamamlandı')).toBeVisible()

    await drawer.getByRole('button', { name: 'Bildirim işlemleri' }).click()
    await page.getByRole('menuitem', { name: 'Bildirim tercihleri' }).click()
    await expect(page).toHaveURL(/\/settings\/notifications$/)
  })

  test('axe WCAG 2.1 AA: liste + ayrıntı + çekmece = 0 ihlal', async ({ page }) => {
    const { routes } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await expect(rows(page)).toHaveCount(6)

    const list = await new AxeBuilder({ page }).withTags(AA).include('.ek-notification-center').analyze()
    expect(list.violations, JSON.stringify(list.violations, null, 2)).toEqual([])

    await center(page).getByRole('button', { name: 'E2E aşırı satış uyarısı', exact: true }).click()
    await expect(page.getByRole('dialog').filter({ hasText: 'SKU E2E-TSH-01' })).toBeVisible()
    await page.waitForTimeout(400)
    const sheet = await new AxeBuilder({ page }).withTags(AA).include('.v-overlay--active').analyze()
    expect(sheet.violations, JSON.stringify(sheet.violations, null, 2)).toEqual([])
    await page.keyboard.press('Escape')

    await bell(page).click()
    await expect(page.locator('.ek-notification-drawer').getByText('E2E yeni sipariş')).toBeVisible()
    await page.waitForTimeout(400)
    const drawer = await new AxeBuilder({ page }).withTags(AA).include('.ek-notification-drawer').analyze()
    expect(drawer.violations, JSON.stringify(drawer.violations, null, 2)).toEqual([])
  })

  test('inceleme görselleri (C2B_REVIEW=1)', async ({ page }, info) => {
    test.skip(!process.env.C2B_REVIEW, 'yalnız inceleme görseli üretiminde')
    test.skip(info.project.name !== 'chromium-desktop', 'tek projede üretilir')
    const w = Number(process.env.C2B_WIDTH ?? 1440)
    await page.setViewportSize({ width: w, height: w >= 1024 ? 900 : 844 })
    const { routes } = statefulMocks()
    await installApiMocks(page, routes)
    await gotoCenter(page)
    await expect(rows(page)).toHaveCount(6)
    await page.waitForTimeout(400)
    const dir = 'docs/c2b-review'
    await page.screenshot({ path: `${dir}/merkez-${w}.png` })

    await center(page).getByRole('button', { name: 'E2E aşırı satış: 3 sipariş satırı', exact: true }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/merkez-ayrinti-${w}.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    await bell(page).click()
    await expect(page.locator('.ek-notification-drawer').getByRole('button', { name: 'Tümünü gör' })).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/cekmece-${w}.png` })
  })
})
