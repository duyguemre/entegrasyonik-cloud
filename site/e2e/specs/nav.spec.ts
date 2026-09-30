/**
 * S23 (SR2-NAV / SR2-ENTITY 7) — gruplanmış üst menü + footer düzeni. S25: premium panel içeriği (kart + öne çıkan kart +
 * alt şerit), hover niyeti, kaydırmada kısalan cam bar, tam ekran çekmece + sabit CTA.
 * Masaüstü: disclosure düğmeleri (aria-expanded/aria-controls), klavye (Enter/Space, ↓/↑, ←/→, Home/End, Esc), odak
 * tuzağı yok, dışarı tıklama; mobil/tablet: <details> çekmece + grup akordeonu. 1280/1440/390'da yatay taşma yok.
 */
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { isDesktop, waitForFonts } from '../helpers'

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
      await expect(nav(page).getByRole('link', { name: 'Fiyatlandırma', exact: true })).toBeVisible()
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
    expect(await focusedText(page)).toBe('Katalog yönetimi')
    await page.keyboard.press('ArrowDown')
    expect(await focusedText(page)).toBe('Stok senkronu')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp') // sondan sarar: alt şeridin son bağlantısı
    expect(await focusedText(page)).toBe('Tüm özellikler')
    await page.keyboard.press('ArrowUp') // öne çıkan kartın bağlantısı
    expect(await focusedText(page)).toBe('Nasıl çalıştığını görün')
    await page.keyboard.press('Home')
    expect(await focusedText(page)).toBe('Katalog yönetimi')

    await page.keyboard.press('Escape')
    await expect(urun).toHaveAttribute('aria-expanded', 'false')
    await expect(urun).toBeFocused()

    await page.keyboard.press('ArrowRight')
    await expect(trigger(page, 'Çözümler')).toBeFocused()
    await page.keyboard.press('End')
    await expect(nav(page).getByRole('link', { name: 'Fiyatlandırma', exact: true })).toBeFocused()
    await page.keyboard.press('ArrowRight') // sarar
    await expect(urun).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(nav(page).getByRole('link', { name: 'Fiyatlandırma', exact: true })).toBeFocused()
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
    await expect(nav(page).getByRole('link', { name: 'Fiyatlandırma', exact: true })).toBeFocused()
    await expect(kaynak).toHaveAttribute('aria-expanded', 'false')
  })

  test('Çözümler paneli kanal rozetleriyle kanal sayfasına götürür (tür satırları: tüm kanallar bir kez)', async ({ page }) => {
    await page.goto('/')
    await trigger(page, 'Çözümler').click()
    const chans = page.locator('#mega-solutions').getByTestId('nav-channels')
    await expect(chans).toHaveCount(3)
    await expect(chans.getByRole('link')).toHaveCount(6)
    await chans.getByRole('link', { name: 'N11', exact: true }).click()
    await expect(page).toHaveURL(/\/entegrasyonlar\/n11\/?$/)
    await expect(trigger(page, 'Çözümler')).toHaveAttribute('data-active', 'true')
  })

  test('S25: her panel = ikonlu kartlar (başlık + fayda satırı) + öne çıkan kart + alt şerit', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    for (const [g, kind] of [['Ürün', 'agent'], ['Çözümler', 'trial'], ['Kaynaklar', 'guide']] as const) {
      await trigger(page, g).click()
      const panel = page.locator(`#${await trigger(page, g).getAttribute('aria-controls')}`)
      await expect(panel).toBeVisible()
      const items = panel.locator('.mega-item')
      expect(await items.count(), g).toBeGreaterThanOrEqual(3)
      for (const item of await items.all()) {
        await expect(item.locator('.mega-item__icon')).toBeVisible()
        await expect(item.locator('.mega-item__desc')).toBeVisible()
      }
      await expect(panel.getByTestId(`nav-feature-${kind}`)).toBeVisible()
      await expect(panel.locator('.mega__foot')).toBeVisible()
      // panel bar'ın altında, kapsayıcıda ortalı ve görünüm alanında
      const [pb, bar] = await Promise.all([panel.boundingBox(), page.locator('.site-header .bar').boundingBox()])
      expect(Math.abs(pb!.x + pb!.width / 2 - (bar!.x + bar!.width / 2)), g).toBeLessThan(2)
      expect(pb!.y + pb!.height, g).toBeLessThanOrEqual(900)
    }
    // Ürün kartı: ajan ürünü "Yeni" rozetli; deneme kartı süreyi kayıttan gösterir
    await trigger(page, 'Ürün').click()
    await expect(page.getByTestId('nav-feature-agent')).toContainText('Yeni')
    await trigger(page, 'Çözümler').click()
    await expect(page.getByTestId('nav-feature-trial')).toContainText('14 gün ücretsiz')
  })

  test('S25 hover niyeti: kısa geçiş açmaz; durunca açılır; komşu gruba anında geçer; ayrılınca kapanır', async ({ page }) => {
    await page.goto('/sss')
    const urun = trigger(page, 'Ürün')
    const cozum = trigger(page, 'Çözümler')
    const ub = (await urun.boundingBox())!
    // hızlı geçiş (gecikmeden kısa)
    await page.mouse.move(ub.x + ub.width / 2, ub.y + ub.height / 2)
    await page.mouse.move(ub.x + ub.width / 2, ub.y + 400)
    await page.waitForTimeout(300)
    await expect(urun).toHaveAttribute('aria-expanded', 'false')
    // durunca açılır
    await page.mouse.move(ub.x + ub.width / 2, ub.y + ub.height / 2)
    await expect(urun).toHaveAttribute('aria-expanded', 'true')
    // komşu düğmeye geçiş: tek panel, anında
    const cb = (await cozum.boundingBox())!
    await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 4 })
    await expect(cozum).toHaveAttribute('aria-expanded', 'true')
    await expect(urun).toHaveAttribute('aria-expanded', 'false')
    // panelin içine inilir: açık kalır
    const panel = page.locator('#mega-solutions')
    const pb = (await panel.boundingBox())!
    await page.mouse.move(pb.x + 40, pb.y + 60, { steps: 6 })
    await page.waitForTimeout(400)
    await expect(cozum).toHaveAttribute('aria-expanded', 'true')
    // gruptan ayrılınca kapanır
    await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height + 120)
    await expect(cozum).toHaveAttribute('aria-expanded', 'false')
  })

  test('S25 kaydırma: cam zemin kısalır (akış yüksekliği sabit), aktif sayfa alt çizgili', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    const header = page.locator('.site-header')
    const h0 = (await header.boundingBox())!.height
    await expect(page.locator('html')).not.toHaveAttribute('data-scrolled', 'true')
    await page.mouse.wheel(0, 900)
    await expect(page.locator('html')).toHaveAttribute('data-scrolled', 'true')
    await page.waitForTimeout(600)
    const h1 = (await header.boundingBox())!.height
    expect(h1).toBe(h0) // sayfa zıplamaz
    const scale = await header.evaluate((el) => getComputedStyle(el, '::before').transform)
    expect(scale).not.toBe('none')
    const link = nav(page).getByRole('link', { name: 'Fiyatlandırma', exact: true })
    await expect(link).toHaveAttribute('aria-current', 'page')
    const underline = await link.evaluate((el) => getComputedStyle(el, '::after').content)
    expect(underline).not.toBe('none')
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
    await expect(panel.getByRole('link', { name: 'Fiyatlandırma', exact: true })).toBeVisible()
    await expect(group('Ürün').getByRole('link', { name: 'Katalog yönetimi', exact: true })).toBeHidden()

    await group('Ürün').locator('summary').click()
    await expect(group('Ürün').getByRole('link', { name: 'Katalog yönetimi', exact: true })).toBeVisible()
    await group('Çözümler').locator('summary').click()
    await expect(group('Ürün')).not.toHaveAttribute('open', '')
    await expect(group('Çözümler').getByRole('link', { name: 'Trendyol', exact: true })).toBeVisible()
    await noHorizontalOverflow(page)

    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(page.getByTestId('menu-toggle')).toBeFocused()
  })

  test('S25: tam ekran çekmece, arka sayfa kilitli, altta sabit CTA, ajan kartı', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.getByTestId('menu-toggle').click()
    const panel = page.locator('.nav-mobile__panel')
    const box = (await panel.boundingBox())!
    expect(Math.round(box.y + box.height)).toBe(844)
    expect(Math.round(box.width)).toBe(390)
    const actions = panel.locator('.nav-mobile__actions')
    const ab = (await actions.boundingBox())!
    expect(Math.round(ab.y + ab.height)).toBe(844)
    await expect(page.getByTestId('register-link-mobile')).toBeInViewport()
    await expect(page.getByTestId('drawer-feature')).toBeVisible()
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe('hidden')
    // grup açılınca da CTA altta kalır (içerik çekmecede kayar)
    await panel.locator('details.drawer-group[data-drawer-group="solutions"] > summary').click()
    await expect(page.getByTestId('register-link-mobile')).toBeInViewport()
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe('hidden')
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
