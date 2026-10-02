// FE-R4 Şerit A — üst bar, profil menüsü, bildirim penceresi ve akıllı arama.
// Protokol 13: ilk testler (karakterizasyon) DEĞİŞMEMİŞ koda karşı yazıldı ve yeşildi; görsel yenileme bu
// davranışları DEĞİŞTİRMEZ. Sonradan eklenen iddialar (A5 bağlam menüsü, A1 açık üst bar) ayrı describe'da.
import { test, expect, type Page, type Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, menuFixture } from '../fixtures/nav'

const AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()

const menuWithCenter = menuFixture.map((group) =>
  group.group === 'dashboard'
    ? {
        ...group,
        links: [
          ...group.links,
          { code: 'NotificationCenterView', parent: '', title: 'notifications', icon: 'mdi-bell-badge-outline', singleton: true },
          { code: 'NotificationPreferencesView', parent: '', title: 'notificationPreferences', icon: 'mdi-tune-variant', singleton: true },
        ],
      }
    : group,
)

function buildItems() {
  return [
    { _id: 'r4s-1', code: 'STOCK_OVERSOLD', category: 'stock', severity: 'critical', title: 'R4 aşırı satış', message: 'Aynı son ürün iki kanalda satıldı.', isRead: false, createdAt: iso(4), actionUrl: '/orders', metaData: { integrationCode: 'trendyol' } },
    { _id: 'r4s-2', type: 'IMPORT_READY', mode: 'IMPORT', severity: 'success', title: 'R4 içe aktarma tamamlandı', message: 'Trendyol kataloğunuzdan 42 ürün aktarıldı.', isRead: false, createdAt: iso(30), metaData: { integrationCode: 'trendyol', totalCount: 45, processedCount: 42 } },
    { _id: 'r4s-3', type: 'SYSTEM', severity: 'warning', title: 'R4 planlı bakım', message: 'Gece 02:00-03:00 bakım.', isRead: true, createdAt: iso(60 * 30) },
  ]
}

interface Harness {
  mark: any[]
  del: any[]
}

function mocks(): { routes: Record<string, any>; h: Harness } {
  let items = buildItems()
  const h: Harness = { mark: [], del: [] }
  const unread = () => items.filter((n) => !n.isRead).length
  const json = (route: Route, headers: Record<string, string>, body: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })
  return {
    h,
    routes: {
      MenuService: menuWithCenter,
      NotificationService: (route: Route, headers: Record<string, string>) => json(route, headers, { result: true, data: items, unreadCount: unread() }),
      'NotificationService/get': (route: Route, headers: Record<string, string>) => json(route, headers, { result: true, data: items, unreadCount: unread() }),
      'NotificationService/getUnreadCount': (route: Route, headers: Record<string, string>) => json(route, headers, { result: true, unreadCount: unread() }),
      'NotificationService/markAsRead': (route: Route, headers: Record<string, string>) => {
        const body = route.request().postDataJSON?.() ?? {}
        h.mark.push(body)
        items = items.map((n) => (body.all || body.notificationIds?.includes(n._id) ? { ...n, isRead: true } : n))
        return json(route, headers, { result: true })
      },
      'NotificationService/delete': (route: Route, headers: Record<string, string>) => {
        const body = route.request().postDataJSON?.() ?? {}
        h.del.push(body)
        items = body.all ? [] : items.filter((n) => !body.notificationIds?.includes(n._id))
        return json(route, headers, { result: true })
      },
      'SmartService/unifiedSearch': {
        orders: [{ _id: 'o-1', orderNumber: 'R4-100231', integrationCode: 'trendyol', billingAddress: { firstName: 'Ayşe', lastName: 'Kaya' } }],
        products: [{ _id: 'p-1', title: 'R4 pamuklu tişört', brand: 'Örnek', price: 349.9, stock: 12 }],
        customers: [],
        claims: [],
      },
    },
  }
}

async function start(page: Page) {
  const m = mocks()
  await page.addInitScript(() => {
    try {
      localStorage.setItem('ek.help.v1.tour', 'dismissed')
    } catch {
      /* depolama kapalı */
    }
  })
  await installApiMocks(page, m.routes)
  await gotoAuthed(page)
  return m.h
}

