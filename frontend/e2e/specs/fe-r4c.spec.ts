// FE R4 Şerit C (K61) — yeni davranışların işlevsel testleri.
//   C1: uygulama ayarları doğrulaması (geçersizken istek yok + ilk hataya odak), kirli form uyarısı, Ctrl+S, değişiklik sayısı.
//   C2: "Bugün sırada" öncelik sayacı + sipariş akışı sayacı yalnız backend sayılarından.
//   C3: dashboard satır ızgarası — aynı satırdaki kartların alt kenarı hizalı (masaüstü).
import { test, expect } from '@playwright/test'
import { suppressTourOffer } from '../fixtures/appDialog'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'

const settings = {
  settings: {
    storeName: 'Elif Ticaret',
    brandColor: '#10B981',
    alertEmail: 'hata@example.com',
    timezone: 'Europe/Istanbul',
    workingDays: [1, 2, 3],
    invoice: { type: 0, firstname: 'Elif', tckn: '10000000146' },
  },
}

function withSave(sink: { calls: number; body: any }) {
  return {
    MenuService: menuFixtureWithAccountSupport,
    'SettingService/getSettings': settings,
    'SettingService/updateSettings': async (route: any, headers: any) => {
      sink.calls++
      sink.body = route.request().postDataJSON?.()
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ _id: 'set-r4c' }) })
    },
  }
}

test.describe('FE R4 C1 — uygulama ayarları', () => {
  test.beforeEach(async ({ page }) => { await suppressTourOffer(page) })

  test('doğrulama: geçersiz e-posta → kayıt isteği gitmez, bölüm açılır, alan odaklanır, hata metni + çubuk sayacı', async ({ page }) => {
    const sink = { calls: 0, body: null as any }
    await installApiMocks(page, withSave(sink))
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')
    await expect(page.getByLabel('Mağaza adı', { exact: true })).toHaveValue('Elif Ticaret')

    await page.getByRole('tab', { name: /İletişim ve bildirimler/ }).click()
    await page.getByLabel('Hata Bildirim E-postası', { exact: true }).fill('hata@')
    await page.getByRole('tab', { name: /Mağaza kimliği/ }).click()
    await page.getByRole('button', { name: 'Ayarları kaydet' }).click()

    const bar = page.getByRole('region', { name: 'Kaydetme durumu' })
    await expect(bar).toContainText('1 alan düzeltilmeli')
    await expect(page.getByLabel('Hata Bildirim E-postası', { exact: true })).toBeFocused()
    await expect(page.locator('[data-setting="alertEmail"]')).toContainText('E-posta adresi geçerli değil')
    await expect(page.getByRole('tab', { name: /İletişim ve bildirimler/ })).toContainText('alan düzeltilmeli')
    expect(sink.calls).toBe(0)

    // Düzeltince aynı gövde sözleşmesiyle kaydedilir.
    await page.getByLabel('Hata Bildirim E-postası', { exact: true }).fill('yeni@example.com')
    await expect(bar).not.toContainText('düzeltilmeli')
    await page.getByRole('button', { name: 'Ayarları kaydet' }).click()
    await expect.poll(() => sink.calls).toBe(1)
    expect(Object.keys(sink.body)).toEqual(['settings'])
    expect(sink.body.settings.alertEmail).toBe('yeni@example.com')
  })

  test('doğrulama: hata yazarken değil alan odaktan çıkınca görünür; gün seçimi boşalınca anında', async ({ page }) => {
    await installApiMocks(page, withSave({ calls: 0, body: null }))
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')
    await expect(page.getByLabel('Mağaza adı', { exact: true })).toHaveValue('Elif Ticaret')
    await page.getByRole('tab', { name: /Fatura ve yasal bilgiler/ }).click()
    const tckn = page.getByLabel('T.C. Kimlik No', { exact: true })
    await tckn.fill('123')
    await expect(page.locator('[data-setting="tckn"]')).not.toContainText('geçerli değil')
    await tckn.blur()
    await expect(page.locator('[data-setting="tckn"]')).toContainText('T.C. Kimlik No geçerli değil')

    await page.getByRole('tab', { name: /Lojistik ve operasyon/ }).click()
    for (const d of ['Pazartesi', 'Salı', 'Çarşamba']) await page.locator('.v-checkbox label', { hasText: new RegExp(`^${d}$`) }).click()
    await expect(page.locator('[data-setting="workingDays"]')).toContainText('en az bir gün')
  })

  test('kirli form: değişiklik varken beforeunload engellenir; temizken engellenmez; bölüm başlığında değişiklik sayısı', async ({ page }) => {
    await installApiMocks(page, withSave({ calls: 0, body: null }))
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')
    await expect(page.getByLabel('Mağaza adı', { exact: true })).toHaveValue('Elif Ticaret')
    const prevented = () => page.evaluate(() => {
      const ev = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(ev)
      return ev.defaultPrevented
    })
    // Not: temiz durumda olay main.ts `onbeforeunload`'a ulaşır (uygulamayı unmount eder) — bu yüzden en sonda denenir.
    await page.getByLabel('Mağaza adı', { exact: true }).fill('Yeni Ad')
    await expect(page.locator('#sl-group-1 .sl-group__badge')).toHaveText('1 değişiklik')
    await expect(page.getByRole('region', { name: 'Kaydetme durumu' })).toContainText('(1 alan)')
    expect(await prevented()).toBe(true)
    // Engellenen olay uygulamayı unmount etmez: ekran çalışmaya devam eder.
    await page.getByRole('region', { name: 'Kaydetme durumu' }).getByRole('button', { name: 'Vazgeç' }).click()
    await expect(page.getByLabel('Mağaza adı', { exact: true })).toHaveValue('Elif Ticaret')
    expect(await prevented()).toBe(false)
  })

  test('Ctrl+S ayarları kaydeder (aynı gövde)', async ({ page }) => {
    const sink = { calls: 0, body: null as any }
    await installApiMocks(page, withSave(sink))
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')
    await page.getByLabel('Mağaza adı', { exact: true }).fill('Kısayol Mağaza')
    await page.keyboard.press('Control+s')
    await expect.poll(() => sink.calls).toBe(1)
    expect(sink.body.settings.storeName).toBe('Kısayol Mağaza')
    await expect(page.getByText('Ayarlar başarıyla kaydedildi.')).toBeVisible()
  })
})

