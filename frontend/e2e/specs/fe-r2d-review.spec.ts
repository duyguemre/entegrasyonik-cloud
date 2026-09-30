// fe-r2d — FR2-ORDERS (30-33) · FR2-SCREENS (34-37) · FR2-FIN (38) inceleme görüntüleri (önce/sonra).
// İddia yok; yalnız görüntü üretir. Günlük koşuda ATLANIR.
//   R2D_REVIEW=1 R2D_WIDTH=1440|390 R2D_OUT=docs/fe-r2d-review/<before|after> \
//     npx playwright test e2e/specs/fe-r2d-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop
import { test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, openScreen } from '../fixtures/nav'
import { r2dMocks } from '../fixtures/r2dReview'

const ENABLED = process.env.R2D_REVIEW === '1'
const WIDTH = Number(process.env.R2D_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.R2D_OUT || 'docs/fe-r2d-review/after'
const ONLY = (process.env.R2D_ONLY || '').split(',').filter(Boolean)
const FULL = process.env.R2D_FULL === '1'

const shot = async (page: Page, name: string, opts: { full?: boolean; locator?: string } = {}) => {
  await page.evaluate(() => document.fonts.ready)
  await page.addStyleTag({ content: '[data-help-tour-offer]{display:none!important}' })
  await page.waitForTimeout(500)
  if (opts.locator) {
    await page.locator(opts.locator).first().screenshot({ path: `${OUT}/${name}-${WIDTH}.png` })
    return
  }
  await page.screenshot({ path: `${OUT}/${name}-${WIDTH}.png`, fullPage: opts.full ?? FULL })
}

/** Liste satırındaki "detay" (göz) eylemi; dar ekranda kart düzeninde de aynı buton bulunur. */
async function openFirstDetail(page: Page, root: string, nth = 0) {
  const OPEN = 'button:has([class*="mdi-eye"]), button:has(.mdi-message-text-outline)'
  const rows = page.locator(`${root} tbody tr`).filter({ has: page.locator(OPEN) })
  const scope = (await rows.count()) ? rows.nth(nth) : page.locator(`${root} :is(.ek-grid-card, article, li):visible`).nth(nth)
  await scope.locator(OPEN).first().click()
  await page.locator('.ek-detail-sheet, .v-overlay--active .v-card').first().waitFor({ timeout: 5000 }).catch(() => undefined)
  await page.waitForTimeout(600)
}

/** Detay yan sayfasının kaydırılabilir gövdesini tam boy görüntüler (sheet içeriği). */
async function shotSheet(page: Page, name: string) {
  await shot(page, name)
  if (FULL) return
  const body = page.locator('.ek-detail-sheet__body, .ek-detail-sheet [class*=body]').first()
  if (await body.count()) {
    for (let i = 1; i <= 3; i++) {
      const more = await body.evaluate((el, step) => { el.scrollTop = el.clientHeight * step * 0.9; return el.scrollTop > 0 && el.scrollTop + el.clientHeight <= el.scrollHeight + 2 }, i)
      if (!more) break
      await page.waitForTimeout(250)
      await page.screenshot({ path: `${OUT}/${name}-kaydir${i}-${WIDTH}.png` })
      const end = await body.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
      if (end) break
    }
  }
}

/** Filtre paneli kapalıysa açar (masaüstünde varsayılan açık; dar ekranda kapalı). */
async function ensureFilters(page: Page, field: string) {
  const f = page.locator('.v-field:visible').filter({ hasText: field })
  if (!(await f.count())) await page.getByRole('button', { name: /Filtre/ }).first().click()
  await page.waitForTimeout(400)
}

type Case = { name: string; run: (page: Page) => Promise<void> }

const CASES: Case[] = [
  { name: 'siparis-liste', run: async (p) => { await openScreen(p, 'OrderListView'); await p.getByText('E2E-100001').first().waitFor(); await shot(p, 'siparis-liste') } },
  { name: 'siparis-durum-filtresi', run: async (p) => {
    await openScreen(p, 'OrderListView'); await p.getByText('E2E-100001').first().waitFor()
    await ensureFilters(p, 'Sipariş durumu')
    await p.locator('.v-field:visible').filter({ hasText: 'Sipariş durumu' }).first().click()
    await p.waitForTimeout(500)
    await shot(p, 'siparis-durum-filtresi')
  } },
  { name: 'siparis-detay', run: async (p) => { await openScreen(p, 'OrderListView'); await p.getByText('E2E-100001').first().waitFor(); await openFirstDetail(p, '.orderListView'); await shotSheet(p, 'siparis-detay') } },
  { name: 'iade-liste', run: async (p) => { await openScreen(p, 'ClaimListView'); await p.getByText('CLM-E2E-0001').first().waitFor(); await shot(p, 'iade-liste') } },
  { name: 'iade-durum-filtresi', run: async (p) => {
    await openScreen(p, 'ClaimListView'); await p.getByText('CLM-E2E-0001').first().waitFor()
    await ensureFilters(p, 'Talep durumu')
    await p.locator('.claimListView .v-field:visible').filter({ hasText: /durum/i }).first().click()
    await p.waitForTimeout(500)
    await shot(p, 'iade-durum-filtresi')
  } },
  { name: 'iade-detay', run: async (p) => { await openScreen(p, 'ClaimListView'); await p.getByText('CLM-E2E-0001').first().waitFor(); await openFirstDetail(p, '.claimListView'); await shotSheet(p, 'iade-detay') } },
  { name: 'musteri-liste', run: async (p) => { await openScreen(p, 'CustomerListView'); await p.getByText('Ayşe Yılmaz').first().waitFor(); await shot(p, 'musteri-liste') } },
  { name: 'musteri-filtre', run: async (p) => {
    await openScreen(p, 'CustomerListView'); await p.getByText('Ayşe Yılmaz').first().waitFor()
    await ensureFilters(p, 'Şehir')
    await shot(p, 'musteri-filtre')
  } },
  { name: 'musteri-kart', run: async (p) => { await openScreen(p, 'CustomerListView'); await p.getByText('Ayşe Yılmaz').first().waitFor(); await openFirstDetail(p, '.customerListView'); await shotSheet(p, 'musteri-kart') } },
  { name: 'fatura-liste', run: async (p) => { await openScreen(p, 'InvoiceListView'); await p.getByText('INV-E2E-0001').first().waitFor(); await shot(p, 'fatura-liste') } },
  { name: 'fatura-detay', run: async (p) => { await openScreen(p, 'InvoiceListView'); await p.getByText('INV-E2E-0001').first().waitFor(); await openFirstDetail(p, '.invoiceListView'); await shotSheet(p, 'fatura-detay') } },
  { name: 'mesaj-liste', run: async (p) => { await openScreen(p, 'MessageListView'); await p.getByText('Ürün Sorusu').first().waitFor(); await shot(p, 'mesaj-liste') } },
  { name: 'mesaj-detay', run: async (p) => { await openScreen(p, 'MessageListView'); await p.getByText('Ürün Sorusu').first().waitFor(); await openFirstDetail(p, '.messageListView'); await shotSheet(p, 'mesaj-detay') } },
  { name: 'destek-liste', run: async (p) => { await openScreen(p, 'TicketListView'); await p.getByText('DSK-100001').first().waitFor(); await shot(p, 'destek-liste') } },
  { name: 'destek-detay', run: async (p) => { await openScreen(p, 'TicketListView'); await p.getByText('DSK-100001').first().waitFor(); await openFirstDetail(p, '.ticketListView'); await shot(p, 'destek-detay') } },
  { name: 'ayarlar', run: async (p) => { await openScreen(p, 'SettingListView'); await p.locator('.settingListView').first().waitFor({ timeout: 10000 }).catch(() => undefined); await p.waitForTimeout(800); await shot(p, 'ayarlar') } },
  { name: 'yetkilendirme', run: async (p) => { await openScreen(p, 'AuthorizationListView'); await p.getByText('Elif').first().waitFor(); await shot(p, 'yetkilendirme') } },
  { name: 'ciktilar', run: async (p) => { await openScreen(p, 'PrintoutListView'); await p.locator('#a4').waitFor({ state: 'attached', timeout: 10000 }).catch(() => undefined); await p.waitForTimeout(800); await shot(p, 'ciktilar') } },
  { name: 'islemler', run: async (p) => { await openScreen(p, 'LogListView'); await p.locator('.exportLogList').first().waitFor({ timeout: 10000 }).catch(() => undefined); await p.waitForTimeout(800); await shot(p, 'islemler') } },
  { name: 'finans', run: async (p) => { await openScreen(p, 'FinancialListView'); await p.locator('.financialListView').first().waitFor({ timeout: 10000 }).catch(() => undefined); await p.waitForTimeout(1000); await shot(p, 'finans') } },
  { name: 'finans-hareketler', run: async (p) => {
    await openScreen(p, 'FinancialListView'); await p.waitForTimeout(800)
    const tab = p.getByRole('tab', { name: /Hareket|İşlem/ }).first()
    if (await tab.count()) await tab.click()
    await p.waitForTimeout(800)
    await shot(p, 'finans-hareketler')
  } },
]

test.describe('fe-r2d inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca R2D_REVIEW=1 ile')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })
  test.setTimeout(90_000)
  for (const c of CASES) {
    if (ONLY.length && !ONLY.some((o) => c.name.includes(o))) continue
    test(c.name, async ({ page }) => {
      await installApiMocks(page, r2dMocks())
      await gotoAuthed(page)
      await c.run(page)
    })
  }
})
