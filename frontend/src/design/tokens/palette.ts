/**
 * frontend/src/design/tokens/palette.ts
 *
 * ADR-0011 Karar 1 — primitif renk paleti. SAF TS (vue/vuetify/`@/` import'u
 * YASAK). Bu dosyadaki hex DEĞERLERİ yalnızca `frontend/src/design/tokens/**`
 * içindeki diğer dosyalar (semantic.ts, legacy.ts) tarafından kullanılır;
 * bileşenlerde (`.vue`) ASLA doğrudan import edilmez/kullanılmaz — bileşenler
 * yalnızca `semantic.ts`/`legacy.ts`'in ürettiği anlamsal (`--ek-*`) token'ları
 * tüketir (ADR-0011 Karar 2, Aşama 2 göç protokolü).
 *
 * Kaynak: ADR-0011 Bağlam (PRODUCT_SURFACES.md §2.5-2.10) en sık kullanılan
 * tailwind-slate paleti + durum renkleri + bugünkü `plugins/vuetify.ts`
 * kaynağındaki `baseColor`/`shadeColor` türevleri ve düz renk anahtarları.
 */

// Tailwind "slate" ölçeği — kenarlık/zemin/metin nötr tonları.
export const slate = {
  50: '#F8FAFC',
  100: '#F1F5F9',
  200: '#E2E8F0',
  300: '#CBD5E1',
  400: '#94A3B8',
  500: '#64748B',
  600: '#475569',
  700: '#334155',
  800: '#1E293B',
  900: '#0F172A',
} as const

// Durum renkleri (error/success/warning/info) — light "50/100" tonları
// rozet/uyarı zeminleri için, "600" tonları vurgulu metin/ikon için.
// "700" tonları ADR-0015 Karar 3.3 — WCAG göreli parlaklık formülüyle
// hesaplanan, AA metin/dolgu eşiğini (≥4.5:1) karşılayan durum paleti
// çekirdek değerleridir (bugünkü `success #4CAF50`/`warning #FB8C00`/
// `info #00ACC1` AA-altı değerlerinin yerini alır — ADR-0011 Açık Soru 4 kararı).
export const red = {
  50: '#FEF2F2',
  100: '#FEE2E2',
  600: '#DC2626',
  700: '#B91C1C',
  900: '#450A0A',
  950: '#3B0A0A',
} as const

export const green = {
  100: '#DCFCE7',
  600: '#16A34A',
  700: '#15803D',
  950: '#052E1C',
} as const

export const amberScale = {
  100: '#FEF3C7',
  600: '#D97706',
  700: '#B45309',
  950: '#451A03',
} as const

export const sky = {
  100: '#E0F2FE',
  600: '#0284C7',
  700: '#0369A1',
  950: '#0C2A3D',
} as const

// Dark tema için durum tonları (ADR-0015 Karar 3.3 — "dark değerleri de
// tanımlanır", dark mode kapısı henüz AÇIK değil [ADR-0011 Karar 3, ADR-0015
// Karar 5.5], bu yüzden değerler koyu zemin üzerinde okunaklı standart
// Tailwind "400" tonlarından seçildi; kapı açıldığında ayrı bir görsel turda
// ince ayar yapılabilir).
export const statusDark = {
  successText: '#4ADE80',
  warningText: '#FBBF24',
  dangerText: '#F87171',
  infoText: '#38BDF8',
} as const

/**
 * Pazaryeri/entegrasyon marka vurgu rengi (ADR-0015 Karar 3.11) — yalnızca
 * 3px şerit/nokta olarak kullanılır, METİN/İKON rengi DEĞİLDİR. Yalnızca
 * bugün gerçekten entegre olan 6 sağlayıcı (INTEGRATIONS_REGISTRY.md,
 * CLAUDE.md) için tanımlı; resmi logo KULLANILMAZ (Açık Soru 2 varsayılanı).
 */
export const integrationAccent = {
  trendyol: '#F27A1A',
  hepsiburada: '#FF6000',
  n11: '#5B2D8E',
  pazarama: '#6A1B9A',
  ideasoft: '#0E4C92',
  bizimhesap: '#1B998B',
} as const

/**
 * `plugins/vuetify.ts`'teki tarihsel `baseColor`/`shadeColor(color, percent)`
 * türevi — legacy.ts'teki ~1976D2-mavi aile ve marka rengi (`#13255B`) bu
 * primitiflerden beslenir. `shadeColor` MANTIĞI (beyaza doğru karıştırma)
 * birebir korunur; değerler burada ÖNCEDEN HESAPLANMIŞ sabitler olarak
 * durur (kaynakta hâlâ fonksiyon vardı, token modülünde saf veri tercih
 * edildi — davranış/çıktı birebir aynı, doğrulama: theme-snapshot.baseline.json).
 */
export const brand = {
  primary: '#13255B',
  primaryLighten: '#4E5C84',
  primaryLightenMore: '#5A668C',
  selectedMenu: '#717C9D',
  borderColor: '#A1A8BD',
  borderColorLight: '#D5D8E1',
  cardHeader: '#E5E7ED',
  cardHeaderHover: '#D7DAE3',
  tableHeader: '#EEF0F4',
  tableHeaderHover: '#EAEBF0',
  cardHover: '#F1F2F5',
  card: '#ECEEF2',
  workplace: '#F3F4F7',
  loginForm: '#F8F8FA',
  light: '#FAFBFC',
} as const

// Bugünkü `plugins/vuetify.ts` düz renk anahtarları (aksiyon butonları,
// kabuk/appbar, dekoratif "amber/turquoise/teal" ailesi). Yalnızca
// legacy.ts'in "light = BUGÜNKÜ BİREBİR değer" ihtiyacı için primitif olarak
// tutulur.
export const accent = {
  amber: '#FFC107',
  amberLight: '#FFF8E1',
  turquoise: '#26C6DA',
  turquoiseDark: '#00838F',
  teal: '#009688',
  tealDark: '#00695C',
  smartSearch: '#EAEAFF',
  navigationButton: '#49A6D2',
  actionButton: '#1565C0',
  newButton: '#43A047',
  saveButton: '#E53935',
  deleteButton: '#B71C1C',
  updateButton: '#00897B',
  copyButton: '#F57F17',
  activeButton: '#57B570',
  chrome: '#1976D2',
  navigationDrawer: '#F9F9F9',
  worksheet: '#EEEEEE',
  textfield: '#FFFFFF',
  checkbox: '#DDDDDD',
  mainBackground: '#FFFFFF',
  danger: '#E53935',
} as const

// Dark tema — mevcut `plugins/vuetify.ts` `darkTheme.colors`'taki BİREBİR
// değerler (Aşama 0 sıfır-fark kanıtı için legacy.ts'in dark override'ları
// bu primitiflerden okur).
export const darkAccent = {
  appbar: '#222222',
  primary: '#111111',
  tab: '#2D2D2D',
  navigationDrawer: '#222222',
  pageToolBar: '#1B1B1B',
  mainBackground: '#111111',
  worksheet: '#1B1B1B',
  button: '#323232',
  textfield: '#333333',
  switch: '#FFFFFF',
  checkbox: '#DDDDDD',
  icon: '#1976D2',
} as const
