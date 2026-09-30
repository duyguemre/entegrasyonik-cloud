// A6a — destek talebi diyalogları (TicketCreateDialog + TicketDetailComponent) premium etkileşimleri:
// radiogroup klavye, doğrulama, gönderim durumları (başarı/hata + içerik korunur), yanıt kutusu, axe WCAG 2.1 AA = 0.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'

const messages = [
  { senderType: 'CLIENT', senderName: 'E2E Kullanıcı', content: 'Fatura oluşturamıyorum.', date: '2026-09-28T10:05:00.000Z' },
  { senderType: 'SUPPORT', senderName: 'Destek Ekibi', content: 'İnceliyoruz.', date: '2026-09-28T11:05:00.000Z' },
]
const tickets = {
  tickets: [
    { _id: 'ticket-e2e-0001', ticketNumber: 'DSK-100001', subject: 'E2E fatura kesim sorunu', type: 'BILLING', priority: 'HIGH', status: 'IN_PROGRESS', lastMessageSnippet: 'İnceliyoruz.', lastMessageAt: '2026-09-29T09:00:00.000Z', createdDate: '2026-09-28T10:00:00.000Z', messages },
    { _id: 'ticket-e2e-0002', ticketNumber: 'DSK-100002', subject: 'E2E kapalı talep', type: 'TECHNICAL', priority: 'LOW', status: 'CLOSED', lastMessageAt: '2026-09-20T09:00:00.000Z', createdDate: '2026-09-19T10:00:00.000Z', updatedDate: '2026-09-21T10:00:00.000Z', messages },
  ],
  totalNumberOfRecords: 2,
}
const created = { _id: 'ticket-e2e-new', ticketNumber: 'TKT-1042', subject: 'E2E yeni talep', type: 'BUG', priority: 'URGENT', status: 'OPEN', createdDate: '2026-09-29T10:00:00.000Z', messages: [] }

async function open(page: Page, extra: Record<string, unknown> = {}) {
  await installApiMocks(page, { MenuService: menuFixtureWithAccountSupport, 'TicketService/getTickets': tickets, ...extra })
  await gotoAuthed(page)
  await openScreen(page, 'TicketListView')
  await page.getByText('DSK-100001').first().waitFor()
}

const json = (body: unknown, status = 200) => async (route: any, headers: any) =>
  route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).include('.v-overlay--active').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
}

