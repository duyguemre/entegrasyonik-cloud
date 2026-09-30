// B1 — ürün listesi: varyant alt listesi ürün güncelle ızgarasıyla aynı rowspan'lı grup deseni + premium küçük görsel.
// Davranış iddiaları (3 viewport): grup hücresi rowspan + tanım sırası, sayı rozeti yok, yığın ipucu, satır yüksekliği sabit,
// gecikmeli önizleme (fare + klavye), dar kapta kart + grup başlığı, axe (varyant alanı).
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { reviewMocks, reviewPath } from '../fixtures/reviewScreens'
import { buildProduct, buildChoice } from '../fixtures/apiData'
import { waitForWorkplaceReady } from '../fixtures/nav'

const PIXEL = '<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="60" height="60" fill="#7a869a"/></svg>'
const img = (id: string, order = 0) => ({ _id: id, url: `https://images.entegrasyonik.com/products/b1e2e/${id}.svg`, width: 60, height: 60, extension: 'svg', order })

const CHOICES = [
  buildChoice({ _id: 'ch-renk', title: 'Renk', isSlicer: true, isVarianter: false, values: [{ _id: 'c-siyah', title: 'Siyah' }, { _id: 'c-beyaz', title: 'Beyaz' }] }),
  buildChoice({ _id: 'ch-beden', title: 'Beden', isSlicer: false, isVarianter: true, values: [{ _id: 's-s', title: 'S' }, { _id: 's-m', title: 'M' }, { _id: 's-l', title: 'L' }] }),
]
const V = (i: number, color: string, size: string, images: string[] = []) => ({
  _id: `b1e-v${i}`, stockcode: `B1E-${color}-${size}`, barcode: `869000000${7000 + i}`,
  choices: [{ choiceId: 'ch-renk', choiceValueId: color, slicer: true }, { choiceId: 'ch-beden', choiceValueId: size }],
  prices: { salePrice: 100 + i, marketPrice: 0, isPlatformBasedPrice: false }, stock: 10 + i, images,
  platforms: { trendyol: { upload: { TRANSFER: { status: 'COMPLETED' }, onSale: true } } },
})
// Karışık giriş sırası: beklenen = Siyah (S, M, L), Beyaz (S, L) — tanım sırası.
const PRODUCT = buildProduct({
  _id: 'b1e-p', title: 'B1 grup ürünü', hasVariant: true, images: [img('a', 0), img('b', 1)],
  variants: [V(0, 'c-beyaz', 's-l'), V(1, 'c-siyah', 's-m', ['a', 'b']), V(2, 'c-siyah', 's-l'), V(3, 'c-beyaz', 's-s', ['a']), V(4, 'c-siyah', 's-s')],
})
const SINGLE = buildProduct({ _id: 'b1e-s', title: 'B1 tek görselli ürün', images: [img('a')] })

