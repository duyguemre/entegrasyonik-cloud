// ADR-0014 S4b — Tanıtım sitesi -> giriş/kayıt -> abonelik -> (mock) checkout uçtan uca senaryosu (frontend tarafı).
// Tüm `/api/**` mock'lu, GERÇEK backend YOK. Site tarafının CTA URL'si `site/e2e/specs/pricing.spec.ts`'te aynı
// sözleşmeyle (`/login?mode=register&plan=<kod>&interval=<aralık>`) doğrulanır. Gerçek mock checkout SAYFASI backend'dedir
// (S4a `MockCheckoutApiManager`); burada yalnızca frontend'in davranışı (yönlendirme, plan önerisi, sonuç durumları) mock'lanır.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { buildSubscription, plansDoluFixture, startCheckoutSuccessFixture, userContextFixture } from '../fixtures/apiData'

const SCREEN_READY = { timeout: 20_000 }
/** Sitenin `/fiyatlandirma` CTA'sının ürettiği bağlantı biçimi (site/src/lib/site-config.ts `createAppUrls().register`). */
const CTA = (plan: string, interval = 'month') => `/login?mode=register&plan=${plan}&interval=${interval}`

const trialingStarter = buildSubscription({
  subscription: { planCode: 'starter', planVersion: 1, status: 'trialing', trialEndsAt: '2026-10-12T00:00:00.000Z', cancelAtPeriodEnd: false, billingExempt: false },
  plan: { code: 'starter', name: 'Başlangıç', priceMinor: 249000, currency: 'TRY', interval: 'month', vatIncluded: false },
  status: 'trialing',
})
const activeGrowth = buildSubscription()

const statusTitle = (page: Page) => page.locator('.status-banner-title')
const consent = (page: Page) => page.getByRole('checkbox', { name: /okudum, kabul ediyorum/ })

async function fillRegisterForm(page: Page) {
  await page.getByLabel('İsim').fill('Deneme')
  await page.getByLabel('Soyisim').fill('Kullanici')
  await page.getByLabel('E-posta').last().fill('yeni@example.invalid')
  await page.getByLabel('Parola', { exact: true }).last().fill('e2e-pass-1234')
  await page.getByLabel('Parola (Tekrar)').fill('e2e-pass-1234')
}

/** Oturumsuz başlar; `SecurityService/register` çağrısı oturumu açar (çerez davranışının mock karşılığı). */
function statefulMocks(opts: { registerBodies?: any[]; checkout?: 'success' | 'declined' | 'forbidden'; checkoutBodies?: any[] } = {}) {
  let authenticated = false
  let subscription: any = trialingStarter
  const json = (route: any, headers: any, status: number, body: any) =>
    route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })
  return {
    checkAuthentication: async (route: any, headers: any) => json(route, headers, 200, authenticated),
    userContext: async (route: any, headers: any) => (authenticated ? json(route, headers, 200, userContextFixture) : json(route, headers, 401, {})),
    'SecurityService/register': async (route: any, headers: any) => {
      opts.registerBodies?.push(route.request().postDataJSON())
      authenticated = true
      return json(route, headers, 200, userContextFixture)
    },
    'BillingService/getPlans': plansDoluFixture,
    'BillingService/getMySubscription': async (route: any, headers: any) => json(route, headers, 200, subscription),
    'BillingService/startCheckout': async (route: any, headers: any) => {
      opts.checkoutBodies?.push(route.request().postDataJSON())
      if (opts.checkout === 'forbidden') return json(route, headers, 403, { error: 'Forbidden' })
      // Mock sağlayıcı webhook'unun etkisi: başarılı ödeme -> active; reddedilen ödeme trialing aboneliği ETKİLEMEZ (ADR-0008 S4a).
      if (opts.checkout === 'success') subscription = activeGrowth
      return json(route, headers, 200, startCheckoutSuccessFixture)
    },
  }
}

