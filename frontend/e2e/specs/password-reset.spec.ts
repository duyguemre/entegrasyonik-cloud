// ADR-0015 Karar 2/Karar 4 — "Şifremi unuttum" sekmesi + `/reset-password` sayfası.
// `docs/API_ACCOUNT_LIFECYCLE.md` #2 `requestPasswordReset` / #3 `confirmPasswordReset`.
// YENİ spec dosyası (Karar 5.1 "yeni iddialar yeni spec dosyalarına yazılır" — mevcut
// login.spec.ts/login-register.spec.ts davranış iddiaları DEĞİŞTİRİLMEDİ).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'

const NO_SESSION = { checkAuthentication: false, userContext: mockError(401, {}) } as const

test.describe('P1 — Şifremi unuttum (giriş ekranı sekmesi)', () => {
  test('smoke: sekme e-posta alanı ve gönder düğmesini render eder', async ({ page }) => {
    await installApiMocks(page, NO_SESSION)
    await page.goto('/login')
    await page.getByRole('tab', { name: 'Şifremi unuttum' }).click()

    await expect(page.getByLabel('E-posta').last()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Şifremi Sıfırla' })).toBeVisible()
  })

  test('istemci doğrulaması: geçersiz e-posta biçiminde backend çağrılmaz', async ({ page }) => {
    let called = false
    await installApiMocks(page, {
      ...NO_SESSION,
      'AccountService/requestPasswordReset': async (route, headers) => {
        called = true
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ success: true, message: 'x' }) })
      },
    })
    await page.goto('/login')
    await page.getByRole('tab', { name: 'Şifremi unuttum' }).click()
    await page.getByLabel('E-posta').last().fill('gecersiz-adres')
    await page.getByRole('button', { name: 'Şifremi Sıfırla' }).click()

    await expect(page.getByText('Geçerli bir e-posta adresi girin.')).toBeVisible()
    await page.waitForTimeout(300)
    expect(called).toBe(false)
  })

  test('başarı: backend HER ZAMAN aynı genel mesajı döner, FE bunu olduğu gibi gösterir (kullanıcı numaralandırma yok)', async ({ page }) => {
    let requestedEmail: string | undefined
    await installApiMocks(page, {
      ...NO_SESSION,
      'AccountService/requestPasswordReset': async (route, headers) => {
        requestedEmail = route.request().postDataJSON()?.email
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers,
          body: JSON.stringify({ success: true, message: 'Bu e-posta adresi kayıtlıysa parola sıfırlama bağlantısı gönderildi.' }),
        })
      },
    })
    await page.goto('/login')
    await page.getByRole('tab', { name: 'Şifremi unuttum' }).click()
    await page.getByLabel('E-posta').last().fill('kayitsiz-veya-kayitli@example.invalid')
    await page.getByRole('button', { name: 'Şifremi Sıfırla' }).click()

    await expect(page.getByText('Bu e-posta adresi kayıtlıysa parola sıfırlama bağlantısı gönderildi.')).toBeVisible()
    await expect.poll(() => requestedEmail).toBe('kayitsiz-veya-kayitli@example.invalid')
    // Form kaybolur, "Girişe dön" görünür (form tekrar gönderilemez — token/e-posta tekrar istenmez).
    await expect(page.getByRole('button', { name: 'Girişe dön' })).toBeVisible()
  })

  test('hız sınırı (429): aksiyon alınabilir Türkçe mesaj, ham HTTP kodu sızmaz', async ({ page }) => {
    await installApiMocks(page, { ...NO_SESSION, 'AccountService/requestPasswordReset': mockError(429, {}) })
    await page.goto('/login')
    await page.getByRole('tab', { name: 'Şifremi unuttum' }).click()
    await page.getByLabel('E-posta').last().fill('e2e@example.invalid')
    await page.getByRole('button', { name: 'Şifremi Sıfırla' }).click()

    await expect(page.getByText('Çok fazla deneme yaptınız. Lütfen bir süre sonra tekrar deneyin.')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('429')
  })

  test('axe: ŞİFREMİ UNUTTUM sekmesi 0 ihlal', async ({ page }) => {
    await installApiMocks(page, NO_SESSION)
    await page.goto('/login')
    await page.getByRole('tab', { name: 'Şifremi unuttum' }).click()
    await page.evaluate(() => document.fonts.ready)
    // Sekme geçişi `fade-transition` (200ms) kullanır; tarama tam opaklığa ULAŞMADAN çalışırsa
    // axe geçiş-anı opaklığını "düşük kontrast" sanabilir (bkz. bu görevin doğrulama koşusu).
    await page.waitForTimeout(400)
    const results = await new AxeBuilder({ page }).include('.premium-login-card').exclude('.v-field').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }))).toEqual([])
  })

  test('ekran görüntüsü tabanı (şifremi unuttum sekmesi)', async ({ page }) => {
    await installApiMocks(page, NO_SESSION)
    await page.goto('/login')
    await page.getByRole('tab', { name: 'Şifremi unuttum' }).click()
    await expect(page.getByRole('button', { name: 'Şifremi Sıfırla' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('forgot-password-tab.png', { fullPage: false })
  })
})

test.describe('P1 — /reset-password (e-postadaki bağlantının hedefi)', () => {
  test('token yok: "bağlantı geçersiz" boş durumu gösterilir, form gösterilmez', async ({ page }) => {
    await installApiMocks(page, NO_SESSION)
    await page.goto('/reset-password')

    await expect(page.getByText('Bağlantı geçersiz')).toBeVisible()
    await expect(page.getByLabel('Yeni Parola', { exact: true })).toHaveCount(0)
  })

  test('istemci doğrulaması: kısa/uyuşmayan parolalarda backend çağrılmaz', async ({ page }) => {
    let called = false
    await installApiMocks(page, {
      ...NO_SESSION,
      'AccountService/confirmPasswordReset': async (route, headers) => {
        called = true
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ success: true }) })
      },
    })
    await page.goto('/reset-password?token=e2e-fake-token')
    await page.getByLabel('Yeni Parola', { exact: true }).fill('kisa')
    await page.getByLabel('Yeni Parola (Tekrar)').fill('kisa')
    await page.getByRole('button', { name: 'Parolamı Güncelle' }).click()
    await expect(page.getByText('Parolanız en az 10 karakter olmalı.')).toBeVisible()

    await page.getByLabel('Yeni Parola', { exact: true }).fill('gecerli-parola-1')
    await page.getByLabel('Yeni Parola (Tekrar)').fill('baska-bir-parola-2')
    await page.getByRole('button', { name: 'Parolamı Güncelle' }).click()
    await expect(page.getByText('Girdiğiniz parolalar birbiriyle uyuşmuyor.')).toBeVisible()

    await page.waitForTimeout(300)
    expect(called).toBe(false)
  })

  test('başarı: parola güncellenir, girişe dön bağlantısı görünür; token URL\'den silinir', async ({ page }) => {
    let sentToken: string | undefined
    await installApiMocks(page, {
      ...NO_SESSION,
      'AccountService/confirmPasswordReset': async (route, headers) => {
        sentToken = route.request().postDataJSON()?.token
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ success: true }) })
      },
    })
    await page.goto('/reset-password?token=e2e-fake-token')
    // Güvenlik notu (API sözleşmesi FE önerisi): token okunur okunmaz (mount anında) URL'den silinir
    // — geçmiş/log sızıntısını önlemek için bu form etkileşiminden ÖNCE gerçekleşir.
    await expect(page).not.toHaveURL(/token=/)
    await page.getByLabel('Yeni Parola', { exact: true }).fill('gecerli-yeni-parola-1')
    await page.getByLabel('Yeni Parola (Tekrar)').fill('gecerli-yeni-parola-1')
    await page.getByRole('button', { name: 'Parolamı Güncelle' }).click()

    await expect(page.getByText('Parolanız güncellendi. Yeni parolanızla giriş yapabilirsiniz.')).toBeVisible()
    await expect.poll(() => sentToken).toBe('e2e-fake-token')

    await page.getByRole('button', { name: 'Girişe dön' }).click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('geçersiz/süresi dolmuş token: aksiyon alınabilir mesaj + yeni bağlantı isteme yolu, ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page, {
      ...NO_SESSION,
      'AccountService/confirmPasswordReset': mockError(400, { error: 'Geçersiz veya süresi dolmuş bağlantı.', service: 'AccountService', operation: 'confirmPasswordReset', code: 'TOKEN_INVALID' }),
    })
    await page.goto('/reset-password?token=e2e-expired-token')
    await page.getByLabel('Yeni Parola', { exact: true }).fill('gecerli-yeni-parola-1')
    await page.getByLabel('Yeni Parola (Tekrar)').fill('gecerli-yeni-parola-1')
    await page.getByRole('button', { name: 'Parolamı Güncelle' }).click()

    await expect(page.getByText('Bu bağlantının süresi dolmuş veya daha önce kullanılmış.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Yeni bir sıfırlama bağlantısı iste' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('TOKEN_INVALID')
    await expect(page.locator('body')).not.toContainText('400')
  })

  test('zayıf parola (WEAK_PASSWORD): backend mesajı olduğu gibi gösterilir (frontend metin uydurmaz)', async ({ page }) => {
    await installApiMocks(page, {
      ...NO_SESSION,
      'AccountService/confirmPasswordReset': mockError(400, { error: 'Parolanız çok zayıf; en az 3 farklı karakter sınıfı kullanın.', service: 'AccountService', operation: 'confirmPasswordReset', code: 'WEAK_PASSWORD' }),
    })
    await page.goto('/reset-password?token=e2e-fake-token')
    await page.getByLabel('Yeni Parola', { exact: true }).fill('aaaaaaaaaa')
    await page.getByLabel('Yeni Parola (Tekrar)').fill('aaaaaaaaaa')
    await page.getByRole('button', { name: 'Parolamı Güncelle' }).click()

    await expect(page.getByText('Parolanız çok zayıf; en az 3 farklı karakter sınıfı kullanın.')).toBeVisible()
  })

  test('ekran görüntüsü tabanı (yeni parola formu)', async ({ page }) => {
    await installApiMocks(page, NO_SESSION)
    await page.goto('/reset-password?token=e2e-fake-token')
    await expect(page.getByRole('button', { name: 'Parolamı Güncelle' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('reset-password.png', { fullPage: false })
  })
})
