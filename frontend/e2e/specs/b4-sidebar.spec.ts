// B4 — sol menü davranışı: vurgu rengi YALNIZ etkin öğede, hover/odak/etkinleşme layout shift 0, daralmada ikonlar
// yerinde (yatayda aynı eksen), reduced-motion'da anında; breadcrumb yardım tetikleyicisi davranışı korunur.
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, openScreen } from '../fixtures/nav'

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1280

/** Menüdeki tüm düğmelerin kutuları + vurgu rengini taşıyan öğeler. */
async function snapshot(page: Page) {
  return page.locator('.v-navigation-drawer.soft-nav').evaluate((drawer) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--ek-color-action-emphasis)'
    drawer.appendChild(probe)
    const accent = getComputedStyle(probe).color
    probe.remove()
    const buttons = [...drawer.querySelectorAll<HTMLElement>('.ek-side__item, .ek-side__subitem')].filter((b) => b.offsetParent)
    return {
      boxes: buttons.map((b) => {
        const r = b.getBoundingClientRect()
        return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(',')
      }),
      accented: buttons.filter((b) => getComputedStyle(b).color === accent).map((b) => b.textContent?.trim()),
      sectionLabels: [...drawer.querySelectorAll<HTMLElement>('.ek-side__section-label')].map((l) => getComputedStyle(l).color),
      accent,
    }
  })
}

test.describe('B4 — sol menü', () => {
  test('vurgu rengi yalnız etkin sayfada; grup ve bölüm başlıkları nötr', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    if (!isDesktop(page)) {
      const { openDrawer } = await import('../fixtures/nav')
      await openDrawer(page)
    }
    await page.mouse.move(2, 2)
    const s = await snapshot(page)
    expect(s.accented).toEqual(['Ürünler'])
    for (const c of s.sectionLabels) expect(c).not.toBe(s.accent)
    const group = page.locator('.v-navigation-drawer.soft-nav .v-list-group__header').filter({ has: page.locator('.mdi-tag-outline') })
    await expect(group).not.toHaveCSS('color', s.accent)
  })

  test('hover, klavye odağı ve etkinleşme layout shift üretmez (tüm kutular aynı)', async ({ page }) => {
    test.skip(!isDesktop(page), 'kalıcı tam menü masaüstünde')
    await installApiMocks(page)
    await gotoAuthed(page)
    await page.mouse.move(2, 2)
    const before = (await snapshot(page)).boxes
    const items = page.locator('.v-navigation-drawer.soft-nav .soft-item')
    await items.nth(3).hover()
    expect((await snapshot(page)).boxes).toEqual(before)
    await items.nth(4).focus()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Shift+Tab')
    expect((await snapshot(page)).boxes).toEqual(before)
    // Etkinleşme: grupsuz bir ekran aç → yalnız renk/zemin değişir.
    await openScreen(page, 'OrderListView')
    await page.mouse.move(2, 2)
    expect((await snapshot(page)).boxes).toEqual(before)
  })

  test('daralma: ikonlar aynı x ekseninde kalır, ray 64px; genişleyince geri döner', async ({ page }) => {
    test.skip(!isDesktop(page), 'ray tercihi masaüstünde')
    await installApiMocks(page)
    await gotoAuthed(page)
    const iconXs = () =>
      page.locator('.v-navigation-drawer .ek-side__icon').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x + e.getBoundingClientRect().width / 2)))
    const full = await iconXs()
    await page.locator('.collapse-btn').click()
    const rail = page.locator('.v-navigation-drawer.soft-rail')
    await expect(rail).toBeVisible()
    await expect(async () => expect(Math.round((await rail.boundingBox())!.width)).toBe(64)).toPass()
    const railed = await iconXs()
    expect(railed).toEqual(full)
    for (const x of railed) expect(Math.abs(x - 32)).toBeLessThanOrEqual(1)
    // Rayda etiketler görünmez, ad tooltip/aria-label'da.
    await expect(rail.locator('.ek-side__label').first()).toHaveCSS('opacity', '0')
    await expect(rail.locator('button[aria-label="Sipariş Yönetimi"]')).toBeVisible()
    await page.locator('.rail-logo-btn').click()
    await expect(page.locator('.v-navigation-drawer.soft-nav')).toBeVisible()
    await expect(async () => expect(Math.round((await page.locator('.v-navigation-drawer.soft-nav').boundingBox())!.width)).toBe(248)).toPass()
  })

  test('reduced-motion: daralma anında (geçiş süresi 0)', async ({ page }) => {
    test.skip(!isDesktop(page), 'ray tercihi masaüstünde')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await installApiMocks(page)
    await gotoAuthed(page)
    await page.locator('.collapse-btn').click()
    const width = await page.locator('.v-navigation-drawer.soft-rail').evaluate((el) => {
      const cs = getComputedStyle(el)
      return { w: Math.round(el.getBoundingClientRect().width), dur: cs.transitionDuration, delay: cs.transitionDelay }
    })
    expect(width.w).toBe(64)
    expect(width.dur.split(',').every((d) => parseFloat(d) === 0)).toBe(true)
    await page.locator('.rail-logo-btn').click()
  })
})

test.describe('B4 — breadcrumb yardım tetikleyicisi', () => {
  test('nötr yuvarlak düğme: panel açar/kapar (aria-expanded), vurgu rengi taşımaz', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    const help = page.locator('.workplace-area .orderListView').getByRole('button', { name: /^Sayfa hakkında/ })
    const box = (await help.boundingBox())!
    expect(Math.round(box.width)).toBe(24)
    await expect(help).toHaveAttribute('aria-expanded', 'false')
    await help.click()
    await expect(help).toHaveAttribute('aria-expanded', 'true')
    const accent = await help.evaluate(() => {
      const p = document.createElement('span')
      p.style.color = 'var(--ek-color-action)'
      document.body.appendChild(p)
      const c = getComputedStyle(p).color
      p.remove()
      return c
    })
    await expect(help).not.toHaveCSS('color', accent)
    await help.click()
    await expect(help).toHaveAttribute('aria-expanded', 'false')
  })
})
