import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { APP_URL, collectProblems, isDesktop, waitForFonts } from '../helpers'
import { company } from '../../src/data/company'

// ADR-0014 S2b — iç sayfalar: smoke + etkileşim + axe (WCAG 2.1 AA) + 3 viewport ekran görüntüsü.
const CODES = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap'] as const
const PAGES = [
  ['entegrasyonlar', '/entegrasyonlar'],
  ...CODES.map((c) => [`entegrasyon ${c}`, `/entegrasyonlar/${c}`] as const),
  ['ozellikler', '/ozellikler'],
  ['guvenlik', '/guvenlik'],
  ['sss', '/sss'],
  ['iletisim', '/iletisim'],
  ['stok-rezervasyonu', '/ozellikler/stok-rezervasyonu'],
  ['destek', '/destek'],
  ['asistan', '/asistan'], // S18
] as const

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function expectNoViolations(page: Page) {
  await waitForFonts(page)
  // S18: /asistan döngüsel sohbet sahnesi taşır — axe statik son kare üzerinde çalışsın (a11y.spec.ts ile aynı desen).
  await page.evaluate(() => document.getAnimations().forEach((a) => a instanceof CSSAnimation && a.cancel()))
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

  test('entegrasyonlar: kategori süzgeci (aria-pressed) kartları süzer, klavyeyle çalışır ve sonucu duyurur', async ({ page }) => {
    await page.goto('/entegrasyonlar')
    const filter = page.getByTestId('integration-filter')
    const cards = page.getByTestId('integration-card')
    await expect(filter.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed', 'true')
    await filter.locator('[data-filter="erp"]').click()
    await expect(filter.locator('[data-filter="erp"]')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('#int-grid > li:not([hidden])')).toHaveCount(1)
    await expect(cards.filter({ visible: true })).toHaveCount(1)
    await expect(page.locator('[data-int-filter-status]')).toContainText('entegrasyon gösteriliyor')
    const all = filter.locator('[data-filter="all"]')
    await all.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#int-grid > li:not([hidden])')).toHaveCount(6)
    for (const s of await page.getByTestId('integration-status').all()) await expect(s).toHaveText('Kullanılabilir')
  })

  test('yol haritası öğesi için detay sayfası yok (404)', async ({ page }) => {
    const response = await page.goto('/entegrasyonlar/amazon')
    expect(response?.status()).toBe(404)
  })

  test('entegrasyonlar: kanal bazında kapsam — odaklanabilir bölge, başlıklar scope ile (>=768px); mobilde kompakt kart', async ({ page }) => {
    await page.goto('/entegrasyonlar#kapsam')
    const width = page.viewportSize()?.width ?? 0
    const region = page.getByTestId('coverage-matrix')
    if (width < 768) {
      await expect(region).toBeHidden()
      await expect(page.locator('.cm__card')).toHaveCount(6)
      return
    }
    await region.scrollIntoViewIfNeeded()
    await region.focus()
    await expect(region).toBeFocused()
    await expect(region.locator('thead th[scope="col"]')).toHaveCount(9)
    await expect(region.locator('tbody th[scope="row"]')).toHaveCount(6)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('entegrasyonlar: yapışkan kapsam başlığı site header\'ının ALTINDA durur, satırları örtmez (masaüstü)', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1024, 'yapışkan başlık yalnızca >=1024px')
    await page.goto('/entegrasyonlar')
    const row = page.locator('.cm__row').nth(3)
    const top = await row.evaluate((e) => e.getBoundingClientRect().top + window.scrollY)
    await page.evaluate((y) => window.scrollTo(0, y - 200), top)
    await page.waitForTimeout(100)
    const header = await page.locator('.site-header').boundingBox()
    const head = await page.locator('.cm__table thead th').first().boundingBox()
    const rowBox = await row.boundingBox()
    // başlık satırı sayfaya yapıştı: header'ın hemen altında (üst üste binmez)
    expect(Math.abs(head!.y - (header!.y + header!.height))).toBeLessThanOrEqual(2)
    // ve kaydırılan satırı örtmez
    expect(head!.y + head!.height).toBeLessThanOrEqual(rowBox!.y + 1)
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

test.describe('S14 — destek merkezi ve bağlantı rehberi', () => {
  test('destek: soru bağlantısı SSS\'te hedef soruyu açar', async ({ page }) => {
    await page.goto('/destek')
    await expect(page.getByTestId('support-category')).toHaveCount(5)
    await page.locator('#stok-siparis').getByRole('link', { name: /Overselling/ }).click()
    await expect(page).toHaveURL(/\/sss\/?#asiri-satis$/)
    await expect(page.locator('details#asiri-satis')).toHaveAttribute('open', '')
    await expect(page.locator('details#asiri-satis .acc__body')).toBeVisible()
  })

  test('destek: kanal rehberi bağlantısı detay sayfasının rehber bölümüne gider', async ({ page }) => {
    await page.goto('/destek')
    await page.getByTestId('support-channel-guides').getByRole('link', { name: 'Pazarama rehberi' }).click()
    await expect(page).toHaveURL(/\/entegrasyonlar\/pazarama\/?#baglanti-rehberi$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Pazarama nasıl bağlanır?' })).toBeInViewport()
    await expect(page.getByTestId('connect-steps').locator('li')).toHaveCount(5)
  })

  test('stok rezervasyonu: reduced-motion altında sahne statik ve tam görünür', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' })
    const page = await context.newPage()
    await page.goto('/ozellikler/stok-rezervasyonu')
    const scene = page.locator('[data-scene="stock-flow"]')
    await scene.scrollIntoViewIfNeeded()
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
    for (const part of ['order-a', 'hub', 'result-ok', 'result-oversold', 'publish']) {
      await expect(scene.locator(`[data-part="${part}"]`)).toHaveCSS('opacity', '1')
    }
    const running = await scene.evaluate((el) => el.getAnimations({ subtree: true }).length)
    expect(running).toBe(0)
    await context.close()
  })
})

test.describe('iletisim', () => {
  const EMAIL = 'bilgi@entegrasyonik.com.tr'

  test('form yok; "Bize yazın" konu düğmeleri görünür ve doğru mailto; künye yer tutucuları (adres gizli)', async ({ page }) => {
    await page.goto('/iletisim')
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.getByTestId('contact-placeholder')).toHaveCount(0)
    const topics = page.getByTestId('contact-mailto')
    await expect(topics).toHaveCount(4)
    for (const t of await topics.all()) {
      await expect(t).toBeVisible()
      await expect(t).toHaveAttribute('href', new RegExp(`^mailto:${EMAIL.replace(/\./g, '\\.')}\\?subject=.+`))
    }
    await expect(topics.first()).toHaveAttribute('href', `mailto:${EMAIL}?subject=Kurumsal%20teklif%20talebi`)
    await expect(page.getByTestId('contact-send').first()).toBeVisible()
    await expect(page.getByTestId('contact-send').first()).toHaveAttribute('href', /^mailto:bilgi@entegrasyonik\.com\.tr/)
    await expect(page.getByTestId('kunye-details')).toContainText(company.legalName)
    await expect(page.getByTestId('kunye-details')).not.toContainText('{{ŞİRKET_UNVANI}}')
    await expect(page.getByTestId('kunye-details')).toContainText(EMAIL)
    await expect(page.getByTestId('kunye-details')).not.toContainText('{{ADRES}}')
    await expect(page.getByRole('link', { name: 'Giriş yap' }).last()).toHaveAttribute('href', `${APP_URL}/login`)
  })

  test('"Adresi kopyala": panoya yazar ve aria-live ile duyurur', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/iletisim')
    const copy = page.getByTestId('contact-copy').first()
    await expect(copy).toBeVisible()
    await copy.click()
    await expect(copy).toHaveAttribute('data-state', 'copied')
    await expect(copy).toContainText('Kopyalandı')
    const status = page.getByTestId('contact-copy-status').first()
    await expect(status).toHaveAttribute('aria-live', 'polite')
    await expect(status).toContainText('panoya kopyalandı')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(EMAIL)
  })

  test('"Adresi kopyala" klavyeyle de çalışır (odak halkası + Enter)', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto('/iletisim')
    const copy = page.getByTestId('contact-copy').first()
    await copy.focus()
    await expect(copy).toBeFocused()
    const outline = await copy.evaluate((el) => getComputedStyle(el).outlineStyle)
    expect(outline).not.toBe('none')
    await page.keyboard.press('Enter')
    await expect(copy).toHaveAttribute('data-state', 'copied')
  })
})

test.describe('guvenlik', () => {
  test('güvenlik iddiaları ve kapsam sınırı görünür; sertifika iddiası yok', async ({ page }) => {
    await page.goto('/guvenlik')
    // S16: ilkeler yönetici düzeyinde; teknik kayıtlar JS'siz <details> "Ayrıntı" içinde (klavyeyle açılır)
    await expect(page.locator('[data-principle]')).toHaveCount(6)
    await expect(page.getByTestId('security-claim').first()).toBeHidden()
    const summary = page.locator('[data-principle="izolasyon"] summary')
    await summary.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('security-claim').first()).toBeVisible()
    await expect(page.getByText('AES-256-GCM').first()).toBeVisible()
    await expect(page.getByText('sertifikasyon veya bağımsız denetim belgesi değildir')).toBeVisible()
    // S5 yasal sayfaları yayımlandı (legalNav published): bekleyen-not yerine gerçek bağlantı.
    await expect(page.getByTestId('kvkk-pending')).toHaveCount(0)
    await expect(page.locator('main a[href="/yasal/kvkk-aydinlatma"]').first()).toBeVisible()
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
    ['stok-rezervasyonu', '/ozellikler/stok-rezervasyonu'],
    ['destek', '/destek'],
    ['asistan', '/asistan'], // S18
  ] as const) {
    test(name, async ({ page }) => {
      await page.goto(route)
      await waitForFonts(page)
      await expect(page).toHaveScreenshot(`inner-${name}.png`, { fullPage: true })
    })
  }
})

// S18 — /asistan: örnek senaryo sahnesi (döngüsel). Hareket azaltılmışken statik SON KARE: tüm diyalog ve onay kartı
// görünür, "yazıyor" göstergesi gizli. Hareket açıkken kontrol header'da; kullanıcı durdurabilir (WCAG 2.2.2).
test.describe('asistan — sohbet sahnesi', () => {
  test('reduced-motion: statik son kare (soru, sonuç, ikinci istek, onay kartı görünür; yazıyor gizli)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/asistan')
    const scene = page.getByTestId('assistant-scene')
    await expect(scene.getByTestId('scenario-label')).toHaveText('Örnek senaryo')
    for (const part of ['ai-ask1', 'ai-result', 'ai-ask2', 'ai-approve']) {
      await expect(scene.locator(`[data-part="${part}"]`)).toHaveCSS('opacity', '1')
    }
    await expect(scene.locator('[data-part="ai-typing1"]')).toHaveCSS('opacity', '0')
    await expect(page.getByTestId('motion-toggle')).toBeHidden()
  })

  test('hareket açık: durdurma kontrolü görünür; durdurunca sahne statik son kareye döner', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/asistan')
    const toggle = page.getByTestId('motion-toggle')
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('assistant-scene').locator('[data-part="ai-approve"]')).toHaveCSS('opacity', '1')
  })

  test('axe (hareket azaltılmış, SSS açık)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/asistan')
    for (const d of await page.locator('details.acc__item').all()) await d.locator('summary').click()
    await expectNoViolations(page)
  })
})
