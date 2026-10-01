// FR2-PFORM (bulut fe-r2c) — ürün formu davranışları: combobox'tan yeni marka/kategori (madde 23),
// galeri sürükle-bırak hayaleti ve sıralama (27-28). Sentetik veri (Protokol 7), backend yok.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import type { Page, Route } from '@playwright/test'
import { installApiMocks, mockError } from '../fixtures/mockApi'
import { brandsDoluFixture, categoriesDoluFixture, choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, openScreen } from '../fixtures/nav'
import { menuFixtureWithProductUpdate } from '../fixtures/productUpdate'
import { galleryImages, r2cSingleProduct, r2cVariantProduct } from '../fixtures/productFormR2c'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
const json = (route: Route, headers: Record<string, string>, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(body) })

async function openProduct(page: Page, product: any, extra: Record<string, any> = {}) {
  await installApiMocks(page, {
    MenuService: menuFixtureWithProductUpdate,
    ChoiceService: choicesDoluFixture,
    BrandService: brandsDoluFixture,
    CategoryService: categoriesDoluFixture,
    'ProductService/retrieveProduct': { product },
    getImages: { images: galleryImages },
    ...extra,
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()
  const root = page.locator(`.productUpdateView${product._id}`)
  await expect(root.getByText('Ürün Tanımı').first()).toBeVisible({ timeout: 20_000 })
  // Tanıtım turu kartı dar ekranda form alt çubuğunu örter; kullanıcı gibi kapatılır.
  await page.getByRole('button', { name: 'Şimdi değil' }).click({ timeout: 3000 }).catch(() => undefined)
  return root
}

test.describe('FR2-PFORM 23 — yeni marka/kategori ekle', () => {
  test('marka: yazılan ad önerilir → diyalog → eklenir, liste yenilenir ve SEÇİLİ gelir', async ({ page }, testInfo) => {
    let brands = [...brandsDoluFixture]
    const posted: any[] = []
    const root = await openProduct(page, r2cSingleProduct, {
      BrandService: (route: Route, h: Record<string, string>) => json(route, h, brands),
      'BrandService/addBrand': (route: Route, h: Record<string, string>) => {
        const body = route.request().postDataJSON()
        posted.push(body)
        brands = [...brands, { _id: 'brand-new-1', title: body.title, parentId: null }]
        return json(route, h, { _id: 'brand-new-1' })
      },
    })
    await root.getByText('Ürün Tanımı').first().click()
    const input = root.locator('[data-pf-field="brand"] input').first()
    await input.click()
    await input.fill('Kuzey Tekstil')
    const row = page.locator('[data-qc-row]')
    await expect(row).toContainText('“Kuzey Tekstil” adıyla yeni marka ekle')
    await row.click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Yeni marka' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Marka adı *')).toHaveValue('Kuzey Tekstil')
    const axe = await new AxeBuilder({ page }).include('.v-overlay--active:not(.v-snackbar)').withTags(AXE_TAGS).analyze()
    await testInfo.attach('axe-quick-create.json', { body: JSON.stringify(axe.violations, null, 2), contentType: 'application/json' })
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])
    await dialog.getByRole('button', { name: 'Ekle ve seç' }).click()

    await expect(dialog).toBeHidden()
    expect(posted).toEqual([{ title: 'Kuzey Tekstil' }])
    await expect(root.locator('[data-pf-field="brand"]')).toContainText('Kuzey Tekstil')
    await expect(page.getByText('“Kuzey Tekstil” markası eklendi ve seçildi.')).toBeVisible()
  })

  test('marka: aynı ad varsa yeni kayıt açılmaz, "Onu seç" mevcut markayı seçer', async ({ page }) => {
    const root = await openProduct(page, { ...r2cSingleProduct, brand: 'brand-e2e-1' })
    await root.getByText('Ürün Tanımı').first().click()
    const input = root.locator('[data-pf-field="brand"] input').first()
    await input.click()
    await input.fill('e2e marka iki')
    // listede eşleşen var → satır yine görünür (yazılan ad önerilir)
    await page.locator('[data-qc-row]').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Yeni marka' })
    await expect(dialog.getByText('“E2E Marka İki” zaten listede')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Ekle ve seç' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Onu seç' }).click()
    await expect(root.locator('[data-pf-field="brand"]')).toContainText('E2E Marka İki')
  })

  test('marka: sunucu hatası diyalogda anlaşılır mesajla kalır (ham hata yok)', async ({ page }) => {
    const root = await openProduct(page, r2cSingleProduct, { 'BrandService/addBrand': mockError(500, { error: 'E11000 duplicate key' }) })
    await root.getByText('Ürün Tanımı').first().click()
    const input = root.locator('[data-pf-field="brand"] input').first()
    await input.click()
    await input.fill('Güney Deri')
    await page.keyboard.press('Enter') // eşleşme yok → Enter diyaloğu açar
    const dialog = page.getByRole('dialog').filter({ hasText: 'Yeni marka' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Ekle ve seç' }).click()
    await expect(dialog.getByText('Marka eklenemedi — bağlantınızı kontrol edip tekrar deneyin.')).toBeVisible()
    await expect(dialog).not.toContainText('E11000')
    await expect(dialog.getByLabel('Marka adı *')).toHaveValue('Güney Deri')
  })

  test('kategori (ürün formu kademeli seçici): açık klasör altına eklenir ve seçilir', async ({ page }) => {
    let tree = JSON.parse(JSON.stringify(categoriesDoluFixture))
    const posted: any[] = []
    const root = await openProduct(page, { ...r2cSingleProduct, category: undefined }, {
      CategoryService: (route: Route, h: Record<string, string>) => json(route, h, tree),
      'CategoryService/addCategory': (route: Route, h: Record<string, string>) => {
        const body = route.request().postDataJSON()
        posted.push(body)
        tree = JSON.parse(JSON.stringify(tree))
        tree[0].children[0].children.push({ _id: 'cat-new-1', title: body.title, children: [] })
        return json(route, h, { _id: 'cat-new-1' })
      },
    })
    await root.getByText('Kategori Seçimi').first().click()
    await root.getByRole('option', { name: /E2E Kategori Bir/ }).click()
    const open = root.locator('[data-qc-open="category"]')
    await expect(open).toContainText('“E2E Kategori Bir” altına kategori ekle')
    await open.click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Yeni kategori' })
    await dialog.getByLabel('Kategori adı *').fill('Tişört')
    await dialog.getByRole('button', { name: 'Ekle ve seç' }).click()
    await expect(dialog).toBeHidden()
    expect(posted).toEqual([{ parentCategoryId: 'cat-e2e-1', title: 'Tişört' }])
    await expect(root.getByRole('option', { name: /Tişört/ })).toHaveAttribute('aria-selected', 'true')
  })
})

