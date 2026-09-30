// P2 — MessageListView + MessageDetailComponent (ADR-0011 Karar 2 tablosu).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { buildMessage, messagesBosFixture, messagesDoluFixture } from '../fixtures/apiData'
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
    await expect(page.getByLabel('Mesaj içeriği, Ürün Adı veya Sipariş No').first()).toBeVisible()
    await expect(page.getByText('Ürün Sorusu')).toBeVisible()
    await expect(page.getByText('Sipariş Sorusu')).toBeVisible()
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
    await page.locator('.messageListView tbody tr').nth(1).locator('button:has(.mdi-eye-outline)').click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Sipariş Sorusu' })
    await expect(dialog).toBeVisible()
  })

  test('ekran görüntüsü tabanı (mesaj listesi)', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'MessageListView')
    // bkz. claims.spec.ts aynı yorumu — ekran görüntüsü öncesi içeriğin GERÇEKTEN göründüğü
    // bekleniyor (test determinizmi, kod DEĞİŞMEDİ).
    await expect(page.getByText('Ürün Sorusu').first()).toBeVisible()
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('messages-list.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması — mesaj listesi (ADR-0015 Aşama B çıkış kapısı: ekranın KENDİ içeriğinde 0 ihlal; kabuk/menü A grubunun kapsamıdır, ayrıca izlenir)', async ({ page }, testInfo) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'MessageListView')
    await expect(page.getByText('Ürün Sorusu').first()).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.messageListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-MessageListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] MessageListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
    // A-yaması gerekli (bkz. customers.spec.ts aynı not) — EkDataTable role=table + nested <table>.
    const knownDsIssues = new Set(['aria-required-children'])
    const ownViolations = results.violations.filter(v => !knownDsIssues.has(v.id))
    expect(ownViolations, JSON.stringify(ownViolations, null, 2)).toEqual([])
  })
})

// C2.5 — bekleme süresi rozeti + kanal karakter kuralı. Saat sabitlenir (rozet metni/tonu tarihe bağlı).
// Eşikler ÖNERİ (messageSla.ts): <24 sa neutral, 24–48 sa warning, >48 sa danger.
const SLA_NOW = new Date('2026-09-25T12:00:00.000Z')
const slaFixture = {
  messages: [
    buildMessage({ _id: 'sla-answered', status: 'ANSWERED', integrationCode: 'hepsiburada', text: 'Cevaplanmış soru', answer: 'Evet', date: '2026-09-20T12:00:00.000Z' }),
    buildMessage({ _id: 'sla-3h', text: 'Üç saattir bekleyen soru', date: '2026-09-25T09:00:00.000Z' }),
    buildMessage({ _id: 'sla-30h', text: 'Otuz saattir bekleyen soru', date: '2026-09-24T06:00:00.000Z' }),
    buildMessage({ _id: 'sla-52h', type: 'ORDER_QUESTION', text: 'Elli iki saattir bekleyen soru', context: { orderNumber: 'E2E-SLA-1' }, date: '2026-09-23T08:00:00.000Z' }),
    buildMessage({ _id: 'sla-hb', integrationCode: 'hepsiburada', text: 'Hepsiburada sorusu', date: '2026-09-25T11:00:00.000Z' }),
  ],
  totalNumberOfRecords: 5,
  totalNumberOfPages: 1,
}

