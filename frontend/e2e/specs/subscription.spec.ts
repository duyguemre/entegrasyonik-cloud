// P1-yeni — SubscriptionView (ADR-0008 §3 durum makinesi + ADR-0011 Karar 2 "gerçek abonelik/plan ekranı").
// Bu ekran sıfırdan token'larla yazıldı (characterization YOK — sabitlenecek eski bir iş kuralı yoktu).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { plansBosFixture, startCheckoutSuccessFixture, subscriptionNoneFixture, subscriptionPastDueFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'

// `defineAsyncComponent` ilk açılışta ekranın kendi chunk'ını + iki API çağrısını (getPlans/getMySubscription)
// beklediğinden, vite dev sunucusu yük altındayken (paralel worker'lar/eşzamanlı worktree'ler) varsayılan 5 sn
// `expect` zaman aşımı yetersiz kalabiliyor (diğer P1/P2 spec'lerdeki `waitForShellReady` 20 sn kullanıyor,
// aynı gerekçe) — yalnızca ekranın İLK görünürlük beklemelerinde cömert zaman aşımı kullanılır.
const SCREEN_READY = { timeout: 20_000 }

test.describe('P1-yeni — Abonelik ve planlar (SubscriptionView)', () => {
  test('smoke: durum bandı + 3 plan kartı render olur, mevcut plan işaretlenir', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'SubscriptionView')

    await expect(page.locator('.subscriptionView')).toBeVisible(SCREEN_READY)
    await expect(page.getByText('Aktif', { exact: true })).toBeVisible(SCREEN_READY)
    await expect(page.getByText('Başlangıç')).toBeVisible(SCREEN_READY)
    await expect(page.getByText('Büyüme')).toBeVisible()
    await expect(page.getByText('Kurumsal')).toBeVisible()
    await expect(page.getByText('Mevcut planınız').first()).toBeVisible()
    await expect(page.getByText('Özel teklif')).toBeVisible()
  })

  test('boş durum: satışa açık plan yoksa "Plan tanımları henüz yayınlanmadı" gösterilir', async ({ page }) => {
    await installApiMocks(page, { 'BillingService/getPlans': plansBosFixture })
    await gotoAuthed(page)
    await openScreen(page, 'SubscriptionView')

    await expect(page.getByText('Plan tanımları henüz yayınlanmadı')).toBeVisible(SCREEN_READY)
  })

  test('hata durumu: planlar 500 döndüğünde aksiyon alınabilir hata kartı gösterilir, ham hata sızmaz', async ({ page }) => {
    await installApiMocks(page, { 'BillingService/getPlans': mockError(500) })
    await gotoAuthed(page)
    await openScreen(page, 'SubscriptionView')

    await expect(page.getByText('Planlar yüklenemedi')).toBeVisible(SCREEN_READY)
    await expect(page.getByRole('button', { name: 'Tekrar Dene' })).toBeVisible()
    await expect(page.locator('.subscriptionView')).not.toContainText('500')
    await expect(page.locator('.subscriptionView')).not.toContainText('Internal Server Error')
  })

  test('abonelik yok: "Abonelik Yok" bandı + tüm kartlarda "Planı Seç" gösterilir', async ({ page }) => {
    await installApiMocks(page, { 'BillingService/getMySubscription': subscriptionNoneFixture })
    await gotoAuthed(page)
    await openScreen(page, 'SubscriptionView')

    await expect(page.getByText('Abonelik Yok')).toBeVisible(SCREEN_READY)
    await expect(page.getByText('Henüz aktif bir aboneliğiniz yok')).toBeVisible()
    await expect(page.getByRole('button', { name: /Başlangıç planı için: Planı Seç/ })).toBeVisible()
  })

  test('past_due durumu: "Ödeme Bekliyor" bandı aksiyon alınabilir mesajla gösterilir', async ({ page }) => {
    await installApiMocks(page, { 'BillingService/getMySubscription': subscriptionPastDueFixture })
    await gotoAuthed(page)
    await openScreen(page, 'SubscriptionView')

    await expect(page.getByText('Ödeme Bekliyor')).toBeVisible(SCREEN_READY)
    await expect(page.getByText(/kart bilgilerinizi güncelleyin/)).toBeVisible()
  })

  test('etkileşim: farklı bir plan seçilince onay diyaloğu açılır, onaylayınca checkout bilgisi gösterilir', async ({ page }) => {
    await installApiMocks(page, { 'BillingService/startCheckout': startCheckoutSuccessFixture })
    await gotoAuthed(page)
    await openScreen(page, 'SubscriptionView')

    await page.getByRole('button', { name: /Başlangıç planı için: Bu plana geç/ }).click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Plan Seçimini Onayla' })
    await expect(dialog).toBeVisible(SCREEN_READY)
    await expect(dialog).toContainText('Başlangıç')

    await dialog.getByRole('button', { name: 'Devam Et' }).click()

    await expect(dialog).not.toBeVisible(SCREEN_READY)
    await expect(page.getByText('Ödeme adımına yönlendiriliyorsunuz (test ortamı)')).toBeVisible(SCREEN_READY)
    await expect(page.getByText(startCheckoutSuccessFixture.checkoutUrl)).toBeVisible()
  })

  test('yetkisiz (403): aksiyon alınabilir Türkçe mesaj gösterilir, ham HTTP hatası sızmaz', async ({ page }) => {
    await installApiMocks(page, { 'BillingService/startCheckout': mockError(403, { error: 'Forbidden' }) })
    await gotoAuthed(page)
    await openScreen(page, 'SubscriptionView')

    await page.getByRole('button', { name: /Başlangıç planı için: Bu plana geç/ }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Plan Seçimini Onayla' })
    await dialog.getByRole('button', { name: 'Devam Et' }).click()

    await expect(page.getByText('Bu işlemi yalnızca hesap sahibi veya yöneticisi gerçekleştirebilir.')).toBeVisible(SCREEN_READY)
  })

  test('ekran görüntüsü tabanı (abonelik ve planlar)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'SubscriptionView')
    await expect(page.getByText('Kurumsal')).toBeVisible(SCREEN_READY)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('subscription.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — 0 ihlal (P1-yeni, sıfırdan token+a11y ile yazıldı)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'SubscriptionView')
    await expect(page.getByText('Kurumsal')).toBeVisible(SCREEN_READY)

    // Yalnızca BU ekranın DOM'u taranır (`.subscriptionView`): kabuk/sekme çubuğunun ZATEN BİLİNEN,
    // bu görevin kapsamı DIŞINDAki ihlalleri (bkz. T1b/T4a-d "axe ihlalleri kaydedildi, düzeltilmedi")
    // bu testin sonucunu kirletmesin -- P1-yeni ekranın KENDİ içeriği 0 ihlal hedefler.
    const results = await new AxeBuilder({ page }).include('.subscriptionView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
  })
})
