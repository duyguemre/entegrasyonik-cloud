// ADR-0015 B5-3 — FinancialListView.vue (finans işlemleri). Protokol 13: bu spec önce DEĞİŞMEMİŞ
// ekrana karşı yazıldı, sonra görsel yenileme aynı spec ile doğrulandı. toHaveScreenshot KULLANILMAZ.
//
// NOT: masaüstü tablosu `$vuetify.display.mdAndUp`'a (>=960px) bağlı; `chromium-tablet` (800px)
// ve mobil KART görünümü render eder. Bu yüzden iddialar `getByText` ile (tablo hücresi/kart fark
// etmeksizin aynı metin) yazıldı; tabloya/karta ÖZGÜ etkileşimler yalnızca masaüstünde test edilir.
import { test, expect } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'

const ENDPOINT = 'FinancialService/getTransactionData'

const financialDoluFixture = {
  transactions: [
    {
      _id: 'fin-e2e-0001', externalId: 'TRX-E2E-0001', orderNumber: 'SIP-E2E-1001', integrationCode: 'TRENDYOL',
      platformType: 'Trendyol Sipariş', transactionType: 'SALE', credit: 1500, debt: 250, netAmount: 1250,
      commissionAmount: 200, commissionRate: 13, transactionDate: '2026-09-28T10:00:00.000Z',
      payoutDate: '2026-10-05T10:00:00.000Z', description: 'E2E satış hakedişi',
      meta: { vatAmount: '45.5', foo: 'bar' },
    },
    {
      _id: 'fin-e2e-0002', externalId: 'TRX-E2E-0002', orderNumber: null, integrationCode: 'HEPSIBURADA',
      platformType: 'Hepsiburada Kesinti', transactionType: 'DEDUCTION', credit: 0, debt: 300, netAmount: -300,
      transactionDate: '2026-09-27T10:00:00.000Z',
    },
    {
      _id: 'fin-e2e-0003', externalId: 'TRX-E2E-0003', orderNumber: 'SIP-E2E-1003', integrationCode: 'N11',
      platformType: 'N11 Özel', transactionType: 'UNKNOWN_TYPE', credit: 10, debt: 0, netAmount: 10,
      transactionDate: '2026-09-26T10:00:00.000Z',
    },
  ],
  totalNumberOfRecords: 45,
  summary: { totalCredit: 98765.4, totalDebt: 12345.6, netAmount: 86419.8, totalCargo: 777.5, transactionCount: 321 },
}

const financialBosFixture = {
  transactions: [], totalNumberOfRecords: 0,
  summary: { totalCredit: 0, totalDebt: 0, netAmount: 0, totalCargo: 0, transactionCount: 0 },
}

function withMenu(overrides: Record<string, any> = {}) {
  return { MenuService: menuFixtureWithAccountSupport, ...overrides }
}

/** İstek gövdelerini toplayan mock; her çağrıda `fixture` döner. */
function capturing(bodies: any[], fixture: any = financialDoluFixture) {
  return async (route: any, headers: any) => {
    bodies.push(route.request().postDataJSON?.())
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(fixture) })
  }
}

async function open(page: any, overrides: Record<string, any>) {
  await installApiMocks(page, withMenu(overrides))
  await gotoAuthed(page)
  await openScreen(page, 'FinancialListView')
}

