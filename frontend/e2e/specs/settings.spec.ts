// ADR-0015 B5-3 — secure/SettingListView.vue (Mağaza ayarları, 4 sekme).
// Protokol 13: bu spec önce DEĞİŞMEMİŞ ekrana karşı yazıldı (karakterizasyon); görsel yenilemeden
// sonra AYNI spec yeşil kalmalıdır.
import { test, expect } from '@playwright/test'
import { suppressTourOffer } from '../fixtures/appDialog'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'

function withMenu(overrides: Record<string, any> = {}) {
  return { MenuService: menuFixtureWithAccountSupport, ...overrides }
}

const settingsDolu = {
  settings: {
    storeName: 'Elif Ticaret',
    brandColor: '#10B981',
    logo: '',
    alertEmail: 'hata@example.com',
    supportPhone: '02120000000',
    timezone: 'Europe/London',
    workingDays: [1, 2, 3],
    mersisNo: '0123456789012345',
    ticaretSicilNo: 'TS-4455',
    shippingDuration: 4,
    desi: 2,
    warranty: 24,
    maxPurchaseQuantity: 50,
    taxPercentage: 20,
    invoice: {
      type: 1,
      firstname: 'Elif',
      lastname: 'Yıldız',
      tckn: '10000000146',
      phone: '05000000000',
      companyName: 'Elif Ticaret A.Ş.',
      taxOffice: 'Kadıköy',
      taxNumber: '1234567890',
      address: 'Örnek Mah. 1. Sok. No:1',
      city: 'İstanbul',
      district: 'Kadıköy',
    },
  },
}

/** Kaydet çağrısını yakalar; `respond` verilmezse `{ _id }` (başarı) döner. */
function captureSave(sink: { body: any; calls: number; getCalls: number }, opts: { saveResponse?: any; settings?: any } = {}) {
  return withMenu({
    'SettingService/getSettings': async (route: any, headers: any) => {
      sink.getCalls++
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(opts.settings ?? settingsDolu) })
    },
    'SettingService/updateSettings': async (route: any, headers: any) => {
      sink.calls++
      sink.body = route.request().postDataJSON?.()
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(opts.saveResponse ?? { _id: 'set-e2e-1' }) })
    },
  })
}

async function tab(page: any, name: string) {
  await page.getByRole('tab', { name }).click()
}

