// BE-05 kayıtlı görünümler: kaydet → listede → aç → URL süzgeci uygulandı → sil. Sahte /admin-api (bellekte); görsel taban YOK.
import { expect, test } from '@playwright/test'
import { expectNoA11yViolations, settle, signInFully } from '../support/session'

test.describe('Kayıtlı görünümler', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('loglar: süzgeci kaydet, boş sorguya dön, görünümden aç, sil', async ({ page }) => {
    await page.goto('/loglar?level=error')
    await settle(page)
    await expect(page.getByRole('button', { name: 'Bu görünümün bağlantısını kopyala' })).toBeVisible()

    await page.getByTestId('saved-views-trigger').click()
    const menu = page.getByTestId('saved-views-menu')
    await expect(menu.getByTestId('saved-views-empty')).toHaveText('Bu ekranda kayıtlı görünüm yok.')
    await menu.getByTestId('saved-view-add').click()
    await menu.getByTestId('saved-view-name').fill('Yalnız hatalar')
    await menu.getByTestId('saved-view-submit').click()
    await expect(menu.locator('[data-view-name="Yalnız hatalar"]')).toBeVisible()
    await expectNoA11yViolations(page, '[data-testid="saved-views-menu"]')
    await page.keyboard.press('Escape')

    // Süzgeci temizle (BoFilterBar'ın tek "Filtreleri temizle" düğmesi) → URL'de level kalmaz.
    await expect(page.getByText('1 süzgeç etkin')).toBeVisible()
    await page.getByRole('button', { name: 'Filtreleri temizle' }).click()
    await expect(page).not.toHaveURL(/level=/)

    await page.getByTestId('saved-views-trigger').click()
    await page.getByTestId('saved-views-menu').locator('[data-view-name="Yalnız hatalar"] .bo-views__item').click()
    await expect(page).toHaveURL(/level=error/)
    await expect(page.getByTestId('level-filter')).toContainText('Hata')
    await expect(page.getByText('1 süzgeç etkin')).toBeVisible()

    await page.getByTestId('saved-views-trigger').click()
    await page.getByRole('button', { name: 'Yalnız hatalar görünümünü sil' }).click()
    await expect(page.getByTestId('saved-views-empty')).toBeVisible()
  })

  test('loglar ?tid=: sorun grupları da kapsamlı ve yaklaşık; menü ekran görüntüsü kontrolü', async ({ page }) => {
    await page.goto('/loglar?tid=104&sekme=sorunlar')
    await settle(page)
    await expect(page.getByTestId('tid-scope-note')).toContainText('yaklaşık')
    await expect(page.getByTestId('issues-approx')).toBeVisible()
    await page.getByTestId('saved-views-trigger').click()
    await expect(page.getByTestId('saved-views-menu')).toBeVisible()
  })
})
