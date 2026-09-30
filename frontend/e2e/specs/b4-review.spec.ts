// B4 — sol menü (aktif renk, daralma/genişleme hareketi) + breadcrumb çipleri + yardım tetikleyicisi inceleme
// görüntüleri. İddia yok; günlük koşuda ATLANIR. Saat sabit, veri sentetik.
//   B4_REVIEW=1 B4_REVIEW_WIDTH=1440|800|390 B4_REVIEW_OUT=docs/b4-review/after \
//     npx playwright test e2e/specs/b4-review.spec.ts --project=chromium-desktop
// Kapanış kareleri: tıklamadan hemen sonra tüm Web Animations/CSS geçişleri duraklatılır ve aynı zamana sarılır
// (ekran görüntüsü süresinden bağımsız, deterministik). `B4_REVIEW_ALT=1` alternatifleri (stil enjeksiyonu) üretir.
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { menuFixtureWithIntegrationConfig } from '../fixtures/nav'
import { userContextFixture } from '../fixtures/apiData'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.B4_REVIEW === '1'
const WIDTH = Number(process.env.B4_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.B4_REVIEW_OUT || 'docs/b4-review/after'
const ONLY = (process.env.B4_REVIEW_ONLY || '').split(',').filter(Boolean)
const NOW = new Date('2026-09-30T09:00:00.000Z')
const file = (name: string) => `${OUT}/${name}-${WIDTH}.png`
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))
const DESKTOP = WIDTH >= 1280
const MOBILE = WIDTH < 768

async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function open(page: Page, key: string) {
  await installApiMocks(page, reviewMocks())
  await page.goto(reviewPath(key)).catch(() => undefined)
  await waitForWorkplaceReady(page)
  await page.locator('.workplace-area h1:visible').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await settle(page, 700)
  await page.mouse.move(WIDTH - 4, HEIGHT - 4)
}

async function openDeep(page: Page) {
  await installApiMocks(page, reviewMocks({
    MenuService: menuFixtureWithIntegrationConfig,
    userContext: { ...userContextFixture, isGlobalAdmin: true },
    'IntegrationConfigService/list': [
      { target: 'trendyol', displayName: 'Trendyol', category: 'marketplace', adapterVersion: '2.3.0', publishedVersion: 2, intake: 'on', hasDraft: false },
    ],
    'IntegrationConfigService/getEffectiveConfig': { target: 'trendyol', publishedVersion: 2, catalogVersion: '2026-09-29.b1', values: [] },
  }))
  await page.goto(reviewPath('adminPanel/IntegrationConfigListView')).catch(() => undefined)
  await waitForWorkplaceReady(page)
  await page.locator('.integrationConfigListView').getByRole('button', { name: 'Trendyol detayını aç' }).first().click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Trendyol' })
  await dialog.getByRole('button', { name: 'Etkin yapılandırmayı gör' }).click()
  await expect(page.locator('.effectiveConfigView:not(.hide-tab-component) h1')).toBeVisible({ timeout: 15_000 })
  await settle(page, 900)
  await page.mouse.move(WIDTH - 4, HEIGHT - 4)
}

const menuClip = () => ({ x: 0, y: 0, width: Math.min(WIDTH, 380), height: HEIGHT })

/** Başlık satırı yakın çekimi (2x cihaz ölçeği). */
async function barShot(page: Page, name: string, extraRight = 0) {
  const bar = page.locator('.workplace-area .ek-page-bar:visible').first()
  const box = (await bar.boundingBox())!
  const titles = (await bar.locator('.ek-page-bar__titles').boundingBox())!
  const pad = 12
  const x = Math.max(0, box.x - pad)
  const w = MOBILE ? Math.min(WIDTH - x, box.width + pad * 2) : Math.min(WIDTH - x, titles.width + pad * 2 + 24 + extraRight)
  await page.screenshot({ path: file(name), clip: { x, y: Math.max(0, box.y - pad), width: w, height: Math.min(box.height, 120) + pad * 2 } })
}

