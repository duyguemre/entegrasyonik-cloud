// FE-CFG-2 — duyuru (3 seviye), bakım ve destek iletişimi inceleme görüntüleri. İddia yok; günlük koşuda ATLANIR.
//   CFG_REVIEW=1 CFG_REVIEW_WIDTH=1440|390 [CFG_REVIEW_DARK=1] npx playwright test e2e/specs/cfg-review.spec.ts --project=chromium-desktop
// Çıktı: docs/cfg-review/<durum>[-dark]-<genişlik>.png. Koyu tema: Vuetify `darkTheme` (token'lar semantik → dark hazır;
// ürün kapısı ADR-0011 Karar 3 gereği hâlâ kapalı, burada yalnız inceleme için açılır). Saat sabit, veri sentetik.
import { test, type Page } from '@playwright/test'
import { installApiMocks, publicConfigWith } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.CFG_REVIEW === '1'
const WIDTH = Number(process.env.CFG_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const DARK = process.env.CFG_REVIEW_DARK === '1'
const OUT = process.env.CFG_REVIEW_OUT || 'docs/cfg-review'
const NOW = new Date('2026-09-30T09:00:00.000Z')
const file = (name: string) => `${OUT}/${name}${DARK ? '-dark' : ''}-${WIDTH}.png`

const TEXT = {
  info: 'Yeni: sipariş listesinde kargo takip numarası artık tek tıkla kopyalanabiliyor.',
  warning: 'Pazartesi 23:00–23:30 arası Trendyol aktarımları kısa süre gecikebilir.',
  critical: 'Hepsiburada API kesintisi nedeniyle stok eşitlemesi geçici olarak durduruldu. Ekibimiz ilgileniyor.',
}

async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function open(page: Page, settings: Record<string, unknown>) {
  await installApiMocks(page, reviewMocks({ 'public-config': publicConfigWith(settings) }))
  await page.goto(reviewPath('OrderListView'))
  await waitForWorkplaceReady(page)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  if (DARK) {
    await page.evaluate(() => {
      const app = (document.querySelector('#app') as any)?.__vue_app__
      const theme = app._context.provides[Symbol.for('vuetify:theme') as any]
      theme.global.name.value = 'darkTheme'
    })
  }
  await settle(page, 900)
}

const cases: { name: string; run: (p: Page) => Promise<void> }[] = [
  ...(['info', 'warning', 'critical'] as const).map((level) => ({
    name: `duyuru-${level}`,
    run: async (p: Page) => {
      await open(p, { 'announcement.enabled': true, 'announcement.level': level, 'announcement.text': TEXT[level] })
      await p.screenshot({ path: file(`duyuru-${level}`) })
    },
  })),
  {
    name: 'bakim',
    run: async (p) => {
      await open(p, { 'maintenance.enabled': true, 'maintenance.message': 'Bu gece 02:00–03:00 arası planlı bakım yapılacak. Siparişler bakım sonrası otomatik eşitlenir.' })
      await p.screenshot({ path: file('bakim') })
    },
  },
  {
    name: 'bakim-ve-duyuru',
    run: async (p) => {
      await open(p, { 'maintenance.enabled': true, 'announcement.enabled': true, 'announcement.level': 'info', 'announcement.text': TEXT.info })
      await p.screenshot({ path: file('bakim-ve-duyuru') })
    },
  },
  {
    name: 'destek',
    run: async (p) => {
      await open(p, { 'support.email': 'bilgi@entegrasyonik.com.tr', 'support.phone': '+90 212 555 00 00' })
      await p.locator(WIDTH < 768 ? '[data-header-action=account]' : '[data-header-action=help]').click()
      await settle(p, 500)
      await p.screenshot({ path: file('destek') })
    },
  },
]

test.describe('FE-CFG inceleme görüntüleri', () => {
  test.skip(!ENABLED, 'Yalnızca CFG_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW)
  })
  for (const c of cases) {
    test(c.name, async ({ page }) => {
      test.setTimeout(90_000)
      await c.run(page)
    })
  }
})
