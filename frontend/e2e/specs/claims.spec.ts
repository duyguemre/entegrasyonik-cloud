// P2 — ClaimListView + ClaimDetailComponent (ADR-0011 Karar 2 tablosu, "pulse/ripple ihlali").
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { claimsBosFixture, claimsDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'

// NOT (orders.spec.ts ile aynı gerçek davranış, ADR-0011 Karar 1): `v-data-table-server`
// yalnızca `$vuetify.display.mdAndUp` (>=960px) iken render oluyor; `chromium-tablet` (800px)
// de mobil kart düzenine düşüyor. Göz ikonu etkileşimi bu yüzden yalnızca `chromium-desktop`'ta.

test.describe('P2 — İade Talepleri (ClaimListView)', () => {
  test('smoke: arama kutusu + talep satırları render olur', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ClaimListView')

    await expect(page.locator('.claimListView')).toBeVisible()
    await expect(page.getByLabel('İade No, Sipariş No veya Takip Ara').first()).toBeVisible()
    await expect(page.getByText('CLM-E2E-0001')).toBeVisible()
    await expect(page.getByText('CLM-E2E-0002')).toBeVisible()
  })

  test('boş durum: sonuç yoksa "Talep Bulunamadı" kartı gösterilir', async ({ page }) => {
    await installApiMocks(page, { 'ClaimService/getClaims': claimsBosFixture })
    await gotoAuthed(page)
    await openScreen(page, 'ClaimListView')

    await expect(page.getByText('Talep Bulunamadı')).toBeVisible()
  })

  test('hata durumu: 500 alındığında "İade talepleri yüklenemedi" + Tekrar dene gösterilir (boştan AYRI), ham hata sızmaz', async ({ page }) => {
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md): `restApi.post` HİÇBİR ZAMAN
    // reddetmiyor (bkz. restapi.ts `postService` — hata `resolve(error)` ile çözülüyor); bu yüzden
    // `getClaimsInternal`'ın try/finally'si (catch bile YOK) hiç tetiklenmiyor, `res.claims`
    // undefined kalıp liste güncellenmiyor — kullanıcı "hata" ile "gerçekten kayıt yok" durumunu
    // AYIRT EDEMİYOR (OrderListView ile birebir aynı desen).
    await installApiMocks(page, { 'ClaimService/getClaims': mockError(500) })
    await gotoAuthed(page)
    await openScreen(page, 'ClaimListView')

    // DS-v2 Aşama 2 — BİLİNÇLİ DAVRANIŞ DEĞİŞİKLİĞİ: hata artık boş durumdan ayrı (isRequestError); API çağrısı AYNI.
    await expect(page.getByText('İade talepleri yüklenemedi')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: göz ikonuna tıklayınca talep detayı açılır', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor')
    await installApiMocks(page, { 'ClaimService/getClaims': claimsDoluFixture })
    await gotoAuthed(page)
    await openScreen(page, 'ClaimListView')

    await page.locator('.claimListView tbody tr').first().locator('button:has(.mdi-eye)').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'CLM-E2E-0001' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('İade Talep No')).toBeVisible()
  })

  test('ekran görüntüsü tabanı (talep listesi)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ClaimListView')
    // Mobil kart listesinin ilk render'ı 300ms sabit beklemeden daha uzun sürebiliyor (test-only
    // zamanlama, smoke testindeki `toBeVisible()` otomatik-bekleme sayesinde görünmüyor) — ekran
    // görüntüsü öncesi içeriğin GERÇEKTEN göründüğü bekleniyor (kod DEĞİŞMEDİ).
    await expect(page.getByText('CLM-E2E-0001')).toBeVisible()
    await page.waitForTimeout(300)
    // [Orkestratör düzeltmesi, 2026-09-28 — KÖK NEDEN BULUNDU] Bu masaüstü tablo taban görüntüsü
    // `toHaveScreenshot`'ın VARSAYILAN `scale:'css'` moduyla TUTARLI biçimde BOŞ yakalanıyordu — DOM/
    // canlı sayfa TAMAMEN doğruydu (`page.evaluate` ile kanıtlandı: tablo 627px yükseklik, 2 satır,
    // doğru renk/opaklık/konum; aynı testte hemen ÖNCESİNDE alınan düz `page.screenshot()` de doğru
    // çıkıyordu). Bu, Chromium'un `position:sticky`+`contain` içeren öğelerde (`v-table--fixed-header`)
    // CSS-piksel ölçekli CDP ekran görüntüsü alırken bilinen bir boyama/composite hatasıyla tutarlı.
    // `scale:'device'` (cihaz pikseli ölçeği) sorunu çözüyor — davranış/uygulama kodu DEĞİŞMEDİ, bu
    // SALT Playwright/Chromium yakalama ayarı. Diğer P2 ekranlarında (orders/customers/invoices/
    // messages) AYNI sorun GÖZLENMEDİ (bu ekranın `fixed-header`+`contain` kombinasyonuna özgü olabilir).
    await expect(page).toHaveScreenshot('claims-list.png', { fullPage: false, scale: 'device' })
  })

  test('axe: WCAG 2.1 AA taraması — talep listesi (ADR-0015 Aşama B çıkış kapısı: ekranın KENDİ içeriğinde 0 ihlal; kabuk/menü A grubunun kapsamıdır, ayrıca izlenir)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'ClaimListView')
    await expect(page.getByText('CLM-E2E-0001')).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.claimListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-ClaimListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] ClaimListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
    // A-yaması gerekli (bkz. customers.spec.ts aynı not) — EkDataTable role=table + nested <table>.
    const knownDsIssues = new Set(['aria-required-children'])
    const ownViolations = results.violations.filter(v => !knownDsIssues.has(v.id))
    expect(ownViolations, JSON.stringify(ownViolations, null, 2)).toEqual([])
  })
})

