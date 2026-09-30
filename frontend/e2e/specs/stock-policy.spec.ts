// ADR-0015 B4-P0 — N5 "Stok politikası" (YENİ ekran, Karar 5.6: spec ekranla aynı commit'te).
// Sözleşme: docs/API_TENANT_SURFACE.md §1 — getStockPolicy / saveTenantStockPolicy / saveChannelStockPolicy
// (kısmi; yalnızca değişen alanlar, `null` = varsayılana dön). Sentetik fixture (Protokol 7: PII yok).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError, type MockValue } from '../fixtures/mockApi'
import { AXE_TAGS, B4_SCREENS, menuFixtureWithB4, openB4Screen } from '../fixtures/b4Screens'

const ROOT = B4_SCREENS.StockPolicyView.root

function policyFixture(overrides: Record<string, unknown> = {}) {
  return {
    primaryChannel: null,
    effectivePrimaryChannel: 'trendyol',
    primaryChannelIsConnected: true,
    channels: [
      { integrationCode: 'trendyol', order: 1, enabled: true, isPrimary: true, autoCancelSupported: true, stockPolicy: { bufferPercent: 10 } },
      { integrationCode: 'hepsiburada', order: 2, enabled: true, isPrimary: false, autoCancelSupported: true, stockPolicy: {} },
      { integrationCode: 'n11', order: 3, enabled: false, isPrimary: false, autoCancelSupported: false, stockPolicy: { graceMinutes: 45 } },
    ],
    defaults: { bufferUnits: 1, bufferPercent: 0, graceMinutes: 30, autoCancelOversold: true },
    limits: { bufferUnitsMax: 100000, bufferPercentMax: 100, graceMinutesMax: 10080 },
    ...overrides,
  }
}

async function mocks(page: any, overrides: Record<string, MockValue> = {}) {
  await installApiMocks(page, { MenuService: menuFixtureWithB4(), 'IntegrationService/getStockPolicy': policyFixture(), ...overrides })
}

const card = (page: any, name: string) => page.locator(`${ROOT} article`).filter({ has: page.getByRole('heading', { name }) })

function recorder(bodies: any[], response: (body: any) => unknown) {
  return async (route: any, headers: Record<string, string>) => {
    const body = route.request().postDataJSON()
    bodies.push(body)
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(response(body)) })
  }
}

