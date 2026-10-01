// FE-CFG-2 (ADR-0031) — backoffice'ten yönetilen açılış yapılandırması: duyuru ve bakım şeritleri, yardım menüsünde ve
// giriş ekranında destek iletişimi. `GET /api/public-config` sahte fikstürle verilir (bulutta arka yüz yok).
// Kabul: (a) değerler boşsa hiçbir öğe render edilmez, (b) metin düz metin, (c) axe AA temiz.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed } from '../fixtures/nav'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const NO_SESSION = { checkAuthentication: false, userContext: mockError(401, {}) }

export function publicConfigFixture(settings: Record<string, unknown> = {}) {
  return {
    version: 7,
    env: { images: { productBaseUrl: 'https://cdn.example.test/products/', uploadMaxBytes: 10485760 } },
    settings: {
      'support.email': '',
      'support.phone': '',
      'announcement.enabled': false,
      'announcement.level': 'info',
      'announcement.text': '',
      'maintenance.enabled': false,
      'maintenance.message': '',
      'ui.listPageSize': 25,
      'ui.reportPollMs': 5000,
      ...settings,
    },
  }
}

const FULL = publicConfigFixture({
  'support.email': 'destek@example.test',
  'support.phone': '+90 212 000 00 00',
  'announcement.enabled': true,
  'announcement.level': 'warning',
  'announcement.text': 'Trendyol sipariş aktarımında gecikme var; ekibimiz çalışıyor. <b>kalın değil</b>',
  'maintenance.enabled': true,
  'maintenance.message': 'Pazar 02:00–03:00 arası planlı bakım.',
})

async function axeClean(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()
  expect(r.violations, JSON.stringify(r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })), null, 2)).toEqual([])
}

test.describe('FE-CFG-2 — şeritler ve destek iletişimi', () => {
  test('varsayılan (boş) yapılandırma: şerit yok, giriş ekranında destek satırı yok', async ({ page }) => {
    await installApiMocks(page, { ...NO_SESSION, 'public-config': publicConfigFixture() })
    await page.goto('/login')
    await expect(page.getByTestId('site-link')).toBeVisible()
    await expect(page.getByTestId('login-support')).toHaveCount(0)
    await expect(page.getByTestId('maintenance-banner')).toHaveCount(0)
  })

  test('giriş ekranı: bakım şeridi + destek e-postası/telefonu (mailto/tel), axe temiz', async ({ page }) => {
    await installApiMocks(page, { ...NO_SESSION, 'public-config': FULL })
    await page.goto('/login')
    await expect(page.getByTestId('maintenance-banner')).toContainText('Pazar 02:00–03:00 arası planlı bakım.')
    await expect(page.getByTestId('announcement-banner')).toHaveCount(0) // duyuru yalnız oturumlu kabukta
    const support = page.getByRole('navigation', { name: 'Destek iletişimi' })
    await expect(support.getByRole('link', { name: 'Destek e-postası: destek@example.test' })).toHaveAttribute('href', 'mailto:destek@example.test')
    await expect(support.getByRole('link', { name: 'Destek telefonu: +90 212 000 00 00' })).toHaveAttribute('href', 'tel:+902120000000')
    await page.evaluate(() => document.fonts.ready)
    await axeClean(page)
  })

  test('yalnız e-posta doluysa telefon öğesi render edilmez', async ({ page }) => {
    await installApiMocks(page, { ...NO_SESSION, 'public-config': publicConfigFixture({ 'support.email': 'destek@example.test' }) })
    await page.goto('/login')
    await expect(page.getByTestId('support-email')).toBeVisible()
    await expect(page.getByTestId('support-phone')).toHaveCount(0)
  })

  test('oturumlu kabuk: bakım → duyuru sırası, düz metin, duyuru kapatılır; yardım menüsünde destek grubu', async ({ page }, info) => {
    // < 768 px'te yardım düğmesi gizli; destek grubu hesap menüsündedir (birim testi: tests/fe-cfg-rest.test.ts).
    test.skip(info.project.name === 'chromium-mobile', 'yardım düğmesi telefonda gizli')
    await installApiMocks(page, { 'public-config': FULL })
    await gotoAuthed(page)
    const maintenance = page.getByTestId('maintenance-banner')
    const announcement = page.getByTestId('announcement-banner')
    await expect(maintenance).toBeVisible()
    await expect(announcement).toHaveAttribute('data-tone', 'warning')
    // Düz metin: etiket metin olarak görünür, <b> öğesi oluşmaz.
    await expect(announcement.locator('b')).toHaveCount(0)
    await expect(announcement.getByRole('status')).toContainText('Trendyol sipariş aktarımında gecikme var')
    const mBox = await maintenance.boundingBox()
    const aBox = await announcement.boundingBox()
    expect(mBox && aBox && mBox.y < aBox.y).toBeTruthy()
    await expect(maintenance.getByRole('button', { name: 'Duyuruyu kapat' })).toHaveCount(0)

    await page.locator('[data-header-action=help]').first().click()
    await expect(page.getByText('Destek iletişimi')).toBeVisible()
    await expect(page.getByText('destek@example.test')).toBeVisible()
    await expect(page.getByText('+90 212 000 00 00')).toBeVisible()
    await page.keyboard.press('Escape')

    await announcement.getByRole('button', { name: 'Duyuruyu kapat' }).click()
    await expect(announcement).toHaveCount(0)
    await expect(maintenance).toBeVisible()
  })
})
