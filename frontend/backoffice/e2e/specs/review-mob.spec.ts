// MOB-06 inceleme kareleri (docs/bo-mob-review/) — yalnız BO_REVIEW=1 ile koşar; görsel taban DEĞİLDİR (tabanlar Windows'ta).
// Telefon ilk ekranı (Durum → Karar → Eylem görünür mü) 390 + 430, açık + koyu. Yalnız bazıları: BO_REVIEW_ONLY=genel,loglar
// cd frontend/backoffice && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 npx playwright test review-mob.spec.ts --project=chromium-mobile
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { phone, spaGo } from '../support/mobile'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'bo-mob-review')
const ONLY = (process.env.BO_REVIEW_ONLY || '').split(',').filter(Boolean)
const WIDTHS = (process.env.BO_REVIEW_WIDTHS || '390,430').split(',').map(Number)
const THEMES = (process.env.BO_REVIEW_THEMES || 'light,dark').split(',') as Array<'light' | 'dark'>
const CONFIGS = THEMES.flatMap((theme) => WIDTHS.map((width) => ({ theme, width })))

const SCREENS: Array<[string, string]> = [
  ['01-genel-bakis', '/genel-bakis'],
  ['10-musteriler', '/musteriler'],
  ['11-musteri-detay', '/musteriler/102'],
  ['12-destek', '/musteriler/destek'],
  ['20-motor-basarisiz', '/motor?sekme=basarisiz'],
  ['21-entegrasyonlar', '/entegrasyonlar'],
  ['30-loglar', '/loglar'],
  ['31-denetim', '/denetim'],
  ['40-ayarlar', '/sistem/bayraklar'],
  ['41-uyarilar', '/bildirimler/uyarilar'],
]

test.skip(!process.env.BO_REVIEW, 'BO_REVIEW=1 ile koşar')
test.beforeEach(({}, info) => test.skip(info.project.name !== 'chromium-mobile', 'telefon'))
test.setTimeout(600_000)

const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

async function shot(page: Page, name: string, cfg: (typeof CONFIGS)[number]) {
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.v-skeleton-loader, [aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, `${name}-${cfg.theme}-${cfg.width}.png`), animations: 'disabled' })
}

for (const cfg of CONFIGS) {
  test(`bo-mob inceleme ${cfg.theme} ${cfg.width}`, async ({ browser }) => {
    mkdirSync(OUT, { recursive: true })
    const { context, page } = await phone(browser, cfg.width, cfg.theme)

    for (const [name, path] of SCREENS) {
      if (!want(name)) continue
      await spaGo(page, path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      await shot(page, name, cfg)
    }

    if (want('50-cekmece')) {
      await spaGo(page, '/genel-bakis')
      await page.getByRole('button', { name: 'Menüyü aç' }).click()
      await shot(page, '50-cekmece', cfg)
      await page.keyboard.press('Escape')
    }

    if (want('51-hesap')) {
      await page.getByTestId('account-menu').click()
      await shot(page, '51-hesap-menusu-tema', cfg)
      await page.keyboard.press('Escape')
    }

    if (want('52-log-suzgec')) {
      await spaGo(page, '/loglar')
      await expect(page.getByRole('search', { name: 'Log süzgeçleri' })).toBeVisible()
      await page.locator('[data-category="integration"]').click()
      await shot(page, '52-log-suzgec-acik', cfg)
    }

    if (want('53-diyalog')) {
      await spaGo(page, '/motor?sekme=basarisiz&gorunum=ayrinti')
      await page.getByTestId('retry').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await shot(page, '53-diyalog-yeniden-dene', cfg)
      await page.keyboard.press('Escape')
    }
    await context.close()
  })
}
