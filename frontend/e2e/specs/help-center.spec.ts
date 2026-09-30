// faz3-fe-help — Yardım merkezi + bağlamsal yardım.
//   İddialar: yardım merkezi (ana sayfa, arama + vurgu, makale, geri/ileri), "Buraya git", sol menü / üst bar Yardım menüsü /
//   Ctrl+K girişleri, "Sayfa hakkında" paneli tek kayıttan + "Yardım merkezinde oku", (?) ipucu klavyeyle, boş durumda
//   "Nasıl başlanır?", isteğe bağlı tur (teklif, adımlar, Esc, tercih hatırlanır), axe AA = 0.
//   İnceleme görüntüleri (günlük koşuda ATLANIR):
//     HELP_REVIEW=1 HELP_REVIEW_WIDTH=1440|390 npx playwright test e2e/specs/help-center.spec.ts -g inceleme --project=chromium-desktop
//   → docs/help-review/<ad>-<genişlik>.png. Veri sentetik fixture (PII yok).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { reviewMocks } from '../fixtures/reviewScreens'
import { waitForWorkplaceReady } from '../fixtures/nav'
import { ordersBosFixture } from '../fixtures/apiData'

const AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function openHelp(page: Page, query = '', extra: Record<string, unknown> = {}) {
  await installApiMocks(page, reviewMocks(extra))
  await page.goto(`/help${query}`)
  await waitForWorkplaceReady(page)
  await expect(page.locator('.workplace-area .helpCenterView')).toBeVisible({ timeout: 15000 })
}

const center = (page: Page) => page.locator('.workplace-area .helpCenterView')

test.describe('Yardım merkezi', () => {
  test('ana sayfa: arama, kategoriler, Başlarken; axe 0', async ({ page }) => {
    await openHelp(page)
    const c = center(page)
    await expect(c.getByRole('heading', { level: 1, name: 'Yardım merkezi' })).toBeVisible()
    await expect(c.getByRole('heading', { name: 'Size nasıl yardımcı olabiliriz?' })).toBeVisible()
    await expect(c.getByRole('heading', { name: 'Başlarken' })).toBeVisible()
    await expect(c.locator('[data-category]')).toHaveCount(11)
    await expect(page).toHaveURL(/\/help$/)
    const axe = await new AxeBuilder({ page }).withTags(AA).include('.workplace-area .helpCenterView').analyze()
    expect(axe.violations).toEqual([])
  })

  test('arama: Türkçe katlama + vurgu; Enter ilk makaleyi açar; tarayıcı geri aramadan önceki sayfaya döner', async ({ page }) => {
    await openHelp(page)
    const c = center(page)
    const field = c.getByRole('textbox', { name: /Yardımda ara/ })
    await field.fill('guvenlik stogu')
    await expect(c.locator('[data-help-result]').first()).toBeVisible()
    await expect(c.locator('[data-help-result] mark').first()).toBeVisible()
    await expect(page.locator('#ek-help-results-status')).toContainText('makale bulundu')
    const firstTitle = (await c.locator('[data-help-result] .ek-help-center__result-title').first().innerText()).trim()
    await field.press('Enter')
    await expect(c.getByRole('heading', { level: 2, name: firstTitle })).toBeVisible()
    await expect(page).toHaveURL(/\/help\?article=/)
    const axe = await new AxeBuilder({ page }).withTags(AA).include('.workplace-area .helpCenterView').analyze()
    expect(axe.violations).toEqual([])
    await page.goBack()
    await expect(page).toHaveURL(/\/help$/)
    await expect(c.getByRole('heading', { name: 'Başlarken' })).toBeVisible()
  })

  test('sonuç yoksa dürüst boş durum + destek', async ({ page }) => {
    await openHelp(page)
    const c = center(page)
    await c.getByRole('textbox', { name: /Yardımda ara/ }).fill('zzqqxx')
    await expect(c.getByText('“zzqqxx” için makale bulunamadı')).toBeVisible()
    await c.getByRole('button', { name: 'Destek talebi aç' }).click()
    await expect(page.getByRole('dialog').first()).toBeVisible()
  })

  test('makale: kısayol tablosu kayıt defterinden; faydalı mıydı yerel; ilgili makaleler; Buraya git sekmeyi açar', async ({ page }) => {
    await openHelp(page, '?article=app-shortcuts')
    const c = center(page)
    await expect(c.locator('[data-help-auto="shortcuts"] [data-shortcut-row]')).toHaveCount(10)
    await c.getByRole('button', { name: 'Evet' }).click()
    await expect(c.getByRole('button', { name: 'Evet' })).toHaveAttribute('aria-pressed', 'true')
    await expect(c.getByText('Geri bildiriminiz bu cihazda kaydedildi')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('ek.help.v1.feedback'))).toContain('app-shortcuts')

    await page.goto('/help?article=ord-lifecycle')
    await expect(c.getByRole('heading', { level: 2 })).toBeVisible()
    const go = c.locator('[data-help-goto][data-screen="OrderListView"]')
    await expect(go).toBeVisible()
    await go.click()
    await expect(page).toHaveURL(/\/orders/)
    await expect(page.locator('.workplace-area .orderListView')).toBeVisible()
  })

  test('bilinmeyen makale bağlantısı → "Makale bulunamadı"', async ({ page }) => {
    await openHelp(page, '?article=yok-boyle-bir-makale')
    await expect(center(page).getByText('Makale bulunamadı')).toBeVisible()
  })
})

