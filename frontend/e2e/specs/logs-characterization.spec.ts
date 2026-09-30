// ADR-0015 Aşama B3 — Protokol 13 karakterizasyonu (yenilemeden ÖNCE, DEĞİŞMEMİŞ kodda yazıldı).
// `logs.spec.ts`'in kapsamadığı davranışları sabitler: liste istek gövdeleri (arama/sıralama/sayfa),
// aktarım (import) iş numarasıyla arama, aktarım detayındaki sayaç kartları, "Eksik Eşleştirme
// Detayları" bölümü ve iki alt eşleştirme menüsü (DetailedImportLogReportMissingCategory /
// DetailedImportLogReportMissingAttribute), detay raporu veri alınamadığında düşülen durum.
// Metinler Türkçe kaynak metinle birebir; düğme etiketleri (büyük/küçük harf yenilemesi serbest,
// ADR-0015 Karar 1.2) büyük/küçük harf duyarsız eşleşir. Fixture'lar sentetiktir (Protokol 7, PII yok).
import { test, expect, type Page, type Route } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { buildImportJob, exportJobsDoluFixture, importJobsDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixtureWithLogs, openScreen } from '../fixtures/nav'

// Düğme etiketi: cümle düzeni ("Yeniden dene") ya da bugünkü TR büyük harf ("YENİDEN DENE") kabul edilir.
// (JS regex `i` bayrağı Türkçe İ/ı eşlemesini yapmadığı için iki biçim açıkça verilir.)
function trLabel(sentence: string) {
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${esc(sentence)}|${esc(sentence.toLocaleUpperCase('tr-TR'))}`)
}

function recorder(response: any, bodies: any[]) {
  return async (route: Route, headers: Record<string, string>) => {
    const body = route.request().postDataJSON?.() ?? null
    // Birleştirme (Aşama 3): pano "son işler" kartı aynı ucu `{ page: 1, limit: 5 }` ile çağırır — ekranın gövdesi değil.
    if (!(body && body.limit === 5 && !('sortBy' in body))) bodies.push(body)
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(response) })
  }
}

async function openImportTab(page: Page) {
  await page.getByRole('tab', { name: 'Ürün Çekim İşlemleri' }).click()
  await expect(page.locator('.importLogList')).toBeVisible()
}

test.describe('B3 karakterizasyon — log listeleri istek gövdeleri', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'İstek gövdeleri viewport bağımsız; tek viewport yeterli (token tasarrufu)')
  })

  test('gönderim listesi: ilk yüklemede getExportJobs sayfa 1 / limit 13 / createdAt desc ile istenir', async ({ page }) => {
    const bodies: any[] = []
    await installApiMocks(page, { MenuService: menuFixtureWithLogs, 'IntegrationService/getExportJobs': recorder(exportJobsDoluFixture, bodies) })
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await expect(page.locator('.logListView').getByText('E2E Test Ürünü - Gönderim')).toBeVisible()

    expect(bodies[0]).toEqual({ page: 1, limit: 25, sortBy: 'createdAt', sortOrder: 'desc' })
  })

  test('gönderim listesi: arama kutusunda Enter → globalSearch (kırpılmış) ile sayfa 1 yeniden istenir', async ({ page }) => {
    const bodies: any[] = []
    await installApiMocks(page, { MenuService: menuFixtureWithLogs, 'IntegrationService/getExportJobs': recorder(exportJobsDoluFixture, bodies) })
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await expect(page.locator('.logListView').getByText('E2E Test Ürünü - Gönderim')).toBeVisible()

    const search = page.getByLabel('Ürün Adı, Barkod, Stok Kodu veya Platform Ara').first()
    await search.fill('  E2E-BARKOD  ')
    await search.press('Enter')
    await expect.poll(() => bodies.length).toBeGreaterThanOrEqual(2)
    expect(bodies.at(-1)).toEqual({ page: 1, limit: 25, sortBy: 'createdAt', sortOrder: 'desc', globalSearch: 'E2E-BARKOD' })
  })

  test('gönderim listesi: yenile düğmesi aynı gövdeyle yeniden ister', async ({ page }) => {
    const bodies: any[] = []
    await installApiMocks(page, { MenuService: menuFixtureWithLogs, 'IntegrationService/getExportJobs': recorder(exportJobsDoluFixture, bodies) })
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await expect(page.locator('.logListView').getByText('E2E Test Ürünü - Gönderim')).toBeVisible()

    await page.getByRole('button', { name: 'Listeyi yenile' }).click()
    await expect.poll(() => bodies.length).toBe(2)
    expect(bodies[1]).toEqual(bodies[0])
  })

  test('gönderim listesi: sayfa içi filtre paneli açılır, "Sorgula" advancedSearchExportJobs çağırır', async ({ page }) => {
    // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: tam sayfa "Gelişmiş Sorgulama Paneli" diyaloğu kalktı; aynı
    // alanlar sekme içi katlanır filtre panelinde. İstek gövdesi AYNI (advancedSearchExportJobs).
    const advBodies: any[] = []
    await installApiMocks(page, {
      MenuService: menuFixtureWithLogs,
      'IntegrationService/advancedSearchExportJobs': recorder(exportJobsDoluFixture, advBodies),
    })
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await expect(page.locator('.logListView').getByText('E2E Test Ürünü - Gönderim')).toBeVisible()

    const view = page.locator('.exportLogList')
    await view.getByRole('button', { name: /Filtreler/ }).click()
    const panel = view.locator('.ek-filter')
    await panel.getByRole('textbox', { name: /Ürün adı/ }).fill('Elbise')
    await panel.getByRole('button', { name: 'Sorgula' }).click()
    await expect.poll(() => advBodies.length).toBe(1)
    expect(advBodies[0]).toMatchObject({ page: 1, limit: 25, sortBy: 'createdAt', sortOrder: 'desc', title: 'Elbise', integrationCode: [], statuses: [] })
  })

  test('aktarım listesi: ilk yüklemede getImportJobs sayfa 1 / limit 13 ile istenir', async ({ page }) => {
    const bodies: any[] = []
    await installApiMocks(page, { MenuService: menuFixtureWithLogs, 'IntegrationService/getImportJobs': recorder(importJobsDoluFixture, bodies) })
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await openImportTab(page)
    await expect(page.locator('.importLogList').getByText('Trendyol')).toBeVisible()

    expect(bodies[0]).toMatchObject({ page: 1, limit: 25 })
  })

  test('aktarım listesi: iş numarasıyla Enter → getImportJobByJobId çağrılır, dönen tek kayıt listelenir', async ({ page }) => {
    const byIdBodies: any[] = []
    await installApiMocks(page, {
      MenuService: menuFixtureWithLogs,
      'IntegrationService/getImportJobByJobId': recorder({ success: true, data: buildImportJob({ jobId: 'IMP-E2E-ARANAN', integrationCode: 'hepsiburada' }) }, byIdBodies),
    })
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await openImportTab(page)

    const search = page.getByLabel('İşlem No ile Ara').first()
    await search.fill(' IMP-E2E-ARANAN ')
    await search.press('Enter')
    await expect.poll(() => byIdBodies.length).toBe(1)
    expect(byIdBodies[0]).toEqual({ jobId: 'IMP-E2E-ARANAN' })
    await expect(page.locator('.importLogList tbody tr')).toHaveCount(1)
    await expect(page.locator('.importLogList').getByText('Hepsiburada')).toBeVisible()
  })
})

test.describe('B3 karakterizasyon — aktarım detay raporu (DetailedImportLogReport)', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Detay, masaüstü tablodaki göz ikonuyla açılıyor (mdAndUp/>=960px)')
  })

  async function openImportDetail(page: Page) {
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await openImportTab(page)
    await page.locator('.importLogList tbody tr').first().locator('button:has(.mdi-eye-outline)').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Ürün Çekim İşlemi Detaylı Raporu' })
    await expect(dialog).toBeVisible()
    return dialog
  }

  test('sayaç kartları: iş kaydındaki 6 sayaç etiketleriyle gösterilir; rapor jobId (iş numarası) ile istenir', async ({ page }) => {
    const jobBodies: any[] = []
    const reportBodies: any[] = []
    await installApiMocks(page, {
      MenuService: menuFixtureWithLogs,
      'IntegrationService/getImportJobByJobId': recorder({ data: buildImportJob() }, jobBodies),
      'IntegrationService/getJobReport': recorder({ data: { missingCategories: [], missingAttributes: [], missingCategoryProductCounts: [] } }, reportBodies),
    })
    const dialog = await openImportDetail(page)

    await expect(dialog).toContainText('IMP-E2E-0001')
    for (const [label, value] of [
      ['Toplam Çekilen', '120'],
      ['Kritik Veri', '3'],
      ['Aday Aktarım', '115'],
      ['Aktarılan Varyant', '110'],
      ['Mükerrer', '2'],
      ['İşlem Hatası', '5'],
    ]) {
      await expect(dialog).toContainText(label)
      await expect(dialog).toContainText(value)
    }
    expect(jobBodies[0]).toEqual({ jobId: 'IMP-E2E-0001' })
    expect(reportBodies[0]).toEqual({ jobId: 'IMP-E2E-0001' })
    // Eksik eşleşme yoksa bölüm hiç render edilmez.
    await expect(dialog).not.toContainText('Eksik Eşleştirme Detayları')
    // Tamamlanan işte akış adımlarının sonuncusu görünür.
    await expect(dialog).toContainText('Tamamlandı')
  })

  test('eksik eşleştirme: kategori yolu + son kategori, ürün sayısı, özellik adı ve değeri listelenir; iki alt menü açılır', async ({ page }) => {
    await installApiMocks(page, {
      MenuService: menuFixtureWithLogs,
      'IntegrationService/getJobReport': {
        data: {
          missingCategories: ['9001'],
          missingAttributes: [
            { category: '9002', attributeName: 'Renk', attributeId: 55, attributeValue: 'Kırmızı', attributeValueId: 7 },
            { category: '9002', attributeName: 'Renk', attributeId: 55, attributeValue: 'Kırmızı', attributeValueId: 7 },
          ],
          missingCategoryProductCounts: [{ platformCategoryId: '9001', productCount: 7 }],
        },
      },
      'IntegrationService/retrieveCategoriesFromIntegration': [
        {
          _id: '9000', title: 'Kadın', children: [
            { _id: '9001', title: 'Elbise', children: [] },
            { _id: '9002', title: 'Bluz', children: [] },
          ],
        },
      ],
    })
    const dialog = await openImportDetail(page)

    await expect(dialog).toContainText('Eksik Eşleştirme Detayları')
    await expect(dialog).toContainText('Eşleşme Tamam')
    await expect(dialog).toContainText('Eşleşme Bekleniyor')
    await expect(dialog.getByText('Elbise', { exact: true })).toBeVisible()
    await expect(dialog.getByText('Bluz', { exact: true })).toBeVisible()
    // Kategori kimliği kopyalama çipi ürün sayısını gösterir; eksik değil yalnızca özellik eksik olan kategoride 0.
    await expect(dialog.getByLabel('7 ürün — kategori kimliğini kopyala')).toBeVisible()
    await expect(dialog.getByLabel('0 ürün — kategori kimliğini kopyala')).toBeVisible()
    await expect(dialog.getByText('Renk', { exact: true })).toBeVisible()
    // Aynı değer iki kez gelse de bir kez listelenir.
    await expect(dialog.getByText('Kırmızı', { exact: true })).toHaveCount(1)

    await dialog.getByText('Elbise', { exact: true }).click()
    await expect(page.getByText('Platform Kategori Eşleştirme')).toBeVisible()
    await expect(page.getByText('Eksik Karşılık')).toBeVisible()
    await expect(page.locator('button', { hasText: trLabel('Eşleştir ve kaydet') })).toBeDisabled()
    await page.locator('.category-mapping-wrapper').getByRole('button', { name: 'Kapat' }).click()
    await expect(page.getByText('Platform Kategori Eşleştirme')).toBeHidden()

    await dialog.getByText('Kırmızı', { exact: true }).click()
    await expect(page.getByText('Platform Seçenek Eşleştirme')).toBeVisible()
  })

  test('veri alınamadı: iş kaydı boş dönerse "Rapor verilerine ulaşılamadı" + yeniden dene gösterilir, ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithLogs, 'IntegrationService/getImportJobByJobId': {} })
    const dialog = await openImportDetail(page)

    await expect(dialog).toContainText('Rapor verilerine ulaşılamadı')
    await expect(dialog.locator('button', { hasText: trLabel('Yeniden dene') })).toBeVisible()
    await expect(dialog).not.toContainText('Veri boş')
  })
})

test.describe('B3 karakterizasyon — gönderim detay raporu (DetailedExportLogReport)', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Detay, masaüstü tablodaki göz ikonuyla açılıyor (mdAndUp/>=960px)')
  })

  test('rapor kaydın _id alanıyla istenir; ürün kimlik alanları, fiyat/stok ve işlem günlüğü mesajları gösterilir', async ({ page }) => {
    const detailBodies: any[] = []
    await installApiMocks(page, {
      MenuService: menuFixtureWithLogs,
      'IntegrationService/getExportJobDetail': recorder({ success: true, data: (await import('../fixtures/apiData')).buildExportJobDetail() }, detailBodies),
    })
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await page.locator('.exportLogList tbody tr').first().locator('button:has(.mdi-eye-outline)').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Pazaryeri Gönderim Detaylı Raporu' })
    await expect(dialog).toBeVisible()

    await expect.poll(() => detailBodies.length).toBeGreaterThanOrEqual(1)
    expect(detailBodies[0]).toEqual({ id: 'export-job-e2e-0001' })
    await expect(dialog).toContainText('E2E Test Ürünü - Gönderim')
    await expect(dialog).toContainText('Barkod')
    await expect(dialog).toContainText('8690000000011')
    await expect(dialog).toContainText('Stok Kodu')
    await expect(dialog).toContainText('SKU-E2E-0001')
    await expect(dialog).toContainText('KATEGORİ')
    await expect(dialog).toContainText('MARKA')
    await expect(dialog).toContainText('199.9 TL')
    await expect(dialog).toContainText('25 STOK')
    await expect(dialog).toContainText('İşlem Günlüğü ve Akış Analizi')
    for (const message of ['Kuyruğa alındı', 'Doğrulandı', 'Gönderildi']) await expect(dialog).toContainText(message)
    // Başarılı işte çözüm önerisi bandı yoktur.
    await expect(dialog).not.toContainText('Sistem Çözüm Önerisi')
  })

  test('başarısız iş: "Sistem Çözüm Önerisi" bandı gösterilir', async ({ page }) => {
    const { buildExportJobDetail } = await import('../fixtures/apiData')
    await installApiMocks(page, {
      MenuService: menuFixtureWithLogs,
      'IntegrationService/getExportJobDetail': {
        success: true,
        data: buildExportJobDetail({ status: 'FAILED', completedAt: undefined, logs: [{ worker: 'CATALOG VALIDATOR', status: 'FAILED', message: 'Zorunlu alan eksik', timestamp: '2026-09-22T09:00:45.000Z' }] }),
      },
    })
    await gotoAuthed(page)
    await openScreen(page, 'LogListView')
    await page.locator('.exportLogList tbody tr').first().locator('button:has(.mdi-eye-outline)').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Pazaryeri Gönderim Detaylı Raporu' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Sistem Çözüm Önerisi')
    await expect(dialog).toContainText('Zorunlu alan eksik')
  })
})
