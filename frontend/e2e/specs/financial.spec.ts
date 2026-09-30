// ADR-0015 B5-3 — FinancialListView.vue (finans işlemleri). Protokol 13: bu spec önce DEĞİŞMEMİŞ
// ekrana karşı yazıldı, sonra görsel yenileme aynı spec ile doğrulandı. toHaveScreenshot KULLANILMAZ.
//
// NOT: masaüstü tablosu `$vuetify.display.mdAndUp`'a (>=960px) bağlı; `chromium-tablet` (800px)
// ve mobil KART görünümü render eder. Bu yüzden iddialar `getByText` ile (tablo hücresi/kart fark
// etmeksizin aynı metin) yazıldı; tabloya/karta ÖZGÜ etkileşimler yalnızca masaüstünde test edilir.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen, waitForWorkplaceReady } from '../fixtures/nav'

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
    // Aşama 3: tür çipleri cümle düzeninde (tüm listelerle aynı çip dili; eskiden 'SATIŞ'/'KESİNTİ').
    await expect(page.locator('.financialListView tbody').getByText('Satış', { exact: true }).first()).toBeVisible()
    await expect(page.locator('.financialListView tbody').getByText('Kesinti', { exact: true })).toBeVisible()
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
        await expect(page.locator('.financialListView .ek-fin-summary').getByText(l, { exact: true })).toBeVisible()
      }
      await expect(page.getByText('777,50 ₺')).toBeVisible()
      await expect(page.getByText('321 adet')).toBeVisible()
    } else {
      for (const l of ['Satış', 'Komisyon', 'Net', 'İşlem']) {
        await expect(page.locator('.financialListView .ek-fin-summary').getByText(l, { exact: true })).toBeVisible()
      }
      // Karakterizasyon: mobil özet şeridi Kargo toplamını GÖSTERMEZ.
      await expect(page.getByText('777,50')).toHaveCount(0)
    }
  })

  test('boş durum: "Finansal kayıt bulunamadı" gösterilir', async ({ page }) => {
    await open(page, { [ENDPOINT]: financialBosFixture })
    await expect(page.getByText('Finansal kayıt bulunamadı')).toBeVisible()
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
      page: 1, limit: 25, sortBy: [{ key: 'transactionDate', order: 'desc' }],
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
    expect(last.limit).toBe(25)
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
    const dialog = page.getByRole('dialog').filter({ hasText: 'Finansal işlem detayı' })
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
    const dialog = page.getByRole('dialog').filter({ hasText: 'Finansal işlem detayı' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('MANUEL İŞLEM')).toBeVisible()
    await expect(dialog.getByText('Bu işlem için ek açıklama bulunmuyor.')).toBeVisible()
    await expect(dialog.getByText('KDV Kesintisi (Meta)')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'KAPAT' }).click()
    await expect(dialog).toBeHidden()
  })
})

// ---------------------------------------------------------------------------------------------------
// C1.4 — Finans sekmeleri: Özet · Kargo faturaları · Ödeme dökümü (İşlemler sekmesi = yukarıdaki iddialar).
// Sözleşme: FinancialService/getFinancialSummary · getCargoInvoices · getPayoutDetails (+ ödeme emri listesi
// için getTransactionData { transactionTypes:['PAYOUT'] }). Kanal kodları backend'deki gibi küçük harf.
// İnceleme görselleri: FINANCE_REVIEW_CAPTURE=1 FINANCE_REVIEW_WIDTH=1440|390 (docs/design-system-review/w1-finance-*).
// ---------------------------------------------------------------------------------------------------
const SUMMARY_ENDPOINT = 'FinancialService/getFinancialSummary'
const CARGO_ENDPOINT = 'FinancialService/getCargoInvoices'
const PAYOUT_DETAIL_ENDPOINT = 'FinancialService/getPayoutDetails'

const ZERO_SUMMARY = { totalCredit: 0, totalDebt: 0, totalCargo: 0, netAmount: 0, transactionCount: 0 }
/** Kanal başına sunucu toplamları (kanal filtresi yoksa dönem toplamı = trendyol + hepsiburada). */
const SUMMARY_BY_CHANNEL: Record<string, any> = {
  '': { totalCredit: 184250.4, totalDebt: 31280.15, totalCargo: 0, netAmount: 152970.25, transactionCount: 1284 },
  trendyol: { totalCredit: 142300.1, totalDebt: 24150.6, totalCargo: 0, netAmount: 118149.5, transactionCount: 962 },
  hepsiburada: { totalCredit: 41950.3, totalDebt: 7129.55, totalCargo: 0, netAmount: 34820.75, transactionCount: 322 },
}

