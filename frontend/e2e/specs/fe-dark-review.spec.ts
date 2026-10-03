// FR2-DARK (madde 10) — karanlık mod inceleme görüntüleri: ana ekranlar light + dark, 1440 ve 390 genişlikte.
// İddia yok; yalnızca inceleme görüntüsü üretir. Günlük koşuda ATLANIR.
//   FE_DARK_REVIEW=1 FE_DARK_REVIEW_WIDTH=1440 npx playwright test e2e/specs/fe-dark-review.spec.ts --project=chromium-desktop
// Tema, kullanıcının kalıcı tercihi (`localStorage['ek-theme']`) ile seçilir — gerçek akışla aynı (theme-boot.js ilk kare).
import { expect, test, type Page } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { openReviewScreen } from '../fixtures/reviewScreens'

const ENABLED = process.env.FE_DARK_REVIEW === '1'
const WIDTH = Number(process.env.FE_DARK_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.FE_DARK_REVIEW_OUT || 'docs/fe-dark-review'
const ONLY = (process.env.FE_DARK_REVIEW_ONLY || '').split(',').filter(Boolean)
const THEMES = (process.env.FE_DARK_REVIEW_THEMES || 'light,dark').split(',') as Array<'light' | 'dark'>

/** Ana ekranlar (P1 + sık kullanılan P2). */
const MAIN: Array<{ name: string; key: string }> = [
  { name: 'panel', key: 'DashboardView' },
  { name: 'siparisler', key: 'OrderListView' },
  { name: 'urunler', key: 'productDefinitions/ProductListView' },
  { name: 'iadeler', key: 'ClaimListView' },
  { name: 'musteriler', key: 'CustomerListView' },
  { name: 'faturalar', key: 'InvoiceListView' },
  { name: 'mesajlar', key: 'MessageListView' },
  { name: 'stok-sagligi', key: 'StockHealthView' },
  { name: 'pazaryerleri', key: 'integrations/MarketplaceView' },
  { name: 'entegrasyon-sagligi', key: 'integrations/IntegrationHealthView' },
  { name: 'finans', key: 'FinancialListView' },
  { name: 'abonelik', key: 'user/SubscriptionView' },
  { name: 'bildirimler', key: 'NotificationCenterView' },
  { name: 'kayitlar', key: 'LogListView' },
  { name: 'yardim', key: 'HelpCenterView' },
]

const fileName = (name: string, theme: string) => `${OUT}/${name}-${theme}-${WIDTH}.png`

async function useThemePreference(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript((t) => localStorage.setItem('ek-theme', t), theme)
}

test.describe('FR2-DARK inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca FE_DARK_REVIEW=1 ile (inceleme turu)')
  // Soğuk vite ön-derlemesinde ilk kare boş kalabiliyor → kabuk görünmeden çekim yapılmaz, bir kez yeniden denenir.
  test.describe.configure({ retries: 1 })
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })

  for (const theme of THEMES) {
    for (const screen of MAIN) {
      if (ONLY.length && !ONLY.some((o) => screen.name.includes(o))) continue
      test(`${theme}: ${screen.name}`, async ({ page }) => {
        await useThemePreference(page, theme)
        await openReviewScreen(page, screen.key)
        await expect(page.locator('[data-header-action=account]').first()).toBeVisible()
        await expect(page.locator('.workplace-area').first()).toBeVisible()
        await page.screenshot({ path: fileName(screen.name, theme) })
      })
    }
    if (!ONLY.length || ONLY.some((o) => 'giris'.includes(o))) {
      test(`${theme}: giris`, async ({ page }) => {
        await useThemePreference(page, theme)
        await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
        await page.goto('/login')
        await expect(page.getByRole('button', { name: 'Devam et', exact: true })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(800)
        await page.screenshot({ path: fileName('giris', theme) })
      })
    }
  }
})
