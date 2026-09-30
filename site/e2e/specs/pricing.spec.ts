import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { APP_URL, collectProblems, isDesktop, waitForFonts } from '../helpers'

// ADR-0014 S4b — /fiyatlandirma: 3 viewport'ta smoke + WCAG 2.1 AA (0 ihlal) + CTA sözleşmesi + ekran görüntüsü.
// CTA sözleşmesi (uygulama tarafı: frontend/e2e/specs/register-handoff.spec.ts aynı biçimi tüketir):
//   `${APP_URL}/login?mode=register&plan=<kod>&interval=<month|year>`
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function expectNoViolations(page: Page) {
  await waitForFonts(page)
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const summary = results.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(' ')) }))
  expect(summary).toEqual([])
}

test.describe('Fiyatlandırma', () => {
  test('render: tek h1, 3 plan kartı, taslak notu, noindex, yatay taşma yok', async ({ page }) => {
    const problems = collectProblems(page)
    const response = await page.goto('/fiyatlandirma')
    expect(response?.status()).toBe(200)

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('İşinize uygun planı seçin')
    await expect(page).toHaveTitle(/Fiyatlandırma · Entegrasyonik/)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow')
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /planlarını karşılaştırın/)

    const cards = page.getByTestId('plan-cards').locator('.plan')
    await expect(cards).toHaveCount(3)
    await expect(cards.nth(0)).toContainText('Başlangıç')
    await expect(cards.nth(0)).toContainText('₺2.490')
    await expect(cards.nth(0)).toContainText('KDV hariç')
    await expect(cards.nth(1)).toContainText('Büyüme')
    await expect(cards.nth(1)).toContainText('₺5.990')
    // Kurumsal: sabit fiyat yok
    await expect(cards.nth(2)).toContainText('Kurumsal')
    await expect(cards.nth(2)).toContainText('Özel teklif')
    await expect(cards.nth(2)).toContainText('Özel limit')

    // Taslak/öneri işareti (seed ÖNERİ) görünür
    await expect(page.getByTestId('pricing-notice')).toContainText('ÖNERİ')
    await expect(page.getByTestId('pricing-notice')).toContainText('KDV')

    await waitForFonts(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    expect(problems).toEqual([])
  })

  test('S25 (K46): ajan ürünü her planda — bölüm, kart özeti, karşılaştırma satırları; axe 0', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    const section = page.getByTestId('plan-ai')
    await section.scrollIntoViewIfNeeded()
    await expect(section).toContainText('Kendi yapay zekâ anahtarınızı getirirsiniz; yapay zekâ için bize ekstra ücret ödemezsiniz.')
    await expect(section.locator('.agent-ladder__step')).toHaveCount(3)
    await expect(page.getByTestId('plan-agent')).toHaveCount(3)
    await expect(page.locator('tr[data-row-kind="agent"]')).toHaveCount(5)
    const text = (await page.locator('main').innerText()).toLocaleLowerCase('tr-TR')
    for (const w of ['kredi', 'token', 'sınırsız']) expect(text, w).not.toContain(w)
    await expectNoViolations(page)
  })

  test('deneme ifadesi yalnızca deneme planında (seed trial): süre + kartsız', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    const cards = page.getByTestId('plan-cards').locator('.plan')
    await expect(cards.nth(0)).toContainText('14 gün ücretsiz deneme')
    await expect(cards.nth(0)).toContainText('kart gerekmez')
    await expect(cards.nth(1)).not.toContainText('ücretsiz deneme')
    await expect(cards.nth(2)).not.toContainText('ücretsiz deneme')
  })

  test('yol haritası özellikleri kartlarda görünmez; yalnızca canlı yetenekler', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    const text = (await page.getByTestId('plan-cards').innerText()).toLocaleLowerCase('tr-TR')
    for (const banned of ['e-fatura', 'kargo firması', 'mcp', 'masaüstü', 'yakında', 'amazon']) expect(text, banned).not.toContain(banned)
    await expect(page.getByTestId('plan-cards').getByText('ERP bağlantısı (Bizimhesap, yalnızca okuma)').first()).toBeVisible()
  })

  test('CTA bağlantıları uygulamaya doğru sorguyla gider (mode=register&plan=&interval=)', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    const cards = page.getByTestId('plan-cards').locator('.plan')
    await expect(cards.nth(0).getByTestId('plan-cta')).toHaveAttribute('href', `${APP_URL}/login?mode=register&plan=starter&interval=month`)
    await expect(cards.nth(1).getByTestId('plan-cta')).toHaveAttribute('href', `${APP_URL}/login?mode=register&plan=growth&interval=month`)
    await expect(cards.nth(0).getByTestId('plan-cta')).toHaveText('Ücretsiz dene')
    await expect(cards.nth(1).getByTestId('plan-cta')).toHaveText('Planı seç')
    // Kurumsal: kayıt bağlantısı ÜRETİLMEZ (özel teklif)
    const links = await page.locator(`main a[href^="${APP_URL}/login"]`).evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href))
    expect(links.some((h) => h.includes('plan=enterprise'))).toBe(false)
    // Kapanış CTA'sı deneme planıyla; giriş bağlantısı düz /login
    expect(links).toContain(`${APP_URL}/login?mode=register&plan=starter&interval=month`)
    expect(links).toContain(`${APP_URL}/login`)
  })

  test('kurumsal CTA: /iletisim yayımlıysa teklif bağlantısı, değilse kırık link yerine not', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    const enterprise = page.getByTestId('plan-cards').locator('.plan').nth(2)
    const contactPublished = (await page.locator('header a[href="/iletisim"]').count()) > 0
    if (contactPublished) {
      await expect(enterprise.getByTestId('plan-cta')).toHaveAttribute('href', '/iletisim')
    } else {
      await expect(enterprise.getByTestId('plan-cta')).toHaveCount(0)
      await expect(enterprise).toContainText('iletişim bilgileri hazırlanıyor')
    }
  })

  test('karşılaştırma tablosu: başlıklar, satırlar ve klavye ile kaydırılabilir bölge', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    const table = page.getByTestId('compare-table')
    await expect(table.getByRole('columnheader')).toHaveText(['Plan', 'Başlangıç', 'Büyüme', 'Kurumsal'])
    // S17: fiyat/limit satırları önce ve aynen; ardından özellik satırları (deneme + her planda + plan eklentileri)
    await expect(table.locator('tbody tr[data-row-kind="limit"] th')).toHaveText(['Aylık fiyat', 'Kanal', 'Ürün varyantı (SKU)', 'Kullanıcı'])
    const heads = await table.getByRole('rowheader').allInnerTexts()
    expect(heads.slice(0, 4)).toEqual(['Aylık fiyat', 'Kanal', 'Ürün varyantı (SKU)', 'Kullanıcı'])
    await expect(table.locator('tbody tr[data-row-kind="feature"]').filter({ hasText: 'ERP bağlantısı (Bizimhesap, yalnızca okuma)' })).toHaveCount(1)
    await expect(table.locator('tbody tr[data-row-kind="feature"]').filter({ hasText: 'Ücretsiz deneme' })).toContainText('14 gün')
    await expect(table.getByRole('row').nth(2)).toContainText('Özel limit')
    const region = page.getByRole('region', { name: 'Plan karşılaştırma tablosu' })
    await region.focus()
    await expect(region).toBeFocused()
  })

  test('SSS: yerel <details> açılır/kapanır, klavye ile çalışır; deneme yanıtı kartsız der', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    const first = page.getByTestId('pricing-faq').locator('details').first()
    await expect(first).not.toHaveAttribute('open', '')
    await first.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(first).toHaveAttribute('open', '')
    await expect(first).toContainText('Kayıt sırasında kart bilgisi istenmez')
    await page.keyboard.press('Enter')
    await expect(first).not.toHaveAttribute('open', '')
  })

  test('üst gezinmede "Fiyatlandırma" yayımlanmış ve çalışır', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    if (isDesktop(page)) {
      await expect(page.getByRole('navigation', { name: 'Ana gezinme' }).first().getByRole('link', { name: 'Fiyatlar', exact: true })).toBeVisible()
    } else {
      await page.getByTestId('menu-toggle').click()
      await expect(page.locator('.nav-mobile__panel').getByRole('link', { name: 'Fiyatlar', exact: true })).toBeVisible()
    }
  })

  test('axe WCAG 2.1 AA: 0 ihlal', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    await expectNoViolations(page)
  })

  test('axe: SSS açıkken 0 ihlal', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    await page.getByTestId('pricing-faq').locator('summary').first().click()
    await expectNoViolations(page)
  })

  test('ekran görüntüsü tabanı (fiyatlandırma)', async ({ page }) => {
    await page.goto('/fiyatlandirma')
    await waitForFonts(page)
    await expect(page).toHaveScreenshot('pricing.png', { fullPage: true })
  })
})
