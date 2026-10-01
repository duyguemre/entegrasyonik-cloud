// bo-next inceleme kareleri (docs/bo-next-review/) — yalnız BO_REVIEW=1 ile koşar; görsel taban DEĞİLDİR (tabanlar Windows'ta).
// cd frontend/backoffice && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 npx playwright test e2e/specs/review-next.spec.ts --project=chromium-desktop
import { test, expect, type Page } from '@playwright/test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ACCOUNT } from '../support/session'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'bo-next-review')
const CONFIGS = [
  { theme: 'light', width: 1440 },
  { theme: 'dark', width: 1440 },
  { theme: 'light', width: 390 },
  { theme: 'dark', width: 390 },
] as const
type Cfg = (typeof CONFIGS)[number]

test.skip(!process.env.BO_REVIEW, 'BO_REVIEW=1 ile koşar')
test.setTimeout(420_000)

async function settleShot(page: Page, name: string, cfg: Cfg, fullPage = true) {
  // Sandbox iframe (e-posta önizlemesi) varken koyu temada networkidle tetiklenmeyebiliyor; sahte API'de ağ yok → süre sınırlı.
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined)
  await expect(page.locator('.v-skeleton-loader, [aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 }).catch(() => undefined)
  await page.waitForTimeout(600)
  await page.screenshot({ path: join(OUT, `${name}-${cfg.theme}-${cfg.width}.png`), fullPage, animations: 'disabled' })
}
async function dialogShot(page: Page, name: string, cfg: Cfg) {
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: join(OUT, `${name}-${cfg.theme}-${cfg.width}.png`), animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

for (const cfg of CONFIGS) {
  test(`bo-next inceleme ${cfg.theme} ${cfg.width}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.width > 600 ? 900 : 844 }, colorScheme: cfg.theme })
    const page = await ctx.newPage()
    await page.goto('/giris')
    await page.getByLabel('E-posta').fill(ACCOUNT.email)
    await page.getByLabel('Parola', { exact: true }).fill(ACCOUNT.password)
    await page.getByRole('button', { name: 'Devam et' }).click()
    await page.getByLabel('Doğrulama kodu').fill('123456')
    await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
    await expect(page).toHaveURL(/\/genel-bakis$/)

    // ---- Bildirimler ve duyurular
    await page.goto('/sistem/duyurular')
    await expect(page.getByRole('heading', { level: 1, name: 'Duyurular' })).toBeVisible()
    await settleShot(page, '10-duyurular', cfg)
    await page.getByRole('link', { name: 'Planlı bakım: veritabanı güncellemesi' }).click()
    await expect(page.getByTestId('ann-status')).toBeVisible()
    await settleShot(page, '11-duyuru-detay-zamanlanmis', cfg)
    await page.getByRole('tab', { name: 'E-posta' }).click()
    await settleShot(page, '12-duyuru-detay-eposta-onizleme', cfg)

    await page.goto('/sistem/duyurular')
    await page.getByRole('link', { name: 'Yeni: toplu fiyat güncelleme' }).click()
    await expect(page.getByTestId('schedule')).toBeVisible()
    await settleShot(page, '13-duyuru-taslak', cfg)
    await page.getByTestId('schedule').click()
    await dialogShot(page, '14-diyalog-zamanla', cfg)

    await page.goto('/sistem/duyurular/yeni')
    await page.locator('[data-kind="maintenance"]').click()
    await page.getByTestId('title-tr').locator('input').fill('Planlı bakım: arama altyapısı')
    await page.getByTestId('body-tr').locator('textarea').first().fill('Bakım süresince ürün araması yavaşlayabilir; siparişler etkilenmez.')
    await page.locator('[data-target="plans"]').click()
    await page.getByRole('checkbox', { name: 'Büyüme' }).check()
    await expect(page.getByTestId('banner-preview')).toContainText('Planlı bakım: arama altyapısı')
    await settleShot(page, '15-duyuru-olustur', cfg)

    await page.goto('/bildirimler/teslimler')
    await expect(page.getByTestId('delivery-kpis')).toBeVisible()
    await settleShot(page, '20-teslim-gunlugu', cfg)
    await page.goto('/bildirimler/teslimler?durum=dead')
    await page.getByTestId('retry').first().click()
    await dialogShot(page, '21-diyalog-teslim-yeniden-dene', cfg)

    await page.goto('/bildirimler/musteri-gecmisi?tid=101')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await settleShot(page, '30-musteri-bildirim-gecmisi', cfg)
    await page.goto('/bildirimler/musteri-gecmisi')
    await settleShot(page, '31-musteri-bildirim-gecmisi-bos', cfg)

    await page.goto('/bildirimler/katalog')
    await page.locator('[data-code="ORDER_SYNC_FAILED"]').click()
    await expect(page.getByTestId('template-preview')).toBeVisible()
    await settleShot(page, '40-katalog-uygulama-ici', cfg)
    await page.locator('[data-channel="email"]').click()
    await settleShot(page, '41-katalog-eposta', cfg)
    await page.getByTestId('test-email').click()
    await dialogShot(page, '42-diyalog-test-epostasi', cfg)

    await page.goto('/bildirimler/uyarilar')
    await expect(page.getByRole('heading', { level: 1, name: 'Platform uyarıları' })).toBeVisible()
    await settleShot(page, '50-uyarilar', cfg)
    await page.getByTestId('mute').first().click()
    await dialogShot(page, '51-diyalog-sustur', cfg)

    // ---- K40 abonelik, K41 destek oturumu
    await page.goto('/abonelikler/103')
    await expect(page.getByTestId('extension-usage')).toBeVisible()
    await settleShot(page, '60-abonelik-uzatma-hakki', cfg)
    await page.getByTestId('extend-trial').click()
    await dialogShot(page, '61-diyalog-deneme-uzat', cfg)
    await page.getByTestId('cancel-sub').click()
    await dialogShot(page, '62-diyalog-kartsiz-iptal', cfg)
    await page.goto('/abonelikler/109')
    await expect(page.getByTestId('extend-trial')).toBeVisible()
    await settleShot(page, '63-abonelik-askida-yeniden-ac', cfg)
    await page.goto('/musteriler/101')
    await expect(page.getByTestId('imp-session-chip')).toBeVisible()
    await settleShot(page, '70-musteri-destek-oturumu', cfg)
    await page.getByTestId('impersonate').click()
    await dialogShot(page, '71-diyalog-destek-oturumu', cfg)
    await ctx.close()
  })

  // ---- Otopilot (CHAT-FE-3): yeni bağlamda mock bayrağıyla
  test(`bo-next inceleme otopilot ${cfg.theme} ${cfg.width}`, async ({ browser }) => {
    for (const [config, steps] of [
      ['enabled', 'chat'],
      ['setup-required', 'setup'],
    ] as const) {
      const ctx = await browser.newContext({ viewport: { width: cfg.width, height: cfg.width > 600 ? 900 : 844 }, colorScheme: cfg.theme })
      const page = await ctx.newPage()
      await page.addInitScript((c) => {
        ;(window as unknown as { __BO_CHAT_MOCK__: unknown }).__BO_CHAT_MOCK__ = { config: c, speed: 0 }
      }, config)
      await page.goto('/giris')
      await page.getByLabel('E-posta').fill(ACCOUNT.email)
      await page.getByLabel('Parola', { exact: true }).fill(ACCOUNT.password)
      await page.getByRole('button', { name: 'Devam et' }).click()
      await page.getByLabel('Doğrulama kodu').fill('123456')
      await page.getByRole('button', { name: 'Doğrula', exact: true }).click()
      await expect(page).toHaveURL(/\/genel-bakis$/)
      if (steps === 'chat') {
        await page.getByTestId('otopilot-launcher').click()
        const box = page.getByRole('textbox', { name: "Otopilot'a mesaj" })
        await expect(box).toBeVisible()
        await settleShot(page, '80-otopilot-bos', cfg, false)
        await box.fill('onay bekleyen siparişler')
        await box.press('Enter')
        await expect(page.locator('.ek-chat-table')).toBeVisible()
        await settleShot(page, '81-otopilot-tablo', cfg, false)
        await box.fill('satış özeti')
        await box.press('Enter')
        await expect(page.locator('.ek-chat-kpi')).toBeVisible()
        await settleShot(page, '82-otopilot-kpi', cfg, false)
        if (cfg.width > 600) {
          await page.getByRole('button', { name: 'Tam sayfada aç' }).click()
          await expect(page).toHaveURL(/\/otopilot$/)
          await settleShot(page, '83-otopilot-tam-sayfa', cfg, false)
        }
      } else {
        await page.goto('/sistem/otopilot')
        await expect(page.getByLabel('API anahtarı')).toBeVisible()
        await settleShot(page, '84-otopilot-platform-anahtari', cfg)
      }
      await ctx.close()
    }
  })
}
