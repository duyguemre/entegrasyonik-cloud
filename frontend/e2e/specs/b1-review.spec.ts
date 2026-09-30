// B1 — ürün listesi: rowspan'lı varyant grupları + premium küçük görseller için ÖNCE/SONRA inceleme görüntüleri.
// İddia yok; günlük koşuda ATLANIR.
//   B1_REVIEW=1 B1_REVIEW_WIDTH=1440|390 B1_REVIEW_OUT=docs/b1-review/after \
//     npx playwright test e2e/specs/b1-review.spec.ts --project=chromium-desktop   (bulutta: -c playwright.cloud.config.ts)
// Dosya adı: `<senaryo>-<genişlik>.png` (+ `-yakin` 2x yakın çekim, deviceScaleFactor 2). Veri sentetik; görseller
// `images.entegrasyonik.com` isteği yakalanarak üretilen SVG'lerle (ağ yok). Senaryolar:
//   b1-liste        ürün listesi: görselli (çoklu/tekli), görselsiz ürün satırları
//   b2-varyant      3 renk × 3 beden (görselli + görselsiz varyantlar), açık varyant alanı
//   b3-cok-varyant  14 varyant (kompakt) + "Tümünü gör" açık
//   b4-onizleme     ürün görseli üzerinde gecikmeli büyük önizleme (+ klavye odağı)
//   b5-yukleniyor   görsel yanıtı gecikirken iskelet
import { test, type Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { buildProduct, buildChoice } from '../fixtures/apiData'
import { waitForWorkplaceReady } from '../fixtures/nav'

const ENABLED = process.env.B1_REVIEW === '1'
const WIDTH = Number(process.env.B1_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.B1_REVIEW_OUT || 'docs/b1-review/after'
const ONLY = (process.env.B1_REVIEW_ONLY || '').split(',').filter(Boolean)
const NOW = new Date('2026-09-30T11:00:00.000Z')
const file = (name: string, suffix = '') => `${OUT}/${name}-${WIDTH}${suffix}.png`
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))