test.describe('C2.5 — Mesaj bekleme süresi + karakter sınırı', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(SLA_NOW)
    await installApiMocks(page, { 'MessageService/getMessages': slaFixture, 'MessageService/markAsRead': { success: true } })
    await gotoAuthed(page)
    await openScreen(page, 'MessageListView')
    await expect(page.getByText('Üç saattir bekleyen soru')).toBeVisible()
  })

  test('bekleyen mesajda süre rozeti eşik tonuyla; cevaplanmışta rozet yok', async ({ page }) => {
    const rows = page.locator('.messageListView tbody tr')
    const chip = (text: string) => rows.filter({ hasText: text }).locator('.ek-message-wait')
    await expect(chip('Üç saattir')).toHaveText('Bekliyor: 3 sa')
    await expect(chip('Üç saattir')).toHaveAttribute('data-tone', 'neutral')
    await expect(chip('Otuz saattir')).toHaveText('Bekliyor: 1 gün 6 sa')
    await expect(chip('Otuz saattir')).toHaveAttribute('data-tone', 'warning')
    await expect(chip('Elli iki')).toHaveText('Uzun bekliyor: 2 gün')
    await expect(chip('Elli iki')).toHaveAttribute('data-tone', 'danger')
    await expect(chip('Cevaplanmış soru')).toHaveCount(0)
  })

  test('"Bekleyenler önce · bu sayfada" yalnız istemci tarafı sıralar', async ({ page }) => {
    const toggle = page.getByRole('button', { name: /Bekleyenler önce/ })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByText('Bu sayfada 4 bekleyen')).toBeVisible()
    const requests: string[] = []
    page.on('request', r => { if (r.url().includes('MessageService/getMessages')) requests.push(r.url()) })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const texts = page.locator('.messageListView tbody tr .ek-message-text__body')
    await expect(texts).toHaveText(['Elli iki saattir bekleyen soru', 'Otuz saattir bekleyen soru', 'Üç saattir bekleyen soru', 'Hepsiburada sorusu', 'Cevaplanmış soru'])
    expect(requests, 'sıralama sunucuya gitmez').toEqual([])
  })

  test('Trendyol yanıtı: 9 karakterde gönder devre dışı, 10 karakterde etkin; sayaç N / 2000', async ({ page }) => {
    await page.locator('.messageListView tbody tr').filter({ hasText: 'Üç saattir' }).getByRole('button', { name: 'Mesajı cevapla' }).click()
    const sheet = page.getByRole('dialog').filter({ hasText: 'Üç saattir bekleyen soru' })
    await expect(sheet).toBeVisible()
    await expect(sheet.locator('.ek-message-wait')).toHaveText('Bekliyor: 3 sa')
    await expect(sheet.getByText('Trendyol kuralı: 10–2000 karakter')).toBeVisible()
    const send = sheet.getByRole('button', { name: 'Cevabı gönder' })
    const box = sheet.getByLabel('Cevabınızı buraya yazınız…')
    await expect(send).toBeDisabled()
    await box.fill('123456789')
    await expect(send).toBeDisabled()
    await expect(sheet.getByText('En az 10 karakter gerekli (Trendyol kuralı).')).toBeVisible()
    await expect(sheet.locator('.v-counter')).toHaveText('9 / 2000')
    await box.fill('1234567890')
    await expect(send).toBeEnabled()
    await expect(sheet.locator('.v-counter')).toHaveText('10 / 2000')
  })

  test('kuralı bilinmeyen kanalda sayaç yalnız bilgi; kısa yanıt gönderilebilir', async ({ page }) => {
    await page.locator('.messageListView tbody tr').filter({ hasText: 'Hepsiburada sorusu' }).getByRole('button', { name: 'Mesajı cevapla' }).click()
    const sheet = page.getByRole('dialog').filter({ hasText: 'Hepsiburada sorusu' })
    await expect(sheet.getByText('Bu kanal için karakter sınırı tanımlı değil; sayaç bilgi amaçlıdır.')).toBeVisible()
    await sheet.getByLabel('Cevabınızı buraya yazınız…').fill('Var')
    await expect(sheet.getByRole('button', { name: 'Cevabı gönder' })).toBeEnabled()
    await expect(sheet.locator('.v-counter')).toHaveText('3')
  })

  test('axe: rozetli liste ve yanıt paneli — 0 ihlal', async ({ page }) => {
    const knownDsIssues = new Set(['aria-required-children'])
    const list = await new AxeBuilder({ page }).include('.messageListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(list.violations.filter(v => !knownDsIssues.has(v.id)), JSON.stringify(list.violations, null, 2)).toEqual([])
    await page.locator('.messageListView tbody tr').filter({ hasText: 'Elli iki' }).getByRole('button', { name: 'Mesajı cevapla' }).click()
    const sheet = page.getByRole('dialog').filter({ hasText: 'Elli iki saattir bekleyen soru' })
    await sheet.getByLabel('Cevabınızı buraya yazınız…').fill('kısa')
    await sheet.getByLabel('Cevabınızı buraya yazınız…').blur()
    await expect(sheet.getByText('En az 10 karakter gerekli (Trendyol kuralı).')).toBeVisible()
    // Panel kayma + mesaj geçişi bitmeden taranırsa ara renkler ölçülür; animasyonların bitmesi beklenir.
    await page.waitForFunction(() => document.getAnimations().every(a => a.playState !== 'running'))
    const detail = await new AxeBuilder({ page }).include('.v-overlay--active').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(detail.violations, JSON.stringify(detail.violations, null, 2)).toEqual([])
  })
})
