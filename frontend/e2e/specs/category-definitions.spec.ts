// ADR-0015 B5-2 — CategoryListView (karakterizasyon, Protokol 13). `CategoryListView.vue`
// (BrandListView ile AYNI desen) neredeyse tüm görünür içeriği kapsam DIŞI kök bileşenlere
// devrediyor (`CategoryListComponent.vue`, `CategorySyncComponent.vue` —
// `components/productDefinitions/` DIŞINDA, bu görevde DOKUNULMADI).
//
// GİZLİ DAVRANIŞ (araştırma bulgusu, düzeltilmedi — BACKLOG.md'ye eklendi): `CategoryListComponent.vue`
// içindeki GERÇEK kategori ağacı render'ı (`<CategoryTreeComponentVue>` + `<v-data-table>`) kaynak
// kodda TAMAMEN YORUM SATIRI içinde (dead/yarım kalmış kod) — bugün DOM'da hiçbir kategori öğesi
// GÖRÜNMÜYOR, `CategoryService` DOLU veri dönse de. Yalnızca arama kutusu + "Alt Kategori İsmi"
// (kök kategori ekleme) formu aktif. Bu yüzden bu spec "E2E Kategori Bir" gibi bir ağaç öğesinin
// görünürlüğünü DEĞİL, mevcut (aktif) yüzeyi doğrular.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks, mockError, type MockValue } from '../fixtures/mockApi'
import { categoriesDoluFixture, choicesDoluFixture } from '../fixtures/apiData'
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

async function openCategoryListView(page: Page) {
  await openDrawer(page)
  const drawer = page.locator('.v-navigation-drawer.soft-nav')
  const group = drawer.locator('.v-list-group').filter({ has: page.locator('.v-list-group__header .mdi-tag-outline') })
  const groupItem = group.locator('.v-list-group__header')
  const subItem = group.locator('.sub-item-soft').nth(1)
  if (!(await subItem.isVisible().catch(() => false))) {
    await groupItem.click()
    await expect(subItem).toBeVisible()
    // Aşama 3 (birleşik kabuk): grup açılış geçişi bitmeden tıklanan 2.+ alt öğe mobil çekmecede kaçabiliyor.
    await page.waitForTimeout(300)
  }
  await subItem.click()
  await page.waitForTimeout(200)
}

