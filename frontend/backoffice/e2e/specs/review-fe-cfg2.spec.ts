// cloud/fe-cfg2 inceleme kareleri (docs/fe-cfg2-review/) — yalnız BO_REVIEW=1 ile koşar; görsel taban DEĞİLDİR (tabanlar Windows'ta).
// Sistem ayarları (BO-CFG-1: taslak → yayın → geçmiş → geri alma + salt okunur Ortam) ve ortak PageVerdict'e taşınan Kullanım.
// cd frontend/backoffice && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 npx playwright test e2e/specs/review-fe-cfg2.spec.ts --project=chromium-desktop
import { test, expect, type Page } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNT } from '../support/session'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'fe-cfg2-review')
const CONFIGS = [
  { theme: 'light', width: 1440 },
  { theme: 'dark', width: 1440 },
  { theme: 'light', width: 390 },
] as const
type Cfg = (typeof CONFIGS)[number]

test.skip(!process.env.BO_REVIEW, 'BO_REVIEW=1 ile koşar')
test.setTimeout(300_000)

async function shot(page: Page, name: string, cfg: Cfg, fullPage = true) {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined)
  await expect(page.locator('.v-skeleton-loader, [aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, `bo-${name}-${cfg.theme}-${cfg.width}.png`), fullPage, animations: 'disabled' })
}

for (const cfg of CONFIGS) {
  test(`fe-cfg2 backoffice inceleme ${cfg.theme} ${cfg.width}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.width > 600 ? 900 : 844 }, colorScheme: cfg.theme, hasTouch: cfg.width < 600 })
    const page = await ctx.newPage()
    await page.goto('/giris')
    await page.getByLabel('E-posta').fill(ACCOUNT.email)
    await page.getByLabel('Parola', { exact: true }).fill(ACCOUNT.password)
    await page.getByRole('button', { name: 'Devam et' }).click()
    await page.getByLabel('Doğrulama kodu').fill('123456')
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page).toHaveURL(/\/genel-bakis$/)

    await page.goto('/sistem/bayraklar')
    await expect(page.getByRole('heading', { level: 1, name: 'Platform ayarları' })).toBeVisible()
    await shot(page, '01-sistem-ayarlari', cfg)

    await page.locator('[data-setting="announcement.text"] input, [data-setting="announcement.text"] textarea').first().fill('Pazar 02:00–03:00 arası planlı bakım yapılacaktır.')
    await page.getByTestId('settings-save').click()
    const pub = page.getByRole('dialog', { name: 'Değişiklikler yayınlansın mı?' })
    await expect(pub).toBeVisible()
    await shot(page, '02-sistem-ayarlari-yayin-diyalogu', cfg, false)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('draft-bar')).toBeVisible()
    await page.getByTestId('draft-bar').scrollIntoViewIfNeeded()
    await shot(page, '03-sistem-ayarlari-taslak', cfg, false)
    await page.getByTestId('discard-draft').click()
    await page.getByRole('alertdialog', { name: 'Taslak atılsın mı?' }).getByRole('button', { name: 'Taslağı at' }).click()
    await expect(page.getByTestId('draft-bar')).toHaveCount(0)

    await page.getByRole('tab', { name: /Yayın geçmişi/ }).click()
    await page.getByRole('region', { name: 'Yayın geçmişi' }).getByTestId('rollback').first().click()
    await expect(page.getByRole('dialog', { name: /geri alınsın mı\?/ })).toBeVisible()
    await shot(page, '04-sistem-ayarlari-geri-alma', cfg, false)
    await page.keyboard.press('Escape')

    await page.goto('/musteriler/kullanim')
    await expect(page.getByTestId('usage-verdict')).toBeVisible()
    await shot(page, '05-kullanim-pageverdict', cfg)
    await page.evaluate('window.__boMock.setUsageEmpty(true)')
    await page.locator('[data-page-refresh]').click()
    await expect(page.getByTestId('usage-verdict')).toContainText('henüz yok')
    await shot(page, '06-kullanim-veri-yok', cfg)
    await ctx.close()
  })
}
