import { test, expect, type Page } from '@playwright/test'
import { collectProblems, isDesktop, waitForFonts } from '../helpers'

// S7 — premium ana sayfa: hero ürün paneli mock'u, hareket kontrolü, taşma, yapışkan öğeler, reduced-motion.

const WIDTHS = [320, 360, 375, 414, 600, 768, 800, 1024, 1180, 1279, 1280, 1366, 1440, 1600]

const stockText = (page: Page) =>
  page.evaluate(() => {
    const nums = [...document.querySelectorAll<HTMLElement>('[data-testid="hero-mock"] [data-part="num"]')]
    const best = nums.map((n) => ({ t: n.textContent?.trim(), o: Number(getComputedStyle(n).opacity) })).sort((a, b) => b.o - a.o)[0]
    return best?.t
  })

/**
 * Çalışan CSS animasyonları (geçişler hariç); `infiniteOnly` ile yalnızca döngüler. `withinSelector` verilirse
 * yalnızca o kök içindeki öğelerin animasyonları sayılır (S10: sayfada artık birden fazla bölümün kendi meşru
 * döngüsü var - "hiçbir yerde döngü yok" yerine "BU bölümde döngü yok" testi gerekiyor).
 */
const runningAnimations = (page: Page, infiniteOnly = false, withinSelector?: string) =>
  page.evaluate(
    ({ inf, sel }) => {
      const root = sel ? document.querySelector(sel) : null
      return document
        .getAnimations()
        .filter((a) => a instanceof CSSAnimation && a.playState === 'running' && (!inf || a.effect?.getTiming().iterations === Infinity))
        .filter((a) => {
          if (!root) return true
          const target = (a.effect as KeyframeEffect | null)?.target
          return target instanceof Node && root.contains(target)
        }).length
    },
    { inf: infiniteOnly, sel: withinSelector },
  )

const readyMotion = (page: Page) => page.waitForFunction(() => document.documentElement.dataset.motion !== undefined)

test.describe('MotionToggle header\'a sığar (320–1600 px)', () => {
  test('her genişlikte görünür, görünüm alanı içinde ve header/doküman taşmaz', async ({ page }) => {
    test.setTimeout(120_000)
    test.skip(!isDesktop(page), 'genişlikleri test kendisi ayarlar; tek projede çalışır')
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await waitForFonts(page)
      await readyMotion(page)
      const toggle = page.getByTestId('motion-toggle')
      await expect(toggle, `${width}`).toBeVisible()
      const box = (await toggle.boundingBox())!
      expect(box.x, `${width} sol`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `${width} sağ`).toBeLessThanOrEqual(width)
      expect(box.width, `${width} hedef`).toBeGreaterThanOrEqual(44)
      const overflow = await page.evaluate(() => {
        const bar = document.querySelector<HTMLElement>('.site-header .bar')!
        return { doc: document.documentElement.scrollWidth - window.innerWidth, bar: bar.scrollWidth - bar.clientWidth }
      })
      expect(overflow.doc, `${width} doküman`).toBeLessThanOrEqual(0)
      expect(overflow.bar, `${width} header`).toBeLessThanOrEqual(0)
      // geniş üstlükte kısa etiket görünür ve yine sığar
      if (width >= 1440) await expect(page.locator('.motion-toggle__label')).toBeVisible()
      else await expect(page.locator('.motion-toggle__label')).toBeHidden()
    }
  })

  test('erişilebilir ad sabit; aria-pressed durumu tutar; durdurunca data-motion=paused', async ({ page }) => {
    await page.goto('/')
    await readyMotion(page)
    const toggle = page.getByRole('button', { name: 'Hareketi durdur' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'play')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused')
    await expect(page.getByRole('button', { name: 'Hareketi durdur' })).toHaveCount(1) // ad değişmedi
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'play')
  })
})