test.describe('P3 (B5-2) — Kategoriler (CategoryListView)', () => {
  // B7 (cloud/fe-b7) — BİLİNÇLİ güncelleme: sayfa yeniden tasarlandı (başlık satırı + ağaç | detay). Eski yüzey metinleri
  // ("Kategori Listesi" kartı, "Alt Kategori İsmi" kök ekleme alanı, "Eşitleme için önce…" boş paneli) yerine: ağaç bölmesi
  // başlığı, başlık satırındaki "Kategori ekle" birincil eylemi ve seçim yokken "Kategori özeti". İddia aynı: iki bölme
  // render olur, kök ekleme yolu görünür, seçim yokken yönlendirme var. (Karakterizasyondaki "ağaç DOM'da görünmüyor"
  // bulgusu artık geçerli değil: ağaç öğeleri görünür.)
  test('smoke: iki bölme (ağaç | detay) render olur, kök kategori ekleme yolu görünür', async ({ page }, testInfo) => {
    await installApiMocks(page, { MenuService: menuFixtureWithCategory, CategoryService: categoriesDoluFixture })
    await gotoAuthed(page)
    await openCategoryListView(page)

    await expectScreenOpen(page, '.categoryListView')
    await expect(page.getByRole('heading', { name: 'Kategori ağacı' })).toBeVisible()
    await expect(page.getByRole('treeitem', { name: /^E2E Kategori Bir/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Kategori ekle' })).toBeVisible()
    if (testInfo.project.name === 'chromium-desktop') {
      await expect(page.getByRole('heading', { name: 'Kategori özeti' })).toBeVisible()
    } else {
      // Dar kap (< 920px): tek bölme — seçim yokken ağaç, yaprak seçilince detay + "← Tüm kategoriler".
      await expect(page.getByRole('heading', { name: 'Kategori özeti' })).toBeHidden()
      await page.getByRole('treeitem', { name: /^E2E Kategori Bir/ }).click()
      await page.getByRole('treeitem', { name: /^E2E Alt Kategori/ }).click()
      await expect(page.getByRole('heading', { name: 'E2E Alt Kategori' })).toBeVisible()
      await page.getByRole('button', { name: 'Tüm kategoriler' }).click()
      await expect(page.getByRole('treeitem', { name: /^E2E Alt Kategori/ })).toBeFocused()
    }
  })

  test('boş durum: kategori yoksa ilk kategori yönlendirmesi açılır (ham hata sızmaz)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithCategory, CategoryService: [] })
    await gotoAuthed(page)
    await openCategoryListView(page)

    await expectScreenOpen(page, '.categoryListView')
    await expect(page.getByText('Henüz kategori yok')).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('ekran görüntüsü tabanı (kategori tanımları)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithCategory, CategoryService: categoriesDoluFixture })
    await gotoAuthed(page)
    await openCategoryListView(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('category-definitions.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması (ekranın KENDİ hiyerarşisi; kapsam dışı kök bileşenlerin ihlalleri BACKLOG.md)', async ({ page }, testInfo) => {
    await installApiMocks(page, { MenuService: menuFixtureWithCategory, CategoryService: categoriesDoluFixture })
    await gotoAuthed(page)
    await openCategoryListView(page)
    await expect(page.getByRole('heading', { name: 'Kategori ağacı' })).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.categoryListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-CategoryListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] CategoryListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})

// A6a — kategori / özellik eşleme: pazaryeri API'sinden yanıt alınamadığında anlaşılır durum
// (NE OLDU + OLASI NEDEN + NE YAPMALI + Tekrar dene + Entegrasyon ayarına git + katlanır teknik ayrıntı).
// Boş liste hata DEĞİLDİR (ayrı boş durum). Sınıflandırma: composables/useIntegrationError.ts.
const mappingLocalTree = [
  { _id: 'cat-root', title: 'Kategoriler', isMain: true, children: [] },
  { _id: 'cat-tisort', title: 'Tişört', level: 0, children: [], choiceIds: [], platforms: [] },
]
const mappingPlatformCategories = [
  { _id: 1001, title: 'Tişört', parentId: 0, children: [] },
  { _id: 1002, title: 'Gömlek', parentId: 0, children: [] },
]
const mappingPlatformAttributes = [
  { _id: 'attr-renk', title: 'Renk', required: true, allowCustom: false, varianter: true, slicer: false },
]

async function openMappingPanel(page: Page, overrides: Record<string, MockValue> = {}) {
  await page.clock.setFixedTime(new Date('2026-09-30T09:30:00'))
  await installApiMocks(page, {
    MenuService: menuFixtureWithCategory,
    CategoryService: mappingLocalTree,
    ChoiceService: choicesDoluFixture,
    'AttributeMappingService/getCategoryMapping': { platformCategoryId: 1001 },
    'AttributeMappingService': [],
    'AttributeMappingService/getAttributeMapping': {},
    'IntegrationService/retrieveCategoriesFromIntegration': mappingPlatformCategories,
    'IntegrationService/retrieveCommisionForCategoryFromIntegration': { commission: 12 },
    'IntegrationService/retrieveCategoryAttributesFromIntegration': mappingPlatformAttributes,
    'IntegrationService/retrieveCategoryAttributeValuesFromIntegration': [{ id: 1, title: 'Kırmızı' }],
    ...overrides,
  })
  await gotoAuthed(page)
  await openCategoryListView(page)
  // B7: seçim ⚙ "… ayarları" düğmesinden ağaç satırının kendisine taşındı (bilinçli; panel ve iddialar aynı).
  await page.getByRole('treeitem', { name: /^Tişört/ }).click()
  await page.locator('.categorySyncComponent .ek-platform-choice').first().click()
}

const errorPanel = (page: Page) => page.getByTestId('integration-error-panel')
const axeViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .include('[data-testid="integration-error-panel"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)
}

test.describe('A6a — kategori/özellik eşleme hata durumları', () => {
  test('kategori ağacı 500: neden + ne yapmalı + Tekrar dene; ham hata/HTTP kodu gövdede değil, teknik ayrıntı katlanır', async ({ page }) => {
    await openMappingPanel(page, {
      'IntegrationService/retrieveCategoriesFromIntegration': mockError(500, { error: 'Beklenmeyen bir hata oluştu.', code: 'INTERNAL', requestId: 'req-e2e-1' }),
    })
    const panel = errorPanel(page)
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('data-kind', 'server')
    await expect(panel.getByRole('heading', { name: 'Trendyol kategori listesi şu an alınamadı' })).toBeVisible()
    await expect(panel.getByText('Olası neden')).toBeVisible()
    await expect(panel.getByText('Ne yapmalı')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Tekrar dene' })).toBeVisible()
    // Teknik ayrıntı varsayılan KAPALI; açılınca servis/HTTP/zaman görünür, gövde metninde ham kod yok.
    const details = panel.locator('details')
    await expect(details).not.toHaveAttribute('open', '')
    // Aşama 6b (Standart 1): panel görünümü ds EkProblemState'e taşındı — seçici bilinçli güncellendi, iddia aynı.
    await expect(panel.locator('.ek-problem__body > .ek-problem__line').first()).not.toContainText('500')
    await panel.locator('summary').click()
    await expect(details).toContainText('IntegrationService/retrieveCategoriesFromIntegration')
    await expect(details).toContainText('500')
    await expect(details).toContainText('trendyol')
    await expect(details).toContainText('INTERNAL')
    await expect(details).toContainText('req-e2e-1')
    await expect(details).toContainText('2026-09-30T')
    // Yalnız güvenli alanlar: istek gövdesi sızmaz.
    await expect(details).not.toContainText('integrationCategoryId')
  })

  test('kategori ağacı 403 → yetki durumu; tekrar dene önerilmez', async ({ page }) => {
    await openMappingPanel(page, { 'IntegrationService/retrieveCategoriesFromIntegration': mockError(403, { error: 'Bu işlem için yetkiniz yok.' }) })
    const panel = errorPanel(page)
    await expect(panel).toHaveAttribute('data-kind', 'auth')
    await expect(panel.getByRole('heading', { name: 'Bu işlem için erişim izniniz yok' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Tekrar dene' })).toHaveCount(0)
  })

  test('kategori ağacı 504 → zaman aşımı', async ({ page }) => {
    await openMappingPanel(page, { 'IntegrationService/retrieveCategoriesFromIntegration': mockError(504, { error: 'Gateway Timeout' }) })
    await expect(errorPanel(page)).toHaveAttribute('data-kind', 'timeout')
    await expect(errorPanel(page).getByRole('heading', { name: 'Trendyol yanıt vermedi' })).toBeVisible()
  })

  test('ağ hatası → network; "Entegrasyon ayarına git" gösterilmez', async ({ page }) => {
    await openMappingPanel(page, { 'IntegrationService/retrieveCategoriesFromIntegration': (route) => route.abort('failed') })
    const panel = errorPanel(page)
    await expect(panel).toHaveAttribute('data-kind', 'network')
    await expect(panel.getByRole('heading', { name: 'Sunucuya ulaşılamadı' })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Entegrasyon ayarına git' })).toHaveCount(0)
  })

  test('boş kategori listesi ≠ hata: ayrı boş durum, "Yeniden kontrol et"', async ({ page }) => {
    await openMappingPanel(page, { 'IntegrationService/retrieveCategoriesFromIntegration': [] })
    const panel = errorPanel(page)
    await expect(panel).toHaveAttribute('data-kind', 'empty')
    await expect(panel).toHaveAttribute('role', 'status')
    await expect(panel.getByRole('button', { name: 'Yeniden kontrol et' })).toBeVisible()
    await panel.locator('summary').click()
    await expect(panel.locator('details')).not.toContainText('HTTP durumu')
  })

  test('özellikler 500 → hata paneli', async ({ page }) => {
    await openMappingPanel(page, { 'IntegrationService/retrieveCategoryAttributesFromIntegration': mockError(500) })
    await expect(errorPanel(page)).toHaveAttribute('data-kind', 'server')
    await expect(errorPanel(page).getByRole('heading', { name: 'Trendyol kategori özellikleri şu an alınamadı' })).toBeVisible()
  })

  test('özellikler boş dizi → "bu kategori için özellik döndürmedi" nötr boş durumu', async ({ page }) => {
    await openMappingPanel(page, { 'IntegrationService/retrieveCategoryAttributesFromIntegration': [] })
    const panel = errorPanel(page)
    await expect(panel).toHaveAttribute('data-kind', 'empty')
    await expect(panel.getByRole('heading', { name: 'Trendyol bu kategori için özellik döndürmedi' })).toBeVisible()
  })

  test('Tekrar dene AYNI isteği yeniden yapar, düğme yüklenir; başarılınca alan görünür ve odak alana taşınır', async ({ page }) => {
    let calls = 0
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    await openMappingPanel(page, {
      'IntegrationService/retrieveCategoriesFromIntegration': async (route, headers) => {
        calls++
        if (calls === 1) return route.fulfill({ status: 500, contentType: 'application/json', headers, body: JSON.stringify({ error: 'x', code: 'INTERNAL' }) })
        await gate
        return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(mappingPlatformCategories) })
      },
    })
    const panel = errorPanel(page)
    const retry = panel.getByRole('button', { name: 'Tekrar dene' })
    await expect(retry).toBeVisible()
    await retry.click()
    // İstek sürerken panel yerinde kalır ve düğme yükleniyor (aria-busy).
    await expect(panel.getByRole('button', { name: 'Tekrar dene' })).toHaveAttribute('aria-busy', 'true')
    release()
    await expect(panel).toHaveCount(0)
    expect(calls).toBe(2)
    await expect(page.getByRole('textbox', { name: /Trendyol kategorisi/ })).toBeFocused()
  })

  test('klavye: başlık odak alır; Tab ile Tekrar dene → Entegrasyon ayarına git → Teknik ayrıntı; Enter ile açılır', async ({ page }) => {
    await openMappingPanel(page, { 'IntegrationService/retrieveCategoriesFromIntegration': mockError(500) })
    const panel = errorPanel(page)
    await expect(panel.getByRole('heading')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(panel.getByRole('button', { name: 'Tekrar dene' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(panel.getByRole('button', { name: 'Entegrasyon ayarına git' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(panel.locator('summary')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(panel.locator('details')).toHaveAttribute('open', '')
  })

  test('Entegrasyon ayarına git: mevcut sekme yolu ile Pazaryeri ekranını açar', async ({ page }) => {
    await openMappingPanel(page, { 'IntegrationService/retrieveCategoriesFromIntegration': mockError(500) })
    await errorPanel(page).getByRole('button', { name: 'Entegrasyon ayarına git' }).click()
    await expectScreenOpen(page, '.marketplaceView')
  })

  test('özellik değerleri 500 (Seçenek Eşleştirme paneli): değer eşleştirme yerine hata paneli, tekrar deneyince değerler gelir', async ({ page }) => {
    let calls = 0
    await openMappingPanel(page, {
      'IntegrationService/retrieveCategoryAttributeValuesFromIntegration': (route, headers) => {
        calls++
        return calls === 1
          ? route.fulfill({ status: 500, contentType: 'application/json', headers, body: JSON.stringify({ error: 'x' }) })
          : route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify([{ id: 1, title: 'Kırmızı' }]) })
      },
    })
    await page.getByLabel('Platform seçeneği').click()
    await page.locator('.v-overlay--active .v-list-item').filter({ hasText: 'Renk' }).first().click()
    await expect(errorPanel(page).getByRole('heading', { name: 'Trendyol özellik değerleri şu an alınamadı' })).toBeVisible()
    await page.getByRole('button', { name: /Seçenek Eşleştir/ }).click()
    await page.locator('.cm-card .v-field').first().click()
    await page.locator('.v-overlay--active .v-list-item').filter({ hasText: 'E2E Renk Grubu' }).first().click()
    const dialogPanel = page.locator('.cm-card').getByTestId('integration-error-panel')
    await expect(dialogPanel).toBeVisible()
    await dialogPanel.getByRole('button', { name: 'Tekrar dene' }).click()
    await expect(page.locator('.cm-card').getByTestId('integration-error-panel')).toHaveCount(0)
    await expect(page.locator('.cm-card label', { hasText: 'Siyah' }).first()).toBeVisible()
  })

  test('axe: hata paneli WCAG 2.1 AA = 0 ihlal (katlanır ayrıntı açık)', async ({ page }) => {
    await openMappingPanel(page, { 'IntegrationService/retrieveCategoryAttributesFromIntegration': mockError(500) })
    await errorPanel(page).locator('summary').click()
    expect(await axeViolations(page)).toEqual([])
  })

  test('axe: boş durum paneli = 0 ihlal', async ({ page }) => {
    await openMappingPanel(page, { 'IntegrationService/retrieveCategoryAttributesFromIntegration': [] })
    await expect(errorPanel(page)).toBeVisible()
    expect(await axeViolations(page)).toEqual([])
  })
})