const IMG = 'https://images.entegrasyonik.com/products/b1'
// Sentetik ürün fotoğrafı: zemin + ürün silueti (tişört) — yalnız inceleme verisi (src/ dışı, ratchet kapsamı dışında).
const PALETTE: Record<string, [string, string]> = {
  siyah: ['#e9e7e3', '#26262b'], beyaz: ['#dfe4ea', '#fbfbfa'], lacivert: ['#ece6dc', '#1f2c4d'], bej: ['#e3e9e4', '#d8c3a5'],
  kirmizi: ['#f1ece6', '#b3303a'], yesil: ['#ebe8e1', '#3f6b4f'], gri: ['#e6e3ee', '#7d8088'], mavi: ['#eee9e2', '#3f6fb5'],
}
function svg(key: string, variant = 0) {
  const [bg, fg] = PALETTE[key] || PALETTE.gri
  const tilt = [0, -8, 8][variant % 3]
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${variant === 2 ? 800 : 600}" viewBox="0 0 600 ${variant === 2 ? 800 : 600}">
  <rect width="100%" height="100%" fill="${bg}"/>
  <g transform="translate(300 ${variant === 2 ? 400 : 300}) rotate(${tilt}) translate(-300 -300)">
    <path d="M205 130 L255 110 Q300 150 345 110 L395 130 L470 200 L425 250 L395 225 L395 480 L205 480 L205 225 L175 250 L130 200 Z"
      fill="${fg}" stroke="rgba(0,0,0,.12)" stroke-width="3"/>
  </g></svg>`
}

async function routeImages(page: Page, delayMs = 0) {
  await page.route('https://images.entegrasyonik.com/**', async (route) => {
    const m = /\/b1\/([a-z]+)-(\d)\.svg/.exec(route.request().url())
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    if (!m) return route.fulfill({ status: 404, body: '' })
    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(m[1], Number(m[2])) })
  })
}

const img = (key: string, n: number, order = n) => ({ _id: `img-${key}-${n}`, url: `${IMG}/${key}-${n}.svg`, width: 600, height: 600, extension: 'svg', order })

const COLORS = [
  { _id: 'c-siyah', title: 'Siyah', key: 'siyah' }, { _id: 'c-beyaz', title: 'Beyaz', key: 'beyaz' },
  { _id: 'c-lacivert', title: 'Lacivert', key: 'lacivert' }, { _id: 'c-bej', title: 'Bej', key: 'bej' },
]
const SIZES = [{ _id: 's-s', title: 'S' }, { _id: 's-m', title: 'M' }, { _id: 's-l', title: 'L' }, { _id: 's-xl', title: 'XL' }]
const CHOICES = [
  buildChoice({ _id: 'ch-renk', title: 'Renk', isSlicer: true, isVarianter: false, values: COLORS.map(({ _id, title }) => ({ _id, title })) }),
  buildChoice({ _id: 'ch-beden', title: 'Beden', isSlicer: false, isVarianter: true, values: SIZES }),
]

const ok = (stock: number, price: number) => ({ upload: { TRANSFER: { status: 'COMPLETED', updatedAt: '2026-09-20T10:00:00.000Z' }, onSale: true }, prices: { salePrice: price, marketPrice: price + 80 }, stock })
const failed = { upload: { TRANSFER: { status: 'FAILED', updatedAt: '2026-09-21T10:00:00.000Z', messages: ['Kategori eşleşmesi eksik: "Tişört" için zorunlu "Kumaş tipi" özelliği girilmedi.'] } } }
const waiting = { upload: { TRANSFER: { status: 'WAITING', updatedAt: '2026-09-22T09:30:00.000Z' } } }

function variant(i: number, color: number, size: number, o: Record<string, any> = {}) {
  const price = 349.9 + size * 20
  const c = COLORS[color]
  return {
    _id: `b1-var-${i}`,
    stockcode: `TSH-${c.title.toUpperCase().slice(0, 3)}-${SIZES[size].title}`,
    barcode: `86900000${String(5000 + i).padStart(5, '0')}`,
    choices: [{ choiceId: 'ch-renk', choiceValueId: c._id, slicer: true }, { choiceId: 'ch-beden', choiceValueId: SIZES[size]._id }],
    prices: { salePrice: price, marketPrice: price + 80, isPlatformBasedPrice: false },
    stock: [12, 3, 0, 27, 8, 1, 44, 0, 6, 15, 2, 9, 31, 5, 18, 0][i % 16],
    shelf: i % 3 === 0 ? `B-0${(i % 5) + 1}` : undefined,
    images: [`img-${c.key}-0`, `img-${c.key}-1`],
    platforms: { trendyol: ok(12, price), hepsiburada: i % 5 === 2 ? failed : i % 4 === 1 ? waiting : ok(12, price + 10) },
    onsale: true,
    ...o,
  }
}

// Karışık sıra (tanım sırası dışı) — sonra: gruplar Renk tanım sırasıyla, bedenler S, M, L, XL.
const FEW = buildProduct({
  _id: 'b1-few', title: 'Organik pamuk basic tişört', hasVariant: true, stock: 36,
  images: [img('siyah', 0), img('siyah', 1), img('beyaz', 0), img('beyaz', 1), img('lacivert', 0), img('lacivert', 1)],
  prices: { minSalePrice: 349.9, maxSalePrice: 389.9 },
  variants: [
    variant(0, 1, 2), variant(1, 0, 1), variant(2, 0, 0, { images: [] }), variant(3, 1, 0), variant(4, 0, 2),
    variant(5, 2, 1, { platforms: { trendyol: ok(0, 369.9) } }), variant(6, 1, 1, { images: ['img-beyaz-1'] }),
  ],
})
const MANY = buildProduct({
  _id: 'b1-many', title: 'Oversize kolej sweatshirt', hasVariant: true, stock: 163,
  images: COLORS.flatMap((c) => [img(c.key, 0), img(c.key, 1)]),
  prices: { minSalePrice: 349.9, maxSalePrice: 409.9 },
  variants: Array.from({ length: 14 }, (_, i) => variant(i, Math.floor(i / 4) % 4, i % 4)),
})
const P = (id: string, title: string, images: any[], o: Record<string, any> = {}) => buildProduct({
  _id: id, title, images,
  variants: [{ stockcode: `SK-${id.toUpperCase()}`, barcode: `8690000${id.length}12345`, order: 0 }], ...o,
})
const SINGLES = [
  P('b1-s1', 'Keten gömlek — tek beden', [img('mavi', 2), img('mavi', 0), img('mavi', 1)], { stock: 18 }),
  P('b1-s2', 'Yün karışımlı atkı', [img('kirmizi', 0)], { stock: 4 }),
  P('b1-s3', 'Deri kartlık (görselsiz)', [], { stock: 0, onsale: false }),
  P('b1-s4', 'Pamuklu çorap 3\'lü paket', [img('gri', 0), img('gri', 1)], { stock: 120 }),
]

async function settle(page: Page, ms = 600) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function openList(page: Page, products: any[], delayMs = 0) {
  await routeImages(page, delayMs)
  await installApiMocks(page, reviewMocks({
    ChoiceService: CHOICES,
    'ProductService/getProducts': { products, totalNumberOfRecords: products.length, fromTo: `1-${products.length} / ${products.length}`, isFiltered: false },
  }))
  await page.goto(reviewPath('productDefinitions/ProductListView'))
  await waitForWorkplaceReady(page)
  if (!delayMs) await page.waitForLoadState('networkidle').catch(() => undefined)
  await page.locator('.productListView .ek-grid').first().waitFor({ timeout: 10000 }).catch(() => undefined)
  await settle(page, 700)
}

async function expand(page: Page, product: any) {
  await page.locator('.productListView').getByRole('button', { name: new RegExp(`${product.variants.length} seçenek`, 'i') }).first().click()
  const target = page.locator(`#variant-target-${product._id}`)
  await target.waitFor({ timeout: 10000 }).catch(() => undefined)
  await settle(page, 900)
  return target
}

