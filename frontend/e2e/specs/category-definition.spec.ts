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
// ORTAM NOTU: ilk bulut oturumunda Chromium indirilemedi (`cdn.playwright.dev` 403) ve spec
// statik okumayla yazıldı. 2026-09-29 ikinci bulut oturumunda önceden kurulu Chromium ile
// ÇALIŞTIRILDI; ortaya çıkan seçici hataları ve görsel regresyon burada düzeltildi. Görsel
// onay yine yerelde (Windows tabanları) yapılır.
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
    // "Kategori adı ile arama yapabilirsiniz" yalnızca odakta görünen bir `hint`tir; kalıcı
    // görünen metin kart başlığı ve alan etiketidir.
    await expect(root.getByText('Kategori Listesi')).toBeVisible()
    // Vuetify etiketi iki kez basar (yüzen + kesik çizgi etiket) — ilki yeterli.
    await expect(root.getByText('Kategorilerde Ara').first()).toBeVisible()

    // Regresyon kilidi (bulut koşusu 2026-09-29): CategoryListComponent kökü `.workarea-scroll`
    // (position:absolute) konumlu bir ata olmadan sekme kabına yayılıp EkPageHeader'ın ÜSTÜNÜ
    // örtüyordu. Başlık kutusunun altı, liste kartının üstünden aşağıda olmamalı.
    const headingBox = await root.getByRole('heading', { level: 1 }).boundingBox()
    const cardBox = await root.getByText('Kategori Listesi').boundingBox()
    expect(headingBox && cardBox && headingBox.y + headingBox.height <= cardBox.y).toBeTruthy()
  })
})
