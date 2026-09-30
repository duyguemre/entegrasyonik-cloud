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
  }
  await subItem.click()
  await page.waitForTimeout(200)
}

test.describe('P3 (B5-2) — Markalar (BrandListView)', () => {
  test('smoke: iki panel (marka listesi | senkron) yan yana render olur', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: brandsDoluFixture })
    await gotoAuthed(page)
    await openBrandListView(page)

    await expectScreenOpen(page, '.brandDefinition')
    // NOT (nav.ts dosya başı notuyla AYNI kök neden — 0-yükseklik zinciri): `.brandListComponentView`
    // kök `<div>`'i `getBoundingClientRect()` yüksekliği 0 ölçülüyor (Transition/KeepAlive
    // sarmalayıcısı boyut almıyor), bu yüzden kutu-tabanlı `.toBeVisible()` GÜVENİLMEZ — gerçekte
    // boyutu olan bir metin düğümü bekleniyor. `BrandListComponent.vue`/`BrandSyncComponent.vue`
    // (ikisi de kapsam dışı kök bileşen) AYNI `.brandListComponentView` sınıfını taşıyor da
    // (karakterizasyon, düzeltilmedi) — bu yüzden sayım/varlık kontrolü yerine metin kullanılıyor.
    await expect(page.locator('.brandDefinition .brandListComponentView')).toHaveCount(2)
    await expect(page.getByText('E2E Marka Bir')).toBeVisible()
    await expect(page.getByText('Eşitleme için önce Marka seçmelisiniz')).toBeVisible()
  })

  // fe-b7 (554d858) davranışı bu tabanda: alanın KENDİ temizle simgesi modeli `null` yapar — süzgeç çökmeden
  // tüm listeye döner (b7 sayfaları henüz tabanda yok; aynı güvence mevcut marka/kategori arama alanlarında).
  test('arama alanının temizle simgesi (model null) güvenli: liste geri gelir, sayfa hatası yok', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: brandsDoluFixture })
    await gotoAuthed(page)
    await openBrandListView(page)
    const field = page.locator('.ek-brand-list .v-text-field:visible').filter({ has: page.locator('.mdi-magnify') }).first()
    const input = field.locator('input')
    await input.fill('zzzz-yok')
    await expect(page.getByText('E2E Marka Bir')).toBeHidden()
    await field.locator('.v-field__clearable .v-icon').click()
    await expect(input).toHaveValue('')
    await expect(page.getByText('E2E Marka Bir')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('boş durum: marka yoksa liste paneli boş açılır (ham hata sızmaz)', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithBrand, BrandService: [] })
    await gotoAuthed(page)
    await openBrandListView(page)

    await expectScreenOpen(page, '.brandDefinition')
    await expect(page.getByText('Marka Listesi')).toBeVisible()
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
