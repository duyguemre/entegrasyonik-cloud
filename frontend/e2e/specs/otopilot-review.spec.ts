// İnceleme görselleri (belge; Playwright tabanı DEĞİL) → packages/chat/docs/review/. Yalnız `OTOPILOT_REVIEW_CAPTURE=1`.
// 1440 + 390 px, açık + koyu. Açık: gerçek kabuk (yan panel / tam sayfa); koyu: DEV tezgâhı (FR2-DARK kapısı kapalı).
import { test, expect, type Page } from '@playwright/test'
import { gotoWithOtopilot, launcher, ask, composer, useOtopilotMock } from '../fixtures/otopilot'
import { installApiMocks } from '../fixtures/mockApi'

const OUT = 'packages/chat/docs/review'
test.skip(!process.env.OTOPILOT_REVIEW_CAPTURE, 'yalnız inceleme görseli üretiminde')

async function shot(page: Page, name: string) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

async function harness(page: Page, query: string, ready: string) {
  await installApiMocks(page)
  await page.goto(`/dev/otopilot?speed=0&theme=dark&${query}`)
  await expect(page.getByText(ready).first()).toBeVisible()
}

test.describe('inceleme 1440', () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  test('açık — kabuk içi yan panel (push)', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop')
    await gotoWithOtopilot(page)
    await launcher(page).click()
    await shot(page, '1440-light-01-panel-empty')
    await ask(page, 'onay bekleyen siparişler')
    await expect(page.getByText('en eski 25')).toBeVisible()
    await shot(page, '1440-light-02-panel-table')
    await ask(page, 'ilk 3 siparişi onayla')
    await expect(page.getByText('Kalan süre').first()).toBeVisible()
    await shot(page, '1440-light-03-panel-confirm')
    await page.getByRole('button', { name: 'Tam sayfada aç' }).click()
    await expect(page).toHaveURL(/otopilot$/)
    await shot(page, '1440-light-04-page')
  })
  test('açık — kurulum ve ayarlar', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop')
    await gotoWithOtopilot(page, 'setup-required')
    await launcher(page).click()
    await expect(page.getByLabel('API anahtarı')).toBeVisible()
    await shot(page, '1440-light-05-setup')
    await useOtopilotMock(page, 'enabled')
    await page.goto('/settings/otopilot')
    await expect(page.getByText('Kullanım (bilgi amaçlı)')).toBeVisible()
    await shot(page, '1440-light-06-settings')
  })
  test('koyu — tezgâh', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop')
    await harness(page, 'ask=onay%20bekleyen%20sipari%C5%9Fler', 'en eski 25')
    await shot(page, '1440-dark-01-panel-table')
    await harness(page, 'ask=sipari%C5%9Fleri%20onayla', 'Kalan süre')
    await shot(page, '1440-dark-02-panel-confirm')
    await harness(page, 'mode=page&ask=bu%20haftaki%20sat%C4%B1%C5%9F', 'arttı')
    await shot(page, '1440-dark-03-page-kpi')
    await harness(page, 'config=setup-required', 'API anahtarı')
    await shot(page, '1440-dark-04-setup')
  })
})

test.describe('inceleme 390', () => {
  test.use({ viewport: { width: 390, height: 844 } })
  test('açık — mobil tam ekran', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop')
    await gotoWithOtopilot(page, 'enabled', { path: '/otopilot' })
    await expect(composer(page)).toBeVisible()
    await shot(page, '390-light-01-empty')
    await ask(page, 'onay bekleyen siparişler')
    await expect(page.getByText('en eski 25')).toBeVisible()
    await shot(page, '390-light-02-table')
    await ask(page, 'taslakları sil')
    await expect(page.getByText('Kalan süre').first()).toBeVisible()
    await shot(page, '390-light-03-typed-confirm')
  })
  test('koyu — mobil tezgâh', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium-desktop')
    await harness(page, 'mode=page&ask=sipari%C5%9Fleri%20onayla', 'Kalan süre')
    await shot(page, '390-dark-01-confirm')
    await harness(page, 'mode=page&config=consent-pending-owner', 'Onayınız gerekiyor')
    await shot(page, '390-dark-02-consent')
  })
})
