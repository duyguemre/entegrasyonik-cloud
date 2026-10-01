// MOB-08 / K55: kullanımda masaüstü/mobil ayrımı — Kullanım ekranı + müşteri detayı "Kullanım" sekmesi (sahte API).
import { expect, test, type Page } from '@playwright/test'
import { expectNoA11yViolations, settle, signInFully } from '../support/session'

type Mock = { setUsageEmpty(v: boolean): void; failOps(p: string | null): void }
const mock = <T>(page: Page, fn: (m: Mock) => T) => page.evaluate(`(${fn.toString()})(window.__boMock)`)

test.describe('kullanım (MOB-08)', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('Kullanım ekranı: Durum → Karar → Eylem → Ayrıntı; masaüstü/mobil kırılım; alt türler açılır; axe 0', async ({ page }) => {
    await page.goto('/musteriler/kullanim')
    await expect(page.getByRole('heading', { level: 1, name: 'Kullanım' })).toBeVisible()
    await settle(page)
    // INT-1001 §8: ortak PageVerdict (Durum = hüküm + rozet, Karar = dikkat listesi / sakin başlık, Eylem = ilk adım kartı + bağlantılar).
    const verdict = page.getByTestId('usage-verdict')
    await expect(verdict.getByTestId('status-verdict')).toContainText('aktif kullanıcı')
    await expect(verdict.getByTestId('health-badge')).toBeVisible()
    await expect(verdict.getByTestId('verdict-first-action').getByRole('link')).toBeVisible()
    await expect(page.getByTestId('details-label')).toBeVisible()
    await expect(page.getByLabel('Son 7 gün aktif kullanıcı: masaüstü ve mobil')).toContainText('Masaüstü')
    await expect(page.getByLabel('Son 7 gün aktif kullanıcı: masaüstü ve mobil')).toContainText('Mobil')
    const subs = page.getByTestId('platform-subtypes').first()
    await expect(subs.getByText('Android uygulaması')).toBeHidden()
    await subs.locator('summary').click()
    await expect(subs.getByText('Android uygulaması')).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test('platform süzgeci URL\'ye yazılır; alt tür seçimi; Tümü geri döner', async ({ page }) => {
    await page.goto('/musteriler/kullanim')
    await settle(page)
    await page.locator('[data-value="mobile"]').first().click()
    await expect(page).toHaveURL(/platform=mobile/)
    await settle(page)
    await expect(page.getByTestId('usage-filter-note')).toContainText('Mobil')
    await page.getByTestId('platform-subtype').first().selectOption('pwa')
    await expect(page).toHaveURL(/platform=pwa/)
    await settle(page)
    await expect(page.getByTestId('usage-filter-note')).toContainText('Kurulu web uygulaması')
    await page.locator('[data-value="all"]').first().click()
    await expect(page).not.toHaveURL(/platform=/)
  })

  test('kayıt yokken "henüz yok" hükmü (uydurma 0 yok); hata durumunda yeniden dene', async ({ page }) => {
    await page.goto('/musteriler/kullanim')
    await settle(page)
    await mock(page, (m) => m.setUsageEmpty(true))
    await page.locator('[data-page-refresh]').click()
    await settle(page)
    await expect(page.getByTestId('usage-verdict')).toContainText('Kullanım verisi henüz yok')
    await expect(page.getByTestId('usage-today')).toHaveCount(0)
    await mock(page, (m) => { m.setUsageEmpty(false); m.failOps('BackofficeOverviewService/') })
    await page.locator('[data-page-refresh]').click()
    await settle(page)
    await expect(page.getByText(/Yenilenemedi|Yüklenemedi/).first()).toBeVisible()
  })

  test('müşteri detayı: Kullanım sekmesi — aralık + süzgeç, giriş kırılımı, uzun süre pasif müşteri uyarısı; axe 0', async ({ page }) => {
    await page.goto('/musteriler/102?sekme=kullanim')
    await settle(page)
    await expect(page.getByRole('tab', { name: 'Kullanım' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('usage-verdict')).toBeVisible()
    await expect(page.getByTestId('tenant-usage-logins')).toBeVisible()
    await page.locator('[data-value="7"]').click()
    await expect(page).toHaveURL(/gun=7/)
    await settle(page)
    await page.locator('[data-value="desktop"]').first().click()
    await expect(page).toHaveURL(/platform=desktop/)
    await settle(page)
    await expectNoA11yViolations(page)

    await page.goto('/musteriler/103?sekme=kullanim')
    await settle(page)
    await expect(page.getByTestId('usage-verdict')).toContainText('gündür aktif kullanıcı yok')
    await expect(page.getByTestId('usage-actions').getByRole('link', { name: /Yaşam döngüsüne bak/ })).toBeVisible()
  })
})
