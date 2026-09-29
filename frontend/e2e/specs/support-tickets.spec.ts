// ADR-0015 B5-3 — supports/TicketListView.vue + components/ticket/{TicketCreateDialog,
// TicketDetailComponent}.vue (+ composables/useTicketFilters|useTicketActions — saf mantık,
// GÖRSEL KATMAN dışı, DOKUNULMADI). Protokol 13: bu spec önce DEĞİŞMEMİŞ ekrana karşı yazıldı.
//
// NOT: `TicketListView.vue`'nin masaüstü tablosu `$vuetify.display.mdAndUp`'a bağlı (Vuetify
// varsayılan eşiği 960px) — proje `chromium-tablet` viewport'u (800px) BUNUN ALTINDA, yani
// tablette de mobil kart görünümü render olur (yalnızca `chromium-desktop`, 1280px, tabloyu
// gösterir). Bu yüzden iddialar `getByText` ile (tablo hücresi/kart fark etmeksizin AYNI metin)
// yazıldı; tabloya/karta ÖZGÜ DOM yapısı test EDİLMEDİ.
import { test, expect } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'

function withSupportMenu(overrides: Record<string, any> = {}) {
  return { MenuService: menuFixtureWithAccountSupport, ...overrides }
}

const ticketsDoluFixture = {
  tickets: [
    {
      _id: 'ticket-e2e-0001', ticketNumber: 'DSK-100001', subject: 'E2E fatura kesim sorunu',
      type: 'BILLING', priority: 'HIGH', status: 'OPEN', lastMessageSnippet: 'Fatura oluşturulamıyor',
      lastMessageAt: '2026-09-29T09:00:00.000Z', createdDate: '2026-09-28T10:00:00.000Z',
      // Detay diyalogu satir nesnesini (`openTicketDetail(item)`) DOGRUDAN kullanir; ayri bir
      // detay istegi YOK — mesajlar liste yanitindaki satirdan gelir (karakterizasyon).
      messages: [
        { senderType: 'CLIENT', senderName: 'E2E Kullanıcı', content: 'Fatura oluşturamıyorum.', date: '2026-09-28T10:05:00.000Z' },
      ],
    },
    {
      _id: 'ticket-e2e-0002', ticketNumber: 'DSK-100002', subject: 'E2E entegrasyon sorusu',
      type: 'TECHNICAL', priority: 'LOW', status: 'CLOSED', lastMessageSnippet: undefined,
      lastMessageAt: '2026-09-20T09:00:00.000Z', createdDate: '2026-09-19T10:00:00.000Z',
    },
  ],
  totalNumberOfRecords: 2,
}

const ticketsBosFixture = { tickets: [], totalNumberOfRecords: 0 }

const ticketDetailFixture = {
  _id: 'ticket-e2e-0001', ticketNumber: 'DSK-100001', subject: 'E2E fatura kesim sorunu',
  status: 'OPEN', priority: 'HIGH', type: 'BILLING', createdDate: '2026-09-28T10:00:00.000Z',
  messages: [
    { senderType: 'CLIENT', senderName: 'E2E Kullanıcı', content: 'Fatura oluşturamıyorum.', date: '2026-09-28T10:05:00.000Z' },
  ],
}

