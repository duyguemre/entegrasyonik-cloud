// DS-v2 A6a — ürün ekleme/düzenleme VARYANT ALANI ve TOPLU DÜZENLEME inceleme görüntüleri.
// İddia yok; yalnızca inceleme görüntüsü üretir. Günlük koşuda ATLANIR. Saat sabit.
//   A6A_REVIEW=1 A6A_REVIEW_WIDTH=1440|390 A6A_REVIEW_TAG=before|after \
//     npx playwright test e2e/specs/a6a-review-variants.spec.ts --project=chromium-desktop --workers=1
// Veri tamamen sentetiktir (Protokol 7): 3 renk × 4 beden = 12 varyant (+ stres: 8 × 6 = 48).
import { test, expect, type Page } from '@playwright/test'
import { buildChoice } from '../fixtures/apiData'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, openScreen } from '../fixtures/nav'
import { buildVariant, menuFixtureWithProductUpdate, variantProduct } from '../fixtures/productUpdate'

const ENABLED = process.env.A6A_REVIEW === '1'
const WIDTH = Number(process.env.A6A_REVIEW_WIDTH) || 1440
const HEIGHT = WIDTH <= 480 ? 844 : 900
const TAG = process.env.A6A_REVIEW_TAG || 'after'
const OUT = process.env.A6A_REVIEW_OUT || 'docs/a6a-review'
const NOW = new Date('2026-09-30T09:00:00.000Z')

const COLORS = [
  { _id: 'choiceval-e2e-1', title: 'Siyah' },
  { _id: 'choiceval-e2e-2', title: 'Beyaz' },
  { _id: 'choiceval-rv-lac', title: 'Lacivert' },
  { _id: 'choiceval-rv-kir', title: 'Kırmızı' },
  { _id: 'choiceval-rv-yes', title: 'Yeşil' },
  { _id: 'choiceval-rv-gri', title: 'Antrasit gri' },
  { _id: 'choiceval-rv-bej', title: 'Bej' },
  { _id: 'choiceval-rv-hak', title: 'Haki' },
]
const SIZES = [
  { _id: 'choiceval-rv-s', title: 'S' },
  { _id: 'choiceval-rv-m', title: 'M' },
  { _id: 'choiceval-rv-l', title: 'L' },
  { _id: 'choiceval-rv-xl', title: 'XL' },
  { _id: 'choiceval-rv-2xl', title: '2XL' },
  { _id: 'choiceval-rv-3xl', title: '3XL' },
]
const CHOICES = [
  buildChoice({ title: 'Renk', values: COLORS }),
  buildChoice({ _id: 'choice-e2e-2', title: 'Beden', isSlicer: false, isVarianter: true, values: SIZES }),
]

function product(colorCount: number, sizeCount: number) {
  const variants: any[] = []
  let order = 0
  // İlk varyant openVariantStep'in beklediği SK-E2E-SIYAH olmalı.
  for (const c of COLORS.slice(0, colorCount)) {
    for (const s of SIZES.slice(0, sizeCount)) {
      const code = order === 0 ? 'SK-E2E-SIYAH' : `SK-${c.title.slice(0, 3).toLocaleUpperCase('tr')}-${s.title}`
      variants.push(buildVariant({
        tempId: `rv-${c._id}-${s._id}`,
        stockcode: code,
        barcode: String(8690000100000 + order),
        choices: [{ choiceId: 'choice-e2e-1', choiceValueId: c._id }, { choiceId: 'choice-e2e-2', choiceValueId: s._id }],
        prices: { salePrice: 249.9 + (order % 4) * 10, marketPrice: 299.9 + (order % 4) * 10, isPlatformBasedPrice: false },
        stock: (order * 7) % 23,
        shelf: order % 3 ? `A-${String(order).padStart(2, '0')}` : undefined,
        order: order++,
      }))
    }
  }
  return { ...variantProduct, variants }
}

/** openVariantStep ile aynı yol; ilk satırın görünür olmasını değil tablonun yüklenmesini bekler (dar ekranda satır kaydırma dışında kalabilir). */
async function openVariantStep(page: Page, prod: any, overrides: Record<string, any> = {}) {
  await installApiMocks(page, { MenuService: menuFixtureWithProductUpdate, 'ProductService/retrieveProduct': { product: prod }, ...overrides })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()
  const root = page.locator(`.productUpdateView${prod._id}`)
  await expect(root.getByText('Varyant Bilgileri')).toBeVisible({ timeout: 20_000 })
  await root.getByText('Varyant Bilgileri').click()
  await expect(root.getByText(/^SK-/).first()).toBeAttached()
  return root
}

