// FE R5 Şerit B (bulut fe-r5b) — ürün ekleme/düzenleme yeniden tasarımı inceleme görüntüleri (iddia yok; yalnız `frontend/docs/fe-r5b-review/`).
// Çalıştırma: R5B_REVIEW=once|sonra npx playwright test -c playwright.cloud.config.ts fe-r5b-review --project=chromium-desktop
// R5B_REVIEW verilmezse atlanır (günlük koşuyu yavaşlatmaz). 1440 açık + koyu, 390 açık.
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { brandsDoluFixture, categoriesDoluFixture, choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixture, openScreen } from '../fixtures/nav'
import { galleryImages, r2cSingleProduct, r2cVariantProduct } from '../fixtures/productFormR2c'

const TAG = process.env.R5B_REVIEW
const OUT = `docs/fe-r5b-review/${TAG}`
const VIEWS: Array<{ w: number; h: number; theme: 'light' | 'dark' }> = [
  { w: 1440, h: 900, theme: 'light' },
  { w: 1440, h: 900, theme: 'dark' },
  { w: 390, h: 844, theme: 'light' },
  // R5B_TABLET=1: ara öz-eleştiri turunda tablet genişliği (rapora girmez)
  ...(process.env.R5B_TABLET ? [{ w: 800, h: 1024, theme: 'light' as const }] : []),
]

test.skip(!TAG, 'R5B_REVIEW=once|sonra ile çalıştırılır')
test.describe.configure({ retries: 1 })

const menu = [
  ...menuFixture,
  {
    group: 'r5bHiddenProductForms',
    links: [
      { code: 'ProductDefinitionView', parent: 'definitions', title: 'productDefinition', singleton: true },
      { code: 'ProductUpdateView', parent: '', title: 'productUpdate', singleton: false },
    ],
  },
]

async function prepare(page: Page, theme: 'light' | 'dark', product?: any) {
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript((t) => localStorage.setItem('ek-theme', t), theme)
  await installApiMocks(page, {
    MenuService: menu,
    ChoiceService: choicesDoluFixture,
    BrandService: brandsDoluFixture,
    CategoryService: categoriesDoluFixture,
    ...(product ? { 'ProductService/retrieveProduct': { product } } : {}),
    getImages: { images: product ? galleryImages : [] },
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
}

async function dismissTour(page: Page) {
  await page.getByRole('button', { name: 'Şimdi değil' }).click({ timeout: 2500 }).catch(() => undefined)
}

async function openUpdate(page: Page, theme: 'light' | 'dark', product: any) {
  await prepare(page, theme, product)
  await page.locator('.productListView tbody tr, .productListView .ek-grid-card').first().locator('button[aria-label="Ürünü düzenle"]').first().click()
  const root = page.locator(`.productUpdateView${product._id}`)
  await expect(root.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
  await dismissTour(page)
  return root
}

const shot = (page: Page, name: string, v: { w: number; theme: string }) =>
  page.screenshot({ path: `${OUT}/${name}-${v.w}-${v.theme}.png`, animations: 'disabled' })

/** Etkin sekmenin kaydırma kabını en üste alır, ardından görüntü. */
async function step(root: any, page: Page, label: RegExp) {
  await root.getByRole('button', { name: label }).first().click()
  await page.waitForTimeout(500)
}

for (const v of VIEWS) {
  test.describe(`r5b ${v.w} ${v.theme}`, () => {
    test.use({ viewport: { width: v.w, height: v.h } })

    test(`ekleme ${v.w} ${v.theme}`, async ({ page }) => {
      await prepare(page, v.theme)
      await page.getByRole('button', { name: 'Yeni ürün', exact: true }).first().click({ timeout: 10_000 }).catch(async () => {
        await openScreen(page, 'ProductDefinitionView')
      })
      const root = page.locator('.productDefinitionView')
      await expect(root.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 })
      await dismissTour(page)
      await page.waitForTimeout(500)
      await shot(page, 'ekle-1-kategori', v)
      // yaprak kategori seç → Ürün Tanımı
      await root.getByText('E2E Kategori Bir').first().click().catch(() => undefined)
      await page.waitForTimeout(400)
      await root.getByText('E2E Alt Kategori').first().click().catch(() => undefined)
      await page.waitForTimeout(400)
      await shot(page, 'ekle-1b-kategori-secili', v)
      await step(root, page, /Ürün Tanımı/)
      await shot(page, 'ekle-2-tanim', v)
      await root.getByRole('button', { name: /Eksikleri göster|Kayıt özeti/ }).first().click().catch(() => undefined)
      await page.waitForTimeout(300)
      await shot(page, 'ekle-eksikler', v)
    })

    test(`duzenleme tekil ${v.w} ${v.theme}`, async ({ page }) => {
      const root = await openUpdate(page, v.theme, r2cSingleProduct)
      await page.waitForTimeout(400)
      await shot(page, 'duzenle-1-kategori', v)
      await step(root, page, /Ürün Tanımı/)
      await shot(page, 'duzenle-2-tanim', v)
      await step(root, page, /Tekil Ürün Bilgisi/)
      await shot(page, 'duzenle-3-tekil', v)
      // uzun adımda aşağı kaydırma: kayıt çubuğu (varsa yapışkan) görünür kalır
      await root.evaluate((el: HTMLElement) => {
        let n: HTMLElement | null = el
        while (n && !(n.scrollHeight > n.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowY))) n = n.parentElement
        n?.scrollBy(0, 420)
      })
      await page.waitForTimeout(300)
      await shot(page, 'duzenle-3-tekil-kaydirilmis', v)
      await step(root, page, /Detay Bilgiler/)
      await shot(page, 'duzenle-4-detay', v)
      await root.getByRole('button', { name: /Eksikleri göster|Kayıt özeti/ }).first().click().catch(() => undefined)
      await page.waitForTimeout(300)
      await shot(page, 'duzenle-ozet', v)
    })

    test(`varyantli ${v.w} ${v.theme}`, async ({ page }) => {
      const root = await openUpdate(page, v.theme, r2cVariantProduct)
      await step(root, page, /Ürün Tanımı/)
      await shot(page, 'varyant-2-tanim', v)
      await step(root, page, /Varyant Bilgileri/)
      await expect(root.getByText('SK-R2C-SIYAH-S').first()).toBeVisible()
      await page.waitForTimeout(400)
      await shot(page, 'varyant-3-izgara', v)
      // geniş kapta ray daraltılabilir: ızgara tüm genişliği alır (dar kapta düğme yok)
      const collapse = root.getByRole('button', { name: 'Ürün panelini daralt' })
      if (await collapse.isVisible()) {
        await collapse.click()
        await page.waitForTimeout(400)
        await shot(page, 'varyant-3-izgara-ray-daraltilmis', v)
      }
    })
  })
}
