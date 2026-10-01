// cloud/fe-cfg2 — FE-CFG-2 inceleme kareleri (giriş ekranı destek iletişimi + bakım şeridi; oturumlu kabukta bakım + duyuru;
// FE-CFG-3 boş durumlu eski tanım ekranı). İddia yok; yalnız inceleme görüntüsü üretir. Günlük koşuda ATLANIR.
//   FE_CFG2_REVIEW=1 npx playwright test -c playwright.cloud.config.ts e2e/specs/fe-cfg2-review.spec.ts --project=chromium-desktop
// Çıktı: backoffice/docs/fe-cfg2-review/app-*-{light,dark}-{1440,390}.png
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed } from '../fixtures/nav'
import { HIDDEN_DEFINITION_SCREENS, menuFixtureWithLegacyDefinitions, openHiddenDefinitionScreen } from '../fixtures/definitionsMenu'
import { publicConfigFixture } from '../fixtures/publicConfig'

const ENABLED = process.env.FE_CFG2_REVIEW === '1'
const OUT = 'backoffice/docs/fe-cfg2-review'
const NO_SESSION = { checkAuthentication: false, userContext: mockError(401, {}) }
const FULL = publicConfigFixture({
  'support.email': 'destek@example.test',
  'support.phone': '+90 212 000 00 00',
  'announcement.enabled': true,
  'announcement.level': 'warning',
  'announcement.text': 'Trendyol sipariş aktarımında gecikme var; ekibimiz çalışıyor.',
  'maintenance.enabled': true,
  'maintenance.message': 'Pazar 02:00–03:00 arası planlı bakım.',
})
const CONFIGS = [
  { theme: 'light', width: 1440 },
  { theme: 'dark', width: 1440 },
  { theme: 'light', width: 390 },
] as const

async function prepare(page: Page, theme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript((t) => localStorage.setItem('ek-theme', t), theme)
}
async function shot(page: Page, name: string, cfg: (typeof CONFIGS)[number]) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${OUT}/app-${name}-${cfg.theme}-${cfg.width}.png`, fullPage: cfg.width < 600, animations: 'disabled' })
}

test.describe('fe-cfg2 inceleme (uygulama)', () => {
  test.skip(!ENABLED, 'Yalnız FE_CFG2_REVIEW=1 ile')
  test.setTimeout(120_000)
  for (const cfg of CONFIGS) {
    test(`${cfg.theme} ${cfg.width}`, async ({ page }) => {
      await page.setViewportSize({ width: cfg.width, height: cfg.width > 600 ? 900 : 844 })
      await prepare(page, cfg.theme)
      await installApiMocks(page, { ...NO_SESSION, 'public-config': FULL })
      await page.goto('/login')
      await expect(page.getByTestId('login-support')).toBeVisible()
      await shot(page, '01-giris-destek-bakim', cfg)
      await page.unrouteAll({ behavior: 'ignoreErrors' })

      await installApiMocks(page, { 'public-config': FULL, MenuService: menuFixtureWithLegacyDefinitions })
      await gotoAuthed(page)
      await expect(page.getByTestId('announcement-banner')).toBeVisible()
      await shot(page, '02-kabuk-bakim-duyuru', cfg)
      await openHiddenDefinitionScreen(page, HIDDEN_DEFINITION_SCREENS.BrandDefinitionView)
      await expect(page.getByText('Henüz kayıt yok')).toBeVisible()
      await shot(page, '03-tanim-bos-durum', cfg)
    })
  }
})
