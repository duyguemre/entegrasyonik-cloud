// A8 — kullanıcı geri bildirimi (filtre paneli başlığı, yenile düğmesi, üst bar ikonları) için ÖNCE/SONRA inceleme görüntüleri.
// İddia yok; günlük koşuda ATLANIR.
//   A8_REVIEW=1 A8_REVIEW_WIDTH=1440|390 A8_REVIEW_OUT=docs/a8-review/after \
//     npx playwright test e2e/specs/a8-review.spec.ts --project=chromium-desktop --workers=2
// `A8_REVIEW_SCALE=2` → yalnız YAKIN ÇEKİM (`*-yakin.png`, 2× piksel yoğunluğu); 1 → tam görüntüler.
// Saat sabit, veri sentetik fixture (PII yok).
import { test, type Locator, type Page, type Route } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { buildOrder } from '../fixtures/apiData'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.A8_REVIEW === '1'
const WIDTH = Number(process.env.A8_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const SCALE = Number(process.env.A8_REVIEW_SCALE) || 1
const CLOSE = SCALE > 1
const OUT = process.env.A8_REVIEW_OUT || 'docs/a8-review/after'
const ONLY = (process.env.A8_REVIEW_ONLY || '').split(',').filter(Boolean)
const NOW = new Date('2026-09-29T11:00:00.000Z')
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

const CHANNELS = ['trendyol', 'hepsiburada', 'n11', 'pazarama']
const STATUSES = ['WAITING_FOR_APPROVAL', 'APPROVED', 'SHIPPED', 'DELIVERED', 'CANCELLED']
const NAMES = [['Ayşe', 'Yılmaz'], ['Mehmet', 'Demir'], ['Zeynep', 'Kaya'], ['Can', 'Aydın'], ['Elif', 'Şahin']]
const manyOrdersFixture = {
  orders: Array.from({ length: 12 }, (_, i) =>
    buildOrder({
      _id: `a8-order-${i}`,
      orderNumber: `E2E-${300001 + i}`,
      integrationCode: CHANNELS[i % CHANNELS.length],
      internalStatus: STATUSES[i % STATUSES.length],
      billingAddress: { firstName: NAMES[i % NAMES.length][0], lastName: NAMES[i % NAMES.length][1] },
      financials: { grandTotal: 129.9 + i * 87.35, currencyCode: 'TRY' },
      dates: { orderDate: new Date(Date.UTC(2026, 8, 29, 10 - i, 15)).toISOString() },
    }),
  ),
  totalNumberOfRecords: 12,
}

type Mode = 'ok' | 'slow' | 'error'
interface Ctx { mode: Mode }

async function settle(page: Page, ms = 500) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

/** Sipariş listesi: `ctx.mode` ile sonraki `getOrders` yanıtı yavaş / hatalı yapılabilir (yenile durumları). */
async function openOrders(page: Page, ctx: Ctx, query = '') {
  const orders = async (route: Route, headers: Record<string, string>) => {
    if (ctx.mode === 'slow') await new Promise((r) => setTimeout(r, 6000))
    if (ctx.mode === 'error') {
      await route.fulfill({ status: 500, headers, contentType: 'application/json', body: JSON.stringify({ error: 'Beklenmeyen bir hata oluştu.' }) })
      return
    }
    await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(manyOrdersFixture) })
  }
  await installApiMocks(page, reviewMocks({ 'OrderService/getOrders': orders }))
  await page.goto(reviewPath('OrderListView') + query)
  await waitForWorkplaceReady(page)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.locator('.orderListView .ek-filter').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await settle(page, 800)
}

const view = (p: Page) => p.locator('.orderListView').first()
const filter = (p: Page) => view(p).locator('.ek-filter').first()
const toggle = (p: Page) => view(p).locator('.ek-filter__toggle').first()
const refresh = (p: Page) => p.locator('.workplace-area [data-page-refresh]:visible').first()

async function setFilterOpen(p: Page, open: boolean) {
  const expanded = (await toggle(p).getAttribute('aria-expanded')) === 'true'
  if (expanded !== open) await toggle(p).click()
  await p.mouse.move(0, HEIGHT - 1)
  await settle(p, 450)
}

/** Tam görüntü (yalnız ölçek 1). */
async function full(p: Page, name: string) {
  if (CLOSE) return
  await p.screenshot({ path: `${OUT}/${name}-${WIDTH}.png` })
}

/** Yakın çekim (yalnız ölçek 2): öğenin çevresi (pad px) kırpılır. */
async function close(p: Page, name: string, target: Locator, pad = 12, maxH = 420) {
  if (!CLOSE) return
  const b = await target.boundingBox()
  if (!b) return
  const x = Math.max(0, b.x - pad)
  const y = Math.max(0, b.y - pad)
  const width = Math.min(WIDTH - x, b.width + pad * 2)
  const height = Math.min(maxH, b.height + pad * 2)
  await p.screenshot({ path: `${OUT}/${name}-${WIDTH}-yakin.png`, clip: { x, y, width, height } })
}

/** Başlık satırının sağ ucu (yenile düğmesi + komşuları) — yakın çekim kutusu. */
async function refreshArea(p: Page, name: string) {
  const r = refresh(p)
  const b = await r.boundingBox()
  if (!b) return
  if (!CLOSE) return
  const w = Math.min(WIDTH, 360)
  const x = Math.max(0, Math.min(WIDTH - w, b.x + b.width + 16 - w))
  await p.screenshot({ path: `${OUT}/${name}-${WIDTH}-yakin.png`, clip: { x, y: Math.max(0, b.y - 16), width: w, height: Math.max(b.height + 32, 110) } })
}

