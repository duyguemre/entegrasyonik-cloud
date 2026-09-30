// A12 — ana sekme şeridi PASİF sekme davranışı (DESIGN_SYSTEM.md §19). Görsel taban yok; ölçüm iddiaları:
//   - hover yalnız renk/opaklık değiştirir: tüm sekmelerin kutuları (sekme, düğme, başlık, kapatma) hover öncesi/sonrası EŞİT
//   - etkin ↔ pasif geçişte yatay kayma yok (hayalet kalın başlık); kapatmanın yeri her zaman ayrılı
//   - pasif metin/ikon AA; klavye odak halkası tüm sekmeyi sarar; reduced-motion'da geçiş yok; 390px'te yatay kaydırma
import { expect, test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { waitForWorkplaceReady } from '../fixtures/nav'

const TABS = ['OrderListView', 'ClaimListView', 'CustomerListView', 'InvoiceListView']

async function openTabs(page: Page) {
  await installApiMocks(page, reviewMocks())
  for (const key of TABS) {
    await page.goto(reviewPath(key)).catch(() => undefined)
    await waitForWorkplaceReady(page)
  }
  await expect(page.locator('.ek-tabs .ek-tab')).toHaveCount(TABS.length)
  await page.locator('.ek-tabs [role=tab]').first().click()
  await page.mouse.move(5, 790)
  await page.waitForTimeout(300)
}

/** Her sekmenin (sekme, düğme, başlık, kapatma) kutusu + yerleşimi etkileyen hesaplanmış stiller. Konum şerit İÇERİĞİNE
 *  göredir (liste kaydırılsa da — ör. hover'ın görünür alana kaydırması — ölçü sekmenin kendi yerleşimini verir). */
function snapshot(page: Page) {
  return page.$$eval('.ek-tabs .ek-tab', (tabs) =>
    tabs.map((tab) => {
      const list = tab.closest<HTMLElement>('.ek-tabs__list')!
      const origin = list.getBoundingClientRect().x - list.scrollLeft
      const part = (sel: string) => {
        const el = sel === ':scope' ? (tab as HTMLElement) : tab.querySelector<HTMLElement>(sel)
        if (!el || getComputedStyle(el).display === 'none') return null // 390px'te pasif kapatma gizli
        const b = el.getBoundingClientRect()
        const r = { x: b.x - origin, y: b.y, width: b.width, height: b.height }
        const cs = getComputedStyle(el)
        return { x: r.x, y: r.y, w: r.width, h: r.height, pad: cs.padding, bw: cs.borderWidth, fw: sel === '.ek-tab__title' ? undefined : cs.fontWeight }
      }
      return { tab: part(':scope'), button: part('.ek-tab__button'), title: part('.ek-tab__title'), close: part('.ek-tab__close') }
    }),
  )
}

function luminance(rgb: string) {
  const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map((v) => {
    const c = Number(v) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

test.describe('A12 — pasif sekmeler', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'masaüstü (390px ayrı blokta)')

  test('hover: layout shift 0 (tüm sekme kutuları ve yerleşim stilleri eşit), yalnız ışıma katmanı + renk değişir', async ({ page }) => {
    await openTabs(page)
    const target = page.locator('.ek-tabs .ek-tab').nth(2)
    const wash = target.locator('.ek-tab__wash')
    const close = target.locator('.ek-tab__close')
    await expect(wash).toHaveCSS('opacity', '0')
    await expect(close).toHaveCSS('opacity', '0')
    const before = await snapshot(page)
    const colorBefore = await target.evaluate((el) => getComputedStyle(el).color)

    await target.hover()
    await expect(wash).toHaveCSS('opacity', '1')
    await expect(close).toHaveCSS('opacity', '1')
    await page.waitForTimeout(250)
    expect(await snapshot(page)).toEqual(before)
    expect(await target.evaluate((el) => getComputedStyle(el).color)).not.toBe(colorBefore)
    // transform/scale yok
    expect(await target.evaluate((el) => getComputedStyle(el).transform)).toBe('none')
  })

  test('etkin ↔ pasif: yatay kayma yok, başlık kutusu (hayalet kalın) ve kapatma yeri sabit', async ({ page }) => {
    await openTabs(page)
    const before = await snapshot(page)
    await page.locator('.ek-tabs [role=tab]').nth(2).click()
    await page.mouse.move(5, 790)
    await page.waitForTimeout(300)
    const after = await snapshot(page)
    for (let i = 0; i < before.length; i++) {
      for (const k of ['tab', 'title', 'close'] as const) {
        if (!before[i][k]) continue // ilk sekme (Anasayfa) kapatılamaz
        expect(after[i][k]!.x, `${i}.${k}.x`).toBe(before[i][k]!.x)
        expect(after[i][k]!.w, `${i}.${k}.w`).toBe(before[i][k]!.w)
      }
      // Etkin sekme yukarı doğru 2px büyür (A10 klasör sekmesi); alt kenar sabit.
      expect(after[i].tab!.y + after[i].tab!.h).toBe(before[i].tab!.y + before[i].tab!.h)
    }
  })

  test('pasif metin/ikon ve hover metni AA (≥ 4.5:1) — şerit/ışıma zeminine karşı', async ({ page }) => {
    await openTabs(page)
    const strip = await page.locator('.ek-tabs').evaluate((el) => getComputedStyle(el).backgroundColor)
    const tab = page.locator('.ek-tabs .ek-tab').nth(2)
    const text = await tab.evaluate((el) => getComputedStyle(el).color)
    const icon = await tab.locator('.ek-tab__icon').evaluate((el) => getComputedStyle(el).color)
    expect(contrast(text, strip)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(icon, strip)).toBeGreaterThanOrEqual(4.5)
    await tab.hover()
    await page.waitForTimeout(250)
    // Işıma üstte `tab-hover`, altta şerit tonuna söner → metin iki uca karşı da AA.
    const hoverBg = await tab.evaluate((el) => getComputedStyle(el).getPropertyValue('--ek-color-tab-hover'))
    const hoverText = await tab.evaluate((el) => getComputedStyle(el).color)
    expect(contrast(hoverText, hoverBg)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(hoverText, strip)).toBeGreaterThanOrEqual(4.5)
  })

  test('klavye odağı: halka tüm sekmeyi (kapatma dahil) sarar, kapatma belirginleşir', async ({ page }) => {
    await openTabs(page)
    await page.locator('.ek-tabs [role=tab][aria-selected=true]').focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    const tab = page.locator('.ek-tabs .ek-tab').nth(2)
    await expect(tab.locator('[role=tab]')).toBeFocused()
    const ring = await tab.evaluate((el) => {
      const cs = getComputedStyle(el, '::after')
      const r = el.getBoundingClientRect()
      return { shadow: cs.boxShadow, content: cs.content, w: parseFloat(cs.width), tabW: r.width }
    })
    expect(ring.content).not.toBe('none')
    expect(ring.shadow).toMatch(/0px 0px 0px 2px inset/)
    expect(ring.w).toBeCloseTo(ring.tabW, 0)
    await expect(tab.locator('.ek-tab__close')).toHaveCSS('opacity', '1')
  })

  test('reduced-motion: ışıma/kapatma/renk geçişleri kapalı', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openTabs(page)
    const tab = page.locator('.ek-tabs .ek-tab').nth(2)
    for (const sel of ['.ek-tab__wash', '.ek-tab__close']) {
      expect(await tab.locator(sel).evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s(, 0s)*$/)
    }
    expect(await tab.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s(, 0s)*$/)
  })
})

test.describe('A12 — pasif sekmeler 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('dar ekranda sekmeler sabit genişlik + yatay kaydırma; hover yine layout shift 0', async ({ page }) => {
    await openTabs(page)
    const list = page.locator('.ek-tabs__list')
    expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    await expect(page.locator('.ek-tabs__arrow--end')).toBeVisible()
    const widths = await page.$$eval('.ek-tabs .ek-tab', (t) => t.map((el) => el.getBoundingClientRect().width))
    expect(new Set(widths).size).toBe(1)
    const before = await snapshot(page)
    await page.locator('.ek-tabs .ek-tab').nth(1).hover()
    await page.waitForTimeout(250)
    expect(await snapshot(page)).toEqual(before)
  })
})

test.describe('A12 — hover plakası içerikle birleşmez', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1000, 'masaüstü')

  test('ışıma katmanı şeridin alt çizgisinin ÜSTÜNDE biter (çizgi hover sekmesinin altında görünür kalır)', async ({ page }) => {
    await openTabs(page)
    const tab = page.locator('.ek-tabs .ek-tab').nth(2)
    await tab.hover()
    const [wash, strip] = await Promise.all([
      tab.locator('.ek-tab__wash').evaluate((el) => el.getBoundingClientRect().bottom),
      page.locator('.ek-tabs').evaluate((el) => el.getBoundingClientRect().bottom),
    ])
    expect(strip - wash).toBe(1)
  })
})
