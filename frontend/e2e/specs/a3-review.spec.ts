// DS-v2 Aşama 3 — premium eleştiri turu görüntüleri: `screens.ts`'teki HER ekran + kimliksiz ekranlar
// (giriş / kayıt / şifremi unuttum / şifre sıfırlama / e-posta doğrulama), 1440 ve 390 genişlikte.
// İddia yok; yalnızca inceleme görüntüsü üretir. Günlük koşuda ATLANIR.
//   A3_REVIEW=1 A3_REVIEW_WIDTH=1440 A3_REVIEW_OUT=docs/design-system-review/a3-final \
//     npx playwright test e2e/specs/a3-review.spec.ts --project=chromium-desktop
import { test } from '@playwright/test'
import { SCREENS } from '../../src/navigation/screens'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { openReviewScreen } from '../fixtures/reviewScreens'

const ENABLED = process.env.A3_REVIEW === '1'
const WIDTH = Number(process.env.A3_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.A3_REVIEW_OUT || 'docs/design-system-review/a3-review'
const FULL = process.env.A3_REVIEW_FULL === '1'
const ONLY = (process.env.A3_REVIEW_ONLY || '').split(',').filter(Boolean)

const NO_SESSION = { checkAuthentication: false, userContext: mockError(401, {}) }

const fileName = (name: string) => `${OUT}/${name.replace(/[/]/g, '-')}-${WIDTH}.png`

test.describe('A3 inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca A3_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })

  for (const screen of SCREENS) {
    if (screen.instanceParam) continue
    if (ONLY.length && !ONLY.some((o) => screen.key.includes(o) || screen.slug.includes(o))) continue
    test(`ekran: ${screen.key}`, async ({ page }) => {
      await openReviewScreen(page, screen.key)
      await page.screenshot({ path: fileName(screen.slug), fullPage: FULL })
    })
  }

  const unsecure: Array<{ name: string; path: string; tab?: string; extra?: Record<string, unknown> }> = [
    { name: 'auth-giris', path: '/login' },
    { name: 'auth-kayit', path: '/login', tab: 'Kayıt' },
    { name: 'auth-sifremi-unuttum', path: '/login', tab: 'Şifremi unuttum' },
    { name: 'auth-sifre-sifirla', path: '/reset-password?token=e2e-sentetik-belirtec' },
    { name: 'auth-eposta-dogrula', path: '/verify-email?token=e2e-sentetik-belirtec', extra: { 'AccountService/verifyEmail': { success: true } } },
  ]
  for (const u of unsecure) {
    if (ONLY.length && !ONLY.some((o) => u.name.includes(o))) continue
    test(`kimliksiz: ${u.name}`, async ({ page }) => {
      await installApiMocks(page, { ...NO_SESSION, ...(u.extra ?? {}) })
      await page.goto(u.path)
      if (u.tab) await page.getByRole('tab', { name: u.tab }).click()
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(800)
      await page.screenshot({ path: fileName(u.name), fullPage: FULL })
    })
  }
})
