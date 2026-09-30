// ADR-0015 B4-P1c — N7 "Entegrasyon sağlığı" (YENİ ekran, Protokol 13 §5.6 / Karar 5.6: spec ekranla aynı commit'te).
// Sözleşme: docs/API_TENANT_SURFACE.md §3 — IntegrationService/getIntegrationHealth (admin, YALNIZCA OKUMA).
// Sentetik fixture (Protokol 7: PII yok). `B4P1C_REVIEW=1` ile inceleme görsellerini
// frontend/docs/design-system-review/ altına yazar (belge görseli; Playwright tabanı DEĞİLDİR).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError, type MockValue } from '../fixtures/mockApi'
import { AXE_TAGS, B4P1C_SCREENS, integrationHealthFixture, menuFixtureWithB4P1c, openB4P1cScreen } from '../fixtures/b4p1cScreens'
import { waitForShellReady } from '../fixtures/nav'

const ROOT = B4P1C_SCREENS.IntegrationHealthView.root
const OP = 'IntegrationService/getIntegrationHealth'

async function mocks(page: any, overrides: Record<string, MockValue> = {}) {
  await installApiMocks(page, { MenuService: menuFixtureWithB4P1c(), [OP]: integrationHealthFixture(), ...overrides })
}

const card = (page: any, name: string) => page.locator(`${ROOT} .ek-health-card`).filter({ has: page.getByRole('heading', { level: 3, name }) })

