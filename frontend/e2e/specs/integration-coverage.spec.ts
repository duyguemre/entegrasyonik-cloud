// C1.2 — kanal kapsam çipleri (getCatalog), dürüst "Yakında" (kodu olmayan sağlayıcılar) ve Trendyol webhook adresi
// oluştur/yenile (generateWebhookToken). Sözleşmeler SALT OKUNUR: backend `api/services/integration-service.ts`
// `getCatalog` (member) ve `generateWebhookToken { integrationCode }` (admin). Katalog fixture'ı backend
// manifestolarının birebir kopyasıdır (`e2e/fixtures/integrationCatalog.ts`); diğer veriler sentetik (Protokol 7).
// `C12_REVIEW=1` ile inceleme görsellerini frontend/docs/design-system-review/c12-*.png olarak yazar (belge görseli,
// Playwright tabanı DEĞİL).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError, type MockValue } from '../fixtures/mockApi'
import { clientIntegrationsDoluFixture, integrationDefinitionsFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'
import { AXE_TAGS, integrationHealthFixture, menuFixtureWithB4P1c, openB4P1cScreen } from '../fixtures/b4p1cScreens'
import { integrationCatalogFixture } from '../fixtures/integrationCatalog'

const CATALOG = 'IntegrationService/getCatalog'
const HEALTH = 'IntegrationService/getIntegrationHealth'
const WEBHOOK = 'IntegrationService/generateWebhookToken'
const TOKEN = 'e2e0sentetik0webhook0anahtari0000000000000000000000000000000000ab'

// Kodu OLMAYAN iki e-ticaret platformu (rayda görünmeleri için hem tanım listesinde hem mağaza kaydında).
const ECOMMERCE_WITH_UNBUILT: Record<string, MockValue> = {
  IntegrationService: [
    ...integrationDefinitionsFixture,
    { _id: 'itg-ticimax', code: 'ticimax', title: 'Ticimax', order: 2, type: { _id: 'type-ecommerce', code: 'ecommerce' } },
    { _id: 'itg-shopify', code: 'shopify', title: 'Shopify', order: 3, type: { _id: 'type-ecommerce', code: 'ecommerce' } },
  ],
  'IntegrationService/getClientIntegrations': {
    ...clientIntegrationsDoluFixture,
    ecommerce: [...clientIntegrationsDoluFixture.ecommerce, { code: 'ticimax', order: 2, settings: {} }, { code: 'shopify', order: 3, settings: {} }],
  },
}

const coverage = (page: Page, root: string) => page.locator(`${root} section.ek-coverage`)
const chips = (page: Page, root: string) => coverage(page, root).getByRole('listitem')

async function openIntegration(page: Page, screen: 'MarketplaceView' | 'ECommerceView' | 'ErpView' | 'ShippingView' | 'EInvoiceView', overrides: Record<string, MockValue> = {}) {
  await installApiMocks(page, overrides)
  await gotoAuthed(page)
  await openScreen(page, screen)
}

test.describe('C1.2 — kanal kapsamı (getCatalog)', () => {
  test('pazaryeri: seçili kanalın kapsam çipleri yalnız manifestodan, düzey metinle (renk tek başına değil)', async ({ page }) => {
    const bodies: any[] = []
    await openIntegration(page, 'MarketplaceView', {
      [CATALOG]: async (route: any, headers: Record<string, string>) => {
        bodies.push(route.request().postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(integrationCatalogFixture()) })
      },
    })
    const root = '.marketplaceView'
    const panel = coverage(page, root)
    await expect(panel.getByRole('heading', { name: 'Bu kanalda neler çalışır' })).toBeVisible()
    await expect(panel).toContainText('Trendyol bağlantısının bugünkü kapsamı')
    await expect(chips(page, root)).toHaveCount(10)
    await expect(chips(page, root).filter({ hasText: 'Sipariş onay / red' })).toContainText('Kanal kendisi yapar')
    await expect(chips(page, root).filter({ hasText: 'Kargo bildirimi' })).toContainText('Sınırlı')
    await expect(chips(page, root).filter({ hasText: 'Ürün aktarımı' })).toHaveAttribute('data-level', 'supported')
    await expect(panel).toContainText('8 destekleniyor')
    await expect(panel).not.toContainText('Kayıtta yer almıyor')
    // Katalog oturumda bir kez istenir (ekran + panel aynı önbelleği paylaşır), gövde boş.
    expect(bodies).toEqual([{}])

    // Kanal değişince çipler değişir; manifestoda yazılmayan yetenek "yok" diye iddia edilmez, ayrı satırda adıyla durur.
    await page.locator(`${root} .nav-item-wrapper`).nth(1).click()
    await expect(panel).toContainText('Hepsiburada bağlantısının bugünkü kapsamı')
    await expect(chips(page, root)).toHaveCount(9)
    await expect(panel.getByText('Kayıtta yer almıyor')).toBeVisible()
    await expect(panel).toContainText('Kategori ve marka')
    expect(bodies).toHaveLength(1)
  })

  test('ayrıntılar: düzey + kullanıcıya dönük not, sınırlamalar, doğrulama — iç başvurular sızmaz', async ({ page }) => {
    await openIntegration(page, 'MarketplaceView')
    const panel = coverage(page, '.marketplaceView')
    const toggle = panel.getByRole('button', { name: 'Ayrıntılar ve sınırlamalar (3)' })
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(panel.getByRole('heading', { name: 'Bilinen sınırlamalar' })).toBeVisible()
    await expect(panel).toContainText('Kargo takip bilgisi otomatik değil, elle girilerek iletilir.')
    await expect(panel).toContainText('Trendyol siparişi kendisi onaylar.')
    await expect(panel).toContainText('Test ortamında doğrulandı; canlı API ile uçtan uca doğrulama henüz yapılmadı.')
    const text = (await panel.textContent()) ?? ''
    for (const leak of ['BACKLOG', 'INTEGRATIONS_REGISTRY', '.ts', '`', 'approveOrder', 'TRENDYOL_', 'NOT_SUPPORTED']) expect(text).not.toContain(leak)
  })

  test('hata ≠ boş: katalog alınamazsa bilgi satırı + Tekrar dene; ayar formu kullanılabilir kalır', async ({ page }) => {
    // Başarısız sonuç önbelleğe alınmaz: "Tekrar dene"ye kadar her istek 500 döner.
    let failing = true
    await openIntegration(page, 'MarketplaceView', {
      [CATALOG]: async (route: any, headers: Record<string, string>) => {
        return failing
          ? route.fulfill({ status: 500, contentType: 'application/json', headers, body: '{"error":"MongoServerError: yığın"}' })
          : route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(integrationCatalogFixture()) })
      },
    })
    const root = page.locator('.marketplaceView')
    await expect(root.getByText('Kapsam bilgisi şu an alınamadı.', { exact: false })).toBeVisible()
    await expect(root).not.toContainText('Mongo')
    await expect(root.getByRole('button', { name: 'Kaydet' })).toBeEnabled()
    // Yedek canlı küme: Trendyol/Hepsiburada "Yakında" DEĞİL.
    await expect(root.locator('.nav-item-wrapper').getByText('Yakında')).toHaveCount(0)
    failing = false
    await root.getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(chips(page, '.marketplaceView')).toHaveCount(10)
  })

  test('ERP: sınırlı kapsam rozeti; "Bağlantı sağlığı" sağlık sekmesini açar (ekran menüdeyse)', async ({ page }) => {
    await openIntegration(page, 'ErpView', { MenuService: menuFixtureWithB4P1c(['IntegrationHealthView']) })
    const panel = coverage(page, '.erpView')
    await expect(panel.getByText('Sınırlı kapsam')).toBeVisible()
    await expect(chips(page, '.erpView')).toHaveCount(3)
    await expect(panel).toContainText('Stok ve fiyat, Muhasebe eşitleme')
    await panel.getByRole('button', { name: 'Bağlantı sağlığı' }).click()
    await expect(page).toHaveURL(/\/integrations\/health$/, { timeout: 10000 })
  })

  test('sağlık ekranı menüde yoksa "Bağlantı sağlığı" bağlantısı gösterilmez', async ({ page }) => {
    await openIntegration(page, 'MarketplaceView')
    await expect(coverage(page, '.marketplaceView').getByRole('heading', { name: 'Bu kanalda neler çalışır' })).toBeVisible()
    await expect(coverage(page, '.marketplaceView').getByRole('button', { name: 'Bağlantı sağlığı' })).toHaveCount(0)
  })
})

