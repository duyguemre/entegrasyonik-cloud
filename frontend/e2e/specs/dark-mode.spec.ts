// FR2-DARK (madde 10) — karanlık mod davranışı: kullanıcı menüsündeki tema seçici (Açık / Koyu / Sistem), kalıcı tercih,
// ilk boyamada yanıp sönme yok (theme-boot.js <body>'den önce), sistem tercihinin canlı izlenmesi ve iki temada axe 0.
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { openReviewScreen } from '../fixtures/reviewScreens'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/** `<body>` ilk eklendiği anda (uygulama modülü çalışmadan önce) `<html data-theme>` değerini kaydeder. */
async function recordFirstPaintTheme(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __ekFirstTheme?: string | null }
    const record = () => {
      if (w.__ekFirstTheme === undefined && document.body) w.__ekFirstTheme = document.documentElement.getAttribute('data-theme')
    }
    new MutationObserver(record).observe(document, { childList: true, subtree: true })
  })
}

const htmlTheme = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme)
/** Vuetify etkin teması: tema sınıfı taşıyan öğelerin tamamı koyu mu (açık tema sınıfı kalmamış). */
const vuetifyIsDark = async (page: Page) =>
  (await page.locator('.v-theme--darkTheme').count()) > 0 && (await page.locator('.v-theme--lightTheme').count()) === 0

async function openAccountMenu(page: Page) {
  await page.locator('[data-header-action=account]').first().click()
  await expect(page.getByTestId('theme-switch')).toBeVisible()
  // Menü açılış geçişi bitene kadar (yarı saydam karede kontrast ölçülmez).
  await expect
    .poll(() => page.locator('.v-overlay__content:has(.ek-shell-account)').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1')
  await page.waitForTimeout(150)
}

async function expectNoAxeViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags(AXE_TAGS)
  if (include) builder.include(include)
  const results = await builder.analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

test.describe('karanlık mod', () => {
  test.use({ colorScheme: 'light' })

  test('menüden Koyu seçilir, kalıcıdır ve yeniden yüklemede ilk karede koyu gelir', async ({ page }) => {
    await openReviewScreen(page, 'CustomerListView')
    expect(await htmlTheme(page)).toBe('light')
    await openAccountMenu(page)
    const dark = page.getByRole('radio', { name: 'Koyu' })
    await expect(page.getByRole('radio', { name: 'Sistem' })).toHaveAttribute('aria-checked', 'true')
    await dark.click()
    await expect(dark).toHaveAttribute('aria-checked', 'true')
    expect(await htmlTheme(page)).toBe('dark')
    expect(await vuetifyIsDark(page)).toBe(true)
    expect(await page.evaluate(() => localStorage.getItem('ek-theme'))).toBe('dark')

    await recordFirstPaintTheme(page)
    await page.reload()
    await expect(page.locator('[data-header-action=account]').first()).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __ekFirstTheme?: string }).__ekFirstTheme)).toBe('dark')
    expect(await vuetifyIsDark(page)).toBe(true)
  })

  test('Sistem: işletim sistemi tercihini canlı izler; Açık seçimi sistemi geçersiz kılar', async ({ page }) => {
    await openReviewScreen(page, 'CustomerListView')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(() => htmlTheme(page)).toBe('dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(() => htmlTheme(page)).toBe('light')

    await openAccountMenu(page)
    await page.getByRole('radio', { name: 'Açık' }).click()
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(200)
    expect(await htmlTheme(page)).toBe('light')
  })

  test('seçici klavyeyle kullanılır (ok tuşları seçer, tek sekme durağı)', async ({ page }) => {
    await openReviewScreen(page, 'CustomerListView')
    await openAccountMenu(page)
    const system = page.getByRole('radio', { name: 'Sistem' })
    await system.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('radio', { name: 'Koyu' })).toBeFocused()
    await expect(page.getByRole('radio', { name: 'Koyu' })).toHaveAttribute('aria-checked', 'true')
    expect(await htmlTheme(page)).toBe('dark')
    await expect(page.locator('[data-theme-option][tabindex="0"]')).toHaveCount(1)
  })

  test('giriş ekranı kayıtlı koyu tercihle ilk karede koyu açılır', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ek-theme', 'dark'))
    await recordFirstPaintTheme(page)
    await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Giriş', exact: true })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __ekFirstTheme?: string }).__ekFirstTheme)).toBe('dark')
    expect(await vuetifyIsDark(page)).toBe(true)
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`axe 0 — ${theme}: kabuk + liste, hesap menüsü açık`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript((t) => localStorage.setItem('ek-theme', t), theme)
      await openReviewScreen(page, 'CustomerListView')
      await expectNoAxeViolations(page)
      await openAccountMenu(page)
      await expectNoAxeViolations(page, '.ek-shell-account')
    })

    test(`axe 0 — ${theme}: gösterge paneli (grafikler)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript((t) => localStorage.setItem('ek-theme', t), theme)
      await openReviewScreen(page, 'DashboardView')
      await expectNoAxeViolations(page, '.workplace-area')
    })

    test(`axe 0 — ${theme}: giriş ekranı`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme })
      await page.addInitScript((t) => localStorage.setItem('ek-theme', t), theme)
      await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
      await page.goto('/login')
      await expect(page.getByRole('button', { name: 'Giriş', exact: true })).toBeVisible()
      await expectNoAxeViolations(page)
    })
  }
})
