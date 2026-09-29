// ADR-0015 B5-1 — CategoryDefinitionView.
//
// ARAŞTIRMA BULGUSU (bu görevde tespit edildi, BACKLOG.md'ye eklenmesi önerildi — bkz. görev
// raporu): `CategoryDefinitionView.vue`, B1 kapsamındaki (DOKUNULMADI) `productDefinitions/
// CategoryListView.vue` ile BAYT-BAYT AYNIDIR (yalnızca kök `class` farklı: `categoryDefinition`
// vs `categoryListView`). Uygulama kodunda `CategoryDefinitionView`'ı açan HİÇBİR
// `getMenuLinkWithTitle`/`openTab` çağrısı bulunamadı (grep, 2026-09-29) — muhtemelen yinelenen/
// öksüz bir dosya. Bu spec, ekranın KENDİ render davranışını (nasıl açıldığından bağımsız)
// sabitler; `e2e/fixtures/definitionsMenu.ts`'teki sentetik menü girişiyle açılır.
//
// ORTAM KISITI: bu oturumda Chromium indirilemedi (`cdn.playwright.dev` 403, egress politikası) —
// spec ÇALIŞTIRILAMADI, değerlendirme statik kod okumasıyla yapıldı. Yerelde çalıştırılıp yeşil
// olduğu doğrulanmalıdır (bkz. `product-definitions.spec.ts` baş yorumu).
import { test, expect } from '@playwright/test'
import { installApiMocks } from '../fixtures/mockApi'
import { gotoAuthed } from '../fixtures/nav'
import { HIDDEN_DEFINITION_SCREENS, menuFixtureWithLegacyDefinitions, openHiddenDefinitionScreen } from '../fixtures/definitionsMenu'

test.describe('B5-1 — Kategori tanımları (CategoryDefinitionView)', () => {
  test('smoke: ekran açılır, sayfa başlığı ve kategori arama alanı görünür', async ({ page }) => {
    await installApiMocks(page, { MenuService: menuFixtureWithLegacyDefinitions })
    await gotoAuthed(page)
    await openHiddenDefinitionScreen(page, HIDDEN_DEFINITION_SCREENS.CategoryDefinitionView)

    const root = page.locator('.categoryDefinition')
    await expect(root).toBeVisible()
    await expect(root.getByRole('heading', { level: 1, name: 'Kategori Tanımları' })).toBeVisible()
    await expect(root.getByText('Kategori adı ile arama yapabilirsiniz')).toBeVisible()
  })
})
