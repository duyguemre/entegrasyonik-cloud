// MOB-00 — mobil kullanılabilirlik denetimi (360 / 390 / 430 px, dokunmatik cihaz öykünmesi).
// Akışlar: pano (kabuk), ürün listesi, yeni ürün formu, sipariş listesi, sipariş detayı, kargoya ver onayı, stok sağlığı, Otopilot paneli.
// Her ekranda ölçülür: (1) sayfa düzeyinde yatay kaydırma (tablo gibi kendi içinde kayan kaplar hariç),
// (2) dokunmatik hedefler (görünür etkileşimli öğe; WCAG 2.5.5 hedefi 44×44 px), (3) odaklanan alanın klavye/görünüm alanında kalması.
// Kapı (günlük koşu, yalnız chromium-mobile projesinde): yatay kaydırma YOK ve kritik eylem hedefleri ≥ 44 px.
// İnceleme (MOB_REVIEW=1): ekran görüntüsü + bulgu JSON'u → MOB_OUT (varsayılan docs/fe-mobdesk-review/<genişlik>).
//   MOB_REVIEW=1 MOB_WIDTHS=390,430 npx playwright test e2e/specs/mob-00-mobile.spec.ts -c playwright.cloud.config.ts --project=chromium-mobile
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { installApiMocks, type MockValue } from '../fixtures/mockApi'
import { gotoAuthed, menuFixture, openScreen } from '../fixtures/nav'
import { menuFixtureWithStockHealth, stockOverviewDoluFixture } from '../fixtures/stockHealth'
import { gotoWithOtopilot, openPanel } from '../fixtures/otopilot'

const REVIEW = process.env.MOB_REVIEW === '1'
const WIDTHS = (process.env.MOB_WIDTHS || '360,390,430').split(',').map(Number)
const TARGET = 44

const menu = [
  ...menuFixtureWithStockHealth,
  ...menuFixture.filter((g) => !menuFixtureWithStockHealth.some((h: { group: string }) => h.group === g.group)),
  { group: 'mobHidden', links: [{ code: 'ProductDefinitionView', parent: 'definitions', title: 'productDefinition', singleton: true }] },
]
const overrides: Record<string, MockValue> = { MenuService: menu, 'StockService/getStockOverview': stockOverviewDoluFixture }

async function authed(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('ek.help.v1.tour', 'dismissed')
      localStorage.setItem('ek-pwa-install-dismissed', '1')
    } catch {
      /* depolama kapalı */
    }
  })
  await installApiMocks(page, overrides)
  await gotoAuthed(page)
}

async function openOrderDetail(page: Page) {
  await openScreen(page, 'OrderListView')
  const row = page.locator('.orderListView tbody tr').first()
  await row.waitFor()
  await row.locator('button:has([class*="mdi-eye"])').click()
  await page.locator('.ek-detail-sheet, .orderDetail, [role="dialog"]').first().waitFor({ timeout: 10000 })
}

type Flow = { name: string; critical: string[]; run: (page: Page) => Promise<void> }
const FLOWS: Flow[] = [
  { name: 'pano', critical: ['[data-header-action]', '.v-app-bar button'], run: async (p) => { await authed(p) } },
  {
    name: 'urun-listesi',
    critical: ['button:text-is("Yeni ürün")'],
    run: async (p) => { await authed(p); await openScreen(p, 'ProductListView'); await p.locator('.productListView').first().waitFor() },
  },
  {
    name: 'urun-formu',
    critical: ['.productDefinitionView button:text-is("Kaydet")'],
    run: async (p) => {
      await authed(p)
      await openScreen(p, 'ProductListView')
      await p.getByRole('button', { name: 'Yeni ürün', exact: true }).click()
      await p.locator('.productDefinitionView').waitFor()
    },
  },
  {
    name: 'siparis-listesi',
    critical: ['.orderListView tbody tr button'],
    run: async (p) => { await authed(p); await openScreen(p, 'OrderListView'); await p.locator('.orderListView tbody tr').first().waitFor() },
  },
  { name: 'siparis-detayi', critical: [], run: async (p) => { await authed(p); await openOrderDetail(p) } },
  {
    name: 'kargoya-ver',
    critical: ['.v-overlay--active button:text-is("Kargoya ver")', '.v-overlay--active button:text-is("Vazgeç")', 'button:text-is("Kargoya ver (1)")'],
    run: async (p) => {
      // Onaylı sipariş (fixture'da 2. satır) seçilir → toplu "Kargoya ver (1)" → onay diyaloğu.
      await authed(p)
      await openScreen(p, 'OrderListView')
      await p.locator('.orderListView tbody tr').nth(1).getByRole('checkbox').first().check()
      await p.getByRole('button', { name: 'Kargoya ver (1)' }).click()
      await p.getByText('1 sipariş kargoya verilsin mi?').waitFor()
    },
  },
  { name: 'stok', critical: [], run: async (p) => { await authed(p); await openScreen(p, 'StockHealthView'); await p.locator('.stockHealthView').waitFor() } },
  {
    name: 'otopilot',
    critical: ['button[aria-label="Paneli kapat"]'],
    run: async (p) => { await gotoWithOtopilot(p, 'enabled', { overrides }); await openPanel(p) },
  },
]