test.describe('ADR-0015 B4-P1c — N7 Entegrasyon sağlığı', () => {
  test('smoke: özet KPI, kartlar (sorunlu önce), durum çipleri, generatedAt', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await mocks(page)
    await openB4P1cScreen(page, 'IntegrationHealthView')
    const root = page.locator(ROOT)

    await expect(root.getByRole('heading', { level: 1, name: 'Entegrasyon sağlığı' })).toBeVisible()
    await expect(root.getByText(/Son güncelleme: 29\.09\.2026 \d{2}:\d{2}/)).toBeVisible()
    const kpis = root.getByRole('region', { name: 'Özet' })
    await expect(kpis.getByText('1 / 5')).toBeVisible()
    await expect(kpis.getByText('168', { exact: true })).toBeVisible() // 42 + 6 + 120
    await expect(kpis).toContainText('13 hata · başarı %92,3') // açıklama <480px'te görsel olarak gizli (metin DOM'da)

    const titles = root.locator('.ek-health-card h3')
    await expect(titles).toHaveText(['Hepsiburada', 'Trendyol', 'N11', 'Bizimhesap', 'Pazarama'])
    await expect(card(page, 'Hepsiburada').getByText('Erişilemiyor', { exact: true })).toBeVisible()
    await expect(card(page, 'Trendyol').getByText('Sorunlu', { exact: true })).toBeVisible()
    await expect(card(page, 'N11').getByText('Sağlıklı', { exact: true })).toBeVisible()
    await expect(card(page, 'Bizimhesap').getByText('Veri yok', { exact: true })).toBeVisible()
    await expect(card(page, 'Pazarama').getByText('Yapılandırılmadı', { exact: true })).toBeVisible()
    await expect(page).toHaveURL(/\/integrations\/health$/)
    expect(errors).toEqual([])
  })

  test('sözleşme yorumları: §3(a) hiç bağlanmadı, eski devre gözlemi, son hata kod+HTTP+işlem (ham mesaj yok)', async ({ page }) => {
    await mocks(page)
    await openB4P1cScreen(page, 'IntegrationHealthView')

    // §3 uyarı (a): credentialsConfigured:false iken tohumlanmış tarih "son başarılı senkron" DEĞİLDİR.
    const pazarama = card(page, 'Pazarama')
    await expect(pazarama.getByText('Hiç bağlanmadı')).toBeVisible()
    await expect(pazarama.getByText('Girilmedi')).toBeVisible()
    await expect(pazarama.getByText('Pasif', { exact: true })).toBeVisible()
    await expect(pazarama).not.toContainText('gün önce')

    // stale=true → "eski gözlem"
    await expect(card(page, 'Bizimhesap').getByText('eski gözlem')).toBeVisible()
    await expect(card(page, 'Bizimhesap').getByText('Çağrı yok')).toBeVisible()

    const hb = card(page, 'Hepsiburada')
    await expect(hb.getByText('Çağrılar geçici olarak durduruldu')).toBeVisible()
    await expect(hb.getByText('Servis erişilemez').first()).toBeVisible()
    await expect(hb.getByText('HTTP 503')).toBeVisible()
    await expect(hb.getByText('GET /orders')).toBeVisible()
    await expect(hb.getByRole('list', { name: 'Hata kodlarına göre' }).getByRole('listitem')).toHaveCount(3)
    await expect(hb.getByText('42 çağrı')).toBeVisible()

    await expect(card(page, 'Trendyol').getByText('HTTP 429')).toBeVisible()
    await expect(card(page, 'N11')).not.toContainText('Son hata')
  })

  test('boş durum: hiç entegrasyon yoksa yönlendirici boş durum + pazaryeri ayarına geçiş', async ({ page }) => {
    await mocks(page, { [OP]: integrationHealthFixture({ integrations: [] }) })
    await openB4P1cScreen(page, 'IntegrationHealthView')
    const root = page.locator(ROOT)
    await expect(root.getByText('Henüz entegrasyon yok')).toBeVisible()
    await expect(root.locator('.ek-health-card')).toHaveCount(0)
    await root.getByRole('button', { name: 'Pazaryeri bağla' }).click()
    await expect(page).toHaveURL(/\/integrations\/marketplace$/, { timeout: 10000 })
  })

  test('hata durumu: 500 → insan-okunur hata + Tekrar dene (ham hata yok); 403 → yetki mesajı', async ({ page }) => {
    let calls = 0
    await mocks(page, {
      [OP]: async (route: any, headers: Record<string, string>) => {
        calls += 1
        return calls === 1
          ? route.fulfill({ status: 500, contentType: 'application/json', headers, body: JSON.stringify({ error: 'MongoServerError: stack' }) })
          : route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(integrationHealthFixture()) })
      },
    })
    await openB4P1cScreen(page, 'IntegrationHealthView')
    const root = page.locator(ROOT)
    // Aşama 6b (Standart 1): hata deseni "ne oldu" ile "ne yapmalı"yı ayrı satırda gösterir — iddia aynı, metin bölündü.
    await expect(root.getByText('Entegrasyon sağlığı yüklenemedi', { exact: true })).toBeVisible()
    await expect(root.getByText('Bağlantınızı kontrol edip tekrar deneyin.', { exact: true }).first()).toBeVisible()
    await expect(root).not.toContainText('Mongo')
    await root.getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(root.locator('.ek-health-card')).toHaveCount(5)

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mocks(page, { [OP]: mockError(403, { error: 'Forbidden' }) })
    await openB4P1cScreen(page, 'IntegrationHealthView')
    await expect(page.locator(ROOT).getByText('Bu ekran için yetkiniz yok')).toBeVisible()
    await expect(page.locator(ROOT)).not.toContainText('Forbidden')
    await expect(page.locator(ROOT).getByRole('button', { name: 'Yenile' })).toHaveCount(0)
  })

  test('etkileşim: Yenile yeniden okur (gövde {}), veri kalır; kart oku ilgili ayar sekmesini açar', async ({ page }) => {
    // [DS-v2 A3, zamanlama sağlamlaştırması] Derin bağlantıda kabuk pano sekmesini de açabiliyor; pano
    // "Entegrasyon sağlığı" kartı aynı RPC'yi çağırır (yük altında ekrandan ÖNCE/SONRA). Bu yüzden yanıt
    // çağrı sırasına değil "Yenile'ye basıldı mı"ya bağlı ve sayım ekran açıldıktan sonraki farka göre.
    const bodies: any[] = []
    let refreshed = false
    await mocks(page, {
      [OP]: async (route: any, headers: Record<string, string>) => {
        bodies.push(route.request().postDataJSON())
        const data = refreshed
          ? integrationHealthFixture({ generatedAt: '2026-09-29T11:05:00.000Z' })
          : integrationHealthFixture()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(data) })
      },
    })
    await openB4P1cScreen(page, 'IntegrationHealthView')
    const root = page.locator(ROOT)
    const stamp = root.getByText(/Son güncelleme:/)
    await expect(stamp).toBeVisible()
    const before = await stamp.textContent()
    const n = bodies.length
    refreshed = true
    await root.getByRole('button', { name: 'Yenile' }).click()
    await expect.poll(() => bodies.length).toBe(n + 1)
    await expect(stamp).not.toHaveText(before ?? '')
    expect(bodies.every((b) => JSON.stringify(b) === '{}')).toBe(true)
    await expect(root.locator('.ek-health-card')).toHaveCount(5)

    await card(page, 'Bizimhesap').getByRole('button', { name: 'Bizimhesap ayarlarını aç' }).click()
    await expect(page).toHaveURL(/\/integrations\/erp$/, { timeout: 10000 })
  })

  test('rol (olumsuz): ekran menüde yoksa menüde görünmez ve derin bağlantı panoya döner', async ({ page }) => {
    // [DS-v2 A3, KASITLI] Pano artık "Entegrasyon sağlığı" kartı için aynı RPC'yi mount'ta BİR kez çağırıyor
    // (DashboardView; yetki backend'de — 403 → kart hiç gösterilmez). Olumsuz rol iddiası korunur: ekranın
    // KENDİ okuması hiç yapılmaz (toplam tek çağrı = panonunki), ekran kökü ve kalp ikonu (menü/kart) yok.
    let calls = 0
    await installApiMocks(page, {
      MenuService: menuFixtureWithB4P1c(['AuditLogView']),
      [OP]: async (route: any, headers: Record<string, string>) => {
        calls += 1
        return route.fulfill({ status: 403, contentType: 'application/json', headers, body: '{"error":"Forbidden"}' })
      },
    })
    await page.goto(`/${B4P1C_SCREENS.IntegrationHealthView.slug}`)
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20000 })
    await waitForShellReady(page)
    await expect.poll(() => calls).toBe(1)
    await expect(page.locator(ROOT)).toHaveCount(0)
    await expect(page.locator('.dash-health')).toHaveCount(0)
    await expect(page.locator(`.mdi-heart-pulse`)).toHaveCount(0)
    await page.waitForTimeout(500)
    expect(calls).toBe(1)
  })

  test('ekran görüntüsü tabanı (entegrasyon sağlığı)', async ({ page }) => {
    await mocks(page)
    await openB4P1cScreen(page, 'IntegrationHealthView')
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('integration-health.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA — 0 ihlal (dolu ve yetki durumu)', async ({ page }) => {
    await mocks(page)
    await openB4P1cScreen(page, 'IntegrationHealthView')
    const full = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(full.violations, JSON.stringify(full.violations, null, 2)).toEqual([])

    await page.unrouteAll({ behavior: 'ignoreErrors' })
    await mocks(page, { [OP]: mockError(403, { error: 'Forbidden' }) })
    await openB4P1cScreen(page, 'IntegrationHealthView')
    await expect(page.locator(ROOT).getByText('Bu ekran için yetkiniz yok')).toBeVisible()
    const denied = await new AxeBuilder({ page }).include(ROOT).withTags(AXE_TAGS).analyze()
    expect(denied.violations, JSON.stringify(denied.violations, null, 2)).toEqual([])
  })
})

test.describe('inceleme görselleri (N7)', () => {
  test.skip(!process.env.B4P1C_REVIEW, 'yalnızca B4P1C_REVIEW=1 ile')
  test('1440 ve 390 genişlikte', async ({ page }) => {
    test.setTimeout(90_000)
    const dir = 'docs/design-system-review'
    const vw = Number(process.env.B4P1C_REVIEW_WIDTH ?? 1440)
    await page.setViewportSize({ width: vw, height: vw >= 1440 ? 900 : 844 })
    await mocks(page)
    await openB4P1cScreen(page, 'IntegrationHealthView')
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${dir}/b4p1c-saglik-${vw}-ilk-ekran.png` })
    // Tam görünüm: sekme alanı kendi içinde kaydığından yüksek pencereyle çekilir (belge görseli).
    const h = await page.locator(ROOT).evaluate((el) => el.scrollHeight)
    await page.setViewportSize({ width: vw, height: Math.min(4000, h + 160) })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/b4p1c-saglik-${vw}-tam.png` })
  })
})
