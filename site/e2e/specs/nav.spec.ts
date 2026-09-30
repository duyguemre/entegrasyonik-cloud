/**
 * S23 (SR2-NAV / SR2-ENTITY 7) — gruplanmış üst menü + footer düzeni.
 * Masaüstü: disclosure düğmeleri (aria-expanded/aria-controls), klavye (Enter/Space, ↓/↑, ←/→, Home/End, Esc), odak
 * tuzağı yok, dışarı tıklama; mobil/tablet: <details> çekmece + grup akordeonu. 1280/1440/390'da yatay taşma yok.
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { isDesktop, waitForFonts } from '../helpers'
import { AGENT_BRAND } from '../../src/data/agent-brand'

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const nav = (page: Page) => page.locator('.nav-desktop')
const trigger = (page: Page, name: string) => nav(page).getByRole('button', { name, exact: true })
const focusedText = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.innerText?.trim() ?? '')

async function noHorizontalOverflow(page: Page) {
  const r = await page.evaluate(() => {
    const bar = document.querySelector('.site-header .bar')!.getBoundingClientRect()
    const kids = [...document.querySelectorAll('.site-header .bar > *')]
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => el.getBoundingClientRect())
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      right: Math.max(...kids.map((k) => k.right)) - bar.right,
      left: bar.left - Math.min(...kids.map((k) => k.left)),
      tops: kids.map((k) => Math.round(k.top)),
    }
  })
  expect(r.page, 'sayfa yatay taşma').toBeLessThanOrEqual(0)
  expect(r.right, 'header sağ taşma').toBeLessThanOrEqual(0)
  expect(r.left, 'header sol taşma').toBeLessThanOrEqual(0)
  // tek satır: tüm üst çubuk öğeleri aynı satırda (sarma yok)
  expect(Math.max(...r.tops) - Math.min(...r.tops), 'header tek satır').toBeLessThan(40)
}

test.describe('S23 üst menü — masaüstü', () => {
  test.beforeEach(({ page }) => {
    test.skip(!isDesktop(page), 'yalnızca masaüstü')
  })

  for (const width of [1024, 1280, 1440]) {
    test(`${width}px: taşma yok, gruplar + doğrudan bağlantı + CTA'lar tek satırda (hareket kontrolü dahil)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/') // ana sayfa: hareket kontrolü de çubukta
      await waitForFonts(page)
      await noHorizontalOverflow(page)
      for (const g of ['Ürün', 'Çözümler', 'Kaynaklar']) await expect(trigger(page, g)).toBeVisible()
      await expect(nav(page).getByRole('link', { name: 'Fiyatlar', exact: true })).toBeVisible()
      await expect(page.getByTestId('register-link')).toBeVisible()
      // açık panel de görünüm alanına sığar
      for (const g of ['Ürün', 'Çözümler', 'Kaynaklar']) {
        await trigger(page, g).click()
        const box = (await page.locator(`#${await trigger(page, g).getAttribute('aria-controls')}`).boundingBox())!
        expect(box.x, g).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width, g).toBeLessThanOrEqual(width)
      }
      await noHorizontalOverflow(page)
    })
  }

  test('düğme: aria-expanded/aria-controls, tıkla aç-kapa, aynı anda tek panel, dışarı tıkla kapat', async ({ page }) => {
    await page.goto('/sss')
    const urun = trigger(page, 'Ürün')
    const kaynak = trigger(page, 'Kaynaklar')
    const panelOf = async (t: typeof urun) => page.locator(`#${await t.getAttribute('aria-controls')}`)
    await expect(urun).toHaveAttribute('aria-expanded', 'false')
    await expect(await panelOf(urun)).toBeHidden()

    await urun.click()
    await expect(urun).toHaveAttribute('aria-expanded', 'true')
    await expect(await panelOf(urun)).toBeVisible()

    await kaynak.click()
    await expect(urun).toHaveAttribute('aria-expanded', 'false')
    await expect(kaynak).toHaveAttribute('aria-expanded', 'true')
    // bulunulan sayfa: panelde aria-current, grup düğmesi aktif işaretli
    await expect((await panelOf(kaynak)).getByRole('link', { name: 'SSS', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(kaynak).toHaveAttribute('data-active', 'true')

    await kaynak.click()
    await expect(kaynak).toHaveAttribute('aria-expanded', 'false')

    await urun.click()
    await page.mouse.click(10, 600)
    await expect(urun).toHaveAttribute('aria-expanded', 'false')
  })

  test('klavye: Enter aç, ↓ ilk bağlantı, ↓/↑ dolaş, Esc kapat + odak düğmeye, ←/→ üst düzey', async ({ page }) => {
    await page.goto('/')
    const urun = trigger(page, 'Ürün')
    await urun.focus()
    await page.keyboard.press('Enter')
    await expect(urun).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Space')
    await expect(urun).toHaveAttribute('aria-expanded', 'false')

    await page.keyboard.press('ArrowDown')
    await expect(urun).toHaveAttribute('aria-expanded', 'true')
    expect(await focusedText(page)).toBe('Özellikler')
    await page.keyboard.press('ArrowDown')
    expect(await focusedText(page)).toBe('Entegrasyonlar')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp') // sondan sarar → S24: son bağlantı paneldeki öne çıkan kart (Otopilot)
    expect(await focusedText(page)).toContain(AGENT_BRAND)
    await page.keyboard.press('ArrowUp')
    expect(await focusedText(page)).toBe('Güvenlik')
    await page.keyboard.press('Home')
    expect(await focusedText(page)).toBe('Özellikler')

    await page.keyboard.press('Escape')
    await expect(urun).toHaveAttribute('aria-expanded', 'false')
    await expect(urun).toBeFocused()

    await page.keyboard.press('ArrowRight')
    await expect(trigger(page, 'Çözümler')).toBeFocused()
    await page.keyboard.press('End')
    await expect(nav(page).getByRole('link', { name: 'Fiyatlar', exact: true })).toBeFocused()
    await page.keyboard.press('ArrowRight') // sarar
    await expect(urun).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(nav(page).getByRole('link', { name: 'Fiyatlar', exact: true })).toBeFocused()
  })

  test('odak tuzağı yok: Tab paneldeki bağlantılardan sonra gruptan çıkar ve panel kapanır', async ({ page }) => {
    await page.goto('/')
    const kaynak = trigger(page, 'Kaynaklar')
    await kaynak.focus()
    await page.keyboard.press('Enter')
    const panel = page.locator(`#${await kaynak.getAttribute('aria-controls')}`)
    const count = await panel.getByRole('link').count()
    for (let i = 0; i < count; i++) await page.keyboard.press('Tab')
    await expect(panel.getByRole('link').last()).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(nav(page).getByRole('link', { name: 'Fiyatlar', exact: true })).toBeFocused()
    await expect(kaynak).toHaveAttribute('aria-expanded', 'false')
  })

  test('Çözümler paneli kanal rozetleriyle kanal sayfasına götürür', async ({ page }) => {
    await page.goto('/')
    await trigger(page, 'Çözümler').click()
    const chans = page.getByTestId('nav-channels')
    await expect(chans.getByRole('link')).toHaveCount(6)
    await chans.getByRole('link', { name: 'N11', exact: true }).click()
    await expect(page).toHaveURL(/\/entegrasyonlar\/n11\/?$/)
    await expect(trigger(page, 'Ürün')).toHaveAttribute('data-active', 'true')
  })

  test('axe WCAG 2.1 AA: her panel açıkken 0 ihlal', async ({ page }) => {
    await page.goto('/')
    for (const g of ['Ürün', 'Çözümler', 'Kaynaklar']) {
      await trigger(page, g).click()
      const r = await new AxeBuilder({ page }).withTags(WCAG).include('.site-header').analyze()
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`), g).toEqual([])
    }
  })
})

test.describe('S23 üst menü — mobil/tablet çekmece', () => {
  test.beforeEach(({ page }) => {
    test.skip(isDesktop(page), 'yalnızca mobil/tablet')
  })

  test('390px: çekmece grupları akordeon, aynı anda tek grup, taşma yok, Esc kapatır', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await noHorizontalOverflow(page)
    await page.getByTestId('menu-toggle').click()
    const panel = page.locator('.nav-mobile__panel')
    const group = (name: string) => panel.locator('details.drawer-group', { has: page.locator('summary', { hasText: name }) })
    await expect(panel.getByRole('link', { name: 'Fiyatlar', exact: true })).toBeVisible()
    await expect(group('Ürün').getByRole('link', { name: 'Özellikler', exact: true })).toBeHidden()

    await group('Ürün').locator('summary').click()
    await expect(group('Ürün').getByRole('link', { name: 'Özellikler', exact: true })).toBeVisible()
    await group('Çözümler').locator('summary').click()
    await expect(group('Ürün')).not.toHaveAttribute('open', '')
    await expect(group('Çözümler').getByRole('link', { name: 'Trendyol', exact: true })).toBeVisible()
    await noHorizontalOverflow(page)

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(page.getByTestId('menu-toggle')).toBeFocused()
  })

  test('bulunulan sayfanın grubu açık gelir ve bağlantı aria-current taşır', async ({ page }) => {
    await page.goto('/rehber')
    await page.getByTestId('menu-toggle').click()
    const res = page.locator('.nav-mobile__panel details.drawer-group[data-drawer-group="resources"]')
    await expect(res).toHaveAttribute('open', '')
    await expect(res.getByRole('link', { name: 'Rehber', exact: true })).toHaveAttribute('aria-current', 'page')
  })
})

test.describe('S23 footer — varlık tanımı geniş alanda', () => {
  test('tanım metni kalan genişliğe yayılır; bağlantı sütunları altında; taşma yok', async ({ page }) => {
    await page.goto('/')
    const about = page.getByTestId('entity-definition')
    await about.scrollIntoViewIfNeeded()
    const [aboutBox, containerBox, gridBox] = await Promise.all([
      about.locator('p').boundingBox(),
      page.locator('.site-footer .container').boundingBox(),
      page.locator('.site-footer .footer-grid').boundingBox(),
    ])
    const vw = page.viewportSize()!.width
    if (vw >= 1024) {
      // marka sütununun yanında, kabın sağ kenarına kadar (dar ölçü sütunu değil)
      expect(aboutBox!.width).toBeGreaterThan(containerBox!.width * 0.55)
      expect(aboutBox!.x + aboutBox!.width).toBeGreaterThan(containerBox!.x + containerBox!.width - 64)
    } else {
      expect(aboutBox!.width).toBeGreaterThan(containerBox!.width * 0.8)
    }
    expect(gridBox!.y).toBeGreaterThan(aboutBox!.y + aboutBox!.height)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    // footer grupları header ile aynı model
    for (const h of ['Ürün', 'Çözümler', 'Kaynaklar', 'Entegrasyonlar', 'Yasal']) {
      await expect(page.locator('.site-footer').getByRole('heading', { name: h, exact: true })).toBeVisible()
    }
  })
})
