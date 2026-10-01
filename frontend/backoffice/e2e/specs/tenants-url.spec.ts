import { expect, test } from '@playwright/test'
import { settle, signInFully } from '../support/session'

test.describe('müşteri listesi: sıralama ve paylaşılan görünüm (NT-05, NT-03)', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('sütun başlığı sıralar: aria-sort + ?sira=; bağlantı aynı görünümü açar', async ({ page }) => {
    await page.goto('/musteriler')
    await settle(page)
    const th = page.locator('th', { has: page.locator('[data-sort="sonEsitleme"]') })
    await expect(th).toHaveAttribute('aria-sort', 'none')
    await page.locator('[data-sort="sonEsitleme"]').click()
    await expect(page).toHaveURL(/sira=-sonEsitleme/)
    await expect(th).toHaveAttribute('aria-sort', 'descending')
    await page.locator('[data-sort="sonEsitleme"]').click()
    await expect(page).toHaveURL(/sira=sonEsitleme/)
    await expect(th).toHaveAttribute('aria-sort', 'ascending')

    await page.getByRole('radio', { name: /Aktif/ }).click()
    await page.getByRole('textbox', { name: 'Mağaza adı ya da numarası' }).fill('Poyraz')
    await expect(page).toHaveURL(/q=Poyraz/)
    await expect(page).toHaveURL(/durum=aktif/)
    const url = page.url()

    // Tam yeniden yükleme = paylaşılan bağlantıyı açmak.
    await page.goto('/')
    await page.goto(url)
    const other = page
    await expect(other.getByRole('radio', { name: /Aktif/ })).toHaveAttribute('aria-checked', 'true')
    await expect(other.getByRole('textbox', { name: 'Mağaza adı ya da numarası' })).toHaveValue('Poyraz')
    await expect(other.locator('th', { has: other.locator('[data-sort="sonEsitleme"]') })).toHaveAttribute('aria-sort', 'ascending')
    await expect(page.getByRole('button', { name: 'Bu görünümün bağlantısını kopyala' })).toBeVisible()
  })

  test('hüküm maddesi listeyi süzer (sorunlu müşteriler) ve operasyon sütunları görünür', async ({ page }) => {
    await page.goto('/musteriler')
    await settle(page)
    // Operasyon özeti (BE-01): açık sorun ~ ve başarısız iş sütunları, #107 satırında.
    const row = page.locator('tr', { hasText: 'Nar Mutfak' })
    await expect(row.locator('[data-col="open-issues"]')).toContainText('~4')
    await expect(row.locator('[data-col="failed-jobs"]')).toContainText('14')
    await page.getByRole('link', { name: 'Sorunlu müşterileri aç' }).first().click()
    await expect(page).toHaveURL(/durum=sorunlu/)
    await expect(page.getByRole('radio', { name: /Sorunlu müşteriler/ })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('tbody tr').first()).toContainText('Nar Mutfak')
    await expect(page.locator('tbody tr', { hasText: 'Kumaş' })).toHaveCount(0)
  })

  test('genel bakıştan gelen ?hasIssues=1 sorunlu segmente eşlenir', async ({ page }) => {
    await page.goto('/musteriler?hasIssues=1')
    await settle(page)
    await expect(page.getByRole('radio', { name: /Sorunlu müşteriler/ })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('radio', { name: /Tümü/ }).click()
    await expect(page).not.toHaveURL(/hasIssues/)
  })
})