test.describe('P2 — İade Talebi Detayı (ClaimDetailComponent)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Detay, masaüstü tablodaki göz ikonuyla açılıyor (mdAndUp/>=960px)')
    await installApiMocks(page, { 'ClaimService/getClaims': claimsDoluFixture })
    await gotoAuthed(page)
    await openScreen(page, 'ClaimListView')
    await page.locator('.claimListView tbody tr').first().locator('button:has(.mdi-eye)').click()
    await expect(page.getByRole('dialog').filter({ hasText: 'CLM-E2E-0001' })).toBeVisible()
  })

  test('smoke: talep no ve sipariş bilgisi render olur', async ({ page }) => {
    const dialog = page.getByRole('dialog').filter({ hasText: 'CLM-E2E-0001' })
    await expect(dialog).toContainText('CLM-E2E-0001')
    await expect(dialog).toContainText('E2E-100001')
  })

  test('ekran görüntüsü tabanı (talep detayı)', async ({ page }) => {
    // Playwright `toHaveScreenshot` varsayılanı `animations: 'disabled'` — bu, CSS animasyonlarını
    // (bkz. ClaimDetailComponent `.status-pulse-intense`/`.active-pulse` — ADR Bağlam "pulse/ripple
    // ihlali") anlık görüntü öncesi son duruma sabitliyor; ekran görüntüsü animasyon SÜRESİNDEN
    // (1.5s/2s -> token göçünde 300ms) etkilenmiyor/fark üretmiyor.
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('claims-detail.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — talep detayı (ADR-0015 Aşama B çıkış kapısı: dialog içeriğinde 0 ihlal)', async ({ page }, testInfo) => {
    // bkz. "ekran görüntüsü" testindeki aynı yorum — diyalog `fade-transition` ile açılıyor (200ms);
    // axe taraması geçiş TAMAMLANDIKTAN sonra çalışmalı (yarı-saydam ara kare, yanlış-pozitif
    // color-contrast üretir), test/zamanlama DEĞİŞİKLİĞİ, davranış AYNI.
    await page.waitForTimeout(300)
    const results = await new AxeBuilder({ page }).include('.ek-detail-sheet').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-ClaimDetailComponent-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] ClaimDetailComponent: ${results.violations.length} WCAG 2.1 AA ihlali`)
    // A-yaması gerekli (bu görevin kapsamı DIŞI — src/design/tokens/** dokunulamaz):
    // 1) aria-required-children (bkz. customers.spec.ts) — EkDataTable role=table + nested <table>.
    // 2) color-contrast — `content-muted` (#64748B) `token-unit.test.ts`'te YALNIZCA `background`
    //    (#FFFFFF) zeminine karşı ≥4.5:1 doğrulanmış; `surface-muted` (slate-50, ~#F8FAFC) zemini
    //    KAPSAM DIŞI kalmış ve gerçekte 4.48:1 ölçülüyor (eşiğin 0.02 altı). Bu ekrana özgü değil —
    //    `surface-muted` zemin üzerinde `content-muted` kullanan HER ekranı etkiler; önerilen düzeltme
    //    `content-muted`'ı bir ton koyulaştırmak (slate-600) veya token-unit testine `surface-muted`
    //    çiftini eklemek. Orkestratöre bildirildi.
    // 3) scrollable-region-focusable — `EkDetailSheet.vue`'nin `.ek-detail-sheet__body`'si
    //    (`overflow-y:auto`) `tabindex` taşımıyor; DS bileşeninin KENDİSİNDEN kaynaklanıyor, TÜM
    //    `EkDetailSheet` kullanan ekranları etkiler. Orkestratöre bildirildi.
    const knownDsIssues = new Set(['aria-required-children', 'color-contrast', 'scrollable-region-focusable'])
    const ownViolations = results.violations.filter(v => !knownDsIssues.has(v.id))
    expect(ownViolations, JSON.stringify(ownViolations, null, 2)).toEqual([])
  })
})
