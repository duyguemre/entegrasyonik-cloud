// fe-polish — birleşik dal (r2a+r2b+r2c+r2d+dark) üzerinde tüm ekranların denetimi: light + dark, 1440 + 390.
// İddia yok; görüntü + makine bulgusu (axe, yatay taşma, ham i18n anahtarı, "undefined/NaN" metni) üretir.
// Günlük koşuda ATLANIR.
//   POLISH_REVIEW=1 POLISH_WIDTH=1440|390 [POLISH_THEMES=light,dark] [POLISH_ONLY=a,b] [POLISH_OUT=...] \
//     npx playwright test e2e/specs/fe-polish-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop
import { mkdirSync, writeFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { SCREENS } from '../../src/navigation/screens'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed, openScreen, waitForWorkplaceReady } from '../fixtures/nav'
import { r2dMocks } from '../fixtures/r2dReview'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'

const ENABLED = process.env.POLISH_REVIEW === '1'
const WIDTH = Number(process.env.POLISH_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.POLISH_OUT || 'docs/fe-polish-review/denetim'
const ONLY = (process.env.POLISH_ONLY || '').split(',').filter(Boolean)
const THEMES = (process.env.POLISH_THEMES || 'light,dark').split(',') as Array<'light' | 'dark'>
const SHOTS = process.env.POLISH_SHOTS !== '0'

/** r2d'nin zengin sentetik verisi (menü hariç) + inceleme menüsü/verileri. */
function mocks(menuFromR2d = false) {
  const { MenuService: r2dMenu, ...r2dData } = r2dMocks() as Record<string, unknown>
  return { ...reviewMocks(), ...r2dData, ...(menuFromR2d ? { MenuService: r2dMenu } : {}) }
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.locator('.workplace-area :is(h1, h2, table, .v-card):visible').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await page.addStyleTag({ content: '[data-help-tour-offer]{display:none!important}' })
  await page.waitForTimeout(900)
}

type Case = { name: string; run: (page: Page) => Promise<void> }

const SKIP_KEYS = new Set<string>([])
const slugName = (key: string) => (SCREENS.find((s) => s.key === key)!.slug || 'panel').replace(/\//g, '-')

const CASES: Case[] = [
  ...SCREENS.filter((s) => !SKIP_KEYS.has(s.key)).map<Case>((s) => ({
    name: slugName(s.key),
    run: async (page) => {
      await installApiMocks(page, mocks())
      await page.goto(reviewPath(s.key))
      await waitForWorkplaceReady(page)
      await settle(page)
    },
  })),
  ...(['SettingListView', 'AuthorizationListView', 'PrintoutListView', 'TicketListView'] as const).map<Case>((code) => ({
    name: `menu-${code.replace('View', '').replace('List', '').toLowerCase()}`,
    run: async (page) => {
      await installApiMocks(page, mocks(true))
      await gotoAuthed(page)
      await openScreen(page, code)
      await settle(page)
    },
  })),
  {
    name: 'siparis-detay',
    run: async (page) => {
      await installApiMocks(page, mocks())
      await page.goto('/orders')
      await waitForWorkplaceReady(page)
      await page.getByText('E2E-100001').first().waitFor()
      const row = page.locator('.orderListView tbody tr').filter({ hasText: 'E2E-100001' }).first()
      const scope = (await row.count()) ? row : page.locator('.orderListView :is(.ek-grid-card, article, li):visible').first()
      await scope.locator('button:has([class*="mdi-eye"])').first().click()
      await page.locator('.ek-detail-sheet, .v-overlay--active .v-card').first().waitFor({ timeout: 5000 }).catch(() => undefined)
      await settle(page)
    },
  },
  {
    name: 'urun-yeni',
    run: async (page) => {
      await installApiMocks(page, mocks())
      await page.goto(reviewPath('productDefinitions/ProductListView'))
      await waitForWorkplaceReady(page)
      await settle(page)
      const add = page.getByRole('button', { name: /Yeni ürün|Ürün ekle|Yeni/ }).first()
      if (await add.count()) await add.click()
      await settle(page)
    },
  },
]

async function machineFindings(page: Page) {
  return page.evaluate((vw) => {
    const vis = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect()
      const cs = getComputedStyle(el as HTMLElement)
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
    }
    const overflow: string[] = []
    const doc = document.documentElement
    if (doc.scrollWidth > vw + 1) overflow.push(`document scrollWidth=${doc.scrollWidth} > ${vw}`)
    const wa = document.querySelector('.workplace-area') as HTMLElement | null
    if (wa && wa.scrollWidth > wa.clientWidth + 1) overflow.push(`.workplace-area scrollWidth=${wa.scrollWidth} > ${wa.clientWidth}`)
    // Ekran dışına taşan görünür yaprak öğeler (yatay kaydırma kabı içindekiler hariç)
    const inScroller = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX
        if ((ox === 'auto' || ox === 'scroll' || ox === 'hidden') && p.scrollWidth > p.clientWidth + 1) return true
      }
      return false
    }
    document.querySelectorAll('.workplace-area *').forEach((el) => {
      if (el.children.length || !vis(el)) return
      const r = el.getBoundingClientRect()
      if (r.right > vw + 2 && !inScroller(el)) overflow.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(' ').slice(0, 2).join('.')} right=${Math.round(r.right)} "${(el.textContent || '').trim().slice(0, 40)}"`)
    })
    const rawKeys: string[] = []
    const badText: string[] = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent || '').trim()
      if (!t || !n.parentElement || !vis(n.parentElement)) continue
      if (['SCRIPT', 'STYLE'].includes(n.parentElement.tagName)) continue
      if (/^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+){1,}$/.test(t) && !/\.(com|tr|invalid|net|io)$/.test(t)) rawKeys.push(t)
      if (/\b(undefined|NaN|\[object Object\])\b|^null$/.test(t)) badText.push(t.slice(0, 80))
    }
    return { overflow: overflow.slice(0, 15), rawKeys: [...new Set(rawKeys)].slice(0, 20), badText: [...new Set(badText)].slice(0, 20) }
  }, WIDTH)
}

test.describe('fe-polish denetim', () => {
  test.skip(!ENABLED, 'Yalnızca POLISH_REVIEW=1 ile')
  test.describe.configure({ retries: 1 })
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })

  for (const theme of THEMES) {
    for (const c of CASES) {
      if (ONLY.length && !ONLY.some((o) => c.name.includes(o))) continue
      test(`${theme}: ${c.name}`, async ({ page }) => {
        test.setTimeout(60_000)
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await page.addInitScript((t) => localStorage.setItem('ek-theme', t), theme)
        await c.run(page)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        mkdirSync(`${OUT}/axe`, { recursive: true })
        if (SHOTS) await page.screenshot({ path: `${OUT}/${c.name}-${theme}-${WIDTH}.png` })
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        const found = await machineFindings(page)
        writeFileSync(
          `${OUT}/axe/${c.name}-${theme}-${WIDTH}.json`,
          JSON.stringify({
            screen: c.name, theme, width: WIDTH, ...found,
            axe: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} :: ${(n.failureSummary || '').split('\n').slice(1, 2).join('').trim().slice(0, 140)}`) })),
          }, null, 2),
        )
      })
    }
    if (!ONLY.length || ONLY.includes('giris')) {
      test(`${theme}: giris`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await page.addInitScript((t) => localStorage.setItem('ek-theme', t), theme)
        await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
        await page.goto('/login')
        await expect(page.getByRole('button', { name: 'Giriş', exact: true })).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(800)
        mkdirSync(`${OUT}/axe`, { recursive: true })
        if (SHOTS) await page.screenshot({ path: `${OUT}/giris-${theme}-${WIDTH}.png` })
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        writeFileSync(`${OUT}/axe/giris-${theme}-${WIDTH}.json`, JSON.stringify({ screen: 'giris', theme, width: WIDTH, ...(await machineFindings(page)), axe: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 6).map((n) => n.target.join(' ')) })) }, null, 2))
      })
    }
  }
})