test.describe('Yardım girişleri (kabuk)', () => {
  test('sol menüde "Yardım merkezi"; üst bar Yardım menüsü; Ctrl+K yardım makaleleri', async ({ page }) => {
    await installApiMocks(page, reviewMocks())
    await page.goto('/dashboard')
    await waitForWorkplaceReady(page)

    // Üst bar yardım menüsü
    await page.locator('[data-header-action=help]').click()
    const menu = page.getByRole('menu', { name: 'Yardım' })
    await expect(menu.getByRole('menuitem', { name: /Yardım merkezi/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Uygulama turunu başlat/ })).toBeVisible()
    await menu.getByRole('menuitem', { name: /Yardım merkezi/ }).click()
    await expect(page).toHaveURL(/\/help$/)
    await expect(center(page)).toBeVisible()

    // Ctrl+K → yardım makaleleri grubu
    await page.keyboard.press('Control+k')
    await page.keyboard.type('iade')
    const listbox = page.getByRole('listbox')
    await expect(listbox.getByText('Yardım makaleleri')).toBeVisible()
    await listbox.getByRole('option').filter({ hasText: 'YARDIM' }).first().click()
    await expect(page).toHaveURL(/\/help\?article=/)
  })

  test('sol menüde Yardım bölümü (masaüstü)', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'sol menü yalnız masaüstünde kalıcı')
    await installApiMocks(page, reviewMocks())
    await page.goto('/dashboard')
    await waitForWorkplaceReady(page)
    const nav = page.locator('.soft-nav')
    await nav.getByRole('button', { name: 'Yardım merkezi' }).click()
    await expect(page).toHaveURL(/\/help$/)
  })
})

