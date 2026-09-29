// ADR-0015 B4-P0 — N1 "Hesabım ve güvenlik" (YENİ ekran, Karar 5.6: spec ekranla aynı commit'te).
// Sözleşme: docs/API_ACCOUNT_LIFECYCLE.md #1 `changePassword`, #5 `resendVerificationEmail`, profil DTO'su.
// Sentetik fixture (Protokol 7: PII yok). Kapsam: smoke + boş/ilk durum + hata + etkileşimler (istek
// gövdesi doğrulaması) + 3 viewport ekran görüntüsü + axe AA = 0 + menü olumlu/olumsuz.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError, type MockValue } from '../fixtures/mockApi'
import { userContextFixture } from '../fixtures/apiData'
import { AXE_TAGS, B4_SCREENS, menuFixtureWithB4, openB4Screen } from '../fixtures/b4Screens'
import { openDrawer } from '../fixtures/nav'

const PROFILE = {
  ...userContextFixture,
  email: 'hesap.sahibi@entegrasyonik-e2e.invalid',
  name: 'Deniz',
  surname: 'Örnek',
  emailVerified: false,
}

const ROOT = B4_SCREENS.AccountSecurityView.root

async function mocks(page: any, overrides: Record<string, MockValue> = {}) {
  await installApiMocks(page, { MenuService: menuFixtureWithB4(), userContext: PROFILE, ...overrides })
}

function json(route: any, headers: Record<string, string>, status: number, body: unknown) {
  return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
}

async function fillPasswordForm(page: any, current: string, next: string, confirm = next) {
  const root = page.locator(ROOT)
  await root.getByLabel('Mevcut parola').fill(current)
  await root.getByLabel('Yeni parola', { exact: true }).fill(next)
  await root.getByLabel('Yeni parola (tekrar)').fill(confirm)
}

