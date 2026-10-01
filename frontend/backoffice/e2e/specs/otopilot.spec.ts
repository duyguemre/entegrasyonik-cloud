// CHAT-FE-3: Otopilot backoffice'te (CHAT_UI_CONTRACT §7.2). Mock taşıyıcı `window.__BO_CHAT_MOCK__` ile seçilir; bayraksız
// otomasyonda sohbet kapalıdır (mevcut specler/tabanlar değişmez). Görsel taban YOK (Windows'ta üretilir).
import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { signInFully } from '../support/session'

type Config = 'enabled' | 'setup-required' | 'setup-no-permission' | 'unavailable'
const NAME = 'Otopilot'
const launcher = (page: Page) => page.getByTestId('otopilot-launcher')
const dock = (page: Page) => page.getByTestId('otopilot-dock')
const panel = (page: Page) => page.locator('.ek-chat').first()
const composer = (page: Page) => page.getByRole('textbox', { name: `${NAME}'a mesaj` })
const desktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024

async function withChat(page: Page, config: Config) {
  await page.addInitScript((c) => {
    ;(window as unknown as { __BO_CHAT_MOCK__: unknown }).__BO_CHAT_MOCK__ = { config: c, speed: 0 }
  }, config)
  await signInFully(page)
}
async function chatAxe(page: Page, scope = '.ek-chat') {
  await page.waitForTimeout(400)
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).include(scope).analyze()
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([])
}

