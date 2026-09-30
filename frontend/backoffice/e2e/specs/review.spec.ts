// İnceleme kareleri (docs/review/) — yalnız BO_REVIEW=1 ile koşar; görsel taban DEĞİLDİR.
// PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 npx playwright test -c backoffice/playwright.config.ts e2e/specs/review.spec.ts --project=chromium-desktop
import { test, expect, type Page } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNT } from '../support/session'

// BO_REVIEW_OUT: çıktı klasörü (backoffice/ köküne göre; varsayılan docs/review). BO_REVIEW_TAG: dosya adı öneki (ör. once/sonra).
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, process.env.BO_REVIEW_OUT ?? join('docs', 'review'))
const TAG = process.env.BO_REVIEW_TAG ? `${process.env.BO_REVIEW_TAG}-` : ''
const CONFIGS = [
  { theme: 'light', width: 1440 },
  { theme: 'dark', width: 1440 },
  { theme: 'light', width: 390 },
  { theme: 'dark', width: 390 },
] as const

test.skip(!process.env.BO_REVIEW, 'BO_REVIEW=1 ile koşar')
test.setTimeout(240_000)

async function shot(page: Page, name: string, cfg: (typeof CONFIGS)[number], fullPage = true) {
  // Tam yükleme (goto) açılış ekranından geçer: kabuk + iskeletler bitsin.
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.v-skeleton-loader, .bo-boot, .ek-boot')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(700)
  await page.screenshot({ path: join(OUT, `${TAG}${name}-${cfg.theme}-${cfg.width}.png`), fullPage, animations: 'disabled' })
}

async function login(page: Page, email: string) {
  await page.goto('/giris')
  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Parola', { exact: true }).fill(ACCOUNT.password)
  await page.getByRole('button', { name: 'Devam et' }).click()
}

for (const cfg of CONFIGS) {
  test(`inceleme ${cfg.theme} ${cfg.width}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.width > 600 ? 900 : 844 }, colorScheme: cfg.theme })
    const page = await ctx.newPage()
    const mobile = cfg.width < 600

    // İlk giriş: kurulum + kurtarma kodları
    await login(page, ACCOUNT.firstLogin)
    await expect(page.getByRole('img', { name: /QR/ })).toBeVisible()
    await shot(page, '02b-totp-kurulum', cfg)
    await page.getByLabel('Uygulamadaki 6 haneli kod').fill('246810')
    await page.getByRole('button', { name: 'Kurulumu tamamla' }).click()
    await expect(page.getByTestId('recovery-codes')).toBeVisible()
    await shot(page, '02c-kurtarma-kodlari', cfg)
    await page.evaluate(() => (window as unknown as { __boMock: { expireSession(): void } }).__boMock.expireSession())

    await page.goto('/giris')
    await expect(page.getByRole('heading', { name: 'Yönetim girişi' })).toBeVisible()
    await shot(page, '01-giris', cfg)
    await login(page, ACCOUNT.email)
    await page.getByLabel('Doğrulama kodu').fill('123')
    await shot(page, '02-totp', cfg)
    await page.getByLabel('Doğrulama kodu').fill('123456')
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page).toHaveURL(/genel-bakis/)

    await page.waitForTimeout(800)
    await shot(page, '03-genel-bakis', cfg)
    if (mobile) {
      await page.getByRole('button', { name: 'Menüyü aç' }).click()
      await shot(page, '03b-menu', cfg, false)
      await page.keyboard.press('Escape')
    }

    await page.goto('/musteriler')
    await page.waitForTimeout(900)
    await shot(page, '04-musteriler', cfg)
    await page.goto('/musteriler/102')
    await page.waitForTimeout(900)
    await shot(page, '05-musteri-detay', cfg)
    await page.evaluate(() => (window as unknown as { __boMock: { expireReauth(): void } }).__boMock.expireReauth())
    await page.getByTestId('impersonate').click()
    await page.getByRole('dialog').getByLabel('Gerekçe').fill('Destek talebi: sipariş eşleme ekranı hatası')
    await shot(page, '05b-gecici-erisim', cfg, false)
    await page.getByRole('button', { name: 'Gerekçeyle başlat' }).click()
    await expect(page.getByRole('dialog', { name: 'Kimliğinizi yeniden doğrulayın' })).toBeVisible()
    await shot(page, '05c-yeniden-dogrulama', cfg, false)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Vazgeç' }).last().click().catch(() => undefined)

    await page.goto('/loglar')
    await page.waitForTimeout(1200)
    await shot(page, '06-log-merkezi', cfg)
    await page.locator('.bo-issue').nth(1).click()
    await expect(page.getByRole('dialog').locator('.bo-drawer')).toBeVisible()
    await page.waitForTimeout(800)
    await shot(page, '06b-sorun-detayi', cfg, false)
    await page.getByRole('dialog').getByRole('button', { name: 'İzi aç' }).first().click()
    await expect(page.getByRole('dialog', { name: 'İstek zinciri' })).toBeVisible()
    await page.waitForTimeout(700)
    await shot(page, '06c-istek-zinciri', cfg, false)
    await page.goto('/loglar')
    await page.getByRole('tab', { name: /Olay akışı/ }).click()
    await page.waitForTimeout(900)
    await shot(page, '06d-olay-akisi', cfg, false)

    await page.goto('/denetim')
    await page.waitForTimeout(900)
    await page.getByRole('button', { name: 'Ayrıntı: backoffice.write' }).first().click()
    await page.getByRole('button', { name: 'Ayrıntı: app.write' }).first().click()
    await shot(page, '07-denetim', cfg)
    await ctx.close()
  })
}