test.describe('ADR-0015 B4-P0 — N5 Stok politikası', () => {
  test('smoke: birincil kanal, kanal kartları, varsayılan yer tutucular ve örnek hesap render olur', async ({ page }) => {
    await mocks(page)
    await openB4Screen(page, 'StockPolicyView')
    const root = page.locator(ROOT)

    await expect(root.getByRole('heading', { level: 1, name: 'Stok politikası' })).toBeVisible()
    await expect(root.getByText('Şu an geçerli birincil kanal: Trendyol')).toBeVisible()
    await expect(root.locator('article')).toHaveCount(3)
    await expect(card(page, 'Trendyol').getByText('Birincil kanal', { exact: true })).toBeVisible()
    await expect(card(page, 'N11').getByText('Pasif', { exact: true })).toBeVisible()
    // Trendyol (birincil, %10): 20 − max(0, 2) = 18 · Hepsiburada (varsayılan 1 adet): 20 − 1 = 19.
    await expect(card(page, 'Trendyol').getByText('Örnek: 20 adet satılabilir stokta bu kanala 18 adet yayınlanır.')).toBeVisible()
    await expect(card(page, 'Hepsiburada').getByText('Örnek: 20 adet satılabilir stokta bu kanala 19 adet yayınlanır.')).toBeVisible()
    await expect(card(page, 'Trendyol').getByLabel('Tampon yüzdesi')).toHaveValue('10')
    await expect(card(page, 'N11').getByLabel('Aşırı satış bekleme süresi')).toHaveValue('45')
    await expect(card(page, 'N11').getByText('Bu pazaryerinde otomatik iptal desteklenmiyor; aşırı satışta size görev düşer.')).toBeVisible()
    await expect(card(page, 'N11').getByText('Desteklenmiyor', { exact: true })).toBeVisible()
    // Değişiklik yokken kaydet çubuğu görünmez.
    await expect(root.getByRole('button', { name: 'Kaydet' })).toHaveCount(0)
    await expect(page).toHaveURL(/\/catalog\/stock-policy$/)
  })

  test('boş durum: bağlı pazaryeri yoksa yönlendirici boş durum gösterilir', async ({ page }) => {
    await mocks(page, { 'IntegrationService/getStockPolicy': policyFixture({ channels: [], effectivePrimaryChannel: null }) })
    await openB4Screen(page, 'StockPolicyView')
    const root = page.locator(ROOT)

    await expect(root.getByText('Henüz bağlı pazaryeri yok')).toBeVisible()
    await expect(root.locator('article')).toHaveCount(0)
  })

  test('hata durumu: 500 → insan-okunur hata + Tekrar dene (ham hata yok); 403 → erişim mesajı', async ({ page }) => {
    await mocks(page, { 'IntegrationService/getStockPolicy': mockError(500, { error: 'MongoServerError: stack' }) })
    await openB4Screen(page, 'StockPolicyView')
    const root = page.locator(ROOT)
    // Aşama 6b (Standart 1): hata deseni "ne oldu" ile "ne yapmalı"yı ayrı satırda gösterir — iddia aynı, metin bölündü.
    await expect(root.getByText('Stok politikası yüklenemedi', { exact: true })).toBeVisible()
    await expect(root.getByText('Bağlantınızı kontrol edip tekrar deneyin.', { exact: true }).first()).toBeVisible()
    await expect(root.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(root).not.toContainText('Mongo')

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mocks(page, { 'IntegrationService/getStockPolicy': mockError(403, { error: 'Forbidden' }) })
    await openB4Screen(page, 'StockPolicyView')
    await expect(page.locator(ROOT).getByText('Bu ayarlara erişiminiz yok')).toBeVisible()
    await expect(page.locator(ROOT)).not.toContainText('Forbidden')
  })

  test('etkileşim: yalnızca DEĞİŞEN alanlar gönderilir; temizlenen alan null; kaydetten sonra yeniden okunur', async ({ page }) => {
    const channelBodies: any[] = []
    const tenantBodies: any[] = []
    let reads = 0
    await mocks(page, {
      'IntegrationService/getStockPolicy': async (route: any, headers: Record<string, string>) => {
        reads += 1
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(policyFixture()) })
      },
      'IntegrationService/saveChannelStockPolicy': recorder(channelBodies, (b) => ({ integrationCode: b.integrationCode, stockPolicy: {} })),
      'IntegrationService/saveTenantStockPolicy': recorder(tenantBodies, (b) => ({ primaryChannel: b.primaryChannel })),
    })
    await openB4Screen(page, 'StockPolicyView')
    const root = page.locator(ROOT)

    await card(page, 'Trendyol').getByLabel('Tampon yüzdesi').fill('')
    await card(page, 'Hepsiburada').getByLabel('Tampon adet').fill('3')
    await expect(card(page, 'Hepsiburada').getByText('Örnek: 20 adet satılabilir stokta bu kanala 17 adet yayınlanır.')).toBeVisible()
    await expect(root.getByText('Kaydedilmemiş 2 değişiklik var.')).toBeVisible()

    await root.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Stok politikası kaydedildi.')).toBeVisible()
    expect(channelBodies).toEqual([
      { integrationCode: 'trendyol', stockPolicy: { bufferPercent: null } },
      { integrationCode: 'hepsiburada', stockPolicy: { bufferUnits: 3 } },
    ])
    expect(tenantBodies).toEqual([])
    await expect.poll(() => reads).toBe(2)
  })

  test('etkileşim: birincil kanal seçimi saveTenantStockPolicy ile gönderilir; önizleme anında güncellenir', async ({ page }) => {
    const tenantBodies: any[] = []
    await mocks(page, {
      'IntegrationService/saveTenantStockPolicy': recorder(tenantBodies, (b) => ({ primaryChannel: b.primaryChannel })),
    })
    await openB4Screen(page, 'StockPolicyView')
    const root = page.locator(ROOT)

    // Vuetify `v-select` iç girişinin adını "Aç/Kapat" ile ezer (DS düzeyi bilinen borç, rapora yazıldı) → sınıfla seçilir.
    await root.locator('.stockPolicyView__primary .v-field').click()
    await page.getByRole('option', { name: 'Hepsiburada' }).click()
    await expect(root.getByText('Şu an geçerli birincil kanal: Hepsiburada')).toBeVisible()
    // Hepsiburada artık birincil: tampon adet uygulanmaz → 20.
    await expect(card(page, 'Hepsiburada').getByText('Örnek: 20 adet satılabilir stokta bu kanala 20 adet yayınlanır.')).toBeVisible()

    await root.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Stok politikası kaydedildi.')).toBeVisible()
    expect(tenantBodies).toEqual([{ primaryChannel: 'hepsiburada' }])
  })

  test('istemci doğrulaması: aralık dışı / sayı olmayan değerde backend ÇAĞRILMAZ; Vazgeç taslağı geri alır', async ({ page }) => {
    let called = false
    await mocks(page, {
      'IntegrationService/saveChannelStockPolicy': async (route: any, headers: Record<string, string>) => {
        called = true
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: '{}' })
      },
    })
    await openB4Screen(page, 'StockPolicyView')
    const root = page.locator(ROOT)

    await card(page, 'Hepsiburada').getByLabel('Tampon yüzdesi').fill('150')
    await card(page, 'Hepsiburada').getByLabel('Aşırı satış bekleme süresi').fill('on beş')
    await expect(card(page, 'Hepsiburada').getByText('0 ile 100 arasında bir değer girin.')).toBeVisible()
    await expect(card(page, 'Hepsiburada').getByText('Geçerli bir sayı girin.')).toBeVisible()
    await expect(root.getByText('Kaydetmeden önce 2 alan düzeltilmeli.').first()).toBeVisible()
    await root.getByRole('button', { name: 'Kaydet' }).click()
    await page.waitForTimeout(300)
    expect(called).toBe(false)

    await root.getByRole('button', { name: 'Vazgeç' }).click()
    await expect(card(page, 'Hepsiburada').getByLabel('Tampon yüzdesi')).toHaveValue('')
    await expect(root.getByRole('button', { name: 'Kaydet' })).toHaveCount(0)
  })

  test('hata: kaydetme 400 → sunucunun Türkçe doğrulama mesajı kanal adıyla gösterilir', async ({ page }) => {
    await mocks(page, {
      'IntegrationService/saveChannelStockPolicy': mockError(400, { error: 'Belirtilen pazaryeri bağlı değil.', service: 'IntegrationService', operation: 'saveChannelStockPolicy' }),
    })
    await openB4Screen(page, 'StockPolicyView')
    const root = page.locator(ROOT)

    await card(page, 'Hepsiburada').getByLabel('Tampon adet').fill('2')
    await root.getByRole('button', { name: 'Kaydet' }).click()
    await expect(root.getByRole('alert').filter({ hasText: 'Hepsiburada: Belirtilen pazaryeri bağlı değil.' })).toBeVisible()
  })

  test('menü: ekran kullanıcının menü ağacında YOKSA derin bağlantı panoya döner (olumsuz)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithB4(['AccountSecurityView']) })
    await page.goto(`/${B4_SCREENS.StockPolicyView.slug}`)
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 })
    await expect(page.locator(ROOT)).toHaveCount(0)
  })

  test('ekran görüntüsü tabanı (stok politikası)', async ({ page }) => {
    await mocks(page)
    await openB4Screen(page, 'StockPolicyView')
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('stock-policy.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA — 0 ihlal (ilk durum ve doğrulama hatası durumu)', async ({ page }) => {
    await mocks(page)
    await openB4Screen(page, 'StockPolicyView')
    const first = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(first.violations, JSON.stringify(first.violations, null, 2)).toEqual([])
  })
})
