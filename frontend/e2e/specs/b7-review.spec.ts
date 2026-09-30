// B7 — Kategoriler / Markalar sayfaları ÖNCE/SONRA inceleme görüntüleri. İddia yok; günlük koşuda ATLANIR.
//   B7_REVIEW=1 B7_REVIEW_WIDTH=1440|390 B7_REVIEW_OUT=docs/b7-review/after \
//     npx playwright test e2e/specs/b7-review.spec.ts --project=chromium-desktop
// Dosya adı: `<senaryo>-<genişlik>.png` (+ `-yakin` 2x yakın çekim; B7_REVIEW_SCALE=2 ile).
// Veri: e2e/fixtures/b7Catalog.ts (backend yanıt şekilleriyle aynı; ürün sayısı / logo alanı YOK).
import { test, expect, type Page, type Locator } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { menuFixture, gotoAuthed, openDrawer } from '../fixtures/nav'
import { b7Brands, b7Categories, b7CategoryMappings } from '../fixtures/b7Catalog'

const ENABLED = process.env.B7_REVIEW === '1'
const WIDTH = Number(process.env.B7_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.B7_REVIEW_OUT || 'docs/b7-review/after'
const ONLY = (process.env.B7_REVIEW_ONLY || '').split(',').filter(Boolean)
const file = (name: string, suffix = '') => `${OUT}/${name}-${WIDTH}${suffix}.png`
const want = (name: string) => !ONLY.length || ONLY.some((o) => name.includes(o))
const narrow = WIDTH <= 480
// İki geçiş: tam kare (ölçek 1) ve yakın çekim (B7_REVIEW_SCALE=2 → yalnız `-yakin` dosyaları yazılır).
const ZOOM = (Number(process.env.B7_REVIEW_SCALE) || 1) > 1

const menu = menuFixture.map((group: any) =>
  group.group === 'sale'
    ? {
        ...group,
        links: group.links.map((link: any) =>
          link.code === 'productDefinitions'
            ? {
                ...link,
                children: [
                  ...link.children,
                  { code: 'CategoryListView', parent: 'productDefinitions', title: 'categoryList', icon: 'mdi-shape-outline', singleton: true },
                  { code: 'BrandListView', parent: 'productDefinitions', title: 'brandList', icon: 'mdi-tag-multiple-outline', singleton: true },
                ],
              }
            : link,
        ),
      }
    : group,
)

async function shot(page: Page, path: string) {
  if (!ZOOM) await page.screenshot({ path })
}

async function settle(page: Page, ms = 500) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}

async function open(page: Page, which: 'Kategoriler' | 'Markalar', extra: Record<string, unknown> = {}) {
  await installApiMocks(page, {
    MenuService: menu,
    CategoryService: b7Categories(),
    AttributeMappingService: b7CategoryMappings(),
    BrandService: b7Brands(),
    ...extra,
  })
  await gotoAuthed(page)
  await openDrawer(page)
  const drawer = page.locator('.v-navigation-drawer.soft-nav')
  const item = drawer.getByText(which, { exact: true })
  if (!(await item.isVisible().catch(() => false))) {
    await drawer.locator('.v-list-group__header').filter({ has: page.locator('.mdi-tag-outline') }).first().click()
    await page.waitForTimeout(350)
  }
  await item.click()
  await settle(page, 900)
}

const root = (page: Page, which: 'Kategoriler' | 'Markalar') => page.locator(which === 'Kategoriler' ? '.categoryListView' : '.brandDefinition').first()

/** 2x yakın çekim: verilen öğenin kutusu (görünür alana kırpılır). */
async function closeUp(page: Page, target: Locator, name: string) {
  if (!ZOOM) return
  const box = await target.boundingBox().catch(() => null)
  if (!box) return
  const vw = page.viewportSize()!
  const x = Math.max(0, box.x - 8)
  const y = Math.max(0, box.y - 8)
  const w = Math.min(vw.width - x, box.width + 16)
  const h = Math.min(vw.height - y, box.height + 16)
  if (w < 20 || h < 20) return
  await page.screenshot({ path: file(name, '-yakin'), clip: { x, y, width: w, height: h } })
}

