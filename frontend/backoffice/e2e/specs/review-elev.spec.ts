// BO-ELEV inceleme kareleri (docs/elev/review/) — yalnız BO_REVIEW=1 ile koşar; görsel taban DEĞİLDİR (tabanlar Windows'ta).
// Önek: BO_REVIEW_PREFIX=once|sonra (varsayılan sonra). Yalnız bazı kareler: BO_REVIEW_ONLY=genel,musteriler
// cd frontend/backoffice && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 BO_REVIEW_PREFIX=sonra npx playwright test review-elev.spec.ts --project=chromium-desktop
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNT } from '../support/session'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'elev', 'review')
const PREFIX = process.env.BO_REVIEW_PREFIX || 'sonra'
const ONLY = (process.env.BO_REVIEW_ONLY || '').split(',').filter(Boolean)
const WIDTHS = (process.env.BO_REVIEW_WIDTHS || '1440,390').split(',').map(Number)
const THEMES = (process.env.BO_REVIEW_THEMES || 'light,dark').split(',') as Array<'light' | 'dark'>
const CONFIGS = THEMES.flatMap((theme) => WIDTHS.map((width) => ({ theme, width })))

const SCREENS: Array<[string, string]> = [
  ['01-genel-bakis', '/genel-bakis'],
  ['10-musteriler', '/musteriler'],
  ['11-musteri-detay', '/musteriler/102'],
  ['12-abonelikler', '/abonelikler'],
  ['20-motor', '/motor'],
  ['21-motor-basarisiz', '/motor?sekme=basarisiz'],
  ['22-entegrasyonlar', '/entegrasyonlar'],
  ['23-altyapi', '/altyapi'],
  ['30-loglar', '/loglar'],
  ['31-denetim', '/denetim'],
  ['40-yoneticiler', '/yoneticiler'],
  ['41-ayarlar', '/sistem/bayraklar'],
  ['42-duyurular', '/sistem/duyurular'],
  ['43-teslimler', '/bildirimler/teslimler'],
  ['44-uyarilar', '/bildirimler/uyarilar'],
]

test.skip(!process.env.BO_REVIEW, 'BO_REVIEW=1 ile koşar')
test.setTimeout(600_000)

const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

async function shot(page: Page, name: string, cfg: (typeof CONFIGS)[number], fullPage = true) {
  if (!want(name)) return
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.v-skeleton-loader, [aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, `${PREFIX}-${name}-${cfg.theme}-${cfg.width}.png`), fullPage, animations: 'disabled' })
}

for (const cfg of CONFIGS) {
  test(`bo-elev inceleme ${cfg.theme} ${cfg.width}`, async ({ browser }) => {
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

    for (const [name, path] of SCREENS) {
      if (!want(name)) continue
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      await shot(page, name, cfg)
    }

    // Komut paleti (boş sorgu + müşteri numarası).
    if (want('50-palet')) {
      await page.goto('/genel-bakis')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      await page.keyboard.press('Control+k')
      await expect(page.getByRole('combobox')).toBeFocused()
      await shot(page, '50-palet', cfg, false)
      await page.keyboard.type('102')
      await shot(page, '51-palet-musteri', cfg, false)
      await page.keyboard.press('Escape')
    }

    // Kısayol yardımı (?).
    if (want('52-kisayollar')) {
      await page.goto('/genel-bakis')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      await page.keyboard.press('Shift+?')
      await expect(page.getByRole('dialog', { name: 'Klavye kısayolları' })).toBeVisible()
      await shot(page, '52-kisayollar', cfg, false)
      await page.keyboard.press('Escape')
    }

    // Kısmi bozulma (Redis düşük) — genel bakış ve motor.
    if (want('60-bozulma')) {
      await page.goto('/genel-bakis')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      await page.waitForFunction(() => 'setDegraded' in ((window as unknown as { __boMock?: object }).__boMock ?? {}))
      await page.evaluate(() => (window as unknown as { __boMock: { setDegraded: (v: boolean) => void } }).__boMock.setDegraded(true))
      // SPA içi gezinme (sahte durum sayfa yenilemesinde sıfırlanır): komut paleti üzerinden.
      const spaGo = async (q: string, h1: string) => {
        await page.keyboard.press('Control+k')
        await page.keyboard.type(q)
        await page.keyboard.press('Enter')
        await expect(page.getByRole('heading', { level: 1, name: h1 })).toBeVisible()
      }
      await spaGo('Motor ve kuyruklar', 'Motor ve kuyruklar')
      await shot(page, '60-bozulma-motor', cfg)
      await spaGo('Genel bakış', 'Genel bakış')
      await shot(page, '61-bozulma-genel', cfg)
    }

    // Tehlikeli işlem diyaloğu.
    if (want('70-diyalog')) {
      await page.goto('/motor?sekme=basarisiz&gorunum=ayrinti')
      await page.getByTestId('retry').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(OUT, `${PREFIX}-70-diyalog-yeniden-dene-${cfg.theme}-${cfg.width}.png`), animations: 'disabled' })
    }
    await ctx.close()
  })
}
