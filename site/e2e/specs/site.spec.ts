import { test, expect } from '@playwright/test'
import { APP_URL, collectProblems, isDesktop, waitForFonts } from '../helpers'

test.describe('Ana sayfa', () => {
  test('render, bant yok, noindex, uygulama bağlantıları', async ({ page }) => {
    const problems = collectProblems(page)
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)

    await expect(page).toHaveTitle('Pazaryeri entegrasyonu ve stok yönetimi · Entegrasyonik')
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
    await expect(page.getByRole('heading', { level: 1, name: /Tüm pazaryerleriniz, tek stok, tek panel/ })).toBeVisible()
    await expect(page.getByTestId('draft-banner')).toHaveCount(0)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow')

    // ADR-0014 Karar 2: /login ve /login?mode=register (taban adres env ile)
    const loginId = isDesktop(page) ? 'login-link' : 'login-link-mobile'
    const registerId = isDesktop(page) ? 'register-link' : 'register-link-mobile'
    if (!isDesktop(page)) await page.getByTestId('menu-toggle').click()
    await expect(page.getByTestId(loginId)).toHaveAttribute('href', `${APP_URL}/login`)
    await expect(page.getByTestId(registerId)).toHaveAttribute('href', `${APP_URL}/login?mode=register`)

    await waitForFonts(page)
    expect(problems).toEqual([])
  })

  test('footer künye yer tutucuları görünür (doğrulanmamış unvan yazılmaz)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('kunye-placeholder')).toContainText('{{ŞİRKET_UNVANI}}')
    // S16: genel iletişim adresi footer'da; adres henüz verilmediği için satırı yok
    await expect(page.getByTestId('footer-contact').getByRole('link', { name: 'bilgi@entegrasyonik.com.tr' })).toHaveAttribute('href', 'mailto:bilgi@entegrasyonik.com.tr')
    await expect(page.getByTestId('footer-address')).toHaveCount(0)
  })

  test('Inter self-host yüklenir, yatay taşma yok', async ({ page }) => {
    await page.goto('/')
    await waitForFonts(page)
    const inter = await page.evaluate(() => document.fonts.check('800 16px Inter'))
    expect(inter).toBe(true)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('sıkı CSP + güvenlik başlıkları uygulanır', async ({ page }) => {
    const response = await page.goto('/')
    const headers = response!.headers()
    const csp = headers['content-security-policy']
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain(`form-action 'self' ${APP_URL}`)
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/)
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['x-content-type-options']).toBe('nosniff')
  })

  test('Türkçe metin latin-ext ile doğru çizilir (İ ı ş ğ)', async ({ page }) => {
    await page.goto('/bilesen-onizleme')
    await waitForFonts(page)
    const ok = await page.evaluate(() => document.fonts.check('400 16px Inter', 'İıŞşĞğ'))
    expect(ok).toBe(true)
  })
})