async function open(page: Page) {
  await page.route('https://images.entegrasyonik.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: PIXEL }))
  await installApiMocks(page, reviewMocks({
    ChoiceService: CHOICES,
    'ProductService/getProducts': { products: [PRODUCT, SINGLE], totalNumberOfRecords: 2, fromTo: '1-2 / 2', isFiltered: false },
  }))
  await page.goto(reviewPath('productDefinitions/ProductListView'))
  await waitForWorkplaceReady(page)
  await page.locator('.productListView .ek-grid').first().waitFor()
}
async function expand(page: Page) {
  await page.locator('.productListView').getByRole('button', { name: /5 seçenek/ }).first().click()
  const target = page.locator('#variant-target-b1e-p .pvl')
  await expect(target).toBeVisible()
  return target
}

test.describe('B1 — ürün listesi varyant grupları ve küçük görseller', () => {
  test('grup hücresi rowspan ile birleşik, sıra seçenek tanım sırası; satırlar eşit yükseklikte', async ({ page }) => {
    await open(page)
    const pvl = await expand(page)
    const groups = pvl.locator('td.ek-vgroup')
    await expect(groups).toHaveCount(2)
    await expect(groups.nth(0)).toHaveAttribute('rowspan', '3')
    await expect(groups.nth(0)).toContainText('Siyah')
    await expect(groups.nth(0)).toContainText('3 varyant')
    await expect(groups.nth(1)).toHaveAttribute('rowspan', '2')
    const codes = await pvl.locator('.pvl-code').allTextContents()
    expect(codes).toEqual(['B1E-c-siyah-s-s', 'B1E-c-siyah-s-m', 'B1E-c-siyah-s-l', 'B1E-c-beyaz-s-s', 'B1E-c-beyaz-s-l'])
    const vw = page.viewportSize()!.width
    if (vw >= 800) {
      const heights = await pvl.locator('tr.pvl-row').evaluateAll((rs) => rs.map((r) => Math.round(r.getBoundingClientRect().height)))
      expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1)
    }
  })

  test('küçük görsel: sayı rozeti yok, çoklu görselde yığın ipucu, görselsizde yer tutucu', async ({ page }) => {
    await open(page)
    const row = page.locator('.productListView .ek-grid__row').filter({ hasText: 'B1 grup ürünü' }).first()
    await expect(page.locator('.plv-thumb__count')).toHaveCount(0)
    await expect(row.locator('.plv-thumb')).toHaveClass(/is-stacked/)
    await expect(row.locator('.plv-thumb')).toHaveAttribute('data-image-state', 'loaded')
    const single = page.locator('.productListView .ek-grid__row').filter({ hasText: 'B1 tek görselli ürün' }).first()
    await expect(single.locator('.plv-thumb')).not.toHaveClass(/is-stacked/)
    const pvl = await expand(page)
    await expect(pvl.locator('.pvl-thumb.is-empty').first()).toBeVisible()
    await expect(pvl.locator('.pvl-thumb.is-empty .mdi-image-outline').first()).toBeVisible()
  })

  test('önizleme gecikmeli açılır (fare) ve klavye odağıyla da açılır', async ({ page }) => {
    test.skip(page.viewportSize()!.width < 800, 'dokunmatik/dar ekranda üzerine gelme yok')
    await open(page)
    const thumb = page.locator('.productListView .ek-grid__row').filter({ hasText: 'B1 grup ürünü' }).first().locator('.plv-thumb')
    await thumb.hover()
    await page.waitForTimeout(150)
    await expect(page.locator('.pth-preview')).toHaveCount(0)
    await expect(page.locator('.pth-preview .pth-pop__frame')).toBeVisible({ timeout: 2000 })
    const box = await page.locator('.pth-preview .pth-pop__frame').boundingBox()
    expect(Math.round(box!.width)).toBe(240)
    expect(Math.round(box!.height)).toBe(240)
    await expect(page.locator('.pth-preview .pth-pop__cell')).toHaveCount(2)
    await page.mouse.move(2, 2)
    await expect(page.locator('.pth-preview')).toBeHidden()
    await thumb.focus()
    await expect(page.locator('.pth-preview .pth-pop__frame')).toBeVisible({ timeout: 2000 })
    await expect(thumb).toHaveAttribute('aria-label', /B1 grup ürünü ürününü düzenle/)
  })

  test('dar kap: kart görünümü, grup hücresi kartın üstünde tam genişlik', async ({ page }) => {
    test.skip(page.viewportSize()!.width >= 600, 'yalnız dar ekran')
    await open(page)
    const pvl = await expand(page)
    const row = pvl.locator('tr.pvl-row.has-group-cell').first()
    expect(await row.evaluate((r) => getComputedStyle(r).display)).toBe('grid')
    const g = await row.locator('td.ek-vgroup').boundingBox()
    const r = await row.boundingBox()
    expect(g!.width).toBeGreaterThan(r!.width - 2)
  })

  test('axe: açık varyant alanında ihlal yok', async ({ page }) => {
    await open(page)
    await expand(page)
    const res = await new AxeBuilder({ page }).include('#variant-target-b1e-p').analyze()
    expect(res.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([])
  })
})
