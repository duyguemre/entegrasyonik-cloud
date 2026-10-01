// P1 — Giriş ekranı KAYIT sekmesi (LoginComponent). ADR-0014 S4b öncesi DEĞİŞTİRİLMEMİŞ koda karşı characterization:
// sekme render'ı, kayıt gövdesi (`registerValues`), hata-yutma davranışı. Bu testler S4b değişikliğinden SONRA da
// geçmelidir; TEK BİLİNÇLİ FARK: gönderimden önce yasal onay kutusu işaretlenir (ADR-0014 S4b — onaysız gönderim
// engellenir; bu davranış `register-handoff.spec.ts`'te sabitlenir). Ekran görüntüsü tabanı S4b'de bilinçli yeniden alındı.
import { test, expect } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { userContextFixture } from '../fixtures/apiData'

const NO_SESSION = { checkAuthentication: false, userContext: mockError(401, {}) } as const

test.describe('P1 — Kayıt sekmesi (characterization)', () => {
  test('smoke: KAYIT sekmesi alanları ve gönder düğmesi render olur', async ({ page }) => {
    await installApiMocks(page, NO_SESSION)
    await page.goto('/login')
    await page.getByRole('tab', { name: 'Kayıt' }).click()

    await expect(page.getByLabel('İsim')).toBeVisible()
    await expect(page.getByLabel('Soyisim')).toBeVisible()
    await expect(page.getByLabel('Parola (Tekrar)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kayıt Ol' })).toBeVisible()
  })

  test('etkileşim: form doldurulup gönderilince SecurityService/register çağrılır (registerValues gövdesi)', async ({ page }) => {
    let body: any
    await installApiMocks(page, {
      ...NO_SESSION,
      'SecurityService/register': async (route, headers) => {
        body = route.request().postDataJSON()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(userContextFixture) })
      },
    })
    await page.goto('/login')
    await page.getByRole('tab', { name: 'Kayıt' }).click()
    await page.getByLabel('İsim').fill('Deneme')
    await page.getByLabel('Soyisim').fill('Kullanici')
    await page.getByLabel('E-posta').last().fill('yeni@example.invalid')
    await page.getByLabel('Parola', { exact: true }).last().fill('e2e-pass-1234')
    await page.getByLabel('Parola (Tekrar)').fill('e2e-pass-1234')
    await page.getByRole('checkbox', { name: /okudum, kabul ediyorum/ }).check()
    await page.getByRole('button', { name: 'Kayıt Ol' }).click()

    await expect.poll(() => body?.registerValues?.email).toBe('yeni@example.invalid')
    expect(body.registerValues).toMatchObject({ name: 'Deneme', surname: 'Kullanici', password: 'e2e-pass-1234', password2: 'e2e-pass-1234' })
  })

  test('hata-yutma (gizli davranış, DEĞİŞMEDİ): kayıt 400 dönerse ekranda hata gösterilmez, ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page, { ...NO_SESSION, 'SecurityService/register': mockError(400, { message: 'Bu e-posta zaten kayıtlı' }) })
    await page.goto('/login')
    await page.getByRole('tab', { name: 'Kayıt' }).click()
    await page.getByLabel('İsim').fill('Deneme')
    await page.getByRole('checkbox', { name: /okudum, kabul ediyorum/ }).check()
    await page.getByRole('button', { name: 'Kayıt Ol' }).click()

    await page.waitForTimeout(500)
    await expect(page.getByRole('tab', { name: 'Kayıt' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('body')).not.toContainText('400')
    await expect(page.locator('body')).not.toContainText('Request failed')
  })

  test('ekran görüntüsü tabanı (kayıt sekmesi)', async ({ page }) => {
    await installApiMocks(page, NO_SESSION)
    await page.goto('/login')
    await page.getByRole('tab', { name: 'Kayıt' }).click()
    await expect(page.getByLabel('Parola (Tekrar)')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(400)
    await expect(page).toHaveScreenshot('login-register.png', { fullPage: false })
  })
})
