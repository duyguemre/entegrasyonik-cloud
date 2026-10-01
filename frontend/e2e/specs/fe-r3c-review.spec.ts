// fe-r3c — FR3 madde 15 (Çıktılar / şablon tasarımcısı) inceleme görüntüleri + axe bulguları (önce/sonra).
// İddia yok; yalnız görüntü ve `axe/*.json` üretir. Günlük koşuda ATLANIR.
//   R3C_REVIEW=1 R3C_WIDTH=1440|390 R3C_OUT=docs/fe-r3c-review/<before|after> [R3C_ONLY=a,b] [R3C_THEMES=light,dark] \
//     npx playwright test e2e/specs/fe-r3c-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop
import { mkdirSync, writeFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'

const ENABLED = process.env.R3C_REVIEW === '1'
const WIDTH = Number(process.env.R3C_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.R3C_OUT || 'docs/fe-r3c-review/after'
const ONLY = (process.env.R3C_ONLY || '').split(',').filter(Boolean)
const THEMES = (process.env.R3C_THEMES || 'light,dark').split(',') as Array<'light' | 'dark'>

async function open(page: Page) {
  await installApiMocks(page, { MenuService: menuFixtureWithAccountSupport })
  await gotoAuthed(page)
  await openScreen(page, 'PrintoutListView')
  await page.locator('.printoutListView').waitFor({ timeout: 10000 })
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: '[data-help-tour-offer]{display:none!important}' })
  await page.mouse.move(1, 1)
  await page.waitForTimeout(700)
}

/** Galeriden ilk "kargo etiketi" şablonunu düzenleyicide açar (yeni tasarım; eski ekranda yok). */
async function openEditor(page: Page, name = /Kargo etiketi/) {
  await page.locator('.ek-tpl-card').filter({ hasText: name }).first().getByRole('button', { name: /Düzenle|Kopyasını düzenle/ }).click()
  await page.locator('.ek-tpl-editor').waitFor({ timeout: 5000 })
}

type Case = { name: string; run: (page: Page) => Promise<void> }
const CASES: Case[] = [
  { name: 'ciktilar', run: async (p) => { await open(p) } },
  { name: 'editor', run: async (p) => { await open(p); await openEditor(p); await p.locator('.ek-tpl-el').nth(1).click() } },
  { name: 'editor-fatura', run: async (p) => { await open(p); await openEditor(p, /Sipariş fişi/) } },
  { name: 'onizleme', run: async (p) => { await open(p); await openEditor(p); await p.getByRole('button', { name: /Önizle/ }).first().click(); await p.locator('.ek-tpl-preview').waitFor() } },
]

test.describe('fe-r3c inceleme', () => {
  test.skip(!ENABLED, 'Yalnızca R3C_REVIEW=1 ile')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })

  for (const theme of THEMES) {
    for (const c of CASES) {
      if (ONLY.length && !ONLY.includes(c.name)) continue
      test(`${theme}: ${c.name}`, async ({ page }) => {
        test.setTimeout(60_000)
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
        await page.addInitScript((t) => localStorage.setItem('ek-theme', t), theme)
        await c.run(page)
        await settle(page)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        mkdirSync(`${OUT}/axe`, { recursive: true })
        await page.screenshot({ path: `${OUT}/${c.name}-${theme}-${WIDTH}.png` })
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        const overflow = await page.evaluate((vw) => document.documentElement.scrollWidth > vw + 1, WIDTH)
        writeFileSync(
          `${OUT}/axe/${c.name}-${theme}-${WIDTH}.json`,
          JSON.stringify({
            screen: c.name, theme, width: WIDTH, documentOverflowX: overflow,
            axe: axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, targets: v.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} :: ${(n.failureSummary || '').split('\n').slice(1, 2).join('').trim().slice(0, 140)}`) })),
          }, null, 2),
        )
      })
    }
  }
})
