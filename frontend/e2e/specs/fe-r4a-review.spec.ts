// FE-R4 Şerit A — inceleme görüntüleri (üst bar, profil, bildirim penceresi, Otopilot penceresi, akıllı arama + bağlam menüsü).
// İddia yok; yalnızca inceleme görüntüsü üretir. Günlük koşuda ATLANIR.
//   FE_R4A_REVIEW=1 FE_R4A_OUT=docs/fe-r4-review/a/once npx playwright test -c playwright.cloud.config.ts \
//     e2e/specs/fe-r4a-review.spec.ts --project=chromium-desktop
// Her durum 1440 açık + 1440 koyu + 390 açık genişlikte alınır.
import { test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { menuFixture } from '../fixtures/nav'
import { gotoWithOtopilot, launcher, ask, type OtopilotConfig } from '../fixtures/otopilot'

const ENABLED = process.env.FE_R4A_REVIEW === '1'
const OUT = process.env.FE_R4A_OUT || 'docs/fe-r4-review/a/sonra'

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

const notifications = [
  { _id: 'r4-1', code: 'STOCK_OVERSOLD', category: 'stock', severity: 'critical', title: 'Aşırı satış: E2E-TSH-01', message: 'Trendyol ve Hepsiburada aynı son ürünü sattı. Siparişlerden birini iptal edin veya stok ekleyin.', isRead: false, createdAt: iso(4), actionUrl: '/orders', metaData: { integrationCode: 'trendyol' }, mandatory: true },
  { _id: 'r4-2', type: 'IMPORT_READY', mode: 'IMPORT', severity: 'success', title: 'İçe aktarma tamamlandı', message: 'Trendyol kataloğunuzdan 42 ürün aktarıldı.', isRead: false, createdAt: iso(26), actionUrl: '/orders', metaData: { integrationCode: 'trendyol', totalCount: 45, processedCount: 42, invalidCount: 3 } },
  { _id: 'r4-3', code: 'INTEGRATION_AUTH_FAILED', category: 'integration', severity: 'error', title: 'Hepsiburada bağlantısı reddedildi', message: 'API anahtarının süresi dolmuş olabilir. Entegrasyon ayarlarından anahtarı yenileyin.', isRead: false, createdAt: iso(95), metaData: { integrationCode: 'hepsiburada' }, count: 3, lastOccurredAt: iso(12) },
  { _id: 'r4-4', type: 'ORDER', severity: 'info', title: '3 yeni sipariş', message: 'Hepsiburada kanalından 3 yeni sipariş geldi.', isRead: true, createdAt: iso(60 * 20) },
  { _id: 'r4-5', type: 'SYSTEM', severity: 'warning', title: 'Planlı bakım', message: 'Planlı bakım gece 02:00-03:00 arasında yapılacak.', isRead: true, createdAt: iso(60 * 30) },
  { _id: 'r4-6', type: 'EXPORT_READY', mode: 'EXPORT', severity: 'info', title: 'Dışa aktarma hazır', message: 'Ürün listesi dışa aktarımı tamamlandı.', isRead: true, createdAt: iso(60 * 24 * 4) },
]

const routes = {
  MenuService: menuWithCenter,
  NotificationService: { result: true, data: notifications, unreadCount: 3 },
  'NotificationService/get': { result: true, data: notifications, unreadCount: 3 },
  'NotificationService/getUnreadCount': { result: true, unreadCount: 3 },
  'SmartService/unifiedSearch': {
    orders: [
      { _id: 'o-1', orderNumber: 'TY-100231', integrationCode: 'trendyol', billingAddress: { firstName: 'Ayşe', lastName: 'Kaya' }, dates: { orderDate: '2026-09-28T10:00:00.000Z' } },
      { _id: 'o-2', orderNumber: 'HB-100232', integrationCode: 'hepsiburada', billingAddress: { firstName: 'Mert', lastName: 'Demir' }, dates: { orderDate: '2026-09-27T08:30:00.000Z' } },
    ],
    products: [
      { _id: 'p-1', title: 'Pamuklu tişört — beyaz', brand: 'Örnek', price: 349.9, stock: 12 },
      { _id: 'p-2', title: 'Pamuklu tişört — siyah', brand: 'Örnek', price: 349.9, stock: 0 },
    ],
    customers: [{ _id: 'c-1', firstName: 'Ayşe', lastName: 'Kaya', email: 'ayse@example.com' }],
    claims: [{ _id: 'cl-1', externalClaimId: 'IAD-5521', externalOrderId: 'TY-100231', integrationCode: 'trendyol', customer: { firstName: 'Ayşe', lastName: 'Kaya' }, type: 'İade' }],
  },
}

const VARIANTS = [
  { name: '1440-acik', width: 1440, height: 900, theme: 'light' },
  { name: '1440-koyu', width: 1440, height: 900, theme: 'dark' },
  { name: '390-acik', width: 390, height: 844, theme: 'light' },
] as const

async function open(page: Page, theme: string, config: OtopilotConfig = 'enabled') {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('ek-theme', t)
    } catch {
      /* depolama kapalı */
    }
  }, theme)
  await gotoWithOtopilot(page, config, { overrides: routes })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
}

