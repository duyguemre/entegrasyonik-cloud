// ADR-0015 B5-2 — CategoryListView (karakterizasyon, Protokol 13) — Kategoriler ekranı PREMIUM yeniden tasarımı sonrası.
// Ekran artık `components/categories/CategoryManager.vue`: EkPageBar + araç şeridi + ARIA ağaç (sol) | detay paneli (sağ).
// Testlerin NİYETİ aynı kalır: iki bölge açılır, arama güvenli temizlenir, boş durum bozulmaz, görsel taban, axe.
// Yeni: yapılan iş (istek gövdeleri) karakterize edilir — kategori ekleme, kanal eşleme, silme.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { categoriesDoluFixture } from '../fixtures/apiData'
import { menuFixture, gotoAuthed, openDrawer, expectScreenOpen } from '../fixtures/nav'
import type { Page } from '@playwright/test'

// Yalnızca bu spec'e özel menü uzantısı (bkz. brand-definitions.spec.ts başındaki AYNI gerekçe) —
// `e2e/fixtures/nav.ts` DEĞİŞMEDİ.
const menuFixtureWithCategory = menuFixture.map((group: any) =>
  group.group === 'sale'
    ? {
        ...group,
        links: group.links.map((link: any) =>
          link.code === 'productDefinitions'
            ? { ...link, children: [...link.children, { code: 'CategoryListView', parent: 'productDefinitions', title: 'categoryList', icon: 'mdi-shape-outline', singleton: true }] }
            : link,
        ),
      }
    : group,
)

// Gerçek yanıt biçimi: [anaKategori(isMain), ...üstDüzeyKategoriler(iç içe children)].
const leaf = (id: string, title: string) => ({ _id: id, title, children: [] })
const categoryTree = [
  { _id: 'main', title: 'Ana Kategori', isMain: true },
  { _id: 'c-giyim', title: 'Giyim', children: [{ _id: 'c-kadin', title: 'Kadın', children: [leaf('c-elbise', 'Elbise'), leaf('c-bluz', 'Bluz')] }] },
  leaf('c-spor', 'Spor ve Outdoor'),
]
// Kategori eşlemesi (platformAttributeId: null): Elbise yalnız Trendyol'da eşli.
const mappingDocs = [{ localCategoryId: 'c-elbise', integrationCode: 'trendyol', platformCategoryId: '411', platformAttributeId: null, isCategoryMapping: true }]
const L = (id: number, title: string) => ({ _id: id, title, children: [] })
const channelCategories = [{ _id: 400, title: 'Giyim', children: [{ _id: 401, title: 'Kadın', children: [L(411, 'Elbise'), L(412, 'Bluz')] }] }]

function mocks(extra: Record<string, any> = {}, categories: any = categoryTree) {
  return {
    MenuService: menuFixtureWithCategory,
    CategoryService: categories,
    AttributeMappingService: mappingDocs,
    'IntegrationService/retrieveCategoriesFromIntegration': channelCategories,
    'IntegrationService/retrieveCategoryAttributesFromIntegration': [],
    ...extra,
  }
}

async function openCategoryListView(page: Page) {
  await openDrawer(page)
  const drawer = page.locator('.v-navigation-drawer.soft-nav')
  const group = drawer.locator('.v-list-group').filter({ has: page.locator('.v-list-group__header .mdi-tag-outline') })
  const groupItem = group.locator('.v-list-group__header')
  const subItem = group.locator('.sub-item-soft').nth(1)
  if (!(await subItem.isVisible().catch(() => false))) {
    await groupItem.click()
    await expect(subItem).toBeVisible()
  }
  await subItem.click()
  await page.waitForTimeout(200)
}

const treeItem = (page: Page, name: string) => page.getByRole('treeitem', { name, exact: true })

