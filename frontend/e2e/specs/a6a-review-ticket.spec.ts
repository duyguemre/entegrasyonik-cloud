// A6a — destek talebi diyalogları (TicketCreateDialog + TicketDetailComponent) inceleme görüntüleri.
// İddia yok; yalnızca görüntü üretir. Günlük koşuda ATLANIR.
//   A6A_REVIEW=1 A6A_PHASE=before|after A6A_REVIEW_WIDTH=1440|390 E2E_PORT=4371 \
//     npx playwright test e2e/specs/a6a-review-ticket.spec.ts --project=chromium-desktop --workers=1
import { test, type Page } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithAccountSupport, openScreen } from '../fixtures/nav'

const ENABLED = process.env.A6A_REVIEW === '1'
const PHASE = process.env.A6A_PHASE === 'before' ? 'before' : 'after'
const WIDTH = Number(process.env.A6A_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.A6A_REVIEW_OUT || 'docs/a6a-review'
const NOW = new Date('2026-09-29T11:00:00.000Z')
const file = (name: string) => `${OUT}/ticket-${name}-${PHASE}-${WIDTH}.png`

const LONG_WORD = 'https://ornek.invalid/destek/ekran-goruntusu/siparis-senkronizasyonu-hata-detayi-20260928-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()

const longChat = Array.from({ length: 12 }, (_, i) => {
  const mine = i % 3 !== 1
  return {
    senderType: mine ? 'CLIENT' : 'SUPPORT',
    senderName: mine ? 'Ayşegül Karaosmanoğlu' : 'Destek Ekibi',
    content: i === 4
      ? `Hata ekran görüntüsü ve günlük kaydı bağlantısı: ${LONG_WORD}\nSatır sonu ile ikinci satır.`
      : i === 7
        ? 'Kontrol ettik; Trendyol tarafındaki sipariş paketleri 28 Eylül 14:20 civarında iki kez gönderilmiş. Yinelenen paketleri eşleştirip ayıklayacağız, işlem bitince size ayrıca haber vereceğiz. Bu sürede siparişleri elle onaylamanıza gerek yok.'
        : mine ? `Sipariş senkronizasyonu ${i + 1}. denemede de gecikiyor.` : 'Kaydınızı inceliyoruz, kısa süre içinde dönüş yapacağız.',
    date: at(60 - i * 4),
  }
})

const ticketRows = {
  tickets: [
    {
      _id: 'ticket-e2e-0001', ticketNumber: 'DSK-100001', subject: 'Sipariş senkronizasyonu gecikiyor', type: 'TECHNICAL', priority: 'HIGH',
      status: 'IN_PROGRESS', lastMessageSnippet: 'Kaydınızı inceliyoruz', lastMessageAt: at(2), createdDate: at(60), messages: longChat,
    },
    {
      _id: 'ticket-e2e-0002', ticketNumber: 'DSK-100002', subject: 'Fatura ayarı sorusu', type: 'BILLING', priority: 'LOW',
      status: 'CLOSED', lastMessageSnippet: 'Teşekkürler', lastMessageAt: at(200), createdDate: at(300), updatedDate: at(190),
      messages: [
        { senderType: 'CLIENT', senderName: 'Ayşegül Karaosmanoğlu', content: 'Fatura serisini nereden değiştirebilirim?', date: at(300) },
        { senderType: 'SUPPORT', senderName: 'Destek Ekibi', content: 'Hesap > Fatura ayarları bölümünden seri ön ekini güncelleyebilirsiniz.', date: at(250) },
        { senderType: 'CLIENT', senderName: 'Ayşegül Karaosmanoğlu', content: 'Teşekkürler, çözüldü.', date: at(200) },
      ],
    },
  ],
  totalNumberOfRecords: 2,
}

const created = {
  _id: 'ticket-e2e-new', ticketNumber: 'TKT-1042', subject: 'Trendyol siparişleri iki kez düşüyor', type: 'TECHNICAL', priority: 'HIGH',
  status: 'OPEN', createdDate: NOW.toISOString(), lastMessageAt: NOW.toISOString(),
  messages: [{ senderType: 'CLIENT', senderName: 'Müşteri', content: 'Aynı sipariş iki kez içeri aktarılıyor.', date: NOW.toISOString() }],
}

async function settle(page: Page, ms = 500) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function openList(page: Page, extra: Record<string, unknown> = {}) {
  await installApiMocks(page, { MenuService: menuFixtureWithAccountSupport, 'TicketService/getTickets': ticketRows, ...extra })
  await gotoAuthed(page)
  await openScreen(page, 'TicketListView')
  await page.getByText('DSK-100001').first().waitFor()
  await settle(page, 400)
}

async function openCreate(page: Page) {
  await page.getByRole('button', { name: 'Yeni Bilet Aç' }).click()
  await page.getByRole('dialog').filter({ hasText: 'Yeni destek talebi' }).waitFor()
  await settle(page, 500)
}

async function fillCreate(page: Page) {
  const d = page.getByRole('dialog')
  await d.getByLabel('Konu', { exact: true }).fill('Trendyol siparişleri iki kez düşüyor')
  await d.getByLabel('Mesajınız', { exact: true }).fill('Aynı sipariş paketi 28 Eylül 14:20 sıralarında iki kez içeri aktarıldı; stok da iki kez düştü. Sipariş no: SIP-E2E-1001.')
}

test.describe('A6a destek talebi inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca A6A_REVIEW=1 ile')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })
  test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(NOW) })

  test('create-bos', async ({ page }) => {
    await openList(page)
    await openCreate(page)
    await page.screenshot({ path: file('create-bos') })
  })

  test('create-dogrulama', async ({ page }) => {
    await openList(page)
    await openCreate(page)
    await page.getByRole('dialog').getByLabel('Konu', { exact: true }).fill('Kısa')
    await page.getByRole('dialog').getByRole('button', { name: 'Talebi Gönder' }).click()
    await settle(page, 500)
    await page.screenshot({ path: file('create-dogrulama') })
  })

  test('create-dolu', async ({ page }) => {
    await openList(page)
    await openCreate(page)
    await fillCreate(page)
    await settle(page, 300)
    await page.screenshot({ path: file('create-dolu') })
  })

  test('create-basari', async ({ page }) => {
    await openList(page, {
      'TicketService/openTicket': async (route: any, headers: any) =>
        route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(created) }),
    })
    await openCreate(page)
    await fillCreate(page)
    await page.getByRole('dialog').getByRole('button', { name: 'Talebi Gönder' }).click()
    await settle(page, 800)
    await page.screenshot({ path: file('create-basari') })
  })

  test('create-hata', async ({ page }) => {
    await openList(page, { 'TicketService/openTicket': mockError(500) })
    await openCreate(page)
    await fillCreate(page)
    await page.getByRole('dialog').getByRole('button', { name: 'Talebi Gönder' }).click()
    await settle(page, 800)
    await page.screenshot({ path: file('create-hata') })
  })

  test('detail-acik-uzun', async ({ page }) => {
    await openList(page)
    await page.getByRole('button', { name: 'Görüntüle / Yanıtla' }).first().click()
    await page.getByRole('dialog').waitFor()
    await settle(page, 700)
    await page.screenshot({ path: file('detail-acik-uzun') })
  })

  test('detail-kapali', async ({ page }) => {
    await openList(page)
    await page.getByRole('button', { name: 'Görüntüle / Yanıtla' }).nth(1).click()
    await page.getByRole('dialog').waitFor()
    await settle(page, 700)
    await page.screenshot({ path: file('detail-kapali') })
  })
})
