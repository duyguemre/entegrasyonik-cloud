// BO-R1b inceleme kareleri (docs/bo-r1b-review/) — yalnız BO_REVIEW=1 ile koşar; görsel taban DEĞİLDİR (tabanlar Windows'ta).
// İlk ekran (1440 × 900 / 390 × 844) kareleri: "hüküm + ilk dikkat maddesi + eylem ilk ekranda mı?" (§11.6 madde 6).
// cd frontend/backoffice && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 npx playwright test review-r1b.spec.ts --project=chromium-desktop
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNT } from '../support/session'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'bo-r1b-review')
const ONLY = (process.env.BO_REVIEW_ONLY || '').split(',').filter(Boolean)
const CONFIGS = (['light', 'dark'] as const).flatMap((theme) => [1440, 390].map((width) => ({ theme, width })))

const SCREENS: Array<[string, string]> = [
  ['10-musteriler', '/musteriler'],
  ['11-musteri-detay', '/musteriler/102'],
  ['12-abonelikler', '/abonelikler'],
  ['13-abonelik-detay', '/abonelikler/104'],
  ['20-motor', '/motor'],
  ['21-entegrasyonlar', '/entegrasyonlar'],
  ['22-altyapi', '/altyapi'],
  ['23-onbellek', '/altyapi/onbellek'],
  ['30-loglar', '/loglar'],
  ['31-denetim', '/denetim'],
  ['40-yoneticiler', '/yoneticiler'],
  ['41-ayarlar', '/sistem/bayraklar'],
  ['42-otopilot-ayar', '/sistem/otopilot'],
  ['43-otopilot', '/otopilot'],
  ['50-duyurular', '/sistem/duyurular'],
  ['51-teslimler', '/bildirimler/teslimler'],
  ['52-musteri-gecmisi', '/bildirimler/musteri-gecmisi?tid=102'],
  ['53-katalog', '/bildirimler/katalog'],
  ['54-uyarilar', '/bildirimler/uyarilar'],
]

test.skip(!process.env.BO_REVIEW, 'BO_REVIEW=1 ile koşar')
test.setTimeout(900_000)

const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

async function shot(page: Page, name: string, cfg: (typeof CONFIGS)[number]) {
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.v-skeleton-loader, [aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, `${name}-${cfg.theme}-${cfg.width}.png`), animations: 'disabled' })
}

for (const cfg of CONFIGS) {
  test(`bo-r1b inceleme ${cfg.theme} ${cfg.width}`, async ({ browser }) => {
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

    // Kısmi bozulma (Redis düşük): motor hükmü kırmızı + altyapıya yönlendirir. SPA içi gezinme (sahte durum yenilemede sıfırlanır).
    if (want('60-bozulma') && cfg.width > 600) {
      await page.goto('/genel-bakis')
      await page.waitForFunction(() => 'setDegraded' in ((window as unknown as { __boMock?: object }).__boMock ?? {}))
      await page.evaluate(() => (window as unknown as { __boMock: { setDegraded: (v: boolean) => void } }).__boMock.setDegraded(true))
      await page.keyboard.press('Control+k')
      await page.keyboard.type('Motor ve kuyruklar')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('heading', { level: 1, name: 'Motor ve kuyruklar' })).toBeVisible()
      await shot(page, '60-bozulma-motor', cfg)
    }

    // Komut paleti "Bu ekranda" (NT-01).
    if (want('70-palet') && cfg.width > 600) {
      await page.goto('/musteriler/102')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      await page.waitForLoadState('networkidle')
      await page.keyboard.press('Control+k')
      await expect(page.getByRole('combobox')).toBeFocused()
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(OUT, `70-palet-bu-ekranda-${cfg.theme}-${cfg.width}.png`), animations: 'disabled' })
      await page.keyboard.press('Escape')
    }

    // Üretimde yıkıcı işlem: hedef kimliği yazdırma (NT-02).
    if (want('71-uretim') && cfg.width > 600) {
      await page.goto('/motor?sekme=basarisiz&env=production')
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: /sil/i }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(OUT, `71-uretim-kimlik-yazdir-${cfg.theme}-${cfg.width}.png`), animations: 'disabled' })
    }
    await ctx.close()
  })
}