test.describe('Hero ürün paneli (Örnek görünüm)', () => {
  test('mock görünür, "Örnek görünüm" etiketli, kanal noktaları (isimsiz) ve konsol temiz', async ({ page }) => {
    const problems = collectProblems(page)
    await page.goto('/')
    await waitForFonts(page)
    const mock = page.getByTestId('hero-mock')
    await expect(mock).toBeVisible()
    await expect(mock).toContainText('Örnek görünüm') // rozet yeter (S8 2. tur: ayrı altyazı kaldırıldı)
    await expect(page.locator('[data-testid="hero-mock"] [data-part="chan"]')).toHaveCount(6)
    // S12: kanal adı yerine genel etiket
    await expect(mock).toContainText('Pazaryeri siparişi')
    await expect(mock).not.toContainText('Trendyol')
    expect(problems).toEqual([])
  })

  test('12 sn döngü gerçekten çalışır: stok sayısı rezervasyonla değişir, hareket durdurulunca durur', async ({ page }) => {
    await page.goto('/')
    await readyMotion(page)
    await page.getByTestId('hero-mock').scrollIntoViewIfNeeded() // mobilde panel ilk ekranın altındadır
    await expect(page.getByTestId('hero-mock')).toHaveAttribute('data-state', 'play')
    await expect(page.getByTestId('hero-mock')).toHaveAttribute('data-visible', 'true')
    const seen = new Set<string>()
    // döngü ~12 sn: başlangıç 12 -> ... -> 9; en az iki farklı değer görülmeli
    await expect
      .poll(
        async () => {
          seen.add((await stockText(page)) ?? '')
          return seen.size
        },
        { timeout: 14_000, intervals: [400] },
      )
      .toBeGreaterThanOrEqual(2)
    // durdur: hiçbir sahne animasyonu çalışmaz (yalnızca statik son durum)
    await page.getByTestId('motion-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused')
    expect(await runningAnimations(page)).toBe(0)
    expect(await stockText(page)).toBe('9')
  })

  test('sekme dışına kaydırılınca döngü durur (görünmezken paused)', async ({ page }) => {
    await page.goto('/')
    await readyMotion(page)
    await page.getByTestId('hero-mock').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('hero-mock')).toHaveAttribute('data-visible', 'true')
    // Hedef sayfanın alt yarısı (SSS/kapanış civarı): S10'dan beri sayfada döngüsü OLAN bölüm sayısı arttı
    // (senaryo, fiyat, kapanış) — bu yüzden kontrol "hiçbir yerde döngü yok" yerine yalnızca hero'nun kendi
    // döngü kapsamına (hero-mock + hero-bg + kanıt şeridi, `main > section:nth-child(-n+2)`) daraltıldı; komşu
    // bölümlerin (tablet'te viewport yüksekliğine bağlı olarak KISMEN görünür kalabilen) meşru döngüleri
    // yanlış pozitif üretmesin.
    await page.evaluate(() => window.scrollTo(0, document.querySelector('#sss')!.getBoundingClientRect().top + window.scrollY))
    await expect(page.getByTestId('hero-mock')).toHaveAttribute('data-visible', 'false')
    await page.waitForTimeout(1200) // giriş animasyonları biter
    expect(await runningAnimations(page, true, '[data-testid="hero-mock"], [data-scene="hero-bg"], [data-scene="marquee"]')).toBe(0)
  })

  test('prefers-reduced-motion: mock statik son durumda, hiçbir animasyon yok, kontrol gizli', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await waitForFonts(page)
    await expect(page.getByTestId('hero-mock')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
    await expect(page.getByTestId('motion-toggle')).toBeHidden()
    expect(await runningAnimations(page)).toBe(0)
    expect(await stockText(page)).toBe('9')
    // üç sipariş "Rezerve" (statik son durum); "Yeni" rozeti görünmez
    const pills = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-testid="hero-mock"] .mock__row')].map((row) => ({
        row: Number(getComputedStyle(row).opacity),
        neu: Number(getComputedStyle(row.querySelector('.mock__pill--new')!).opacity),
      })),
    )
    expect(pills).toHaveLength(3)
    for (const p of pills) expect(p).toEqual({ row: 1, neu: 0 })
  })
})

test.describe('Kayan şerit, sayaçlar, yapışkan öğeler', () => {
  test('deneme günü sayacı son değere ulaşır (14) ve şerit tam listeyi içerir (S12: durum sayacı yok)', async ({ page }) => {
    await page.goto('/')
    await readyMotion(page)
    await page.locator('[data-testid="stat-list"]').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('integration-count')).toHaveCount(0)
    await expect(page.locator('[data-testid="trial-stat"] [data-count]')).toHaveText('14', { timeout: 5000 })
    await expect(page.getByTestId('marquee-list').locator('li')).toHaveCount(8)
  })

  test('reduced-motion: şerit sarılan ve tam görünür liste; kopya küme gizli; taşma yok', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await waitForFonts(page)
    const items = page.getByTestId('marquee-list').locator('li')
    await expect(items).toHaveCount(8)
    // tüm öğeler yatayda görünüm alanının içinde (sarılmış; kırpılan/kayan öğe yok)
    const rects = await items.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: r.x, right: r.right, w: r.width })))
    const vw = await page.evaluate(() => window.innerWidth)
    for (const r of rects) {
      expect(r.w).toBeGreaterThan(0)
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.right).toBeLessThanOrEqual(vw)
    }
    await expect(page.locator('.marquee__set--copy')).toBeHidden()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('sticky header: kaydırınca data-scrolled=true, gölge gelir', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).not.toHaveAttribute('data-scrolled', 'true')
    await page.evaluate(() => window.scrollTo(0, 600))
    await expect(page.locator('html')).toHaveAttribute('data-scrolled', 'true')
    const shadow = await page.locator('.site-header').evaluate((el) => getComputedStyle(el).boxShadow)
    expect(shadow).not.toBe('none')
  })

  test('nasıl çalışır: sol sütun yapışkan kalır ve etkin adım kaydırmayla değişir (masaüstü)', async ({ page }) => {
    test.skip(!isDesktop(page), 'yapışkan sütun yalnızca masaüstü yerleşiminde')
    await page.goto('/')
    await readyMotion(page)
    const aside = page.locator('.hw__aside')
    await page.evaluate(() => document.querySelector('#nasil-calisir')!.scrollIntoView())
    await page.waitForTimeout(300)
    const active = () => page.locator('.hw__nav-item[data-active="true"] .hw__nav-label').textContent()
    expect(await active()).toBe('Hesap')
    // son (dördüncü) adıma kaydır: sol sütun görünümde kalır, gösterge "Yönetim" olur
    await page.evaluate(() => {
      const step = document.querySelectorAll('.how__step')[3] as HTMLElement
      window.scrollTo(0, window.scrollY + step.getBoundingClientRect().top - window.innerHeight / 2)
    })
    await expect.poll(active, { timeout: 5000 }).toBe('Yönetim')
    const box = (await aside.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeLessThan(400)
  })
})

