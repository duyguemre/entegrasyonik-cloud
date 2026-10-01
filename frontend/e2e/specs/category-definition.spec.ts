// ADR-0015 B5-1 — CategoryDefinitionView.
//
// `CategoryDefinitionView.vue`, `productDefinitions/CategoryListView.vue` ile AYNI ekranı (ortak
// `components/categories/CategoryManager.vue`) gösterir — yalnızca kök `class` farklı (`categoryDefinition` vs
// `categoryListView`). Uygulama kodunda onu açan HİÇBİR `getMenuLinkWithTitle`/`openTab` çağrısı yoktur (yinelenen
// giriş); bu spec, ekranın KENDİ render davranışını `e2e/fixtures/definitionsMenu.ts`'teki sentetik menü girişiyle sabitler.
// Kategoriler ekranı yeniden tasarımı sonrası: başlık EkPageBar H1 "Kategoriler"; sol ağaç, sağ detay.
import { test, expect } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed } from '../fixtures/nav'
import { HIDDEN_DEFINITION_SCREENS, menuFixtureWithLegacyDefinitions, openHiddenDefinitionScreen } from '../fixtures/definitionsMenu'

const tree = [
  { _id: 'main', title: 'Ana Kategori', isMain: true },
  { _id: 'c-1', title: 'E2E Kategori Bir', children: [{ _id: 'c-2', title: 'E2E Alt Kategori', children: [] }] },
]

test.describe('B5-1 — Kategori tanımları (CategoryDefinitionView)', () => {
  test('smoke: ekran açılır, sayfa başlığı, kategori arama alanı ve ağaç görünür', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithLegacyDefinitions, CategoryService: tree })
    await gotoAuthed(page)
    await openHiddenDefinitionScreen(page, HIDDEN_DEFINITION_SCREENS.CategoryDefinitionView)

    const root = page.locator('.categoryDefinition')
    await expect(root).toBeVisible()
    await expect(root.getByRole('heading', { level: 1, name: 'Kategoriler' })).toBeVisible()
    await expect(root.getByRole('tree', { name: 'Kategori ağacı' })).toBeVisible()
    await expect(root.getByLabel('Kategori ara').first()).toBeVisible()

    // Regresyon kilidi: konumlu ata olmadan içerik sekme kabına yayılıp başlığın ÜSTÜNÜ örtmemeli.
    // Başlık kutusunun altı, ağaç panelinin üstünden aşağıda olmamalı.
    const headingBox = await root.getByRole('heading', { level: 1 }).boundingBox()
    const treeBox = await root.getByRole('tree', { name: 'Kategori ağacı' }).boundingBox()
    expect(headingBox && treeBox && headingBox.y + headingBox.height <= treeBox.y).toBeTruthy()
  })
})