test.describe('C1.2 — dürüst "Yakında" (kodu olmayan sağlayıcılar)', () => {
  test('e-ticaret: kodu olmayan platform → Yakında paneli, kimlik alanı yok, Kaydet nedenli devre dışı, kapsam yok', async ({ page }) => {
    const saves: any[] = []
    await openIntegration(page, 'ECommerceView', {
      ...ECOMMERCE_WITH_UNBUILT,
      'IntegrationService/saveClientECommerceSettings': async (route: any, headers: Record<string, string>) => {
        saves.push(route.request().postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: '{}' })
      },
    })
    const root = page.locator('.ecommerceView')
    const rail = root.locator('.nav-item-wrapper')
    await expect(rail.nth(1)).toContainText('Yakında')
    await expect(rail.nth(0)).not.toContainText('Yakında')
    await rail.nth(1).click()
    await expect(root.getByRole('heading', { name: 'Ticimax e-ticaret entegrasyonu henüz yok' })).toBeVisible()
    await expect(root.getByText('Bu ekrandan kimlik bilgisi (API anahtarı, parola) kaydedilmez.')).toBeVisible()
    await expect(root.getByRole('tabpanel').locator('input')).toHaveCount(0)
    const save = root.getByRole('button', { name: 'Kaydet' })
    await expect(save).toBeDisabled()
    await expect(save).toHaveAccessibleDescription('Kaydedilecek ayar yok — bu sağlayıcı için entegrasyon henüz geliştirilmedi.')
    await expect(coverage(page, '.ecommerceView')).toHaveCount(0)
    // Rehber kartı kodu olmayan sağlayıcıda "API anahtarlarını girin" demez.
    const guide = root.locator('.ek-integration-layout__aside')
    await expect(guide).toContainText('Kimlik bilgisi girmeyin')
    await expect(guide).not.toContainText('API Bağlantısı')
    await rail.nth(0).click()
    await expect(guide).toContainText('API Bağlantısı')
    expect(saves).toEqual([])
  })

  test('kargo: mağazada kargo kaydı yokken "yukarıdan seçin" DEĞİL, kategori düzeyi Yakında + bugün yapılabilenler (katalogdan)', async ({ page }) => {
    await openIntegration(page, 'ShippingView')
    const root = page.locator('.shippingView')
    await expect(root.getByRole('heading', { name: 'Kargo entegrasyonu henüz yok' })).toBeVisible()
    await expect(root.getByText('Başlamak için seçim yapın')).toHaveCount(0)
    const alt = root.getByRole('list', { name: 'Bugün yapabilecekleriniz' })
    await expect(alt.getByRole('listitem')).toHaveCount(5) // shippingNotice: 4 pazaryeri (sınırlı) + Ideasoft (sınırlı)
    await expect(alt).toContainText('Ideasoft')
    await expect(root.getByRole('button', { name: 'Kaydet' })).toBeDisabled()
    await expect(root).not.toContainText('otomatik olarak aktif hale gelir')
  })

  test('e-fatura: her sağlayıcı Yakında; alternatif yalnız fatura bildirimi olan kanallar (Ideasoft hariç)', async ({ page }) => {
    await openIntegration(page, 'EInvoiceView')
    const root = page.locator('.einvoiceView')
    await expect(root.getByRole('heading', { name: 'Trendyol e-Faturam e-fatura entegrasyonu henüz yok' })).toBeVisible()
    const alt = root.getByRole('list', { name: 'Bugün yapabilecekleriniz' })
    await expect(alt.getByRole('listitem')).toHaveCount(4)
    await expect(alt).not.toContainText('Ideasoft')
    await expect(root).not.toContainText('fatura kesmeyi deneyebilirsiniz')
    await expect(root.getByRole('button', { name: 'Kaydet' })).toBeDisabled()
  })

  test('katalog alınamazsa "bugün yapılabilenler" gösterilmez (uydurma liste yok)', async ({ page }) => {
    await openIntegration(page, 'ShippingView', { [CATALOG]: mockError(500) })
    const root = page.locator('.shippingView')
    await expect(root.getByRole('heading', { name: 'Kargo entegrasyonu henüz yok' })).toBeVisible()
    await expect(root.getByRole('list', { name: 'Bugün yapabilecekleriniz' })).toHaveCount(0)
    await expect(root).not.toContainText('500')
  })
})