test.describe('Bağlamsal yardım', () => {
  test('"Sayfa hakkında" kayıttan dolu; "Yardım merkezinde oku" makaleyi açar', async ({ page }) => {
    await installApiMocks(page, reviewMocks())
    await page.goto('/catalog/stock-policy')
    await waitForWorkplaceReady(page)
    const area = page.locator('.workplace-area .stockPolicyView')
    await area.getByRole('button', { name: /^Sayfa hakkında/ }).click()
    const region = area.getByRole('region', { name: /sayfası hakkında/ })
    await expect(region.locator('.ek-page-bar__tips li')).not.toHaveCount(0)
    await region.getByRole('button', { name: 'Yardım merkezinde oku' }).click()
    await expect(page).toHaveURL(/\/help\?article=stock-channel-policy/)
  })

  test('(?) ipucu klavyeyle açılır, Esc kapatır, odak düğmeye döner; axe 0', async ({ page }) => {
    await installApiMocks(page, reviewMocks())
    await page.goto('/catalog/stock-policy')
    await waitForWorkplaceReady(page)
    const hint = page.locator('.workplace-area [data-hint-id="stock.safetyStock"]')
    await expect(hint).toBeVisible()
    await hint.focus()
    await page.keyboard.press('Enter')
    const panel = page.getByRole('dialog', { name: 'Tampon (güvenlik stoğu)' })
    await expect(panel).toBeVisible()
    await expect(hint).toHaveAttribute('aria-expanded', 'true')
    const axe = await new AxeBuilder({ page }).withTags(AA).include('.ek-help-hint__panel').analyze()
    expect(axe.violations).toEqual([])
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(hint).toBeFocused()
  })

  test('boş listede "Nasıl başlanır?" ilgili makaleyi açar', async ({ page }) => {
    await installApiMocks(page, reviewMocks({ 'OrderService/getOrders': ordersBosFixture }))
    await page.goto('/orders')
    await waitForWorkplaceReady(page)
    const start = page.locator('.workplace-area .orderListView [data-help-start]')
    await expect(start).toBeVisible()
    await start.click()
    await expect(page).toHaveURL(/\/help\?article=gs-first-integration/)
  })
})

test.describe('Uygulama turu', () => {
  async function optIn(page: Page) {
    await page.addInitScript(() => {
      window.sessionStorage.setItem('ek.e2e.tourOptIn', '1')
      if (!window.sessionStorage.getItem('ek.e2e.tourCleared')) {
        window.localStorage.removeItem('ek.help.v1.tour')
        window.sessionStorage.setItem('ek.e2e.tourCleared', '1')
      }
    })
  }

  test('ilk girişte teklif; adımlar; Esc kapatır; tercih hatırlanır; menüden yeniden başlar', async ({ page }) => {
    await optIn(page)
    await installApiMocks(page, reviewMocks())
    await page.goto('/dashboard')
    await waitForWorkplaceReady(page)
    const offer = page.locator('[data-help-tour-offer]')
    await expect(offer).toBeVisible({ timeout: 5000 })
    const axe = await new AxeBuilder({ page }).withTags(AA).include('[data-help-tour-offer]').analyze()
    expect(axe.violations).toEqual([])
    await offer.getByRole('button', { name: 'Turu başlat' }).click()
    const card = page.locator('[data-help-tour-card]')
    await expect(card).toBeVisible()
    await expect(card).toBeFocused()
    await expect(card.locator('.ek-tour__count')).toContainText('1 /')
    await page.keyboard.press('ArrowRight')
    await expect(card.locator('.ek-tour__count')).toContainText('2 /')
    await page.keyboard.press('Escape')
    await expect(card).toBeHidden()
    expect(await page.evaluate(() => localStorage.getItem('ek.help.v1.tour'))).toBe('dismissed')

    await page.reload()
    await waitForWorkplaceReady(page)
    await page.waitForTimeout(1500)
    await expect(offer).toBeHidden()

    await page.locator('[data-header-action=help]').click()
    await page.getByRole('menu', { name: 'Yardım' }).getByRole('menuitem', { name: /Uygulama turunu başlat/ }).click()
    await expect(card).toBeVisible()
    // Son adıma kadar ilerle → Bitti
    for (let i = 0; i < 8; i++) {
      const done = card.locator('[data-tour-done]')
      if (await done.isVisible()) break
      await card.locator('[data-tour-next]').click()
    }
    await card.locator('[data-tour-done]').click()
    expect(await page.evaluate(() => localStorage.getItem('ek.help.v1.tour'))).toBe('done')
  })
})

