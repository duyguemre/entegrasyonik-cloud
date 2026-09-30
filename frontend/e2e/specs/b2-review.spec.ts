// Faz 3 B2 — ürün resim galerisi + varyanta resim atama: inceleme kareleri (iddia yok; günlük koşuda ATLANIR).
//   B2_REVIEW=1 B2_WIDTH=1440|390 B2_OUT=docs/b2-review/after E2E_PORT=4392 \
//     npx playwright test e2e/specs/b2-review.spec.ts --project=chromium-desktop --workers=1
// Dosya adı: `<OUT>/<durum>-<genişlik>.png`, `-yakin` = 2x yakın çekim. Veri sentetik (fixtures/productImages.ts).
import { test, expect, type Page } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'
import { menuFixtureWithProductUpdate } from '../fixtures/productUpdate'
import { galleryChoices, galleryImages, galleryProduct, routeImages, TINY_PNG } from '../fixtures/productImages'

const ENABLED = process.env.B2_REVIEW === '1'
const PHASE = process.env.B2_PHASE || 'after'
const WIDTH = Number(process.env.B2_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const OUT = process.env.B2_OUT || 'docs/b2-review/after'
const file = (name: string) => `${OUT}/${name}-${WIDTH}.png`

test.skip(!ENABLED, 'yalnız inceleme koşusu (B2_REVIEW=1)')
test.use({ viewport: { width: WIDTH, height: HEIGHT } })
test.setTimeout(90_000)

async function open(page: Page, product: any, extra: Record<string, any> = {}) {
  await routeImages(page)
  await installApiMocks(page, {
    MenuService: menuFixtureWithProductUpdate,
    ChoiceService: [...galleryChoices, ...choicesDoluFixture],
    'ProductService/retrieveProduct': { product },
    getImages: { _id: product._id, images: product.images },
    ...extra,
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()
  const root = page.locator(`.productUpdateView${product._id}`)
  await expect(root.getByText('Ürün Tanımı').first()).toBeVisible({ timeout: 45_000 })
  return root
}

async function openGallery(page: Page, product: any, extra: Record<string, any> = {}) {
  const root = await open(page, product, extra)
  await root.getByText('Ürün Tanımı').first().click()
  await root.getByText('Resim Galerisi').first().click()
  const panel = page.locator('.v-overlay--active').filter({ hasText: 'Ürün Resim Galerisi' }).first()
  await expect(panel).toBeVisible()
  await page.waitForTimeout(600)
  return panel
}

async function snap(page: Page, name: string, panel?: any, closeup?: any) {
  await page.screenshot({ path: file(name) })
  if (closeup) {
    const box = await closeup.boundingBox()
    if (box) {
      await page.setViewportSize({ width: WIDTH, height: HEIGHT })
      await closeup.screenshot({ path: file(`${name}-yakin`), scale: 'device' })
    }
  }
}

test.describe('B2 inceleme', () => {
  test.use({ deviceScaleFactor: 2, ...(WIDTH <= 480 ? { hasTouch: true, isMobile: true } : {}) })

  test('bos', async ({ page }) => {
    const panel = await openGallery(page, galleryProduct({ images: [], assigned: false }), { getImages: { images: [] } })
    await snap(page, '01-bos', panel, panel)
  })

  test('dolu', async ({ page }) => {
    const panel = await openGallery(page, galleryProduct())
    await snap(page, '02-dolu', panel, panel)
  })

  test('varyant paneli', async ({ page }) => {
    const root = await open(page, galleryProduct())
    await root.getByText('Varyant Bilgileri').click()
    await expect(root.getByText('TSH-KIR-S')).toBeVisible()
    await root.locator('tbody tr').filter({ hasText: 'TSH-KIR-S' }).getByRole('button', { name: /^Varyant resimleri/ }).click()
    const panel = page.locator('.v-overlay--active').filter({ hasText: /Varyant Resimleri|varyant görselleri/i }).first()
    await expect(panel).toBeVisible()
    await page.waitForTimeout(600)
    await snap(page, '05-varyant-paneli', panel, panel)
  })

  test('satir onizleme', async ({ page }) => {
    const root = await open(page, galleryProduct())
    await root.getByText('Varyant Bilgileri').click()
    await expect(root.getByText('TSH-KIR-S')).toBeVisible()
    await page.waitForTimeout(500)
    await snap(page, '06-varyant-satirlari', undefined, root.locator('table').first())
  })

  if (PHASE === 'after') {
    test('yukleniyor ve hata', async ({ page }) => {
      let calls = 0
      const panel = await openGallery(page, galleryProduct(), {
        upload: async (route: any, headers: any) => {
          calls++
          if (calls === 2) return route.fulfill({ status: 500, headers, contentType: 'application/json', body: '{"error":"x"}' })
          await new Promise((r) => setTimeout(r, 60_000))
          return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ result: galleryImages }) })
        },
      })
      const input = panel.locator('input[type="file"]').first()
      await input.setInputFiles([
        { name: 'on-yuz.png', mimeType: 'image/png', buffer: TINY_PNG },
        { name: 'arka-yuz.png', mimeType: 'image/png', buffer: TINY_PNG },
      ])
      await page.waitForTimeout(900)
      await snap(page, '03-yukleniyor-hata', panel, panel.locator('.pig-grid').first())
    })

    test('atama', async ({ page }) => {
      const panel = await openGallery(page, galleryProduct())
      await panel.getByRole('tab', { name: /Varyant/ }).click()
      await page.waitForTimeout(500)
      await snap(page, '04-atama', panel, panel)
    })

    test('atama editoru', async ({ page }) => {
      const panel = await openGallery(page, galleryProduct())
      await panel.getByRole('tab', { name: /Varyant/ }).click()
      const row = panel.locator('.via__row').filter({ hasText: 'Beyaz' })
      await row.getByRole('button', { name: 'Görsel seç' }).click()
      await row.getByRole('button', { name: /^Görsel 5/ }).click()
      await page.waitForTimeout(400)
      await snap(page, '04b-atama-editoru', panel, row)
    })

    test('secim ve toplu atama', async ({ page }) => {
      const panel = await openGallery(page, galleryProduct())
      await panel.getByLabel('Görsel 5 seç').check({ force: true })
      await panel.getByLabel('Görsel 6 seç').check({ force: true })
      await panel.getByRole('button', { name: 'Varyantlara ata' }).click()
      await panel.getByRole('button', { name: 'Beyaz', exact: true }).click()
      await page.waitForTimeout(400)
      await snap(page, '08-secim-toplu-atama', panel, panel.locator('.pig-gallery'))
    })

    test('onizleme', async ({ page }) => {
      const panel = await openGallery(page, galleryProduct())
      await panel.getByRole('button', { name: /büyük önizleme/i }).first().click()
      await page.waitForTimeout(500)
      await snap(page, '07-onizleme', panel)
    })
  }
})
