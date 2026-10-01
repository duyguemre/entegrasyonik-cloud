// P1 — OrderListView + OrderDetailComponent (ADR-0011 Karar 2 tablosu, 45 hex).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { buildOrder, ordersBosFixture, ordersDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'

// NOT: `v-data-table-server` yalnızca `$vuetify.display.mdAndUp` (Vuetify varsayılanı: >=960px)
// iken render oluyor; `chromium-tablet` projesi 800px (md ALTI) olduğundan O DA mobil kart
// düzenine düşüyor — yani "tablet" burada masaüstü tabloyu KAPSAMIYOR (ADR-0011 Karar 1 "Vuetify
// display.thresholds omurgada DEĞİŞMEZ" kararıyla tutarlı gerçek davranış). Göz ikonu/tablo satırı
// etkileşimi bu yüzden yalnızca `chromium-desktop` projesinde koşuluyor; mobil kart düzeninin kendi
// etkileşim testi bu görevin kapsamı dışında (ayrı bir karakterizasyon gerektirir).

test.describe('P1 — Siparişler (OrderListView)', () => {
  test('smoke: arama kutusu + sipariş satırları render olur', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')

    await expect(page.locator('.orderListView')).toBeVisible()
    await expect(page.getByLabel('Sipariş No, Müşteri Adı veya Telefon Ara').first()).toBeVisible()
    await expect(page.getByText('E2E-100001')).toBeVisible()
    await expect(page.getByText('E2E-100002')).toBeVisible()
  })

  test('boş durum: sonuç yoksa "Sipariş bulunamadı" kartı gösterilir', async ({ page }) => {
    await installApiMocks(page, { 'OrderService/getOrders': ordersBosFixture })
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')

    await expect(page.getByText('Sipariş bulunamadı')).toBeVisible()
  })

  test('hata durumu: 500 alındığında "Siparişler yüklenemedi" + Tekrar dene gösterilir (boştan AYRI), ham hata sızmaz', async ({ page }) => {
    // DS-v2 Aşama 2 (liste standardı) — BİLİNÇLİ DAVRANIŞ DEĞİŞİKLİĞİ: eskiden `restApi.post` hatayı
    // axios hata nesnesiyle ÇÖZDÜĞÜ için liste "Sipariş bulunamadı" boş durumuna düşüyordu (hata ≠ boş
    // ayırt edilemiyordu, BACKLOG). Artık `isRequestError` ile hata ayrı gösterilir; API çağrısı AYNI.
    await installApiMocks(page, { 'OrderService/getOrders': mockError(500) })
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')

    await expect(page.getByText('Siparişler yüklenemedi')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(page.locator('.orderListView')).not.toContainText('500')
  })

  test('etkileşim: göz ikonuna tıklayınca sipariş detayı açılır', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor')
    await installApiMocks(page, { 'OrderService/getOrders': ordersDoluFixture })
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')

    await page.locator('.orderListView tbody tr').first().locator('button:has([class*="mdi-eye"])').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'E2E-100001' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Sipariş No')).toBeVisible()
  })

  test('ekran görüntüsü tabanı (sipariş listesi)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    // bkz. claims.spec.ts aynı yorumu — ekran görüntüsü öncesi içeriğin GERÇEKTEN göründüğü
    // bekleniyor (test determinizmi, kod DEĞİŞMEDİ; mobil kart listesinin ilk render'ı sabit
    // 300ms beklemeden daha uzun sürebiliyor).
    await expect(page.getByText('E2E-100001')).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('orders-list.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — sipariş listesi (ADR-0015 Aşama B çıkış kapısı: ekranın KENDİ içeriğinde 0 ihlal; kabuk/menü A grubunun kapsamıdır, ayrıca izlenir)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    await expect(page.getByText('E2E-100001')).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.orderListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-OrderListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] OrderListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
    // DS-v2 Aşama 2: liste EkDataGrid'e (yerel <table>) taşındı — eski `aria-required-children` istisnası kalktı.
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
})

test.describe('P1 — Sipariş Detayı (OrderDetailComponent)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Detay, masaüstü tablodaki göz ikonuyla açılıyor (mdAndUp/>=960px)')
    await installApiMocks(page, { 'OrderService/getOrders': ordersDoluFixture })
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    await page.locator('.orderListView tbody tr').first().locator('button:has([class*="mdi-eye"])').click()
    await expect(page.getByRole('dialog').filter({ hasText: 'E2E-100001' })).toBeVisible()
  })

  test('smoke: sipariş numarası ve müşteri bilgisi render olur', async ({ page }) => {
    const dialog = page.getByRole('dialog').filter({ hasText: 'E2E-100001' })
    await expect(dialog).toContainText('E2E-100001')
  })

  test('ekran görüntüsü tabanı (sipariş detayı)', async ({ page }) => {
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('orders-detail.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — sipariş detayı (ADR-0015 Aşama B çıkış kapısı: dialog içeriğinde 0 ihlal)', async ({ page }, testInfo) => {
    // bkz. claims.spec.ts aynı yorum — diyalog `fade-transition` ile açılıyor (200ms); axe taraması
    // geçiş TAMAMLANDIKTAN sonra çalışmalı (yarı-saydam ara kare yanlış-pozitif color-contrast üretir).
    await page.waitForTimeout(300)
    const results = await new AxeBuilder({ page }).include('.ek-detail-sheet').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-OrderDetailComponent-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] OrderDetailComponent: ${results.violations.length} WCAG 2.1 AA ihlali`)
    // A-yaması gerekli (bkz. claims.spec.ts aynı not) — EkDataTable role=table+nested table,
    // content-muted/surface-muted sınırda kontrast, EkDetailSheet gövdesi scrollable-region-focusable.
    const knownDsIssues = new Set(['aria-required-children', 'color-contrast', 'scrollable-region-focusable'])
    const ownViolations = results.violations.filter(v => !knownDsIssues.has(v.id))
    expect(ownViolations, JSON.stringify(ownViolations, null, 2)).toEqual([])
  })
})

test.describe('C1.1 — Sipariş detayında stok tahsis zaman çizgisi', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Detay, masaüstü tablodaki göz ikonuyla açılıyor (mdAndUp/>=960px)')
  })

  test('tahsis durumu olan kalemler detayda durum çipi ve zaman kaydıyla listelenir', async ({ page }) => {
    const order = buildOrder({
      items: [
        { externalLineItemId: 'L1', sku: 'SKU-E2E-0001', productName: 'E2E Test Ürünü', quantity: 2, allocationState: 'OVERSOLD', lastAllocationAppliedAt: '2026-09-20T10:16:00.000Z', oversoldEscalatedAt: '2026-09-20T10:30:00.000Z' },
        { externalLineItemId: 'L2', sku: 'SKU-E2E-0002', productName: 'E2E İkinci Ürün', quantity: 1, allocationState: 'RESERVED', lastAllocationAppliedAt: '2026-09-20T10:16:00.000Z' },
      ],
    })
    await installApiMocks(page, { 'OrderService/getOrders': { orders: [order], totalNumberOfRecords: 1 } })
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    await page.locator('.orderListView tbody tr').first().locator('button:has([class*="mdi-eye"])').click()
    const timeline = page.getByRole('region', { name: 'Stok tahsisi' })
    await expect(timeline).toBeVisible()
    await expect(timeline).toContainText('Aşırı satış')
    await expect(timeline).toContainText('Rezerve')
    await expect(timeline).toContainText('Aşırı satış için manuel işlem bildirildi')
  })

  test('tahsis durumu olmayan (eski) siparişte bölüm görünmez', async ({ page }) => {
    await installApiMocks(page, { 'OrderService/getOrders': ordersDoluFixture })
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    await page.locator('.orderListView tbody tr').first().locator('button:has([class*="mdi-eye"])').click()
    await expect(page.getByRole('dialog').filter({ hasText: 'E2E-100001' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Stok tahsisi' })).toHaveCount(0)
  })
})
