// R7 (docs/FRONTEND_CODE_AUDIT.md G-01/BR-32) — ConfirmationDialogComponent characterization.
//
// Bu dosya iki iş yapar:
//  (1) "characterization" blokları: onay diyaloğunun BUGÜNKÜ görünür yapısını (kalın ad, satır
//      sonları, küçük not, düğme yazıları, iptal davranışı) sabitler — `v-html` kaldırılırken
//      görünümün AYNI kaldığının kanıtı. Değişiklikten ÖNCE de SONRA da yeşil olmalıdır.
//  (2) "güvenlik" bloğu: müşteri/pazaryeri kaynaklı alanlara HTML enjekte edildiğinde diyaloğun
//      bunu çalıştırmadığını (metin olarak gösterdiğini) doğrular — düzeltmeden ÖNCE KIRMIZI.
//
// Not: müşteri silme akışı hem masaüstü tablosunda hem mobil kartta `aria-label="Müşteriyi sil"`
// düğmesiyle çalışır — üç projede de aynı seçici kullanılır.
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { buildCustomer } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'

const collapse = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

async function openCustomerDeleteDialog(page: Page, customers?: any[]) {
  await installApiMocks(
    page,
    customers ? { 'CustomerService/getCustomers': { customers, totalNumberOfRecords: customers.length, totalNumberOfPages: 1 } } : {},
  )
  await gotoAuthed(page)
  await openScreen(page, 'CustomerListView')
  await page.getByRole('button', { name: 'Müşteriyi sil' }).first().click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'MÜŞTERİYİ SİL' })
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe('R7 — Onay diyaloğu (ConfirmationDialogComponent) characterization', () => {
  test('müşteri silme: başlık, kalın müşteri adı, satır sonları, küçük not ve düğmeler', async ({ page }) => {
    const dialog = await openCustomerDeleteDialog(page)

    await expect(dialog).toContainText('Bu işlem CRM ve Analiz verilerini etkileyecektir.')

    // Mesaj gövdesi: <b>Ad Soyad</b> + düz metin + <br><br> + <small>not</small>
    const body = dialog.locator('.ek-dialog__body')
    expect(collapse(await body.textContent())).toBe(
      'Ayşe Yılmaz isimli müşteriyi silmek istediğinize emin misiniz? Not: Sipariş geçmişi veritabanında anonim olarak kalmaya devam edecektir.',
    )
    await expect(body.locator('b')).toHaveCount(1)
    await expect(body.locator('b')).toHaveText('Ayşe Yılmaz')
    await expect(body.locator('br')).toHaveCount(2)
    await expect(body.locator('small')).toHaveCount(1)
    await expect(body.locator('small')).toContainText('Sipariş geçmişi veritabanında anonim olarak kalmaya devam edecektir.')

    // Görsel özellikler: ad kalın, not daha küçük yazı boyutunda.
    const boldWeight = await body.locator('b').evaluate((el) => Number(getComputedStyle(el).fontWeight))
    expect(boldWeight).toBeGreaterThanOrEqual(700)
    const [smallSize, bodySize] = await Promise.all([
      body.locator('small').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      body.locator('b').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ])
    expect(smallSize).toBeLessThan(bodySize)

    await expect(dialog.getByRole('button', { name: /EVET, SİL/ })).toBeVisible()
    await expect(dialog.getByRole('button', { name: /Vazgeç|İptal/i })).toBeVisible()
  })

  test('müşteri silme: iptal diyaloğu kapatır ve silme isteği ATILMAZ', async ({ page }) => {
    let deleteCalls = 0
    await installApiMocks(page, {
      'CustomerService/deleteCustomer': async (route, headers) => {
        deleteCalls++
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ success: true }) })
      },
    })
    await gotoAuthed(page)
    await openScreen(page, 'CustomerListView')
    await page.getByRole('button', { name: 'Müşteriyi sil' }).first().click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'MÜŞTERİYİ SİL' })
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: /Vazgeç|İptal/i }).click()
    await expect(dialog).toBeHidden()
    expect(deleteCalls).toBe(0)
  })

  test('müşteri silme: onay silme isteğini atar ve diyaloğu kapatır', async ({ page }) => {
    let deleteBody: any = null
    await installApiMocks(page, {
      'CustomerService/deleteCustomer': async (route, headers) => {
        deleteBody = route.request().postDataJSON?.()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ success: true }) })
      },
    })
    await gotoAuthed(page)
    await openScreen(page, 'CustomerListView')
    await page.getByRole('button', { name: 'Müşteriyi sil' }).first().click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'MÜŞTERİYİ SİL' })
    await dialog.getByRole('button', { name: /EVET, SİL/ }).click()

    await expect(dialog).toBeHidden()
    await expect.poll(() => deleteBody?.customerId).toBe('customer-e2e-0001')
  })

  test('düz metin mesaj (mesaj silme) tek satır olarak render olur, biçimlendirme öğesi yok', async ({ page }, testInfo) => {
    // Mesaj silme düğmesi yalnızca masaüstü tablosunda var (mobil kart düzeninde yok — mevcut davranış).
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablo (mdAndUp/>=960px) gerektiriyor')
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'MessageListView')
    await page.getByRole('button', { name: 'Mesajı sil' }).first().click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Mesajı Sil' })
    await expect(dialog).toBeVisible()
    const body = dialog.locator('.ek-dialog__body')
    expect(collapse(await body.textContent())).toBe('Seçili mesajı sistemden silmek istediğinize emin misiniz?')
    await expect(body.locator('b, br, small, strong')).toHaveCount(0)
  })
})

test.describe('R7 — Onay diyaloğu güvenliği (G-01 depolanmış XSS)', () => {
  const PAYLOAD_NAME = '<img src=x onerror="window.__xss=1">'
  const PAYLOAD_LAST = '<b id="xss-injected">kalın</b><script>window.__xss=2</script>'

  test('müşteri adına gömülü HTML çalıştırılmaz, metin olarak gösterilir', async ({ page }) => {
    const dialog = await openCustomerDeleteDialog(page, [
      buildCustomer({ firstName: PAYLOAD_NAME, lastName: PAYLOAD_LAST }),
    ])

    const body = dialog.locator('.ek-dialog__body')
    // Enjekte edilen hiçbir öğe DOM'a girmemeli.
    await expect(body.locator('img')).toHaveCount(0)
    await expect(body.locator('#xss-injected')).toHaveCount(0)
    await expect(body.locator('script')).toHaveCount(0)
    // Ham metin (etiketler dahil) kalın ad öğesinin içinde AYNEN görünür.
    await expect(body.locator('b').first()).toContainText('<img src=x onerror="window.__xss=1">')
    // Betik/olay işleyicisi çalışmamış olmalı.
    await page.waitForTimeout(200)
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined()
  })
})