const file = (name: string) => `${OUT}/variants-${name}-${TAG}-${WIDTH}.png`

async function settle(page: Page, ms = 500) {
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(ms)
}
async function shoot(page: Page, name: string) {
  await settle(page, 400)
  await page.screenshot({ path: file(name) })
}
async function openOps(page: Page, root: any, label: string) {
  await root.getByRole('button', { name: 'Varyant işlemleri' }).first().click()
  const menu = page.locator('.v-overlay--active [role="menu"]').filter({ hasText: 'Varyant İşlemleri' })
  await menu.getByText(label, { exact: true }).click()
  await settle(page, 700)
}

test.describe('A6a inceleme — varyant alanı', () => {
  test.skip(!ENABLED, 'Yalnızca A6A_REVIEW=1 ile (inceleme turu)')
  test.use({ viewport: { width: WIDTH, height: HEIGHT } })
  test.beforeEach(async ({ page }) => { await page.clock.setFixedTime(NOW) })

  test('ızgara (12 varyant)', async ({ page }) => {
    const root = await openVariantStep(page, product(3, 4), { ChoiceService: CHOICES })
    await settle(page, 800)
    await shoot(page, 'grid')
    // hücre içi düzenleme: ilk satırın stok hücresi
    const stockCell = root.locator('[data-cell="stock"]').first()
    if (await stockCell.count()) {
      await stockCell.click()
      await page.keyboard.type('5')
    } else {
      await root.locator('.pv-td-stock .pv-clickable').first().click()
    }
    await shoot(page, 'grid-edit')
  })

  test('ızgara (48 varyant, stres)', async ({ page }) => {
    await openVariantStep(page, product(8, 6), { ChoiceService: CHOICES })
    await settle(page, 800)
    await shoot(page, 'grid-stress')
  })

  test('toplu fiyat düzenleme', async ({ page }) => {
    const root = await openVariantStep(page, product(3, 4), { ChoiceService: CHOICES })
    await openOps(page, root, 'Toplu Fiyat Düzenleme')
    await shoot(page, 'batch-prices')
  })

  test('toplu özellik düzenleme', async ({ page }) => {
    const root = await openVariantStep(page, product(3, 4), { ChoiceService: CHOICES })
    await openOps(page, root, 'Toplu Özellik Düzenleme')
    await shoot(page, 'batch-attributes')
  })

  test('toplu düzenleyici (seçim + önizleme)', async ({ page }) => {
    const root = await openVariantStep(page, product(3, 4), { ChoiceService: CHOICES })
    const menuItem = 'Toplu düzenle'
    await root.getByRole('button', { name: 'Varyant işlemleri' }).first().click()
    const menu = page.locator('.v-overlay--active [role="menu"]').filter({ hasText: 'Varyant İşlemleri' })
    if (!(await menu.getByText(menuItem, { exact: true }).count())) { test.skip(true, 'Toplu düzenleyici bu sürümde yok'); return }
    await menu.getByText(menuItem, { exact: true }).click()
    const editor = page.locator('.vbe-root')
    await expect(editor).toBeVisible()
    await settle(page, 600)
    await shoot(page, 'bulk-editor')
    // satış fiyatı kolonunu seç, %10 artır
    await editor.getByRole('columnheader', { name: /Satış fiyatı/ }).first().click()
    await settle(page, 200)
    await shoot(page, 'bulk-editor-colselect')
    const op = editor.locator('[data-bulk-op]')
    if (await op.count()) {
      await editor.getByRole('button', { name: 'Yüzde' }).click().catch(() => undefined)
      await editor.getByLabel('Değer').fill('10')
      await editor.getByRole('button', { name: 'Seçime uygula' }).click()
      await settle(page, 300)
      await shoot(page, 'bulk-editor-applied')
      await editor.getByRole('button', { name: /Değişiklikleri gözden geçir/ }).click()
      await settle(page, 400)
      await shoot(page, 'bulk-editor-preview')
    }
  })
})