test.describe('C1.2 — Trendyol webhook adresi (sağlık ekranı)', () => {
  const ROOT = '.integrationHealthView'
  const panel = (page: Page) => page.locator(ROOT).getByRole('region', { name: 'Anlık sipariş bildirimi (webhook)' })

  async function openHealth(page: Page, overrides: Record<string, MockValue> = {}) {
    await installApiMocks(page, { MenuService: menuFixtureWithB4P1c(['IntegrationHealthView']), [HEALTH]: integrationHealthFixture(), ...overrides })
    await openB4P1cScreen(page, 'IntegrationHealthView')
  }

  test('yenile: onay → gövde {integrationCode:"trendyol"} → adres bir kez gösterilir, sağlık yeniden okunur, Gizle siler', async ({ page }) => {
    const bodies: any[] = []
    let healthCalls = 0
    await openHealth(page, {
      [HEALTH]: async (route: any, headers: Record<string, string>) => {
        healthCalls += 1
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(integrationHealthFixture()) })
      },
      [WEBHOOK]: async (route: any, headers: Record<string, string>) => {
        bodies.push(route.request().postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ integrationCode: 'trendyol', webhookToken: TOKEN }) })
      },
    })
    const p = panel(page)
    await expect(p.getByText('Bildirim alınıyor')).toBeVisible()
    await expect(p.getByText('8 dk önce')).toBeVisible()
    await expect(p).not.toContainText(TOKEN)
    await p.getByRole('button', { name: 'Yeni adres üret' }).click()

    const dialog = page.getByRole('alertdialog')
    await expect(dialog.getByText('Webhook adresi yenilensin mi?')).toBeVisible()
    await expect(dialog).toContainText('Mevcut adres geçersiz olur, Trendyol panelinde yeni adresi girmeniz gerekir.')
    await dialog.getByRole('button', { name: 'Yeni adres üret' }).click()

    const field = p.getByLabel('Webhook adresi')
    await expect(field).toHaveValue(new RegExp(`/hooks/trendyol/${TOKEN}$`))
    await expect(field).toHaveValue(/^https?:\/\/[^/]+\/hooks\//) // /api bağlamı DIŞINDA (aynı sunucu kökü)
    expect(bodies).toEqual([{ integrationCode: 'trendyol' }])
    await expect.poll(() => healthCalls).toBe(2)
    await expect(page.getByText('Webhook adresi oluşturuldu — Trendyol panelinde güncelleyin.')).toBeVisible()

    // Anahtar hiçbir depoya yazılmaz.
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
    expect(stored).not.toContain(TOKEN)

    await p.getByRole('button', { name: 'Gizle' }).click()
    await expect(p.getByLabel('Webhook adresi')).toHaveCount(0)
    await expect(page.locator(ROOT)).not.toContainText(TOKEN)
  })

  test('Vazgeç: istek gönderilmez; webhook kurulmamışsa "oluştur" (yıkıcı olmayan onay)', async ({ page }) => {
    const bodies: any[] = []
    const health = integrationHealthFixture()
    health.integrations = health.integrations.map((it: any) => (it.integrationCode === 'trendyol' ? { ...it, webhook: null } : it))
    await openHealth(page, {
      [HEALTH]: health,
      [WEBHOOK]: async (route: any, headers: Record<string, string>) => {
        bodies.push(route.request().postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: '{}' })
      },
    })
    const p = panel(page)
    await expect(p.getByText('Kurulmadı')).toBeVisible()
    await p.getByRole('button', { name: 'Webhook adresi oluştur' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog.getByText('Webhook adresi oluşturulsun mu?')).toBeVisible()
    await dialog.getByRole('button', { name: 'Vazgeç' }).click()
    await expect(dialog).toHaveCount(0)
    expect(bodies).toEqual([])
  })

  test('hata: 403 → yetki mesajı, 500 → insan-okunur hata; ham hata ve adres gösterilmez', async ({ page }) => {
    let calls = 0
    await openHealth(page, {
      [WEBHOOK]: async (route: any, headers: Record<string, string>) => {
        calls += 1
        const status = calls === 1 ? 403 : 500
        return route.fulfill({ status, contentType: 'application/json', headers, body: '{"error":"Entegrasyon bulunamadı — stack"}' })
      },
    })
    const p = panel(page)
    for (const expected of [
      'Webhook adresini yalnızca mağaza sahibi veya yöneticisi oluşturabilir.',
      'Webhook adresi oluşturulamadı — Trendyol entegrasyonunuzun kurulu olduğundan emin olup tekrar deneyin.',
    ]) {
      await p.getByRole('button', { name: 'Yeni adres üret' }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: 'Yeni adres üret' }).click()
      await expect(page.getByText(expected)).toBeVisible()
      await expect(p.getByLabel('Webhook adresi')).toHaveCount(0)
    }
    await expect(page.locator('body')).not.toContainText('stack')
  })

  test('Trendyol kurulu değilse webhook paneli yok', async ({ page }) => {
    const health = integrationHealthFixture()
    health.integrations = health.integrations.filter((it: any) => it.integrationCode !== 'trendyol')
    await openHealth(page, { [HEALTH]: health })
    await expect(page.locator(`${ROOT} .ek-health-card`)).toHaveCount(4)
    await expect(panel(page)).toHaveCount(0)
  })
})