interface Finding { label: string; w: number; h: number; sel: string }
interface Audit { overflowX: number; wideOffenders: string[]; smallTargets: Finding[]; criticalSmall: Finding[] }

async function audit(page: Page, critical: string[]): Promise<Audit> {
  const criticalHandles = []
  for (const sel of critical) criticalHandles.push(...(await page.locator(sel).elementHandles()))
  return page.evaluate(
    ({ target, criticalEls }) => {
      const vw = window.innerWidth
      const describe = (el: Element) => {
        const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 3).join('.')
        return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`
      }
      const scrollsX = (el: Element | null): boolean => {
        for (let n = el?.parentElement; n && n !== document.body; n = n.parentElement) {
          const s = getComputedStyle(n)
          if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && n.scrollWidth >= n.clientWidth) return true
        }
        return false
      }
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect()
        const s = getComputedStyle(el)
        // Kapalı çekmeceler ekran dışına ötelenir: yatayda görünüm alanı dışındaki öğe sayılmaz.
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < window.innerHeight * 3 && r.right > 0 && r.left < vw
      }
      const wideOffenders = [...document.querySelectorAll('body *')]
        .filter((el) => visible(el) && el.getBoundingClientRect().right > vw + 1 && !scrollsX(el))
        .slice(0, 12)
        .map(describe)
      const interactive = [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], input:not([type="hidden"]), select, textarea, [role="checkbox"], [role="switch"]')]
      const measure = (el: Element): Finding => {
        // Vuetify seçim kontrollerinde dokunma alanı sarmalayıcıdır.
        const hit = el.closest('.v-selection-control__wrapper, .v-field, .ek-grid__check-hit') ?? el
        const r = hit.getBoundingClientRect()
        // Görünmez dokunma alanı genişletmesi (::before, touch.css / bileşen içi) etkin hedefi büyütür.
        const pseudo = getComputedStyle(hit, '::before')
        const ext = pseudo.content !== 'none' && pseudo.position === 'absolute'
        const w = ext ? Math.max(r.width, parseFloat(pseudo.width) || 0) : r.width
        const h = ext ? Math.max(r.height, parseFloat(pseudo.height) || 0) : r.height
        const label = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('title') || '').trim().slice(0, 40)
        return { label, w: Math.round(w), h: Math.round(h), sel: describe(el) }
      }
      const inlineTextLink = (el: Element) => el.tagName === 'A' && getComputedStyle(el).display === 'inline'
      const smallTargets = interactive
        .filter((el) => visible(el) && !inlineTextLink(el) && !(el as HTMLButtonElement).disabled)
        .map(measure)
        .filter((f) => f.w < target || f.h < target)
      const criticalSmall = (criticalEls as Element[]).filter(visible).map(measure).filter((f) => f.w < target || f.h < target)
      return { overflowX: document.documentElement.scrollWidth - vw, wideOffenders, smallTargets, criticalSmall }
    },
    { target: TARGET, criticalEls: criticalHandles },
  )
}

for (const width of WIDTHS) {
  test.describe(`MOB-00 @${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    test.beforeEach(({}, info) => test.skip(info.project.name !== 'chromium-mobile', 'Mobil denetim yalnız chromium-mobile projesinde'))

    for (const flow of FLOWS) {
      test(flow.name, async ({ page }) => {
        test.setTimeout(60_000)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await flow.run(page)
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(300)
        const result = await audit(page, flow.critical)
        if (REVIEW) {
          const out = process.env.MOB_OUT || `docs/fe-mobdesk-review/${width}`
          mkdirSync(`${out}/audit`, { recursive: true })
          writeFileSync(`${out}/audit/${flow.name}.json`, JSON.stringify(result, null, 2))
          await page.screenshot({ path: `${out}/${flow.name}.png` })
          return
        }
        expect(result.overflowX, `yatay kaydırma; taşan öğeler: ${result.wideOffenders.join(', ')}`).toBeLessThanOrEqual(0)
        expect(result.criticalSmall, 'kritik eylem hedefi < 44 px').toEqual([])
      })
    }

    test('klavye/görünüm alanı: yakınlaştırma serbest, alan yazısı ≥16 px (iOS odakta otomatik yakınlaştırmaz)', async ({ page }) => {
      test.skip(REVIEW, 'inceleme koşusunda atlanır')
      await FLOWS.find((f) => f.name === 'urun-formu')!.run(page)
      const meta = await page.locator('meta[name="viewport"]').getAttribute('content')
      expect(meta).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/)
      expect(meta).toContain('interactive-widget=resizes-content')
      const small = await page.locator('input:visible, textarea:visible, select:visible').evaluateAll((els) =>
        els.map((el) => ({ n: el.getAttribute('aria-label') || el.getAttribute('name') || el.id, fs: parseFloat(getComputedStyle(el).fontSize) })).filter((x) => x.fs < 16),
      )
      expect(small).toEqual([])
    })
  })
}