test.describe('ADR-0015 B5-3 — FinancialListView (finans)', () => {
  test('smoke: arama alanı + işlem kayıtları + çevrilmiş tür rozetleri render olur', async ({ page }) => {
    await open(page, { [ENDPOINT]: financialDoluFixture })

    await expect(page.locator('.financialListView')).toBeVisible()
    await expect(page.getByLabel('İşlem No Ara (External ID)', { exact: true })).toBeVisible()
    await expect(page.getByText('SIP-E2E-1001')).toBeVisible()
    // Sipariş no'su olmayan satır: mobil kartta "İşlem No: <externalId>", masaüstünde "ID: <externalId>"
    await expect(page.getByText('TRX-E2E-0002')).toBeVisible()
    await expect(page.getByText('SIP-E2E-1003')).toBeVisible()
    await expect(page.getByText('SATIŞ', { exact: true })).toBeVisible()
    await expect(page.getByText('KESİNTİ', { exact: true })).toBeVisible()
    // Karakterizasyon: bilinmeyen tür çevrilmeden ham haliyle gösterilir (translations[type] || type).
    await expect(page.getByText('UNKNOWN_TYPE', { exact: true })).toBeVisible()
  })

  test('özet şeridi: res.summary değerleri tr-TR para biçimiyle gösterilir', async ({ page }) => {
    await open(page, { [ENDPOINT]: financialDoluFixture })

    await expect(page.getByText('98.765,40 ₺')).toBeVisible()
    await expect(page.getByText('12.345,60 ₺')).toBeVisible()
    await expect(page.getByText('86.419,80 ₺')).toBeVisible()
    await expect(page.getByText('321', { exact: true }).or(page.getByText('321 adet'))).toBeVisible()
  })

  test('özet şeridi etiketleri (masaüstü: Toplam Satış/Komisyon/Net Hakediş/Kargo/İşlem; mobil kısa etiketler)', async ({ page }, testInfo) => {
    await open(page, { [ENDPOINT]: financialDoluFixture })
    if (testInfo.project.name === 'chromium-desktop') {
      for (const l of ['Toplam Satış', 'Komisyon', 'Net Hakediş', 'Kargo', 'İşlem']) {
        await expect(page.locator('.financialListView').getByText(l, { exact: true })).toBeVisible()
      }
      await expect(page.getByText('777,50 ₺')).toBeVisible()
      await expect(page.getByText('321 adet')).toBeVisible()
    } else {
      for (const l of ['Satış', 'Komisyon', 'Net', 'İşlem']) {
        await expect(page.locator('.financialListView').getByText(l, { exact: true })).toBeVisible()
      }
      // Karakterizasyon: mobil özet şeridi Kargo toplamını GÖSTERMEZ.
      await expect(page.getByText('777,50')).toHaveCount(0)
    }
  })

  test('boş durum: "Finansal Kayıt Bulunamadı" gösterilir', async ({ page }) => {
    await open(page, { [ENDPOINT]: financialBosFixture })
    await expect(page.getByText('Finansal Kayıt Bulunamadı')).toBeVisible()
    await expect(page.getByText('Arama kriterlerinize uygun herhangi bir finansal işlem kaydı bulunamadı.')).toBeVisible()
  })

  // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: 500 artık boş duruma DÜŞMEZ; "Finansal işlemler yüklenemedi" + "Tekrar dene" gösterilir.
  test('hata durumu: 500 alındığında "Finansal işlemler yüklenemedi" + "Tekrar dene" gösterilir', async ({ page }) => {
    await open(page, { [ENDPOINT]: mockError(500) })
    await expect(page.getByText('Finansal işlemler yüklenemedi')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
  })

  test('ilk yükleme: istek gövdesi page/limit/sortBy + boş filtre alanlarını taşır', async ({ page }) => {
    const bodies: any[] = []
    await open(page, { [ENDPOINT]: capturing(bodies) })
    await expect(page.getByText('SIP-E2E-1001')).toBeVisible()

    expect(bodies.length).toBeGreaterThanOrEqual(1)
    expect(bodies[0]).toEqual({
      externalIdSearch: '', startDate: null, endDate: null, integrationCodes: [], transactionTypes: [],
      page: 1, limit: 20, sortBy: [{ key: 'transactionDate', order: 'desc' }],
    })
  })

  test('arama: Enter ile externalIdSearch + page=1/limit/sortBy sunucuya gönderilir', async ({ page }) => {
    const bodies: any[] = []
    await open(page, { [ENDPOINT]: capturing(bodies) })
    await expect(page.getByText('SIP-E2E-1001')).toBeVisible()

    const input = page.getByLabel('İşlem No Ara (External ID)', { exact: true })
    await input.fill('TRX-E2E-0002')
    await input.press('Enter')

    await expect.poll(() => bodies[bodies.length - 1]?.externalIdSearch).toBe('TRX-E2E-0002')
    const last = bodies[bodies.length - 1]
    expect(last.page).toBe(1)
    expect(last.limit).toBe(20)
    expect(last.sortBy).toEqual([{ key: 'transactionDate', order: 'desc' }])
  })

  test('yenile düğmesi: aynı parametrelerle yeniden istek atar', async ({ page }) => {
    const bodies: any[] = []
    await open(page, { [ENDPOINT]: capturing(bodies) })
    await expect(page.getByText('SIP-E2E-1001')).toBeVisible()
    const before = bodies.length

    await page.locator('.financialListView button:has(.mdi-refresh)').first().click()
    await expect.poll(() => bodies.length).toBeGreaterThan(before)
    expect(bodies[bodies.length - 1].page).toBe(1)
  })

  // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: filtre diyaloğu kalktı; sayfa içi panel (.ek-filter). "Temizle" artık yeniden sorgular.
  test('filtre paneli: tür seçilip "Sorgula" ile transactionTypes gönderilir; "Temizle" yeniden sorgular', async ({ page }) => {
    const bodies: any[] = []
    await open(page, { [ENDPOINT]: capturing(bodies) })
    const view = page.locator('.financialListView')
    await expect(page.getByText('SIP-E2E-1001')).toBeVisible()

    const panel = view.locator('.ek-filter')
    // Panel masaüstünde açık başlar, dar ekranda kapalı: kapalıysa başlıktan aç.
    if (!(await panel.locator('form').isVisible())) await view.getByRole('button', { name: /Filtreler/ }).click()
    await expect(panel).toBeVisible()

    await panel.locator('.v-select').filter({ hasText: 'İşlem Tipi' }).click()
    // Karakterizasyon (DÜZELTİLMEDİ): seçenekler çevrilmemiş ham kodlarla listelenir (SALE, RETURN...).
    await page.getByRole('option', { name: 'SALE', exact: true }).click()
    await page.keyboard.press('Escape')
    await panel.getByRole('button', { name: /Sorgula/ }).click()

    await expect.poll(() => bodies[bodies.length - 1]?.transactionTypes).toEqual(['SALE'])
    expect(bodies[bodies.length - 1].page).toBe(1)

    const countBeforeReset = bodies.length
    await panel.getByRole('button', { name: /Temizle/ }).click()
    await expect.poll(() => bodies.length).toBeGreaterThan(countBeforeReset)
    expect(bodies[bodies.length - 1].transactionTypes).toEqual([])
  })

  test('masaüstü sıralama: "Net etki" başlığı sortBy ile yeniden istek atar', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Sıralanabilir tablo başlıkları yalnızca masaüstü tablosunda (>=960px) var')
    const bodies: any[] = []
    await open(page, { [ENDPOINT]: capturing(bodies) })
    await expect(page.getByText('SIP-E2E-1001')).toBeVisible()

    await page.getByRole('columnheader', { name: /Net etki/ }).click()
    await expect.poll(() => bodies[bodies.length - 1]?.sortBy).toEqual([{ key: 'netAmount', order: 'asc' }])
    expect(bodies[bodies.length - 1].page).toBe(1)
  })

  // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: mobil sıralama seçicisi kaldırıldı (kolon başlığı sıralaması tüm genişliklerde).

  test('detay: göz ikonu işlem detayını açar (externalId, net hakediş, KDV meta, komisyon)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Detay yalnızca masaüstü tablosundaki göz düğmesiyle açılır; mobil kartta detay eylemi yok (Karakterizasyon: DÜZELTİLMEDİ)')
    await open(page, { [ENDPOINT]: financialDoluFixture })
    await expect(page.getByText('SIP-E2E-1001')).toBeVisible()

    await page.locator('.financialListView button:has(.mdi-eye)').first().click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'FİNANSAL İŞLEM DETAYI' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('TRX-E2E-0001')).toBeVisible()
    await expect(dialog.getByText('SIP-E2E-1001')).toBeVisible()
    await expect(dialog.getByText('NET HAKEDİŞ')).toBeVisible()
    await expect(dialog.getByText('1.250,00 ₺')).toBeVisible()
    await expect(dialog.getByText('1.500,00 ₺')).toBeVisible()
    // Komisyon 200 => "-200,00 ₺"; diğer kesinti = borç(250) - komisyon(200) = 50
    await expect(dialog.getByText('-200,00 ₺')).toBeVisible()
    await expect(dialog.getByText('50,00 ₺', { exact: true })).toBeVisible()
    // meta.vatAmount => KDV kesintisi
    await expect(dialog.getByText('-45,50 ₺')).toBeVisible()
    await expect(dialog.getByText('E2E satış hakedişi')).toBeVisible()
  })

  test('detay: siparişsiz + meta/açıklamasız işlemde "MANUEL İŞLEM" ve varsayılan açıklama gösterilir, KDV satırı YOK', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Detay yalnızca masaüstü tablosundaki göz düğmesiyle açılır')
    await open(page, { [ENDPOINT]: financialDoluFixture })
    await expect(page.getByText('TRX-E2E-0002')).toBeVisible()

    await page.locator('.financialListView tbody button:has(.mdi-eye)').nth(1).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'FİNANSAL İŞLEM DETAYI' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('MANUEL İŞLEM')).toBeVisible()
    await expect(dialog.getByText('Bu işlem için ek açıklama bulunmuyor.')).toBeVisible()
    await expect(dialog.getByText('KDV Kesintisi (Meta)')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'KAPAT' }).click()
    await expect(dialog).toBeHidden()
  })
})