/** Kategori seçimi — yeni tasarımda satır, eskide ⚙ "… ayarları" düğmesi (üst düğümleri açarak). */
async function selectCategory(page: Page, path: string[]) {
  const r = root(page, 'Kategoriler')
  const rowNew = r.locator('[data-cat-path]').first()
  if (await rowNew.count()) {
    for (const [i, t] of path.entries()) {
      const row = r.locator(`[data-cat-path="${path.slice(0, i + 1).join('/')}"]`).first()
      await row.waitFor({ timeout: 5000 })
      if (i < path.length - 1) {
        if ((await row.getAttribute('aria-expanded')) !== 'true') {
          await row.click()
          await page.waitForTimeout(250)
        }
      } else await row.click()
      void t
    }
    await settle(page, 600)
    return
  }
  // Eski ağaç: gruplar tıklanınca açılır, yaprakta ⚙.
  for (const [i, t] of path.entries()) {
    if (i < path.length - 1) {
      await r.locator('.v-list-item').filter({ hasText: new RegExp(`^\\s*\\d*\\s*${t}`) }).first().click().catch(() => undefined)
      await page.waitForTimeout(300)
    }
  }
  await r.getByRole('button', { name: `${path[path.length - 1]} ayarları` }).first().click()
  await settle(page, 600)
}

async function selectBrand(page: Page, title: string) {
  const r = root(page, 'Markalar')
  const tile = r.locator(`[data-brand-title="${title}"]`).first()
  if (await tile.count()) await tile.click()
  else await r.getByRole('button', { name: `${title} ayarları` }).first().click()
  await settle(page, 600)
}

async function search(page: Page, which: 'Kategoriler' | 'Markalar', text: string) {
  const r = root(page, which)
  const field = r.locator('input[type="search"], input[type="tel"]').first()
  await field.fill(text)
  await settle(page, 700)
}

const SCENARIOS: { name: string; run: (p: Page) => Promise<void> }[] = [
  {
    name: 'k1-kategori-liste',
    run: async (p) => {
      await open(p, 'Kategoriler')
      await shot(p, file('k1-kategori-liste'))
      await closeUp(p, root(p, 'Kategoriler').locator('.b7-cat-tree, .ek-category-list').first(), 'k1-kategori-liste')
    },
  },
  {
    name: 'k2-kategori-arama',
    run: async (p) => {
      await open(p, 'Kategoriler')
      await search(p, 'Kategoriler', 'tişört')
      await shot(p, file('k2-kategori-arama'))
      await closeUp(p, root(p, 'Kategoriler').locator('.b7-cat-tree, .ek-category-list').first(), 'k2-kategori-arama')
    },
  },
  {
    name: 'k3-kategori-secili',
    run: async (p) => {
      await open(p, 'Kategoriler')
      await selectCategory(p, ['Giyim', 'Kadın', 'Üst Giyim', 'Tişört'])
      await shot(p, file('k3-kategori-secili'))
      await closeUp(p, root(p, 'Kategoriler').locator('.b7-cat-detail, .categorySyncComponent').first(), 'k3-kategori-secili')
      if (narrow) {
        await root(p, 'Kategoriler').locator('.b7-cat-detail, .categorySyncComponent').first().evaluate((el) => el.scrollIntoView({ block: 'start' }))
        await settle(p, 300)
        await shot(p, file('k3-kategori-secili', '-2'))
      }
    },
  },
  {
    name: 'k4-kategori-bos',
    run: async (p) => {
      await open(p, 'Kategoriler', { CategoryService: [], AttributeMappingService: [] })
      await shot(p, file('k4-kategori-bos'))
    },
  },
  {
    name: 'm1-marka-liste',
    run: async (p) => {
      await open(p, 'Markalar')
      await shot(p, file('m1-marka-liste'))
      await closeUp(p, root(p, 'Markalar').locator('.b7-brand-list, .ek-brand-list').first(), 'm1-marka-liste')
    },
  },
  {
    name: 'm2-marka-arama',
    run: async (p) => {
      await open(p, 'Markalar')
      await search(p, 'Markalar', 'ça')
      await shot(p, file('m2-marka-arama'))
    },
  },
  {
    name: 'm3-marka-secili',
    run: async (p) => {
      await open(p, 'Markalar')
      await selectBrand(p, 'Ege Pamuk')
      await shot(p, file('m3-marka-secili'))
      await closeUp(p, root(p, 'Markalar').locator('.b7-brand-detail, .ek-brand-sync').first(), 'm3-marka-secili')
    },
  },
  {
    name: 'm4-marka-bos',
    run: async (p) => {
      await open(p, 'Markalar', { BrandService: [] })
      await shot(p, file('m4-marka-bos'))
    },
  },
]

test.describe('B7 inceleme görüntüleri (kategoriler / markalar)', () => {
  test.skip(!ENABLED, 'Yalnızca B7_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: Number(process.env.B7_REVIEW_SCALE) || 1 })
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-09-30T09:30:00.000Z'))
  })
  for (const s of SCENARIOS) {
    test(s.name, async ({ page }) => {
      test.skip(!want(s.name))
      test.setTimeout(90_000)
      await s.run(page)
      expect(true).toBe(true)
    })
  }
})