test.describe('FR2-PFORM 27-28 — galeri', () => {
  test('sürükleme hayaleti fare imlecinin altında kalır ve bırakınca sıra kaydedilir', async ({ page }) => {
    const sorted: any[] = []
    const root = await openProduct(page, r2cSingleProduct, {
      sortImages: (route: Route, h: Record<string, string>) => { sorted.push(route.request().postDataJSON()); return json(route, h, true) },
    })
    await root.getByText('Ürün Tanımı').first().click()
    await root.locator('[data-pf-field="gallery"]').click()
    const card = page.locator('.v-overlay--active').filter({ hasText: 'Resim Galerisi' }).first()
    const tile = card.locator('.pig-tile').nth(2)
    await expect(tile).toBeVisible()
    const axe = await new AxeBuilder({ page }).include('.v-overlay--active:not(.v-snackbar)').withTags(AXE_TAGS).analyze()
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([])
    await tile.scrollIntoViewIfNeeded()
    const box = (await tile.boundingBox())!
    const sx = box.x + box.width / 2
    const sy = box.y + box.height / 2
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.mouse.move(sx + 12, sy + 6, { steps: 3 })
    await page.mouse.move(sx + 120, sy + 30, { steps: 8 })
    const clone = page.locator('.pig-drag-clone')
    await expect(clone).toBeVisible()
    const cb = (await clone.boundingBox())!
    // İmleç, kopyanın içinde ve tuttuğu noktaya yakın (eskiden diyalog dönüşümü kadar kayıktı).
    const mx = sx + 120
    const my = sy + 30
    expect(mx).toBeGreaterThanOrEqual(cb.x)
    expect(mx).toBeLessThanOrEqual(cb.x + cb.width)
    expect(my).toBeGreaterThanOrEqual(cb.y)
    expect(my).toBeLessThanOrEqual(cb.y + cb.height)
    // ilk hücreye (kapak) bırak
    const cover = (await card.locator('.pig-tile').first().boundingBox())!
    await page.mouse.move(cover.x + cover.width / 3, cover.y + cover.height / 3, { steps: 10 })
    await page.mouse.up()
    await expect.poll(() => sorted.length).toBeGreaterThan(0)
    expect(sorted.at(-1).sortedImageIds[0]).toBe('img-r2c-3')
  })
})

