// FR2-SHELL + FR2-HELP (fe-r2a) — önce/sonra inceleme görüntüleri. İddia yok; yalnız inceleme karesi üretir.
// Günlük koşuda ATLANIR:
//   R2A_REVIEW=1 R2A_WIDTH=1440 R2A_OUT=docs/fe-r2a-review/once \
//     npx playwright test -c playwright.cloud.config.ts e2e/specs/fe-r2a-review.spec.ts --project=chromium-desktop
// Menü: üretimdeki ağacın biçimi (Ayarlar grubu altında "Uygulama Ayarları", destek altında "Eğitim Merkezi") —
// FR2-SHELL madde 7/8 bu biçimde görülür. Sentetik veri (PII yok).
import { test, type Page } from '@playwright/test'
import { openReviewScreen, reviewMocks, reviewMenuFixture } from '../fixtures/reviewScreens'
import { installApiMocks } from '../fixtures/mockApi'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.R2A_REVIEW === '1'
const WIDTH = Number(process.env.R2A_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.R2A_OUT || 'docs/fe-r2a-review/sonra'
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${OUT}/${name}-${WIDTH}.png`, fullPage })

/** Üretim biçimli menü: inceleme ağacı + iç içe Ayarlar grubu + destek grubu (Eğitim Merkezi dahil). */
export function productionLikeMenu() {
  const base = reviewMenuFixture().filter((g) => g.group !== 'settings')
  return [
    ...base.slice(0, 5),
    {
      group: 'settings',
      links: [
        {
          code: 'settings', parent: '', title: 'settings', icon: 'mdi-cog-outline',
          children: [
            { code: 'AuthorizationListView', parent: 'settings', title: 'authorizationList', icon: 'mdi-account-multiple-outline', singleton: true },
            { code: 'SettingListView', parent: 'settings', title: 'settingList', icon: 'mdi-cog-outline', singleton: true },
            { code: 'PrintoutListView', parent: 'settings', title: 'printoutList', icon: 'mdi-printer-outline', singleton: true },
            { code: 'LogListView', parent: 'settings', title: 'logList', icon: 'mdi-history', singleton: true },
          ],
        },
        { code: 'AuditLogView', parent: '', title: 'auditLog', icon: 'mdi-clipboard-text-clock-outline', singleton: true },
      ],
    },
    {
      group: 'supports',
      links: [
        {
          code: 'supports', parent: '', title: 'support_ticket_list', icon: 'mdi-lifebuoy',
          children: [
            { code: 'TicketListView', parent: 'supports', title: 'ticketList', icon: 'mdi-lifebuoy', singleton: true },
            { code: 'EducationView', parent: 'user', title: 'educationCenter', icon: 'mdi-school-outline', singleton: true },
          ],
        },
      ],
    },
    ...base.slice(5),
  ]
}

async function openWithMenu(page: Page, path: string) {
  await installApiMocks(page, reviewMocks({ MenuService: productionLikeMenu() }))
  await page.addInitScript(() => localStorage.setItem('ek.help.v1.tour', 'dismissed'))
  await page.goto(path)
  await waitForWorkplaceReady(page)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.waitForTimeout(900)
}

async function openMenu(page: Page) {
  if (WIDTH < 1024) {
    const burger = page.getByRole('button', { name: /Menüyü aç/ })
    if (await burger.isVisible().catch(() => false)) await burger.click()
    await page.waitForTimeout(400)
  }
}

test.describe('fe-r2a inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca R2A_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })

  test('kabuk: pano + menü + breadcrumb', async ({ page }) => {
    await openWithMenu(page, '/dashboard')
    await shot(page, 'kabuk-pano')
    await openMenu(page)
    const settings = page.locator('.ek-side-nav, .soft-nav').getByText('Ayarlar', { exact: true }).first()
    if (await settings.isVisible().catch(() => false)) await settings.click()
    const support = page.locator('.ek-side-nav, .soft-nav').getByText('Destek Kayıtları', { exact: true }).first()
    if (await support.isVisible().catch(() => false)) await support.click()
    await page.waitForTimeout(500)
    await shot(page, 'menu-acik')
  })

  test('uygulama ayarları: hesap menüsünden', async ({ page }) => {
    await openWithMenu(page, '/dashboard')
    await page.getByRole('button', { name: 'Hesap menüsü' }).click()
    await page.waitForTimeout(400)
    await shot(page, 'hesap-menusu')
    await page.locator('.v-overlay--active').getByRole('menuitem', { name: /ayarlar/i }).first().click({ timeout: 3000 }).catch(() => undefined)
    await page.waitForTimeout(1500)
    await shot(page, 'uygulama-ayarlari')
  })

  test('ürünler: breadcrumb, filtre, yenile + kaydırma', async ({ page }) => {
    await openWithMenu(page, '/products')
    await shot(page, 'urunler')
    const filter = page.getByRole('button', { name: /Filtre/ }).first()
    if (await filter.isVisible().catch(() => false)) {
      await filter.click()
      await page.waitForTimeout(500)
      await shot(page, 'urunler-filtre')
      await page.keyboard.press('Escape')
    }
    await page.locator('.workplace-area').evaluate((el) => {
      const scrollers = [el, ...el.querySelectorAll('*')].filter((n) => n.scrollHeight > n.clientHeight + 20 && getComputedStyle(n).overflowY !== 'visible')
      scrollers.forEach((n) => n.scrollTo({ top: 600 }))
      window.scrollTo(0, 600)
    })
    await page.waitForTimeout(400)
    await shot(page, 'urunler-kaydirilmis')
  })

  test('yardım merkezi + kaydırma', async ({ page }) => {
    await openWithMenu(page, '/help')
    await page.locator('.ek-help-center').first().waitFor({ timeout: 10000 })
    await page.waitForTimeout(800)
    await shot(page, 'yardim-merkezi')
    await page.locator('.workplace-area').evaluate((el) => {
      const scrollers = [el, ...el.querySelectorAll('*')].filter((n) => n.scrollHeight > n.clientHeight + 20 && getComputedStyle(n).overflowY !== 'visible')
      scrollers.forEach((n) => n.scrollTo({ top: 700 }))
      window.scrollTo(0, 700)
    })
    await page.waitForTimeout(400)
    await shot(page, 'yardim-merkezi-kaydirilmis')
    const article = page.locator('.ek-help-center a, .ek-help-center button').filter({ hasText: /ürün|Ürün/ }).first()
    if (await article.isVisible().catch(() => false)) {
      await article.click()
      await page.waitForTimeout(700)
      await shot(page, 'yardim-makale')
    }
  })

  test('sayfa hakkında paneli', async ({ page }) => {
    await openWithMenu(page, '/orders')
    await page.locator('.ek-page-bar__info').first().click()
    await page.waitForTimeout(600)
    await shot(page, 'sayfa-hakkinda')
  })

  test('siparişler: filtre paneli, metin alanı odak', async ({ page }) => {
    await openWithMenu(page, '/orders')
    await shot(page, 'siparisler')
    const filter = page.getByRole('button', { name: /Filtre/ }).first()
    if (await filter.isVisible().catch(() => false)) {
      await filter.click()
      await page.waitForTimeout(600)
      await shot(page, 'siparisler-filtre')
    }
  })

  test('ayarlar ekranı (menüden)', async ({ page }) => {
    await openWithMenu(page, '/dashboard')
    await openMenu(page)
    const nav = page.locator('.soft-nav')
    const group = nav.getByText('Ayarlar', { exact: true }).first()
    if (await group.isVisible().catch(() => false)) await group.click()
    await page.waitForTimeout(300)
    await nav.getByText('Uygulama Ayarları', { exact: true }).first().click({ timeout: 3000 }).catch(() => undefined)
    await page.waitForTimeout(1500)
    await shot(page, 'ayarlar-ekrani')
  })
})