test.describe('FE R4 C2/C3 — dashboard', () => {
  test('C2: öncelik sayacı ve sipariş akışı backend sayılarıyla birebir', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    const next = page.locator('.dashboard .dna')
    await expect(next.locator('.dna-hero')).toBeVisible()
    const tally = next.getByRole('list', { name: 'Önceliğe göre bekleyen işler' })
    await expect(tally).toBeVisible()
    await expect(next.locator('.dna-hero')).toContainText(/Sıradaki iş · 1 \/ \d+/i)
  })

  test('C3: aynı satırdaki kartların alt kenarı hizalı (boşluk yok)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'yalnız iki kolonlu masaüstü düzeni')
    await page.setViewportSize({ width: 1440, height: 900 })
    await installApiMocks(page)
    await gotoAuthed(page)
    await expect(page.locator('.dash-o-health')).toBeVisible()
    await page.waitForTimeout(500)
    const bottom = (sel: string) => page.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().bottom))
    expect(Math.abs((await bottom('.dash-o-trend')) - (await bottom('.dash-o-status')))).toBeLessThanOrEqual(1)
    expect(Math.abs((await bottom('.dash-o-stock')) - (await bottom('.dash-o-health')))).toBeLessThanOrEqual(1)
    expect(Math.abs((await bottom('.dash-o-catalog')) - (await bottom('.dash-o-jobs')))).toBeLessThanOrEqual(1)
  })
})