const productRow = (page: Page, title: string) => page.locator('.productListView .ek-grid__row').filter({ hasText: title }).first()

/** Yakın çekim: verilen öğeler arasını kapsayan bölge (2x). */
async function clip(page: Page, name: string, top: { boundingBox(): Promise<any> }, bottom: { boundingBox(): Promise<any> } = top, pad = 6) {
  const a = await top.boundingBox().catch(() => null)
  const b = await bottom.boundingBox().catch(() => null)
  if (!a || !b) return
  const vw = page.viewportSize()!
  const y = Math.max(0, Math.min(a.y, b.y) - pad)
  const h = Math.min(Math.max(a.y + a.height, b.y + b.height) + pad, vw.height) - y
  const x = WIDTH <= 480 ? 0 : Math.max(0, a.x - 12)
  await page.screenshot({ path: file(name, '-yakin'), clip: { x, y, width: vw.width - x, height: Math.max(40, h) } })
}

const SCENARIOS: { name: string; run: (p: Page) => Promise<void> }[] = [
  {
    name: 'b1-liste',
    run: async (p) => {
      await openList(p, [FEW, ...SINGLES])
      await p.screenshot({ path: file('b1-liste') })
      await clip(p, 'b1-liste', productRow(p, FEW.title), productRow(p, SINGLES[3].title))
    },
  },
  {
    name: 'b2-varyant',
    run: async (p) => {
      await openList(p, [FEW, ...SINGLES])
      const target = await expand(p, FEW)
      if (WIDTH <= 480) await productRow(p, FEW.title).evaluate((el) => el.scrollIntoView({ block: 'start' }))
      await settle(p, 400)
      await p.screenshot({ path: file('b2-varyant') })
      if (process.env.B1_PROBE) console.log('ROWS', JSON.stringify(await target.evaluate((el) => [...el.querySelectorAll('.pvl-row')].map((r) => Math.round(r.getBoundingClientRect().height)))), JSON.stringify(await target.evaluate((el) => [...el.querySelectorAll('.pvl-row:nth-child(2) > td')].map((c) => Math.round(c.getBoundingClientRect().height) + '/' + Math.round((c.firstElementChild as HTMLElement)?.getBoundingClientRect().height ?? 0)))))
      if (process.env.B1_PROBE) console.log('OVER', await target.evaluate((el) => { const x = el.querySelector('.pvl-scroll')!; return x.scrollWidth - x.clientWidth }))
      if (process.env.B1_PROBE) console.log('PROBE', JSON.stringify(await target.evaluate((el) => [...el.querySelectorAll('.ek-vgroup')].map((td) => {
        const l = td.querySelector('.ek-vgroup__label')!; const cs = getComputedStyle(td)
        return { va: cs.verticalAlign, td: td.getBoundingClientRect().top, lab: l.getBoundingClientRect().top, rows: [...el.querySelectorAll('.pvl-row')].map((r) => Math.round(r.getBoundingClientRect().height)), cells: [...el.querySelectorAll('.pvl-row:last-child > td')].map((c) => c.className.split(' ').pop() + ':' + Math.round((c.firstElementChild as HTMLElement)?.getBoundingClientRect().height ?? 0)) }
      }))))
      await clip(p, 'b2-varyant', productRow(p, FEW.title), target)
      if (WIDTH <= 480) {
        await target.evaluate((el) => el.scrollIntoView({ block: 'start' }))
        await settle(p, 300)
        await p.screenshot({ path: file('b2-varyant', '-yakin-2') })
      }
    },
  },
  {
    name: 'b3-cok-varyant',
    run: async (p) => {
      await openList(p, [MANY, ...SINGLES.slice(0, 1)])
      const target = await expand(p, MANY)
      await p.screenshot({ path: file('b3-cok-varyant') })
      await clip(p, 'b3-cok-varyant', productRow(p, MANY.title), target)
      const more = target.locator('.pvl-more')
      await more.getByRole('button').click()
      await settle(p, 500)
      await more.evaluate((el) => el.scrollIntoView({ block: 'end' }))
      await settle(p, 300)
      await p.screenshot({ path: file('b3-cok-varyant-tumu-acik') })
    },
  },
  {
    name: 'b4-onizleme',
    run: async (p) => {
      await openList(p, [FEW, ...SINGLES])
      const thumb = productRow(p, SINGLES[0].title).locator('.plv-thumb').first()
      await thumb.hover({ timeout: 8000 }).catch(async (e) => {
        console.log('HOVERFAIL', await thumb.evaluate((el) => ({ cls: el.className, tag: el.tagName, r: el.getBoundingClientRect().toJSON(), top: (document.elementFromPoint(el.getBoundingClientRect().x + 20, el.getBoundingClientRect().y + 20) as HTMLElement)?.className })), String(e).slice(0, 600))
        throw e
      })
      await settle(p, 250)
      await p.screenshot({ path: file('b4-onizleme-erken') }) // gecikme: henüz açılmamalı
      await settle(p, 900)
      await p.screenshot({ path: file('b4-onizleme') })
      const pop = p.locator('.pth-preview').first()
      if (await pop.isVisible().catch(() => false)) await clip(p, 'b4-onizleme', thumb, pop, 16)
      // Varyant görseli önizlemesi.
      await p.mouse.move(5, 5)
      await settle(p, 300)
      const target = await expand(p, FEW)
      const vthumb = target.locator('.pvl-thumb').nth(1)
      await vthumb.hover()
      await settle(p, 1100)
      await p.screenshot({ path: file('b4-onizleme-varyant') })
      // Klavye: ürün görseli düğmesine odak.
      await p.mouse.move(5, 5)
      await settle(p, 300)
      await productRow(p, SINGLES[1].title).locator('.plv-thumb').first().focus()
      await p.keyboard.press('Shift+Tab')
      await p.keyboard.press('Tab')
      await settle(p, 1100)
      await p.screenshot({ path: file('b4-onizleme-klavye') })
    },
  },
  {
    name: 'b5-yukleniyor',
    run: async (p) => {
      await openList(p, [FEW, ...SINGLES], 20000)
      await settle(p, 300)
      await clip(p, 'b5-yukleniyor', productRow(p, FEW.title), productRow(p, SINGLES[3].title))
    },
  },
]

test.describe('B1 inceleme görüntüleri (ürün listesi görselleri + varyant grupları)', () => {
  test.skip(!ENABLED, 'Yalnızca B1_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: Number(process.env.B1_REVIEW_SCALE) || 2 })
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
