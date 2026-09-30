// DS-v2 A7 — TÜM sayfalarda tek breadcrumb (EkPageBar): kök (bölüm) / üst ekranlar / SON = H1 (aria-current=page).
// Uzun yol '…' menüsüne katlanır (kısaltılmış anlamsız ara öğe yok); dar kapta [← ebeveyn] üstte, başlık altta;
// kayıt detayında kayıt kimliği kopyalanır. Veri sentetik.
import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed, menuFixtureWithIntegrationConfig, openScreen } from '../fixtures/nav'
import { buildProduct, brandsDoluFixture, categoriesDoluFixture, choicesDoluFixture, userContextFixture } from '../fixtures/apiData'

const LIST_FIXTURE = [
  { target: '_engine', displayName: 'Motor ayarları', category: 'engine', publishedVersion: 4, intake: 'on', hasDraft: false },
  { target: 'trendyol', displayName: 'Trendyol', category: 'marketplace', adapterVersion: '2.3.0', publishedVersion: 2, intake: 'on', hasDraft: false },
]
const AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

async function openEffectiveConfig(page: Page) {
  await installApiMocks(page, {
    MenuService: menuFixtureWithIntegrationConfig,
    userContext: { ...userContextFixture, isGlobalAdmin: true },
    'IntegrationConfigService/list': LIST_FIXTURE,
    'IntegrationConfigService/getEffectiveConfig': { target: 'trendyol', publishedVersion: 2, catalogVersion: '2026-09-29.b1', values: [] },
  })
  await gotoAuthed(page)
  await openScreen(page, 'IntegrationConfigListView')
  await page.locator('.integrationConfigListView').getByRole('button', { name: 'Trendyol detayını aç' }).first().click()
  const dialog = page.getByRole('dialog').filter({ hasText: 'Trendyol' })
  await dialog.getByRole('button', { name: 'Etkin yapılandırmayı gör' }).click()
  const view = page.locator('.effectiveConfigView:not(.hide-tab-component)')
  await expect(view.getByRole('heading', { level: 1, name: 'Etkin yapılandırma' })).toBeVisible()
  return view
}

test.describe('A7 — breadcrumb', () => {
  test('liste: nav "Sayfa konumu" → kök bölüm + H1 aria-current=page; ayraç okunmaz; axe 0', async ({ page }) => {
    await installApiMocks(page)
    await gotoAuthed(page)
    await openScreen(page, 'OrderListView')
    const nav = page.locator('.workplace-area .orderListView').getByRole('navigation', { name: 'Sayfa konumu' })
    await expect(nav.getByRole('listitem').first()).toContainText('Satış')
    const h1 = nav.getByRole('heading', { level: 1, name: 'Siparişler' })
    await expect(h1).toHaveAttribute('aria-current', 'page')
    await expect(nav.locator('.ek-crumbs__sep').first()).toHaveAttribute('aria-hidden', 'true')
    const axe = await new AxeBuilder({ page }).withTags(AA).include('.workplace-area .orderListView .ek-page-bar').analyze()
    expect(axe.violations).toEqual([])
  })

  test('derin rota: üst ekranlar bağlantı (satırda ya da "…" menüsünde) ve ilgili sekmeyi açar; kayıt kimliği', async ({ page }, info) => {
    test.skip(info.project.name === 'chromium-mobile', 'dar kap ayrı testte')
    const view = await openEffectiveConfig(page)
    const nav = view.getByRole('navigation', { name: 'Sayfa konumu' })
    await expect(nav).toContainText('Yönetim')
    await expect(view.locator('.ek-record-id')).toContainText('trendyol')
    // Yol sığıyorsa bağlantı satırdadır; sığmıyorsa '…' menüsündedir — ikisinde de aynı hedef.
    const inline = nav.getByRole('button', { name: 'Entegrasyonlar', exact: true })
    if (await inline.isVisible()) {
      await inline.click()
    } else {
      await nav.getByRole('button', { name: /üst sayfa daha/ }).click()
      await page.getByRole('menuitem', { name: 'Entegrasyonlar' }).click()
    }
    await expect(page.locator('.integrationConfigListView:not(.hide-tab-component)').getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('dar kap: "← ebeveyn" üstte, başlık altta ve görünür; geri oku ebeveyn ekranı açar', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium-mobile', 'yalnız dar görünüm')
    const view = await openEffectiveConfig(page)
    const back = view.getByRole('button', { name: 'Geri: Trendyol ayarları' })
    await expect(back).toBeVisible()
    const h1 = view.getByRole('heading', { level: 1 })
    const [b, h] = [await back.boundingBox(), await h1.boundingBox()]
    expect(h!.width).toBeGreaterThan(80)
    expect(h!.y).toBeGreaterThan(b!.y + b!.height - 2)
    await expect(view.getByRole('button', { name: /üst sayfa daha/ })).toHaveCount(0)
    await back.click()
    await expect(page.locator('.integrationSettingsView:not(.hide-tab-component)').getByRole('heading', { level: 1, name: 'Trendyol' })).toBeVisible()
  })

  test('kayıt detayı: stok kodu başlığın yanında, kopyala panoya yazar ve bildirir', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'chromium-desktop', 'bir görünüm yeter')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const product = buildProduct({ _id: 'product-a7', hasVariant: false, variants: [{ tempId: 'v-a7', stockcode: 'SK-A7-001', barcode: '8690000000777', choices: [], prices: { salePrice: 10, marketPrice: 12, isPlatformBasedPrice: false }, stock: 1, images: [], platforms: {} }] })
    await installApiMocks(page, {
      MenuService: [...menuFixtureWithIntegrationConfig, { group: 'a7Hidden', links: [{ code: 'ProductUpdateView', parent: '', title: 'productUpdate', singleton: false }] }],
      CategoryService: categoriesDoluFixture, BrandService: brandsDoluFixture, ChoiceService: choicesDoluFixture,
      'ProductService/retrieveProduct': { product }, getImages: { images: [] },
    })
    await gotoAuthed(page)
    await openScreen(page, 'ProductListView')
    await page.locator('.productListView tbody tr').first().locator('button[aria-label="Ürünü düzenle"]').click()
    const root = page.locator(`.productUpdateView${product._id}`)
    const nav = root.getByRole('navigation', { name: 'Sayfa konumu' })
    await expect(nav.getByRole('button', { name: 'Ürünler', exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(root.locator('.ek-record-id')).toContainText('SK-A7-001')
    await root.getByRole('button', { name: 'Stok kodu kopyala: SK-A7-001' }).click()
    await expect(page.getByText('SK-A7-001 panoya kopyalandı.')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('SK-A7-001')
  })
})
