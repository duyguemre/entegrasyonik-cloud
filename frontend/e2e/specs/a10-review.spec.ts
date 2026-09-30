// A10 — sol menü grup deseni + ana sekme ↔ içerik birleşme bölgesi inceleme görüntüleri. İddia yok; günlük koşuda ATLANIR.
//   A10_REVIEW=1 A10_REVIEW_WIDTH=1440|800|390 A10_REVIEW_OUT=docs/a10-review \
//     npx playwright test e2e/specs/a10-review.spec.ts --project=chromium-desktop
// Yakın çekimler 2x (deviceScaleFactor) — köşe bölgesi piksel düzeyinde incelenir. Saat sabit.
import { test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.A10_REVIEW === '1'
const WIDTH = Number(process.env.A10_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.A10_REVIEW_OUT || 'docs/a10-review'
const ONLY = (process.env.A10_REVIEW_ONLY || '').split(',').filter(Boolean)
const DARK = process.env.A10_REVIEW_DARK === '1'
const NOW = new Date('2026-09-29T11:00:00.000Z')
const file = (name: string) => `${OUT}/${name}${DARK ? '-dark' : ''}-${WIDTH}.png`
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

const TABS = ['OrderListView', 'productDefinitions/ProductListView', 'ClaimListView', 'CustomerListView', 'InvoiceListView']

async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function openMany(page: Page, keys: string[]) {
  await installApiMocks(page, reviewMocks())
  for (const key of keys) {
    await page.goto(reviewPath(key)).catch(() => undefined)
    await waitForWorkplaceReady(page)
    await settle(page, 400)
  }
  await settle(page, 600)
}

/** Etkin sekmenin çevresi: sekmenin iki yanında 32px, şeridin üstünden içeriğin 40px altına. */
async function cornerClip(page: Page) {
  const tab = page.locator('.ek-tab.is-active').first()
  const box = (await tab.boundingBox())!
  const strip = (await page.locator('.ek-tabs').first().boundingBox())!
  const x = Math.max(0, box.x - 32)
  return { x, y: strip.y - 4, width: Math.min(WIDTH - x, box.width + 64), height: strip.height + 44 }
}

async function activateTab(page: Page, index: number) {
  const tabs = page.locator('.ek-tabs [role=tab]')
  const n = await tabs.count()
  await tabs.nth(index < 0 ? n + index : index).click()
  await settle(page, 500)
  await page.mouse.move(WIDTH / 2, HEIGHT - 10)
  await settle(page, 300)
}

const cases: Array<{ name: string; run: (page: Page) => Promise<void> }> = [
  {
    name: 'menu-acik',
    run: async (p) => {
      await openMany(p, ['OrderListView'])
      if (WIDTH <= 480) {
        await p.getByRole('button', { name: 'Menüyü aç' }).click()
        await settle(p, 600)
        await p.screenshot({ path: file('menu-acik') })
      } else {
        await p.screenshot({ path: file('menu-acik'), clip: { x: 0, y: 0, width: 360, height: HEIGHT } })
      }
    },
  },
  // Alternatif karşılaştırması (yalnız inceleme; ürün kodunda yok): (b) katlanabilir başlık — öğe metin rengi, farklı
  // ağırlık, chevron; (c) başlıksız — yalnız boşluk + ayırıcı; (a2) seçilen desenin öğe rengiyle koyu varyantı.
  ...Object.entries({
    'alt-b-katlanabilir': `.ek-side__section-label{color:var(--ek-color-sidebar-text)!important;text-transform:none!important;letter-spacing:0!important;font-size:var(--ek-type-label-size)!important;line-height:var(--ek-type-label-line)!important;font-weight:var(--ek-font-weight-semibold)!important;display:flex;align-items:center;justify-content:space-between;padding-right:var(--ek-space-3)!important}.ek-side__section-label::after{content:'';width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg) translateY(-2px);opacity:.7}.ek-side__section-rule{display:none}`,
    'alt-c-basliksiz': `.ek-side__section-label{display:none!important}`,
    'alt-a2-koyu': `.ek-side__section-label{color:var(--ek-color-sidebar-text)!important}`,
  }).map(([name, css]) => ({
    name,
    run: async (p: Page) => {
      if (WIDTH <= 480) return
      await openMany(p, ['OrderListView'])
      await p.addStyleTag({ content: css })
      await settle(p, 300)
      await p.screenshot({ path: file(name), clip: { x: 0, y: 0, width: 360, height: HEIGHT } })
    },
  })),
  {
    name: 'menu-odak',
    run: async (p) => {
      if (WIDTH <= 480) return
      await openMany(p, ['OrderListView'])
      await p.locator('.ek-side__item').nth(3).focus()
      await p.keyboard.press('Tab')
      await p.locator('.ek-side__item').nth(5).hover()
      await settle(p, 300)
      await p.screenshot({ path: file('menu-odak'), clip: { x: 0, y: 56, width: 260, height: 520 } })
    },
  },
  {
    name: 'menu-dar',
    run: async (p) => {
      if (WIDTH <= 480) return
      await openMany(p, ['OrderListView'])
      await p.locator('.collapse-btn').click()
      await settle(p, 700)
      await p.screenshot({ path: file('menu-dar'), clip: { x: 0, y: 0, width: 360, height: HEIGHT } })
    },
  },
  ...(['ilk', 'orta', 'son'] as const).map((pos) => ({
    name: `sekme-${pos}`,
    run: async (p: Page) => {
      await openMany(p, TABS)
      await activateTab(p, pos === 'ilk' ? 0 : pos === 'orta' ? 2 : -1)
      await p.screenshot({ path: file(`sekme-${pos}`), clip: { x: 0, y: 0, width: WIDTH, height: 200 } })
      await p.screenshot({ path: file(`sekme-${pos}-yakin`), clip: await cornerClip(p) })
    },
  })),
  {
    name: 'sekme-hover',
    run: async (p) => {
      await openMany(p, TABS)
      await activateTab(p, 2)
      await p.locator('.ek-tabs [role=tab]').nth(1).hover()
      await settle(p, 300)
      await p.screenshot({ path: file('sekme-hover-yakin'), clip: await cornerClip(p) })
    },
  },
  {
    name: 'sekme-odak',
    run: async (p) => {
      await openMany(p, TABS)
      await activateTab(p, 2)
      await p.locator('.ek-tabs [role=tab][aria-selected=true]').focus()
      await p.keyboard.press('ArrowLeft')
      await settle(p, 300)
      await p.screenshot({ path: file('sekme-odak-yakin'), clip: await cornerClip(p) })
    },
  },
]

test.describe('A10 inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca A10_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: Number(process.env.A10_REVIEW_SCALE) || 2 })
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
