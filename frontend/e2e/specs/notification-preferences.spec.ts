// C2b (ADR-0029 Karar 4-5, NOTIFICATION_PLAN F-N2) — Bildirim tercihleri (NotificationPreferencesView).
// Sözleşme gövdesi `stores/notificationPreferences.ts` başındaki nota göre (sözleşme kopyasında şekil yazılı değil).
// `C2B_REVIEW=1` → inceleme görselleri docs/c2b-review/ (Playwright tabanı DEĞİLDİR).
import { test, expect, type Page, type Route } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { waitForWorkplaceReady } from '../fixtures/nav'
import { statefulMocks } from '../fixtures/notifications'

const AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const serverPrefs = {
  categories: {
    order: { inApp: true, email: 'inst' },
    stock: { inApp: true, email: 'dig' },
    catalog: { inApp: false, email: 'off' },
    billing: { inApp: false, email: 'off' }, // kilitli — istemci yok sayar
  },
  digest: { frequency: 'daily', hour: 18 },
  quietHours: { enabled: false, start: '22:00', end: '08:00' },
  locale: 'tr',
}

function prefsMocks(overrides: Record<string, any> = {}) {
  const saves: any[] = []
  const { routes } = statefulMocks({
    'NotificationService/getPreferences': { result: true, data: serverPrefs },
    'NotificationService/updatePreferences': (route: Route, headers: Record<string, string>) => {
      saves.push(route.request().postDataJSON?.() ?? {})
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ result: true }) })
    },
    ...overrides,
  })
  return { routes, saves }
}

