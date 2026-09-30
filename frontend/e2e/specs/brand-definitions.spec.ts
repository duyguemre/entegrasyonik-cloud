// ADR-0015 B5-2 — BrandListView (karakterizasyon, Protokol 13). `BrandListView.vue` neredeyse
// tüm görünür içeriği kapsam DIŞI kök bileşenlere devrediyor (`BrandListComponent.vue`,
// `BrandSyncComponent.vue` — `components/productDefinitions/` DIŞINDA, bu görevde DOKUNULMADI).
// Bu ekranın KENDİ davranışı yalnızca: iki panelin (liste | senkron) yan yana yerleşimi,
// `selectedBrand` v-model köprüsü (`openBrandSync`) ve `destroyComponent()` dışa açımı.
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { installApiMocks } from '../fixtures/mockApi'
import { brandsDoluFixture } from '../fixtures/apiData'
import { menuFixture, gotoAuthed, openDrawer, expectScreenOpen } from '../fixtures/nav'
import type { Page } from '@playwright/test'

// Yalnızca bu spec'e özel: paylaşılan `menuFixture`nin 'productDefinitions' grubuna, GERÇEK
// `stores/site/menu.ts` görünüm haritasında zaten kayıtlı olan (`productDefinitions/BrandListView`)
// ama bugünkü paylaşılan test menüsünde YOK olan bir çocuk ekleniyor — yalnızca bu dosyanın
// içinde, `e2e/fixtures/nav.ts` DEĞİŞMEDİ (B5-2 kapsam sınırı: sadece view/component + yeni spec).
const menuFixtureWithBrand = menuFixture.map((group: any) =>
  group.group === 'sale'
    ? {
        ...group,
        links: group.links.map((link: any) =>
          link.code === 'productDefinitions'
            ? { ...link, children: [...link.children, { code: 'BrandListView', parent: 'productDefinitions', title: 'brandList', icon: 'mdi-tag-multiple-outline', singleton: true }] }
            : link,
        ),
      }
    : group,
)

async function openBrandListView(page: Page) {
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

test.describe('P3 (B5-2) — Markalar (BrandListView)', () => {
  // B7 (cloud/fe-b7) — BİLİNÇLİ güncelleme: sayfa yeniden tasarlandı (başlık satırı + koleksiyon | detay). Eski iki kök
  // bileşen (`.brandListComponentView` ×2) yerine sol bölme koleksiyon; sağda seçim yokken "Marka özeti", seçimde mevcut
  // BrandSyncComponent. İddia aynı: iki bölme render olur, marka görünür, seçim yokken yönlendirme var.
  test('smoke: iki bölme (markalar | detay) render olur; seçimde mevcut eşitleme paneli açılır', async ({ page }, testInfo) => {
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: brandsDoluFixture })
    await gotoAuthed(page)
    await openBrandListView(page)

    await expectScreenOpen(page, '.brandDefinition')
    await expect(page.getByRole('option', { name: /^E2E Marka Bir/ })).toBeVisible()
    // Dar kapta (< 920px) tek bölme: seçim yokken yalnız liste.
    const wide = testInfo.project.name === 'chromium-desktop'
    await expect(page.getByRole('heading', { name: 'Marka özeti' })).toBeVisible({ visible: wide })
    await page.getByRole('option', { name: /^E2E Marka Bir/ }).click()
    await expect(page.locator('.brandDefinition .brandListComponentView')).toHaveCount(1)
    await expect(page.getByText('E2E Marka Bir Markasını Düzenle')).toBeVisible()
    if (!wide) {
      await page.getByRole('button', { name: 'Tüm markalar' }).click()
      await expect(page.getByRole('option', { name: /^E2E Marka Bir/ })).toBeFocused()
    }
  })

  test('boş durum: marka yoksa ilk marka yönlendirmesi açılır (ham hata sızmaz)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: [] })
    await gotoAuthed(page)
    await openBrandListView(page)

    await expectScreenOpen(page, '.brandDefinition')
    await expect(page.getByText('Henüz marka yok', { exact: true })).toBeVisible()
    await expect(page.locator('body')).not.toContainText('500')
  })

  test('ekran görüntüsü tabanı (marka tanımları)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: brandsDoluFixture })
    await gotoAuthed(page)
    await openBrandListView(page)
    await page.waitForTimeout(300)
    await expect(page).toHaveScreenshot('brand-definitions.png', { fullPage: false })
  })

  test('axe: WCAG 2.1 AA taraması (ekranın KENDİ hiyerarşisi; kapsam dışı kök bileşenlerin ihlalleri BACKLOG.md)', async ({ page }, testInfo) => {
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: brandsDoluFixture })
    await gotoAuthed(page)
    await openBrandListView(page)
    await expect(page.getByText('E2E Marka Bir')).toBeVisible()
    const results = await new AxeBuilder({ page }).include('.brandDefinition').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    await testInfo.attach('axe-BrandListView-sonuclari.json', { body: JSON.stringify(results.violations, null, 2), contentType: 'application/json' })
    console.log(`[axe] BrandListView: ${results.violations.length} WCAG 2.1 AA ihlali`)
  })
})
