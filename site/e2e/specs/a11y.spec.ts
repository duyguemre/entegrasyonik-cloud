import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { isDesktop, waitForFonts } from '../helpers'

// WCAG 2.1 AA (ADR-0014 / premium-ui-standards): her sayfa 3 viewport'ta 0 ihlal.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function expectNoViolations(page: import('@playwright/test').Page) {
  await waitForFonts(page)
  // Sahne animasyonları (giriş + 12 sn'lik döngü) geçiş anında opaklığı düşürür ve kontrast ölçümünü bozar: axe, sahnelerin
  // ANLAMLI STATİK SON DURUMU üzerinde çalışır (animasyonlar iptal edilince elemanlar kendi statik değerine döner).
  await page.evaluate(() => document.getAnimations().forEach((a) => a instanceof CSSAnimation && a.cancel()))
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => n.target.join(' ')),
  }))
  expect(summary).toEqual([])
}

test.describe('axe — WCAG 2.1 AA', () => {
  for (const [name, path] of [
    ['ana sayfa', '/'],
    ['404', '/olmayan-bir-sayfa'],
    ['bileşen önizleme', '/bilesen-onizleme'],
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(path)
      await expectNoViolations(page)
    })
  }

  test('mobil/tablet menüsü açıkken', async ({ page }) => {
    test.skip(isDesktop(page), 'yalnızca mobil/tablet')
    await page.goto('/')
    await page.getByTestId('menu-toggle').click()
    await expectNoViolations(page)
  })

  test('odak halkası klavye odağında görünür (WCAG 2.4.7)', async ({ page, browserName }) => {
    // WebKit'te Tab varsayılan olarak bağlantılara gitmez (Safari ayarı): odak programatik verilir.
    await page.goto('/')
    if (browserName === 'webkit') await page.getByRole('link', { name: 'Ana içeriğe geç' }).focus()
    else await page.keyboard.press('Tab')
    const outline = await page.getByRole('link', { name: 'Ana içeriğe geç' }).evaluate((el) => {
      const s = getComputedStyle(el)
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }
    })
    expect(outline.style).not.toBe('none')
    // Firefox 2 px'lik halkayı 1.8 olarak bildirir → eşik 1.5
    expect(outline.width).toBeGreaterThanOrEqual(1.5)
  })
})