test.describe('C1.2 — erişilebilirlik (axe WCAG 2.1 AA = 0)', () => {
  test('kapsam paneli (ayrıntılar açık), kargo Yakında, e-fatura, webhook adresi gösterilirken', async ({ page }) => {
    await openIntegration(page, 'MarketplaceView')
    await coverage(page, '.marketplaceView').getByRole('button', { name: /Ayrıntılar/ }).click()
    for (const root of ['.marketplaceView']) {
      const r = await new AxeBuilder({ page }).include(root).withTags(AXE_TAGS).analyze()
      expect(r.violations, JSON.stringify(r.violations, null, 2)).toEqual([])
    }

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await openIntegration(page, 'ShippingView')
    await expect(page.locator('.shippingView').getByRole('list', { name: 'Bugün yapabilecekleriniz' })).toBeVisible()
    const shipping = await new AxeBuilder({ page }).include('.shippingView').withTags(AXE_TAGS).analyze()
    expect(shipping.violations, JSON.stringify(shipping.violations, null, 2)).toEqual([])

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await installApiMocks(page, {
      MenuService: menuFixtureWithB4P1c(['IntegrationHealthView']),
      [HEALTH]: integrationHealthFixture(),
      [WEBHOOK]: { integrationCode: 'trendyol', webhookToken: TOKEN },
    })
    await openB4P1cScreen(page, 'IntegrationHealthView')
    const p = page.locator('.integrationHealthView').getByRole('region', { name: 'Anlık sipariş bildirimi (webhook)' })
    await p.getByRole('button', { name: 'Yeni adres üret' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Yeni adres üret' }).click()
    await expect(p.getByLabel('Webhook adresi')).toBeVisible()
    const health = await new AxeBuilder({ page }).include('.integrationHealthView').withTags(AXE_TAGS).analyze()
    expect(health.violations, JSON.stringify(health.violations, null, 2)).toEqual([])
  })
})

test.describe('inceleme görselleri (C1.2)', () => {
  test.skip(!process.env.C12_REVIEW, 'yalnızca C12_REVIEW=1 ile')
  const dir = 'docs/design-system-review'
  const vw = Number(process.env.C12_REVIEW_WIDTH ?? 1440)

  async function shoot(page: Page, root: string, name: string, full = false) {
    await page.waitForTimeout(500)
    if (full) {
      // Entegrasyon ekranları içerikleri kendi `.workarea-scroll` alanında kaydırır; yükseklik oradan ölçülür.
      const h = await page.locator(root).evaluate((el) => (el.querySelector('.workarea-scroll') ?? el).scrollHeight)
      await page.setViewportSize({ width: vw, height: Math.min(3200, h + 160) })
      await page.waitForTimeout(300)
    }
    await page.screenshot({ path: `${dir}/c12-${name}-${vw}.png` })
  }

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: vw, height: vw >= 1024 ? 900 : 844 })
  })

  test('pazaryeri kapsamı (ayrıntılar açık)', async ({ page }) => {
    await openIntegration(page, 'MarketplaceView', { MenuService: menuFixtureWithB4P1c(['IntegrationHealthView']) })
    await shoot(page, '.marketplaceView', 'pazaryeri-kapsam')
    await coverage(page, '.marketplaceView').getByRole('button', { name: /Ayrıntılar/ }).click()
    await shoot(page, '.marketplaceView', 'pazaryeri-ayrintilar', true)
  })

  test('ERP kapsamı', async ({ page }) => {
    await openIntegration(page, 'ErpView', { MenuService: menuFixtureWithB4P1c(['IntegrationHealthView']) })
    await shoot(page, '.erpView', 'erp-kapsam')
  })

  test('e-ticaret Yakında', async ({ page }) => {
    await openIntegration(page, 'ECommerceView', ECOMMERCE_WITH_UNBUILT)
    await page.locator('.ecommerceView .nav-item-wrapper').nth(1).click()
    await shoot(page, '.ecommerceView', 'eticaret-yakinda', true)
  })

  test('kargo ve e-fatura Yakında', async ({ page }) => {
    await openIntegration(page, 'ShippingView')
    await shoot(page, '.shippingView', 'kargo-yakinda', true)
    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await page.setViewportSize({ width: vw, height: vw >= 1024 ? 900 : 844 })
    await openIntegration(page, 'EInvoiceView')
    await shoot(page, '.einvoiceView', 'efatura-yakinda', true)
  })

  test('sağlık: webhook paneli ve yeni adres', async ({ page }) => {
    await installApiMocks(page, {
      MenuService: menuFixtureWithB4P1c(['IntegrationHealthView']),
      [HEALTH]: integrationHealthFixture(),
      [WEBHOOK]: { integrationCode: 'trendyol', webhookToken: TOKEN },
    })
    await openB4P1cScreen(page, 'IntegrationHealthView')
    const p = page.locator('.integrationHealthView').getByRole('region', { name: 'Anlık sipariş bildirimi (webhook)' })
    await p.getByRole('button', { name: 'Yeni adres üret' }).click()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/c12-webhook-onay-${vw}.png` })
    await page.getByRole('alertdialog').getByRole('button', { name: 'Yeni adres üret' }).click()
    await expect(p.getByLabel('Webhook adresi')).toBeVisible()
    await p.scrollIntoViewIfNeeded()
    await shoot(page, '.integrationHealthView', 'webhook-yeni-adres')
  })
})
