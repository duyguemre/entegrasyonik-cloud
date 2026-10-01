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

  test('hüküm maddesi listeyi süzer (kanalsız hesaplar)', async ({ page }) => {
    await page.goto('/musteriler')
    await settle(page)
    await page.getByRole('link', { name: /Kanalsız hesapları aç/ }).click()
    await expect(page).toHaveURL(/durum=kanalsiz/)
    await expect(page.getByRole('radio', { name: /Kanalsız/ })).toHaveAttribute('aria-checked', 'true')
  })
})
