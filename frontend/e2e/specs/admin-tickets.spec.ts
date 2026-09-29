// P2 — Admin paneli / Destek Yönetimi (AdminTicketListView + AdminChatComponent).
// ADR-0011 Karar 2 tablosu: "admin panel ekranları" (platformAdmin-only, ADR-0001). Menü kaydı için
// sentetik 'adminPanel' grubu — bkz. admin-clients.spec.ts başındaki not / nav.ts `menuFixtureWithAdmin`.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { adminTicketsBosFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixtureWithAdmin, openScreen } from '../fixtures/nav'

// NOT: `AdminTicketListView`'in `v-data-table-server`'ı da `mdAndUp` koşuluna bağlı DEĞİL —
// tablo her viewport'ta render oluyor; testler 3 viewport'un tamamında koşar.

function withAdminMenu(overrides: Record<string, any> = {}) {
  return { MenuService: menuFixtureWithAdmin, ...overrides }
}

test.describe('P2 — Admin / Destek Yönetimi (AdminTicketListView)', () => {
  test('smoke: banner + arama kutusu + talep satırları render olur', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminTicketListView')

    await expect(page.locator('.ticket-list-view')).toBeVisible()
    await expect(page.getByText('DESTEK MERKEZİ ANALİZİ')).toBeVisible()
    await expect(page.getByLabel('Talep No, Konu veya Mesaj Ara').first()).toBeVisible()
    await expect(page.getByText('TKT-100001')).toBeVisible()
    await expect(page.getByText('E2E Sipariş senkronizasyonu gecikiyor')).toBeVisible()
    await expect(page.getByText('E2E Fatura ayarı sorusu')).toBeVisible()
    // `lastMessageSnippet` olmayan talepte yer tutucu metin (gizli davranış: kaynak sabit 'Mesaj yok').
    await expect(page.getByText('Mesaj yok')).toBeVisible()
    await expect(page.locator('.ticket-list-view tbody tr')).toHaveCount(2)
  })

  test('boş durum: sonuç yoksa "Talep bulunamadı." mesajı gösterilir', async ({ page }) => {
    await installApiMocks(page, withAdminMenu({ 'AdminService/getTickets': adminTicketsBosFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'AdminTicketListView')

    await expect(page.getByText('Talep bulunamadı.')).toBeVisible()
  })

  test('hata durumu: 500 alındığında "Talepler yüklenemedi" + Tekrar dene gösterilir, ham hata sızmaz', async ({ page }) => {
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md): `restApi.post` HİÇBİR ZAMAN
    // reddetmiyor; `loadTickets` yalnızca `try/finally` kullanıyor (catch YOK), `res?.success`
    // falsy olunca `tickets` `[]`'de kalıyor — kullanıcı "hata" ile "gerçekten talep yok"
    // durumunu AYIRT EDEMİYOR (snackbar da tetiklenmiyor).
    await installApiMocks(page, withAdminMenu({ 'AdminService/getTickets': mockError(500) }))
    await gotoAuthed(page)
    await openScreen(page, 'AdminTicketListView')

    // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: hata artık boş durumdan AYRI ("Talepler yüklenemedi" + "Tekrar dene").
    await expect(page.getByText('Talepler yüklenemedi', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: satıra tıklayınca talep detayı açılır; cevap yazılıp gönderilince replyToTicket çağrılır', async ({ page }) => {
    const replyBodies: any[] = []
    await installApiMocks(page, withAdminMenu({
      'AdminService/replyToTicket': async (route: any, headers: Record<string, string>) => {
        replyBodies.push(route.request().postDataJSON())
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ success: true }) })
      },
    }))
    await gotoAuthed(page)
    await openScreen(page, 'AdminTicketListView')

    await page.getByText('E2E Sipariş senkronizasyonu gecikiyor').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Destek Talebi Detayı' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('TKT-100001')
    await expect(dialog).toContainText('İnceliyoruz, kısa süre içinde dönüş yapacağız.')

    // Cevap boşken gönder düğmesi devre dışı; yazınca etkinleşir.
    const send = dialog.getByRole('button', { name: /CEVAPLA VE GÖNDER/ })
    await expect(send).toBeDisabled()
    await dialog.getByLabel('Cevabınız...').fill('E2E test cevabı')
    await expect(send).toBeEnabled()
    await send.click()

    await expect.poll(() => replyBodies.length).toBe(1)
    expect(replyBodies[0]).toEqual({ ticketId: 'ticket-e2e-0001', content: 'E2E test cevabı' })
    await expect(page.getByText('Cevap gönderildi.')).toBeVisible()
  })

  test('etkileşim: durum filtresi seçilince talepler o durumla yeniden istenir', async ({ page }) => {
    const statuses: string[] = []
    await installApiMocks(page, withAdminMenu({
      'AdminService/getTickets': async (route: any, headers: Record<string, string>) => {
        statuses.push(route.request().postDataJSON()?.status)
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ success: true, tickets: [], total: 0 }) })
      },
    }))
    await gotoAuthed(page)
    await openScreen(page, 'AdminTicketListView')
    await expect.poll(() => statuses.length).toBeGreaterThan(0)
    expect(statuses[0]).toBe('ALL')

    // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: durum filtresi sayfa içi panelde; "Sorgula" ile uygulanır.
    const view = page.locator('.ticket-list-view')
    const panel = view.locator('.ek-filter')
    // Panel masaüstünde açık başlar, dar ekranda kapalı: kapalıysa başlıktan aç.
    const toggle = view.getByRole('button', { name: /Filtreler/ })
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
    await expect(panel.locator('form')).toBeVisible()
    await panel.locator('.v-select').filter({ hasText: 'Talep durumu' }).click()
    await page.getByRole('option', { name: 'Açık' }).click()
    await panel.getByRole('button', { name: /Sorgula/ }).click()
    await expect.poll(() => statuses.includes('OPEN')).toBe(true)
  })

  test('etkileşim: "+" düğmesi yeni talep diyaloğunu açar; boş gönderimde uyarı verir, istek atmaz', async ({ page }) => {
    let createCalls = 0
    await installApiMocks(page, withAdminMenu({
      'AdminService/createTicket': async (route: any, headers: Record<string, string>) => {
        createCalls++
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ success: true }) })
      },
    }))
    await gotoAuthed(page)
    await openScreen(page, 'AdminTicketListView')

    // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: "+" başlık düğmesi yerine başlık eylemi "Yeni talep başlat".
    await page.getByRole('button', { name: 'Yeni talep başlat' }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Yeni Destek Talebi Başlat' })
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: /TALEBİ OLUŞTUR/ }).click()
    await expect(page.getByText('Lütfen tüm alanları doldurunuz.')).toBeVisible()
    expect(createCalls).toBe(0)
  })

  test('ekran görüntüsü tabanı (talep listesi)', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminTicketListView')
    await expect(page.getByText('E2E Sipariş senkronizasyonu gecikiyor')).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('admin-tickets-list.png', { fullPage: false })
  })

  test('ekran görüntüsü tabanı (talep detayı / sohbet)', async ({ page }) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminTicketListView')
    await page.getByText('E2E Sipariş senkronizasyonu gecikiyor').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Destek Talebi Detayı' })
    await expect(dialog).toContainText('İnceliyoruz, kısa süre içinde dönüş yapacağız.')
    await page.waitForTimeout(500)
    await expect(page).toHaveScreenshot('admin-tickets-chat.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — talep listesi', async ({ page }, testInfo) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminTicketListView')
    await expect(page.getByText('E2E Sipariş senkronizasyonu gecikiyor')).toBeVisible()
    // Geçiş animasyonu (sekme/diyalog opaklık geçişi) bitmeden ölçülürse yarı saydam renkler yanlış kontrast
    // sonucu üretir — ölçüm ÖNCESİ oturmasını bekle.
    await page.waitForTimeout(600)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-AdminTicketListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] AdminTicketListView (tüm sayfa, kabuk dahil): ${results.violations.length} WCAG 2.1 AA ihlali — ${results.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
    const scoped = await new AxeBuilder({ page }).include('.ticket-list-view').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    console.log(`[axe] AdminTicketListView (yalnız ekran): ${scoped.violations.length} ihlal — ${scoped.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
  })

  test('axe: WCAG 2.1 AA taraması — talep detayı diyaloğu', async ({ page }, testInfo) => {
    await installApiMocks(page, withAdminMenu())
    await gotoAuthed(page)
    await openScreen(page, 'AdminTicketListView')
    await page.getByText('E2E Sipariş senkronizasyonu gecikiyor').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Destek Talebi Detayı' })
    await expect(dialog).toContainText('İnceliyoruz, kısa süre içinde dönüş yapacağız.')
    // Geçiş animasyonu (sekme/diyalog opaklık geçişi) bitmeden ölçülürse yarı saydam renkler yanlış kontrast
    // sonucu üretir — ölçüm ÖNCESİ oturmasını bekle.
    await page.waitForTimeout(600)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-AdminChatComponent-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] AdminChatComponent (tüm sayfa, kabuk dahil): ${results.violations.length} WCAG 2.1 AA ihlali — ${results.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
    const scoped = await new AxeBuilder({ page }).include('.v-overlay--active .v-overlay__content').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    console.log(`[axe] AdminChatComponent (yalnız diyalog): ${scoped.violations.length} ihlal — ${scoped.violations.map((v) => `${v.id}(${v.nodes.length})`).join(', ')}`)
  })
})