const shot = (page: Page, state: string, variant: string) => page.screenshot({ path: `${OUT}/${state}-${variant}.png` })

test.describe('FE-R4 Şerit A inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca FE_R4A_REVIEW=1 ile (inceleme turu)')

  for (const v of VARIANTS) {
    test.describe(v.name, () => {
      test.use({ viewport: { width: v.width, height: v.height } })

      test('üst bar + profil', async ({ page }) => {
        await open(page, v.theme)
        await shot(page, '01-ust-bar', v.name)
        await page.locator('[data-header-action=account]').click()
        await page.waitForTimeout(400)
        await shot(page, '02-profil-menusu', v.name)
      })

      test('bildirim penceresi', async ({ page }) => {
        await open(page, v.theme)
        await page.locator('[data-header-action=notifications]').click()
        await page.waitForTimeout(700)
        await shot(page, '03-bildirim-penceresi', v.name)
        const first = page.locator('.ek-nd-item').first()
        if (await first.count()) {
          await first.hover()
          await page.waitForTimeout(300)
          await shot(page, '04-bildirim-satir-hover', v.name)
        }
      })

      test('Otopilot penceresi', async ({ page }) => {
        await open(page, v.theme)
        if (v.width < 768) {
          // < 768: panel yok, giriş tam sayfa sekmesini açar.
          await launcher(page).click()
          await page.waitForTimeout(700)
          await shot(page, '08-otopilot-bos', v.name)
          return
        }
        await launcher(page).click()
        await page.waitForTimeout(700)
        await shot(page, '08-otopilot-bos', v.name)
        await ask(page, 'onay bekleyen siparişler')
        await page.getByText('en eski 25').first().waitFor()
        await shot(page, '09-otopilot-tablo', v.name)
        await ask(page, 'ilk 3 siparişi onayla')
        await page.getByText('Kalan süre').first().waitFor()
        await shot(page, '10-otopilot-onay', v.name)
      })

      test('Otopilot kurulum', async ({ page }) => {
        test.skip(v.width < 768, 'dar ekranda panel yok')
        await open(page, v.theme, 'setup-required')
        await launcher(page).click()
        await page.getByLabel('API anahtarı').waitFor()
        await page.waitForTimeout(400)
        await shot(page, '11-otopilot-kurulum', v.name)
      })

      test('akıllı arama', async ({ page }) => {
        await open(page, v.theme)
        await page.keyboard.press('Control+k')
        await page.waitForTimeout(400)
        await shot(page, '05-arama-son-acilanlar', v.name)
        await page.getByRole('combobox', { name: 'Akıllı arama' }).fill('ay')
        await page.waitForTimeout(900)
        await shot(page, '06-arama-sonuclar', v.name)
        const option = page.locator('[role=option]').nth(2)
        if (await option.count()) {
          await option.click({ button: 'right' })
          await page.waitForTimeout(400)
          await shot(page, '07-arama-baglam-menusu', v.name)
        }
      })
    })
  }
})
