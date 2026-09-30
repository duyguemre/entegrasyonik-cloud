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
 * Kanal (pazaryeri/entegrasyon) MARKA renkleri — TEK KAYNAK (C1, 2026-09-30). Değerler kullanıcı onaylı
 * `docs/cloud-contracts/CHANNEL_BRAND_COLORS.md` tablosundan AYNEN (resmi ikon/logo ölçümü); değişiklik yalnız
 * o belge + bu dosya üzerinden. Kural: marka rengi DEĞİŞTİRİLMEZ — açık ton/tint TÜRETİLMEZ; yüzeyde yalnız
 * nokta, şerit, çip kenarı, logo zemini ya da dolgulu çip olarak doğrudan kullanılır. Dark temada da aynıdır.
 *   `brand`     — resmi birincil renk.
 *   `onBrand`   — marka zemininde METİN rengi: siyah/beyazdan ≥ 4.5:1 olanı (hesaplanmış; test korur).
 *   `secondary` — yalnız logo zemininde (N11 siyahı, Pazarama pembesi); başka yüzeyde kullanılmaz.
 *   `logoOnSecondary` — logo zemini ikincil renk, harf marka rengi (N11: resmi ikon siyah zemin + pembe). Yoksa
 *                  logo zemini marka rengi, harf `onBrand`, ikincil renk (varsa) alt kenarda 3px şerit (Pazarama).
 * Trendyol ile Hepsiburada bilinçli olarak YAKIN turuncudur (kullanıcı isteği) — kanal adı her zaman yazılır,
 * renk tek başına ayırt edici değildir. Shopify/WooCommerce: düşük güven (simple-icons), yalnız UI formu var.
 * Listede olmayan kanal → nötr (`.ek-ch-neutral`).
 */
export const channelPalette = {
  trendyol: { brand: '#FF6620', onBrand: '#000000' },
  hepsiburada: { brand: '#FF6000', onBrand: '#000000' },
  n11: { brand: '#FF44EE', onBrand: '#000000', secondary: '#1C1C1E', logoOnSecondary: true },
  pazarama: { brand: '#0137F3', onBrand: '#FFFFFF', secondary: '#FF008B' },
  ideasoft: { brand: '#391EE0', onBrand: '#FFFFFF' },
  bizimhesap: { brand: '#20554E', onBrand: '#FFFFFF' },
  shopify: { brand: '#7AB55C', onBrand: '#000000' },
  woocommerce: { brand: '#873EFF', onBrand: '#FFFFFF' },
} as const satisfies Record<string, { brand: string; onBrand: '#000000' | '#FFFFFF'; secondary?: string; logoOnSecondary?: true }>

export type ChannelCode = keyof typeof channelPalette

/**
 * Pazaryeri/entegrasyon marka vurgu rengi (ADR-0015 Karar 3.11) — `channelPalette.brand`'in
 * geri uyumlu görünümü (mağaza kayıtları `color` alanı). METİN rengi DEĞİLDİR.
 */
export const integrationAccent = Object.fromEntries(
  Object.entries(channelPalette).map(([code, tones]) => [code, tones.brand]),
) as { readonly [K in ChannelCode]: (typeof channelPalette)[K]['brand'] }

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

/* ==========================================================================
 * DS-v2 (tasarım sistemi v2, Aşama 1 — docs/design-reference/README.md brifi)
 * --------------------------------------------------------------------------
 * Aşağıdaki üç ölçek "workspace" (uygulama) profilinin primitifleridir.
 * Kural değişmedi: bu değerler YALNIZCA token dosyalarında (semantic.ts,
 * workspace.ts) kullanılır; bileşenler anlamsal `--ek-color-*` adlarını
 * tüketir. Ölçekler 50 (en açık) → 950 (en koyu) sıralıdır.
 * ========================================================================== */

/**
 * `ink` — nötr gri skalası. Lacivert markaya uyumlu, hafif soğuk (mavi-gri)
 * ton. Metin, kenarlık ve yüzey katmanlarının TEK nötr kaynağı. `slate`
 * (yukarıda) site profilinde kalır; uygulama profili `ink` kullanır.
 */