function summaryMock(bodies: any[] = [], byChannel: Record<string, any> = SUMMARY_BY_CHANNEL) {
  return async (route: any, headers: any) => {
    const body = route.request().postDataJSON?.() ?? {}
    bodies.push(body)
    const key = (body.integrationCodes ?? []).join(',')
    const data = byChannel[key] ?? ZERO_SUMMARY
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(data) })
  }
}

const CARGO_ROWS = Array.from({ length: 12 }, (_, i) => ({
  _id: `cargo-e2e-${i}`,
  integrationCode: i % 4 === 3 ? 'pazarama' : 'trendyol',
  invoiceNumber: `KF-2026-${String(81450 + i)}`,
  orderNumber: `SIP-${String(6021400 + i * 7)}`,
  packageId: `PK-${String(99120300 + i * 13)}`,
  shipmentType: i % 5 === 2 ? 'RETURN' : 'FORWARD',
  desi: [1, 2, 3, 5, 1.5, 8][i % 6],
  amount: [42.9, 58.4, 71.25, 96.8, 49.9, 134.6][i % 6],
  transactionDate: new Date(Date.UTC(2026, 8, 28 - i, 9, 30)).toISOString(),
}))

function cargoMock(bodies: any[] = [], rows: any[] = CARGO_ROWS) {
  return async (route: any, headers: any) => {
    const body = route.request().postDataJSON?.() ?? {}
    bodies.push(body)
    const unsupported = ['hepsiburada', 'n11'].includes(body.integrationCode)
    const data = unsupported ? [] : rows.filter((r) => !body.integrationCode || r.integrationCode === body.integrationCode)
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(data) })
  }
}

const PAYOUT_ROWS = [
  { _id: 'po-1', externalId: 'PAY-TY-90012', paymentOrderId: '4829301', integrationCode: 'trendyol', transactionType: 'PAYOUT', platformType: 'PaymentOrder', credit: 0, debt: 0, netAmount: 38420.75, transactionDate: '2026-09-25T09:00:00.000Z', description: 'Haftalık hakediş ödemesi' },
  { _id: 'po-2', externalId: 'PAY-TY-90011', paymentOrderId: '4817744', integrationCode: 'trendyol', transactionType: 'PAYOUT', platformType: 'PaymentOrder', credit: 0, debt: 0, netAmount: 29115.4, transactionDate: '2026-09-18T09:00:00.000Z', payoutDate: '2026-09-19T09:00:00.000Z', description: 'Haftalık hakediş ödemesi' },
  { _id: 'po-3', externalId: 'PAY-PZ-3310', paymentOrderId: null, integrationCode: 'pazarama', transactionType: 'PAYOUT', platformType: 'Transfer', credit: 0, debt: 0, netAmount: 6120, transactionDate: '2026-09-15T09:00:00.000Z' },
  { _id: 'po-4', externalId: 'PAY-TY-90010', paymentOrderId: '4806120', integrationCode: 'trendyol', transactionType: 'PAYOUT', platformType: 'PaymentOrder', credit: 0, debt: 0, netAmount: 33870.1, transactionDate: '2026-09-11T09:00:00.000Z', description: 'Haftalık hakediş ödemesi' },
]

const PAYOUT_ITEMS = [
  { _id: 'pi-1', externalId: 'TRX-771201', integrationCode: 'trendyol', transactionType: 'SALE', platformType: 'Sale', orderNumber: 'SIP-6021400', credit: 1499.9, debt: 194.99, netAmount: 1304.91, transactionDate: '2026-09-16T11:20:00.000Z', paymentOrderId: '4829301' },
  { _id: 'pi-2', externalId: 'TRX-771245', integrationCode: 'trendyol', transactionType: 'RETURN', platformType: 'Return', orderNumber: 'SIP-6021407', credit: 0, debt: 349.5, netAmount: -349.5, transactionDate: '2026-09-17T15:05:00.000Z', paymentOrderId: '4829301' },
  { _id: 'pi-3', externalId: 'TRX-771302', integrationCode: 'trendyol', transactionType: 'DEDUCTION', platformType: 'DeductionInvoices', orderNumber: null, credit: 0, debt: 86.4, netAmount: -86.4, transactionDate: '2026-09-18T08:00:00.000Z', paymentOrderId: '4829301' },
]

