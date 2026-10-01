// MOB-04 — web push (Ayarlar > Bildirim tercihleri), mobil genişlikte, SAHTE push: tarayıcının `Notification`,
// `PushManager` ve service worker kaydı init betiğiyle taklit edilir (gerçek push servisi/izin istemi yok).
// Kapsam: Telefon sütunu + "Bu cihaz" kartı yalnız sunucu kanalı açıkken; izin YALNIZ "Bu cihazda aç" tıklamasıyla;
// subscribePush gövdesi; tercih kaydında `matrix.<kat>.push`; iOS Safari sekmesinde dürüst açıklama; izin reddi;
// Electron'da gizli; axe (WCAG 2.1 AA). Yalnız chromium-mobile projesinde koşar.
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { installApiMocks, type MockValue } from '../fixtures/mockApi'
import { menuFixture, waitForWorkplaceReady } from '../fixtures/nav'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const ROOT = '.ek-notification-prefs'

const menu = [
  ...menuFixture,
  { group: 'system', links: [{ code: 'NotificationPreferencesView', parent: '', title: 'notificationPreferences', icon: 'mdi-bell-cog-outline', singleton: true }] },
]

const PREFS = {
  result: true,
  data: { locale: 'tr', matrix: {}, digest: null, quietHours: null },
  tenantDefaults: { locale: 'tr', matrix: {}, digest: null, quietHours: null },
  locks: [],
}

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== 'chromium-mobile', 'MOB-04 mobil akış: yalnız chromium-mobile')
})

type FakeOpts = { permission?: 'default' | 'granted' | 'denied'; requestResult?: 'granted' | 'denied'; desktop?: boolean }

/** Sahte push API'leri. `window.__push` sayaçları testten okunur. */
async function fakePush(page: Page, o: FakeOpts = {}) {
  await page.addInitScript((opts: FakeOpts) => {
    try {
      localStorage.setItem('ek.help.v1.tour', 'dismissed')
      localStorage.setItem('ek-pwa-install-dismissed', '1')
    } catch {
      /* depolama kapalı */
    }
    const w = window as any
    w.__push = { requests: 0, subscribes: 0, unsubscribes: 0 }
    if (opts.desktop) w.entegrasyonikDesktop = { isDesktop: true }
    let current: any = null
    const pushManager = {
      getSubscription: async () => current,
      subscribe: async (o2: any) => {
        w.__push.subscribes++
        current = {
          endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-device',
          options: { applicationServerKey: o2.applicationServerKey.buffer },
          toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-device', expirationTime: null, keys: { p256dh: 'BOrnek-p256dh', auth: 'ornek-auth' } }),
          unsubscribe: async () => { w.__push.unsubscribes++; current = null; return true },
        }
        return current
      },
    }
    const reg = { pushManager }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve(reg), getRegistration: async () => reg, register: async () => reg, addEventListener: () => {}, controller: null },
    })
    w.PushManager = function PushManager() {}
    const N: any = function Notification() {}
    N.permission = opts.permission ?? 'default'
    N.requestPermission = async () => { w.__push.requests++; N.permission = opts.requestResult ?? 'granted'; return N.permission }
    w.Notification = N
  }, o)
}

async function open(page: Page, overrides: Record<string, MockValue> = {}, fake: FakeOpts = {}) {
  await fakePush(page, fake)
  await installApiMocks(page, {
    MenuService: menu,
    'NotificationService/getPreferences': PREFS,
    'NotificationService/getPushConfig': { result: true, enabled: true, publicKey: KEY, devices: [] },
    ...overrides,
  })
  await page.goto('/settings/notifications')
  await waitForWorkplaceReady(page)
  await expect(page.locator(`${ROOT}:not(.hide-tab-component)`)).toBeVisible({ timeout: 20000 })
  // tercihler yüklendi (iskelet bitti): ilk satır görünür — soğuk Vite derlemesinde 5 sn'lik varsayılan yetmiyor
  await expect(page.locator(`${ROOT} [data-category]`).first()).toBeVisible({ timeout: 20000 })
}

const counters = (page: Page) => page.evaluate(() => (window as any).__push as { requests: number; subscribes: number; unsubscribes: number })
const json = (route: any, headers: Record<string, string>, body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })

test('kanal açık: Telefon sütunu + kart; sayfa açılışında izin İSTENMEZ; "Bu cihazda aç" → izin + abonelik + subscribePush gövdesi', async ({ page }) => {
  let body: any
  await open(page, {
    'NotificationService/subscribePush': async (route: any, headers: Record<string, string>) => { body = route.request().postDataJSON(); return json(route, headers, { result: true }) },
  })
  const root = page.locator(ROOT)
  await expect(root.locator('[data-col="push"]').first()).toBeVisible()
  await expect(root.locator('[data-push-card]')).toHaveAttribute('data-state', 'off')
  expect((await counters(page)).requests).toBe(0)

  await root.locator('[data-push-enable]').click()
  await expect(root.locator('[data-push-card]')).toHaveAttribute('data-state', 'on')
  await expect(root.getByText('Bu cihazda anlık bildirimler açıldı.')).toBeVisible()
  expect(await counters(page)).toMatchObject({ requests: 1, subscribes: 1 })
  expect(body).toEqual({
    subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-device', expirationTime: null, keys: { p256dh: 'BOrnek-p256dh', auth: 'ornek-auth' } },
    deviceLabel: expect.stringMatching(/ · /),
  })
})

