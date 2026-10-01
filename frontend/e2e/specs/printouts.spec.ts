// FR3 madde 15 (fe-r3c) — PrintoutListView: şablon galerisi → düzenleyici → önizleme → yazdır.
//
// BİLİNÇLİ DEĞİŞİKLİK (K49, FE_FEEDBACK_R3 madde 15): ADR-0015 B5-3'ün karakterize ettiği eski ekran backend'e hiç bağlı
// olmayan bir sürükle-bırak taslağıydı (ölü "Test Çıktısı/Temizle", state'e bağlı olmayan alanlar). Korunacak davranışı
// yoktu (ADR-0015 "işlevsiz ekranın yerine gerçek ekran" emsali); bu spec yeni ekranın sözleşmesidir:
//   - Hazır şablonlar salt-okunur → "Kopyasını düzenle"; şablonlar bu tarayıcıda (kullanıcı + mağaza) saklanır.
//   - Düzenleyici: alan/bileşen ekleme (tıkla veya sürükle), geri al/yinele, klavye, kaydedilmemiş uyarısı.
//   - Önizleme: örnek/stres/eksik veri + "Siparişlerim" (mevcut OrderService/getOrders), denetim, toplu yazdırma.
//   - Galeri açılışı backend'e istek ATMAZ (sipariş yalnız "Siparişleri getir" ile istenir).
// Yerleşim kabın genişliğine göre değişir (dar: Ekle/Tuval/Özellikler sekmeleri) → yardımcılar iki düzende çalışır.
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { ordersDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'

async function open(page: Page, extra: Record<string, unknown> = {}) {
  await installApiMocks(page, { MenuService: menuFixtureWithAccountSupport, ...extra })
  await gotoAuthed(page)
  await openScreen(page, 'PrintoutListView')
  await page.addStyleTag({ content: '[data-help-tour-offer]{display:none!important}' }) // tanıtım turu kartı menülerin üstüne biner
  await expect(page.locator('.printoutListView .ek-tpl-card').first()).toBeVisible()
}

const card = (page: Page, name: string) => page.locator('.ek-tpl-card').filter({ has: page.getByRole('heading', { name, exact: true }) })
const canvasEls = (page: Page) => page.locator('.ek-tpl-canvas [data-el]')

/** Dar düzende ilgili paneli açar (geniş düzende sekme yoktur). */
async function pane(page: Page, name: 'Ekle' | 'Tuval' | 'Özellikler') {
  const tabs = page.locator('.ek-tpl-editor__panes')
  if (await tabs.isVisible().catch(() => false)) await tabs.getByRole('tab', { name: new RegExp(name) }).click()
}

async function editCopyOf(page: Page, name: string) {
  await card(page, name).getByRole('button', { name: 'Kopyasını düzenle' }).click()
  await expect(page.locator('.ek-tpl-editor')).toBeVisible()
}

test.describe('FR3-15 — Çıktılar: şablon galerisi', () => {
  test('galeri: 6 hazır şablon, tür süzgeci, boş "Şablonlarım" ve açılışta API isteği yok', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (r) => { if (/\/api\/(OrderService\/getOrders\b|.*Template)/.test(r.url())) requests.push(r.url()) })
    await open(page)

    await expect(page.locator('.ek-tpl-card')).toHaveCount(6)
    for (const n of ['Kargo etiketi — standart', 'Kargo etiketi — kare', 'Sipariş fişi — A4', 'Sipariş fişi — A5', 'İrsaliye taslağı — A4', 'Toplama listesi — A4']) {
      await expect(card(page, n)).toHaveCount(1)
    }
    await expect(page.getByText('Henüz kendi şablonunuz yok', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /Boş şablon/ })).toBeVisible()
    // Küçük resimler gerçek render: kargo etiketinde barkod SVG'si var
    await expect(card(page, 'Kargo etiketi — standart').locator('.ek-tpl-el--barcode svg')).toHaveCount(1)

    await page.getByRole('tab', { name: /Kargo etiketi/ }).click()
    await expect(page.locator('.ek-tpl-card')).toHaveCount(2)
    expect(requests).toEqual([])
  })

  test('kopyasını düzenle → kaydet → galeride "Şablonlarım"da; sayfa yenilenince korunur', async ({ page }) => {
    await open(page)
    await editCopyOf(page, 'Kargo etiketi — kare')
    await expect(page.getByLabel('Şablon adı')).toHaveValue('Kargo etiketi — kare (kopya)')
    await page.getByLabel('Şablon adı').fill('Depo etiketi')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    await expect(page.locator('.ek-tpl-editor__state')).toHaveText(/Kaydedildi/)
    await page.getByRole('button', { name: 'Şablonlar' }).click()
    await expect(card(page, 'Depo etiketi')).toHaveCount(1)
    await expect(page.locator('.ek-tpl-card')).toHaveCount(7)

    await page.reload()
    // Çalışma alanı sekmeleri geri yüklenir (Çıktılar sekmesi açık kalır, etkin sekme Anasayfa olur).
    await page.locator('.workplace-tabs').getByText('Çıktılar', { exact: true }).click()
    await expect(card(page, 'Depo etiketi')).toHaveCount(1)
  })

  test('sil: onay diyaloğuyla kullanıcı şablonu silinir; hazır şablonda Sil yok', async ({ page }) => {
    await open(page)
    await card(page, 'Toplama listesi — A4').getByRole('button', { name: /işlemleri|Diğer/ }).last().click()
    await expect(page.getByRole('menuitem', { name: 'Sil' })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'Çoğalt' }).click()
    await expect(card(page, 'Toplama listesi — A4 (kopya)')).toHaveCount(1)
    await card(page, 'Toplama listesi — A4 (kopya)').getByRole('button', { name: /işlemleri|Diğer/ }).last().click()
    await page.getByRole('menuitem', { name: 'Sil' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Sil' }).click()
    await expect(card(page, 'Toplama listesi — A4 (kopya)')).toHaveCount(0)
  })
})

