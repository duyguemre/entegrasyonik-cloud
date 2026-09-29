// ADR-0015 B4-P0 — `/verify-email` (docs/API_ACCOUNT_LIFECYCLE.md #4 `verifyEmail`, AÇIK uç).
// N1 ekranındaki "Doğrulama bağlantısını gönder" e-postasının hedefi. Kimliksiz: oturum mock'u 401.
// Sentetik token (Protokol 7). Kapsam: smoke/başarı + boş (token yok) + hata (TOKEN_INVALID, 429) +
// istek gövdesi + token'ın URL'den silinmesi + 3 viewport ekran görüntüsü + axe AA = 0.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { AXE_TAGS } from '../fixtures/b4Screens'

const NO_SESSION = { checkAuthentication: false, userContext: mockError(401, {}) } as const
const TOKEN = 'e2e-sentetik-dogrulama-belirteci'

test.describe('ADR-0015 B4-P0 — /verify-email (e-posta doğrulama bağlantısı)', () => {
  test('başarı: açılışta verifyEmail({token}) çağrılır, token URL\'den silinir, onay gösterilir', async ({ page }) => {
    let body: any
    await installApiMocks(page, {
      ...NO_SESSION,
      'AccountService/verifyEmail': async (route: any, headers: Record<string, string>) => {
        body = route.request().postDataJSON()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ success: true }) })
      },
    })
    await page.goto(`/verify-email?token=${TOKEN}`)

    await expect(page.getByRole('heading', { level: 1, name: 'E-posta doğrulaması' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'E-posta adresiniz doğrulandı. Teşekkürler!' })).toBeVisible()
    expect(body).toEqual({ token: TOKEN })
    expect(page.url()).not.toContain(TOKEN)
    await expect(page).toHaveURL(/\/verify-email$/)
    await expect(page.getByRole('button', { name: 'Uygulamaya git' })).toBeVisible()
  })

  test('boş durum: token yoksa backend çağrılmaz, yönlendirici bilgi gösterilir', async ({ page }) => {
    let called = false
    await installApiMocks(page, {
      ...NO_SESSION,
      'AccountService/verifyEmail': async (route: any, headers: Record<string, string>) => {
        called = true
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: '{}' })
      },
    })
    await page.goto('/verify-email')
    await expect(page.getByText('Bağlantı geçersiz')).toBeVisible()
    await page.getByRole('button', { name: 'Giriş ekranına dön' }).click()
    await expect(page).toHaveURL(/\/login/)
    expect(called).toBe(false)
  })

  test('hata: TOKEN_INVALID tek mesaj (ayrım uydurulmaz) + yeniden isteme ipucu; ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page, {
      ...NO_SESSION,
      'AccountService/verifyEmail': mockError(400, { error: 'Token geçersiz.', service: 'AccountService', operation: 'verifyEmail', code: 'TOKEN_INVALID' }),
    })
    await page.goto(`/verify-email?token=${TOKEN}`)
    await expect(page.getByRole('alert').filter({ hasText: 'Bu doğrulama bağlantısının süresi dolmuş veya daha önce kullanılmış.' })).toBeVisible()
    await expect(page.getByText('Hesabım ve güvenlik ekranından yeni bir doğrulama bağlantısı', { exact: false })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Token geçersiz.')
  })

  test('hata: 429 oran sınırı mesajı', async ({ page }) => {
    await installApiMocks(page, { ...NO_SESSION, 'AccountService/verifyEmail': mockError(429, { error: 'Too many requests' }) })
    await page.goto(`/verify-email?token=${TOKEN}`)
    await expect(page.getByRole('alert').filter({ hasText: 'Çok fazla deneme yapıldı — birkaç dakika sonra tekrar deneyin.' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Too many requests')
  })

  test('ekran görüntüsü tabanı (doğrulandı)', async ({ page }) => {
    await installApiMocks(page, { ...NO_SESSION, 'AccountService/verifyEmail': { success: true } })
    await page.goto(`/verify-email?token=${TOKEN}`)
    await expect(page.getByRole('button', { name: 'Uygulamaya git' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('verify-email.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA — 0 ihlal (başarı ve hata durumları)', async ({ page }) => {
    await installApiMocks(page, { ...NO_SESSION, 'AccountService/verifyEmail': { success: true } })
    await page.goto(`/verify-email?token=${TOKEN}`)
    await expect(page.getByRole('button', { name: 'Uygulamaya git' })).toBeVisible()
    const ok = await new AxeBuilder({ page }).include('.VerifyEmailView').withTags(AXE_TAGS).analyze()
    expect(ok.violations, JSON.stringify(ok.violations, null, 2)).toEqual([])
  })
})