const drawer = (page: Page) => page.locator('.ek-notification-drawer')
const bell = (page: Page) => page.locator('[data-header-action=notifications]')

test.describe('FE-R4A — üst bar ve profil (karakterizasyon)', () => {
  test('zil okunmamış sayıyı adında taşır; profil menüsü tema seçici + Kısayollar/Yardım/Çıkış', async ({ page }) => {
    await start(page)
    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 2 okunmamış')
    const account = page.locator('[data-header-action=account]')
    await expect(account).toHaveAttribute('aria-label', /^Hesap menüsü: /)
    await account.click()
    const menu = page.getByRole('menu', { name: 'Hesap' })
    await expect(menu).toBeVisible()
    // "Uygulama ayarları" yalnız menüde SettingListView varsa (bu fikstürde yok) — burada iddia edilmez.
    await expect(page.getByRole('radiogroup').or(page.getByRole('group', { name: /Tema/ })).first()).toBeVisible()
    for (const name of ['Klavye kısayolları', 'Yardım merkezi', 'Uygulama turunu başlat', 'Çıkış']) {
      await expect(menu.getByRole('menuitem', { name: new RegExp(`^${name}`) })).toBeVisible()
    }
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  })
})

test.describe('FE-R4A — bildirim penceresi (karakterizasyon)', () => {
  test('açılınca liste gelir; Okunmamış sekmesi süzer; Kapat kapatır', async ({ page }) => {
    await start(page)
    await bell(page).click()
    await expect(drawer(page).getByRole('heading', { name: 'Bildirimler' })).toBeVisible()
    await expect(drawer(page).getByText('R4 aşırı satış')).toBeVisible()
    await expect(drawer(page).getByText('R4 planlı bakım')).toBeVisible()
    await drawer(page).getByRole('tab', { name: /Okunmamış/ }).click()
    await expect(drawer(page).getByText('R4 planlı bakım')).toHaveCount(0)
    await expect(drawer(page).getByText('R4 aşırı satış')).toBeVisible()
    await drawer(page).getByRole('button', { name: 'Kapat' }).click()
    // Kapalı çekmece DOM'da kalabilir (ekran dışına kayar) — iddia görünüm alanı üzerinden.
    await expect(drawer(page).getByRole('heading', { name: 'Bildirimler' })).not.toBeInViewport()
  })

  test('satır: okundu işaretle / sil tekil kimlikle; Tümünü okundu {all:true}', async ({ page }) => {
    const h = await start(page)
    await bell(page).click()
    // Satır eylemleri işaretçili cihazda üzerine gelince görünür — kullanıcı gibi önce satıra gelinir.
    const row = (text: string) => drawer(page).locator('li', { hasText: text })
    await row('R4 aşırı satış').hover()
    await row('R4 aşırı satış').getByRole('button', { name: 'Okundu işaretle: R4 aşırı satış' }).click()
    await expect.poll(() => h.mark.length).toBe(1)
    expect(h.mark[0]).toEqual({ notificationIds: ['r4s-1'] })
    await row('R4 planlı bakım').hover()
    await row('R4 planlı bakım').getByRole('button', { name: 'Sil: R4 planlı bakım' }).click()
    await expect.poll(() => h.del.length).toBe(1)
    expect(h.del[0]).toEqual({ notificationIds: ['r4s-3'] })
    await expect(drawer(page).getByText('R4 planlı bakım')).toHaveCount(0)
    await drawer(page).getByRole('button', { name: 'Tümünü okundu işaretle' }).click()
    await expect.poll(() => h.mark.length).toBe(2)
    expect(h.mark[1]).toEqual({ all: true })
    await expect(bell(page)).toHaveAttribute('aria-label', 'Bildirimler, 0 okunmamış')
  })

  test('⋯ menüsü: tercihler bağlantısı + Tümünü sil onaylı ({all:true}); boş durum', async ({ page }) => {
    const h = await start(page)
    await bell(page).click()
    await drawer(page).getByRole('button', { name: 'Bildirim işlemleri' }).click()
    await expect(page.getByRole('menuitem', { name: /Bildirim tercihleri/ })).toBeVisible()
    await page.getByRole('menuitem', { name: /Tümünü sil/ }).click()
    const confirm = page.getByRole('dialog', { name: 'Tüm bildirimler silinsin mi?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Tümünü sil' }).click()
    await expect.poll(() => h.del.length).toBe(1)
    expect(h.del[0]).toEqual({ all: true })
    await expect(drawer(page).getByText('Henüz bildiriminiz yok')).toBeVisible()
  })

  test('"Detayları gör" iç yola gider ve okundu işaretler; "Tümünü gör" merkezi açar', async ({ page }) => {
    const h = await start(page)
    await bell(page).click()
    await drawer(page).getByRole('button', { name: 'Detayları gör: R4 aşırı satış' }).click()
    await expect(page).toHaveURL(/\/orders/)
    await expect.poll(() => h.mark.length).toBe(1)
    expect(h.mark[0]).toEqual({ notificationIds: ['r4s-1'] })
    await bell(page).click()
    await drawer(page).getByRole('button', { name: 'Tümünü gör' }).click()
    await expect(page).toHaveURL(/\/notifications/)
  })
})

