// A12 — ana sekme şeridinde PASİF sekmeler (sakin zemin, hover, odak, etkin komşuluğu) inceleme görüntüleri. İddia yok;
// günlük koşuda ATLANIR (iddialar: workspace-tabs-passive.spec.ts).
//   A12_REVIEW=1 A12_REVIEW_WIDTH=1440|390 A12_REVIEW_OUT=docs/a12-review [A12_REVIEW_TAG=once] \
//     npx playwright test e2e/specs/a12-review.spec.ts --project=chromium-desktop
// Yakın çekimler 2x. `alt-*` durumları yalnız incelemede enjekte edilen alternatiflerdir (ürün kodunda yok).
import { test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.A12_REVIEW === '1'
const WIDTH = Number(process.env.A12_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.A12_REVIEW_OUT || 'docs/a12-review'
const TAG = process.env.A12_REVIEW_TAG ? `${process.env.A12_REVIEW_TAG}-` : ''
const ONLY = (process.env.A12_REVIEW_ONLY || '').split(',').filter(Boolean)
const DARK = process.env.A12_REVIEW_DARK === '1'
const NOW = new Date('2026-09-29T11:00:00.000Z')
const file = (name: string) => `${OUT}/${TAG}${name}${DARK ? '-dark' : ''}-${WIDTH}.png`
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

const TABS = ['OrderListView', 'productDefinitions/ProductListView', 'ClaimListView', 'CustomerListView', 'InvoiceListView']
const ACTIVE = 1

async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function setup(page: Page) {
  await installApiMocks(page, reviewMocks())
  for (const key of TABS) {
    await page.goto(reviewPath(key)).catch(() => undefined)
    await waitForWorkplaceReady(page)
    await settle(page, 300)
  }
  // Mobilde etkin sekme şeridin başında kalsın diye ilkinden sayılır; masaüstünde 2. sekme (iki yanında pasif komşu).
  await page.locator('.ek-tabs [role=tab]').nth(WIDTH <= 480 ? 0 : ACTIVE).click()
  await page.mouse.move(WIDTH / 2, HEIGHT - 10)
  await settle(page, 600)
}

/** Sekme [from..to] aralığı + şerit yüksekliği + içeriğin 24px'i. */
async function tabsClip(page: Page, from: number, to: number) {
  const tabs = page.locator('.ek-tabs .ek-tab')
  const n = await tabs.count()
  const a = (await tabs.nth(Math.max(0, from)).boundingBox())!
  const b = (await tabs.nth(Math.min(n - 1, to)).boundingBox())!
  const strip = (await page.locator('.ek-tabs').first().boundingBox())!
  const x = Math.max(0, a.x - 16)
  return { x, y: strip.y - 4, width: Math.min(WIDTH - x, b.x + b.width - a.x + 32), height: strip.height + 28 }
}

const passive = WIDTH <= 480 ? 1 : ACTIVE + 1

// Alternatifler (yalnız inceleme): (A) mevcut A10 hali; (B) "gömülü plaka": pasif sekme yumuşak bir yüzey plakası, hover'da
// plaka aydınlanır + üst saç çizgisi; (C) "çizgisiz ritim": ayraç yok, boşluk + hover'da yalnız zemin ışıması.
const ALTS: Record<string, string> = {
  'alt-b-plaka': `.ek-tab:not(.is-active){background:var(--ek-color-surface-muted)!important;border-color:var(--ek-color-border-default)!important;margin:0 2px}.ek-tab+.ek-tab::before{display:none}`,
  'alt-c-ritim': `.ek-tab+.ek-tab::before{display:none}.ek-tab:not(.is-active){margin:0 3px}.ek-tab:not(.is-active):hover{background:var(--ek-color-tab-hover)!important}`,
}

const cases: Array<{ name: string; run: (page: Page) => Promise<void> }> = [
  {
    name: 'serit',
    run: async (p) => {
      await setup(p)
      await p.screenshot({ path: file('serit'), clip: { x: 0, y: 0, width: WIDTH, height: 160 } })
    },
  },
  {
    name: 'pasif-yakin',
    run: async (p) => {
      await setup(p)
      await p.screenshot({ path: file('pasif-yakin'), clip: await tabsClip(p, passive, passive + 2) })
    },
  },
  {
    name: 'komsu-yakin',
    run: async (p) => {
      await setup(p)
      const a = WIDTH <= 480 ? 0 : ACTIVE
      await p.screenshot({ path: file('komsu-yakin'), clip: await tabsClip(p, a - 1, a + 1) })
    },
  },
  {
    name: 'hover-yakin',
    run: async (p) => {
      await setup(p)
      await p.locator('.ek-tabs .ek-tab').nth(passive + 1).hover()
      await settle(p, 400)
      await p.screenshot({ path: file('hover-yakin'), clip: await tabsClip(p, passive, passive + 2) })
    },
  },
  {
    name: 'odak-yakin',
    run: async (p) => {
      await setup(p)
      await p.locator('.ek-tabs [role=tab][aria-selected=true]').focus()
      await p.keyboard.press('ArrowRight')
      await p.keyboard.press('ArrowRight')
      await settle(p, 300)
      await p.screenshot({ path: file('odak-yakin'), clip: await tabsClip(p, passive, passive + 2) })
    },
  },
  ...Object.entries(ALTS).map(([name, css]) => ({
    name,
    run: async (p: Page) => {
      if (WIDTH <= 480) return
      await setup(p)
      await p.addStyleTag({ content: css })
      await p.locator('.ek-tabs .ek-tab').nth(passive + 1).hover()
      await settle(p, 400)
      await p.screenshot({ path: file(name), clip: await tabsClip(p, ACTIVE - 1, passive + 2) })
    },
  })),
]

test.describe('A12 inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca A12_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: Number(process.env.A12_REVIEW_SCALE) || 2 })
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW)
    if (DARK) await page.emulateMedia({ colorScheme: 'dark' })
  })
  for (const c of cases) {
    if (!want(c.name)) continue
    test(c.name, async ({ page }) => {
      test.setTimeout(90_000)
      await c.run(page)
    })
  }
})