/** getTransactionData: PAYOUT isteği → ödeme emirleri; diğerleri → İşlemler fixture'ı. */
function transactionsMock(bodies: any[] = [], payouts: any[] = PAYOUT_ROWS) {
  return async (route: any, headers: any) => {
    const body = route.request().postDataJSON?.() ?? {}
    const isPayout = Array.isArray(body.transactionTypes) && body.transactionTypes.join() === 'PAYOUT'
    if (isPayout) bodies.push(body)
    const data = isPayout ? { transactions: payouts, totalNumberOfRecords: payouts.length, summary: ZERO_SUMMARY } : financialDoluFixture
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(data) })
  }
}

function payoutDetailMock(bodies: any[] = [], items: any[] = PAYOUT_ITEMS) {
  return async (route: any, headers: any) => {
    const body = route.request().postDataJSON?.() ?? {}
    bodies.push(body)
    const data = body.paymentOrderId === '4829301' ? items : []
    return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(data) })
  }
}

function financeRoutes(overrides: Record<string, any> = {}) {
  return {
    [ENDPOINT]: transactionsMock(),
    [SUMMARY_ENDPOINT]: summaryMock(),
    [CARGO_ENDPOINT]: cargoMock(),
    [PAYOUT_DETAIL_ENDPOINT]: payoutDetailMock(),
    ...overrides,
  }
}

async function openTab(page: any, overrides: Record<string, any>, tab: 'Özet' | 'Kargo faturaları' | 'Ödeme dökümü') {
  await open(page, financeRoutes(overrides))
  await page.locator('.financialListView').getByRole('tab', { name: tab }).click()
}

async function openPanel(view: any) {
  const panel = view.locator('.ek-fin-panel-slot:not([style*="display: none"]) .ek-filter')
  if (!(await panel.locator('form').isVisible())) await panel.getByRole('button', { name: /Filtreler/ }).click()
  return panel
}

