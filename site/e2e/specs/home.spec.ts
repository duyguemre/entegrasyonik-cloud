import { test, expect, type Page } from '@playwright/test'
import { APP_URL, collectProblems, isDesktop, waitForFonts } from '../helpers'

/** Kapsam matrisi kırılım noktası (768px, proje tablet eşiği) — `isDesktop` (1024px) ile KARIŞTIRILMAMALI. */
const isMatrixLayout = (page: Page) => (page.viewportSize()?.width ?? 0) >= 768

// ADR-0014 S2a — ana sayfa bölümleri: görünürlük, yatay taşma yok, klavye/odak, etkileşim.

// Bu turda (S12 Parça A) sahiplenilen bölümlerin başlıkları birebir; diğer bölümlerin başlıkları paralel turlarda
// (Parça B/C) pazarlama diliyle yeniden yazılabildiğinden yalnızca var ve boş değil olarak denetlenir.
const SECTION_TITLES = [
  ['sorun-cozum-baslik', /Dağınık yönetim/],
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

  test('entegrasyon vitrini: 6 kart, 6 hero kanal noktası, kapsam matrisi ve dürüst sınır notları', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-part="integration"]')).toHaveCount(6)
    await expect(page.locator('[data-part="chan"]')).toHaveCount(6)
    await expect(page.getByTestId('integration-grid')).toContainText('Bilinmesi gerekenler')
    await expect(page.getByTestId('integration-matrix').locator('.ig__matrix-row')).toHaveCount(6)
  })

  test('kapsam matrisi: satır ve sütun üzerine gelince "crosshair" vurgusu (S10 2. tur, masaüstü)', async ({ page }) => {
    test.skip(!isMatrixLayout(page), 'matris yalnızca >=768px görünür; mobilde kompakt kart devralır')
    await page.goto('/')
    const matrix = page.getByTestId('integration-matrix')
    await expect(matrix.locator('caption')).toHaveText(/./)
    // Ortadaki bir satır seçilir: ilk satır sayfa yapışkan üst bilgisiyle (site header + matris thead) aynı
    // banda denk gelebilir (sticky başlıkların bilinen/beklenen davranışı) — hover testini etkilemesin diye.
    const midRow = matrix.locator('.ig__matrix-row').nth(2)
    await midRow.scrollIntoViewIfNeeded()
    const cell = midRow.locator('td').nth(2)
    const colHeadBefore = await matrix.locator('thead th').nth(3).evaluate((el) => getComputedStyle(el).backgroundColor)
    await cell.hover()
    // satır vurgusu: aynı satırdaki başka bir hücre de arka plan değiştirir
    const otherCellInRow = midRow.locator('td').nth(5)
    await expect.poll(() => otherCellInRow.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    // sütun vurgusu ("crosshair"): hover edilen hücrenin sütun başlığı da vurgulanır
    await expect
      .poll(() => matrix.locator('thead th').nth(3).evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(colHeadBefore)
  })

  test('kapsam matrisi mobilde kompakt kart olarak görünür, yatay taşma yok', async ({ page }) => {
    test.skip(isMatrixLayout(page), 'yalnızca <768px (mobil)')
    await page.goto('/')
    const matrix = page.getByTestId('integration-matrix')
    await expect(matrix).toBeHidden()
    const cards = page.locator('.ig__mcard')
    await expect(cards).toHaveCount(6)
    await cards.first().scrollIntoViewIfNeeded()
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