test.describe('Kart eğim (tilt) çıkış geçişi (S10; S12: 2°, 700 ms ease-out)', () => {
  /** `transform`'un transition-duration'ı: `transition-property` listesindeki konumuna göre okunur. */
  const transformDuration = (page: Page, selector: string) =>
    page.evaluate((sel) => {
      const el = document.querySelector<HTMLElement>(sel)!
      const cs = getComputedStyle(el)
      const props = cs.transitionProperty.split(', ')
      const durations = cs.transitionDuration.split(', ')
      const i = props.indexOf('transform')
      return i === -1 ? undefined : durations[i]
    }, selector)

  test('izlerken kısa, ayrılınca uzun geçiş; eğim nötr konuma döner', async ({ page }) => {
    test.skip(!isDesktop(page), 'imleç eğimi yalnızca pointer:fine masaüstünde çalışır')
    await page.goto('/')
    await readyMotion(page)
    const card = page.locator('.plan').first()
    await card.scrollIntoViewIfNeeded()
    const box = (await card.boundingBox())!

    // izleme sırasında: kısa/tepkisel geçiş (uygulama etkileşim ölçeği, --ek-duration-fast)
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2)
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 4 })
    await expect.poll(() => transformDuration(page, '.plan')).toBe('0.15s')
    await expect.poll(() => card.evaluate((el) => getComputedStyle(el).getPropertyValue('--ry').trim())).not.toBe('0deg')
    // S12: eğim en fazla 2°
    const midTilt = await card.evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue('--ry')))
    expect(Math.abs(midTilt)).toBeLessThanOrEqual(2)

    // ayrılınca: uzun geçiş (--site-tilt-leave-duration) + eğim nötr konuma döner
    await page.mouse.move(box.x - 40, box.y - 40)
    await expect.poll(() => transformDuration(page, '.plan')).toBe('0.7s')
    await expect(card).toHaveCSS('--rx', '0deg')
    await expect(card).toHaveCSS('--ry', '0deg')
  })
})

test.describe('Taşma ve düzen (320–1600 px)', () => {
  test('ana sayfa hiçbir genişlikte yatay taşmaz', async ({ page }) => {
    test.setTimeout(180_000)
    test.skip(!isDesktop(page), 'genişlikleri test kendisi ayarlar; tek projede çalışır')
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      await waitForFonts(page)
      // tüm sahneleri görünür yap (giriş animasyonları translate kullanır; taşma ölçümü kayma sonrası olmalı)
      const total = await page.evaluate(() => document.documentElement.scrollHeight)
      for (let y = 0; y < total; y += 900) {
        await page.evaluate((yy) => window.scrollTo(0, yy), y)
        await page.waitForTimeout(40)
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${width}`).toBeLessThanOrEqual(0)
    }
  })
})

test.describe('Sorun -> çözüm kaydırma ilerlemesi (S12)', () => {
  const progress = (page: Page) =>
    page.evaluate(() => document.querySelector<HTMLElement>('[data-testid="problem-solution"]')!.style.getPropertyValue('--scroll-p'))

  test('sahne görünüme girerken --scroll-p 0 -> 1 artar; durdurulunca kaldırılır (statik son durum = 1)', async ({ page }) => {
    await page.goto('/')
    await readyMotion(page)
    const top = await page.evaluate(() => document.querySelector('[data-testid="problem-solution"]')!.getBoundingClientRect().top + window.scrollY)
    const vh = await page.evaluate(() => window.innerHeight)
    await page.evaluate((y) => window.scrollTo(0, y), top - vh * 0.95)
    await expect.poll(async () => Number(await progress(page))).toBeLessThan(0.1)
    await page.evaluate((y) => window.scrollTo(0, y), top - vh * 0.6)
    await expect.poll(async () => Number(await progress(page))).toBeGreaterThan(0.2)
    await page.evaluate((y) => window.scrollTo(0, y), top - vh * 0.1)
    await expect.poll(async () => Number(await progress(page))).toBe(1)
    await page.getByTestId('motion-toggle').click()
    await expect.poll(() => progress(page)).toBe('')
    // yalnızca transform/opacity: marka kartı tam opak
    await expect(page.locator('.ps__after')).toHaveCSS('opacity', '1')
  })

  test('reduced-motion: ilerleme yazılmaz, sahne statik son durumda', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByTestId('problem-solution').scrollIntoViewIfNeeded()
    expect(await progress(page)).toBe('')
    await expect(page.locator('.ps__after')).toHaveCSS('opacity', '1')
  })
})