async function openCreate(page: Page) {
  await page.getByRole('button', { name: 'Yeni Bilet Aç' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Yeni destek talebi' })
  await expect(dialog).toBeVisible()
  return dialog
}

test.describe('A6a — Yeni destek talebi diyaloğu', () => {
  test('talep tipi ve öncelik radiogroup: ok tuşlarıyla gezilir, seçim aria-checked ile bildirilir', async ({ page }) => {
    await open(page)
    const dialog = await openCreate(page)
    const types = dialog.getByRole('radiogroup', { name: 'Talep tipi' })
    await expect(types.getByRole('radio')).toHaveCount(6)
    await expect(types.getByRole('radio', { name: /Genel/ })).toHaveAttribute('aria-checked', 'true')

    await types.getByRole('radio', { name: /Genel/ }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(types.getByRole('radio', { name: /Teknik Destek/ })).toHaveAttribute('aria-checked', 'true')
    await expect(types.getByRole('radio', { name: /Teknik Destek/ })).toBeFocused()
    await page.keyboard.press('End')
    await expect(types.getByRole('radio', { name: /Diğer/ })).toHaveAttribute('aria-checked', 'true')
    await page.keyboard.press('ArrowRight')
    await expect(types.getByRole('radio', { name: /Genel/ })).toHaveAttribute('aria-checked', 'true')

    const prio = dialog.getByRole('radiogroup', { name: 'Öncelik' })
    await expect(prio.getByRole('radio')).toHaveCount(4)
    await prio.getByRole('radio', { name: /Orta/ }).focus()
    await page.keyboard.press('ArrowDown')
    await expect(prio.getByRole('radio', { name: /Yüksek/ })).toHaveAttribute('aria-checked', 'true')
    // Yalnız seçili kart Tab durağı
    await expect(prio.getByRole('radio', { name: /Orta/ })).toHaveAttribute('tabindex', '-1')
  })

  test('doğrulama: boş gönderimde istek atılmaz, alan hataları görünür ve odak ilk hatalı alana gider', async ({ page }) => {
    let called = 0
    await open(page, { 'TicketService/openTicket': async (route: any, headers: any) => { called++; return json(created)(route, headers) } })
    const dialog = await openCreate(page)
    await dialog.getByRole('button', { name: 'Talebi Gönder' }).click()
    await expect(dialog.getByText('Konu zorunludur')).toBeVisible()
    await expect(dialog.getByText('Mesaj alanı zorunludur')).toBeVisible()
    await expect(dialog.getByLabel('Konu', { exact: true })).toBeFocused()
    expect(called).toBe(0)
    expect(await axe(page)).toEqual([])
  })

  test('sayaç: canlı güncellenir; eşik aşımı hata verir ve gönderimi engeller', async ({ page }) => {
    await open(page)
    const dialog = await openCreate(page)
    await dialog.getByLabel('Konu', { exact: true }).fill('Kısa')
    await expect(dialog.getByText('4 / 120')).toBeVisible()
    await dialog.getByLabel('Mesajınız', { exact: true }).fill('x'.repeat(4001))
    await dialog.getByRole('button', { name: 'Talebi Gönder' }).click()
    await expect(dialog.getByText(/en fazla 4000 karakter/)).toBeVisible()
    await expect(dialog.getByText('4001 / 4000')).toBeVisible()
  })

  test('başarı: gövde değişmeden gider, özet talep no + konu gösterir, "Talebi görüntüle" ayrıntıyı açar', async ({ page }) => {
    let body: any = null
    await open(page, { 'TicketService/openTicket': async (route: any, headers: any) => { body = route.request().postDataJSON(); return json(created)(route, headers) } })
    const dialog = await openCreate(page)
    await dialog.getByRole('radio', { name: /Hata Bildirimi/ }).click()
    await dialog.getByRole('radio', { name: /^Acil/ }).click()
    await dialog.getByLabel('Konu', { exact: true }).fill('E2E yeni talep')
    await dialog.getByLabel('Mesajınız', { exact: true }).fill('Ayrıntılı açıklama.')
    await dialog.getByLabel('Mesajınız', { exact: true }).press('Control+Enter')

    await expect(dialog.getByText('Talebiniz alındı')).toBeVisible()
    await expect(dialog.getByText('TKT-1042')).toBeVisible()
    await expect(dialog.getByText('E2E yeni talep', { exact: true })).toBeVisible()
    expect(body).toEqual({ ticket: { subject: 'E2E yeni talep', type: 'BUG', priority: 'URGENT', message: 'Ayrıntılı açıklama.' } })
    expect(await axe(page)).toEqual([])

    await dialog.getByRole('button', { name: 'Talebi görüntüle' }).click()
    await expect(page.getByRole('dialog').filter({ hasText: 'Destek talebi TKT-1042' })).toBeVisible()
  })

  test('hata: ne oldu + ne yapılmalı gösterilir (ham hata YOK), içerik korunur, tekrar dene çalışır', async ({ page }) => {
    let n = 0
    await open(page, {
      'TicketService/openTicket': async (route: any, headers: any) => {
        n++
        return n === 1 ? json({ message: 'E2E sentetik hata' }, 500)(route, headers) : json(created)(route, headers)
      },
    })
    const dialog = await openCreate(page)
    await dialog.getByLabel('Konu', { exact: true }).fill('E2E yeni talep')
    await dialog.getByLabel('Mesajınız', { exact: true }).fill('Ayrıntılı açıklama.')
    await dialog.getByRole('button', { name: 'Talebi Gönder' }).click()

    const alert = dialog.getByRole('alert')
    await expect(alert).toContainText('Talebiniz oluşturulamadı')
    await expect(alert).toContainText('Yazdıklarınız korundu')
    await expect(alert).not.toContainText('500')
    await expect(dialog.getByLabel('Konu', { exact: true })).toHaveValue('E2E yeni talep')
    await expect(dialog.getByLabel('Mesajınız', { exact: true })).toHaveValue('Ayrıntılı açıklama.')
    expect(await axe(page)).toEqual([])

    await dialog.getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(dialog.getByText('Talebiniz alındı')).toBeVisible()
  })

  test('axe: boş form WCAG 2.1 AA = 0', async ({ page }) => {
    await open(page)
    await openCreate(page)
    expect(await axe(page)).toEqual([])
  })
})

test.describe('A6a — Talep ayrıntısı', () => {
  test('açık talep: başlık alanı, zaman çizgisi (açılış olayı + mesajlar) ve yanıt kutusu; axe = 0', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Görüntüle / Yanıtla' }).first().click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Destek talebi DSK-100001' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('İşleniyor')).toBeVisible()
    await expect(dialog.getByText('Yüksek')).toBeVisible()
    await expect(dialog.getByText('Muhasebe / Fatura')).toBeVisible()
    const log = dialog.getByRole('log', { name: 'Yazışma geçmişi' })
    await expect(log.getByText('DSK-100001 numaralı talep açıldı')).toBeVisible()
    await expect(log.getByText('Fatura oluşturamıyorum.')).toBeVisible()
    await expect(log.getByText('İnceliyoruz.')).toBeVisible()
    await expect(dialog.getByPlaceholder('Yanıtınızı buraya yazın...')).toBeVisible()
    expect(await axe(page)).toEqual([])
  })

  test('yanıt: Ctrl+Enter gönderir; boşken Gönder devre dışı; başarıda kutu temizlenir', async ({ page }) => {
    let body: any = null
    await open(page, {
      'TicketService/sendTicketMessage': async (route: any, headers: any) => {
        body = route.request().postDataJSON()
        return json({ _id: 'ticket-e2e-0001', status: 'IN_PROGRESS', lastMessageAt: '2026-09-29T10:00:00.000Z', messages: [...messages, { senderType: 'CLIENT', senderName: 'E2E Kullanıcı', content: 'Yeni yanıt', date: '2026-09-29T10:00:00.000Z' }] })(route, headers)
      },
    })
    await page.getByRole('button', { name: 'Görüntüle / Yanıtla' }).first().click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Destek talebi DSK-100001' })
    await expect(dialog.getByRole('button', { name: 'Gönder' })).toBeDisabled()
    const box = dialog.getByPlaceholder('Yanıtınızı buraya yazın...')
    await box.fill('Yeni yanıt')
    await expect(dialog.getByText('10 / 4000')).toBeVisible()
    await box.press('Control+Enter')
    await expect.poll(() => body).not.toBeNull()
    expect(body).toEqual({ ticketId: 'ticket-e2e-0001', content: 'Yeni yanıt', senderType: 'CLIENT' })
    await expect(dialog.getByRole('log').getByText('Yeni yanıt')).toBeVisible()
    await expect(box).toHaveValue('')
  })

  test('yanıt hatası: mesaj korunur, insan-okunur uyarı gösterilir', async ({ page }) => {
    await open(page, { 'TicketService/sendTicketMessage': mockError(500) })
    await page.getByRole('button', { name: 'Görüntüle / Yanıtla' }).first().click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Destek talebi DSK-100001' })
    const box = dialog.getByPlaceholder('Yanıtınızı buraya yazın...')
    await box.fill('Kaybolmamalı')
    await dialog.getByRole('button', { name: 'Gönder' }).click()
    await expect(dialog.getByRole('alert')).toContainText('Yanıtınız gönderilemedi')
    await expect(dialog.getByRole('alert')).toContainText('korundu')
    await expect(box).toHaveValue('Kaybolmamalı')
  })

  test('kapalı talep: yanıt kutusu yok, bilgi satırı + kapanış olayı; axe = 0', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Görüntüle / Yanıtla' }).nth(1).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Destek talebi DSK-100002' })
    await expect(dialog.getByText('Bu destek talebi kapatılmıştır')).toBeVisible()
    await expect(dialog.getByPlaceholder('Yanıtınızı buraya yazın...')).toHaveCount(0)
    await expect(dialog.getByRole('log').getByText('Talep kapatıldı')).toBeVisible()
    expect(await axe(page)).toEqual([])
  })
})