test.describe('FR2-PFORM 24/29 — varyant ızgarası görselleri', () => {
  test('varyant küçük resmi okunur boyutta (≥ 48px) ve görsel sayısı rozetli', async ({ page }) => {
    const root = await openProduct(page, r2cVariantProduct)
    await root.getByText('Varyant Bilgileri').first().click()
    const thumb = root.locator('.vg-row').filter({ hasText: 'SK-R2C-SIYAH-S' }).locator('.vg-thumb')
    await expect(thumb).toBeVisible()
    const tb = (await thumb.boundingBox())!
    expect(tb.width).toBeGreaterThanOrEqual(48)
    expect(tb.height).toBeGreaterThanOrEqual(48)
    await expect(thumb).toHaveAttribute('aria-label', /2 görsel/)
    const axe = await new AxeBuilder({ page }).include('.vg').withTags(AXE_TAGS).analyze()
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([])
  })
})

test.describe('FR2-PFORM 25 — kanal bazında fiyatlar', () => {
  test('özel fiyat ana fiyattan kopyalanır, ana fiyata dönülür, toplu % artış önizlenir ve kayda gider', async ({ page }, testInfo) => {
    const bodies: any[] = []
    const root = await openProduct(page, JSON.parse(JSON.stringify(r2cSingleProduct)), {
      'ProductService/updateProduct': (route: Route, h: Record<string, string>) => { bodies.push(route.request().postDataJSON()); return json(route, h, { result: true }) },
    })
    await root.getByText('Tekil Ürün Bilgisi').first().click()
    const summary = root.locator('[data-pf-field="channelPrices"]')
    await expect(summary).toContainText('Ideasoft')
    await expect(summary).toContainText('ana fiyat')
    await summary.click()

    const dialog = page.locator('.v-overlay--active').filter({ hasText: 'Kanal bazında fiyatlar' }).first()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('2 kanalda özel fiyat · 1 kanal ana fiyatla')
    const axe = await new AxeBuilder({ page }).include('.v-overlay--active:not(.v-snackbar)').withTags(AXE_TAGS).analyze()
    await testInfo.attach('axe-channel-prices.json', { body: JSON.stringify(axe.violations, null, 2), contentType: 'application/json' })
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')).toEqual([])

    await dialog.locator('[data-cpe="custom-ideasoft"]').click()
    await expect(dialog.getByLabel('Ideasoft satış fiyatı')).toHaveValue('349,90')
    await dialog.locator('[data-cpe="reset-trendyol"]').click()
    await expect(dialog.locator('[data-cpe-row="trendyol"]')).toContainText('Ana fiyat')

    await dialog.locator('[data-cpe="bulk-toggle"]').click()
    await dialog.locator('[data-cpe="bulk-value"] input').fill('10')
    await expect(dialog.locator('.cpe-bulk__preview')).toContainText('3 kanalda satış fiyatı %10 artar')
    await expect(dialog.locator('.cpe-bulk__preview')).toContainText('1 kanal ana fiyattan özel fiyata geçer')
    await dialog.locator('[data-cpe="bulk-apply"]').click()
    await expect(dialog.getByLabel('Trendyol satış fiyatı')).toHaveValue('384,89')
    await expect(dialog.getByLabel('Hepsiburada satış fiyatı')).toHaveValue('395,89')
    await dialog.getByRole('button', { name: 'Tamam' }).click()

    await root.getByRole('button', { name: 'Güncelle' }).first().click()
    await expect.poll(() => bodies.length).toBeGreaterThan(0)
    const v0 = bodies.at(-1).productInfo.variants[0]
    expect(v0.platforms.trendyol.prices).toEqual({ salePrice: 384.89, marketPrice: 449.9 })
    expect(v0.platforms.ideasoft.prices).toEqual({ salePrice: 384.89, marketPrice: 449.9 })
    expect(v0.prices.salePrice).toBe(349.9)
  })
})
