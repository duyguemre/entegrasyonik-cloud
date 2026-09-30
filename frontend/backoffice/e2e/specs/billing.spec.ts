import { expect, test, type Page } from '@playwright/test'
import { ACCOUNT, expectNoA11yViolations, settle, signInFully } from '../support/session'

type Mock = { expireReauth(): void; setDegraded(v: boolean): void; setLiveReadonly(v: boolean): void }
const mock = <T>(page: Page, fn: (m: Mock) => T) => page.evaluate(`(${fn.toString()})(window.__boMock)`)

test.describe('abonelikler', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('liste: h1, axe 0, filtre ve boş durum', async ({ page }) => {
    await page.goto('/abonelikler')
    await expect(page.getByRole('heading', { level: 1, name: 'Abonelikler' })).toBeVisible()
    await settle(page)
    await expect(page.getByTestId('sub-101')).toBeVisible()
    await expect(page.getByText('kartsız').first()).toBeVisible()
    await expect(page.getByText('VİSA •••• 4242')).toBeVisible()
    await expectNoA11yViolations(page)

    await page.getByTestId('status-filter').click()
    await page.getByRole('option', { name: 'Süresi doldu' }).click()
    await settle(page)
    await expect(page.getByText('Filtreye uyan abonelik yok')).toBeVisible()
    await page.getByRole('button', { name: 'Filtreleri temizle' }).click()
    await settle(page)
    await expect(page.getByTestId('sub-101')).toBeVisible()
  })

  test('gelir metrikleri: tahmini etiketi, MRR, axe 0', async ({ page }) => {
    await page.goto('/abonelikler?sekme=gelir')
    await settle(page)
    await expect(page.getByText('Liste fiyatından tahmini').first()).toBeVisible()
    await expect(page.getByTestId('mrr')).toContainText('₺')
    await expect(page.getByText('Kayıp yaklaşık')).toBeVisible()
    await page.locator('[data-range="7d"]').click()
    await settle(page)
    await expectNoA11yViolations(page)
  })

  test('detay: özet, olaylar, uygunsuz eylem devre dışı, 404', async ({ page }) => {
    await page.goto('/abonelikler/101')
    await expect(page.getByRole('heading', { level: 1, name: /Lale Ev Tekstil/ })).toBeVisible()
    await settle(page)
    await expect(page.getByTestId('extend-trial')).toBeDisabled()
    await expect(page.getByText('Yalnız deneme sürecindeki abonelikte uzatılabilir.')).toBeVisible()
    await expect(page.getByTestId('tenant-link')).toHaveAttribute('href', '/musteriler/101')
    await expectNoA11yViolations(page)
    await page.goto('/abonelikler/999')
    await expect(page.getByText('Abonelik bulunamadı')).toBeVisible()
  })

  test('denemeyi uzat: step-up + gerekçe → toast', async ({ page }) => {
    await page.goto('/abonelikler/103')
    await settle(page)
    await mock(page, (m) => m.expireReauth())
    await page.getByTestId('extend-trial').click()
    const dialog = page.getByRole('dialog', { name: 'Deneme süresi uzatılsın mı?' })
    await dialog.getByTestId('extend-days').locator('input').fill('10')
    await dialog.getByLabel('Gerekçe').fill('Müşteri talebi: kurulum gecikti')
    await dialog.getByRole('button', { name: 'Denemeyi uzat' }).click()
    const reauth = page.getByRole('dialog', { name: 'Kimliğinizi yeniden doğrulayın' })
    await expect(reauth).toBeVisible()
    await reauth.getByLabel('Parola').fill(ACCOUNT.password)
    await reauth.getByLabel('Doğrulama kodu').fill('135790')
    await reauth.getByRole('button', { name: 'Doğrula ve devam et' }).click()
    await expect(page.getByText(/Deneme 10 gün uzatıldı/)).toBeVisible()
  })

  test('iptal: kartsız denemede NO_PROVIDER mesajı; salt-okuma 423 diyalogda', async ({ page }) => {
    await page.goto('/abonelikler/103')
    await settle(page)
    await page.getByTestId('cancel-sub').click()
    const dialog = page.getByRole('dialog', { name: 'Abonelik iptal edilsin mi?' })
    await dialog.getByLabel('Gerekçe').fill('Test: kartsız deneme iptali')
    await dialog.getByRole('button', { name: 'Aboneliği iptal et' }).click()
    await expect(dialog.locator('.v-input__details')).toContainText('sağlayıcı kaydı yok')
    await mock(page, (m) => m.setLiveReadonly(true))
    await dialog.getByRole('button', { name: 'Aboneliği iptal et' }).click()
    await expect(dialog.locator('.v-input__details')).toContainText('salt-okuma')
  })

  test('plan değiştir: aynı plan seçilemez, başarıda toast', async ({ page }) => {
    await page.goto('/abonelikler/101')
    await settle(page)
    await page.getByTestId('change-plan').click()
    const dialog = page.getByRole('dialog', { name: 'Plan değiştirilsin mi?' })
    await dialog.getByLabel('Gerekçe').fill('Müşteri üst plana geçmek istedi')
    await expect(dialog.getByRole('button', { name: 'Planı değiştir' })).toBeDisabled()
    await dialog.getByTestId('target-plan').click()
    await page.getByRole('option', { name: /Başlangıç/ }).click()
    await dialog.getByRole('button', { name: 'Planı değiştir' }).click()
    await expect(page.getByText('Plan Başlangıç olarak değiştirildi.')).toBeVisible()
  })
})