test.describe('ADR-0015 B4-P0 — N1 Hesabım ve güvenlik', () => {
  test('smoke: derin bağlantı ekranı açar; profil, doğrulama durumu ve parola formu render olur', async ({ page }) => {
    await mocks(page)
    await openB4Screen(page, 'AccountSecurityView')
    const root = page.locator(ROOT)

    await expect(root.getByRole('heading', { level: 1, name: 'Hesabım ve güvenlik' })).toBeVisible()
    await expect(root.getByText('hesap.sahibi@entegrasyonik-e2e.invalid')).toBeVisible()
    await expect(root.getByText('Deniz Örnek')).toBeVisible()
    await expect(root.getByText('Mağaza sahibi')).toBeVisible()
    await expect(root.getByText('Doğrulanmadı')).toBeVisible()
    await expect(root.getByRole('button', { name: 'Doğrulama bağlantısını gönder' })).toBeVisible()
    await expect(root.getByRole('button', { name: 'Parolayı değiştir' })).toBeVisible()
    await expect(page).toHaveURL(/\/account\/security$/)
  })

  test('boş/ilk durum: ad-soyad yoksa "—", e-posta doğrulanmışsa gönder düğmesi YOK', async ({ page }) => {
    await mocks(page, { userContext: { ...userContextFixture, email: 'ekip@entegrasyonik-e2e.invalid', owner: false, emailVerified: true } })
    await openB4Screen(page, 'AccountSecurityView')
    const root = page.locator(ROOT)

    await expect(root.getByText('Doğrulandı', { exact: true })).toBeVisible()
    await expect(root.getByText('Ekip üyesi')).toBeVisible()
    await expect(root.getByText('—')).toBeVisible()
    await expect(root.getByRole('button', { name: 'Doğrulama bağlantısını gönder' })).toHaveCount(0)
  })

  test('hata durumu: profil okunamazsa insan-okunur hata + Tekrar dene; ham hata sızmaz', async ({ page }) => {
    let calls = 0
    await mocks(page, {
      // Uygulama açılışı (App.vue) `userContext`'i BİR kez çağırır; ekranın kendi okuması 2. çağrıdır.
      userContext: async (route: any, headers: Record<string, string>) => {
        calls += 1
        return calls === 1 ? json(route, headers, 200, PROFILE) : json(route, headers, 500, { error: 'E2E sentetik iç hata stack' })
      },
    })
    await page.goto(`/${B4_SCREENS.AccountSecurityView.slug}`)
    const root = page.locator(`${ROOT}:not(.hide-tab-component)`)

    await expect(root.getByText('Hesap bilgileriniz yüklenemedi — bağlantınızı kontrol edip tekrar deneyin.')).toBeVisible({ timeout: 20000 })
    await expect(root).not.toContainText('500')
    await expect(root).not.toContainText('stack')
    await expect(root.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
  })

  test('etkileşim: parola değiştirme — istek gövdesi YALNIZCA {currentPassword,newPassword}; başarıda alanlar temizlenir', async ({ page }) => {
    let body: any
    await mocks(page, {
      'AccountService/changePassword': async (route: any, headers: Record<string, string>) => {
        body = route.request().postDataJSON()
        return json(route, headers, 200, { success: true })
      },
    })
    await openB4Screen(page, 'AccountSecurityView')
    const root = page.locator(ROOT)

    await fillPasswordForm(page, 'Eski-Parola-2026', 'Yeni.Parola-Sentetik7')
    await root.getByRole('button', { name: 'Parolayı değiştir' }).click()

    await expect(root.getByText('Parolanız değiştirildi. Diğer cihazlardaki oturumlarınız kapatıldı; bu cihazda oturumunuz açık kalır.')).toBeVisible()
    expect(body).toEqual({ currentPassword: 'Eski-Parola-2026', newPassword: 'Yeni.Parola-Sentetik7' })
    await expect(root.getByLabel('Mevcut parola')).toHaveValue('')
    await expect(root.getByLabel('Yeni parola', { exact: true })).toHaveValue('')
  })

  test('istemci doğrulaması: parolalar uyuşmazsa veya kurallar sağlanmazsa backend ÇAĞRILMAZ', async ({ page }) => {
    let called = false
    await mocks(page, {
      'AccountService/changePassword': async (route: any, headers: Record<string, string>) => {
        called = true
        return json(route, headers, 200, { success: true })
      },
    })
    await openB4Screen(page, 'AccountSecurityView')
    const root = page.locator(ROOT)

    await fillPasswordForm(page, 'Eski-Parola-2026', 'Yeni.Parola-Sentetik7', 'Farkli.Parola-Sentetik7')
    await root.getByRole('button', { name: 'Parolayı değiştir' }).click()
    await expect(root.getByText('Girdiğiniz parolalar birbiriyle uyuşmuyor.')).toBeVisible()

    await fillPasswordForm(page, 'Eski-Parola-2026', 'kisa')
    await root.getByRole('button', { name: 'Parolayı değiştir' }).click()
    await expect(root.getByText('Yeni parola aşağıdaki kuralları karşılamıyor.')).toBeVisible()
    await page.waitForTimeout(300)
    expect(called).toBe(false)
  })

  test('hata: INVALID_CURRENT_PASSWORD (400) mevcut parola alanında gösterilir ve oturum AÇIK kalır', async ({ page }) => {
    await mocks(page, {
      'AccountService/changePassword': mockError(400, { error: 'Mevcut parola hatalı.', service: 'AccountService', operation: 'changePassword', code: 'INVALID_CURRENT_PASSWORD' }),
    })
    await openB4Screen(page, 'AccountSecurityView')
    const root = page.locator(ROOT)

    await fillPasswordForm(page, 'Yanlis-Parola-2026', 'Yeni.Parola-Sentetik7')
    await root.getByRole('button', { name: 'Parolayı değiştir' }).click()

    await expect(root.getByText('Mevcut parolanız doğrulanamadı — kontrol edip tekrar deneyin.')).toBeVisible()
    await expect(page).toHaveURL(/\/account\/security$/)
  })

  test('hata: WEAK_PASSWORD sunucu mesajı (kuralları listeler) olduğu gibi gösterilir', async ({ page }) => {
    await mocks(page, {
      'AccountService/changePassword': mockError(400, { error: 'Parola yaygın kullanılan parolalar listesinde.', service: 'AccountService', operation: 'changePassword', code: 'WEAK_PASSWORD' }),
    })
    await openB4Screen(page, 'AccountSecurityView')
    const root = page.locator(ROOT)

    await fillPasswordForm(page, 'Eski-Parola-2026', 'Yeni.Parola-Sentetik7')
    await root.getByRole('button', { name: 'Parolayı değiştir' }).click()
    await expect(root.getByText('Parola yaygın kullanılan parolalar listesinde.')).toBeVisible()
  })

  test('etkileşim: doğrulama bağlantısı — gövde {} ; başarı ve bekleme (429 COOLDOWN) mesajları', async ({ page }) => {
    const bodies: any[] = []
    let calls = 0
    await mocks(page, {
      'AccountService/resendVerificationEmail': async (route: any, headers: Record<string, string>) => {
        bodies.push(route.request().postDataJSON())
        calls += 1
        return calls === 1
          ? json(route, headers, 200, { success: true })
          : json(route, headers, 429, { error: 'Too many requests', service: 'AccountService', operation: 'resendVerificationEmail', code: 'COOLDOWN' })
      },
    })
    await openB4Screen(page, 'AccountSecurityView')
    const root = page.locator(ROOT)
    const send = root.getByRole('button', { name: 'Doğrulama bağlantısını gönder' })

    await send.click()
    await expect(root.getByRole('status').filter({ hasText: 'Doğrulama bağlantısı e-posta adresinize gönderildi.' })).toBeVisible()
    await send.click()
    await expect(root.getByRole('alert').filter({ hasText: 'Kısa süre önce bir bağlantı gönderildi — bir dakika bekleyip tekrar deneyin.' })).toBeVisible()
    await expect(root).not.toContainText('Too many requests')
    expect(bodies).toEqual([{}, {}])
  })

  test('menü: ekran menü ağacındaysa kenar menüden açılır (olumlu)', async ({ page }) => {
    await mocks(page)
    await page.goto('/')
    await expect(page.locator('.workplace-tabs')).toBeVisible({ timeout: 20000 })
    await openDrawer(page)
    await page.locator('.v-navigation-drawer.soft-nav .soft-item').filter({ has: page.locator(`.${B4_SCREENS.AccountSecurityView.icon}`) }).first().click()
    await expect(page.locator(`${ROOT}:not(.hide-tab-component)`)).toBeVisible({ timeout: 20000 })
  })

  test('menü: ekran kullanıcının menü ağacında YOKSA derin bağlantı panoya döner (olumsuz)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithB4(['StockPolicyView']), userContext: PROFILE })
    await page.goto(`/${B4_SCREENS.AccountSecurityView.slug}`)
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 })
    await expect(page.locator(ROOT)).toHaveCount(0)
  })

  test('ekran görüntüsü tabanı (hesabım ve güvenlik)', async ({ page }) => {
    await mocks(page)
    await openB4Screen(page, 'AccountSecurityView')
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('account-security.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA — 0 ihlal (ekran kökü)', async ({ page }) => {
    await mocks(page)
    await openB4Screen(page, 'AccountSecurityView')
    const results = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
})