test.describe('FR3-15 — Çıktılar: düzenleyici', () => {
  test('alan ekle (tıkla) → özellikler; geri al / yinele; Del siler; ok tuşu 1 mm taşır', async ({ page }) => {
    await open(page)
    await editCopyOf(page, 'Kargo etiketi — kare')
    const before = await canvasEls(page).count()

    await pane(page, 'Ekle')
    await page.getByRole('button', { name: 'Alıcı telefonu alanını ekle' }).click()
    await pane(page, 'Tuval')
    await expect(canvasEls(page)).toHaveCount(before + 1)
    await expect(page.locator('.ek-tpl-editor__state')).toHaveText(/Kaydedilmedi/)
    await expect(page.locator('.ek-tpl-editor__pos')).toHaveText(/X 5 · Y/)

    // Ok tuşu: odak tuvaldeki yeni öğede
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.ek-tpl-editor__pos')).toHaveText(/X 6 · Y/)
    await page.keyboard.press('Shift+ArrowRight')
    await expect(page.locator('.ek-tpl-editor__pos')).toHaveText(/X 11 · Y/)

    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    await expect(page.locator('.ek-tpl-editor__pos')).toHaveText(/X 5 · Y/)
    await page.keyboard.press('Control+z')
    await expect(canvasEls(page)).toHaveCount(before)
    await page.keyboard.press('Control+Shift+z')
    await expect(canvasEls(page)).toHaveCount(before + 1)

    await canvasEls(page).last().focus()
    await page.keyboard.press('Delete')
    await expect(canvasEls(page)).toHaveCount(before)
  })

  test('paletten tuvale sürükle-bırak: öğe bırakılan konumda oluşur', async ({ page }) => {
    await open(page)
    await editCopyOf(page, 'Sipariş fişi — A4')
    const before = await canvasEls(page).count()
    await pane(page, 'Ekle')
    await page.getByRole('tab', { name: 'Bileşenler' }).click()
    const handle = await page.getByRole('button', { name: 'QR kod ekle' }).elementHandle()
    await pane(page, 'Tuval')
    await page.evaluate((src) => {
      const frame = document.querySelector('.ek-tpl-canvas__frame') as HTMLElement
      const r = frame.getBoundingClientRect()
      const dt = new DataTransfer()
      src!.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
      frame.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
    }, handle)
    await expect(canvasEls(page)).toHaveCount(before + 1)
    await expect(canvasEls(page).last().locator('svg')).toHaveCount(1) // QR örnek veriden çizildi
  })

  test('kâğıt yönü tuvali çevirir; kaydedilmemiş değişiklikte çıkış onay ister', async ({ page }) => {
    await open(page)
    await editCopyOf(page, 'Sipariş fişi — A5')
    await page.keyboard.press('Escape')
    await pane(page, 'Özellikler')
    const frame = page.locator('.ek-tpl-canvas__frame')
    const ratio = async () => { const b = await frame.boundingBox(); return b ? b.width / b.height : 0 }
    await page.getByRole('group', { name: 'Yön' }).getByRole('button', { name: 'Yatay' }).click()
    await pane(page, 'Tuval')
    await expect.poll(ratio).toBeGreaterThan(1)

    await page.getByRole('button', { name: 'Şablonlar' }).click()
    const dlg = page.getByRole('alertdialog')
    await expect(dlg.getByText('Kaydedilmemiş değişiklikler silinsin mi?')).toBeVisible()
    await dlg.getByRole('button', { name: 'Vazgeç' }).click()
    await expect(page.locator('.ek-tpl-editor')).toBeVisible()
  })
})

