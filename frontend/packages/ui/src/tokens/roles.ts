/**
 * frontend/src/design/tokens/roles.ts
 *
 * DS-v2 — renk token'larının KULLANIM AMACI ve zorunlu kontrast çiftleri.
 * SAF TS. Geliştirme vitrini (`/design-system`), `DESIGN_SYSTEM.md` ve
 * `tests/theme/ds-v2-contrast.test.ts` bu dosyayı TEK kaynak olarak okur:
 * bir role yeni kullanım eklenirse önce buraya yazılır.
 */
import type { SemanticColorKey } from './semantic'

export type ColorRoleGroup =
  | 'surface'
  | 'chrome'
  | 'sidebar'
  | 'tabs'
  | 'content'
  | 'border'
  | 'action'
  | 'status'
  | 'brand'

export interface ColorRoleDoc {
  key: SemanticColorKey
  group: ColorRoleGroup
  /** Ne için kullanılır (ve ne için KULLANILMAZ). */
  purpose: string
}

export const COLOR_ROLE_GROUP_LABELS: Record<ColorRoleGroup, string> = {
  surface: 'Yüzey katmanları',
  chrome: 'Kimlik kabuğu (üst bar)',
  sidebar: 'Sidebar',
  tabs: 'Workspace sekmeleri',
  content: 'Metin',
  border: 'Kenarlık ve odak',
  action: 'Aksiyon (tek vurgu rengi)',
  status: 'Durum (semantik)',
  brand: 'Marka ve seçim',
}

