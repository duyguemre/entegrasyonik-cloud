// fe-r3a — FR3 madde 1–10 (kabuk, menü, favoriler, breadcrumb, sekmeler, filtre başlığı, tablolar) önce/sonra
// inceleme görüntüleri. İddia yok; yalnız inceleme karesi üretir. Günlük koşuda ATLANIR:
//   R3A_REVIEW=1 R3A_WIDTH=1440|390 [R3A_THEMES=light,dark] [R3A_ONLY=a,b] R3A_OUT=docs/fe-r3a-review/sonra \
//     npx playwright test -c playwright.cloud.config.ts e2e/specs/fe-r3a-review.spec.ts --project=chromium-desktop
// Sentetik veri (PII yok). Favoriler durumlu mock (ekle/çıkar/sırala) — backend sözleşmesi `MenuService/*Favorite*`.
import { mkdirSync, writeFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import type { Page, Route } from '@playwright/test'
import { test } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { waitForWorkplaceReady } from '../fixtures/nav'
import { r2dMocks } from '../fixtures/r2dReview'
import { reviewMocks } from '../fixtures/reviewScreens'

const ENABLED = process.env.R3A_REVIEW === '1'
const WIDTH = Number(process.env.R3A_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.R3A_OUT || 'docs/fe-r3a-review/sonra'
const ONLY = (process.env.R3A_ONLY || '').split(',').filter(Boolean)
const THEMES = (process.env.R3A_THEMES || 'light,dark').split(',') as Array<'light' | 'dark'>
const MOBILE = WIDTH < 1024

const json = (route: Route, headers: Record<string, string>, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })

/** Durumlu favori mock'u (sunucu `order` alanına göre sıralı döner). */
function favoriteMocks(initial: string[]) {
  let favs = initial.map((code, i) => ({ code, order: i + 1 }))
  const body = async (route: Route) => {
    try {
      return JSON.parse(route.request().postData() || '{}')
    } catch {
      return {}
    }
  }
  return {
    'MenuService/retrieveFavorites': (route: Route, h: Record<string, string>) => json(route, h, favs),
    'MenuService/addFavorite': async (route: Route, h: Record<string, string>) => {
      const { code } = await body(route)
      if (code && !favs.some((f) => f.code === code)) favs.push({ code, order: favs.length + 1 })
      return json(route, h, { code })
    },
    'MenuService/deleteFavorite': async (route: Route, h: Record<string, string>) => {
      const { code } = await body(route)
      favs = favs.filter((f) => f.code !== code)
      return json(route, h, { deletedCount: 1 })
    },
    'MenuService/sortFavorites': async (route: Route, h: Record<string, string>) => {
      const { sortedCodes = [] } = await body(route)
      favs = (sortedCodes as string[]).map((code, i) => ({ code, order: i + 1 }))
      return json(route, h, { ok: 1 })
    },
  }
}

function mocks(favs: string[] = []) {
  const { MenuService: _menu, ...r2dData } = r2dMocks() as Record<string, unknown>
  return { ...reviewMocks(), ...r2dData, ...favoriteMocks(favs) }
}

async function open(page: Page, theme: 'light' | 'dark', path: string, favs: string[] = []) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
  await installApiMocks(page, mocks(favs))
  await page.addInitScript(() => localStorage.setItem('ek.help.v1.tour', 'dismissed'))
  await page.goto(path)
  await waitForWorkplaceReady(page)
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.locator('.workplace-area :is(h1, h2, table, .v-card):visible').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await page.addStyleTag({ content: '[data-help-tour-offer]{display:none!important}' })
  await page.waitForTimeout(700)
}

async function openMenu(page: Page) {
  if (!MOBILE) return
  const burger = page.getByRole('button', { name: /Menüyü aç/ })
  if (await burger.isVisible().catch(() => false)) await burger.click()
  await page.waitForTimeout(400)
}

const nav = (page: Page) => page.locator('.ek-shell-nav').first()

/** Menüdeki ilk N yaprak ekranı sırayla açar (ana sekme şeridini doldurur). */
async function openManyTabs(page: Page, n: number) {
  const keys = ['OrderListView', 'productDefinitions/ProductListView', 'ClaimListView', 'CustomerListView', 'InvoiceListView', 'MessageListView', 'StockHealthView', 'FinancialListView', 'LogListView', 'AuditLogView', 'NotificationCenterView']
  for (const key of keys.slice(0, n)) {
    await openMenu(page)
    const btn = nav(page).locator(`[data-key="${key}"]`).first()
    if (!(await btn.isVisible().catch(() => false))) {
      // Alt öğe: önce grubu aç
      const parent = key.includes('/') ? key.split('/')[0] : ''
      if (parent) await nav(page).locator(`button[data-key="${parent}"]`).first().click().catch(() => undefined)
      await page.waitForTimeout(250)
    }
    await btn.click({ timeout: 3000 }).catch(() => undefined)
    await page.waitForTimeout(350)
  }
  await page.waitForTimeout(600)
}