test.describe('FR3-15 — Çıktılar: önizleme ve yazdırma', () => {
  /** Yazdırma iframe'ini yakalar: print() çağrısında belge HTML'i saklanır (gerçek diyalog açılmaz). */
  async function capturePrint(page: Page) {
    await page.evaluate(() => {
      const w = window as unknown as { __printed?: string[] }
      w.__printed = []
      const orig = document.body.appendChild.bind(document.body)
      document.body.appendChild = <T extends Node>(n: T): T => {
        const r = orig(n)
        if (n instanceof HTMLIFrameElement && n.className.includes('ek-tpl-print-frame') && n.contentWindow) {
          n.contentWindow.print = () => { w.__printed!.push(n.contentDocument!.documentElement.outerHTML) }
        }
        return r
      }
    })
  }
  const printed = (page: Page) => page.evaluate(() => (window as unknown as { __printed?: string[] }).__printed ?? [])

  test('örnek veri: stres verisi denetimde taşma uyarısı; Yazdır @page boyutlu belge üretir', async ({ page }) => {
    await open(page)
    await card(page, 'Kargo etiketi — standart').getByRole('button', { name: /önizle/ }).first().click()
    await expect(page.locator('.ek-tpl-preview')).toBeVisible()
    await expect(page.getByText('Yazdırmaya hazır.')).toBeVisible()
    await page.getByText('Uzun içerik', { exact: true }).click()
    await expect(page.locator('.ek-tpl-preview__issues')).toContainText('sığmadı')

    await capturePrint(page)
    await page.getByRole('button', { name: /^Yazdır/ }).click()
    await expect.poll(async () => (await printed(page)).length).toBe(1)
    const html = (await printed(page))[0]
    expect(html).toContain('@page{size:100mm 150mm;margin:0}')
    expect(html.match(/class="ek-tpl-page"/g)?.length).toBe(1)
  })

  test('Siparişlerim: mevcut OrderService/getOrders ile 2 sipariş → tümünü seç → 2 sayfa yazdırılır', async ({ page }) => {
    await open(page, { 'OrderService/getOrders': ordersDoluFixture })
    await card(page, 'Sipariş fişi — A4').getByRole('button', { name: /önizle/ }).first().click()
    await page.getByRole('tab', { name: /Siparişlerim/ }).click()
    const req = page.waitForRequest((r) => r.url().includes('OrderService/getOrders'))
    await page.getByRole('button', { name: 'Siparişleri getir' }).click()
    expect((await req).postDataJSON()).toMatchObject({ searchOrderForm: { pagination: { page: 1, limit: 20 } } })
    await expect(page.locator('.ek-tpl-preview__list li')).toHaveCount(2)
    await page.getByRole('button', { name: 'Tümünü seç' }).click()
    await expect(page.locator('.ek-tpl-preview__page')).toHaveCount(2)
    await expect(page.locator('.ek-tpl-preview__page').first()).toContainText('E2E-100001')

    await capturePrint(page)
    await page.getByRole('button', { name: /Yazdır \(2 sayfa\)/ }).click()
    await expect.poll(async () => (await printed(page)).length).toBe(1)
    expect((await printed(page))[0].match(/class="ek-tpl-page"/g)?.length).toBe(2)
  })

  test('Siparişlerim hata durumu: eyleme dönük mesaj ve yeniden dene', async ({ page }) => {
    await open(page, { 'OrderService/getOrders': mockError(500) })
    await card(page, 'Sipariş fişi — A4').getByRole('button', { name: /önizle/ }).first().click()
    await page.getByRole('tab', { name: /Siparişlerim/ }).click()
    await page.getByRole('button', { name: 'Siparişleri getir' }).click()
    await expect(page.getByText(/Siparişler yüklenemedi/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Tekrar dene/ })).toBeVisible()
  })
})
