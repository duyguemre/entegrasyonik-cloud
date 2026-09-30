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
  test('smoke: iki panel (kategori | senkron) yan yana render olur, kök kategori ekleme formu görünür', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithCategory, CategoryService: categoriesDoluFixture })
    await gotoAuthed(page)
    await openCategoryListView(page)

    await expectScreenOpen(page, '.categoryListView')
    await expect(page.getByText('Kategori Listesi')).toBeVisible()
    await expect(page.getByLabel('Alt Kategori İsmi')).toBeVisible()
    await expect(page.getByText('Eşitleme için önce Kategori seçmelisiniz')).toBeVisible()
  })

  test('boş durum: kategori yoksa da form/arama yüzeyi bozulmadan açılır (ham hata sızmaz)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithCategory, CategoryService: [] })
    await gotoAuthed(page)
    await openCategoryListView(page)

    await expectScreenOpen(page, '.categoryListView')
    await expect(page.getByText('Kategori Listesi')).toBeVisible()
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
    await expect(page.getByText('Kategori Listesi')).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.categoryListView').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-CategoryListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] CategoryListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})