test('tercih kaydı: kategori Telefon anahtarı matrix.<kat>.push olarak gider; kilitli kategoride yalnız push', async ({ page }) => {
  let body: any
  await open(page, {
    'NotificationService/updatePreferences': async (route: any, headers: Record<string, string>) => { body = route.request().postDataJSON(); return json(route, headers, { result: true }) },
  })
  const root = page.locator(ROOT)
  const sw = root.locator('[data-category="catalog"] [data-col="push"] input')
  await expect(sw).not.toBeChecked()
  await sw.check()
  await root.getByRole('button', { name: 'Kaydet' }).click()
  await expect.poll(() => body).toBeTruthy()
  expect(body.matrix.catalog).toEqual({ inApp: true, email: 'off', push: true })
  expect(Object.keys(body)).toEqual(['matrix', 'digest', 'quietHours', 'locale'])
  expect(body.quietHours).toBeNull()
})

test('izin reddi: dürüst açıklama, abonelik/istek yok', async ({ page }) => {
  let called = false
  await open(page, { 'NotificationService/subscribePush': async (route: any, headers: Record<string, string>) => { called = true; return json(route, headers, { result: true }) } }, { requestResult: 'denied' })
  const root = page.locator(ROOT)
  await root.locator('[data-push-enable]').click()
  await expect(root.locator('[data-push-card]')).toHaveAttribute('data-state', 'denied')
  await expect(root.getByText('Bildirim izni kapalı')).toBeVisible()
  expect((await counters(page)).subscribes).toBe(0)
  expect(called).toBe(false)
})

test('sunucu kanalı kapalı (VAPID yok): sütun ve kart YOK', async ({ page }) => {
  await open(page, { 'NotificationService/getPushConfig': { result: true, enabled: false, publicKey: null, devices: [] } })
  const root = page.locator(ROOT)
  await expect(root.locator('[data-col="inApp"]').first()).toBeVisible()
  await expect(root.locator('[data-col="push"]')).toHaveCount(0)
  await expect(root.locator('[data-push-card]')).toHaveCount(0)
})

test('masaüstü kabuğu (Electron): push arayüzü gizli ve push durumu sorgulanmaz', async ({ page }) => {
  let asked = false
  await open(page, { 'NotificationService/getPushConfig': async (route: any, headers: Record<string, string>) => { asked = true; return json(route, headers, { result: true, enabled: true, publicKey: KEY, devices: [] }) } }, { desktop: true })
  const root = page.locator(ROOT)
  await expect(root.locator('[data-col="inApp"]').first()).toBeVisible()
  await expect(root.locator('[data-push-card]')).toHaveCount(0)
  expect(asked).toBe(false)
})

test('kayıtlı cihaz kaldırma: kimlikle unsubscribePush', async ({ page }) => {
  let body: any
  await open(page, {
    'NotificationService/getPushConfig': { result: true, enabled: true, publicKey: KEY, devices: [{ id: 'aaaaaaaaaaaaaaaaaaaaaaa1', deviceLabel: 'iPhone · Safari', createdAt: '2026-09-30T08:00:00Z', lastSuccessAt: null }] },
    'NotificationService/unsubscribePush': async (route: any, headers: Record<string, string>) => { body = route.request().postDataJSON(); return json(route, headers, { result: true, removed: 1 }) },
  })
  const root = page.locator(ROOT)
  await root.getByRole('button', { name: 'iPhone · Safari cihazını kaldır' }).click()
  await expect(root.getByText('Cihaz kaldırıldı.')).toBeVisible()
  expect(body).toEqual({ id: 'aaaaaaaaaaaaaaaaaaaaaaa1' })
})

test('axe: push kartı ve matris (WCAG 2.1 AA) ihlalsiz; sayfa yatay kaymaz', async ({ page }) => {
  await open(page)
  const res = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
  expect(res.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test.describe('iOS Safari sekmesi', () => {
  test.use({ userAgent: IPHONE })
  test('ana ekrana eklenmemiş: "önce ana ekrana ekleyin" açıklaması, aç düğmesi yok, izin istenmez', async ({ page }) => {
    await open(page)
    const root = page.locator(ROOT)
    await expect(root.locator('[data-push-card]')).toHaveAttribute('data-state', 'ios-install')
    await expect(root.getByText("iPhone ve iPad'de önce ana ekrana ekleyin")).toBeVisible()
    await expect(root.locator('[data-push-enable]')).toHaveCount(0)
    expect((await counters(page)).requests).toBe(0)
  })
})
