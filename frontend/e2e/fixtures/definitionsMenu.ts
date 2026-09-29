// ADR-0015 B5-1 — `views/secure/definitions/**` ekranlarından CANLI bir menü tetikleyicisi
// olmayan 8'i için (Category/Brand/Hashtag/Option/Customer/Invoice/Order/Return
// DefinitionView) sentetik, YALNIZCA bu B5-1 spec'lerine ait bir menü grubu.
//
// NEDEN (araştırma bulgusu, bu görevde tespit edildi — bkz. görev raporu):
// - `CategoryDefinitionView.vue`, `productDefinitions/CategoryListView.vue` (B1 kapsamı,
//   DOKUNULMADI) ile BAYT-BAYT AYNI koddur (yalnızca kök `class` farklı) — canlı uygulamada
//   `CategoryDefinitionView`'ı açan HİÇBİR `getMenuLinkWithTitle`/`openTab` çağrısı YOK (grep
//   ile doğrulandı). Muhtemelen yinelenen/öksüz bir dosya.
// - `BrandDefinitionView.vue`, `HashtagDefinitionView.vue`, `OptionDefinitionView.vue`,
//   `CustomerDefinitionView.vue`, `InvoiceDefinitionView.vue`, `OrderDefinitionView.vue`,
//   `ReturnDefinitionView.vue` YEDİSİ DE aynı sahte "müşteri" tablosunu (`customers.customer.*`
//   i18n anahtarları, sabit "Emre Yalçınkaya" satırları) render eden, kendi alanıyla İLGİSİZ,
//   bitmemiş bir prototiptir — hiçbir gerçek API çağrısı yapmaz, hiçbir yerden açılmaz.
//
// Bu 8 ekran `menu.ts`'in `views` Map'inde `definitions/<Kod>DefinitionView` anahtarıyla
// KAYITLIDIR (component her zaman ÇÖZÜLÜR) ama backend menü ağacında (sidebar) GÖRÜNMEZ —
// `useOpenIntegrationConfigTab.ts`'teki (ADR-0020) AYNI durum. Karakterizasyon/görsel doğrulama
// İÇİN buraya, sidebar'da GÖRÜNEN ama gerçek üründe YOK olan sentetik bir menü grubu eklendi.
// `e2e/fixtures/nav.ts`'e DOKUNULMADI (B5-1 kapsam dışı, paylaşılan dosya).
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { menuFixture, openDrawer } from './nav'

export interface HiddenDefinitionScreenDef {
  code: string
  icon: string
}

/** `stores/site/menu.ts` `views` Map anahtarıyla eşleşen `parent: 'definitions'` bağlantıları. */
export const HIDDEN_DEFINITION_SCREENS = {
  CategoryDefinitionView: { code: 'CategoryDefinitionView', icon: 'mdi-shape-outline' },
  BrandDefinitionView: { code: 'BrandDefinitionView', icon: 'mdi-tag-multiple-outline' },
  HashtagDefinitionView: { code: 'HashtagDefinitionView', icon: 'mdi-pound' },
  OptionDefinitionView: { code: 'OptionDefinitionView', icon: 'mdi-tune-variant' },
  CustomerDefinitionView: { code: 'CustomerDefinitionView', icon: 'mdi-account-outline' },
  InvoiceDefinitionView: { code: 'InvoiceDefinitionView', icon: 'mdi-receipt-text-outline' },
  OrderDefinitionView: { code: 'OrderDefinitionView', icon: 'mdi-cart-arrow-down' },
  ReturnDefinitionView: { code: 'ReturnDefinitionView', icon: 'mdi-undo-variant' },
} as const satisfies Record<string, HiddenDefinitionScreenDef>

export const menuFixtureWithLegacyDefinitions = [
  ...menuFixture,
  {
    group: 'b5_1HiddenLegacyDefinitions',
    links: Object.values(HIDDEN_DEFINITION_SCREENS).map((def) => ({
      code: def.code,
      parent: 'definitions',
      title: `b5_1_${def.code}`,
      icon: def.icon,
      singleton: true,
    })),
  },
]

/**
 * `openScreen` (nav.ts) ile AYNI tıklama mekaniği (yalnızca üst-düzey, gruplanmamış öğe —
 * bu sentetik grupta hiçbir öğe bir `v-list-group` içine gömülü değil). `MENU_SCREENS`'e
 * (nav.ts, tipli sabit liste) DOKUNMADAN, sentetik başlığıyla üst-düzey bir menü öğesi seçer.
 */
export async function openHiddenDefinitionScreen(page: Page, screen: HiddenDefinitionScreenDef) {
  await openDrawer(page)
  const drawer = page.locator('.v-navigation-drawer.soft-nav')
  // Ikona gore secim YETERSIZ: `mdi-receipt-text-outline`/`mdi-undo-variant` gercek "Faturalar"/
  // "Iade Yonetimi" ogeleriyle cakisiyor (bulut kosusu 2026-09-29, `.first()` yanlis ekrani acti).
  // Sentetik `title` (`b5_1_<code>`) benzersizdir; i18n anahtari cevrilmedigi icin DOM metninde
  // `menu.b5_1_<code>` olarak gorunur.
  const item = drawer.locator('.soft-item').filter({ hasText: `b5_1_${screen.code}` })
  await expect(item).toBeVisible()
  await item.click()
}
