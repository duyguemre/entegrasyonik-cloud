// BO-R2a (K59): sistem katmanı güvenceleri — genel bakış önceliklendirme (BO2-P1), teknik ayrıntılar hizası (BO2-P2),
// eş yükseklik (BO2-12), yatay kaydırma yok (BO2-71), ECharts sarmalayıcısı (BO2-60). Sahte /admin-api; görsel taban YOK.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectNoA11yViolations, settle, signInFully } from '../support/session'

async function noHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  expect(sw, 'sayfa yatay kaymamalı').toBeLessThanOrEqual(cw + 1)
}

/** Aynı satırdaki kutular: üst kenar ve yükseklik eşit (±1 px). */
async function rowAligned(grid: Locator) {
  const boxes = await grid.locator(':scope > *').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), h: Math.round(r.height) })))
  const rows = new Map<number, number[]>()
  for (const b of boxes) rows.set(b.top, [...(rows.get(b.top) ?? []), b.h])
  for (const [, hs] of rows) expect(Math.max(...hs) - Math.min(...hs), 'aynı satırdaki kutular eş yükseklikte').toBeLessThanOrEqual(1)
  return boxes.length
}

test.describe('BO-R2a genel bakış ve sistem katmanı', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('önemli metrikler öne: KPI şeridi + açıklamalar katlanır; eylem görünür', async ({ page }) => {
    await settle(page)
    const kpis = page.getByTestId('overview-kpis')
    await expect(kpis.locator('[data-bo-stat]')).toHaveCount(6)
    await expect(kpis.locator('[data-kpi="critical"]')).toContainText('Kritik konu')
    await expect(kpis.locator('[data-kpi="critical"]')).toContainText('3')
    const sistem = page.getByTestId('triage-sistem')
    // Açıklama ikinci planda: "Neden ve ne yapmalı" kapalı, eylem bağlantısı görünür.
    const toggle = sistem.locator('[data-bo-collapsible] button').first()
    await expect(toggle).toHaveAccessibleName('Neden ve ne yapmalı')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(sistem.getByTestId('attention-action').first()).toBeVisible()
    await expect(sistem.getByText('NE YAPMALI', { exact: false })).toHaveCount(0)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(toggle).toHaveAccessibleName('Açıklamayı gizle')
    await expect(sistem.locator('.bo-al__advice').first()).toBeVisible()
    await noHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })

  test('grafik: erişilebilir özet + "Tablo olarak göster"', async ({ page }) => {
    await settle(page)
    const chart = page.getByTestId('triage-buyuk-resim').locator('[data-bo-chart]').last()
    await expect(chart.getByRole('img', { name: /^Saatlik API isteği, son 24 saat\. İstek: toplam/ })).toBeVisible()
    await chart.getByRole('button', { name: 'Tablo olarak göster' }).click()
    await expect(chart.getByRole('region', { name: /tablosu$/ })).toBeVisible()
    await expect(chart.locator('tbody tr')).toHaveCount(24)
  })

  test('teknik ayrıntılar: kutular hizalı ve eş yükseklikte; yatay kaydırma yok', async ({ page }, info) => {
    await page.goto('/genel-bakis?ayrinti=teknik')
    await settle(page)
    await expect(page.getByRole('heading', { name: 'Bağımlılıklar', exact: true })).toBeVisible()
    const n1 = await rowAligned(page.getByTestId('tech-row-1'))
    const n2 = await rowAligned(page.getByTestId('tech-row-2'))
    expect(n1 + n2).toBe(5)
    if (info.project.name !== 'chromium-mobile') {
      // 1440: ilk satır üç kutu yan yana (aynı üst kenar).
      const tops = await page.getByTestId('tech-row-1').locator(':scope > *').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size)
      expect(tops).toBe(1)
    }
    await noHorizontalScroll(page)
    await expectNoA11yViolations(page)
  })

  test('sayfa başlığı standardı: ikon + h1 + açıklama; Yenile sözlükten (Alt+R hedefi)', async ({ page }, info) => {
    for (const path of ['/genel-bakis', '/motor', '/musteriler']) {
      await page.goto(path)
      await settle(page)
      const head = page.locator('header.bo-ph')
      // Masaüstünde ekran ikonu kapsülde; < 600 px gizli (dikey alan).
      if (info.project.name === 'chromium-mobile') await expect(head.locator('.bo-ph__icon')).toBeHidden()
      else await expect(head.locator('.bo-ph__icon')).toBeVisible()
      await expect(head.locator('h1')).toHaveCount(1)
      await expect(head.locator('[data-page-refresh][data-action="refresh"]')).toHaveText(/Yenile/)
      await noHorizontalScroll(page)
    }
  })
})
