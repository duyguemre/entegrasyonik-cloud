// ADR-0034 / CHAT_UI_CONTRACT §9 — Otopilot web yerleşimi + mock taşıyıcı senaryoları (backend YOK).
// Kapsam: panel aç/kapa (düğme, kısayol, palet "sor"), kurulum akışları, onay akışları, tablo "daha fazla", hata/yeniden dene,
// durdur, kapalı (DISABLED), mobil tam ekran, klavye-yalnız akış, axe 0 (açık; koyu → otopilot-harness.spec.ts).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { ask, composer, dock, gotoWithOtopilot, launcher, NAME, openPanel, panel } from '../fixtures/otopilot'
import { installApiMocks } from '../fixtures/mockApi'
import { waitForShellReady } from '../fixtures/nav'

const AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const width = (page: Page) => page.viewportSize()?.width ?? 0
const desktopOnly = (page: Page) => test.skip(width(page) < 1024, 'masaüstü senaryosu')
const card = (page: Page) => page.locator('.ek-chat-confirm').last()

async function chatAxe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(AA).include('.ek-chat').analyze()
  expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
}

test.describe('Otopilot — giriş noktaları ve yerleşim', () => {
  test('üst bar düğmesi paneli açar/kapatır; ≥1280 px içerik itilir; odak composer\'da, kapanınca düğmeye döner', async ({ page }) => {
    desktopOnly(page)
    await gotoWithOtopilot(page)
    const areaBefore = (await page.locator('.workplace-area').boundingBox())!.width
    await openPanel(page)
    await expect(composer(page)).toBeFocused()
    await expect(dock(page)).toBeVisible()
    const areaAfter = (await page.locator('.workplace-area').boundingBox())!.width
    expect(areaBefore - areaAfter).toBeGreaterThanOrEqual(360) // push: çalışma alanı panel kadar daralır
    await page.getByRole('button', { name: 'Paneli kapat' }).click()
    await expect(dock(page)).toHaveCount(0)
    await expect(launcher(page)).toBeFocused()
  })

  test('Ctrl+J aç/kapat; composer\'da boşken Esc kapatır', async ({ page }) => {
    desktopOnly(page)
    await gotoWithOtopilot(page)
    await page.keyboard.press('Control+j')
    await expect(composer(page)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dock(page)).toHaveCount(0)
    await page.keyboard.press('Control+j')
    await expect(dock(page)).toBeVisible()
    await page.keyboard.press('Control+j')
    await expect(dock(page)).toHaveCount(0)
  })

  test('komut paleti: "Otopilot\'a sor: «…»" en üstte; Enter paneli açar ve metni gönderir', async ({ page }) => {
    desktopOnly(page)
    await gotoWithOtopilot(page)
    await page.keyboard.press('Control+k')
    await page.keyboard.type('satış özeti')
    const first = page.locator('.ek-search [role="option"]').first()
    await expect(first).toContainText(`${NAME}'a sor: «satış özeti»`)
    await page.keyboard.press('Enter')
    await expect(dock(page)).toBeVisible()
    await expect(panel(page).locator('.ek-chat-msg.is-user')).toContainText('satış özeti')
    await expect(panel(page).locator('.ek-chat-kpi')).toBeVisible()
  })

  test('tablet (<1280) üstüne biner: çalışma alanı daralmaz, scrim yok', async ({ page }) => {
    test.skip(width(page) < 768 || width(page) >= 1280, 'overlay aralığı')
    await gotoWithOtopilot(page)
    const before = (await page.locator('.workplace-area').boundingBox())!.width
    await openPanel(page)
    const after = (await page.locator('.workplace-area').boundingBox())!.width
    expect(Math.abs(before - after)).toBeLessThan(2)
    await expect(page.locator('.ek-otopilot-dock ~ .v-navigation-drawer__scrim, .v-navigation-drawer__scrim')).toHaveCount(0)
  })

  test('genişlik ayırıcısı klavyeyle 360–560 aralığında; tercih yeniden açılışta korunur', async ({ page }) => {
    desktopOnly(page)
    await gotoWithOtopilot(page)
    await openPanel(page)
    const sep = page.getByRole('separator', { name: 'Panel genişliği' })
    await expect(sep).toHaveAttribute('aria-valuenow', '400')
    await sep.focus()
    await page.keyboard.press('ArrowLeft')
    await expect(sep).toHaveAttribute('aria-valuenow', '416')
    await page.keyboard.press('Home')
    await expect(sep).toHaveAttribute('aria-valuenow', '560')
    await page.keyboard.press('End')
    await expect(sep).toHaveAttribute('aria-valuenow', '360')
    // Çekmece genişliği geçişle değişir; yerleşince 360 px.
    await expect.poll(async () => Math.round((await dock(page).boundingBox())!.width)).toBe(360)
    await page.reload()
    await waitForShellReady(page)
    await expect(dock(page)).toBeVisible() // açık kaldı (kullanıcı+tenant anahtarı)
    await expect(page.getByRole('separator', { name: 'Panel genişliği' })).toHaveAttribute('aria-valuenow', '360')
  })

  test('tam sayfa: panelden genişlet → /otopilot, aynı konuşma sürer; yan panele geri al', async ({ page }) => {
    desktopOnly(page)
    await gotoWithOtopilot(page)
    await openPanel(page)
    await ask(page, 'bu haftaki satış')
    await expect(panel(page).locator('.ek-chat-kpi')).toBeVisible()
    await page.getByRole('button', { name: 'Tam sayfada aç' }).click()
    await expect(page).toHaveURL(/\/otopilot$/)
    await expect(dock(page)).toHaveCount(0)
    await expect(page.locator('.ek-chat.is-page .ek-chat-kpi')).toBeVisible()
    await page.getByRole('button', { name: 'Yan panele al' }).click()
    await expect(dock(page).locator('.ek-chat-kpi')).toBeVisible()
  })

  test('kapalı (DISABLED): giriş noktaları gizli; palette "sor" yok; /otopilot kullanılamaz görünümü', async ({ page }) => {
    await gotoWithOtopilot(page, 'unavailable')
    await expect(page.locator('.workplace-tabs')).toBeVisible()
    await expect(launcher(page)).toHaveCount(0)
    await page.keyboard.press('Control+j')
    await expect(dock(page)).toHaveCount(0)
    await page.keyboard.press('Control+k')
    await page.keyboard.type('satış')
    await expect(page.locator('.ek-search [role="option"]').filter({ hasText: `${NAME}'a sor` })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.goto('/otopilot')
    await expect(page.getByText(`${NAME} şu an kapalı`)).toBeVisible()
  })

  test('mobil (<768): düğme tam ekran sayfayı açar; composer altta ve görünür', async ({ page }) => {
    test.skip(width(page) >= 768, 'mobil')
    await gotoWithOtopilot(page)
    await launcher(page).click()
    await expect(page).toHaveURL(/\/otopilot$/)
    await expect(dock(page)).toHaveCount(0)
    const input = composer(page)
    await expect(input).toBeVisible()
    const box = (await input.boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    await ask(page, 'onay bekleyen siparişler')
    await expect(page.locator('.ek-chat-table')).toBeVisible()
    await chatAxe(page)
  })
})

test.describe('Otopilot — sohbet senaryoları (mock)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(width(page) < 1024, 'senaryolar masaüstünde; mobil ayrı test')
  })

  test('orders-table: araç durumu, tablo (caption, 25/132), daha fazla → 50 satır, odak ilk yeni satırda; axe 0', async ({ page }) => {
    await gotoWithOtopilot(page)
    await openPanel(page)
    await ask(page, 'onay bekleyen siparişler')
    const table = panel(page).locator('.ek-chat-table')
    await expect(table.locator('caption')).toHaveText('Onay bekleyen siparişler — 25 / 132 kayıt')
    await expect(panel(page).locator('.ek-chat-progress.is-done')).toContainText('Tamamlandı · 25 kayıt')
    await expect(table.locator('tbody tr')).toHaveCount(25)
    await table.getByRole('button', { name: 'Daha fazla göster' }).click()
    await expect(table.locator('tbody tr')).toHaveCount(50)
    await expect(table.locator('tbody tr').nth(25)).toBeFocused()
    await expect(page.locator('p[role="status"]').first()).toHaveText(/Yanıt hazır: tablo, 25 satır/)
    await chatAxe(page)
  })

  test('approve-orders: odak kart başlığına; onayla → uygulanıyor → tamamlandı; composer onay sırasında pasif', async ({ page }) => {
    await gotoWithOtopilot(page, 'enabled', { speed: 1 })
    await openPanel(page)
    await ask(page, 'ilk 3 siparişi onayla')
    await expect(card(page)).toBeVisible()
    await expect(card(page).getByRole('heading', { name: '3 siparişi onayla' })).toBeFocused()
    await expect(composer(page)).toBeDisabled()
    await expect(composer(page)).toHaveAttribute('placeholder', 'Devam etmek için işlemi onaylayın ya da reddedin.')
    await expect(card(page)).toContainText('Pazaryerine / dış sisteme gönderilir')
    await chatAxe(page)
    await card(page).getByRole('button', { name: '3 siparişi onayla' }).click()
    await expect(card(page)).toContainText('Uygulanıyor…')
    await expect(card(page)).toContainText('3 sipariş onaylandı.')
    await expect(composer(page)).toBeEnabled()
  })

  test('approve-orders ret: "İşlem reddedildi." + "İşlem iptal edildi."', async ({ page }) => {
    await gotoWithOtopilot(page)
    await openPanel(page)
    await ask(page, 'siparişleri onayla')
    await card(page).getByRole('button', { name: 'Reddet' }).click()
    await expect(card(page)).toContainText('İşlem reddedildi.')
    await expect(panel(page)).toContainText('İşlem iptal edildi.')
  })

  test('delete-typed: ifade eşleşmeden onay pasif; "SİL 2" yazınca etkin', async ({ page }) => {
    await gotoWithOtopilot(page)
    await openPanel(page)
    await ask(page, 'taslakları sil')
    const approve = card(page).getByRole('button', { name: '2 ürünü sil' })
    await expect(approve).toBeDisabled()
    await card(page).getByLabel('Onaylamak için «SİL 2» yazın').fill('sil 2')
    await expect(approve).toBeDisabled()
    await card(page).getByLabel('Onaylamak için «SİL 2» yazın').fill('SİL 2')
    await expect(approve).toBeEnabled()
    await approve.click()
    await expect(card(page)).toContainText('2 ürün silindi.')
  })

  test('confirm-expire: istemci saati dolunca kart "Süre doldu", composer yeniden etkin', async ({ page }) => {
    await page.clock.install()
    await gotoWithOtopilot(page)
    await openPanel(page)
    await ask(page, 'hızlı onay')
    await expect(card(page)).toContainText('Kalan süre 0:10')
    await page.clock.fastForward('00:11')
    await expect(card(page)).toContainText('Süre doldu, yeniden isteyin.')
    await expect(composer(page)).toBeEnabled()
  })

  test('price-form: form doldur → gönder → onay kartına bağlanır', async ({ page }) => {
    await gotoWithOtopilot(page)
    await openPanel(page)
    await ask(page, 'bir ürünün fiyat güncelle')
    const form = panel(page).locator('.ek-chat-form')
    await form.getByLabel('Ürün *').fill('prd_0001')
    await form.getByLabel('Yeni fiyat *').fill('399.90')
    await form.locator('.v-select').click()
    await page.locator('.v-overlay--active').getByText('Trendyol', { exact: true }).click()
    await page.keyboard.press('Escape')
    await form.getByRole('button', { name: 'Önizle' }).click()
    await expect(form).toContainText('Form gönderildi.')
    await expect(card(page).getByRole('heading', { name: 'Fiyatı güncelle' })).toBeVisible()
  })

  test('interrupted: "Yanıt yarıda kaldı" + Yeniden dene → yeni tur', async ({ page }) => {
    await gotoWithOtopilot(page)
    await openPanel(page)
    await ask(page, 'kopma')
    const error = panel(page).locator('.ek-chat-error').last()
    await expect(error).toContainText('Yanıt yarıda kaldı')
    await error.getByRole('button', { name: 'Yeniden dene' }).click()
    await expect(panel(page).locator('.ek-chat-error')).toHaveCount(2)
  })

  test('long-stream: akışta Durdur (ve Esc) → "Durduruldu", composer etkin', async ({ page }) => {
    await gotoWithOtopilot(page, 'enabled', { speed: 1 })
    await openPanel(page)
    await ask(page, 'haftalık rapor')
    await expect(panel(page).locator('.ek-chat-msg.is-assistant[aria-busy="true"]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Durdur' })).toBeVisible()
    await page.getByRole('button', { name: 'Durdur' }).click()
    await expect(panel(page).locator('.ek-chat-msg.is-cancelled')).toContainText('Durduruldu')
    await expect(panel(page).locator('.ek-chat-msg.is-assistant[aria-busy="true"]')).toHaveCount(0)
    await ask(page, 'uzun rapor')
    await expect(page.getByRole('button', { name: 'Durdur' })).toBeVisible()
    await composer(page).focus()
    await page.keyboard.press('Escape')
    await expect(panel(page).locator('.ek-chat-msg.is-cancelled')).toHaveCount(2)
  })

  test('llm-key-invalid → "Kurulumu aç" → kurulum formu panelde → "Sohbete dön"', async ({ page }) => {
    await gotoWithOtopilot(page)
    await openPanel(page)
    await ask(page, 'anahtar')
    await panel(page).getByRole('button', { name: 'Kurulumu aç' }).click()
    await expect(panel(page).getByText('Kayıtlı anahtar ••••')).toBeVisible()
    await panel(page).getByRole('button', { name: 'Sohbete dön' }).click()
    await expect(composer(page)).toBeVisible()
  })

  test('denied / live-readonly / rate: güvenli ileti, destek kodu, retry yalnız yeniden denenebilirde', async ({ page }) => {
    await gotoWithOtopilot(page)
    await openPanel(page)
    await ask(page, 'yetkim var mı')
    await expect(panel(page).locator('.ek-chat-error').last()).toContainText('Destek kodu: EK-DEMO-4031')
    await expect(panel(page).locator('.ek-chat-error').last().getByRole('button', { name: 'Yeniden dene' })).toHaveCount(0)
    await ask(page, 'pazaryerine gönder')
    await expect(panel(page).locator('.ek-chat-error').last()).toContainText('Salt-okuma kipinde dış sisteme yazılamaz.')
    await ask(page, 'çok hızlı')
    await expect(panel(page).locator('.ek-chat-error').last().getByRole('button', { name: 'Yeniden dene' })).toBeVisible()
  })

  test('bilinmeyen parça türü → güvenli yedek görünüm; yeni sohbet listeyi temizler', async ({ page }) => {
    await gotoWithOtopilot(page)
    await openPanel(page)
    await ask(page, 'yeni tür')
    await expect(panel(page)).toContainText('Bu içerik bu sürümde gösterilemiyor')
    await page.getByRole('button', { name: 'Yeni sohbet' }).click()
    await expect(panel(page).locator('.ek-chat-msg.is-notice')).toContainText('Yeni sohbet başladı')
    await expect(panel(page).locator('.ek-chat-msg.is-user')).toHaveCount(0)
  })

  test('salt okuma rozeti (read-only)', async ({ page }) => {
    await gotoWithOtopilot(page, 'read-only')
    await openPanel(page)
    await expect(panel(page).locator('.ek-chat__badge')).toContainText('Salt okuma')
  })
})

