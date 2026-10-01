// BO-R1a inceleme kareleri (docs/bo-r1a-review/) — yalnız BO_REVIEW=1 ile koşar; görsel taban DEĞİLDİR (tabanlar Windows'ta).
// Senaryolar: "sorun var" (varsayılan sahte veri) ve "her şey yolunda" (__boMock.setCalm(true)); ayrıca teknik ayrıntı açık.
// cd frontend/backoffice && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 BO_REVIEW_PREFIX=sonra npx playwright test review-r1a.spec.ts --project=chromium-desktop
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNT } from '../support/session'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'bo-r1a-review')
const PREFIX = process.env.BO_REVIEW_PREFIX || 'sonra'
const ONLY = (process.env.BO_REVIEW_ONLY || '').split(',').filter(Boolean)
const WIDTHS = (process.env.BO_REVIEW_WIDTHS || '1440,390').split(',').map(Number)
const THEMES = (process.env.BO_REVIEW_THEMES || 'light,dark').split(',') as Array<'light' | 'dark'>
const FULL = process.env.BO_REVIEW_FULL !== '0'
const CONFIGS = THEMES.flatMap((theme) => WIDTHS.map((width) => ({ theme, width })))

test.skip(!process.env.BO_REVIEW, 'BO_REVIEW=1 ile koşar')
test.setTimeout(300_000)

const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

async function shot(page: Page, name: string, cfg: (typeof CONFIGS)[number], fullPage = FULL) {
  if (!want(name)) return
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.v-skeleton-loader, [aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, `${PREFIX}-${name}-${cfg.theme}-${cfg.width}.png`), fullPage, animations: 'disabled' })
}

for (const cfg of CONFIGS) {
  test(`bo-r1a inceleme ${cfg.theme} ${cfg.width}`, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true })
    const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.width > 600 ? 900 : 844 }, colorScheme: cfg.theme })
    const page = await ctx.newPage()
    await page.goto('/giris')
    await page.getByLabel('E-posta').fill(ACCOUNT.email)
    await page.getByLabel('Parola', { exact: true }).fill(ACCOUNT.password)
    await page.getByRole('button', { name: 'Devam et' }).click()
    await page.getByLabel('Doğrulama kodu').fill('123456')
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page).toHaveURL(/\/genel-bakis$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })

    // İlk ekran (katlanma çizgisi üstü) + tam sayfa
    await shot(page, '01-sorun-ilk-ekran', cfg, false)
    await shot(page, '02-sorun-tam', cfg)

    // Teknik ayrıntılar açık
    if (want('03-ayrinti')) {
      const toggle = page.getByTestId('detail-toggle')
      if (await toggle.count()) {
        await toggle.click()
        await shot(page, '03-ayrinti-acik', cfg)
        await toggle.click()
      }
    }

    // "Her şey yolunda" — sahte API sakin kolu (SPA içi yenile; sayfa yenilemesi sahte durumu sıfırlar)
    await page.waitForFunction(() => 'setCalm' in ((window as unknown as { __boMock?: object }).__boMock ?? {}))
    await page.evaluate(() => (window as unknown as { __boMock: { setCalm: (v: boolean) => void } }).__boMock.setCalm(true))
    await page.getByRole('button', { name: 'Yenile', exact: true }).click()
    await page.waitForTimeout(600)
    await shot(page, '11-yolunda-ilk-ekran', cfg, false)
    await shot(page, '12-yolunda-tam', cfg)
    await ctx.close()
  })
}
