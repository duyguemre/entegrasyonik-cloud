// fe-r3b — FR3 madde 11 (ürün kanalları), 12–13 (detay diyalogları), 14 (uygulama ayarları), 16 (ana sayfa)
// inceleme görüntüleri (önce/sonra) + axe. İddia yok; görüntü + axe JSON üretir. Günlük koşuda ATLANIR.
//   R3B_REVIEW=1 R3B_WIDTH=1440|390 [R3B_THEMES=light,dark] [R3B_ONLY=a,b] R3B_OUT=docs/fe-r3b-review/<once|sonra> \
//     npx playwright test e2e/specs/fe-r3b-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop
import { mkdirSync, writeFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, openScreen, waitForWorkplaceReady } from '../fixtures/nav'
import { r2dMocks } from '../fixtures/r2dReview'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'

const ENABLED = process.env.R3B_REVIEW === '1'
const WIDTH = Number(process.env.R3B_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.R3B_OUT || 'docs/fe-r3b-review/sonra'
const ONLY = (process.env.R3B_ONLY || '').split(',').filter(Boolean)
const THEMES = (process.env.R3B_THEMES || 'light,dark').split(',') as Array<'light' | 'dark'>
const SCROLL = process.env.R3B_SCROLL === '1'

function mocks(menuFromR2d = false) {
  const { MenuService: r2dMenu, ...r2dData } = r2dMocks() as Record<string, unknown>
  return { ...reviewMocks(), ...r2dData, ...(menuFromR2d ? { MenuService: r2dMenu } : {}) }
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.addStyleTag({ content: '[data-help-tour-offer]{display:none!important}' })
  await page.waitForTimeout(900)
}

async function openDetail(page: Page, root: string) {
  const OPEN = 'button:has([class*="mdi-eye"]), button:has(.mdi-message-text-outline)'
  const rows = page.locator(`${root} tbody tr`).filter({ has: page.locator(OPEN) })
  const scope = (await rows.count()) ? rows.first() : page.locator(`${root} :is(.ek-grid-card, article, li):visible`).first()
  await scope.locator(OPEN).first().click()
  await page.mouse.move(1, 1)
  await page.locator('.ek-detail-sheet, .ek-record-sheet, .v-overlay--active .v-card').first().waitFor({ timeout: 5000 }).catch(() => undefined)
  await page.waitForTimeout(700)
}

type Case = { name: string; detail?: boolean; run: (page: Page) => Promise<void> }

const listDetail = (name: string, slug: string, root: string, anchor: string): Case => ({
  name,
  detail: true,
  run: async (p) => {
    await installApiMocks(p, mocks())
    await p.goto(`/${slug}`)
    await waitForWorkplaceReady(p)
    await p.getByText(anchor).first().waitFor()
    await openDetail(p, root)
    await settle(p)
  },
})

const CASES: Case[] = [
  { name: 'anasayfa', run: async (p) => { await installApiMocks(p, mocks()); await p.goto(reviewPath('DashboardView')); await waitForWorkplaceReady(p); await settle(p) } },
  { name: 'urun-liste', run: async (p) => { await installApiMocks(p, mocks()); await p.goto(reviewPath('productDefinitions/ProductListView')); await waitForWorkplaceReady(p); await p.locator('.workplace-area table:visible, .workplace-area .ek-grid-card:visible').first().waitFor({ timeout: 10000 }).catch(() => undefined); await settle(p) } },
  listDetail('siparis-detay', 'orders', '.orderListView', 'E2E-100001'),
  listDetail('iade-detay', 'claims', '.claimListView', 'CLM-E2E-0001'),
  listDetail('musteri-detay', 'customers', '.customerListView', 'Ayşe Yılmaz'),
  listDetail('fatura-detay', 'invoices', '.invoiceListView', 'INV-E2E-0001'),
  {
    name: 'destek-detay',
    detail: true,
    run: async (p) => {
      await installApiMocks(p, mocks(true))
      await gotoAuthed(p)
      await openScreen(p, 'TicketListView')
      await p.getByText('DSK-100001').first().waitFor()
      await openDetail(p, '.ticketListView')
      await settle(p)
    },
  },
  { name: 'ayarlar', run: async (p) => { await installApiMocks(p, mocks(true)); await gotoAuthed(p); await openScreen(p, 'SettingListView'); await settle(p) } },
]

/** Detay diyaloğunun kaydırılabilir gövdesini adım adım görüntüler. */
async function scrollShots(page: Page, base: string) {
  const body = page.locator('.ek-record-sheet__body, .ek-detail-sheet__body').first()
  if (!(await body.count())) return
  for (let i = 1; i <= 3; i++) {
    const moved = await body.evaluate((el, step) => { el.scrollTop = el.clientHeight * step * 0.85; return el.scrollTop > 0 }, i)
    if (!moved) break
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${base}-kaydir${i}.png` })
    if (await body.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2)) break
  }
}

test.describe('fe-r3b inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca R3B_REVIEW=1 ile')
  test.describe.configure({ retries: 1 })
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })

  for (const theme of THEMES) {
    for (const c of CASES) {
      if (ONLY.length && !ONLY.some((o) => c.name.includes(o))) continue
      test(`${theme}: ${c.name}`, async ({ page }) => {
        test.setTimeout(90_000)
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await page.addInitScript((t) => localStorage.setItem('ek-theme', t), theme)
        await c.run(page)
        mkdirSync(`${OUT}/axe`, { recursive: true })
        const base = `${OUT}/${c.name}-${theme}-${WIDTH}`
        await page.screenshot({ path: `${base}.png` })
        if (c.detail && SCROLL) await scrollShots(page, base)
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        writeFileSync(
          `${OUT}/axe/${c.name}-${theme}-${WIDTH}.json`,
          JSON.stringify({
            screen: c.name, theme, width: WIDTH,
            axe: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} :: ${(n.failureSummary || '').split('\n').slice(1, 2).join('').trim().slice(0, 140)}`) })),
          }, null, 2),
        )
      })
    }
  }
})