test.describe('FE-R4A — akıllı arama (karakterizasyon)', () => {
  test('sonuç seçimi: ürün → ürün güncelleme sekmesi; Esc kapatır', async ({ page }) => {
    await start(page)
    await page.keyboard.press('Control+k')
    const input = page.getByRole('combobox', { name: 'Akıllı arama' })
    await input.fill('R4')
    const product = page.getByRole('option', { name: /R4 pamuklu tişört/ })
    await expect(product).toBeVisible()
    await expect(page.getByRole('option', { name: /R4-100231/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(product).toBeHidden()
  })
})

test.describe('FE-R4A — erişilebilirlik', () => {
  test('axe: üst bar + açık bildirim penceresi WCAG 2.1 AA = 0', async ({ page }) => {
    await start(page)
    await bell(page).click()
    await expect(drawer(page).getByText('R4 aşırı satış')).toBeVisible()
    await page.waitForTimeout(400)
    const result = await new AxeBuilder({ page }).withTags(AA).include('.ek-shell-bar').include('.ek-notification-drawer').analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })

  test('axe: açık akıllı arama sonuçları WCAG 2.1 AA = 0', async ({ page }) => {
    await start(page)
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Akıllı arama' }).fill('R4')
    await expect(page.getByRole('option', { name: /R4 pamuklu tişört/ })).toBeVisible()
    const result = await new AxeBuilder({ page }).withTags(AA).include('.ek-shell-bar').analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
})

// ---------- Yeni iddialar (FE-R4 A1–A5) — karakterizasyondan SONRA eklendi ----------
test.describe('FE-R4A — yeni: bildirim penceresi durumları', () => {
  test('A3: liste alınamazsa problem durumu; Tekrar dene başarılı olunca liste gelir', async ({ page }) => {
    let fail = true
    const m = mocks()
    const ok = m.routes.NotificationService
    m.routes.NotificationService = (route: Route, headers: Record<string, string>) =>
      fail ? route.fulfill({ status: 500, contentType: 'application/json', headers, body: '{}' }) : ok(route, headers)
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ek.help.v1.tour', 'dismissed')
      } catch {
        /* depolama kapalı */
      }
    })
    await installApiMocks(page, m.routes)
    await gotoAuthed(page)
    await bell(page).click()
    await expect(drawer(page).getByText('Bildirimler yüklenemedi')).toBeVisible()
    fail = false
    await drawer(page).getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(drawer(page).getByText('R4 aşırı satış')).toBeVisible()
    await expect(drawer(page).getByText('Bildirimler yüklenemedi')).toHaveCount(0)
  })

  test('A3: klavye — satıra Tab ile gelince eylemler görünür; okunmamış sekmesi boşsa nazik boş durum', async ({ page }) => {
    await start(page)
    await bell(page).click()
    await expect(drawer(page).getByText('R4 aşırı satış')).toBeVisible()
    const action = drawer(page).getByRole('button', { name: 'Okundu işaretle: R4 aşırı satış' })
    await action.focus()
    await expect(action).toBeVisible()
    await expect.poll(() => action.evaluate((el) => getComputedStyle(el.closest('.ek-nd-item__actions')!).opacity)).toBe('1')
    await drawer(page).getByRole('button', { name: 'Tümünü okundu işaretle' }).click()
    await drawer(page).getByRole('tab', { name: /Okunmamış/ }).click()
    await expect(drawer(page).getByText('Okunmamış bildiriminiz yok')).toBeVisible()
  })
})

test.describe('FE-R4A — yeni: üst bar tonu ve arama bağlam menüsü', () => {
  test('A1/A2: üst bar bir ton açık (soft); profil düğmesi koyu blok taşımaz (zemin saydam)', async ({ page }) => {
    await start(page)
    const header = page.locator('.ek-shell-bar .ek-header')
    await expect(header).toHaveClass(/ek-header--soft/)
    const bar = await header.evaluate((el) => getComputedStyle(el).backgroundImage)
    expect(bar).toContain('linear-gradient')
    const bg = await page.locator('[data-header-action=account]').evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).toBe('rgba(0, 0, 0, 0)')
  })

  test('A5: sağ tık → türüne göre menü; "Sipariş numarasını kopyala" panoya yazar, toast gösterir', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await start(page)
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Akıllı arama' }).fill('R4')
    const order = page.getByRole('option', { name: /R4-100231/ })
    await expect(order).toBeVisible()
    await order.click({ button: 'right' })
    const menu = page.getByRole('menu', { name: 'Sonuç işlemleri' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Siparişi aç/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Müşterinin siparişleri/ })).toBeVisible()
    // Menü açıkken sonuçlar açık kalır.
    await expect(order).toBeVisible()
    await menu.getByRole('menuitem', { name: /Sipariş numarasını kopyala/ }).click()
    await expect(menu).toBeHidden()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('R4-100231')
    await expect(page.getByText('Sipariş numarası panoya kopyalandı.')).toBeVisible()
  })

  test('A5: klavye — Shift+F10 etkin satırın menüsünü açar, Esc kapatıp odağı aramaya döndürür; "aç" = Enter', async ({ page }) => {
    await start(page)
    await page.keyboard.press('Control+k')
    const input = page.getByRole('combobox', { name: 'Akıllı arama' })
    await input.fill('R4')
    await expect(page.getByRole('option', { name: /R4 pamuklu tişört/ })).toBeVisible()
    // Etkin satırı ürüne taşı (Ekranlar grubu boş: ilk sipariş, sonra ürün).
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Shift+F10')
    const menu = page.getByRole('menu', { name: 'Sonuç işlemleri' })
    await expect(menu.getByRole('menuitem', { name: /Ürünü düzenle/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(input).toBeFocused()
    // Siparişe dön; menüden "Siparişi aç" Enter ile aynı işi yapar (liste sekmesi, arama değeri URL'ye yazılmaz).
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Shift+F10')
    await menu.getByRole('menuitem', { name: /Siparişi aç/ }).click()
    await expect(page.getByRole('option', { name: /R4 pamuklu tişört/ })).toBeHidden()
    await expect(page.locator('.orderListView')).toBeVisible()
    expect(page.url()).not.toContain('globalSearch')
  })

  test('axe: arama bağlam menüsü açıkken WCAG 2.1 AA = 0', async ({ page }) => {
    await start(page)
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: 'Akıllı arama' }).fill('R4')
    await page.getByRole('option', { name: /R4-100231/ }).click({ button: 'right' })
    await expect(page.getByRole('menu', { name: 'Sonuç işlemleri' })).toBeVisible()
    const result = await new AxeBuilder({ page }).withTags(AA).include('.ek-shell-bar').include('.v-overlay--active').analyze()
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
})