export const COLOR_ROLES: ColorRoleDoc[] = [
  // Yüzeyler — koyudan açığa katman sırası: tabstrip < app-bg < sunken < muted < surface ≤ raised
  { key: 'app-bg', group: 'surface', purpose: 'Çalışma alanı zemini (kartların altındaki tonlu alan). Saf beyaz değildir.' },
  { key: 'surface-sunken', group: 'surface', purpose: 'Kartın İÇİNDE çukur alan: filtre paneli gövdesi, salt-okunur değer kuyusu, kod/JSON bloğu.' },
  { key: 'surface-muted', group: 'surface', purpose: 'Kart başlık bandı, tablo başlığı, ikincil panel. Zemin ile kart arasındaki ara ton.' },
  { key: 'surface', group: 'surface', purpose: 'Kart, tablo gövdesi, form yüzeyi. İçerik her zaman bu katmanda okunur.' },
  { key: 'surface-raised', group: 'surface', purpose: 'Yükselen katman: menü, açılır liste, arama sonuçları, diyalog. Ton aynı, ayrım gölgeyle (shadow-popover/dialog).' },
  { key: 'surface-inverse', group: 'surface', purpose: 'Tooltip ve kısa bildirim zemini (ters yüzey). Üzerindeki metin content-inverse.' },
  { key: 'scrim', group: 'surface', purpose: 'Modal arka perdesi — yalnızca --ek-color-scrim-veil (%44 saydam) olarak kullanılır.' },
  { key: 'background', group: 'surface', purpose: 'Vuetify v-app zemini. Uygulamada app-bg ile aynı değerdir (geriye uyumluluk adı).' },
  // Kabuk
  { key: 'chrome', group: 'chrome', purpose: 'Üst bar degradesinin başlangıcı (logo laciverti). Kimliği taşıyan TEK boyalı alan.' },
  { key: 'chrome-end', group: 'chrome', purpose: 'Üst bar degradesinin bitişi. Yalnızca --ek-gradient-chrome içinde.' },
  { key: 'chrome-raised', group: 'chrome', purpose: 'Üst bar üzerindeki kontrol zemini: arama kutusu, çalışma alanı anahtarı, profil düğmesi.' },
  { key: 'chrome-border', group: 'chrome', purpose: 'Üst bar kontrollerinin kenarlığı ve ayraçları.' },
  { key: 'chrome-text', group: 'chrome', purpose: 'Üst bar üzerindeki birincil metin ve ikon.' },
  { key: 'chrome-text-muted', group: 'chrome', purpose: 'Üst bar ikincil metni (yer tutucu, alt bilgi).' },
  // Sidebar
  { key: 'sidebar-bg', group: 'sidebar', purpose: 'Sol menü zemini — zeminden bir kademe açık, sağda sidebar-border.' },
  { key: 'sidebar-border', group: 'sidebar', purpose: 'Sol menünün içerikle sınırı.' },
  { key: 'sidebar-section', group: 'sidebar', purpose: 'Menü bölüm başlığı (BÜYÜK HARF mikro etiket) — kimlik laciverti.' },
  { key: 'sidebar-text', group: 'sidebar', purpose: 'Menü öğesi metni ve ikonu (pasif).' },
  { key: 'sidebar-hover', group: 'sidebar', purpose: 'Menü öğesi üzerine gelince zemin.' },
  { key: 'sidebar-active', group: 'sidebar', purpose: 'Etkin (açık ekran) menü öğesi zemini; metin action-emphasis, solda 3px action göstergesi.' },
  // Sekmeler
  { key: 'tabstrip-bg', group: 'tabs', purpose: 'Sekme şeridi zemini; pasif sekmeler bu tonda durur.' },
  { key: 'tab-hover', group: 'tabs', purpose: 'Pasif sekmenin üzerine gelince zemini.' },
  { key: 'tab-active', group: 'tabs', purpose: 'Etkin sekme — içerik alanıyla (app-bg) birleşen yüzey: gerçek sekme hissi.' },
  // Metin
  { key: 'content-strong', group: 'content', purpose: 'Başlık, birincil değer, tablo kimlik kolonu.' },
  { key: 'content-default', group: 'content', purpose: 'Gövde metni, tablo hücresi.' },
  { key: 'content-muted', group: 'content', purpose: 'İkincil metin, etiket, yardım metni, pasif ikon. Tüm yüzeylerde AA.' },
  { key: 'content-subtle', group: 'content', purpose: 'YALNIZCA dekoratif ikon, devre dışı öğe, yer tutucu. Okunması gereken metin için KULLANILMAZ (AA altı).' },
  { key: 'content-inverse', group: 'content', purpose: 'Ters yüzey (surface-inverse) üzerindeki metin.' },
  // Kenarlık
  { key: 'border-subtle', group: 'border', purpose: 'Kart içi ayraç, tablo satır çizgisi.' },
  { key: 'border-default', group: 'border', purpose: 'Kart/panel dış çizgisi, bölüm ayırıcı.' },
  { key: 'border-strong', group: 'border', purpose: 'Vurgulu kart, ikincil düğme çerçevesi, hover kenarlığı.' },
  { key: 'border-input', group: 'border', purpose: 'Form alanı kenarlığı — yüzeyde ≥3:1 (WCAG 1.4.11).' },
  { key: 'border-focus', group: 'border', purpose: 'Klavye odak halkası (--ek-focus-ring). Her etkileşimli öğede aynı.' },
  // Aksiyon
  { key: 'action', group: 'action', purpose: 'TEK vurgu rengi: birincil düğme, bağlantı, etkin gösterge, seçili sayfa, checkbox. Ekran başına tek birincil düğme.' },
  { key: 'action-hover', group: 'action', purpose: 'Birincil düğme hover.' },
  { key: 'action-active', group: 'action', purpose: 'Birincil düğme basılı (active).' },
  { key: 'action-subtle', group: 'action', purpose: 'Seçili menü/satır/sonuç zemini, ikon kapsülü zemini (aksiyon tonu).' },
  { key: 'action-border', group: 'action', purpose: 'Seçili öğe çerçevesi (selection-ring), aksiyon tonlu kapsül kenarı.' },
  { key: 'action-emphasis', group: 'action', purpose: 'action-subtle zemin üzerindeki metin/ikon (etkin menü, seçili sonuç).' },
  { key: 'action-contrast', group: 'action', purpose: 'Birincil düğme dolgusu üzerindeki metin/ikon.' },
  { key: 'primary', group: 'action', purpose: 'Vuetify color="primary" — uygulamada action ile AYNI değer (geriye uyumluluk adı).' },
  // Durum
  { key: 'success', group: 'status', purpose: 'Başarılı/tamamlandı/aktif. Dolgu yalnızca sayaç rozetinde; durum çipi subtle zemin + emphasis metin.' },
  { key: 'success-subtle', group: 'status', purpose: 'Başarı çipi/uyarı kutusu zemini.' },
  { key: 'success-border', group: 'status', purpose: 'Başarı kutusu/çipi kenarı.' },
  { key: 'success-emphasis', group: 'status', purpose: 'Başarı subtle zemini üzerindeki metin.' },
  { key: 'success-contrast', group: 'status', purpose: 'Başarı dolgusu (sayaç rozeti, tehlike düğmesi) üzerindeki metin/ikon.' },
  { key: 'warning', group: 'status', purpose: 'Dikkat/bekliyor/kısmi. Aksiyon rengi olarak ASLA kullanılmaz.' },
  { key: 'warning-subtle', group: 'status', purpose: 'Uyarı çipi/kutusu zemini.' },
  { key: 'warning-border', group: 'status', purpose: 'Uyarı kutusu/çipi kenarı.' },
  { key: 'warning-emphasis', group: 'status', purpose: 'Uyarı subtle zemini üzerindeki metin.' },
  { key: 'warning-contrast', group: 'status', purpose: 'Uyarı dolgusu (sayaç rozeti, tehlike düğmesi) üzerindeki metin/ikon.' },
  { key: 'error', group: 'status', purpose: 'Hata/başarısız ve TEHLİKELİ aksiyon (sil, iptal et) — tehlike düğmesi yalnızca onay adımında dolgu.' },
  { key: 'error-subtle', group: 'status', purpose: 'Hata kutusu, tehlikeli menü öğesi hover zemini.' },
  { key: 'error-border', group: 'status', purpose: 'Hatalı alan/kutu kenarı.' },
  { key: 'error-emphasis', group: 'status', purpose: 'Hata subtle zemini üzerindeki metin.' },
  { key: 'error-contrast', group: 'status', purpose: 'Hata/tehlike dolgusu (sayaç rozeti, tehlike düğmesi) üzerindeki metin/ikon.' },
  { key: 'info', group: 'status', purpose: 'Bilgi/işleniyor. Aksiyon rengiyle karıştırılmaz (daha yeşilimsi mavi).' },
  { key: 'info-subtle', group: 'status', purpose: 'Bilgi kutusu/çipi zemini.' },
  { key: 'info-border', group: 'status', purpose: 'Bilgi kutusu/çipi kenarı.' },
  { key: 'info-emphasis', group: 'status', purpose: 'Bilgi subtle zemini üzerindeki metin.' },
  { key: 'info-contrast', group: 'status', purpose: 'Bilgi dolgusu (sayaç rozeti, tehlike düğmesi) üzerindeki metin/ikon.' },
  { key: 'neutral', group: 'status', purpose: 'Nötr/kuyrukta/taslak durum.' },
  { key: 'neutral-subtle', group: 'status', purpose: 'Nötr çip zemini.' },
  { key: 'neutral-border', group: 'status', purpose: 'Nötr çip kenarı.' },
  { key: 'neutral-emphasis', group: 'status', purpose: 'Nötr subtle zemini üzerindeki metin.' },
  { key: 'neutral-contrast', group: 'status', purpose: 'Nötr dolgusu (sayaç rozeti, tehlike düğmesi) üzerindeki metin/ikon.' },
  // Marka / seçim
  { key: 'brand', group: 'brand', purpose: 'Logo laciverti ve marka öğeleri. Düğme/aksiyon için KULLANILMAZ.' },
  { key: 'secondary', group: 'brand', purpose: 'Logo teal merkezi — yalnızca dekoratif (metin/ikon anlamı taşımaz).' },
  { key: 'selection', group: 'brand', purpose: 'Seçili tablo satırı / seçili liste öğesi zemini.' },
  { key: 'highlight', group: 'brand', purpose: 'Arama sonucunda eşleşen metin parçasının zemini (<mark>).' },
]