test.describe('Gezinme ve klavye', () => {
  test('atla bağlantısı ilk Tab durağıdır ve ana içeriğe odaklar', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit: Tab varsayılan olarak bağlantılara gitmez (Safari ayarı)')
    await page.goto('/')
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Ana içeriğe geç' })
    await expect(skip).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('main#main')).toBeFocused()
  })

  test('masaüstünde satır içi gezinme, menü düğmesi yok', async ({ page }) => {
    test.skip(!isDesktop(page), 'yalnızca masaüstü')
    await page.goto('/')
    await expect(page.getByTestId('menu-toggle')).toBeHidden()
    await expect(page.getByTestId('login-link')).toBeVisible()
    await expect(page.getByTestId('register-link')).toBeVisible()
  })

  test('mobil/tablet menüsü: aç, Esc ile kapat ve odağı geri ver, dışarı tıkla kapat', async ({ page }) => {
    test.skip(isDesktop(page), 'yalnızca mobil/tablet')
    await page.goto('/')
    const toggle = page.getByTestId('menu-toggle')
    const login = page.getByTestId('login-link-mobile')

    await expect(toggle).toBeVisible()
    await expect(login).toBeHidden()

    // Fare ile aç
    await toggle.click()
    await expect(login).toBeVisible()
    await expect(page.getByTestId('register-link-mobile')).toBeVisible()

    // Esc → kapanır, odak düğmeye döner
    await page.keyboard.press('Escape')
    await expect(login).toBeHidden()
    await expect(toggle).toBeFocused()

    // Klavye ile aç (Enter) ve dışarı tıklayarak kapat
    await page.keyboard.press('Enter')
    await expect(login).toBeVisible()
    await page.mouse.click(5, 700) // menü panelinin dışında (hero üstü menüyle örtüşür)
    await expect(login).toBeHidden()
  })

  test('mobil/tablet menüsü: Tab sırası menü bağlantılarına ulaşır', async ({ page, browserName }) => {
    test.skip(isDesktop(page), 'yalnızca mobil/tablet')
    test.skip(browserName === 'webkit', 'WebKit: Tab varsayılan olarak bağlantılara gitmez (Safari ayarı)')
    await page.goto('/')
    await page.getByTestId('menu-toggle').focus()
    await page.keyboard.press('Space')
    // Yayımlanan gezinme bağlantıları (published bayrağı; S2b/S4b sayfaları açıldıkça artar) önce gelir; sıra:
    // [gezinme bağlantıları...] -> Giriş yap -> Ücretsiz dene. Sayıdan bağımsız doğrulanır.
    const login = page.getByTestId('login-link-mobile')
    for (let i = 0; i < 12 && !(await login.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(login).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('register-link-mobile')).toBeFocused()
  })
})

test.describe('404', () => {
  test('bilinmeyen yol 404 döner, eyleme dönük mesaj ve ana sayfa bağlantısı sunar', async ({ page }) => {
    const response = await page.goto('/olmayan-bir-sayfa')
    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Sayfa bulunamadı' })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow')
    await page.getByRole('link', { name: 'Ana sayfaya dön' }).click()
    await expect(page).toHaveURL('/')
  })
})

test.describe('Hareket kuralları', () => {
  const readMotion = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const s = getComputedStyle(document.documentElement)
      const ms = (name: string) => {
        const v = s.getPropertyValue(name).trim()
        return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000
      }
      return {
        reveal: ms('--site-motion-duration-reveal'),
        stagger: ms('--site-motion-stagger'),
        ambient: ms('--site-motion-ambient-fast'),
      }
    })

  test('varsayılan: reveal 400–900 ms, stagger <= 80 ms, ambient >= 6 sn', async ({ page }) => {
    await page.goto('/')
    const m = await readMotion(page)
    expect(m.reveal).toBeGreaterThanOrEqual(400)
    expect(m.reveal).toBeLessThanOrEqual(900)
    expect(m.stagger).toBeLessThanOrEqual(80)
    expect(m.ambient).toBeGreaterThanOrEqual(6000)
  })

  test('prefers-reduced-motion: reveal <= 150 ms, stagger 0, ambient kapalı', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const m = await readMotion(page)
    expect(m.reveal).toBeLessThanOrEqual(150)
    expect(m.stagger).toBe(0)
    expect(m.ambient).toBe(0)
  })
})

test.describe('Ekran görüntüleri (3 viewport)', () => {
  test('ana sayfa', async ({ page }) => {
    await page.goto('/')
    await waitForFonts(page)
    await expect(page).toHaveScreenshot('home.png') // ilk ekran (hero); tam sayfa PNG'si depo boyutunu şişirir
  })

  test('404', async ({ page }) => {
    await page.goto('/olmayan-bir-sayfa')
    await waitForFonts(page)
    await expect(page).toHaveScreenshot('not-found.png', { fullPage: true })
  })

  test('bileşen önizleme', async ({ page }) => {
    await page.goto('/bilesen-onizleme')
    await waitForFonts(page)
    await expect(page).toHaveScreenshot('components.png', { fullPage: true })
  })

  test('mobil/tablet menüsü açık', async ({ page }) => {
    test.skip(isDesktop(page), 'yalnızca mobil/tablet')
    await page.goto('/')
    await page.getByTestId('menu-toggle').click()
    await waitForFonts(page)
    await expect(page).toHaveScreenshot('menu-open.png')
  })
})