test.describe('ADR-0015 B5-3 — TicketListView (destek) + TicketCreateDialog + TicketDetailComponent', () => {
  test('smoke: arama alanı + destek talebi kayıtları render olur', async ({ page }) => {
    await installApiMocks(page, withSupportMenu({ 'TicketService/getTickets': ticketsDoluFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'TicketListView')

    await expect(page.locator('.ticketListView')).toBeVisible()
    await expect(page.getByLabel('Destek No veya Konu Ara', { exact: true })).toBeVisible()
    await expect(page.getByText('DSK-100001')).toBeVisible()
    await expect(page.getByText('E2E fatura kesim sorunu')).toBeVisible()
    await expect(page.getByText('E2E entegrasyon sorusu')).toBeVisible()
  })

  test('boş durum: "Destek Talebi Bulunamadı" mesajı gösterilir', async ({ page }) => {
    await installApiMocks(page, withSupportMenu({ 'TicketService/getTickets': ticketsBosFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'TicketListView')

    await expect(page.getByText('Destek Talebi Bulunamadı')).toBeVisible()
  })

  // DS-v2 Aşama 2 — BİLİNÇLİ DEĞİŞİKLİK: 500 artık boş duruma DÜŞMEZ; "Destek talepleri yüklenemedi" + "Tekrar dene" gösterilir.
  test('hata durumu: 500 alındığında "Destek talepleri yüklenemedi" + "Tekrar dene" gösterilir', async ({ page }) => {
    await installApiMocks(page, withSupportMenu({ 'TicketService/getTickets': mockError(500) }))
    await gotoAuthed(page)
    await openScreen(page, 'TicketListView')

    await expect(page.getByText('Destek talepleri yüklenemedi')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
  })

  test('yeni bilet aç: diyalog açılır, gönderilince TicketService/openTicket çağrılır', async ({ page }) => {
    let created: any = null
    await installApiMocks(page, withSupportMenu({
      'TicketService/getTickets': ticketsDoluFixture,
      'TicketService/openTicket': async (route: any, headers: any) => {
        created = route.request().postDataJSON?.()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ _id: 'ticket-e2e-new' }) })
      },
    }))
    await gotoAuthed(page)
    await openScreen(page, 'TicketListView')

    await page.locator('.ticketListView button:has(.mdi-plus)').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'YENİ DESTEK TALEBİ' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('Konu', { exact: true }).fill('E2E test talebi')
    await dialog.getByLabel('Mesajınız', { exact: true }).fill('Bu bir E2E test mesajıdır.')
    await dialog.getByRole('button', { name: 'Talebi Gönder' }).click()

    await expect.poll(() => created).not.toBeNull()
    expect(created.ticket.subject).toBe('E2E test talebi')
    expect(created.ticket.message).toBe('Bu bir E2E test mesajıdır.')
  })

  test('detay: görüntüle/yanıtla ikonuna tıklayınca talep detayı açılır, yanıt gönderilince TicketService/sendTicketMessage çağrılır', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'Masaüstü tablodaki mdi-message-text-outline ikonuyla açılıyor (mdAndUp/>=960px); mobil kart aynı eylemi mdi-message-text ile sunar')
    let sendPayload: any = null
    await installApiMocks(page, withSupportMenu({
      'TicketService/getTickets': ticketsDoluFixture,
      'TicketService/sendTicketMessage': async (route: any, headers: any) => {
        sendPayload = route.request().postDataJSON?.()
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ _id: 'ticket-e2e-0001', messages: ticketDetailFixture.messages, status: 'OPEN', lastMessageAt: '2026-09-29T10:00:00.000Z' }) })
      },
    }))
    await gotoAuthed(page)
    await openScreen(page, 'TicketListView')

    await page.locator('.ticketListView button:has(.mdi-message-text-outline)').first().click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'DESTEK TALEBİ' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Fatura oluşturamıyorum.')).toBeVisible()

    await dialog.getByPlaceholder('Yanıtınızı buraya yazın...').fill('E2E yanıt mesajı')
    await dialog.getByRole('button', { name: 'Gönder' }).click()

    await expect.poll(() => sendPayload).not.toBeNull()
    expect(sendPayload.content).toBe('E2E yanıt mesajı')
  })

  test('karakterizasyon: kapatılmış (CLOSED) talepte "Kapat" düğmesi YOK', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', '"Kapat" satır eylemi yalnızca masaüstü tablosunda var; mobil kartta hiç render edilmiyor')
    await installApiMocks(page, withSupportMenu({ 'TicketService/getTickets': ticketsDoluFixture }))
    await gotoAuthed(page)
    await openScreen(page, 'TicketListView')

    await expect(page.locator('.ticketListView button:has(.mdi-check-circle-outline)')).toHaveCount(1)
  })
})