test.describe('ADR-0014 S4b — site -> kayıt devri', () => {
  test('site CTA bağlantısı kayıt sekmesini açar ve seçili planı bilgi bandında gösterir', async ({ page }) => {
    await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
    await page.goto(CTA('growth'))

    await expect(page.getByRole('tab', { name: 'Kayıt' })).toHaveAttribute('aria-selected', 'true')
    const band = page.getByTestId('register-plan-band')
    await expect(band).toBeVisible()
    await expect(band).toContainText('Seçtiğiniz plan: Büyüme')
    await expect(page.getByLabel('Parola (Tekrar)')).toBeVisible()
  })

  test('mode=register plansız: kayıt sekmesi açılır, bilgi bandı yok', async ({ page }) => {
    await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
    await page.goto('/login?mode=register')
    await expect(page.getByRole('tab', { name: 'Kayıt' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('register-plan-band')).toHaveCount(0)
  })

  test('mode yok: giriş sekmesi açık kalır (mevcut davranış), plan tek başına sekmeyi değiştirmez', async ({ page }) => {
    await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
    await page.goto('/login?plan=starter')
    await expect(page.getByRole('tab', { name: 'Giriş' })).toHaveAttribute('aria-selected', 'true')
  })

  for (const bad of ['enterprise', 'STARTER', '%3Cscript%3Ealert(1)%3C%2Fscript%3E', 'javascript%3Aalert(1)', '%2F%2Fevil.com', 'x'.repeat(40)]) {
    test(`geçersiz plan "${bad.slice(0, 24)}" sessizce yok sayılır (enjeksiyon/kurumsal yok)`, async ({ page }) => {
      await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
      await page.goto(`/login?mode=register&plan=${bad}&interval=zzz`)
      await expect(page.getByRole('tab', { name: 'Kayıt' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByTestId('register-plan-band')).toHaveCount(0)
      await expect(page.locator('body')).not.toContainText('alert(1)')
    })
  }

  test('yasal onay: işaretlenmeden kayıt GÖNDERİLMEZ, hata metni görünür; işaretlenince gönderilir', async ({ page }) => {
    const registerBodies: any[] = []
    await installApiMocks(page, statefulMocks({ registerBodies }))
    await page.goto(CTA('starter'))
    await fillRegisterForm(page)

    await page.getByRole('button', { name: 'Kayıt Ol' }).click()
    await expect(page.getByText('Kayıt olmak için sözleşme metinlerini onaylamanız gerekir.')).toBeVisible()
    await page.waitForTimeout(400)
    expect(registerBodies).toHaveLength(0)

    await consent(page).check()
    await expect(page.getByText('Kayıt olmak için sözleşme metinlerini onaylamanız gerekir.')).toHaveCount(0)
    await page.getByRole('button', { name: 'Kayıt Ol' }).click()
    await expect.poll(() => registerBodies.length).toBe(1)
    // Plan bilgisi kayıt GÖVDESİNE yazılmaz (yalnızca izinli alanlar; plan seçimi abonelik ekranında yapılır).
    expect(Object.keys(registerBodies[0].registerValues).sort()).toEqual(['email', 'name', 'password', 'password2', 'surname'])
  })

  test('yasal metin bağlantıları site yasal sayfalarına gider (yeni sekme, noopener)', async ({ page }) => {
    await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
    await page.goto(CTA('starter'))
    const links = page.getByTestId('register-legal-links')
    for (const [name, path] of [
      ['Kullanım Koşulları', '/yasal/kullanim-kosullari'],
      ['Abonelik Sözleşmesi', '/yasal/abonelik-sozlesmesi'],
      ['Ön Bilgilendirme Formu', '/yasal/on-bilgilendirme'],
      ['KVKK Aydınlatma Metni', '/yasal/kvkk-aydinlatma'],
    ] as const) {
      const a = links.getByRole('link', { name })
      await expect(a).toHaveAttribute('href', new RegExp(`^https?://[^/]+${path}$`))
      await expect(a).toHaveAttribute('target', '_blank')
      await expect(a).toHaveAttribute('rel', /noopener/)
    }
  })

  test('giriş ekranında "Ana site" bağlantısı var (taban adres yapılandırmadan)', async ({ page }) => {
    await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
    await page.goto('/login')
    const link = page.getByTestId('site-link')
    await expect(link).toBeVisible()
    await expect(link).toHaveText(/Ana site/)
    await expect(link).toHaveAttribute('href', /^https?:\/\/[^/]+$/)
  })

  test('axe: kayıt sekmesi (plan bandı + onay) — sekme içeriği 0 ihlal', async ({ page }) => {
    await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
    await page.goto(CTA('growth'))
    await expect(page.getByTestId('register-plan-band')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(400)
    // `.v-field` (Vuetify alan etiketleri) hariç: bu etiketlerin renk-kontrastı ihlali ÖNCEDEN BİLİNEN, bu görevin
    // kapsamı dışı bir bulgu (login.spec.ts axe testi "kaydediliyor, düzeltilmiyor"); S4b'nin eklediği öğeler (plan
    // bandı, onay kutusu, yasal bağlantılar, hata metni) 0 ihlal olmalı.
    const results = await new AxeBuilder({ page }).include('.premium-login-card').exclude('.v-field').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }))).toEqual([])
  })

  test('ekran görüntüsü tabanı (site devri: kayıt sekmesi + plan bandı)', async ({ page }) => {
    await installApiMocks(page, { checkAuthentication: false, userContext: mockError(401, {}) })
    await page.goto(CTA('growth'))
    await expect(page.getByTestId('register-plan-band')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(400)
    await expect(page).toHaveScreenshot('register-handoff.png', { fullPage: true })
  })
})

test.describe('ADR-0014 S4b — uçtan uca: kayıt -> abonelik -> mock checkout', () => {
  async function registerAndLand(page: Page, mocks: ReturnType<typeof statefulMocks>) {
    await installApiMocks(page, mocks)
    await page.goto(CTA('growth'))
    await fillRegisterForm(page)
    await consent(page).check()
    await page.getByRole('button', { name: 'Kayıt Ol' }).click()
    // Kayıt sonrası: URL PII taşımaz (yalnızca izinli plan kodu), abonelik ekranı seçili planı önerir.
    await expect(page).toHaveURL(/\/subscription\?plan=growth$/, { timeout: 15_000 })
    await expect(page.locator('.subscriptionView')).toBeVisible(SCREEN_READY)
    await expect(statusTitle(page)).toContainText('Deneme Sürümü', SCREEN_READY)
    const note = page.getByTestId('suggested-plan-note')
    await expect(note).toContainText('Büyüme', SCREEN_READY)
    await expect(page.getByText('Seçtiğiniz Plan', { exact: true })).toBeVisible()
    expect(page.url()).not.toContain('example.invalid')
  }

  async function startCheckoutFromCard(page: Page) {
    await page.getByRole('button', { name: /Büyüme planı için: Bu Plana Geç/ }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Plan Seçimini Onayla' })
    await expect(dialog).toBeVisible(SCREEN_READY)
    await dialog.getByRole('button', { name: 'Devam Et' }).click()
    await expect(dialog).not.toBeVisible(SCREEN_READY)
    await expect(page.getByText('Ödeme adımına yönlendiriliyorsunuz (test ortamı)')).toBeVisible(SCREEN_READY)
    await expect(page.getByText(startCheckoutSuccessFixture.checkoutUrl)).toBeVisible()
  }

  test('checkout BAŞARILI: kayıt -> abonelik ekranı -> startCheckout -> durum "Aktif", plan "Mevcut Planınız"', async ({ page }) => {
    const registerBodies: any[] = []
    const checkoutBodies: any[] = []
    await registerAndLand(page, statefulMocks({ registerBodies, checkoutBodies, checkout: 'success' }))
    expect(registerBodies).toHaveLength(1)

    await startCheckoutFromCard(page)
    expect(checkoutBodies).toEqual([{ planCode: 'growth', billingInterval: 'month' }])
    await expect(statusTitle(page)).toContainText('Aktif', SCREEN_READY)
    await expect(page.getByText('Mevcut Planınız').first()).toBeVisible()
    await expect(page.getByTestId('suggested-plan-note')).toHaveCount(0)
  })

  test('checkout REDDEDİLDİ: abonelik "Deneme Sürümü"nde kalır, plan seçilebilir durumda (tekrar denenebilir)', async ({ page }) => {
    await registerAndLand(page, statefulMocks({ checkout: 'declined' }))

    await startCheckoutFromCard(page)
    await expect(statusTitle(page)).toContainText('Deneme Sürümü', SCREEN_READY)
    await expect(statusTitle(page)).not.toContainText('Aktif')
    await expect(page.getByRole('button', { name: /Büyüme planı için: Bu Plana Geç/ })).toBeEnabled()
  })

  test('checkout yetkisiz (403): aksiyon alınabilir Türkçe mesaj, ham hata sızmaz', async ({ page }) => {
    await registerAndLand(page, statefulMocks({ checkout: 'forbidden' }))

    await page.getByRole('button', { name: /Büyüme planı için: Bu Plana Geç/ }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Plan Seçimini Onayla' })
    await dialog.getByRole('button', { name: 'Devam Et' }).click()
    await expect(page.getByText('Bu işlemi yalnızca hesap sahibi veya yöneticisi gerçekleştirebilir.')).toBeVisible(SCREEN_READY)
    await expect(page.locator('.subscriptionView')).not.toContainText('Forbidden')
  })

  test('plansız kayıt: pano hedefine gider (abonelik ekranı zorlanmaz)', async ({ page }) => {
    await installApiMocks(page, statefulMocks())
    await page.goto('/login?mode=register')
    await fillRegisterForm(page)
    await consent(page).check()
    await page.getByRole('button', { name: 'Kayıt Ol' }).click()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 })
  })
})