test.describe('C1.4 — Finans sekmeleri', () => {
  test('sekmeler: dört sekme listelenir; sekme seçimi URL ?tab= parametresine yazılır', async ({ page }) => {
    await open(page, financeRoutes())
    const view = page.locator('.financialListView')
    await expect(view.getByRole('heading', { name: 'Finans', level: 1 })).toBeVisible()
    for (const name of ['İşlemler', 'Özet', 'Kargo faturaları', 'Ödeme dökümü']) {
      await expect(view.getByRole('tab', { name })).toBeVisible()
    }
    await expect(view.getByRole('tab', { name: 'İşlemler' })).toHaveAttribute('aria-selected', 'true')

    await view.getByRole('tab', { name: 'Kargo faturaları' }).click()
    await expect(page).toHaveURL(/\/finance\?tab=cargo-invoices$/)
    await view.getByRole('tab', { name: 'İşlemler' }).click()
    await expect(page).toHaveURL(/\/finance\?tab=transactions$/)
    // İşlemler içeriği sekme dönüşünde korunur (yeniden mount edilmez).
    await expect(page.getByText('SIP-E2E-1001')).toBeVisible()
  })

  test('derin bağlantı: /finance?tab=payouts ödeme dökümü sekmesini açar; işlemler isteği atılmaz', async ({ page }) => {
    const payoutBodies: any[] = []
    let transactionCalls = 0
    const tx = transactionsMock(payoutBodies)
    await installApiMocks(page, withMenu(financeRoutes({
      [ENDPOINT]: async (route: any, headers: any) => {
        const body = route.request().postDataJSON?.() ?? {}
        if (!(body.transactionTypes ?? []).includes('PAYOUT')) transactionCalls++
        return tx(route, headers)
      },
    })))
    await page.goto('/finance?tab=payouts')
    await waitForWorkplaceReady(page)
    const view = page.locator('.financialListView')
    await expect(view.getByRole('tab', { name: 'Ödeme dökümü' })).toHaveAttribute('aria-selected', 'true')
    await expect(view.getByText('4829301')).toBeVisible()
    expect(transactionCalls).toBe(0)
  })

  // ---- Özet ----
  test('özet: KPI satırı yalnız backend alanlarını tr-TR para biçimiyle gösterir + kanal kırılımı', async ({ page }) => {
    await openTab(page, {}, 'Özet')
    const view = page.locator('.financialListView')
    const kpis = view.getByRole('region', { name: 'Dönem özeti' })
    await expect(kpis.getByText('₺184.250,40')).toBeVisible()
    await expect(kpis.getByText('₺31.280,15')).toBeVisible()
    await expect(kpis.getByText('₺152.970,25')).toBeVisible()
    await expect(kpis.getByText('1.284', { exact: true })).toBeVisible()
    // totalCargo şemada olmayan alanın toplamı → KPI olarak GÖSTERİLMEZ.
    await expect(kpis.getByText('Kargo', { exact: true })).toHaveCount(0)

    const grid = view.getByRole('table', { name: 'Kanal kırılımı' })
    await expect(grid.getByText('₺118.149,50')).toBeVisible()
    await expect(grid.getByText('₺34.820,75')).toBeVisible()
    // Kaydı olmayan kanal: "Kayıt yok" + "—" (₺0,00 DEĞİL).
    const ideasoft = grid.getByRole('row').filter({ hasText: 'Ideasoft' })
    await expect(ideasoft.getByText('Kayıt yok')).toBeVisible()
    await expect(ideasoft).not.toContainText('₺0,00')
  })

  test('özet: kanal filtresi + Sorgula → integrationCodes gövdesi; kırılım yalnız seçili kanal', async ({ page }) => {
    const bodies: any[] = []
    await openTab(page, { [SUMMARY_ENDPOINT]: summaryMock(bodies) }, 'Özet')
    const view = page.locator('.financialListView')
    await expect(view.getByText('₺184.250,40')).toBeVisible()
    // İlk yükleme: dönem toplamı filtresiz (boş alanlar gövdeye girmez).
    expect(bodies[0]).toEqual({})

    const panel = await openPanel(view)
    await panel.locator('.v-select').filter({ hasText: 'Kanallar' }).click()
    await page.getByRole('option', { name: 'Trendyol' }).click()
    await page.keyboard.press('Escape')
    const before = bodies.length
    await panel.getByRole('button', { name: /Sorgula/ }).click()

    await expect.poll(() => bodies.length).toBeGreaterThan(before)
    expect(bodies.slice(before)).toContainEqual({ integrationCodes: ['trendyol'] })
    await expect(view.getByRole('region', { name: 'Dönem özeti' }).getByText('₺142.300,10')).toBeVisible()
    await expect(view.getByRole('table', { name: 'Kanal kırılımı' }).getByRole('row')).toHaveCount(2)
  })

  test('özet boş: kayıt yoksa "Bu dönemde finansal kayıt yok" — ₺0,00 KPI gösterilmez', async ({ page }) => {
    await openTab(page, { [SUMMARY_ENDPOINT]: summaryMock([], {}) }, 'Özet')
    const view = page.locator('.financialListView')
    await expect(view.getByText('Bu dönemde finansal kayıt yok')).toBeVisible()
    await expect(view.getByRole('region', { name: 'Dönem özeti' })).not.toContainText('₺0,00')
  })

  test('özet hata: 500 → sabit hata metni + Tekrar dene (ham hata sızmaz)', async ({ page }) => {
    await openTab(page, { [SUMMARY_ENDPOINT]: mockError(500) }, 'Özet')
    const kpis = page.locator('.financialListView').getByRole('region', { name: 'Dönem özeti' })
    await expect(kpis.getByText('Finansal özet yüklenemedi — Bağlantınızı kontrol edip yeniden deneyin.')).toBeVisible()
    await expect(kpis.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(kpis).not.toContainText('E2E sentetik hata')
    await expect(kpis).not.toContainText('500')
  })

  test('özet yetki: 403 → "yetkiniz yok" durumu', async ({ page }) => {
    await openTab(page, { [SUMMARY_ENDPOINT]: mockError(403, { message: 'Forbidden' }) }, 'Özet')
    const kpis = page.locator('.financialListView').getByRole('region', { name: 'Dönem özeti' })
    await expect(kpis.getByText(/Finansal özet görüntülenemiyor — Bu görünüm için yetkiniz yok/)).toBeVisible()
    await expect(kpis).not.toContainText('Forbidden')
  })

  // ---- Kargo faturaları ----
  test('kargo: satırlar ₺ ve tr-TR tarihle listelenir; destek notu görünür', async ({ page }) => {
    await openTab(page, {}, 'Kargo faturaları')
    const view = page.locator('.financialListView')
    const grid = view.getByRole('table', { name: 'Kargo faturaları tablosu' })
    await expect(grid.getByText('KF-2026-81450')).toBeVisible()
    await expect(grid.getByText('₺42,90').first()).toBeVisible()
    await expect(grid.getByText('28.09.2026')).toBeVisible()
    await expect(grid.getByText('İade').first()).toBeVisible()
    await expect(view.getByText('Kargo faturası sağlamayan kanallar: Hepsiburada, N11')).toBeVisible()
    await expect(view.getByText(/İlk 5\.000 satır/)).toHaveCount(0)
  })

  test('kargo: fatura no araması Enter ile invoiceNumber gövdesi gönderir', async ({ page }) => {
    const bodies: any[] = []
    await openTab(page, { [CARGO_ENDPOINT]: cargoMock(bodies) }, 'Kargo faturaları')
    const view = page.locator('.financialListView')
    await expect(view.getByText('KF-2026-81450')).toBeVisible()
    expect(bodies[0]).toEqual({})
    const input = view.getByLabel('Fatura no ile ara (tam eşleşme)', { exact: true })
    await input.fill('KF-2026-81453')
    await input.press('Enter')
    await expect.poll(() => bodies[bodies.length - 1]).toEqual({ invoiceNumber: 'KF-2026-81453' })
  })

  test('kargo desteklenmiyor: Hepsiburada seçiliyken boş yanıt "Bu kanal için bu görünüm desteklenmiyor" (₺0,00 değil)', async ({ page }) => {
    const bodies: any[] = []
    await openTab(page, { [CARGO_ENDPOINT]: cargoMock(bodies) }, 'Kargo faturaları')
    const view = page.locator('.financialListView')
    await expect(view.getByText('KF-2026-81450')).toBeVisible()
    const panel = await openPanel(view)
    await panel.locator('.v-select').filter({ hasText: 'Kanal' }).click()
    await page.getByRole('option', { name: 'Hepsiburada' }).click()
    await panel.getByRole('button', { name: /Sorgula/ }).click()
    await expect.poll(() => bodies[bodies.length - 1]?.integrationCode).toBe('hepsiburada')
    await expect(view.getByText('Bu kanal için bu görünüm desteklenmiyor')).toBeVisible()
    await expect(view.getByText(/Hepsiburada entegrasyonu kargo faturası sağlamıyor/)).toBeVisible()
  })

  test('kargo boş: hiç fatura yoksa "Kargo faturası yok"', async ({ page }) => {
    await openTab(page, { [CARGO_ENDPOINT]: [] }, 'Kargo faturaları')
    await expect(page.locator('.financialListView').getByText('Kargo faturası yok')).toBeVisible()
  })

  test('kargo 5000 sınırı: backend üst sınırına ulaşıldıysa "İlk 5.000 satır gösteriliyor" notu', async ({ page }) => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ ...CARGO_ROWS[i % CARGO_ROWS.length], _id: `c-${i}`, invoiceNumber: `KF-${100000 + i}` }))
    await openTab(page, { [CARGO_ENDPOINT]: many }, 'Kargo faturaları')
    await expect(page.locator('.financialListView').getByText(/İlk 5\.000 satır gösteriliyor/)).toBeVisible()
  })

  test('kargo hata: 500 → "Kargo faturaları yüklenemedi" + Tekrar dene', async ({ page }) => {
    await openTab(page, { [CARGO_ENDPOINT]: mockError(500) }, 'Kargo faturaları')
    const view = page.locator('.financialListView')
    await expect(view.getByText('Kargo faturaları yüklenemedi')).toBeVisible()
    await expect(view.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(view.locator('.ek-fin-panel-slot').last()).not.toContainText('E2E sentetik hata')
  })

  // ---- Ödeme dökümü ----
  test('ödeme dökümü: liste PAYOUT türüyle istenir; "Dökümü aç" yan sayfada kalemleri gösterir', async ({ page }) => {
    const listBodies: any[] = []
    const detailBodies: any[] = []
    await openTab(page, { [ENDPOINT]: transactionsMock(listBodies), [PAYOUT_DETAIL_ENDPOINT]: payoutDetailMock(detailBodies) }, 'Ödeme dökümü')
    const view = page.locator('.financialListView')
    await expect(view.getByText('4829301')).toBeVisible()
    expect(listBodies[0]).toEqual({ transactionTypes: ['PAYOUT'], page: 1, limit: 25, sortBy: [{ key: 'transactionDate', order: 'desc' }] })
    await expect(view.getByText('₺38.420,75')).toBeVisible()

    await view.getByRole('row').filter({ hasText: '4829301' }).getByRole('button', { name: 'Dökümü aç' }).click()
    const sheet = page.getByRole('dialog').filter({ hasText: 'Ödeme emri 4829301' })
    await expect(sheet).toBeVisible()
    expect(detailBodies[detailBodies.length - 1]).toEqual({ paymentOrderId: '4829301' })
    await expect(sheet.getByText('TRX-771201')).toBeVisible()
    await expect(sheet.getByText('₺1.304,91')).toBeVisible()
    await expect(sheet.getByText('-₺349,50')).toBeVisible()
    await expect(sheet.getByText('₺38.420,75')).toBeVisible()
    await sheet.getByRole('button', { name: 'Kapat' }).click()
    await expect(sheet).toBeHidden()
  })

  test('ödeme dökümü: numarası olmayan kayıtta döküm eylemi yok; numara ile doğrudan açılır (string gövde)', async ({ page }) => {
    const detailBodies: any[] = []
    await openTab(page, { [PAYOUT_DETAIL_ENDPOINT]: payoutDetailMock(detailBodies) }, 'Ödeme dökümü')
    const view = page.locator('.financialListView')
    const noId = view.getByRole('row').filter({ hasText: 'PAY-PZ-3310' })
    await expect(noId).toBeVisible()
    await expect(noId.getByRole('button', { name: 'Dökümü aç' })).toHaveCount(0)

    await view.getByLabel('Ödeme emri no', { exact: true }).fill(' 5550001 ')
    await view.getByRole('button', { name: 'Dökümü getir' }).click()
    await expect.poll(() => detailBodies[detailBodies.length - 1]).toEqual({ paymentOrderId: '5550001' })
    const sheet = page.getByRole('dialog').filter({ hasText: 'Ödeme emri 5550001' })
    await expect(sheet.getByText('Bu ödeme emrine bağlı kalem yok')).toBeVisible()
  })

  test('ödeme dökümü desteklenmiyor: yalnız desteklemeyen kanal seçiliyken boş liste "desteklenmiyor" durumudur', async ({ page }) => {
    const listBodies: any[] = []
    await openTab(page, { [ENDPOINT]: transactionsMock(listBodies, []) }, 'Ödeme dökümü')
    const view = page.locator('.financialListView')
    await expect(view.getByText('Ödeme emri yok')).toBeVisible()
    const panel = await openPanel(view)
    await panel.locator('.v-select').filter({ hasText: 'Kanallar' }).click()
    await page.getByRole('option', { name: 'Hepsiburada' }).click()
    await page.keyboard.press('Escape')
    await panel.getByRole('button', { name: /Sorgula/ }).click()
    await expect.poll(() => listBodies[listBodies.length - 1]?.integrationCodes).toEqual(['hepsiburada'])
    await expect(view.getByText('Bu kanal için bu görünüm desteklenmiyor')).toBeVisible()
  })

  test('ödeme dökümü hata: liste 500 ve döküm 500 ayrı sabit metinlerle gösterilir', async ({ page }) => {
    await openTab(page, { [PAYOUT_DETAIL_ENDPOINT]: mockError(500) }, 'Ödeme dökümü')
    const view = page.locator('.financialListView')
    await view.getByRole('row').filter({ hasText: '4829301' }).getByRole('button', { name: 'Dökümü aç' }).click()
    const sheet = page.getByRole('dialog').filter({ hasText: 'Ödeme emri 4829301' })
    await expect(sheet.getByText('Ödeme dökümü yüklenemedi — Bağlantınızı kontrol edip yeniden deneyin.')).toBeVisible()
    await expect(sheet).not.toContainText('E2E sentetik hata')
  })

  test('ödeme dökümü liste hatası: 500 → "Ödeme emirleri yüklenemedi"', async ({ page }) => {
    await open(page, financeRoutes({ [ENDPOINT]: mockError(500) }))
    await page.locator('.financialListView').getByRole('tab', { name: 'Ödeme dökümü' }).click()
    await expect(page.locator('.financialListView').getByText('Ödeme emirleri yüklenemedi')).toBeVisible()
  })

  // ---- Erişilebilirlik ----
  for (const tab of ['Özet', 'Kargo faturaları', 'Ödeme dökümü'] as const) {
    test(`axe WCAG 2.1 AA = 0: ${tab}`, async ({ page }) => {
      await openTab(page, {}, tab)
      const view = page.locator('.financialListView')
      await expect(view.locator('[aria-busy="true"]')).toHaveCount(0)
      await page.waitForTimeout(300)
      // `.v-field` hariç: Vuetify v-select/tarih alanı iç girdisindeki aria-expanded (kütüphane içi; password-reset/register-handoff ile aynı istisna).
      const results = await new AxeBuilder({ page }).include('.financialListView').exclude('.v-field').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
    })
  }

  test('axe WCAG 2.1 AA = 0: ödeme dökümü yan sayfası', async ({ page }) => {
    await openTab(page, {}, 'Ödeme dökümü')
    await page.locator('.financialListView').getByRole('row').filter({ hasText: '4829301' }).getByRole('button', { name: 'Dökümü aç' }).click()
    const sheet = page.getByRole('dialog').filter({ hasText: 'Ödeme emri 4829301' })
    await expect(sheet.getByText('TRX-771201')).toBeVisible()
    await page.waitForTimeout(300)
    const results = await new AxeBuilder({ page }).include('.ek-detail-sheet').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
})

test.describe('C1.4 — Finans sekmeleri: inceleme görselleri', () => {
  test.skip(!process.env.FINANCE_REVIEW_CAPTURE, 'Yalnız FINANCE_REVIEW_CAPTURE=1 ile (inceleme görselleri)')
  const width = Number(process.env.FINANCE_REVIEW_WIDTH || 1440)
  const height = width < 768 ? 844 : 900
  test.use({ viewport: { width, height } })
  const out = (name: string) => `docs/design-system-review/w1-finance-${name}-${width}.png`
  const settle = async (page: any) => {
    await expect(page.locator('.financialListView [aria-busy="true"]')).toHaveCount(0)
    await page.mouse.move(0, 0)
    await page.waitForTimeout(400)
  }

  test('özet', async ({ page }) => {
    await openTab(page, {}, 'Özet')
    await expect(page.getByText('₺184.250,40')).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out('ozet'), fullPage: false })
  })

  test('kargo faturaları', async ({ page }) => {
    await openTab(page, {}, 'Kargo faturaları')
    await expect(page.getByText('KF-2026-81450')).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out('kargo'), fullPage: false })
  })

  test('ödeme dökümü + yan sayfa', async ({ page }) => {
    await openTab(page, {}, 'Ödeme dökümü')
    await expect(page.getByText('4829301')).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out('odeme'), fullPage: false })
    await page.locator('.financialListView').getByRole('row').filter({ hasText: '4829301' }).getByRole('button', { name: 'Dökümü aç' }).click()
    await expect(page.getByRole('dialog').getByText('TRX-771201')).toBeVisible()
    await page.waitForTimeout(500)
    await page.screenshot({ path: out('odeme-detay'), fullPage: false })
  })

  test('işlemler', async ({ page }) => {
    await open(page, financeRoutes())
    await expect(page.getByText('SIP-E2E-1001')).toBeVisible()
    await settle(page)
    await page.screenshot({ path: out('islemler'), fullPage: false })
  })
})
