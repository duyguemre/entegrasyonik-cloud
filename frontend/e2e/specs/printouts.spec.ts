// ADR-0015 B5-3 — PrintoutListView.vue (Çıktılar / yazdırma şablonu tasarımcısı).
// Protokol 13: bu spec önce DEĞİŞMEMİŞ ekrana karşı yazıldı.
//
// ÖNEMLİ KARAKTERİZASYON (DÜZELTİLMEDİ): Ekran bir liste sayfası DEĞİL, henüz tamamlanmamış bir
// şablon tasarımcısı taslağıdır ve HİÇBİR backend çağrısı yapmaz (script'te API/servis çağrısı yok;
// tablo verisi `items`/`headers` yerel sabitleri şablonda KULLANILMIYOR). Bu yüzden "liste verisi /
// boş durum / 500 hata" senaryoları uygulanamaz — bunun yerine "ağ isteği ÜRETMEZ" iddiası var.
// Üst kısımdaki Çıktı Tipi/Yazı Büyüklüğü/Yazı Tipi/Kopya Sayısı seçimleri `items`suz `v-select`,
// "Test Çıktısı"/"Temizle" düğmelerinin `@click`'i YOK (ölü kontroller).
//
// Yerleşim tüm viewport'larda aynıdır (`$vuetify.display` dallanması yok), bu yüzden bütün testler
// 3 projede de koşar. Seçiciler metin/etiket/`#a4` tabanlıdır (kök sınıf yoktu).
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'

async function open(page: Page) {
  await installApiMocks(page, { MenuService: menuFixtureWithAccountSupport })
  await gotoAuthed(page)
  await openScreen(page, 'PrintoutListView')
  await expect(page.locator('#a4')).toBeAttached()
}

// Ayar panelindeki "Sil" düğmesi (kabukta başka bir "Sil" adlı düğme daha var — metinle daraltılır).
const silBtn = (page: Page) => page.locator('button').filter({ hasText: /^\s*Sil\s*$/ })

// HTML5 sürükle-bırak SENTETİK olaylarla yürütülür: orijinal yerleşim tablet/mobilde bozuk (tuval
// ekran dışında/ayar alanlarının altında kalıyor — Karakterizasyon (DÜZELTİLMEDİ)), bu yüzden gerçek
// fare sürüklemesi yalnızca masaüstünde çalışırdı. Olay akışı gerçek olanla aynıdır:
// dragstart(kaynak, üst div'deki @dragstart'a kabarır) -> drop(#a4).
async function dragToCanvas(page: Page, source: import('@playwright/test').Locator, at: { x: number; y: number }) {
  const handle = await source.elementHandle()
  await page.evaluate(({ el, at }) => {
    const canvas = document.getElementById('a4')!
    const r = canvas.getBoundingClientRect()
    const dt = new DataTransfer()
    const sr = (el as HTMLElement).getBoundingClientRect()
    el!.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: sr.left + 5, clientY: sr.top + 5 }))
    canvas.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + at.x, clientY: r.top + at.y }))
  }, { el: handle, at })
}
const paletteItem = (page: Page, text: string) => page.locator('[draggable="true"]:not(#a4 *)').filter({ hasText: new RegExp(`^${text}$`) })

