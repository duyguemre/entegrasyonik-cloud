// cloud/bo-r2a inceleme kareleri (docs/bo-r2-review/{once,sonra}/) — yalnız BO_REVIEW=1 ile koşar; görsel taban DEĞİLDİR.
// BO_R2_OUT=once|sonra (varsayılan sonra); BO_R2_ONLY=<düzenli ifade> yalnız eşleşen kareler. Tüm hazır ekranlar 1440 açık + koyu ve 390 açık.
// cd frontend/backoffice && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 BO_R2_OUT=sonra npx playwright test e2e/specs/review-r2.spec.ts --project=chromium-desktop
import { test, expect, type Page } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { ACCOUNT } from '../support/session'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'bo-r2-review', process.env.BO_R2_OUT === 'once' ? 'once' : 'sonra')
const CONFIGS = [
  { theme: 'light', width: 1440 },
  { theme: 'dark', width: 1440 },
  { theme: 'light', width: 390 },
] as const
type Cfg = (typeof CONFIGS)[number]

/** Ad → yol. Genel bakış + teknik ayrıntılar bo-r2a'nın sayfaları; kalanlar bo-r2b için karşılaştırma tabanı. */
const ROUTES: Array<[string, string]> = [
  ['01-genel-bakis', '/genel-bakis'],
  ['02-genel-bakis-teknik', '/genel-bakis?ayrinti=teknik'],
  ['03-otopilot', '/otopilot'],
  ['04-musteriler', '/musteriler'],
  ['05-musteri-detay', '/musteriler/102'],
  ['06-kullanim', '/musteriler/kullanim'],
  ['07-abonelikler', '/abonelikler'],
  ['08-motor', '/motor'],
  ['09-motor-basarisiz', '/motor?sekme=basarisiz'],
  ['10-entegrasyonlar', '/entegrasyonlar'],
  ['11-altyapi', '/altyapi'],
  ['12-onbellek', '/altyapi/onbellek'],
  ['13-loglar', '/loglar'],
  ['14-denetim', '/denetim'],
  ['15-yoneticiler', '/yoneticiler'],
  ['16-sistem-ayarlari', '/sistem/bayraklar'],
  ['17-rekabet', '/sistem/rekabet'],
  ['18-duyurular', '/sistem/duyurular'],
  ['19-teslimler', '/bildirimler/teslimler'],
  ['20-katalog', '/bildirimler/katalog'],
  ['21-uyarilar', '/bildirimler/uyarilar'],
]

test.skip(!process.env.BO_REVIEW, 'BO_REVIEW=1 ile koşar')
test.setTimeout(420_000)

async function shot(page: Page, name: string, cfg: Cfg) {
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined)
  await expect(page.locator('.v-skeleton-loader, [aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(OUT, `${name}-${cfg.theme}-${cfg.width}.png`), fullPage: true, animations: 'disabled' })
}

for (const cfg of CONFIGS) {
  test(`bo-r2 inceleme ${cfg.theme} ${cfg.width}`, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true })
    const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.width > 600 ? 900 : 844 }, colorScheme: cfg.theme, hasTouch: cfg.width < 600 })
    const page = await ctx.newPage()
    await page.goto('/giris')
    await page.getByLabel('E-posta').fill(ACCOUNT.email)
    await page.getByLabel('Parola', { exact: true }).fill(ACCOUNT.password)
    await page.getByRole('button', { name: 'Devam et' }).click()
    await page.getByLabel('Doğrulama kodu').fill('123456')
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page).toHaveURL(/\/genel-bakis$/)
    const only = process.env.BO_R2_ONLY ? new RegExp(process.env.BO_R2_ONLY) : null
    for (const [name, path] of ROUTES.filter(([n]) => !only || only.test(n))) {
      await page.goto(path)
      await expect(page.locator('h1').first()).toBeVisible({ timeout: 20_000 })
      await shot(page, name, cfg)
    }
    await ctx.close()
  })
}
