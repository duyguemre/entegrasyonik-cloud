/**
 * frontend/src/navigation/sections.ts
 *
 * ADR-0015 Karar 2.4 — bölüm iskeleti (Genel/Katalog/Siparişler/Entegrasyonlar/
 * Finans ve raporlar/Ayarlar/Yardım/Yönetim). SAF TS (screens.ts ile aynı
 * disiplin — vue/vuetify/`@/` bileşen import'u YASAK).
 *
 * Bu kayıt defteri yalnızca SUNUM amaçlıdır (breadcrumb'ın "Bölüm" kısmı,
 * komut paleti gruplaması, gelecekteki `menuSource:'registry'` ekranlarının
 * yerleşimi). ADR'nin bağlayıcı kuralı: "Erişilebilirliğin kaynağı
 * DEĞİŞMEZ" — bir ekranın MENÜDE görünüp görünmeyeceğine bu dosya KARAR
 * VERMEZ (o, bugünkü gibi `MenuService`'ten gelir); bu dosya yalnızca
 * zaten erişilebilir bir ekranı hangi bölüm ETİKETİ altında göstereceğimizi
 * söyler. `screens.ts`'teki bir kayıt `section` alanını BOŞ bırakırsa
 * (ör. henüz eşlenmemiş P2/P3 ekranı) `OTHER_SECTION`a düşer — ASLA gizlenmez.
 */

export interface SectionDefinition {
  id: string
  /** i18n anahtarı (tr.json/en.json `shell.section.<id>`). */
  labelKey: string
  order: number
}

/** ADR-0015 Karar 2.4 tablosu — sıra bu dizinin sırasıdır. */
export const SECTIONS: readonly SectionDefinition[] = [
  { id: 'general', labelKey: 'shell.section.general', order: 0 },
  { id: 'catalog', labelKey: 'shell.section.catalog', order: 1 },
  { id: 'orders', labelKey: 'shell.section.orders', order: 2 },
  { id: 'integrations', labelKey: 'shell.section.integrations', order: 3 },
  { id: 'finance', labelKey: 'shell.section.finance', order: 4 },
  { id: 'settings', labelKey: 'shell.section.settings', order: 5 },
  { id: 'account', labelKey: 'shell.section.account', order: 6 },
  { id: 'admin', labelKey: 'shell.section.admin', order: 7 },
  { id: 'other', labelKey: 'shell.section.other', order: 99 },
] as const

export const OTHER_SECTION_ID = 'other'

export function resolveSectionLabelKey(sectionId: string | undefined): string {
  const found = SECTIONS.find((s) => s.id === sectionId)
  return found?.labelKey ?? SECTIONS.find((s) => s.id === OTHER_SECTION_ID)!.labelKey
}