async function gotoPrefs(page: Page) {
  await page.goto('/settings/notifications')
  await waitForWorkplaceReady(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Bildirim tercihleri' })).toBeVisible({ timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
}

const view = (page: Page) => page.locator('.ek-notification-prefs').filter({ visible: true })
const row = (page: Page, key: string) => view(page).locator(`[data-category="${key}"]`)

test.describe('C2b — bildirim tercihleri', () => {
  test('matris: kategoriler katalogdan, sunucu değerleri yüklenir, kilitli satırlar devre dışı', async ({ page }) => {
    const { routes } = prefsMocks()
    await installApiMocks(page, routes)
    await gotoPrefs(page)

    await expect(view(page).locator('[data-category]')).toHaveCount(8)
    await expect(row(page, 'order').getByRole('radio', { name: 'Anında' })).toBeChecked()
    await expect(row(page, 'catalog').getByRole('switch', { name: 'Katalog aktarımları: uygulama içi bildirim' })).not.toBeChecked()

    // Tümü zorunlu: abonelik + güvenlik → kilitli, sunucu "kapalı" dese de açık/anında.
    for (const key of ['billing', 'security']) {
      await expect(row(page, key).getByRole('img', { name: 'Zorunlu bildirim' })).toBeVisible()
      await expect(row(page, key).getByRole('switch')).toBeDisabled()
      await expect(row(page, key).getByRole('switch')).toBeChecked()
      await expect(row(page, key).getByRole('radio', { name: 'Anında' })).toBeChecked()
      await expect(row(page, key).getByRole('radio', { name: 'Kapalı' })).toBeDisabled()
    }
    // Kısmen zorunlu: stok satırı açık ama zorunlu olay adları listelenir.
    await expect(row(page, 'stock')).toContainText('Her zaman gönderilir: Aşırı satış')
    await expect(row(page, 'stock').getByRole('switch')).toBeEnabled()
  })

  test('kaydet: yalnız değişince çubuk görünür; gövde kilitli kategorileri içermez', async ({ page }) => {
    const { routes, saves } = prefsMocks()
    await installApiMocks(page, routes)
    await gotoPrefs(page)
    await expect(view(page).getByRole('button', { name: 'Kaydet' })).toHaveCount(0)

    await row(page, 'order').getByText('Özet', { exact: true }).click()
    await row(page, 'finance').getByRole('switch').click()
    await expect(view(page).getByText('Kaydedilmemiş tercih değişiklikleriniz var.')).toBeVisible()
    await view(page).getByRole('button', { name: 'Kaydet' }).click()

    await expect.poll(() => saves.length).toBe(1)
    expect(saves[0].categories.order).toEqual({ inApp: true, email: 'dig' })
    expect(saves[0].categories.finance).toEqual({ inApp: false, email: 'dig' })
    expect(saves[0].categories.billing).toBeUndefined()
    expect(saves[0].categories.security).toBeUndefined()
    expect(saves[0].digest).toEqual({ frequency: 'daily', hour: 18 })
    await expect(page.getByText('Bildirim tercihleriniz kaydedildi.')).toBeVisible()
    await expect(view(page).getByRole('button', { name: 'Kaydet' })).toHaveCount(0)
  })

  test('Vazgeç değişiklikleri geri alır; sessiz saat aynı başlangıç/bitiş kaydedilmez', async ({ page }) => {
    const { routes, saves } = prefsMocks()
    await installApiMocks(page, routes)
    await gotoPrefs(page)
    await row(page, 'order').getByText('Kapalı', { exact: true }).click()
    await view(page).getByRole('button', { name: 'Vazgeç' }).click()
    await expect(row(page, 'order').getByRole('radio', { name: 'Anında' })).toBeChecked()

    await view(page).getByRole('switch', { name: 'Sessiz saatleri kullan' }).click()
    await view(page).getByRole('combobox').filter({ hasText: 'Bitiş' }).click()
    await page.getByRole('option', { name: '22:00' }).click()
    await expect(view(page).getByText('Sessiz saatlerin başlangıcı ve bitişi aynı olamaz.').first()).toBeVisible()
    await view(page).getByRole('button', { name: 'Kaydet' }).click()
    await expect(view(page).locator('.ek-alert').filter({ hasText: 'aynı olamaz' })).toBeVisible()
    expect(saves).toHaveLength(0)
  })

  test('kayıt hatası: IMPERSONATION_READ_ONLY → anlaşılır ileti (ham hata yok)', async ({ page }) => {
    const { routes } = prefsMocks({
      'NotificationService/updatePreferences': mockError(403, { error: 'ham sunucu iletisi', code: 'IMPERSONATION_READ_ONLY' }),
    })
    await installApiMocks(page, routes)
    await gotoPrefs(page)
    await row(page, 'order').getByText('Özet', { exact: true }).click()
    await view(page).getByRole('button', { name: 'Kaydet' }).click()
    await expect(view(page).getByText('Destek görünümünde tercihler değiştirilemez.')).toBeVisible()
    await expect(page.getByText('ham sunucu iletisi')).toHaveCount(0)
  })

  test('yükleme hatası → sorun durumu + Tekrar dene', async ({ page }) => {
    let calls = 0
    const { routes } = prefsMocks({
      'NotificationService/getPreferences': (route: Route, headers: Record<string, string>) => {
        calls += 1
        return route.fulfill({ status: 500, contentType: 'application/json', headers, body: '{}' })
      },
    })
    await installApiMocks(page, routes)
    await gotoPrefs(page)
    await expect(view(page).getByText('Tercihler yüklenemedi')).toBeVisible()
    const before = calls
    await view(page).getByRole('button', { name: /Tekrar dene/ }).click()
    await expect.poll(() => calls).toBeGreaterThan(before)
  })

  test('klavye: e-posta radyo grubu ok tuşlarıyla değişir', async ({ page }) => {
    const { routes } = prefsMocks()
    await installApiMocks(page, routes)
    await gotoPrefs(page)
    await row(page, 'order').getByRole('radio', { name: 'Anında' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(row(page, 'order').getByRole('radio', { name: 'Özet' })).toBeChecked()
  })

  test('axe WCAG 2.1 AA = 0 ihlal', async ({ page }) => {
    const { routes } = prefsMocks()
    await installApiMocks(page, routes)
    await gotoPrefs(page)
    await expect(view(page).locator('[data-category]')).toHaveCount(8)
    await view(page).getByRole('switch', { name: 'Sessiz saatleri kullan' }).click()
    const r = await new AxeBuilder({ page }).withTags(AA).include('.ek-notification-prefs').analyze()
    expect(r.violations, JSON.stringify(r.violations, null, 2)).toEqual([])
  })

  test('inceleme görselleri (C2B_REVIEW=1)', async ({ page }, info) => {
    test.skip(!process.env.C2B_REVIEW, 'yalnız inceleme görseli üretiminde')
    test.skip(info.project.name !== 'chromium-desktop', 'tek projede üretilir')
    const w = Number(process.env.C2B_WIDTH ?? 1440)
    await page.setViewportSize({ width: w, height: w >= 1024 ? 900 : 844 })
    const { routes } = prefsMocks()
    await installApiMocks(page, routes)
    await gotoPrefs(page)
    await expect(view(page).locator('[data-category]')).toHaveCount(8)
    await row(page, 'finance').getByRole('switch').click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `docs/c2b-review/tercihler-${w}.png`, fullPage: false })
    await view(page).getByRole('switch', { name: 'Sessiz saatleri kullan' }).click()
    // Sekme içeriğinin KENDİ kaydırıcısı (window değil) sona kaydırılır.
    await view(page).evaluate((el) => {
      let node: HTMLElement | null = el.parentElement
      while (node && !(node.scrollHeight > node.clientHeight && /(auto|scroll)/.test(getComputedStyle(node).overflowY))) node = node.parentElement
      if (node) node.scrollTop = node.scrollHeight
    })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `docs/c2b-review/tercihler-alt-${w}.png`, fullPage: false })
  })
})