type Case = { name: string; desktopOnly?: boolean; run: (page: Page, theme: 'light' | 'dark', shot: (n: string, full?: boolean) => Promise<void>) => Promise<void> }

const CASES: Case[] = [
  {
    name: 'kabuk',
    run: async (page, theme, shot) => {
      await open(page, theme, '/orders')
      await shot('kabuk')
      await openMenu(page)
      // Tüm grupları aç
      const groups = nav(page).locator('.ek-side__item[aria-expanded="false"]')
      for (let i = (await groups.count()) - 1; i >= 0; i--) await groups.nth(i).click().catch(() => undefined)
      await page.waitForTimeout(400)
      await nav(page).locator('[data-key="CustomerListView"]').first().hover().catch(() => undefined)
      await page.waitForTimeout(250)
      await shot('menu-acik')
    },
  },
  {
    name: 'favoriler',
    run: async (page, theme, shot) => {
      await open(page, theme, '/orders', ['OrderListView', 'ProductListView', 'FinancialListView'])
      await openMenu(page)
      await shot('favoriler')
      // Favori belirleme etkileşimi: yaprağın üstüne gel → yıldız
      const row = nav(page).locator('[data-key="InvoiceListView"]').first()
      await row.hover().catch(() => undefined)
      await page.waitForTimeout(300)
      await shot('favori-hover')
    },
  },
  {
    name: 'favoriler-bos',
    run: async (page, theme, shot) => {
      await open(page, theme, '/orders', [])
      await openMenu(page)
      await shot('favoriler-bos')
    },
  },
  {
    name: 'menu-ray',
    desktopOnly: true,
    run: async (page, theme, shot) => {
      await open(page, theme, '/orders', ['OrderListView', 'ProductListView'])
      await page.locator('.collapse-btn').first().click().catch(() => undefined)
      await page.waitForTimeout(700)
      // Rayda düğmenin yalnız ikon sütunu görünür: hover görünür noktaya (öğenin ortası kırpılmış alanda).
      await nav(page).locator('.ek-side__section:not([data-section]) [data-key="CustomerListView"]').first().hover({ position: { x: 20, y: 18 } }).catch(() => undefined)
      await page.waitForTimeout(500)
      await shot('menu-ray')
    },
  },
  {
    name: 'sekmeler',
    run: async (page, theme, shot) => {
      await open(page, theme, '/dashboard')
      await openManyTabs(page, MOBILE ? 4 : 11)
      if (MOBILE) await page.keyboard.press('Escape').catch(() => undefined)
      await page.mouse.move(1, HEIGHT - 2)
      await shot('sekmeler')
      const more = page.locator('.ek-tabs__more').first()
      if (await more.isVisible().catch(() => false)) {
        await more.click()
        await page.waitForTimeout(400)
        await shot('sekmeler-liste')
        await page.keyboard.press('Escape')
      }
    },
  },
  {
    name: 'filtre',
    run: async (page, theme, shot) => {
      await open(page, theme, '/orders')
      await shot('siparisler')
      const filter = page.locator('.ek-filter__toggle').first()
      if (await filter.isVisible().catch(() => false)) {
        await filter.click()
        await page.waitForTimeout(500)
        await shot('siparisler-filtre')
      }
    },
  },
  ...['/claims', '/invoices', '/customers', '/messages', '/finance', '/logs', '/products', '/settings/audit-log', '/notifications'].map<Case>((path) => ({
    name: `liste${path.replace(/\//g, '-')}`,
    run: async (page, theme, shot) => {
      await open(page, theme, path)
      await shot(`liste${path.replace(/\//g, '-')}`)
    },
  })),
]

test.describe('fe-r3a inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca R3A_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })
  mkdirSync(OUT, { recursive: true })

  for (const c of CASES) {
    if (ONLY.length && !ONLY.includes(c.name)) continue
    if (c.desktopOnly && MOBILE) continue
    for (const theme of THEMES) {
      test(`${c.name} · ${theme}`, async ({ page }) => {
        test.setTimeout(90_000)
        const shot = async (n: string, full = false) => {
          await page.screenshot({ path: `${OUT}/${n}-${theme}-${WIDTH}.png`, fullPage: full })
        }
        await c.run(page, theme, shot)
        // axe (WCAG 2.1 AA) — son durumun makine bulgusu (iddia yok; README özetler).
        if (process.env.R3A_AXE !== '0') {
          await page.mouse.move(1, HEIGHT - 2)
          const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
          mkdirSync(`${OUT}/axe`, { recursive: true })
          const v = res.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, targets: x.nodes.slice(0, 4).map((nd) => nd.target.join(' ')) }))
          writeFileSync(`${OUT}/axe/${c.name}-${theme}-${WIDTH}.json`, JSON.stringify(v, null, 2))
        }
      })
    }
  }
})
