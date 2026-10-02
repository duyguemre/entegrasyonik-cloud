// PRC-CFG inceleme kareleri (docs/prc-cfg-review/) — yalnız BO_REVIEW=1 ile koşar; görsel taban DEĞİLDİR (tabanlar Windows'ta).
// cd frontend/backoffice && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 npx playwright test -c playwright.config.ts e2e/specs/review-prc-cfg.spec.ts --project=chromium-desktop
import { test, expect, type Page } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNT } from '../support/session'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'prc-cfg-review')
const CONFIGS = [
  { theme: 'light', width: 1440 },
  { theme: 'dark', width: 1440 },
  { theme: 'light', width: 820 },
  { theme: 'light', width: 390 },
] as const

test.skip(!process.env.BO_REVIEW, 'BO_REVIEW=1 ile koşar')
test.setTimeout(420_000)

type Cfg = (typeof CONFIGS)[number]
async function mock(page: Page, src: string) {
  await page.waitForFunction(() => Boolean((window as unknown as { __boMock?: unknown }).__boMock))
  return page.evaluate(`(${src})(window.__boMock)`)
}

async function shot(page: Page, name: string, cfg: Cfg, full = true) {
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.v-skeleton-loader, [aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(OUT, `${name}-${cfg.theme}-${cfg.width}.png`), fullPage: full, animations: 'disabled' })
}

async function openFromMenu(page: Page) {
  if (page.viewportSize()!.width < 960) await page.getByRole('button', { name: 'Menüyü aç' }).click()
  const nav = page.getByRole('navigation', { name: 'Yönetim ekranları' })
  const group = nav.getByRole('button', { name: /^Sistem ayarları(\s|$)/ })
  if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click()
  await nav.getByRole('button', { name: /^Rekabet ayarları/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Rekabet ayarları' })).toBeVisible()
  await page.waitForLoadState('networkidle')
}

for (const cfg of CONFIGS) {
  test(`prc-cfg inceleme ${cfg.theme} ${cfg.width}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.width > 600 ? 900 : 844 }, colorScheme: cfg.theme })
    const page = await ctx.newPage()
    await page.goto('/giris')
    await page.getByLabel('E-posta').fill(ACCOUNT.email)
    await page.getByLabel('Parola', { exact: true }).fill(ACCOUNT.password)
    await page.getByRole('button', { name: 'Devam et' }).click()
    await page.getByLabel('Doğrulama kodu').fill('123456')
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page).toHaveURL(/\/genel-bakis$/)

    // 10 — varsayılan: özellik kapalı, plan değerleri, iki örnek istisna
    await page.goto('/sistem/rekabet')
    await expect(page.getByRole('heading', { level: 1, name: 'Rekabet ayarları' })).toBeVisible()
    await shot(page, '10-genel-kapali', cfg)

    // 12 — plan tablosunda geçersiz değer (alanda hata, kayıt engelli)
    await page.getByTestId('plan-enterprise-skuCap').locator('input').fill('60000')
    await shot(page, '12-plan-gecersiz-deger', cfg)
    await page.getByTestId('plan-enterprise-skuCap').locator('input').fill('8000')
    await page.getByTestId('plan-starter-refreshMin').locator('input').fill('720')

    // 13 — yayın diyaloğu (fark + etki + gerekçe)
    await page.getByTestId('competition-save').click()
    const pub = page.getByRole('dialog', { name: 'Değişiklikler yayınlansın mı?' })
    await expect(pub).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, `13-yayin-diyalogu-${cfg.theme}-${cfg.width}.png`), animations: 'disabled' })
    await page.keyboard.press('Escape')
    await page.getByTestId('discard-draft').click()
    await page.getByRole('alertdialog', { name: 'Taslak atılsın mı?' }).getByRole('button', { name: 'Taslağı at' }).click()

    await page.getByRole('tab', { name: /Müşteri istisnaları/ }).click()
    // 20/21 — istisna ekle (numara → mevcut ayar → alanlar → gerekçe), sonra önce/sonra
    await page.getByTestId('override-add').click()
    const dlg = page.getByRole('dialog', { name: 'Müşteri istisnası ekle' })
    await dlg.getByTestId('override-tid').locator('input').fill('103')
    await dlg.getByTestId('override-lookup').click()
    await expect(dlg.getByTestId('override-current')).toBeVisible()
    await dlg.getByTestId('override-skuCap').locator('input').fill('300')
    await dlg.getByTestId('override-refreshMin').locator('input').fill('60')
    await dlg.getByTestId('override-note').locator('input').fill('Deneme müşterisi: kapsam genişletildi')
    await dlg.getByLabel('Gerekçe').fill('Pilot müşteri için kapsam genişletildi')
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(OUT, `20-istisna-diyalogu-${cfg.theme}-${cfg.width}.png`), animations: 'disabled' })
    await dlg.getByRole('button', { name: 'İstisnayı kaydet' }).click()
    await expect(page.getByTestId('override-result')).toBeVisible()
    await page.getByTestId('competition-overrides').scrollIntoViewIfNeeded()
    await shot(page, '21-istisna-sonuc', cfg)

    // 14 — tüm istisnalar kaldırılınca boş durum
    await mock(page, `async (m) => { for (const tid of [101, 103, 104]) m.handle('POST', '/admin-api/BackofficeBillingService/setCompetitionOverride', { tid, override: null, reason: 'Örnek temizlik gerekçesi' }) }`)
    await page.getByRole('button', { name: /^Yenile/ }).first().click()
    await expect(page.getByText('Henüz müşteri istisnası yok')).toBeVisible()
    await shot(page, '14-istisna-bos', cfg)

    // 11 — pilot açık + dikkat uyarıları (kurgu sonrası uygulama içinden yeniden açılır)
    await page.goto('/genel-bakis')
    await mock(page, '(m) => m.seedCompetitionPilot({ tenants: ["101", "102"], budget: 10, daysAgo: 30 })')
    await openFromMenu(page)
    await shot(page, '11-pilot-dikkat', cfg)

    // 30 — hata: istisna listesi okunamıyor
    await page.goto('/genel-bakis')
    await mock(page, `(m) => m.failOps('BackofficeBillingService/getCompetitionSettings')`)
    await openFromMenu(page)
    await page.getByRole('tab', { name: /Müşteri istisnaları/ }).click()
    await expect(page.getByText('Müşteri istisnaları yüklenemedi')).toBeVisible()
    await shot(page, '30-hata-istisna-listesi', cfg)

    // 40 — abonelik detayındaki bağlantı
    await page.goto('/abonelikler/103')
    await expect(page.getByTestId('competition-link')).toBeVisible()
    await shot(page, '40-abonelik-detay-baglanti', cfg, false)
    await ctx.close()
  })
}
