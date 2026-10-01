// MOB-06: backoffice telefon denetimi (360 ve 430 px). Yalnız chromium-mobile projesinde koşar; görsel taban YOK
// (inceleme kareleri: mobile-review.spec.ts → docs/bo-mob-review/).
import { expect, test } from '@playwright/test'
import { expectNoA11yViolations, settle } from '../support/session'
import { horizontalOverflow, phone, smallTargets, spaGo } from '../support/mobile'

// Durum → Karar → Eylem: dikkat/nabız, müşteri, destek, loglar/denetim, ayarlar + bildirim ve platform ekranları.
const ROUTES = [
  '/genel-bakis',
  '/musteriler',
  '/musteriler/102',
  '/musteriler/destek',
  '/abonelikler',
  '/abonelikler/102',
  '/motor',
  '/motor?sekme=basarisiz',
  '/entegrasyonlar',
  '/altyapi',
  '/altyapi/onbellek',
  '/loglar',
  '/denetim',
  '/yoneticiler',
  '/sistem/bayraklar',
  '/sistem/otopilot',
  '/sistem/duyurular',
  '/bildirimler/teslimler',
  '/bildirimler/musteri-gecmisi',
  '/bildirimler/katalog',
  '/bildirimler/uyarilar',
]

test.beforeEach(({}, info) => test.skip(info.project.name !== 'chromium-mobile', 'telefon denetimi'))
test.setTimeout(240_000)

for (const width of [360, 430]) {
  test(`${width} px: tüm ekranlarda yatay kaydırma yok, dokunma hedefleri ≥ 44 px`, async ({ browser }) => {
    const { context, page } = await phone(browser, width)
    const problems: string[] = []
    for (const path of ROUTES) {
      await spaGo(page, path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await settle(page)
      const overflow = await horizontalOverflow(page)
      if (overflow > 1) problems.push(`${path}: ${overflow} px yatay taşma`)
      for (const t of await smallTargets(page)) problems.push(`${path}: ${t}`)
    }
    expect(problems).toEqual([])
    await context.close()
  })
}

test('çekmece menüsü: öğeler ≥ 44 px, ekran seçilince kapanır', async ({ browser }) => {
  const { context, page } = await phone(browser, 360)
  await page.getByRole('button', { name: 'Menüyü aç' }).click()
  const nav = page.getByRole('navigation', { name: 'Yönetim ekranları' })
  await expect(nav).toBeVisible()
  expect(await smallTargets(page)).toEqual([])
  await nav.getByRole('button', { name: /^Denetim/ }).click()
  await expect(page).toHaveURL(/\/denetim$/)
  await expect(page.getByRole('button', { name: 'Menüyü aç' })).toHaveAttribute('aria-expanded', 'false')
  await context.close()
})

test('üst bar < 600 px: tema hesap menüsünde, bar 360 px\'e sığar; üretimde etiketli rozet görünür', async ({ browser }) => {
  const { context, page } = await phone(browser, 360)
  await expect(page.getByTestId('theme-menu')).toHaveCount(0)
  await page.getByTestId('account-menu').click()
  await page.locator('[data-theme-option="dark"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.keyboard.press('Escape')
  const bar = await page.locator('.bo-top').evaluate((e) => e.scrollWidth - e.clientWidth)
  expect(bar).toBeLessThanOrEqual(0)
  await context.close()

  // Üretim önizlemesi (dev `?env=`): etiket görünür, marka işareti yer açar, bar taşmaz.
  const prod = await phone(browser, 360)
  await prod.page.goto('/genel-bakis?env=production')
  await expect(prod.page.getByTestId('env-badge')).toContainText('Üretim')
  await expect(prod.page.locator('.bo-top__brand')).toBeHidden()
  expect(await prod.page.locator('.bo-top').evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0)
  await prod.context.close()
})

test('log merkezi: telefonda süzgeç çubuğu tek sütun, sayfa yatay kaymaz, tek temizle düğmesi', async ({ browser }) => {
  const { context, page } = await phone(browser, 390)
  await spaGo(page, '/loglar')
  await settle(page)
  await expect(page.getByTestId('page-verdict')).toBeVisible()
  const bar = page.getByRole('search', { name: 'Log süzgeçleri' })
  await expect(bar).toBeVisible()
  await expect(page.getByTestId('filters-clear')).toHaveCount(0)
  await page.locator('[data-category="integration"]').click()
  await expect(bar).toContainText('1 süzgeç etkin')
  await expect(page.getByTestId('filters-clear')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  await context.close()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`axe 0 (390 px, ${scheme}): genel bakış, müşteri listesi/detay, loglar, denetim, ayarlar`, async ({ browser }) => {
    const { context, page } = await phone(browser, 390, scheme)
    for (const path of ['/genel-bakis', '/musteriler', '/musteriler/102', '/loglar', '/denetim', '/sistem/bayraklar']) {
      await spaGo(page, path)
      await settle(page)
      await expectNoA11yViolations(page)
    }
    await context.close()
  })
}