/** Kapanış/açılış hareketini t anlarında dondurur (ms). */
async function freezeAt(page: Page, t: number) {
  await page.evaluate((ms) => {
    for (const a of document.getAnimations()) {
      a.pause()
      a.currentTime = ms
    }
  }, t)
  await page.waitForTimeout(60)
}

async function startToggle(page: Page, selector: string) {
  await page.evaluate((sel) => {
    ;(document.querySelector(sel) as HTMLElement).click()
  }, selector)
  // Vue yaması + stil yeniden hesabı → geçişler başlar; hemen duraklat.
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
  await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
}

const ACTIVE_ALTS: Record<string, string> = {
  // A: hafif ton zemin + sol vurgu çizgisi (seçilen) — ürün kodu; alternatif B: dolgulu hap.
  'alt-aktif-b-hap': `.ek-side__item.is-active,.ek-side__subitem.is-active{--ek-side-fill:var(--ek-color-action)!important;color:var(--ek-color-action-contrast)!important}.ek-side__item.is-active .ek-side__icon{color:var(--ek-color-action-contrast)!important}.ek-side__item.is-active::before,.ek-side__subitem.is-active::before{opacity:0!important}`,
}

const CRUMB_ALTS: Record<string, string> = {
  // B: yalın metin ara öğeler + yalnız kök çip (karma).
  'alt-crumb-b-karma': `.ek-crumbs__item:not(.ek-crumbs__item--root) > .ek-crumbs__link{border-color:transparent!important;background:transparent!important;padding-inline:0!important}`,
}

