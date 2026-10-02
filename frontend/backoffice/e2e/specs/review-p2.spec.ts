// bo-p2 inceleme kareleri (docs/bo-p2-review/) — yalnız BO_REVIEW=1 ile koşar; görsel taban DEĞİLDİR (tabanlar Windows'ta).
// cd frontend && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 npx playwright test -c backoffice/playwright.config.ts e2e/specs/review-p2.spec.ts --project=chromium-desktop
import { test, expect, type Page } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNT } from '../support/session'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'bo-p2-review')
const CONFIGS = [
  { theme: 'light', width: 1440 },
  { theme: 'dark', width: 1440 },
  { theme: 'light', width: 390 },
  { theme: 'dark', width: 390 },
] as const
const SCREENS: Array<[string, string]> = [
  ['10-motor-kuyruklar', '/motor'],
  ['11-motor-basarisiz', '/motor?sekme=basarisiz'],
  ['12-motor-durum', '/motor?sekme=durum'],
  ['13-motor-zamanlanmis', '/motor?sekme=zamanlanmis'],
  ['20-entegrasyon-api', '/entegrasyonlar'],
  ['21-entegrasyon-dayaniklilik', '/entegrasyonlar?sekme=dayaniklilik'],
  ['22-entegrasyon-katalog', '/entegrasyonlar?sekme=katalog'],
  ['30-altyapi-redis', '/altyapi'],
  ['31-altyapi-mongo', '/altyapi?sekme=mongodb'],
  ['32-altyapi-yavas', '/altyapi?sekme=yavas'],
  ['33-onbellek', '/altyapi/onbellek'],
  ['40-abonelikler', '/abonelikler'],
  ['41-gelir', '/abonelikler?sekme=gelir'],
  ['42-abonelik-detay', '/abonelikler/105'],
  ['50-musteri-yasam-dongusu', '/musteriler/111?sekme=yasam-dongusu'],
  ['60-platform-ayarlari', '/sistem/bayraklar'],
  ['70-yoneticiler', '/yoneticiler'],
]

test.skip(!process.env.BO_REVIEW, 'BO_REVIEW=1 ile koşar')
test.setTimeout(420_000)

async function shot(page: Page, name: string, cfg: (typeof CONFIGS)[number]) {
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.v-skeleton-loader, [aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(OUT, `${name}-${cfg.theme}-${cfg.width}.png`), fullPage: true, animations: 'disabled' })
}

for (const cfg of CONFIGS) {
  test(`bo-p2 inceleme ${cfg.theme} ${cfg.width}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.width > 600 ? 900 : 844 }, colorScheme: cfg.theme })
    const page = await ctx.newPage()

    // Kimliksiz davet kabulü (oturum açmadan).
    await page.goto('/accept-invite#t=ornekDavetBileti0000000000000000000000000000')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await shot(page, '80-davet-kabul', cfg)

    await page.goto('/giris')
    await page.getByLabel('E-posta').fill(ACCOUNT.email)
    await page.getByLabel('Parola', { exact: true }).fill(ACCOUNT.password)
    await page.getByRole('button', { name: 'Devam et' }).click()
    await page.getByLabel('Doğrulama kodu').fill('123456')
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page).toHaveURL(/\/genel-bakis$/)

    for (const [name, path] of SCREENS) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await shot(page, name, cfg)
    }

    // Hassas işlem diyaloğu (gerekçe + kimlik doğrulama bilgisi).
    await page.goto('/motor?sekme=basarisiz&gorunum=ayrinti')
    await page.getByTestId('retry').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, `90-diyalog-yeniden-dene-${cfg.theme}-${cfg.width}.png`), animations: 'disabled' })
    await ctx.close()
  })
}
