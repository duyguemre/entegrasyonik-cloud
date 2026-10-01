// FE R4 Şerit B (K61) — yeniden tasarlanan ürün ekleme/düzenleme formu: erişilebilirlik (axe AA, tüm ihlaller = 0),
// yatay taşma yok, kayıt çubuğu uzun adımda erişilebilir (masaüstü yapışkan). Davranış karakterizasyonu vitest'tedir
// (`tests/fe-r4b-product-form-characterization.test.ts`); gönderilen gövdeler `product-form-bodies.spec.ts`.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { brandsDoluFixture, categoriesDoluFixture, choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixture, openScreen } from '../fixtures/nav'
import { galleryImages, r2cSingleProduct, r2cVariantProduct } from '../fixtures/productFormR2c'

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const menu = [
  ...menuFixture,
  {
    group: 'r4bProductForms',
    links: [
      { code: 'ProductDefinitionView', parent: 'definitions', title: 'productDefinition', singleton: true },
      { code: 'ProductUpdateView', parent: '', title: 'productUpdate', singleton: false },
    ],
  },
]

async function openUpdate(page: Page, product: any) {
  await installApiMocks(page, {
    MenuService: menu,
    ChoiceService: choicesDoluFixture,
    BrandService: brandsDoluFixture,
    CategoryService: categoriesDoluFixture,
    'ProductService/retrieveProduct': { product },
    getImages: { images: galleryImages },
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').first().click()
  const root = page.locator(`.productUpdateView${product._id}`)
  await expect(root.getByRole('navigation', { name: 'Ürün formu adımları' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Şimdi değil' }).click({ timeout: 2000 }).catch(() => undefined)
  return root
}

async function axeClean(page: Page, scope: string) {
  const res = await new AxeBuilder({ page }).include(scope).withTags(AXE_TAGS).analyze()
  return res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)
}

async function noHorizontalOverflow(page: Page, scope: string) {
  return page.locator(scope).evaluate((el) => {
    const flow = el.querySelector('.pdv-flow') as HTMLElement | null
    const nav = el.querySelector('.pfw-nav') as HTMLElement | null
    const over = (n: HTMLElement | null) => (n ? n.scrollWidth - n.clientWidth : 0)
    return Math.max(over(flow), over(nav))
  })
}

test.describe('FE R4 B — ürün formu (yeniden tasarım)', () => {
  test('tekil ürün: 4 adımda axe AA ihlali yok, yatay taşma yok', async ({ page }) => {
    const root = await openUpdate(page, r2cSingleProduct)
    const scope = `.productUpdateView${r2cSingleProduct._id}`
    for (const step of ['Kategori Seçimi', 'Ürün Tanımı', 'Tekil Ürün Bilgisi', 'Detay Bilgiler']) {
      await root.getByRole('navigation', { name: 'Ürün formu adımları' }).getByRole('button', { name: new RegExp(step) }).click()
      await expect(root.getByRole('navigation', { name: 'Ürün formu adımları' }).locator('[aria-current="step"]')).toContainText(step)
      await page.waitForTimeout(250)
      expect(await axeClean(page, scope), step).toEqual([])
      expect(await noHorizontalOverflow(page, scope), step).toBeLessThanOrEqual(1)
    }
    // kontrol paneli açıkken de temiz
    await root.getByRole('button', { name: 'Kayıt özeti' }).click()
    await expect(root.getByRole('region', { name: 'Kayıt öncesi kontrol' })).toBeVisible()
    expect(await axeClean(page, scope)).toEqual([])
  })

  test('varyantlı ürün: varyant adımı axe AA ihlali yok; rowspan grup hücreleri yerinde', async ({ page }) => {
    const root = await openUpdate(page, r2cVariantProduct)
    await root.getByRole('navigation', { name: 'Ürün formu adımları' }).getByRole('button', { name: /Varyant Bilgileri/ }).click()
    await expect(root.getByText('SK-R2C-SIYAH-S')).toBeVisible()
    const groups = root.locator('.vg [role="rowheader"]')
    await expect(groups).toHaveCount(2)
    await expect(groups.nth(0)).toHaveAttribute('rowspan', '2')
    await expect(groups.nth(1)).toHaveAttribute('rowspan', '1')
    expect(await axeClean(page, `.productUpdateView${r2cVariantProduct._id} .pdv-flow`)).toEqual([])
  })

  test('ekleme: kategori adımı ve kontrol paneli axe AA ihlali yok; Kaydet kapalı, nedeni yazılı', async ({ page }, testInfo) => {
    // ProductListView (B1 kapsamı) mobilde "Yeni ürün" düğmesini tablo örtüyor — product-definitions.spec ile aynı fixme.
    test.fixme(testInfo.project.name === 'chromium-mobile', 'B1: ProductListView tablosu mobilde "Yeni ürün" düğmesini örtüyor')
    await installApiMocks(page, { MenuService: menu, ChoiceService: choicesDoluFixture, BrandService: brandsDoluFixture, CategoryService: categoriesDoluFixture })
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    await page.getByRole('button', { name: 'Yeni ürün', exact: true }).click()
    const root = page.locator('.productDefinitionView')
    await expect(root.getByRole('navigation', { name: 'Ürün formu adımları' })).toBeVisible({ timeout: 20_000 })
    await page.getByRole('button', { name: 'Şimdi değil' }).click({ timeout: 2000 }).catch(() => undefined)
    const save = root.getByRole('button', { name: 'Kaydet' })
    await expect(save).toBeDisabled()
    await expect(save).toHaveAccessibleDescription(/Kaydet için 5 zorunlu bilgi eksik/)
    expect(await axeClean(page, '.productDefinitionView .pdv-flow')).toEqual([])
    await root.getByRole('button', { name: 'Eksikleri göster' }).click()
    await expect(root.getByRole('region', { name: 'Kayıt öncesi kontrol' })).toBeVisible()
    expect(await axeClean(page, '.productDefinitionView .pdv-flow')).toEqual([])
    expect(await noHorizontalOverflow(page, '.productDefinitionView')).toBeLessThanOrEqual(1)
  })

  test('uzun adımda aşağı kaydırınca Güncelle düğmesi görünür kalır (masaüstü/tablet yapışkan çubuk)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-mobile', 'mobilde kayıt çubuğu akışta (yapışkan değil)')
    const root = await openUpdate(page, r2cSingleProduct)
    await root.getByRole('navigation', { name: 'Ürün formu adımları' }).getByRole('button', { name: /Tekil Ürün Bilgisi/ }).click()
    await root.evaluate((el: HTMLElement) => {
      let n: HTMLElement | null = el
      while (n && !(n.scrollHeight > n.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowY))) n = n.parentElement
      n?.scrollBy(0, 600)
    })
    await page.waitForTimeout(200)
    await expect(root.getByRole('button', { name: 'Güncelle' })).toBeInViewport()
  })
})