test.describe('ADR-0015 B5-3 — SettingListView', () => {
  // Sağ alttaki tur teklifi kartı alt sabit "Ayarları Kaydet" çubuğunu örter (kaydırılamaz) → kullanıcı gibi önce kapatılmış sayılır.
  test.beforeEach(async ({ page }) => { await suppressTourOffer(page) })

  test('smoke: 4 sekme + Mağaza Kimliği alanları + kaydet düğmesi render olur', async ({ page }) => {
    await installApiMocks(page, withMenu())
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')

    await expect(page.locator('.settingListView')).toBeVisible()
    for (const name of ['Mağaza Kimliği', 'Fatura & Yasal Bilgiler', 'Lojistik & Operasyon', 'İletişim & Bildirimler']) {
      await expect(page.getByRole('tab', { name })).toBeVisible()
    }
    await expect(page.getByLabel('Mağaza Adı', { exact: true })).toBeVisible()
    await expect(page.getByText('Mağaza Renk Paleti')).toBeVisible()
    await expect(page.getByText('Mağaza Logosu')).toBeVisible()
    await expect(page.getByText('Önizleme', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ayarları Kaydet' })).toBeVisible()
  })

  test('mevcut ayarlar API\'den yüklenir: mağaza adı alanı ve önizleme', async ({ page }) => {
    await installApiMocks(page, withMenu())
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')

    // Varsayılan fixture: yalnızca storeName döner.
    await expect(page.getByLabel('Mağaza Adı', { exact: true })).toHaveValue('E2E Test Mağazası')
    await expect(page.locator('.settingListView').getByText('E2E Test Mağazası', { exact: true })).toBeVisible()
    await expect(page.getByText('Doğrulanmış Mağaza')).toBeVisible()
  })

  test('karakterizasyon: eksik alanlar için varsayılanlar (marka rengi, saat dilimi, çalışma günleri, fatura tipi)', async ({ page }) => {
    await installApiMocks(page, withMenu())
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')

    await expect(page.getByLabel('Seçili Renk Kodu', { exact: true })).toHaveValue('#4F46E5')
    await tab(page, 'Lojistik & Operasyon')
    await expect(page.locator('.v-window-item--active').getByText('Europe/Istanbul')).toBeVisible()
    for (const d of ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma']) {
      await expect(page.getByLabel(d, { exact: true })).toBeChecked()
    }
    await expect(page.getByLabel('Cumartesi', { exact: true })).not.toBeChecked()
    await expect(page.getByLabel('Pazar', { exact: true })).not.toBeChecked()
    // Varsayılan (staticsStore) etiket ipuçları
    await expect(page.getByText('(Varsayılan: 3)').first()).toBeVisible()
    await expect(page.getByText('(Varsayılan: 12)').first()).toBeVisible()
    await expect(page.getByText('(Varsayılan: 99)').first()).toBeVisible()
  })

  test('sekmeler: Fatura — kurumsal alanlar yalnız fatura tipi Kurumsal iken görünür', async ({ page }) => {
    await installApiMocks(page, withMenu())
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')

    await tab(page, 'Fatura & Yasal Bilgiler')
    await expect(page.getByLabel('İsim', { exact: true })).toBeVisible()
    await expect(page.getByLabel('T.C. Kimlik No', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Firma Ünvanı', { exact: true })).toHaveCount(0)
    await expect(page.getByLabel('MERSIS No', { exact: true })).toHaveCount(0)

    // [DS-v2 Aşama 2 kabuk, Karar 5.1 izinli değişiklik 1 — yalnızca kapsam] Üst barda da radio (çalışma alanı anahtarı) var.
    await page.locator('.workplace-area').getByRole('radio').nth(1).check({ force: true })
    await expect(page.getByLabel('Firma Ünvanı', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Vergi Dairesi', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Vergi No', { exact: true })).toBeVisible()
    await expect(page.getByLabel('MERSIS No', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Ticaret Sicil No', { exact: true })).toBeVisible()
  })

  test('sekmeler: İletişim & Bildirimler alanları ve bilgi uyarısı', async ({ page }) => {
    await installApiMocks(page, withMenu())
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')

    await tab(page, 'İletişim & Bildirimler')
    await expect(page.getByLabel('Hata Bildirim E-postası', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Müşteri Destek Telefonu', { exact: true })).toBeVisible()
    await expect(page.getByText('Entegrasyon Sağlık Durumu')).toBeVisible()
  })

  test('mevcut değerler tüm sekmelere yüklenir', async ({ page }) => {
    const sink = { body: null as any, calls: 0, getCalls: 0 }
    await installApiMocks(page, captureSave(sink))
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')

    await expect(page.getByLabel('Mağaza Adı', { exact: true })).toHaveValue('Elif Ticaret')
    await expect(page.getByLabel('Seçili Renk Kodu', { exact: true })).toHaveValue('#10B981')

    await tab(page, 'Fatura & Yasal Bilgiler')
    await expect(page.getByLabel('İsim', { exact: true })).toHaveValue('Elif')
    await expect(page.getByLabel('Soyisim', { exact: true })).toHaveValue('Yıldız')
    await expect(page.getByLabel('T.C. Kimlik No', { exact: true })).toHaveValue('10000000146')
    await expect(page.getByLabel('Firma Ünvanı', { exact: true })).toHaveValue('Elif Ticaret A.Ş.')
    await expect(page.getByLabel('MERSIS No', { exact: true })).toHaveValue('0123456789012345')
    await expect(page.getByLabel('Fatura Adresi', { exact: true })).toHaveValue('Örnek Mah. 1. Sok. No:1')

    await tab(page, 'Lojistik & Operasyon')
    await expect(page.getByLabel(/Kargo Süresi/)).toHaveValue('4')
    await expect(page.getByLabel(/Garanti Süresi/)).toHaveValue('24')
    await expect(page.getByLabel(/Maksimum Satış Adedi/)).toHaveValue('50')
    await expect(page.getByLabel('Pazartesi', { exact: true })).toBeChecked()
    await expect(page.getByLabel('Cuma', { exact: true })).not.toBeChecked()

    await tab(page, 'İletişim & Bildirimler')
    await expect(page.getByLabel('Hata Bildirim E-postası', { exact: true })).toHaveValue('hata@example.com')
    await expect(page.getByLabel('Müşteri Destek Telefonu', { exact: true })).toHaveValue('02120000000')
  })

  test('kaydet: düzenlenen alanlar SettingService/updateSettings gövdesinde { settings } olarak gider, başarıda yeniden yüklenir + başarı bildirimi', async ({ page }) => {
    const sink = { body: null as any, calls: 0, getCalls: 0 }
    await installApiMocks(page, captureSave(sink))
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')
    await expect(page.getByLabel('Mağaza Adı', { exact: true })).toHaveValue('Elif Ticaret')
    const getsBefore = sink.getCalls

    await page.getByLabel('Mağaza Adı', { exact: true }).fill('Yeni Mağaza')
    await tab(page, 'İletişim & Bildirimler')
    await page.getByLabel('Hata Bildirim E-postası', { exact: true }).fill('yeni@example.com')
    await page.getByRole('button', { name: 'Ayarları Kaydet' }).click()

    await expect.poll(() => sink.calls).toBe(1)
    expect(Object.keys(sink.body)).toEqual(['settings'])
    expect(sink.body.settings.storeName).toBe('Yeni Mağaza')
    expect(sink.body.settings.alertEmail).toBe('yeni@example.com')
    // Dokunulmayan alanlar yüklenen değerleriyle aynen geri gider (iç içe fatura nesnesi dahil).
    expect(sink.body.settings.brandColor).toBe('#10B981')
    expect(sink.body.settings.timezone).toBe('Europe/London')
    expect(sink.body.settings.workingDays).toEqual([1, 2, 3])
    expect(sink.body.settings.shippingDuration).toBe(4)
    expect(sink.body.settings.taxPercentage).toBe(20)
    expect(sink.body.settings.invoice.companyName).toBe('Elif Ticaret A.Ş.')
    expect(sink.body.settings.invoice.type).toBe(1)

    await expect(page.getByText('Ayarlar başarıyla kaydedildi.')).toBeVisible()
    // Başarıdan sonra getSettings yeniden çağrılır.
    await expect.poll(() => sink.getCalls).toBeGreaterThan(getsBefore)
  })

  test('kaydet: sayı alanları number, çalışma günü/renk/fatura tipi değişiklikleri payload\'a yansır', async ({ page }) => {
    const sink = { body: null as any, calls: 0, getCalls: 0 }
    await installApiMocks(page, captureSave(sink))
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')
    await expect(page.getByLabel('Mağaza Adı', { exact: true })).toHaveValue('Elif Ticaret')

    await tab(page, 'Lojistik & Operasyon')
    await page.getByLabel(/Kargo Süresi/).fill('7')
    await page.locator('.v-checkbox label', { hasText: /^Cuma$/ }).click()
    await expect(page.getByLabel('Cuma', { exact: true })).toBeChecked()
    await page.locator('.v-checkbox label', { hasText: /^Pazartesi$/ }).click()
    await expect(page.getByLabel('Pazartesi', { exact: true })).not.toBeChecked()
    await page.getByRole('button', { name: 'Ayarları Kaydet' }).click()

    await expect.poll(() => sink.calls).toBe(1)
    expect(sink.body.settings.shippingDuration).toBe(7)
    expect(typeof sink.body.settings.shippingDuration).toBe('number')
    expect([...sink.body.settings.workingDays].sort()).toEqual([2, 3, 5])
  })

  test('marka rengi: palet swatch\'ı rengi değiştirir ve payload\'a yazılır', async ({ page }) => {
    const sink = { body: null as any, calls: 0, getCalls: 0 }
    await installApiMocks(page, captureSave(sink))
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')
    await expect(page.getByLabel('Seçili Renk Kodu', { exact: true })).toHaveValue('#10B981')

    // 5. palet öğesi = Ruby (#E11D48); swatch'lar `.color-swatch-item` sınıfıyla (palet sırası).
    await page.locator('.settingListView .color-swatch-item').nth(4).click()
    await expect(page.getByLabel('Seçili Renk Kodu', { exact: true })).toHaveValue('#E11D48')
    await page.getByRole('button', { name: 'Ayarları Kaydet' }).click()
    await expect.poll(() => sink.calls).toBe(1)
    expect(sink.body.settings.brandColor).toBe('#E11D48')
  })

  test('logo: "URL kullan" anahtarı yükleme alanı yerine URL alanı gösterir; girilen URL payload\'a gider', async ({ page }) => {
    const sink = { body: null as any, calls: 0, getCalls: 0 }
    await installApiMocks(page, captureSave(sink))
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')
    await expect(page.getByLabel('Mağaza Adı', { exact: true })).toHaveValue('Elif Ticaret')

    await expect(page.getByRole('button', { name: 'Logo Seç' })).toBeVisible()
    await expect(page.getByPlaceholder('https://example.com/logo.png')).toHaveCount(0)

    await page.getByLabel('URL kullan', { exact: true }).check({ force: true })
    await expect(page.getByRole('button', { name: 'Logo Seç' })).toHaveCount(0)
    await page.getByPlaceholder('https://example.com/logo.png').fill('https://example.com/e2e-logo.png')
    await page.getByRole('button', { name: 'Ayarları Kaydet' }).click()

    await expect.poll(() => sink.calls).toBe(1)
    expect(sink.body.settings.logo).toBe('https://example.com/e2e-logo.png')
  })

  test('logo yükleme: dosya seçilince identity upload çağrılır, başarıda URL + "?t=" ile ayarlanır', async ({ page }) => {
    let uploads = 0
    await installApiMocks(page, withMenu({
      'SettingService/getSettings': settingsDolu,
    }))
    // Upload uç noktası (restapi.postIdentityUpload) — yolu esnek yakala.
    await page.route(/\/api\/.*[Uu]pload.*/, async (route) => {
      const origin = (await route.request().headerValue('origin')) ?? '*'
      const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST,OPTIONS' }
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers, body: '' })
      uploads++
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ result: true, url: 'https://example.com/uploaded.png' }) })
    })
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')
    await expect(page.getByLabel('Mağaza Adı', { exact: true })).toHaveValue('Elif Ticaret')

    await page.locator('.settingListView input[type="file"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('e2e') })
    await expect(page.getByText('Logo başarıyla yüklendi.')).toBeVisible()
    expect(uploads).toBe(1)
    await expect(page.getByRole('button', { name: 'Logoyu Değiştir' })).toBeVisible()
  })

  test('hata durumu: kaydet yanıtı `_id` içermezse hata bildirimi, yeniden yükleme YOK', async ({ page }) => {
    const sink = { body: null as any, calls: 0, getCalls: 0 }
    await installApiMocks(page, captureSave(sink, { saveResponse: { message: 'x' } }))
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')
    await expect(page.getByLabel('Mağaza Adı', { exact: true })).toHaveValue('Elif Ticaret')
    const getsBefore = sink.getCalls

    await page.getByRole('button', { name: 'Ayarları Kaydet' }).click()
    await expect(page.getByText('Ayarlar kaydedilirken bir hata oluştu.')).toBeVisible()
    expect(sink.getCalls).toBe(getsBefore)
  })

  test('hata durumu: kaydetme 500 dönerse (Karakterizasyon, DÜZELTİLMEDİ) `postService` reddetmez; `_id` yok → aynı hata bildirimi', async ({ page }) => {
    // authorization.spec.ts ile AYNI gizli davranış: restapi 500'de reddetmiyor, catch bloğu
    // tetiklenmiyor; yanıt `_id` içermediği için "kaydedilirken bir hata oluştu" görünür.
    await installApiMocks(page, withMenu({ 'SettingService/updateSettings': mockError(500) }))
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')
    await expect(page.getByLabel('Mağaza Adı', { exact: true })).toHaveValue('E2E Test Mağazası')

    await page.getByRole('button', { name: 'Ayarları Kaydet' }).click()
    await expect(page.getByText('Ayarlar kaydedilirken bir hata oluştu.')).toBeVisible()
  })

  test('hata durumu: getSettings 500 dönerse form varsayılanlarla render olur, ham hata sızmaz (Karakterizasyon)', async ({ page }) => {
    // 500 gövdesinde `settings` yok → başlangıç `settings` ref'i (dolu nesne) kalır; form varsayılan
    // değerlerle (boş mağaza adı, #4F46E5) render olur, ham hata sızmaz.
    await installApiMocks(page, withMenu({ 'SettingService/getSettings': mockError(500) }))
    await gotoAuthed(page)
    await openScreen(page, 'SettingListView')

    await expect(page.getByLabel('Mağaza Adı', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Seçili Renk Kodu', { exact: true })).toHaveValue('#4F46E5')
    await expect(page.getByText('E2E sentetik hata')).toHaveCount(0)
  })
})