test.describe('Otopilot — kurulum (BYOK)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(width(page) < 1024, 'masaüstü')
  })

  test('setup-required → test hatası → başarılı kayıt (sahip onayıyla) → sohbet; anahtar DOM\'da kalmaz', async ({ page }) => {
    await gotoWithOtopilot(page, 'setup-required')
    await launcher(page).click()
    const key = panel(page).getByLabel('API anahtarı')
    await expect(key).toHaveAttribute('type', 'password')
    await key.fill('sk-bad-123')
    await panel(page).getByRole('button', { name: 'Bağlantıyı test et' }).click()
    await expect(panel(page).getByTestId('ek-chat-test-result')).toContainText('Anahtar geçersiz ya da iptal edilmiş')
    await key.fill('sk-good-e2e-123')
    await panel(page).getByLabel(/hesap sahibi olarak/).check()
    await chatAxe(page)
    await panel(page).getByRole('button', { name: 'Kaydet' }).click()
    await expect(composer(page)).toBeVisible()
    expect(await page.content()).not.toContain('sk-good-e2e-123')
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
    expect(stored).not.toContain('sk-good-e2e-123')
  })

  test('setup-no-permission: yönetici görünümü, form yok', async ({ page }) => {
    await gotoWithOtopilot(page, 'setup-no-permission')
    await launcher(page).click()
    await expect(panel(page)).toContainText('yöneticinizin bir yapay zekâ sağlayıcı anahtarı tanımlaması gerekiyor')
    await expect(panel(page).getByLabel('API anahtarı')).toHaveCount(0)
  })

  test('consent-pending-owner → "Onaylıyorum" → sohbet', async ({ page }) => {
    await gotoWithOtopilot(page, 'consent-pending-owner')
    await launcher(page).click()
    await expect(panel(page)).toContainText('Onayınız gerekiyor')
    await expect(panel(page)).toContainText('Veri aktarım bilgilendirmesi')
    await chatAxe(page)
    await panel(page).getByRole('button', { name: 'Onaylıyorum' }).click()
    await expect(composer(page)).toBeVisible()
  })

  test('consent-pending-admin: bekleme metni, onay düğmesi yok', async ({ page }) => {
    await gotoWithOtopilot(page, 'consent-pending-admin')
    await launcher(page).click()
    await expect(panel(page)).toContainText('Hesap sahibinin onayı bekleniyor')
    await expect(panel(page).getByRole('button', { name: 'Onaylıyorum' })).toHaveCount(0)
  })

  test('Ayarlar → Otopilot ekranı: aynı bileşen (durum, kullanım, kaldır)', async ({ page }) => {
    await installApiMocks(page)
    await page.addInitScript(() => {
      ;(window as unknown as { __EK_CHAT_MOCK__: unknown }).__EK_CHAT_MOCK__ = { config: 'enabled', speed: 0 }
    })
    await page.goto('/settings/otopilot')
    await expect(page.getByRole('heading', { name: `${NAME} ayarları` })).toBeVisible()
    await expect(page.getByText('Kullanım (bilgi amaçlı)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Anahtarı kaldır' })).toBeVisible()
    const result = await new AxeBuilder({ page }).withTags(AA).include('.ek-otopilot-settings').analyze()
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})

test.describe('Otopilot — klavye-yalnız akış', () => {
  test('Ctrl+J → yaz + Enter → onay kartı başlığı odakta → Tab ile Reddet → Enter → composer; Esc kapatır', async ({ page }) => {
    test.skip(width(page) < 1024, 'masaüstü')
    await gotoWithOtopilot(page)
    await page.keyboard.press('Control+j')
    await expect(composer(page)).toBeFocused()
    await page.keyboard.type('siparişleri onayla')
    await page.keyboard.press('Enter')
    await expect(card(page).getByRole('heading', { name: '3 siparişi onayla' })).toBeFocused()
    // Başlıktan sonra ilk etkileşimli öğe Reddet (onay düğmesi değil — yanlışlıkla Enter'ı önler).
    await page.keyboard.press('Tab')
    await expect(card(page).getByRole('button', { name: 'Reddet' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(card(page)).toContainText('İşlem reddedildi.')
    await expect(composer(page)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dock(page)).toHaveCount(0)
  })
})
