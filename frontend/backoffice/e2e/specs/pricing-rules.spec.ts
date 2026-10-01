// PRC-R2: Rekabet ayarları → "Fiyat kuralları" paneli (sahte API). Kill-switch + S6 kota ayarı mevcut taslak → yayın akışıyla;
// istatistikler yalnız TOPLAM (tenant verisi yok); otomatik uygulama yok notu; axe 0. İnceleme görüntüsü: PRC_REVIEW=1.
import { expect, test } from '@playwright/test'
import { expectNoA11yViolations, settle, signInFully } from '../support/session'

const REVIEW = process.env.PRC_REVIEW === '1'

test.describe('fiyat kuralları paneli', () => {
  test.beforeEach(async ({ page }) => signInFully(page))

  test('durum + toplam istatistik + dikkat; kill-switch taslağa düşer; tenant verisi yok; axe 0', async ({ page }, info) => {
    await page.goto('/sistem/rekabet')
    await expect(page.getByRole('heading', { level: 1, name: 'Rekabet ayarları' })).toBeVisible()
    await settle(page)
    const panel = page.getByTestId('pricing-rules-panel')
    await expect(panel.getByTestId('pricing-rules-switch-state')).toContainText('Kapalı')
    const stats = panel.getByTestId('pricing-rules-stats')
    await expect(stats).toContainText('Açık müşteri')
    await expect(stats).toContainText('37')
    await expect(panel).toContainText('Dış değişiklikle duraklayan kural')
    await expect(panel).toContainText('Platform anahtarı kapalı')
    await expect(panel).toContainText('Otomatik (müşteri onaysız) fiyat uygulaması bu sürümde yoktur')
    await expect(panel).not.toContainText(/Mağaza|tenant #|₺/)
    await expect(panel.getByTestId('pricing-rules-quota')).toContainText('Onay başına 1 eylem')
    await expectNoA11yViolations(page)
    if (REVIEW) await panel.screenshot({ path: `../docs/prc-r2-review/backoffice/fiyat-kurallari-paneli-${info.project.name}.png` })

    await panel.getByTestId('pricing-rules-flag').locator('input').first().check({ force: true })
    await panel.getByTestId('pricing-rules-save').click()
    await expect(page.getByTestId('draft-bar')).toBeVisible()
    await expect(page.getByTestId('draft-bar')).toContainText('ayar değişecek')
  })
})
