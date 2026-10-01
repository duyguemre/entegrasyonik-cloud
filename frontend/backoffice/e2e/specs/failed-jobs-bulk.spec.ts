// Başarısız işler: süzgeç (URL), toplu yeniden deneme (step-up + gerekçe), kısmi sonuç, iz bağlantısı. Sahte /admin-api.
import { expect, test, type Page } from '@playwright/test'
import { expectNoA11yViolations, settle, signInFully } from '../support/session'

const REASON = 'Destek kaydı #örnek: toplu deneme'

async function stepUpIfAsked(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Kimliğinizi yeniden doğrulayın' })
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByLabel('Parola').fill('ornek-parola')
    await dialog.getByLabel('Doğrulama kodu').fill('222222')
    await dialog.getByRole('button', { name: 'Doğrula ve devam et' }).click()
  }
}

test.describe('başarısız işler: süzgeç + toplu yeniden deneme', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('süzgeç URL ile gelir, "N iş (süzgeçli)" gösterir; sözleşme adları da okunur; axe 0', async ({ page }) => {
    await page.goto('/motor?sekme=basarisiz&gorunum=ayrinti&integrationCode=trendyol&errorCode=UNAVAILABLE')
    await settle(page)
    await expect(page.getByTestId('filtered-total')).toHaveText('4 iş (süzgeçli)')
    await expect(page.locator('tbody tr')).toHaveCount(4)
    await expectNoA11yViolations(page)
    await page.getByTestId('filters-clear').click()
    await settle(page)
    await expect(page).not.toHaveURL(/kod=|errorCode=/)
    await expect(page.getByTestId('filtered-total')).toHaveCount(0)
  })

  test('süzgece uyan iş yoksa açıklayıcı boş durum', async ({ page }) => {
    await page.goto('/motor?sekme=basarisiz&gorunum=ayrinti&tid=999')
    await settle(page)
    await expect(page.getByText('Süzgece uyan iş yok')).toBeVisible()
  })

  test('toplu: seç → gerekçe + step-up → başarılılar düşer, atlanan seçili kalır ve nedeni görünür', async ({ page }) => {
    await page.goto('/motor?sekme=basarisiz&gorunum=ayrinti&entegrasyon=trendyol&kod=UNAVAILABLE')
    await settle(page)
    await expect(page.getByTestId('bulk-retry')).toBeDisabled()
    await page.getByTestId('select-all').locator('input').check()
    await expect(page.getByTestId('selected-count')).toHaveText('4 iş seçildi')
    await expect(page.getByRole('checkbox', { name: /işini seç/ })).toHaveCount(4)
    await page.getByTestId('bulk-retry').click()
    const dialog = page.getByRole('dialog', { name: '4 iş yeniden denensin mi?' })
    await expect(dialog).toContainText('4 iş · UNAVAILABLE · Trendyol')
    await dialog.getByLabel('Gerekçe').fill(REASON)
    await dialog.getByRole('button', { name: 'Seçilenleri yeniden dene' }).click()
    await stepUpIfAsked(page)
    await expect(page.getByText('3 iş yeniden kuyruğa alındı, 1 iş atlandı (zaten işleniyor).')).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.getByTestId('row-error')).toContainText('zaten işleniyor')
    await expect(page.getByTestId('selected-count')).toHaveText('1 iş seçildi')
  })

  test('tek satır seçimi klavye ile; iz bağlantısı reqId ile loglara gider', async ({ page }) => {
    await page.goto('/motor?sekme=basarisiz&gorunum=ayrinti')
    await settle(page)
    const first = page.getByTestId('row-select').first().locator('input')
    await first.focus()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('selected-count')).toHaveText('1 iş seçildi')
    const link = page.getByTestId('trace-link').first()
    const id = await page.getByTestId('req-id').first().innerText()
    await expect(link).toHaveAttribute('href', new RegExp(`/loglar\\?reqId=${id}`))
  })

  test('hüküm: başarısız iş maddesi baskın kodla süzgeçli sekmeye bağlanır', async ({ page }) => {
    await page.goto('/motor')
    await settle(page)
    await page.getByRole('link', { name: 'Başarısız işleri aç' }).first().click()
    await expect(page).toHaveURL(/sekme=basarisiz.*kod=[A-Z_]+/)
  })
})
