// ADR-0015 Aşama B3 — Protokol 13 karakterizasyonu (yenilemeden ÖNCE, DEĞİŞMEMİŞ kodda yazıldı).
// `admin-clients.spec.ts` / `admin-tickets.spec.ts`'in kapsamadığı davranışları sabitler:
// mağaza listesi istek gövdeleri (ilk yükleme/arama/yenile), özet çubuğu sayaçları, durum etiketleri,
// yeni mağaza oluşturma diyaloğunun doğrulama + istek gövdesi, mağaza detay analizindeki istatistik
// kartlarının (ClientStatsCard) değerleri ve detay isteklerinin gövdeleri.
// Düğme etiketleri (büyük/küçük harf yenilemesi serbest, ADR-0015 Karar 1.2) iki biçimle eşleşir.
// Fixture'lar sentetiktir (Protokol 7, PII yok).
import { test, expect, type Route } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { adminClientsDoluFixture, adminClientStatsFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixtureWithAdmin, openScreen } from '../fixtures/nav'

function trLabel(sentence: string) {
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${esc(sentence)}|${esc(sentence.toLocaleUpperCase('tr-TR'))}`)
}

function recorder(response: any, bodies: any[]) {
  return async (route: Route, headers: Record<string, string>) => {
    bodies.push(route.request().postDataJSON?.() ?? null)
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(response) })
  }
}

test.describe('B3 karakterizasyon — Mağaza Yönetimi (AdminClientListView)', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Davranış viewport bağımsız; tek viewport yeterli (token tasarrufu)')
  })

  test('ilk yükleme: getClients arama boş / sayfa 1 / limit 10 / order artan ile istenir; özet sayaçları ve durum etiketleri', async ({ page }) => {
    const bodies: any[] = []
    await installApiMocks(page, { MenuService: menuFixtureWithAdmin, 'AdminService/getClients': recorder(adminClientsDoluFixture, bodies) })
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')
    await expect(page.getByText('E2E Örnek Mağaza', { exact: true })).toBeVisible()

    // DS-v2 Aşama 2: `v-data-table-server` kalktı; eskiden onun yazdığı limit 10, ekranın varsayılanı
    // yapılarak sunucuya giden gövde AYNI tutuldu.
    expect(bodies[0]).toEqual({ search: '', page: 1, limit: 10, sortField: 'order', sortOrder: 1 })
    const view = page.locator('.adminClientListView')
    await expect(view).toContainText('Toplam Mağaza')
    await expect(view).toContainText('Aktif Mağaza')
    await expect(view).toContainText('Pasif')
    await expect(view).toContainText('ID: 1001')
    await expect(view).toContainText('E2E Örnek Ticaret A.Ş.')
    await expect(view.getByText('Aktif', { exact: true })).toBeVisible()
    await expect(view.getByText('Pasif', { exact: true })).toBeVisible()
  })

  test('arama: Enter ve büyüteç düğmesi getClients\'i arama metniyle yeniden ister; yenile aynı gövdeyi gönderir', async ({ page }) => {
    const bodies: any[] = []
    await installApiMocks(page, { MenuService: menuFixtureWithAdmin, 'AdminService/getClients': recorder(adminClientsDoluFixture, bodies) })
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')
    await expect(page.getByText('E2E Örnek Mağaza', { exact: true })).toBeVisible()
    const initial = bodies.length

    const search = page.getByLabel('Müşteri / Mağaza Ara').first()
    await search.fill('Pasif')
    await search.press('Enter')
    await expect.poll(() => bodies.length).toBe(initial + 1)
    expect(bodies.at(-1)).toMatchObject({ search: 'Pasif', page: 1, sortField: 'order', sortOrder: 1 })

    // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: büyüteç düğmesi kalktı (arama yalnız Enter ile).
    await page.getByRole('button', { name: 'Listeyi yenile' }).click()
    await expect.poll(() => bodies.length).toBe(initial + 2)
    expect(bodies.at(-1)).toEqual(bodies.at(-2))
  })

  test('yeni mağaza: zorunlu alanlar boşken istek atılmaz ve uyarı verilir; doluyken createClient gövdesi gönderilir, liste yenilenir', async ({ page }) => {
    const createBodies: any[] = []
    const listBodies: any[] = []
    await installApiMocks(page, {
      MenuService: menuFixtureWithAdmin,
      'AdminService/getClients': recorder(adminClientsDoluFixture, listBodies),
      'AdminService/createClient': recorder({ success: true }, createBodies),
    })
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')
    await expect(page.getByText('E2E Örnek Mağaza', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Yeni mağaza oluştur' }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Yeni Mağaza Oluştur' })
    await expect(dialog).toBeVisible()
    for (const label of ['Mağaza Adı', 'Mağaza Başlığı', 'Ad Soyad', 'E-Posta Adresi', 'Giriş Şifresi']) {
      await expect(dialog.getByLabel(label)).toBeVisible()
    }

    const submit = dialog.locator('button', { hasText: trLabel('Mağaza oluştur') })
    await submit.click()
    await expect(page.getByText('Lütfen gerekli tüm alanları doldurunuz.')).toBeVisible()
    expect(createBodies).toHaveLength(0)

    const listBefore = listBodies.length
    await dialog.getByLabel('Mağaza Adı').fill('E2E Yeni Mağaza')
    await dialog.getByLabel('Mağaza Başlığı').fill('E2E Yeni Ticaret')
    await dialog.getByLabel('Ad Soyad').fill('E2E Yönetici')
    await dialog.getByLabel('E-Posta Adresi').fill('yonetici@e2e.invalid')
    await dialog.getByLabel('Giriş Şifresi').fill('E2e-Sifre-123')
    await submit.click()

    await expect.poll(() => createBodies.length).toBe(1)
    expect(createBodies[0]).toEqual({
      clientData: { name: 'E2E Yeni Mağaza', title: 'E2E Yeni Ticaret' },
      userData: { fullName: 'E2E Yönetici', email: 'yonetici@e2e.invalid', password: 'E2e-Sifre-123' },
    })
    await expect(page.getByText('Yeni mağaza başarıyla oluşturuldu.')).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect.poll(() => listBodies.length).toBeGreaterThan(listBefore)
  })

  test('detay analizi: istatistik kartları değerleri, entegrasyonlar ve detay isteklerinin gövdeleri', async ({ page }) => {
    const statsBodies: any[] = []
    const integrationBodies: any[] = []
    await installApiMocks(page, {
      MenuService: menuFixtureWithAdmin,
      'AdminService/getClientStats': recorder(adminClientStatsFixture, statsBodies),
      'AdminService/getClientIntegrations': recorder({
        success: true,
        integrations: [
          { _id: 'cint-e2e-1', integrationCode: 'trendyol', title: 'Trendyol Mağazası', isActive: true },
          { _id: 'cint-e2e-2', integrationCode: 'hepsiburada', title: '', isActive: true },
        ],
      }, integrationBodies),
    })
    await gotoAuthed(page)
    await openScreen(page, 'AdminClientListView')
    await page.locator('.adminClientListView tbody tr').first().locator('button:has(.mdi-eye-outline)').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Mağaza Detay Analizi' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Aktif Entegrasyonlar')).toBeVisible()

    await expect.poll(() => statsBodies.length).toBeGreaterThanOrEqual(1)
    await expect.poll(() => integrationBodies.length).toBeGreaterThanOrEqual(1)
    // Detay istekleri mağazayı sıra numarasıyla (order) hedefler.
    expect(JSON.stringify(statsBodies[0])).toContain('1001')
    expect(JSON.stringify(integrationBodies[0])).toContain('1001')

    for (const label of ['Toplam Ürün']) await expect(dialog).toContainText(label)
    for (const value of ['1.250', '3.400', '820', '41']) await expect(dialog).toContainText(value)
    await expect(dialog).toContainText('Trendyol Mağazası')
  })
})
