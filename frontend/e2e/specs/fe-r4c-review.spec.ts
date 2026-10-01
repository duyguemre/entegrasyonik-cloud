// fe-r4c — FE R4 Şerit C (K61): C1 uygulama ayarları, C2 "Bugün sırada", C3 dashboard kart ızgarası.
// İnceleme görüntüleri (önce/sonra) + axe JSON. İddia yok. Günlük koşuda ATLANIR.
//   R4C_REVIEW=1 R4C_WIDTH=1440|1280|1024|768|390 [R4C_THEMES=light,dark] [R4C_ONLY=a,b] [R4C_TALL=1] \
//     R4C_OUT=docs/fe-r4-review/c/<once|sonra> \
//     npx playwright test e2e/specs/fe-r4c-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop
// R4C_TALL=1 → dashboard tüm içerik tek karede görünsün diye görünüm alanı içerik yüksekliğine uzatılır (C3 ızgara kanıtı).
import { mkdirSync, writeFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, openScreen } from '../fixtures/nav'
import { r2dMocks } from '../fixtures/r2dReview'
import { reviewMocks } from '../fixtures/reviewScreens'

const ENABLED = process.env.R4C_REVIEW === '1'
const WIDTH = Number(process.env.R4C_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.R4C_OUT || 'docs/fe-r4-review/c/sonra'
const ONLY = (process.env.R4C_ONLY || '').split(',').filter(Boolean)
const THEMES = (process.env.R4C_THEMES || 'light,dark').split(',') as Array<'light' | 'dark'>
const TALL = process.env.R4C_TALL === '1'

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

/** Dashboard kaydırma kabının tamamını görünür kılmak için görünüm alanını içerik yüksekliğine uzatır. */
async function stretchDashboard(page: Page) {
  const h = await page.evaluate(() => {
    const s = document.querySelector('.dash-scroll') as HTMLElement | null
    if (!s) return 0
    return s.scrollHeight - s.clientHeight
  })
  if (h > 0) {
    await page.setViewportSize({ width: WIDTH, height: HEIGHT + h + 8 })
    await page.waitForTimeout(600)
  }
}

type Case = { name: string; run: (page: Page) => Promise<void> }

const openSettings = async (p: Page) => {
  await installApiMocks(p, mocks(true))
  await gotoAuthed(p)
  await openScreen(p, 'SettingListView')
  await settle(p)
}

const CASES: Case[] = [
  {
    name: 'anasayfa',
    run: async (p) => {
      await installApiMocks(p, mocks())
      await gotoAuthed(p)
      await p.getByText('İŞLETME PERFORMANSI').first().waitFor({ timeout: 15000 }).catch(() => undefined)
      await settle(p)
      if (TALL) await stretchDashboard(p)
    },
  },
  {
    name: 'anasayfa-bos',
    run: async (p) => {
      await installApiMocks(p, {
        ...mocks(),
        'OrderService/getOrderDashboardInsights': {
          totals: { orderCount: 0, revenue: 0, returnCount: 0, returnAmount: 0 },
          today: { count: 0, revenue: 0 },
          trend: { countChange: 0, revenueChange: 0 },
          statusDistribution: { total: 0 },
          pending: { invoiceCount: 0, shippingCount: 0, claimCount: 0, messageCount: 0 },
          last7Days: [],
        },
        'StockService/getStockOverview': {
          generatedAt: '2026-10-01T08:00:00.000Z',
          attention: { oversold: { lines: 0, units: 0 }, unmapped: { lines: 0, units: 0 } },
          recentOrders: [],
          variants: { total: 0, totalStock: 0, reservedUnits: 0, availableUnits: 0, withReservations: 0, overReserved: 0, publishPending: 0 },
          reconciliation: { tracked: false, lastRunAt: null },
        },
        'IntegrationService/getIntegrationHealth': { generatedAt: '2026-10-01T08:00:00.000Z', windowHours: 24, integrations: [] },
      })
      await gotoAuthed(p)
      await p.getByText('İŞLETME PERFORMANSI').first().waitFor({ timeout: 15000 }).catch(() => undefined)
      await settle(p)
    },
  },
  { name: 'ayarlar', run: openSettings },
  {
    name: 'ayarlar-degisiklik',
    run: async (p) => {
      await openSettings(p)
      await p.locator('#sl-storeName').fill('Örnek Ticaret Mağazası')
      await p.locator('.settingListView .color-swatch-item').nth(4).click()
      await p.mouse.move(1, 1)
      await p.waitForTimeout(400)
    },
  },
  {
    name: 'ayarlar-fatura',
    run: async (p) => {
      await openSettings(p)
      await p.getByRole('tab', { name: /Fatura/ }).first().click()
      await p.waitForTimeout(500)
    },
  },
]

test.describe('fe-r4c inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca R4C_REVIEW=1 ile')
  test.describe.configure({ retries: 1 })
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })

  for (const theme of THEMES) {
    for (const c of CASES) {
      if (ONLY.length && !ONLY.some((o) => c.name === o)) continue
      test(`${theme}: ${c.name}`, async ({ page }) => {
        test.setTimeout(90_000)
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await page.addInitScript((t) => localStorage.setItem('ek-theme', t), theme)
        await c.run(page)
        mkdirSync(`${OUT}/axe`, { recursive: true })
        const suffix = TALL ? '-tam' : ''
        const base = `${OUT}/${c.name}-${theme}-${WIDTH}${suffix}`
        await page.screenshot({ path: `${base}.png` })
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        writeFileSync(
          `${OUT}/axe/${c.name}-${theme}-${WIDTH}${suffix}.json`,
          JSON.stringify({
            screen: c.name, theme, width: WIDTH,
            axe: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} :: ${(n.failureSummary || '').split('\n').slice(1, 2).join('').trim().slice(0, 140)}`) })),
          }, null, 2),
        )
      })
    }
  }
})
