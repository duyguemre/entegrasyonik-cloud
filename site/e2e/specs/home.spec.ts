import { test, expect } from '@playwright/test'
import { APP_URL, collectProblems, isDesktop, waitForFonts } from '../helpers'

// ADR-0014 S2a — ana sayfa bölümleri: görünürlük, yatay taşma yok, klavye/odak, etkileşim.

// Bu turda (S12 Parça A) sahiplenilen bölümlerin başlıkları birebir; diğer bölümlerin başlıkları paralel turlarda
// (Parça B/C) pazarlama diliyle yeniden yazılabildiğinden yalnızca var ve boş değil olarak denetlenir.
const SECTION_TITLES = [
  ['sorun-cozum-baslik', /Her kanal ayrı panel/],
  ['senaryo-baslik', /Bir sipariş geldiğinde ne olur\?/],
  ['yetenek-baslik', /\S/],
  ['entegrasyon-baslik', /\S/],
  ['nasil-baslik', /\S/],
  ['fiyat-baslik', /\S/],
  ['guvenlik-baslik', /\S/],
  ['sss-baslik', /\S/],
  ['kapanis-baslik', /\S/],
] as const

test.describe('Ana sayfa bölümleri', () => {
  test('tüm bölüm başlıkları render olur; konsol/CSP hatası yok', async ({ page }) => {
    const problems = collectProblems(page)
    await page.goto('/')
    await waitForFonts(page)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    for (const [id, name] of SECTION_TITLES) {
      await expect(page.locator(`h2#${id}`)).toHaveText(name)
    }
    expect(problems).toEqual([])
  })

  test('yatay taşma yok (üç görünüm alanında)', async ({ page }) => {
    await page.goto('/')
    await waitForFonts(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('entegrasyon ekosistemi: dört düğüm, isimsiz kanal noktaları, kapsam sayfasına bağlantı; hero kanal noktaları', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-part="chan"]')).toHaveCount(6)
    const eco = page.getByTestId('ecosystem')
    await eco.scrollIntoViewIfNeeded()
    await expect(eco.locator('[data-part="eco-node"]')).toHaveCount(4)
    for (const node of await eco.locator('[data-part="eco-node"]').all()) await expect(node).toBeVisible()
    // ana mesajda kanal adı yok, kapsam matrisi alt sayfada
    for (const name of ['Trendyol', 'Hepsiburada', 'Pazarama', 'Ideasoft', 'Bizimhesap']) {
      await expect(page.locator('#entegrasyonlar')).not.toContainText(name)
      await expect(page.locator('#ozellikler')).not.toContainText(name)
    }
    await expect(page.getByTestId('integration-matrix')).toHaveCount(0)
    await page.getByTestId('ecosystem-link').click()
    await expect(page).toHaveURL(/\/entegrasyonlar\/?#kapsam$/)
    await expect(page.getByTestId('coverage')).toBeVisible()
  })

  test('ekosistem şeması masaüstünde düğümleri merkezin iki yanında konumlar; mobilde dikey yığın, taşma yok', async ({ page }) => {
    await page.goto('/')
    const eco = page.getByTestId('ecosystem')
    await eco.scrollIntoViewIfNeeded()
    const hub = await eco.locator('.eco__hub').boundingBox()
    const nodes = await Promise.all((await eco.locator('[data-part="eco-node"]').all()).map((n) => n.boundingBox()))
    if (isDesktop(page)) {
      // sol düğümler merkezin solunda, sağ düğümler sağında; birbirini örtmez
      expect(nodes[0]!.x + nodes[0]!.width).toBeLessThan(hub!.x)
      expect(nodes[1]!.x).toBeGreaterThan(hub!.x + hub!.width)
      expect(nodes[0]!.y + nodes[0]!.height).toBeLessThan(nodes[2]!.y)
    } else {
      expect(hub!.y + hub!.height).toBeLessThanOrEqual(nodes[0]!.y)
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('hero CTA\'ları: Ücretsiz dene -> kayıt, Nasıl çalışır -> bölüm', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('hero-cta-primary')).toHaveAttribute('href', `${APP_URL}/login?mode=register`)
    await page.getByTestId('hero-cta-secondary').click()
    await expect(page).toHaveURL(/#nasil-calisir$/)
    await expect(page.locator('h2#nasil-baslik')).toBeInViewport()
  })

  test('fiyat kartları: plan bağlantıları ve taslak uyarısı', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('plan-notice')).toContainText('ÖNERİ')
    await expect(page.locator('[data-part="plan"]')).toHaveCount(3)
    await expect(page.getByTestId('plan-cta-starter')).toHaveAttribute('href', `${APP_URL}/login?mode=register&plan=starter&interval=month`)
  })

  test('SSS: yerel akordeon klavye ile açılıp kapanır', async ({ page }) => {
    await page.goto('/')
    const first = page.locator('[data-part="faq-item"]').first()
    const summary = first.locator('summary')
    await summary.focus()
    await expect(first).not.toHaveAttribute('open', '')
    await page.keyboard.press('Enter')
    await expect(first).toHaveAttribute('open', '')
    await page.keyboard.press('Enter')
    await expect(first).not.toHaveAttribute('open', '')
  })

  test('klavye: ilk odak atla bağlantısı, ardından gezinme; odak halkası görünür', async ({ page, browserName }) => {
    await page.goto('/')
    // WebKit'te Tab varsayılan olarak bağlantılara gitmez (Safari ayarı): yalnızca Tab-sırası adımı atlanır.
    if (browserName !== 'webkit') {
      await page.keyboard.press('Tab')
      await expect(page.getByRole('link', { name: 'Ana içeriğe geç' })).toBeFocused()
    }
    // hero birincil CTA'ya klavyeyle ulaşılır
    const cta = page.getByTestId('hero-cta-primary')
    await cta.focus()
    const ring = await cta.evaluate((el) => {
      const s = getComputedStyle(el)
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }
    })
    expect(ring.style).not.toBe('none')
    // Firefox 2 px'lik halkayı 1.8 olarak bildirir → eşik 1.5
    expect(ring.width).toBeGreaterThanOrEqual(1.5)
  })

  test('mobilde hero mock kanal noktaları panel çerçevesinden taşmaz ve birbirini örtmez', async ({ page }) => {
    test.skip(isDesktop(page), 'yalnızca mobil/tablet')
    await page.goto('/')
    await waitForFonts(page)
    const hub = await page.locator('[data-testid="hero-mock"]').boundingBox()
    const chips = await page.locator('[data-part="chan"]').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      }),
    )
    expect(chips).toHaveLength(6)
    for (const c of chips) {
      expect(c.x).toBeGreaterThanOrEqual(hub!.x - 1)
      expect(c.x + c.w).toBeLessThanOrEqual(hub!.x + hub!.width + 1)
    }
    for (let i = 0; i < chips.length; i++) {
      for (let j = i + 1; j < chips.length; j++) {
        const a = chips[i]
        const b = chips[j]
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
        expect(overlap, `çip ${i} ve ${j}`).toBe(false)
      }
    }
  })

  test('prefers-reduced-motion: içerik statik ve tam görünür', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    for (const scene of ['hero-mock', 'stock-single-winner', 'orders-merge', 'integration-status', 'secret-encryption', 'tenant-isolation', 'request-guard']) {
      await expect(page.locator(`[data-scene="${scene}"]`)).toBeVisible()
    }
    await expect(page.locator(`li[data-scene="how-progress"]`)).toHaveCount(4)
  })
})
