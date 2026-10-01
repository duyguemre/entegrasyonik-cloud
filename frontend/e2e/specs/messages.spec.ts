// P2 — MessageListView + MessageDetailComponent (ADR-0011 Karar 2 tablosu).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { messagesBosFixture, messagesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'

// NOT (orders.spec.ts ile aynı gerçek davranış): `v-data-table-server` yalnızca
// `$vuetify.display.mdAndUp` (>=960px) iken render oluyor; `chromium-tablet` (800px) de mobil
// kart düzenine düşüyor. Göz/cevapla ikonu etkileşimi bu yüzden yalnızca `chromium-desktop`'ta.

test.describe('P2 — Mesajlar (MessageListView)', () => {
  test('smoke: arama kutusu + mesaj satırları render olur', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'MessageListView')

    await expect(page.locator('.messageListView')).toBeVisible()
    await expect(page.getByLabel('Mesaj içeriği, ürün adı veya sipariş no').first()).toBeVisible()
    await expect(page.getByText('Ürün sorusu')).toBeVisible()
    await expect(page.getByText('Sipariş sorusu')).toBeVisible()
  })

  test('boş durum: sonuç yoksa "Mesaj bulunamadı" kartı gösterilir', async ({ page }) => {
    await installApiMocks(page, { 'MessageService/getMessages': messagesBosFixture })
    await gotoAuthed(page)
    await openScreen(page, 'MessageListView')

    await expect(page.getByText('Mesaj bulunamadı', { exact: true })).toBeVisible()
  })

  test('hata durumu: 500 alındığında "Mesajlar yüklenemedi" + Tekrar dene gösterilir (boştan AYRI), ham hata sızmaz', async ({ page }) => {
    // GİZLİ DAVRANIŞ (characterization, düzeltilmedi — BACKLOG.md): `restApi.post` HİÇBİR ZAMAN
    // reddetmiyor (bkz. restapi.ts `postService`); bu yüzden `getMessagesInternal`'daki `catch`
    // bloğu (snackbar) da HİÇ TETİKLENMİYOR, `res.messages` undefined kalıp liste güncellenmiyor —
    // kullanıcı "hata" ile "gerçekten kayıt yok" durumunu AYIRT EDEMİYOR.
    await installApiMocks(page, { 'MessageService/getMessages': mockError(500) })
    await gotoAuthed(page)
    await openScreen(page, 'MessageListView')

    // DS-v2 Aşama 2 — BİLİNÇLİ DAVRANIŞ DEĞİŞİKLİĞİ: hata artık boş durumdan ayrı (isRequestError); API çağrısı AYNI.
    await expect(page.getByText('Mesajlar yüklenemedi')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('etkileşim: göz ikonuna tıklayınca mesaj detayı açılır', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor')
    await installApiMocks(page, { 'MessageService/getMessages': messagesDoluFixture })
    await gotoAuthed(page)
    await openScreen(page, 'MessageListView')

    // İkinci satır (message-e2e-0002, status READ) 'mdi-eye' gösterir; ilk satır (WAITING_SELLER)
    // 'mdi-message-reply-text' gösterir (bkz. template `:icon` koşulu) — 'mdi-eye' seçici READ olanı
    // hedefler (davranış AYNI, yalnızca deterministik bir satır seçiyoruz).
    await page.locator('.messageListView tbody tr').nth(1).locator('button:has([class*="mdi-eye"])').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Sipariş sorusu' })
    await expect(dialog).toBeVisible()
  })

  test('ekran görüntüsü tabanı (mesaj listesi)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'MessageListView')
    // bkz. claims.spec.ts aynı yorumu — ekran görüntüsü öncesi içeriğin GERÇEKTEN göründüğü
    // bekleniyor (test determinizmi, kod DEĞİŞMEDİ).
    await expect(page.getByText('Ürün sorusu').first()).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('messages-list.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — mesaj listesi (ADR-0015 Aşama B çıkış kapısı: ekranın KENDİ içeriğinde 0 ihlal; kabuk/menü A grubunun kapsamıdır, ayrıca izlenir)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'MessageListView')
    await expect(page.getByText('Ürün sorusu').first()).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.messageListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-MessageListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] MessageListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
    // A-yaması gerekli (bkz. customers.spec.ts aynı not) — EkDataTable role=table + nested <table>.
    const knownDsIssues = new Set(['aria-required-children'])
    const ownViolations = results.violations.filter(v => !knownDsIssues.has(v.id))
    expect(ownViolations, JSON.stringify(ownViolations, null, 2)).toEqual([])
  })
})
