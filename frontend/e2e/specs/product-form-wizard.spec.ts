// DS-v2 A6a — ürün sihirbazı şeridi (ProductFormWizardBar / ProductFormStepFooter):
//  · kilitli adımlar odaklanabilir + nedenli, Kaydet'in neden kapalı olduğu cümlesi (aria-describedby)
//  · "Eksikleri göster" paneli: maddeye tıklayınca ilgili adıma gider ve alana odaklanır
//  · 390px: dört adım da görünüm alanında, Kaydet erişilebilir
//  · axe: şerit + panel
// Kaydetme GÖVDESİ değişmedi — burada yalnızca yeni etkileşimin ürettiği gövde doğrulanır.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { brandsDoluFixture, categoriesDoluFixture, choicesDoluFixture } from '../fixtures/apiData'
import { gotoAuthed, menuFixture, openScreen } from '../fixtures/nav'

const menu = [
  ...menuFixture,
  {
    group: 'a6aHiddenProductForm',
    links: [{ code: 'ProductDefinitionView', parent: 'definitions', title: 'productDefinition', singleton: true }],
  },
]

async function openAdd(page: Page, captured?: { body: any }) {
  await installApiMocks(page, {
    MenuService: menu,
    CategoryService: categoriesDoluFixture,
    BrandService: brandsDoluFixture,
    ChoiceService: choicesDoluFixture,
    getImages: { images: [] },
    'ProductService/saveProduct': async (route: any, headers: Record<string, string>) => {
      if (captured) captured.body = route.request().postDataJSON()
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(true) })
    },
  })
  await gotoAuthed(page)
  await openScreen(page, 'ProductListView')
  await page.getByRole('button', { name: 'Yeni ürün', exact: true }).click()
  const root = page.locator('.productDefinitionView')
  await expect(root.locator('.pfw')).toBeVisible({ timeout: 20_000 })
  return root
}

async function pickCategory(root: ReturnType<Page['locator']>) {
  await root.getByText('E2E Kategori Bir').first().click()
  await root.getByText('E2E Alt Kategori').first().click()
}

test.describe('A6a — ürün sihirbazı şeridi', () => {
  test('boş form: kilitli adımlar nedenle açıklanır, Kaydet kapalı ve nedeni yazılıdır', async ({ page }) => {
    const root = await openAdd(page)
    const steps = root.locator('.pfw-step')
    await expect(steps).toHaveCount(4)
    await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step')
    // Kilitli adım odaklanabilir (aria-disabled) ve nedeni aria-describedby ile okunur.
    await expect(steps.nth(1)).toHaveAttribute('aria-disabled', 'true')
    await expect(steps.nth(1)).toContainText('Kilitli')
    await expect(steps.nth(1)).toHaveAccessibleDescription(/Önce bir kategori seçin/)
    // Kaydet kapalı + nedeni düğmeye bağlı.
    const save = root.getByRole('button', { name: 'Kaydet' })
    await expect(save).toBeDisabled()
    await expect(save).toHaveAccessibleDescription(/5 zorunlu bilgi eksik/)
    await expect(root.getByText('0 / 5')).toBeVisible()
    // Kilitli adıma tıklamak adımı değiştirmez.
    await steps.nth(1).click({ force: true })
    await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step')
  })

  test('eksikler paneli: maddeye tıklayınca ilgili adıma gider ve alana odaklanır; tamamlanınca Kaydet gövdesi', async ({ page }) => {
    const captured: { body: any } = { body: null }
    const root = await openAdd(page, captured)
    await pickCategory(root)
    await expect(root.locator('.pfw-step').nth(1)).not.toHaveAttribute('aria-disabled', 'true')

    await root.locator('.pfw-step').nth(1).click()
    await root.getByLabel(/Ürün Başlığı/).first().fill('Organik pamuklu basic tişört')
    // Marka bileşeni ilk markayı kendisi seçer (gizli varsayılan) -> geriye stok kodu + barkod kalır.
    await expect(root.getByText('2 zorunlu bilgi eksik')).toBeVisible()

    await root.getByRole('button', { name: 'Eksikleri göster' }).click()
    const panel = root.getByRole('region', { name: 'Kayıt öncesi kontrol' })
    await expect(panel.getByRole('button', { name: /Stok kodunu girin/ })).toBeVisible()
    await expect(panel.getByText('Kayıt özeti')).toBeVisible()
    await panel.getByRole('button', { name: /Barkodu girin/ }).click()

    // 3. adıma geçti ve barkod alanı odakta.
    await expect(root.locator('.pfw-step').nth(2)).toHaveAttribute('aria-current', 'step')
    await expect(root.getByLabel(/Barkod/).first()).toBeFocused()

    await root.getByLabel(/Barkod/).first().fill('8690000000555')
    await root.getByLabel(/Stok Kodu/).first().fill('SK-A6A-555')
    await expect(root.getByText('Kaydet için hazır')).toBeVisible()
    await expect(root.getByText('5 / 5')).toBeVisible()

    const save = root.getByRole('button', { name: 'Kaydet' })
    await expect(save).toBeEnabled()
    await save.click()
    await expect.poll(() => captured.body).not.toBeNull()
    const info = captured.body.productInfo
    expect(info.title).toBe('Organik pamuklu basic tişört')
    expect(info.variants[0].stockcode).toBe('SK-A6A-555')
    expect(info.variants[0].barcode).toBe('8690000000555')
    expect('images' in info).toBe(false)
  })

  test('geri/devam altbilgisi: sonraki adım kilitliyse Devam kapalı ve nedeni yazılı', async ({ page }) => {
    const root = await openAdd(page)
    const next = root.getByRole('button', { name: 'Devam' })
    await expect(next).toBeDisabled()
    await expect(next).toHaveAccessibleDescription(/kategori seçin/)
    await pickCategory(root)
    await expect(next).toBeEnabled()
    await next.click()
    await expect(root.locator('.pfw-step').nth(1)).toHaveAttribute('aria-current', 'step')
    await expect(root.getByRole('button', { name: 'Geri' })).toBeVisible()
  })

  test('axe: şerit ve eksikler paneli WCAG 2.1 AA ihlali içermez', async ({ page }) => {
    const root = await openAdd(page)
    await root.getByRole('button', { name: 'Eksikleri göster' }).click()
    await expect(root.getByRole('region', { name: 'Kayıt öncesi kontrol' })).toBeVisible()
    await page.waitForTimeout(400)
    const results = await new AxeBuilder({ page }).include('.productDefinitionView .pfw').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
})

test.describe('A6a — ürün sihirbazı 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('dört adım da görünüm alanında (kırpılma yok) ve Kaydet erişilebilir', async ({ page }) => {
    const root = await openAdd(page)
    const steps = root.locator('.pfw-step')
    await expect(steps).toHaveCount(4)
    for (let i = 0; i < 4; i += 1) {
      const box = await steps.nth(i).boundingBox()
      expect(box, `adım ${i + 1} kutusu`).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(390)
    }
    // Adım başlıkları taşmadan kutu içinde (metin kutudan geniş değil).
    const overflow = await steps.evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth + 1).length)
    expect(overflow).toBe(0)
    const save = root.getByRole('button', { name: 'Kaydet' })
    await save.scrollIntoViewIfNeeded()
    const sb = await save.boundingBox()
    expect(sb!.x + sb!.width).toBeLessThanOrEqual(390)
  })
})
