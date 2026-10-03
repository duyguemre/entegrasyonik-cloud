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

    await expect(page.getByRole('tab', { name: 'GİRİŞ' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'KAYIT' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'ŞİFREMİ UNUTTUM' })).toBeVisible()
    await expect(page.getByLabel('EPosta')).toBeVisible()
    await expect(page.getByLabel('Şifre', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Giriş' })).toBeVisible()
  })

  test('gizli iş kuralı: güvenlik kodu (CAPTCHA) gerektiğinde cevap ekranda AÇIK METİN gösteriliyor (bkz. BACKLOG.md)', async ({ page }) => {
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md'ye "incelenmesi gereken davranış" eklendi):
    // requireCaptcha=true döndüğünde LoginComponent captcha metnini {{ captchaSecret }} ile DOĞRUDAN
    // render ediyor (bkz. LoginComponent.vue satır ~50) — yani "güvenlik kodu" kullanıcının kendisine
    // sunuluyor, bir insan/bot ayrımı sağlamıyor. Şüpheli ama bu görevde DÜZELTİLMEDİ, yalnızca sabitlendi.
    await installApiMocks(page, {
      checkAuthentication: false,
      userContext: mockError(401, {}),
      'SecurityService/login': { requireCaptcha: true, message: 'Güvenlik kodu gereklidir.' },
      'SecurityService/getCaptcha': { captcha: 'AB12' },
    })
    await page.goto('/login')
    await page.getByLabel('EPosta').fill('e2e@example.invalid')
    await page.getByLabel('Şifre', { exact: true }).fill('e2e-pass')
    await page.getByRole('button', { name: 'Giriş' }).click()

    await expect(page.getByText('Güvenlik kodu gereklidir.')).toBeVisible()
    await expect(page.locator('.captcha-box')).toHaveText('AB12')
  })

  test('hata durumu: hatalı bilgilerde Türkçe hata mesajı gösterilir, ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page, {
      checkAuthentication: false,
      userContext: mockError(401, {}),
      'SecurityService/login': mockError(401, { message: 'Unauthorized' }),
    })
    await page.goto('/login')
    await page.getByLabel('EPosta').fill('yanlis@example.invalid')
    await page.getByLabel('Şifre', { exact: true }).fill('yanlis-sifre')
    await page.getByRole('button', { name: 'Giriş' }).click()

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
    await page.getByLabel('EPosta').fill('e2e@example.invalid')
    await page.getByLabel('Şifre', { exact: true }).fill('e2e-pass-1234')
    await page.getByRole('button', { name: 'Giriş' }).click()

    // ADR-0012 Karar 1/2 (kasıtlı davranış değişikliği, T4a): giriş sonrası artık kanonik
    // aktif-ekran adresine (`/dashboard`, `redirect` yoksa) `router.replace` ile gidiliyor —
    // eskiden yalnızca kök `/`'e gidilirdi (URL sekmeyi yansıtmıyordu).
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 })
    await waitForShellReady(page)
  })

  test('ekran görüntüsü tabanı (giriş formu)', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('tab', { name: 'GİRİŞ' })).toBeVisible()
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
