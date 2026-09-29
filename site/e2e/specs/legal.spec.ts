import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { collectProblems, isDesktop, waitForFonts } from '../helpers'

// ADR-0014 S5 — 8 yasal taslak sayfa: 3 viewport'ta smoke + WCAG 2.1 AA (0 ihlal) + yazdırma + ekran görüntüsü.
const PAGES = [
  ['kvkk-aydinlatma', 'KVKK Aydınlatma Metni'],
  ['gizlilik', 'Gizlilik Politikası'],
  ['cerez', 'Çerez Politikası'],
  ['kullanim-kosullari', 'Kullanım Koşulları'],
  ['abonelik-sozlesmesi', 'Abonelik Sözleşmesi'],
  ['on-bilgilendirme', 'Ön Bilgilendirme Formu'],
  ['iptal-iade', 'İptal ve İade Koşulları'],
  ['kunye', 'Künye'],
] as const

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function expectNoViolations(page: Page) {
  await waitForFonts(page)
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const summary = results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) }))
  expect(summary).toEqual([])
}

test.describe('Yasal sayfalar', () => {
  for (const [slug, title] of PAGES) {
    test(`${slug}: render, TASLAK bandı, alan listesi, yatay taşma yok`, async ({ page }) => {
      const problems = collectProblems(page)
      const response = await page.goto(`/yasal/${slug}`)
      expect(response?.status()).toBe(200)
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
      await expect(page.getByTestId('legal-draft-banner')).toContainText('TASLAK — hukuki inceleme bekliyor (Protokol 12)')
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow')
      await expect(page.getByTestId('legal-fields')).toContainText('Doldurulması gereken alanlar')
      await expect(page.getByTestId('legal-version')).toContainText('taslak')
      await waitForFonts(page)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      expect(problems).toEqual([])
    })

    test(`${slug}: axe WCAG 2.1 AA`, async ({ page }) => {
      await page.goto(`/yasal/${slug}`)
      await expectNoViolations(page)
    })
  }

  test('içindekiler bağlantısı ilgili bölüme götürür', async ({ page }) => {
    await page.goto('/yasal/kvkk-aydinlatma')
    await page.getByTestId('legal-toc').getByRole('link', { name: /Veri sorumlusu kimdir/ }).click()
    await expect(page).toHaveURL(/#veri-sorumlusu$/)
    await expect(page.locator('#veri-sorumlusu-title')).toBeInViewport()
  })

  test('geniş tablo klavye ile kaydırılabilir bölgedir (odaklanabilir, adlandırılmış)', async ({ page }) => {
    await page.goto('/yasal/kvkk-aydinlatma')
    const region = page.getByRole('region', { name: /Kişisel veri kategorileri/ })
    await region.focus()
    await expect(region).toBeFocused()
  })

  test('yazdırma: üst/alt bilgi ve içindekiler gizlenir, belge ve alan listesi kalır', async ({ page }) => {
    await page.goto('/yasal/abonelik-sozlesmesi')
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('.site-header')).toBeHidden()
    await expect(page.locator('.site-footer')).toBeHidden()
    await expect(page.getByTestId('legal-toc')).toBeHidden()
    await expect(page.getByTestId('legal-draft-banner')).toBeVisible()
    await expect(page.getByTestId('legal-fields')).toBeVisible()
  })

  test('altbilgide 8 yasal bağlantı var ve çalışır', async ({ page }) => {
    await page.goto('/yasal/kunye')
    const legal = page.getByRole('navigation', { name: 'Yasal', exact: true })
    await expect(legal.getByRole('link')).toHaveCount(8)
    await legal.getByRole('link', { name: 'Çerez Politikası' }).click()
    await expect(page).toHaveURL(/\/yasal\/cerez$/)
  })

  test('çerezsiz site beyanı: sayfa yüklenince hiç çerez ve depolama yazılmaz', async ({ page, context }) => {
    await page.goto('/yasal/cerez')
    await waitForFonts(page)
    expect(await context.cookies()).toEqual([])
    const storage = await page.evaluate(() => ({ local: window.localStorage.length, session: window.sessionStorage.length }))
    expect(storage).toEqual({ local: 0, session: 0 })
  })

  test('ekran görüntüsü: KVKK Aydınlatma Metni (üst bölüm)', async ({ page }) => {
    await page.goto('/yasal/kvkk-aydinlatma')
    await waitForFonts(page)
    await expect(page).toHaveScreenshot('legal-kvkk.png', { fullPage: false })
  })

  test('mobilde içindekiler metinden önce gelir, masaüstünde yan sütundadır', async ({ page }) => {
    await page.goto('/yasal/gizlilik')
    const toc = await page.getByTestId('legal-toc').boundingBox()
    const body = await page.getByTestId('legal-body').boundingBox()
    expect(toc && body).toBeTruthy()
    if (isDesktop(page)) {
      expect(toc!.x + toc!.width).toBeLessThanOrEqual(body!.x)
    } else {
      expect(toc!.y + toc!.height).toBeLessThanOrEqual(body!.y)
    }
  })
})