test.describe('ADR-0015 B5-3 — PrintoutListView (çıktı şablonu tasarımcısı)', () => {
  test('smoke: seçim alanları, test/temizle düğmeleri, alan paleti ve A4 tuvali render olur', async ({ page }) => {
    await open(page)

    for (const label of ['Çıktı Tipi', 'Yazı Büyüklüğü', 'Yazı Tipi', 'Kopya Sayısı']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeAttached() // v-select etiketi getByLabel ile bulunmaz
    }
    await expect(page.getByRole('button', { name: 'Test Çıktısı' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Temizle' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kaydet' })).toHaveCount(0) // `buttons`/Kaydet tanımlı ama şablonda YOK

    for (const group of ['Müşteri Bilgileri', 'Ürün Bilgileri', 'Fatura Bilgileri', 'Toplamlar']) {
      await expect(page.getByText(group, { exact: true })).toBeAttached()
    }
    await expect(page.locator('#a4')).toBeVisible()
  })

  test('alan paleti: 4 grupta 27 sürüklenebilir alan (Müşteri 7, Ürün 8, Fatura 9, Toplamlar 3)', async ({ page }) => {
    await open(page)

    await expect(page.locator('[draggable="true"]')).toHaveCount(27)
    for (const t of ['Müşteri Adı/Soyadı', 'Vergi Dairesi', 'Ürün Barkodu', 'Ürün Toplam Tutar', 'Sipariş Numarası', 'KDV %18', "KDV'li Toplam"]) {
      await expect(page.getByText(t, { exact: true })).toBeAttached()
    }
  })

  test('kâğıt boyutu: 4 düğme (a4, a4, a5, a5) — seçim tuval ölçüsünü değiştirir', async ({ page }) => {
    await open(page)
    const canvas = page.locator('#a4')
    // Tuval ölçüsü `v-card`'a `:width/:height` prop'uyla INLINE style olarak yazılır (görsel genişlik
    // flex daralmasıyla farklı olabilir — karakterizasyon: masaüstünde 630 yerine ~516 render olur —
    // bu yüzden iddia inline style değeri üzerinedir).
    const size = async () => {
      const st = (await canvas.getAttribute('style')) ?? ''
      const w = /width:\s*([\d.]+)px/.exec(st)?.[1]
      const h = /height:\s*([\d.]+)px/.exec(st)?.[1]
      return { w: Math.round(Number(w)), h: Math.round(Number(h)) }
    }

    // Karakterizasyon: 4 düğmenin adı yalnızca "a4"/"a5" (dikey/yatay ayrımı görünen metinde YOK).
    await expect(page.getByRole('button', { name: 'a4', exact: true })).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'a5', exact: true })).toHaveCount(2)

    // Varsayılan: A4 dikey 630x891
    await expect.poll(size).toEqual({ w: 630, h: 891 })
    await page.getByRole('button', { name: 'a4', exact: true }).nth(1).dispatchEvent('click') // yatay 891x630
    await expect.poll(size).toEqual({ w: 891, h: 630 })
    await page.getByRole('button', { name: 'a5', exact: true }).nth(0).dispatchEvent('click') // 630/1.414 x 891/1.414
    await expect.poll(size).toEqual({ w: 446, h: 630 })
    // Karakterizasyon (DÜZELTİLMEDİ): kâğıt düğmelerinin bir kısmı (özellikle 4.) seçim alanlarının
    // ALTINDA kalıyor (yüzde genişlikli flex yerleşimi) — gerçek tıklama engellenir; bu yüzden tıklama
    // olayı doğrudan gönderilir.
    await page.getByRole('button', { name: 'a5', exact: true }).nth(1).dispatchEvent('click')
    await expect.poll(size).toEqual({ w: 630, h: 446 })
    await page.getByRole('button', { name: 'a4', exact: true }).nth(0).dispatchEvent('click')
    await expect.poll(size).toEqual({ w: 630, h: 891 })
  })

  test('etkileşimler ağ isteği ÜRETMEZ (API sözleşmesi yok): boyut seçimi, Test Çıktısı, Temizle', async ({ page }) => {
    await open(page)
    await page.waitForTimeout(500)
    const requests: string[] = []
    page.on('request', (r) => { if (r.url().includes('/api/')) requests.push(r.method() + ' ' + r.url()) })

    await page.getByRole('button', { name: 'a5', exact: true }).first().dispatchEvent('click')
    await page.getByRole('button', { name: 'Test Çıktısı' }).dispatchEvent('click')
    await page.getByRole('button', { name: 'Temizle' }).dispatchEvent('click') // karakterizasyon: ölü düğme, hiçbir şey yapmaz
    await page.waitForTimeout(400)
    expect(requests).toEqual([])
    await expect(page.getByRole('button', { name: 'Test Çıktısı' })).toBeVisible()
  })

  test('sürükle-bırak: paletten tuvale bırakılan alan tuvalde yeni bir paragraf olur, palet öğesi yerinde kalır', async ({ page }) => {
    await open(page)
    await dragToCanvas(page, paletteItem(page, 'Ürün Adı'), { x: 300, y: 150 })

    const dropped = page.locator('#a4 p')
    await expect(dropped).toHaveCount(1)
    await expect(dropped).toHaveText('Ürün Adı')
    await expect(dropped).toHaveAttribute('type', 'move')
    await expect(dropped).toHaveAttribute('draggable', 'true')
    // Palet kopyalanır, taşınmaz (type="move" olmayan kaynak silinmez): palette hâlâ 27 öğe var.
    await expect(page.locator('[draggable="true"]:not(#a4 *)')).toHaveCount(27)
  })

  test('tuvaldeki alana tıklama: ayar paneli (Genişlik/Yükseklik/Sil) açılır; tekrar tıklama kapatır', async ({ page }) => {
    await open(page)
    await dragToCanvas(page, paletteItem(page, 'Tarih'), { x: 300, y: 150 })
    const dropped = page.locator('#a4 p')
    await expect(dropped).toHaveCount(1)

    await expect(page.getByLabel('Genişlik', { exact: true })).toHaveCount(0)
    await dropped.dispatchEvent('click')
    await expect(page.getByLabel('Genişlik', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Yükseklik', { exact: true })).toBeVisible()
    await expect(silBtn(page)).toBeVisible()
    // Seçili öğe mavi (#00f) renklenir
    await expect(dropped).toHaveCSS('color', 'rgb(0, 0, 255)')

    await dropped.dispatchEvent('click')
    await expect(page.getByLabel('Genişlik', { exact: true })).toHaveCount(0)
    await expect(dropped).toHaveCSS('color', 'rgb(0, 0, 0)')
  })

  test('Sil: seçili alanı tuvalden kaldırır', async ({ page }) => {
    await open(page)
    await dragToCanvas(page, paletteItem(page, 'Açıklama'), { x: 300, y: 150 })
    const dropped = page.locator('#a4 p')
    await dropped.dispatchEvent('click')
    await silBtn(page).dispatchEvent('click')
    await expect(page.locator('#a4 p')).toHaveCount(0)
    // Karakterizasyon (DÜZELTİLMEDİ): seçim state'i temizlenmez — silinen alanın paneli açık KALIR.
    await expect(silBtn(page)).toBeVisible()
  })

  test('tuvaldeki alan yeniden sürüklenince (type=move) eskisi kaldırılıp yenisi oluşur; alan sayısı artmaz', async ({ page }) => {
    await open(page)
    await dragToCanvas(page, paletteItem(page, 'İl'), { x: 300, y: 150 })
    await expect(page.locator('#a4 p')).toHaveCount(1)
    await dragToCanvas(page, page.locator('#a4 p'), { x: 350, y: 300 })
    await expect(page.locator('#a4 p')).toHaveCount(1)
    await expect(page.locator('#a4 p')).toHaveText('İl')
  })
})