test.describe('Otopilot (backoffice)', () => {
  test('bayraksız otomasyonda kapalı: giriş noktaları gizli, palette "sor" yok', async ({ page }) => {
    await signInFully(page)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(launcher(page)).toHaveCount(0)
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: /Ekran, müşteri numarası/ }).fill('kuyruk')
    await expect(page.getByRole('option').filter({ hasText: `${NAME}'a sor` })).toHaveCount(0)
  })

  test('yan panel: düğme açar, salt okuma rozeti, içerik itilir (≥1280), yanıt parçası, axe 0; kapatınca odak düğmeye', async ({ page }) => {
    test.skip(!desktop(page), 'masaüstü')
    await withChat(page, 'enabled')
    const main = page.locator('#bo-main')
    const before = (await main.boundingBox())!.width
    await launcher(page).click()
    await expect(dock(page)).toBeVisible()
    await expect(composer(page)).toBeFocused()
    await expect(panel(page).getByText('Salt okuma')).toBeVisible()
    expect((await main.boundingBox())!.width).toBeLessThan(before - 300)
    await composer(page).fill('satış özeti')
    await composer(page).press('Enter')
    await expect(panel(page).locator('.ek-chat-kpi')).toBeVisible()
    await chatAxe(page)
    await page.getByRole('button', { name: 'Paneli kapat' }).click()
    await expect(dock(page)).toHaveCount(0)
    await expect(launcher(page)).toBeFocused()
  })

  test('Ctrl+J aç/kapat; palet "Otopilot\'a sor" en üstte, Enter panelde gönderir', async ({ page }) => {
    test.skip(!desktop(page), 'masaüstü')
    await withChat(page, 'enabled')
    await page.keyboard.press('Control+j')
    await expect(dock(page)).toBeVisible()
    await page.keyboard.press('Control+j')
    await expect(dock(page)).toHaveCount(0)
    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: /Ekran, müşteri numarası/ }).fill('satış özeti')
    await expect(page.getByRole('option').first()).toContainText(`${NAME}'a sor: «satış özeti»`)
    await page.keyboard.press('Enter')
    await expect(panel(page).locator('.ek-chat-msg.is-user')).toContainText('satış özeti')
  })

  test('tam sayfa: panelden genişlet → /otopilot (aynı konuşma) → yan panele al', async ({ page }) => {
    test.skip(!desktop(page), 'masaüstü')
    await withChat(page, 'enabled')
    await launcher(page).click()
    await composer(page).fill('satış')
    await composer(page).press('Enter')
    await expect(panel(page).locator('.ek-chat-kpi')).toBeVisible()
    await page.getByRole('button', { name: 'Tam sayfada aç' }).click()
    await expect(page).toHaveURL(/\/otopilot$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Otopilot' })).toBeVisible()
    await expect(page.locator('.ek-chat.is-page .ek-chat-kpi')).toBeVisible()
    await expect(dock(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Yan panele al' }).click()
    await expect(dock(page).locator('.ek-chat-kpi')).toBeVisible()
  })

  test('tam sayfa: "Yeni sohbet" onay ister (geri alınamaz); kurulum gerekiyorsa form yerine ayar bağlantısı', async ({ page }) => {
    test.skip(!desktop(page), 'masaüstü')
    await withChat(page, 'enabled')
    await page.goto('/otopilot')
    const full = page.locator('.ek-chat.is-page')
    await composer(page).fill('satış')
    await composer(page).press('Enter')
    await expect(full.locator('.ek-chat-kpi')).toBeVisible()
    await full.getByRole('button', { name: 'Yeni sohbet' }).click()
    const ask = page.getByRole('alertdialog', { name: 'Yeni sohbet başlatılsın mı?' })
    await expect(ask).toContainText('geri alınamaz')
    await ask.getByRole('button', { name: 'Vazgeç' }).click()
    await expect(full.locator('.ek-chat-kpi')).toBeVisible()
    await full.getByRole('button', { name: 'Yeni sohbet' }).click()
    await ask.getByRole('button', { name: 'Konuşmayı sil' }).click()
    await expect(full.locator('.ek-chat-kpi')).toHaveCount(0)
    await chatAxe(page)
  })

  test('tam sayfa kurulum gerekiyorsa: gerekçesiz form yok, Otopilot ayarına bağlantı', async ({ page }) => {
    test.skip(!desktop(page), 'masaüstü')
    await withChat(page, 'setup-required')
    await page.goto('/otopilot')
    const link = page.getByTestId('otopilot-setup-link')
    await expect(link).toBeVisible()
    await expect(page.locator('.ek-chat.is-page').getByLabel('API anahtarı')).toHaveCount(0)
    await link.getByRole('link', { name: 'Otopilot ayarını aç' }).click()
    await expect(page).toHaveURL(/\/sistem\/otopilot$/)
    await expect(page.getByTestId('platform-key-reason')).toBeVisible()
  })

  test('platform anahtarı kurulumu (Sistem ayarları → Otopilot): test hatası → kayıt; anahtar DOM/depoda kalmaz; depo yalnız bo: öneki', async ({ page }) => {
    await withChat(page, 'setup-required')
    await page.goto('/sistem/otopilot')
    await expect(page.getByRole('heading', { level: 1, name: 'Otopilot' })).toBeVisible()
    await expect(page.getByText('platformun kendi yapay zekâ sağlayıcı anahtarıyla çalışır')).toBeVisible()
    const key = page.getByLabel('API anahtarı')
    await expect(key).toHaveAttribute('type', 'password')
    await key.fill('sk-bad-123')
    await page.getByRole('button', { name: 'Bağlantıyı test et' }).click()
    await expect(page.getByTestId('ek-chat-test-result')).toContainText('Anahtar geçersiz')
    await key.fill('sk-good-bo-123')
    await page.getByLabel(/platform yöneticisi olarak/).check()
    await chatAxe(page, '#bo-main')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.getByText('Kayıtlı anahtar ••••')).toBeVisible()
    expect(await page.content()).not.toContain('sk-good-bo-123')
    const store = await page.evaluate(() => ({ local: { ...localStorage }, session: JSON.stringify({ ...sessionStorage }) }))
    expect(JSON.stringify(store)).not.toContain('sk-good-bo-123')
    expect(Object.keys(store.local).filter((k) => /chat/i.test(k)).every((k) => k.startsWith('bo:chat:'))).toBe(true)
    await page.getByTestId('open-otopilot').click()
    await expect(composer(page)).toBeVisible()
    expect(Object.keys(await page.evaluate(() => ({ ...localStorage }))).some((k) => k.startsWith('bo:chat:'))).toBe(true)
  })

  test('anahtar yokken panel kurulum formunu gösterir; ayar metni platform dilinde', async ({ page }) => {
    test.skip(!desktop(page), 'masaüstü')
    await withChat(page, 'setup-no-permission')
    await launcher(page).click()
    await expect(panel(page)).toContainText('Platform anahtarı gerekiyor')
    await expect(panel(page).getByLabel('API anahtarı')).toHaveCount(0)
  })

  test('mobil: düğme tam sayfayı açar; yatay kaydırma yok; axe 0', async ({ page }) => {
    test.skip(desktop(page), 'mobil')
    await withChat(page, 'enabled')
    await launcher(page).click()
    await expect(page).toHaveURL(/\/otopilot$/)
    await expect(composer(page)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
    await chatAxe(page)
  })
})
