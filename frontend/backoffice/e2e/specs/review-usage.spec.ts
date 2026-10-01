// MOB-08 inceleme kareleri (docs/mob-usage-review/) — yalnız BO_REVIEW=1 ile koşar; görsel taban DEĞİLDİR (tabanlar Windows'ta).
// cd frontend/backoffice && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 npx playwright test e2e/specs/review-usage.spec.ts --project=chromium-desktop
import { test, expect, type Page } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNT } from '../support/session'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'mob-usage-review')
const CONFIGS = [
  { theme: 'light', width: 1440 },
  { theme: 'dark', width: 1440 },
  { theme: 'light', width: 390 },
] as const
type Cfg = (typeof CONFIGS)[number]

test.skip(!process.env.BO_REVIEW, 'BO_REVIEW=1 ile koşar')
test.setTimeout(300_000)

async function shot(page: Page, name: string, cfg: Cfg) {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined)
  await expect(page.locator('.v-skeleton-loader, [aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, `${name}-${cfg.theme}-${cfg.width}.png`), fullPage: true, animations: 'disabled' })
}

for (const cfg of CONFIGS) {
  test(`mob-usage inceleme ${cfg.theme} ${cfg.width}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.width > 600 ? 900 : 844 }, colorScheme: cfg.theme, hasTouch: cfg.width < 600 })
    const page = await ctx.newPage()
    await page.goto('/giris')
    await page.getByLabel('E-posta').fill(ACCOUNT.email)
    await page.getByLabel('Parola', { exact: true }).fill(ACCOUNT.password)
    await page.getByRole('button', { name: 'Devam et' }).click()
    await page.getByLabel('Doğrulama kodu').fill('123456')
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page).toHaveURL(/\/genel-bakis$/)

    await page.goto('/musteriler/kullanim')
    await expect(page.getByTestId('usage-verdict')).toBeVisible()
    await page.getByTestId('platform-subtypes').first().locator('summary').click()
    await shot(page, '01-kullanim', cfg)
    await page.locator('[data-platform="mobile"]').first().click()
    await expect(page.getByTestId('usage-filter-note')).toBeVisible()
    await shot(page, '02-kullanim-mobil-suzgec', cfg)

    await page.goto('/musteriler/102?sekme=kullanim')
    await expect(page.getByTestId('usage-verdict')).toBeVisible()
    await shot(page, '03-musteri-kullanim', cfg)
    await page.goto('/musteriler/103?sekme=kullanim')
    await expect(page.getByTestId('usage-verdict')).toBeVisible()
    await shot(page, '04-musteri-kullanim-pasif', cfg)

    await page.goto('/musteriler/kullanim')
    await expect(page.getByTestId('usage-verdict')).toBeVisible()
    await page.evaluate('window.__boMock.setUsageEmpty(true)')
    await page.locator('[data-page-refresh]').click()
    await expect(page.getByTestId('usage-verdict')).toContainText('henüz yok')
    await shot(page, '05-kullanim-veri-yok', cfg)
    await ctx.close()
  })
}