export const ink = {
  0: '#FFFFFF',
  50: '#F6F8FB',
  100: '#EDF0F5',
  150: '#E4E8EF',
  200: '#D9DFE8',
  300: '#C3CBD8',
  400: '#99A4B5',
  500: '#78859A',
  600: '#505C71',
  700: '#2F394B',
  800: '#1F2838',
  900: '#121A2B',
  950: '#0A0F1A',
} as const

/**
 * `navy` — marka (kimlik) skalası. 900 = logo laciverti (`brand.primary`,
 * #13255B). Header/sidebar kimlik tonları ve marka öğeleri buradan gelir;
 * aksiyon rengi DEĞİLDİR (aksiyon = `cobalt`).
 */
export const navy = {
  50: '#EEF2FA',
  100: '#DCE3F3',
  200: '#B9C6E6',
  300: '#8C9FD2',
  400: '#5F78BA',
  500: '#3E5AA0',
  600: '#2D4787',
  700: '#223A72',
  800: '#1A2F63',
  900: '#13255B',
  950: '#0B173D',
} as const

/**
 * `cobalt` — TEK vurgu (aksiyon) rengi skalası. Birincil düğme, etkin
 * gösterge, odak halkası, bağlantı ve seçim burada. Lacivert kimlikle aynı
 * aileden ama daha canlı: kimlik kabuğunun (navy) üzerinde ve açık
 * yüzeylerde "yapılacak ana iş" rengiyle hemen bulunur.
 * 600 beyaz metinle 6,2:1; 700 (hover) 8,2:1.
 */
export const cobalt = {
  50: '#EEF3FE',
  100: '#E1E9FC',
  200: '#C4D3F8',
  300: '#9BB3F1',
  400: '#6C8BE6',
  500: '#4A6BDD',
  600: '#2E55D4',
  700: '#2445B0',
  800: '#1E3A94',
  900: '#1B3276',
  950: '#121F48',
} as const

/**
 * Durum tonlarının DS-v2 tamamlayıcı adımları (mevcut `red/green/amberScale/
 * sky` nesneleri site profilinde kullanıldığı için DEĞİŞTİRİLMEZ; eksik
 * adımlar burada ayrı tutulur). `border` = subtle zemin üzerindeki çerçeve,
 * `emphasis` = subtle zemin üzerindeki koyu metin (AA ≥ 7:1 hedefi).
 */
export const statusSteps = {
  success: { 50: '#F0FDF4', 200: '#A7E3BC', 800: '#166534', 900: '#14532D' },
  warning: { 50: '#FFFBEB', 200: '#F3D58A', 800: '#92400E', 900: '#78350F' },
  error: { 50: '#FEF2F2', 200: '#F5B8B8', 800: '#991B1B', 900: '#7F1D1D' },
  info: { 50: '#F0F9FF', 200: '#A9D8F3', 800: '#075985', 900: '#0C4A6E' },
} as const

/**
 * Dark profil yüzeyleri ve durum dolguları (dark mode kapısı KAPALI —
 * ADR-0011 Karar 3; değerler token katmanında TAM tanımlıdır, TS tipi
 * zorlar). Koyu zeminde durum/aksiyon dolgusu açık tondadır; üzerindeki
 * metin (`*-contrast`) koyu `ink.950`'dir.
 */
export const inkDark = {
  canvas: '#0E131E',
  surface: '#151B28',
  raised: '#1B2231',
  muted: '#1A2130',
  sunken: '#111724',
  rail: '#0B0F18',
  sidebar: '#121826',
  chromeStart: '#0B1530',
  chromeEnd: '#132550',
  chromeRaised: '#1C2E5E',
  chromeBorder: '#2A3F78',
  borderSubtle: '#222B3B',
  borderDefault: '#2C3648',
  borderStrong: '#3D495E',
  borderInput: '#6D7A90',
  textStrong: '#EEF2F8',
  textDefault: '#CDD4E0',
  textMuted: '#A3AEC0',
  textSubtle: '#6D7A90',
} as const
