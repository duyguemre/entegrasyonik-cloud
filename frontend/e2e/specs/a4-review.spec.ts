// DS-v2 Aşama 4 — ikinci bağımsız premium tur görüntüleri. `a3-review.spec.ts`'in üstüne:
//   · 3 genişlik (1440 / 800 / 390) — A4_REVIEW_WIDTH
//   · W1/W2 ekranlarının DURUMLARI (bildirim çekmecesi, kayıtlı görünümler paneli, abonelik bandı, mesaj bekleme rozetleri,
//     kanal kapsamı ayrıntıları, webhook paneli, finans sekmeleri, denetim ayrıntısı)
//   · boş / hata / yükleniyor durumları ve klavye odak halkası (Tab akışı)
// İddia yok; yalnızca inceleme görüntüsü üretir. Günlük koşuda ATLANIR. Saat sabit (rozet/tarih metinleri deterministik).
//   A4_REVIEW=1 A4_REVIEW_WIDTH=1440 A4_REVIEW_OUT=docs/design-system-review/a4-final \
//     npx playwright test e2e/specs/a4-review.spec.ts --project=chromium-desktop
import { test, type Page, type Route } from '@playwright/test'
import { SCREENS } from '../../src/navigation/screens'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { openReviewScreen, reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { buildMessage, buildOrder, buildSubscription, ordersBosFixture } from '../fixtures/apiData'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.A4_REVIEW === '1'
const WIDTH = Number(process.env.A4_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.A4_REVIEW_OUT || 'docs/design-system-review/a4-review'
const ONLY = (process.env.A4_REVIEW_ONLY || '').split(',').filter(Boolean)
const STATES = process.env.A4_REVIEW_STATES !== '0'
const SCREENS_ON = process.env.A4_REVIEW_SCREENS !== '0'

const NOW = new Date('2026-09-29T11:00:00.000Z')
const NO_SESSION = { checkAuthentication: false, userContext: mockError(401, {}) }
const fileName = (name: string) => `${OUT}/${name.replace(/[/]/g, '-')}-${WIDTH}.png`
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
const MESSAGES = {
  messages: [
    buildMessage({ _id: 'rv-m-1', text: 'Bu ürünün beden tablosu kalıbı dar mı, bir beden büyük almalı mıyım?', date: hoursAgo(3) }),
    buildMessage({ _id: 'rv-m-2', text: 'Kargom hâlâ yola çıkmadı, ne zaman gönderilecek?', type: 'ORDER_QUESTION', context: { orderNumber: 'SIP-E2E-1001' }, date: hoursAgo(30) }),
    buildMessage({ _id: 'rv-m-3', text: 'Faturayı şirket adına düzenleyebilir misiniz?', type: 'ORDER_QUESTION', context: { orderNumber: 'SIP-E2E-1003' }, date: hoursAgo(52) }),
    buildMessage({ _id: 'rv-m-4', integrationCode: 'hepsiburada', status: 'ANSWERED', text: 'Renk seçenekleri stokta var mı?', answer: 'Evet, tüm renkler stokta.', date: hoursAgo(80) }),
  ],
  totalNumberOfRecords: 4,
  totalNumberOfPages: 1,
}

// Stres: uzun ad/ürün metni, çok kalem, çok satır, büyük tutar (sentetik; `.invalid`, PII yok).
const STRESS_ORDERS = {
  orders: Array.from({ length: 18 }, (_, i) =>
    buildOrder({
      _id: `rv-stress-${i}`,
      orderNumber: `E2E-STRES-${String(900001 + i)}`,
      integrationCode: ['trendyol', 'hepsiburada', 'n11', 'pazarama'][i % 4],
      internalStatus: ['AWAITING_APPROVAL', 'APPROVED', 'SHIPPED', 'CANCELLED'][i % 4],
      billingAddress: { firstName: i % 3 ? 'Ayşegül Nur' : 'Muhammed Mustafa Kemal', lastName: i % 2 ? 'Karaosmanoğlu-Yılmazer' : 'Demir' },
      items: Array.from({ length: (i % 4) + 1 }, (_, k) => ({ productName: `Organik pamuklu oversize kapüşonlu sweatshirt — ${k + 1}. renk seçeneği, XL beden`, quantity: k + 1 })),
      financials: { grandTotal: 1_234_567.89 / (i + 1), currencyCode: 'TRY' },
    }),
  ),
  totalNumberOfRecords: 12_480,
  totalNumberOfPages: 694,
}

async function settle(page: Page, ms = 700) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function shoot(page: Page, name: string) {
  await settle(page, 300)
  await page.screenshot({ path: fileName(name) })
}

async function openWith(page: Page, key: string, extra: Record<string, unknown> = {}, query = '') {
  await installApiMocks(page, reviewMocks(extra))
  await page.goto(reviewPath(key) + query)
  await waitForWorkplaceReady(page)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await settle(page, 900)
}

test.describe('A4 inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca A4_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW)
  })

  if (SCREENS_ON) {
    for (const screen of SCREENS) {
      if (screen.instanceParam || !want(screen.slug)) continue
      test(`ekran: ${screen.key}`, async ({ page }) => {
        await openReviewScreen(page, screen.key)
        await page.screenshot({ path: fileName(screen.slug) })
      })
    }

    const unsecure: Array<{ name: string; path: string; tab?: string; extra?: Record<string, unknown> }> = [
      { name: 'auth-giris', path: '/login' },
      { name: 'auth-kayit', path: '/login', tab: 'Kayıt' },
      { name: 'auth-sifremi-unuttum', path: '/login', tab: 'Şifremi unuttum' },
      { name: 'auth-sifre-sifirla', path: '/reset-password?token=e2e-sentetik-belirtec' },
      { name: 'auth-eposta-dogrula', path: '/verify-email?token=e2e-sentetik-belirtec', extra: { 'AccountService/verifyEmail': { success: true } } },
    ]
    for (const u of unsecure) {
      if (!want(u.name)) continue
      test(`kimliksiz: ${u.name}`, async ({ page }) => {
        await installApiMocks(page, { ...NO_SESSION, ...(u.extra ?? {}) })
        await page.goto(u.path)
        if (u.tab) await page.getByRole('tab', { name: u.tab }).click()
        await settle(page, 800)
        await page.screenshot({ path: fileName(u.name) })
      })
    }
  }

  if (!STATES) return

  const states: Array<{ name: string; run: (page: Page) => Promise<void> }> = [
    {
      name: 'durum-bildirim-cekmecesi',
      run: async (page) => {
        await openWith(page, 'DashboardView')
        await page.locator('button:has(.mdi-bell-outline)').first().click()
        await shoot(page, 'durum-bildirim-cekmecesi')
      },
    },
    {
      name: 'durum-abonelik-bandi',
      run: async (page) => {
        const sub = buildSubscription({
          subscription: { planCode: 'growth', planVersion: 1, status: 'past_due', currentPeriodStart: '2026-09-01T00:00:00.000Z', currentPeriodEnd: '2026-10-01T00:00:00.000Z', graceUntil: '2026-10-07T00:00:00.000Z', cancelAtPeriodEnd: false, billingExempt: false },
          status: 'past_due', access: { read: true, write: true, engine: true }, reason: undefined,
        })
        await openWith(page, 'OrderListView', { 'BillingService/getMySubscription': sub })
        await shoot(page, 'durum-abonelik-bandi')
      },
    },
    {
      name: 'durum-kayitli-gorunumler',
      run: async (page) => {
        await openWith(page, 'OrderListView', {}, '?internalStatuses=AWAITING_APPROVAL')
        await page.locator('.orderListView').getByRole('button', { name: /^Kayıtlı görünümler/ }).click()
        await shoot(page, 'durum-kayitli-gorunumler')
      },
    },
    {
      name: 'durum-mesaj-bekleme',
      run: async (page) => {
        await openWith(page, 'MessageListView', { 'MessageService/getMessages': MESSAGES })
        await shoot(page, 'durum-mesaj-bekleme')
      },
    },
    {
      name: 'durum-mesaj-yanit',
      run: async (page) => {
        await openWith(page, 'MessageListView', { 'MessageService/getMessages': MESSAGES, 'MessageService/markAsRead': { success: true } })
        const row = page.locator('.messageListView :is(tbody tr, .v-card)').filter({ hasText: 'beden tablosu' }).first()
        await row.getByRole('button', { name: 'Mesajı cevapla' }).click()
        await shoot(page, 'durum-mesaj-yanit')
      },
    },
    {
      name: 'durum-kapsam-ayrintilar',
      run: async (page) => {
        await openWith(page, 'integrations/MarketplaceView')
        await page.locator('.marketplaceView section.ek-coverage').getByRole('button', { name: /Ayrıntılar/ }).click()
        await shoot(page, 'durum-kapsam-ayrintilar')
      },
    },
    {
      name: 'durum-webhook',
      run: async (page) => {
        await openWith(page, 'integrations/IntegrationHealthView')
        const p = page.locator('.integrationHealthView').getByRole('region', { name: 'Anlık sipariş bildirimi (webhook)' })
        await p.scrollIntoViewIfNeeded()
        await shoot(page, 'durum-webhook')
      },
    },
    {
      name: 'durum-finans-sekmeler',
      run: async (page) => {
        await openWith(page, 'FinancialListView')
        const tabs = page.locator('.financialListView').getByRole('tab')
        const n = await tabs.count()
        for (let i = 0; i < n; i++) {
          await tabs.nth(i).click()
          await settle(page, 600)
          await page.screenshot({ path: fileName(`durum-finans-sekme-${i + 1}`) })
        }
      },
    },
    {
      name: 'durum-denetim-ayrinti',
      run: async (page) => {
        await openWith(page, 'AuditLogView')
        const row = page.locator('.auditLogView :is(tbody tr, .v-card)').first()
        await row.click().catch(() => undefined)
        await shoot(page, 'durum-denetim-ayrinti')
      },
    },
    {
      name: 'durum-bos',
      run: async (page) => {
        await openWith(page, 'OrderListView', { 'OrderService/getOrders': ordersBosFixture })
        await shoot(page, 'durum-bos')
      },
    },
    {
      name: 'durum-hata',
      run: async (page) => {
        await openWith(page, 'OrderListView', { 'OrderService/getOrders': mockError(500) })
        await shoot(page, 'durum-hata')
      },
    },
    {
      name: 'durum-yukleniyor',
      run: async (page) => {
        await installApiMocks(page, reviewMocks({
          'OrderService/getOrders': async (route: Route) => { await new Promise((r) => setTimeout(r, 60_000)); await route.abort().catch(() => undefined) },
        }))
        await page.goto(reviewPath('OrderListView'))
        await waitForWorkplaceReady(page)
        await settle(page, 900)
        await page.screenshot({ path: fileName('durum-yukleniyor') })
      },
    },
    {
      name: 'durum-odak',
      run: async (page) => {
        await openWith(page, 'OrderListView')
        // Gerçek klavye akışı: her Tab arasında kısa bekleme; geçişler (etiket, halka) yerleştikten sonra çekim.
        for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(120) }
        await settle(page, 500)
        await page.screenshot({ path: fileName('durum-odak-1') })
        for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(120) }
        await settle(page, 500)
        await page.screenshot({ path: fileName('durum-odak-2') })
      },
    },
    {
      name: 'durum-yakin-baslik',
      run: async (page) => {
        // Yapışık seçim + kimlik kolonu başlık birleşimi (yakın çekim, 3x büyütme için CSS zoom).
        await openWith(page, 'OrderListView')
        const head = page.locator('.orderListView .ek-grid thead').first()
        const box = (await head.boundingBox())!
        await page.screenshot({ path: fileName('durum-yakin-baslik'), clip: { x: box.x, y: box.y - 4, width: Math.min(360, box.width), height: box.height + 100 } })
      },
    },
    {
      name: 'durum-stres',
      run: async (page) => {
        await openWith(page, 'OrderListView', { 'OrderService/getOrders': STRESS_ORDERS })
        await shoot(page, 'durum-stres')
      },
    },
    {
      name: 'durum-hover',
      run: async (page) => {
        await openWith(page, 'OrderListView')
        const row = page.locator('.orderListView tbody tr').nth(1)
        if (await row.isVisible().catch(() => false)) await row.hover()
        await shoot(page, 'durum-hover')
      },
    },
  ]
  for (const s of states) {
    if (!want(s.name)) continue
    test(`durum: ${s.name}`, async ({ page }) => {
      test.setTimeout(90_000)
      await s.run(page)
    })
  }
})
