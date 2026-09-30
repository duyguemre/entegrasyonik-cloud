// DS-v2 A11 — ürün listesi satır altı VARYANT gösterimi için ÖNCE/SONRA inceleme görüntüleri. İddia yok; günlük koşuda ATLANIR.
//   A11_REVIEW=1 A11_REVIEW_WIDTH=1440|390 A11_REVIEW_OUT=docs/a11-review/after \
//     npx playwright test e2e/specs/a11-review.spec.ts --project=chromium-desktop
// Dosya adı: `<senaryo>-<genişlik>.png` (+ `-yakin` 2x yakın çekim). Senaryolar: az varyant, çok varyant (14), hatalı kanal.
// Veri sentetik; yalnız backend'in `ProductService/getProducts` projeksiyonundaki alanlar (stock, prices, barcode, stockcode,
// choices, shelf, images[0], platforms.<kod>.{upload, prices, stock}).
import { test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { buildProduct, buildChoice } from '../fixtures/apiData'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.A11_REVIEW === '1'
const WIDTH = Number(process.env.A11_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.A11_REVIEW_OUT || 'docs/a11-review/after'
const ONLY = (process.env.A11_REVIEW_ONLY || '').split(',').filter(Boolean)
const NOW = new Date('2026-09-29T11:00:00.000Z')
const file = (name: string, suffix = '') => `${OUT}/${name}-${WIDTH}${suffix}.png`
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

const COLORS = [
  { _id: 'c-siyah', title: 'Siyah' }, { _id: 'c-beyaz', title: 'Beyaz' }, { _id: 'c-lacivert', title: 'Lacivert' }, { _id: 'c-bej', title: 'Bej' },
]
const SIZES = [{ _id: 's-s', title: 'S' }, { _id: 's-m', title: 'M' }, { _id: 's-l', title: 'L' }, { _id: 's-xl', title: 'XL' }]
const CHOICES = [
  buildChoice({ _id: 'ch-renk', title: 'Renk', isSlicer: true, isVarianter: false, values: COLORS }),
  buildChoice({ _id: 'ch-beden', title: 'Beden', isSlicer: false, isVarianter: true, values: SIZES }),
]

const ok = (stock: number, price: number) => ({ upload: { TRANSFER: { status: 'COMPLETED', updatedAt: '2026-09-20T10:00:00.000Z' }, onSale: true }, prices: { salePrice: price, marketPrice: price + 80 }, stock })
const failed = { upload: { TRANSFER: { status: 'FAILED', updatedAt: '2026-09-21T10:00:00.000Z', messages: ['Kategori eşleşmesi eksik: "Tişört" için zorunlu "Kumaş tipi" özelliği girilmedi.'] } } }
const waiting = { upload: { TRANSFER: { status: 'WAITING', updatedAt: '2026-09-22T09:30:00.000Z' } } }

function variant(i: number, color: number, size: number, o: Record<string, any> = {}) {
  const price = 349.9 + size * 20
  return {
    _id: `a11-var-${i}`,
    stockcode: `TSH-${COLORS[color].title.toUpperCase().slice(0, 3)}-${SIZES[size].title}`,
    barcode: `86900000${String(4000 + i).padStart(5, '0')}`,
    choices: [{ choiceId: 'ch-renk', choiceValueId: COLORS[color]._id, slicer: true }, { choiceId: 'ch-beden', choiceValueId: SIZES[size]._id }],
    prices: { salePrice: price, marketPrice: price + 80, isPlatformBasedPrice: false },
    stock: [12, 3, 0, 27, 8, 1, 44, 0, 6, 15, 2, 9, 31, 5, 18, 0][i % 16],
    shelf: i % 3 === 0 ? `B-0${(i % 5) + 1}` : undefined,
    images: [],
    platforms: { trendyol: ok(12, price), hepsiburada: i % 4 === 1 ? waiting : ok(12, price + 10) },
    onsale: true,
    ...o,
  }
}

const FEW = buildProduct({
  _id: 'a11-few', title: 'Organik pamuk basic tişört', hasVariant: true,
  variants: [variant(0, 0, 1), variant(1, 0, 2), variant(2, 1, 1, { platforms: { trendyol: ok(0, 369.9) } })],
})
const MANY = buildProduct({
  _id: 'a11-many', title: 'Oversize kolej sweatshirt', hasVariant: true,
  variants: Array.from({ length: 14 }, (_, i) => variant(i, Math.floor(i / 4) % 4, i % 4)),
})
const ERR = buildProduct({
  _id: 'a11-err', title: 'Keten karışımlı yazlık gömlek', hasVariant: true,
  variants: [
    variant(0, 2, 0, { platforms: { trendyol: ok(4, 499.9), hepsiburada: failed } }),
    variant(1, 2, 1, { platforms: { trendyol: ok(2, 519.9), hepsiburada: failed } }),
    variant(2, 3, 1, { platforms: { trendyol: waiting, hepsiburada: ok(9, 519.9) } }),
  ],
})
const SINGLE = buildProduct({ _id: 'a11-single', title: 'Keten gömlek — tek beden' })

async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function openList(page: Page, product: any) {
  await installApiMocks(page, reviewMocks({
    ChoiceService: CHOICES,
    'ProductService/getProducts': { products: [product, SINGLE], totalNumberOfRecords: 2, fromTo: '1-2 / 2', isFiltered: false },
  }))
  await page.goto(reviewPath('productDefinitions/ProductListView'))
  await waitForWorkplaceReady(page)
  await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.locator('.productListView .ek-grid').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await settle(page, 700)
  await page.locator('.productListView').getByRole('button', { name: new RegExp(`${product.variants.length} seçenek`, 'i') }).first().click()
  const target = page.locator(`#variant-target-${product._id}`)
  await target.waitFor({ timeout: 10000 }).catch(() => undefined)
  await settle(page, 900)
  return target
}

/** Ürün satırı + açılan varyant alanı (yakın çekim kırpması). */
async function closeUp(page: Page, product: any, name: string) {
  const target = page.locator(`#variant-target-${product._id}`)
  const productRow = page.locator('.productListView tr.ek-grid__row, .productListView .ek-grid__row').filter({ hasText: product.title }).first()
  const a = await productRow.boundingBox().catch(() => null)
  const b = await target.boundingBox().catch(() => null)
  if (!a || !b) return
  const vw = page.viewportSize()!
  const y = Math.max(0, a.y - 4)
  const h = Math.min(b.y + b.height + 8, vw.height) - y
  await page.screenshot({ path: file(name, '-yakin'), clip: { x: 0, y, width: vw.width, height: Math.max(40, h) } })
}

const SCENARIOS: { name: string; run: (p: Page) => Promise<void> }[] = [
  {
    name: 'v1-az-varyant',
    run: async (p) => {
      await openList(p, FEW)
      await p.screenshot({ path: file('v1-az-varyant') })
      await closeUp(p, FEW, 'v1-az-varyant')
    },
  },
  {
    name: 'v2-cok-varyant',
    run: async (p) => {
      await openList(p, MANY)
      await p.screenshot({ path: file('v2-cok-varyant') })
      await closeUp(p, MANY, 'v2-cok-varyant')
    },
  },
  {
    name: 'v3-hatali-kanal',
    run: async (p) => {
      const target = await openList(p, ERR)
      await p.screenshot({ path: file('v3-hatali-kanal') })
      await closeUp(p, ERR, 'v3-hatali-kanal')
      // Hatalı kanal durumunun ayrıntısı (ipucu / durum kartı).
      const failedChip = target.locator('[data-channel-state="danger"], .vl-platform.is-danger').first()
      if (await failedChip.isVisible().catch(() => false)) {
        await failedChip.hover()
        await settle(p, 900)
        await p.screenshot({ path: file('v3-hatali-kanal-ipucu') })
        await failedChip.click()
        await settle(p, 700)
        await p.screenshot({ path: file('v3-hatali-kanal-kart') })
      }
    },
  },
]

test.describe('A11 inceleme görüntüleri (ürün varyantları)', () => {
  test.skip(!ENABLED, 'Yalnızca A11_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: Number(process.env.A11_REVIEW_SCALE) || 1 })
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(NOW)
  })
  for (const s of SCENARIOS) {
    test(s.name, async ({ page }) => {
      test.skip(!want(s.name))
      test.setTimeout(90_000)
      await s.run(page)
    })
  }
})
