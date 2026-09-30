// DS-v2 Aşama 5 (kullanıcı geri bildirimi madde 6) — TÜM sayfalarda tek başlık deseni: büyük başlık + açıklama bloğu yok;
// breadcrumb satırında H1 + (i) "Sayfa hakkında" paneli. Varsayılan kapalı, tercih sayfalar arası ortak ve hatırlanır.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, openScreen } from '../fixtures/nav'

const AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

test.describe('Aşama 5 — sayfa başlığı ve "Sayfa hakkında"', () => {
  test('açıklama varsayılan gizli; (i) açar, tercih diğer sayfada ve yeniden yüklemede korunur; axe 0', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    const area = page.locator('.workplace-area .orderListView')
    await expect(area.getByRole('heading', { level: 1, name: 'Siparişler' })).toBeVisible()
    const desc = area.getByText('Tüm pazaryeri siparişlerinizi buradan yönetin.')
    await expect(desc).toBeHidden()

    const info = area.getByRole('button', { name: /^Sayfa hakkında/ })
    await expect(info).toHaveAttribute('aria-expanded', 'false')
    await info.click()
    await expect(info).toHaveAttribute('aria-expanded', 'true')
    await expect(desc).toBeVisible()
    await expect(area.getByRole('region', { name: /sayfası hakkında/ })).toContainText('Ctrl')
    const axe = await new AxeBuilder({ page }).withTags(AA).include('.workplace-area .orderListView .ek-page-bar').analyze()
    expect(axe.violations).toEqual([])

    await openScreen(page, 'ClaimListView')
    await expect(page.locator('.workplace-area .claimListView').getByRole('button', { name: /^Sayfa hakkında/ })).toHaveAttribute('aria-expanded', 'true')
    await page.reload()
    await page.getByRole('tab', { name: 'İade Yönetimi' }).click()
    const claimInfo = page.locator('.workplace-area .claimListView').getByRole('button', { name: /^Sayfa hakkında/ })
    await expect(claimInfo).toHaveAttribute('aria-expanded', 'true')
    await claimInfo.click()
    await expect(claimInfo).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.workplace-area .claimListView').getByText(/iade\/talep süreçlerini/)).toBeHidden()
  })

  test('"Tüm kısayollar" kısayol diyaloğunu açar', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    const area = page.locator('.workplace-area .orderListView')
    await area.getByRole('button', { name: /^Sayfa hakkında/ }).click()
    await area.getByRole('button', { name: 'Tüm kısayollar' }).click()
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Klavye kısayolları' })).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText('Üst bölümü daralt')
  })
})
