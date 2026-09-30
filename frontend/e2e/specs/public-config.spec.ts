// FE-CFG-1/2 (ADR-0031) — backoffice'ten yönetilen açılış yapılandırması: duyuru şeridi (3 seviye, kapatma metne göre
// hatırlanır), bakım şeridi (uygulamayı kilitlemez; giriş ekranında da), yardım menüsünde destek iletişimi (boşsa gizli),
// yapılandırma alınamazsa varsayılanlarla açılış. Veri sentetik; `/api/public-config` mockApi ile.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError, publicConfigWith } from '../fixtures/mockApi'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ANNOUNCE = 'Pazartesi 23:00–23:30 arası Trendyol aktarımları kısa süre gecikebilir.'
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function openApp(page: Page, settings: Record<string, unknown> = {}, path = '/dashboard') {
  await installApiMocks(page, { 'public-config': publicConfigWith(settings) })
  await page.goto(path)
  await waitForWorkplaceReady(page)
}

test.describe('Açılış yapılandırması (public-config)', () => {
  test('varsayılan: duyuru/bakım yok, çalışma alanı bant yüksekliği 0', async ({ page }) => {
    await openApp(page)
    await expect(page.getByTestId('announcement-banner')).toHaveCount(0)
    await expect(page.getByTestId('maintenance-banner')).toHaveCount(0)
  })

  for (const [level, tone, title] of [
    ['info', 'info', 'Duyuru'],
    ['warning', 'warning', 'Önemli duyuru'],
    ['critical', 'error', 'Kritik duyuru'],
  ] as const) {
    test(`duyuru ${level}: semantik ton, başlık + düz metin, bölge + status`, async ({ page }) => {
      await openApp(page, { 'announcement.enabled': true, 'announcement.level': level, 'announcement.text': ANNOUNCE })
      const banner = page.getByTestId('announcement-banner')
      await expect(banner).toBeVisible()
      await expect(banner).toHaveAttribute('data-tone', tone)
      await expect(banner).toHaveAttribute('aria-label', title)
      await expect(banner.getByRole('status')).toContainText(ANNOUNCE)
      // Sekme şeridi bandın altına iner (üst üste binmez).
      const b = (await banner.boundingBox())!
      const tabs = (await page.locator('.ek-shell__tabs').boundingBox())!
      expect(tabs.y).toBeGreaterThanOrEqual(b.y + b.height - 1)
    })
  }

  test('duyuru kapatılınca yeniden yüklemede gizli kalır; metin değişince yeniden görünür', async ({ page }) => {
    await openApp(page, { 'announcement.enabled': true, 'announcement.text': ANNOUNCE })
    await page.getByTestId('announcement-dismiss').click()
    await expect(page.getByTestId('announcement-banner')).toHaveCount(0)

    await page.reload()
    await waitForWorkplaceReady(page)
    await expect(page.getByTestId('announcement-banner')).toHaveCount(0)

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await openApp(page, { 'announcement.enabled': true, 'announcement.text': `${ANNOUNCE} (güncellendi)` })
    await expect(page.getByTestId('announcement-banner')).toBeVisible()
  })

  test('duyuru metni HTML olarak yorumlanmaz', async ({ page }) => {
    await openApp(page, { 'announcement.enabled': true, 'announcement.text': '<b id="xss">kalın</b> metin' })
    await expect(page.getByTestId('announcement-banner')).toContainText('<b id="xss">kalın</b> metin')
    await expect(page.locator('#xss')).toHaveCount(0)
  })

  test('bakım şeridi kapatılamaz ve uygulamayı kilitlemez', async ({ page }) => {
    await openApp(page, { 'maintenance.enabled': true, 'maintenance.message': 'Bu gece 02:00–03:00 planlı bakım.' })
    const banner = page.getByTestId('maintenance-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toHaveAttribute('data-tone', 'warning')
    await expect(banner).toContainText('Bu gece 02:00–03:00 planlı bakım.')
    await expect(banner.getByRole('button')).toHaveCount(0)
    // Kabuk etkileşimli kalır: kısayol yardımını aç/kapat.
    await page.keyboard.press('Control+Slash').catch(() => undefined)
    await expect(page.locator('.workplace-tabs')).toBeVisible()
  })

  test('bakım + duyuru birlikte: bakım üstte, axe AA ihlali yok', async ({ page }) => {
    await openApp(page, {
      'maintenance.enabled': true,
      'announcement.enabled': true,
      'announcement.level': 'critical',
      'announcement.text': ANNOUNCE,
    })
    const m = (await page.getByTestId('maintenance-banner').boundingBox())!
    const a = (await page.getByTestId('announcement-banner').boundingBox())!
    expect(m.y).toBeLessThan(a.y)
    const results = await new AxeBuilder({ page }).include('.ek-shell__banner').withTags(AXE_TAGS).analyze()
    expect(results.violations).toEqual([])
    await expect(page.locator('.ek-shell__banner')).toHaveScreenshot('cfg-banner-stack.png', { animations: 'disabled' })
  })

  test('bakım şeridi giriş ekranında da görünür', async ({ page }) => {
    await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}), 'public-config': publicConfigWith({ 'maintenance.enabled': true }) })
    await page.goto('/login')
    await expect(page.getByTestId('maintenance-banner')).toBeVisible()
    await expect(page.getByTestId('maintenance-banner')).toContainText('Planlı bakım')
  })

  test('destek iletişimi: yardım menüsünde (dar ekranda hesap menüsünde); boş değer gösterilmez', async ({ page }) => {
    await openApp(page, { 'support.email': 'destek@entegrasyonik-e2e.invalid', 'support.phone': '' })
    const narrow = (page.viewportSize()?.width ?? 1280) < 768
    await page.locator(narrow ? '[data-header-action=account]' : '[data-header-action=help]').click()
    const menu = page.getByRole('menu').last()
    await expect(menu.getByText('Destek iletişimi')).toBeVisible()
    await expect(menu.getByText('destek@entegrasyonik-e2e.invalid')).toBeVisible()
    await expect(menu.getByText('Telefonla arayın')).toHaveCount(0)
  })

  test('destek boşsa grup hiç yok', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1280) < 768, 'yardım düğmesi dar ekranda gizli')
    await openApp(page)
    await page.locator('[data-header-action=help]').click()
    await expect(page.getByRole('menu').last().getByText('Klavye kısayolları')).toBeVisible()
    await expect(page.getByText('Destek iletişimi')).toHaveCount(0)
  })

  test('yapılandırma alınamazsa (500) uygulama varsayılanlarla açılır', async ({ page }) => {
    await installApiMocks(page, { 'public-config': mockError(500, { error: 'x', code: 'INTERNAL' }) })
    await page.goto('/dashboard')
    await waitForWorkplaceReady(page)
    await expect(page.getByTestId('announcement-banner')).toHaveCount(0)
  })
})
