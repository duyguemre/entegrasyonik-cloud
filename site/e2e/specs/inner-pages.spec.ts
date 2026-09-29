import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { APP_URL, collectProblems, isDesktop, waitForFonts } from '../helpers'

// ADR-0014 S2b — iç sayfalar: smoke + etkileşim + axe (WCAG 2.1 AA) + 3 viewport ekran görüntüsü.
const CODES = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap'] as const
const PAGES = [
  ['entegrasyonlar', '/entegrasyonlar'],
  ...CODES.map((c) => [`entegrasyon ${c}`, `/entegrasyonlar/${c}`] as const),
  ['ozellikler', '/ozellikler'],
  ['guvenlik', '/guvenlik'],
  ['sss', '/sss'],
  ['iletisim', '/iletisim'],
] as const

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function expectNoViolations(page: Page) {
  await waitForFonts(page)
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  expect(results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) }))).toEqual([])
}

test.describe('iç sayfalar — smoke', () => {
  for (const [name, route] of PAGES) {
    test(`${name}: 200, tek h1, konsol/CSP temiz, yatay taşma yok`, async ({ page }) => {
      const problems = collectProblems(page)
      const response = await page.goto(route)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow')
      await expect(page.getByTestId('draft-banner')).toHaveCount(0)
      await waitForFonts(page)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      expect(problems).toEqual([])
    })
  }
})

test.describe('iç sayfalar — axe (WCAG 2.1 AA)', () => {
  for (const [name, route] of PAGES) {
    test(name, async ({ page }) => {
      await page.goto(route)
      await expectNoViolations(page)
    })
  }

  test('sss: tüm cevaplar açıkken', async ({ page }) => {
    await page.goto('/sss')
    for (const d of await page.locator('details.acc__item').all()) await d.locator('summary').click()
    await expectNoViolations(page)
  })
})

test.describe('gezinme', () => {
  test('ana gezinmede iç sayfa bağlantıları görünür ve çalışır', async ({ page }) => {
    await page.goto('/')
    if (!isDesktop(page)) await page.getByTestId('menu-toggle').click()
    const nav = isDesktop(page) ? page.locator('.nav-desktop') : page.locator('.nav-mobile__panel')
    for (const label of ['Özellikler', 'Entegrasyonlar', 'Güvenlik', 'SSS', 'İletişim']) {
      await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible()
    }
    await nav.getByRole('link', { name: 'Entegrasyonlar', exact: true }).click()
    await expect(page).toHaveURL(/\/entegrasyonlar\/?$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Entegrasyonlar' })).toBeVisible()
  })

  test('entegrasyonlar: 6 kart, karttan detay sayfasına, breadcrumb ile geri', async ({ page }) => {
    await page.goto('/entegrasyonlar')
    await expect(page.getByTestId('integration-card')).toHaveCount(6)
    await page.getByRole('link', { name: 'Bizimhesap ayrıntıları' }).click()
    await expect(page).toHaveURL(/\/entegrasyonlar\/bizimhesap\/?$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Bizimhesap entegrasyonu' })).toBeVisible()
    await expect(page.getByTestId('limitations')).toContainText('Yalnızca okuma')
    await expect(page.getByTestId('credential-types')).toBeVisible()
    await page.getByRole('navigation', { name: 'Sayfa yolu' }).getByRole('link', { name: 'Entegrasyonlar' }).click()
    await expect(page).toHaveURL(/\/entegrasyonlar\/?$/)
  })

  test('yol haritası öğesi için detay sayfası yok (404)', async ({ page }) => {
    const response = await page.goto('/entegrasyonlar/amazon')
    expect(response?.status()).toBe(404)
  })

  test('entegrasyonlar: karşılaştırma tablosu odaklanabilir kaydırma bölgesi, başlıklar scope ile', async ({ page }) => {
    await page.goto('/entegrasyonlar')
    const region = page.getByTestId('comparison-table')
    await region.scrollIntoViewIfNeeded()
    await region.focus()
    await expect(region).toBeFocused()
    await expect(region.locator('thead th[scope="col"]')).toHaveCount(7)
    await expect(region.locator('tbody th[scope="row"]').first()).toBeVisible()
  })
})

test.describe('sss — JS\'siz akordeon', () => {
  test('klavye ile açılır/kapanır, açık durumda cevap görünür', async ({ page }) => {
    await page.goto('/sss')
    const first = page.locator('details.acc__item').first()
    const summary = first.locator('summary')
    await summary.focus()
    await expect(first).not.toHaveAttribute('open', '')
    await page.keyboard.press('Enter')
    await expect(first).toHaveAttribute('open', '')
    await expect(first.locator('.acc__body')).toBeVisible()
    await page.keyboard.press('Space')
    await expect(first).not.toHaveAttribute('open', '')
  })

  test('JS kapalıyken de çalışır', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto('/sss')
    const first = page.locator('details.acc__item').first()
    await first.locator('summary').click()
    await expect(first.locator('.acc__body')).toBeVisible()
    await context.close()
  })
})

test.describe('iletisim', () => {
  test('form yok; adres yer tutucusu (mailto yalnızca adres verilince) ve künye yer tutucuları', async ({ page }) => {
    await page.goto('/iletisim')
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.getByTestId('contact-placeholder')).toContainText('{{İLETİŞİM_E_POSTA}}')
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0)
    await expect(page.getByTestId('kunye-details')).toContainText('{{ŞİRKET_UNVANI}}')
    await expect(page.getByRole('link', { name: 'Giriş yap' }).last()).toHaveAttribute('href', `${APP_URL}/login`)
  })
})

test.describe('guvenlik', () => {
  test('güvenlik iddiaları ve kapsam sınırı görünür; sertifika iddiası yok', async ({ page }) => {
    await page.goto('/guvenlik')
    await expect(page.getByTestId('security-claim').first()).toBeVisible()
    await expect(page.getByText('AES-256-GCM').first()).toBeVisible()
    await expect(page.getByText('sertifikasyon veya bağımsız denetim belgesi değildir')).toBeVisible()
    // S5 yasal sayfaları yayımlandı (legalNav published): bekleyen-not yerine gerçek bağlantı.
    await expect(page.getByTestId('kvkk-pending')).toHaveCount(0)
    await expect(page.locator('main a[href="/yasal/kvkk-aydinlatma"]')).toBeVisible()
  })
})

test.describe('iç sayfalar — ekran görüntüleri (3 viewport)', () => {
  for (const [name, route] of [
    ['entegrasyonlar', '/entegrasyonlar'],
    ['entegrasyon-trendyol', '/entegrasyonlar/trendyol'],
    ['entegrasyon-ideasoft', '/entegrasyonlar/ideasoft'],
    ['ozellikler', '/ozellikler'],
    ['guvenlik', '/guvenlik'],
    ['sss', '/sss'],
    ['iletisim', '/iletisim'],
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(route)
      await waitForFonts(page)
      await expect(page).toHaveScreenshot(`inner-${name}.png`, { fullPage: true })
    })
  }
})
