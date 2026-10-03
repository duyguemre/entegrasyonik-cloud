// P1 — Giriş (LoginView/LoginComponent). DEĞİŞTİRİLMEMİŞ koda karşı characterization.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { userContextFixture } from '../fixtures/apiData'
import { waitForShellReady } from '../fixtures/nav'

test.describe('P1 — Giriş', () => {
  test.beforeEach(async ({ page }) => {
    // Varsayılan: oturum yok (checkAuthentication=false, userContext=401) — router guard /login'de kalır.
    await installApiMocks(page, {
      checkAuthentication: false,
      userContext: mockError(401, {}),
    })
  })

  test('smoke: giriş formu render olur (sekmeler + alanlar + buton)', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('tab', { name: 'Hesabım var' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Yeni hesap' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Parolamı unuttum' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Parolanızı mı unuttunuz?' })).toBeVisible()
    await expect(page.getByLabel('E-posta')).toBeVisible()
    await expect(page.getByLabel('Parola', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Devam et' })).toBeVisible()
  })

  // Silindi: CAPTCHA "gizli iş kuralı" testi — Faz 4 hesap sözleşmesiyle captcha kaldırıldı (LoginComponent artık `requireCaptcha` işlemez).

  test('hata durumu: hatalı bilgilerde Türkçe hata mesajı gösterilir, ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page, {
      checkAuthentication: false,
      userContext: mockError(401, {}),
      'SecurityService/login': mockError(401, { message: 'Unauthorized' }),
    })
    await page.goto('/login')
    await page.getByLabel('E-posta').fill('yanlis@example.invalid')
    await page.getByLabel('Parola', { exact: true }).fill('yanlis-sifre')
    await page.getByRole('button', { name: 'Devam et' }).click()

    await expect(page.getByText('Bilgiler hatalı, lütfen kontrol ediniz.')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('Unauthorized')
    await expect(page.locator('body')).not.toContainText('401')
  })

  test('etkileşim: başarılı girişte kabuk açılır (birincil akış)', async ({ page }) => {
    let authenticated = false
    await installApiMocks(page, {
      checkAuthentication: async (route, headers) => route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(authenticated) }),
      userContext: async (route, headers) => {
        if (!authenticated) return route.fulfill({ status: 401, contentType: 'application/json', headers, body: '{}' })
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(userContextFixture) })
      },
      'SecurityService/login': async (route, headers) => {
        authenticated = true
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(userContextFixture) })
      },
    })
    await page.goto('/login')
    await page.getByLabel('E-posta').fill('e2e@example.invalid')
    await page.getByLabel('Parola', { exact: true }).fill('e2e-pass-1234')
    await page.getByRole('button', { name: 'Devam et' }).click()

    // ADR-0012 Karar 1/2 (kasıtlı davranış değişikliği, T4a): giriş sonrası artık kanonik
    // aktif-ekran adresine (`/dashboard`, `redirect` yoksa) `router.replace` ile gidiliyor —
    // eskiden yalnızca kök `/`'e gidilirdi (URL sekmeyi yansıtmıyordu).
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 })
    await waitForShellReady(page)
  })

  test('ekran görüntüsü tabanı (giriş formu)', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('tab', { name: 'Hesabım var' })).toBeVisible()
    // ADR-0011 Açık Soru 1 (Inter göçü) — bkz. `nav.ts` `waitForShellReady` yorumu: Inter'in
    // tam yüklendiğinden emin olmadan alınan ekran görüntüsü FOUT/reflow nedeniyle kararsız
    // olabiliyor; bu ekran `waitForShellReady` kullanmadığından aynı bekleme burada tekrarlanır.
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot('login.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması (ihlaller bu görevde düzeltilmiyor, yalnızca kaydediliyor)', async ({ page }, testInfo) => {
    await page.goto('/login')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-login-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] Login: ${results.violations.length} WCAG 2.1 AA ihlali (bkz. ek: axe-login-sonuclari.json)`)
  })
})