// ---- İnceleme görüntüleri (HELP_REVIEW=1) ----
const REVIEW = process.env.HELP_REVIEW === '1'
const WIDTH = Number(process.env.HELP_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.HELP_REVIEW_OUT || 'docs/help-review'
const shot = (name: string) => `${OUT}/${name}-${WIDTH}.png`

test.describe('inceleme', () => {
  test.skip(!REVIEW, 'yalnız HELP_REVIEW=1')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })

  async function settle(page: Page) {
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(500)
  }

  test('inceleme: yardım merkezi', async ({ page }) => {
    await openHelp(page)
    await settle(page)
    await page.screenshot({ path: shot('01-merkez-ana') })
    await page.screenshot({ path: shot('01-merkez-ana-tam'), fullPage: true })
    await center(page).getByRole('textbox', { name: /Yardımda ara/ }).fill('sipariş gelmedi')
    await settle(page)
    await page.screenshot({ path: shot('02-merkez-arama') })
    await page.goto('/help?article=gs-first-integration')
    await settle(page)
    await page.screenshot({ path: shot('03-makale-ilk-entegrasyon') })
    await page.goto('/help?article=int-channel-connect')
    await settle(page)
    await page.screenshot({ path: shot('04-makale-kanal-rehberi'), fullPage: true })
    await page.goto('/help?article=int-errors')
    await settle(page)
    await page.screenshot({ path: shot('05-makale-entegrasyon-hatalari'), fullPage: true })
    await page.goto('/help?article=app-shortcuts')
    await settle(page)
    await page.screenshot({ path: shot('06-makale-kisayollar'), fullPage: true })
    await page.goto('/help?category=stock')
    await settle(page)
    await page.screenshot({ path: shot('07-kategori-stok') })
  })

  test('inceleme: bağlamsal yardım', async ({ page }) => {
    await installApiMocks(page, reviewMocks())
    await page.goto('/catalog/stock-policy')
    await waitForWorkplaceReady(page)
    await page.locator('.workplace-area .stockPolicyView').getByRole('button', { name: /^Sayfa hakkında/ }).click()
    await settle(page)
    await page.screenshot({ path: shot('10-baglamsal-sayfa-hakkinda-stok-politikasi') })
    await page.locator('.workplace-area .stockPolicyView').getByRole('button', { name: /^Sayfa hakkında/ }).click()
    await page.locator('.workplace-area [data-hint-id="stock.safetyStock"]').click()
    await settle(page)
    await page.screenshot({ path: shot('11-baglamsal-ipucu-tampon') })

    await page.goto('/integrations/marketplace')
    await waitForWorkplaceReady(page)
    await page.waitForLoadState('networkidle').catch(() => undefined)
    const hint = page.locator('.workplace-area [data-hint-id^="integration.credentials."]').first()
    if (await hint.isVisible().catch(() => false)) {
      await hint.click()
      await settle(page)
      await page.screenshot({ path: shot('12-baglamsal-ipucu-kimlik-bilgisi') })
    }

    await installApiMocks(page, reviewMocks({ 'OrderService/getOrders': ordersBosFixture }))
    await page.goto('/orders')
    await waitForWorkplaceReady(page)
    await settle(page)
    await page.screenshot({ path: shot('13-baglamsal-bos-durum-nasil-baslanir') })
  })

  test('inceleme: tur ve yardım menüsü', async ({ page }) => {
    await page.addInitScript(() => window.sessionStorage.setItem('ek.e2e.tourOptIn', '1'))
    await installApiMocks(page, reviewMocks())
    await page.addInitScript(() => window.localStorage.removeItem('ek.help.v1.tour'))
    await page.goto('/dashboard')
    await waitForWorkplaceReady(page)
    await expect(page.locator('[data-help-tour-offer]')).toBeVisible({ timeout: 5000 })
    await settle(page)
    await page.screenshot({ path: shot('20-tur-teklif') })
    await page.locator('[data-help-tour-offer]').getByRole('button', { name: 'Turu başlat' }).click()
    await settle(page)
    await page.screenshot({ path: shot('21-tur-adim-1') })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await settle(page)
    await page.screenshot({ path: shot('22-tur-adim-3') })
    await page.keyboard.press('Escape')
    const help = page.locator('[data-header-action=help]')
    await (await help.isVisible() ? help : page.locator('[data-header-action=account]')).click()
    await settle(page)
    await page.screenshot({ path: shot('23-ust-bar-yardim-menusu') })
  })
})