const cases: Array<{ name: string; run: (page: Page) => Promise<void> }> = [
  {
    name: 'menu-acik',
    run: async (p) => {
      await open(p, 'productDefinitions/ProductListView')
      if (MOBILE) {
        await p.getByRole('button', { name: 'Menüyü aç' }).click()
        await p.mouse.move(WIDTH - 10, HEIGHT - 10)
        await settle(p, 700)
        await p.screenshot({ path: file('menu-acik') })
        return
      }
      if (!DESKTOP) {
        await p.locator('.rail-logo-btn').click()
        await settle(p, 700)
      }
      await p.screenshot({ path: file('menu-acik'), clip: menuClip() })
      // Yakın çekim: aktif öğe + grup başlığı + hover
      const item = p.locator('.ek-side__item').filter({ hasText: 'Siparişler' }).first()
      if (await item.count()) await item.hover()
      await settle(p, 300)
      await p.screenshot({ path: file('menu-acik-yakin'), clip: { x: 0, y: 200, width: 260, height: 260 } })
    },
  },
  ...Object.entries(ACTIVE_ALTS).map(([name, css]) => ({
    name,
    run: async (p: Page) => {
      if (!DESKTOP) return
      await open(p, 'productDefinitions/ProductListView')
      await p.addStyleTag({ content: css })
      await settle(p, 300)
      await p.screenshot({ path: file(name), clip: { x: 0, y: 200, width: 260, height: 260 } })
    },
  })),
  {
    name: 'menu-odak',
    run: async (p) => {
      if (MOBILE) return
      await open(p, 'OrderListView')
      if (!DESKTOP) {
        await p.locator('.rail-logo-btn').click()
        await settle(p, 700)
      }
      await p.locator('.soft-nav .ek-side__item').nth(2).focus()
      await p.keyboard.press('Tab')
      await p.keyboard.press('Shift+Tab')
      await p.locator('.soft-nav .ek-side__item').nth(5).hover()
      await settle(p, 300)
      await p.screenshot({ path: file('menu-odak'), clip: { x: 0, y: 56, width: 260, height: 420 } })
    },
  },
  {
    name: 'menu-ray',
    run: async (p) => {
      if (MOBILE) return
      await open(p, 'productDefinitions/ProductListView')
      if (DESKTOP) await p.locator('.collapse-btn').click()
      await settle(p, 900)
      await p.screenshot({ path: file('menu-ray'), clip: menuClip() })
    },
  },
  {
    // Kapanış animasyonu: 3 kare (başlangıç/solma, genişlik ortası, sona yakın) + bitiş.
    name: 'menu-kapanis',
    run: async (p) => {
      if (!DESKTOP) return
      await open(p, 'productDefinitions/ProductListView')
      await startToggle(p, '.collapse-btn')
      const frames: Array<[string, number]> = [['1', 70], ['2', 230], ['3', 360]]
      for (const [n, t] of frames) {
        await freezeAt(p, t)
        await p.screenshot({ path: file(`menu-kapanis-${n}`), clip: menuClip() })
      }
      await p.evaluate(() => document.getAnimations().forEach((a) => (Number.isFinite(Number(a.effect?.getComputedTiming().endTime)) ? a.finish() : a.play())))
      await settle(p, 400)
      await p.screenshot({ path: file('menu-kapanis-4-son'), clip: menuClip() })
    },
  },
  {
    name: 'menu-acilis',
    run: async (p) => {
      if (!DESKTOP) return
      await open(p, 'productDefinitions/ProductListView')
      await p.locator('.collapse-btn').click()
      await settle(p, 900)
      await startToggle(p, '.rail-logo-btn')
      const frames: Array<[string, number]> = [['1', 100], ['2', 250], ['3', 380]]
      for (const [n, t] of frames) {
        await freezeAt(p, t)
        await p.screenshot({ path: file(`menu-acilis-${n}`), clip: menuClip() })
      }
    },
  },
  {
    name: 'crumb-liste',
    run: async (p) => {
      await open(p, 'OrderListView')
      await p.screenshot({ path: file('crumb-liste-tam'), fullPage: false })
      await barShot(p, 'crumb-liste-yakin')
    },
  },
  {
    name: 'crumb-derin',
    run: async (p) => {
      await openDeep(p)
      await p.screenshot({ path: file('crumb-derin-tam') })
      await barShot(p, 'crumb-derin-yakin')
      const link = p.locator('.workplace-area .ek-page-bar:visible .ek-crumbs__link').first()
      if (await link.count()) {
        await link.hover()
        await settle(p, 300)
        await barShot(p, 'crumb-derin-hover-yakin')
        await p.mouse.move(WIDTH - 4, HEIGHT - 4)
      }
      const help = p.locator('.workplace-area .ek-page-bar:visible .ek-page-bar__info').first()
      await help.focus()
      await p.keyboard.press('Shift+Tab')
      await p.keyboard.press('Tab')
      await settle(p, 700)
      await barShot(p, 'crumb-derin-yardim-odak-yakin')
    },
  },
  // A/B: ara öğelerin satırda göründüğü geniş kap (2200px) — A = tüm ara öğeler çip (seçilen), B = karma.
  ...[['crumb-a-cip', ''], ...Object.entries(CRUMB_ALTS)].map(([name, css]) => ({
    name,
    run: async (p: Page) => {
      if (!DESKTOP) return
      await p.setViewportSize({ width: 2200, height: HEIGHT })
      await openDeep(p)
      if (css) await p.addStyleTag({ content: css })
      await settle(p, 300)
      const bar = p.locator('.workplace-area .ek-page-bar:visible .ek-page-bar__titles').first()
      const box = (await bar.boundingBox())!
      await p.screenshot({ path: file(name), clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 } })
      const link = p.locator('.workplace-area .ek-page-bar:visible .ek-crumbs__link').first()
      await link.hover()
      await settle(p, 300)
      await p.screenshot({ path: file(`${name}-hover`), clip: { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 } })
    },
  })),
  {
    name: 'crumb-hakkinda',
    run: async (p) => {
      await open(p, 'OrderListView')
      await p.locator('.workplace-area .orderListView').getByRole('button', { name: /^Sayfa hakkında/ }).click()
      await settle(p, 600)
      await p.mouse.move(WIDTH - 4, HEIGHT - 4)
      await barShot(p, 'crumb-hakkinda-yakin')
    },
  },
]

test.describe('B4 inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca B4_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: Number(process.env.B4_REVIEW_SCALE) || 2 })
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW)
  })
  for (const c of cases) {
    if (!want(c.name)) continue
    test(c.name, async ({ page }) => {
      test.setTimeout(90_000)
      await c.run(page)
    })
  }
})