const SEARCH_Q = '?internalStatuses=AWAITING_APPROVAL,SHIPPED&allocationStates=OVERSOLD'

const cases: Array<{ name: string; run: (p: Page, ctx: Ctx) => Promise<void> }> = [
  // ── 1) Filtre paneli başlığı
  { name: 'f1-filtre-kapali', run: async (p, ctx) => { await openOrders(p, ctx); await setFilterOpen(p, false); await full(p, 'f1-filtre-kapali'); await close(p, 'f1-filtre-kapali', filter(p)) } },
  { name: 'f2-filtre-acik', run: async (p, ctx) => { await openOrders(p, ctx); await setFilterOpen(p, true); await full(p, 'f2-filtre-acik'); await close(p, 'f2-filtre-acik', filter(p), 12, 520) } },
  {
    name: 'f3-filtre-etkin-kapali',
    run: async (p, ctx) => {
      await openOrders(p, ctx, SEARCH_Q)
      await setFilterOpen(p, false)
      await full(p, 'f3-filtre-etkin-kapali')
      await close(p, 'f3-filtre-etkin-kapali', filter(p))
    },
  },
  {
    name: 'f4-filtre-etkin-acik',
    run: async (p, ctx) => {
      await openOrders(p, ctx, SEARCH_Q)
      await setFilterOpen(p, true)
      await full(p, 'f4-filtre-etkin-acik')
      await close(p, 'f4-filtre-etkin-acik', filter(p), 12, 560)
    },
  },
  {
    name: 'f5-filtre-odak-hover',
    run: async (p, ctx) => {
      await openOrders(p, ctx, SEARCH_Q)
      await setFilterOpen(p, false)
      await toggle(p).focus()
      await p.keyboard.press('Shift+Tab')
      await p.keyboard.press('Tab')
      await settle(p, 250)
      await close(p, 'f5-filtre-odak', filter(p))
      await toggle(p).hover()
      await settle(p, 250)
      await close(p, 'f5-filtre-hover', filter(p))
      await full(p, 'f5-filtre-odak-hover')
    },
  },
  // ── 2) Yenile düğmesi: boşta · yükleniyor · başarı · hata (+ ipucu)
  {
    name: 'r1-yenile-bosta',
    run: async (p, ctx) => {
      await openOrders(p, ctx)
      await p.clock.runFor(125_000).catch(() => undefined)
      await settle(p, 200)
      await refreshArea(p, 'r1-yenile-bosta')
      await refresh(p).hover()
      await settle(p, 700)
      await full(p, 'r1-yenile-ipucu')
      await refreshArea(p, 'r1-yenile-ipucu')
    },
  },
  {
    name: 'r2-yenile-yukleniyor',
    run: async (p, ctx) => {
      await openOrders(p, ctx)
      ctx.mode = 'slow'
      await refresh(p).click()
      await p.mouse.move(0, HEIGHT - 1)
      await settle(p, 450)
      await full(p, 'r2-yenile-yukleniyor')
      await refreshArea(p, 'r2-yenile-yukleniyor')
    },
  },
  {
    name: 'r3-yenile-basari',
    run: async (p, ctx) => {
      await openOrders(p, ctx)
      await refresh(p).click()
      await p.mouse.move(0, HEIGHT - 1)
      await p.waitForTimeout(250)
      await full(p, 'r3-yenile-basari')
      await refreshArea(p, 'r3-yenile-basari')
    },
  },
  {
    name: 'r4-yenile-hata',
    run: async (p, ctx) => {
      await openOrders(p, ctx)
      ctx.mode = 'error'
      await refresh(p).click()
      await p.mouse.move(0, HEIGHT - 1)
      await settle(p, 900)
      await full(p, 'r4-yenile-hata')
      await refreshArea(p, 'r4-yenile-hata')
      await refresh(p).hover()
      await settle(p, 700)
      await refreshArea(p, 'r4-yenile-hata-ipucu')
    },
  },
  // ── 3) Üst bar
  {
    name: 't1-ustbar',
    run: async (p, ctx) => {
      await openOrders(p, ctx)
      if (!CLOSE) await p.screenshot({ path: `${OUT}/t1-ustbar-${WIDTH}.png`, clip: { x: 0, y: 0, width: WIDTH, height: 64 } })
      await close(p, 't1-ustbar-sag', p.locator('.ek-header__end').first(), 8)
      await close(p, 't1-ustbar-sol', p.locator('.ek-header__start').first(), 8)
      await p.locator('[data-header-action="notifications"]').hover()
      await settle(p, 300)
      await close(p, 't2-ustbar-hover', p.locator('.ek-header__end').first(), 8)
      await p.locator('[data-header-action="notifications"]').focus()
      await p.keyboard.press('Shift+Tab')
      await p.keyboard.press('Tab')
      await p.mouse.move(WIDTH / 2, HEIGHT - 1)
      await settle(p, 300)
      await close(p, 't3-ustbar-odak', p.locator('.ek-header__end').first(), 8)
    },
  },
]

test.describe('A8 inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnız A8_REVIEW=1 ile (görüntü üretir)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE })

  for (const c of cases.filter((x) => want(x.name))) {
    test(c.name, async ({ page }) => {
      test.setTimeout(60_000)
      await page.clock.install({ time: NOW })
      await page.clock.resume()
      await c.run(page, { mode: 'ok' })
    })
  }
})