export interface ContrastPair {
  fg: SemanticColorKey
  bg: SemanticColorKey
  /** 4.5 = metin (AA), 3 = büyük metin/UI bileşeni (WCAG 1.4.11). */
  min: 4.5 | 3
}

const TEXT_ON_SURFACES: SemanticColorKey[] = [
  'app-bg',
  'surface',
  'surface-muted',
  'surface-sunken',
  'surface-raised',
  'sidebar-bg',
  'tabstrip-bg',
  'tab-active',
  'selection',
]

/** Zorunlu kontrast çiftleri (hem light hem dark profil için test edilir). */
export const CONTRAST_PAIRS: ContrastPair[] = [
  ...(['content-strong', 'content-default', 'content-muted'] as SemanticColorKey[]).flatMap((fg) =>
    TEXT_ON_SURFACES.map((bg) => ({ fg, bg, min: 4.5 as const })),
  ),
  { fg: 'content-strong', bg: 'highlight', min: 4.5 },
  { fg: 'content-strong', bg: 'tab-hover', min: 4.5 },
  { fg: 'content-inverse', bg: 'surface-inverse', min: 4.5 },
  // Kabuk
  ...(['chrome-text', 'chrome-text-muted'] as SemanticColorKey[]).flatMap((fg) =>
    (['chrome', 'chrome-end', 'chrome-raised'] as SemanticColorKey[]).map((bg) => ({ fg, bg, min: 4.5 as const })),
  ),
  // Sidebar
  ...(['sidebar-bg', 'sidebar-hover'] as SemanticColorKey[]).map((bg) => ({ fg: 'sidebar-text' as SemanticColorKey, bg, min: 4.5 as const })),
  { fg: 'sidebar-section', bg: 'sidebar-bg', min: 4.5 },
  { fg: 'action-emphasis', bg: 'sidebar-active', min: 4.5 },
  // Aksiyon
  { fg: 'action-contrast', bg: 'action', min: 4.5 },
  { fg: 'action-contrast', bg: 'action-hover', min: 4.5 },
  { fg: 'action-contrast', bg: 'action-active', min: 4.5 },
  { fg: 'action-emphasis', bg: 'action-subtle', min: 4.5 },
  { fg: 'action', bg: 'surface', min: 4.5 },
  { fg: 'action', bg: 'app-bg', min: 4.5 },
  { fg: 'action', bg: 'surface-muted', min: 4.5 },
  // Durum tonları: çekirdek ve emphasis subtle zeminde; contrast dolguda
  ...(['success', 'warning', 'error', 'info', 'neutral'] as const).flatMap((tone) => [
    { fg: tone as SemanticColorKey, bg: `${tone}-subtle` as SemanticColorKey, min: 4.5 as const },
    { fg: `${tone}-emphasis` as SemanticColorKey, bg: `${tone}-subtle` as SemanticColorKey, min: 4.5 as const },
    { fg: `${tone}-contrast` as SemanticColorKey, bg: tone as SemanticColorKey, min: 4.5 as const },
    { fg: tone as SemanticColorKey, bg: 'surface' as SemanticColorKey, min: 4.5 as const },
  ]),
  // UI bileşeni (≥3:1)
  { fg: 'border-input', bg: 'surface', min: 3 },
  { fg: 'border-input', bg: 'surface-sunken', min: 3 },
  { fg: 'border-focus', bg: 'surface', min: 3 },
  { fg: 'border-focus', bg: 'app-bg', min: 3 },
  { fg: 'border-focus', bg: 'tabstrip-bg', min: 3 },
  { fg: 'action', bg: 'tabstrip-bg', min: 3 },
]