test.describe('P3 (B5-2) — Kategoriler (CategoryListView)', () => {
  test('smoke: ağaç (sol) ve detay yer tutucusu (sağ) render olur, arama + yeni kategori düğmesi görünür', async ({ page }) => {
    await installApiMocks(page, mocks())
    await gotoAuthed(page)
    await openCategoryListView(page)

    await expectScreenOpen(page, '.categoryListView')
    await expect(page.getByRole('heading', { level: 1, name: 'Kategoriler' })).toBeVisible()
    await expect(page.getByRole('tree', { name: 'Kategori ağacı' })).toBeVisible()
    await expect(treeItem(page, 'Giyim')).toBeVisible()
    await expect(page.getByLabel('Kategori ara').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Yeni kategori' })).toBeVisible()
    // Seçim yokken detay bölgesi yönlendirir (eski "Eşitleme için önce Kategori seçmelisiniz" karşılığı).
    await expect(page.getByRole('heading', { name: 'Bir kategori seçin' })).toBeVisible()
  })

  // fe-b7 davranışı: arama alanının KENDİ temizle simgesi modeli `null` yapar — ağaç süzgeci çökmeden sıfırlanır.
  test('arama alanının temizle simgesi (model null) güvenli: ağaç sıfırlanır, sayfa hatası yok', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await installApiMocks(page, mocks())
    await gotoAuthed(page)
    await openCategoryListView(page)
    const field = page.locator('.cat-manager__search-field:visible').first()
    const input = field.locator('input')
    await input.fill('zzzz-yok')
    await expect(page.getByText('Kategori bulunamadı')).toBeVisible()
    await field.locator('.v-field__clearable .v-icon').click()
    await expect(input).toHaveValue('')
    await expect(treeItem(page, 'Giyim')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('arama: eşleşen kategori üst dallarıyla birlikte görünür, diğerleri gizlenir', async ({ page }) => {
    await installApiMocks(page, mocks())
    await gotoAuthed(page)
    await openCategoryListView(page)
    await page.locator('.cat-manager__search-field input').first().fill('elbi')
    await expect(treeItem(page, 'Elbise')).toBeVisible()
    await expect(treeItem(page, 'Kadın')).toBeVisible()
    await expect(treeItem(page, 'Spor ve Outdoor')).toHaveCount(0)
  })

  test('boş durum: kategori yoksa "İlk kategorini ekle" gösterilir (ham hata sızmaz)', async ({ page }) => {
    await installApiMocks(page, mocks({}, [{ _id: 'main', title: 'Ana Kategori', isMain: true }]))
    await gotoAuthed(page)
    await openCategoryListView(page)

    await expectScreenOpen(page, '.categoryListView')
    await expect(page.getByText('Henüz kategori yok')).toBeVisible()
    await expect(page.getByRole('button', { name: 'İlk kategorini ekle' })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('hata durumu: liste alınamazsa insan-okunur ileti + Tekrar dene (ham hata yok)', async ({ page }) => {
    await installApiMocks(page, mocks({ CategoryService: { __mockError: true, status: 500, body: { message: 'ham-sunucu-hatasi' } } }))
    await gotoAuthed(page)
    await openCategoryListView(page)
    await expect(page.getByText('Kategoriler yüklenemedi')).toBeVisible()
    await expect(page.getByRole('button', { name: /Tekrar dene/ })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('ham-sunucu-hatasi')
  })

  test('yeni kategori: ağaçta yerinde satır; Enter istek gövdesi { parentCategoryId, title } (eski gövde)', async ({ page }) => {
    await installApiMocks(page, mocks({ 'CategoryService/addCategory': { _id: 'c-yeni' } }))
    await gotoAuthed(page)
    await openCategoryListView(page)
    await page.getByRole('button', { name: 'Yeni kategori' }).click()
    const input = page.getByRole('textbox', { name: 'Yeni kategori adı' })
    await expect(input).toBeFocused()
    const req = page.waitForRequest((r) => r.url().includes('CategoryService/addCategory') && r.method() === 'POST')
    await input.fill('Yeni Kategori')
    await input.press('Enter')
    expect((await req).postDataJSON()).toEqual({ parentCategoryId: 'main', title: 'Yeni Kategori' })
  })

  test('klavye: ↓ ile satırlar arası gezinir, → dalı açar, Enter seçer ve detayı açar', async ({ page }) => {
    await installApiMocks(page, mocks())
    await gotoAuthed(page)
    await openCategoryListView(page)
    await treeItem(page, 'Giyim').focus()
    await page.keyboard.press('ArrowDown')
    await expect(treeItem(page, 'Kadın')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(treeItem(page, 'Elbise')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('region', { name: 'Kategori ayrıntısı' }).getByRole('heading', { name: 'Elbise' })).toBeVisible()
  })

  test('kanal eşleme: uç kategori seçilir → bağlı kanallar listelenir; Eşle → öneri → Kaydet istek gövdesi (eski gövde)', async ({ page }) => {
    await installApiMocks(page, mocks({ 'AttributeMappingService/saveCategoryMapping': { result: true } }))
    await gotoAuthed(page)
    await openCategoryListView(page)
    await treeItem(page, 'Kadın').click()
    await treeItem(page, 'Bluz').click()
    const detail = page.getByRole('region', { name: 'Kategori ayrıntısı' })
    await expect(detail.getByRole('heading', { name: 'Kanal eşlemeleri' })).toBeVisible()
    const trendyol = detail.locator('[data-channel="trendyol"]')
    await expect(trendyol.getByText('Eşlenmedi')).toBeVisible()
    await trendyol.getByRole('button', { name: 'Eşle' }).click()
    // Arama yerel adla ("Bluz") önden dolu; sonuç tam yoluyla gelir.
    await expect(trendyol.getByRole('combobox')).toHaveValue('Bluz')
    await trendyol.getByRole('option', { name: /Giyim.*Kadın.*Bluz/ }).click()
    const req = page.waitForRequest((r) => r.url().includes('AttributeMappingService/saveCategoryMapping') && r.method() === 'POST')
    await trendyol.getByRole('button', { name: 'Kaydet' }).click()
    expect((await req).postDataJSON()).toEqual({ localCategoryId: 'c-bluz', integrationCode: 'trendyol', platformCategoryId: 412 })
  })

  test('eşli kategori: kanaldaki tam yol görünür, "Değiştir" sunulur', async ({ page }) => {
    await installApiMocks(page, mocks())
    await gotoAuthed(page)
    await openCategoryListView(page)
    await treeItem(page, 'Kadın').click()
    await treeItem(page, 'Elbise').click()
    const trendyol = page.getByRole('region', { name: 'Kategori ayrıntısı' }).locator('[data-channel="trendyol"]')
    await expect(trendyol.getByText('Giyim › Kadın › Elbise')).toBeVisible()
    await expect(trendyol.getByRole('button', { name: 'Değiştir' })).toBeVisible()
  })

  test('silme onaylıdır; onayda deleteCategory { _id } gönderilir (eski gövde)', async ({ page }) => {
    await installApiMocks(page, mocks({ 'CategoryService/deleteCategory': { acknowledged: true }, 'AttributeMappingService/deleteFullMapping': { acknowledged: true } }))
    await gotoAuthed(page)
    await openCategoryListView(page)
    await treeItem(page, 'Spor ve Outdoor').click()
    await page.getByRole('button', { name: 'Spor ve Outdoor işlemleri' }).click()
    await page.getByRole('menuitem', { name: 'Kategoriyi sil' }).click()
    await expect(page.getByText("'Spor ve Outdoor' kategorisi silinsin mi?")).toBeVisible()
    const req = page.waitForRequest((r) => r.url().includes('CategoryService/deleteCategory') && r.method() === 'POST')
    await page.getByRole('button', { name: 'Sil', exact: true }).click()
    expect((await req).postDataJSON()).toEqual({ _id: 'c-spor' })
  })

  test('ekran görüntüsü tabanı (kategori tanımları)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithCategory, CategoryService: categoriesDoluFixture })
    await gotoAuthed(page)
    await openCategoryListView(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('category-definitions.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması (ekranın KENDİ hiyerarşisi)', async ({ page }, testInfo) => {
    await installApiMocks(page, mocks())
    await gotoAuthed(page)
    await openCategoryListView(page)
    await expect(treeItem(page, 'Giyim')).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.categoryListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-CategoryListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] CategoryListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})
