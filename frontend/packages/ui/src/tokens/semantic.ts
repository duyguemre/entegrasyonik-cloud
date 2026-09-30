/**
 * frontend/src/design/tokens/semantic.ts
 *
 * ADR-0011 Karar 1 — semantik renk anahtarları. SAF TS (vue/vuetify/`@/`
 * import'u YASAK). `Record<SemanticColorKey, string>` tipi light/dark anahtar
 * kümesi eşitliğini DERLEME ZAMANINDA zorlar (iki sabiti de aynı tip
 * imzasıyla tanımlamak, bir anahtarı unutmayı TS hatasına çevirir).
 *
 * **ADR-0015 Karar 5.2 (A1) — ADR-0011'i değiştirir:** Aşama 0'da yalnızca
 * bir alt küme (`CoreSemanticColorKey`) canlı Vuetify temasına kablanıyordu.
 * A1'den itibaren `vuetify-theme.ts` TÜM semantik anahtarları (Core + New,
 * light + dark) canlı temaya kablar — bu dosyadaki ayrım artık yalnızca
 * "Vuetify'ın kendi çekirdek renk sözleşmesinin parçası mı" (Core) yoksa
 * "ADR-0011/0015'in eklediği yeni anahtar mı" (New) sorusuna karşılık gelir,
 * "canlı temaya kablı mı" sorusuna DEĞİL (ikisi de kablıdır).
 */
import {
  slate,
  red,
  green,
  amberScale,
  sky,
  brand,
  darkAccent,
  statusDark,
  ink,
  navy,
  cobalt,
  statusSteps,
  inkDark,
} from './palette'

/**
 * Çekirdek (Vuetify'ın kendi semantik renk sözleşmesindeki) anahtarlar.
 * Light başlangıç değerleri "bugünkü efektif değerler" (Vuetify varsayılanı
 * + `plugins/vuetify.ts`'te override edilen `primary`); dark başlangıç
 * değerleri de aynı şekilde bugünkü efektif (override edilmemişse Vuetify
 * varsayılan dark) değerlerdir — `theme-snapshot.baseline.json` ile
 * doğrulandı, sıfır-fark için DEĞİŞTİRİLMEZ.
 */
export type CoreSemanticColorKey =
  | 'background'
  | 'surface'
  | 'surface-bright'
  | 'surface-light'
  | 'surface-variant'
  | 'primary'
  | 'primary-darken-1'
  | 'secondary'
  | 'secondary-darken-1'
  | 'error'
  | 'info'
  | 'success'
  | 'warning'

/**
 * Yeni semantik anahtarlar (ADR-0011 Karar 1 tablosu + ADR-0015 Karar 3.3/3.7
 * ekleri: `neutral`/`neutral-subtle` — 5. durum tonu — ve `border-input` —
 * form alanı kenarlığı, `surface` üzerinde ≥3:1, WCAG 1.4.11). A1'den
 * itibaren `vuetify-theme.ts` bu anahtarların TAMAMINI canlı Vuetify
 * temasına kablar (Karar 5.2).
 */
export type NewSemanticColorKey =
  | 'surface-muted'
  | 'surface-sunken'
  | 'border-default'
  | 'border-strong'
  | 'border-input'
  | 'content-strong'
  | 'content-default'
  | 'content-muted'
  | 'content-subtle'
  | 'error-subtle'
  | 'success-subtle'
  | 'warning-subtle'
  | 'info-subtle'
  | 'neutral'
  | 'neutral-subtle'

/**
 * DS-v2 (Aşama 1) anahtarları — workspace (uygulama) profilinin rolleri.
 * Kullanım amaçlarının TEK kaynağı `roles.ts`'tir (vitrin ve
 * DESIGN_SYSTEM.md oradan okunur). Site bu anahtarları kullanmaz; değerleri
 * her iki çıktıda (`tokens.app.css`, `tokens.static.css`) aynıdır.
 */
export type WorkspaceColorKey =
  // Yüzey katmanları
  | 'app-bg'
  | 'surface-raised'
  | 'surface-inverse'
  | 'scrim'
  // Kimlik kabuğu (header) — degrade başlangıç/bitiş + üzerindeki öğeler
  | 'chrome'
  | 'chrome-end'
  | 'chrome-raised'
  | 'chrome-border'
  | 'chrome-text'
  | 'chrome-text-muted'
  // Sidebar
  | 'sidebar-bg'
  | 'sidebar-border'
  | 'sidebar-section'
  | 'sidebar-text'
  | 'sidebar-hover'
  | 'sidebar-active'
  // Workspace sekmeleri
  | 'tabstrip-bg'
  | 'tab-hover'
  | 'tab-active'
  // Metin / kenarlık tamamlayıcıları
  | 'content-inverse'
  | 'border-subtle'
  | 'border-focus'
  // Aksiyon (TEK vurgu rengi)
  | 'action'
  | 'action-hover'
  | 'action-active'
  | 'action-subtle'
  | 'action-border'
  | 'action-emphasis'
  | 'action-contrast'
  // Durum tonlarının tamamlayıcıları (subtle zaten var)
  | 'success-border'
  | 'success-emphasis'
  | 'success-contrast'
  | 'warning-border'
  | 'warning-emphasis'
  | 'warning-contrast'
  | 'error-border'
  | 'error-emphasis'
  | 'error-contrast'
  | 'info-border'
  | 'info-emphasis'
  | 'info-contrast'
  | 'neutral-border'
  | 'neutral-emphasis'
  | 'neutral-contrast'
  // Marka ve seçim
  | 'brand'
  | 'selection'
  | 'highlight'

export type SemanticColorKey = CoreSemanticColorKey | NewSemanticColorKey | WorkspaceColorKey

/** DS-v2 light değerleri (workspace profili). */
export const workspaceColorsLight: Record<WorkspaceColorKey, string> = {
  'app-bg': ink[100],
  'surface-raised': ink[0],
  'surface-inverse': ink[800],
  scrim: ink[950],
  chrome: navy[900],
  'chrome-end': navy[600],
  'chrome-raised': navy[800],
  'chrome-border': navy[600],
  'chrome-text': ink[0],
  'chrome-text-muted': navy[200],
  'sidebar-bg': ink[50],
  'sidebar-border': ink[200],
  'sidebar-section': navy[500],
  'sidebar-text': ink[700],
  'sidebar-hover': ink[150],
  'sidebar-active': cobalt[100],
  // Aşama 5: şerit bir kademe koyu (ink-200) → etkin sekme (= içerik zemini ink-100) çok daha belirgin öne çıkar;
  // pasif hover şeritten açık (ink-150), etkinden koyu — "öne gelme" sırası tek yönde.
  'tabstrip-bg': ink[200],
  'tab-hover': ink[150],
  'tab-active': ink[100],
  'content-inverse': ink[0],
  'border-subtle': ink[150],
  'border-focus': cobalt[600],
  action: cobalt[600],
  'action-hover': cobalt[700],
  'action-active': cobalt[800],
  'action-subtle': cobalt[50],
  'action-border': cobalt[200],
  'action-emphasis': cobalt[800],
  'action-contrast': ink[0],
  'success-border': statusSteps.success[200],
  'success-emphasis': statusSteps.success[800],
  'success-contrast': ink[0],
  'warning-border': statusSteps.warning[200],
  'warning-emphasis': statusSteps.warning[800],
  'warning-contrast': ink[0],
  'error-border': statusSteps.error[200],
  'error-emphasis': statusSteps.error[800],
  'error-contrast': ink[0],
  'info-border': statusSteps.info[200],
  'info-emphasis': statusSteps.info[800],
  'info-contrast': ink[0],
  'neutral-border': ink[300],
  'neutral-emphasis': ink[800],
  'neutral-contrast': ink[0],
  brand: navy[900],
  selection: cobalt[50],
  highlight: amberScale[100],
}

/** DS-v2 dark değerleri (dark mode kapısı kapalı; TAM tanımlı — ADR-0011 Karar 3). */
export const workspaceColorsDark: Record<WorkspaceColorKey, string> = {
  'app-bg': inkDark.canvas,
  'surface-raised': inkDark.raised,
  'surface-inverse': inkDark.textStrong,
  scrim: ink[950],
  chrome: inkDark.chromeStart,
  'chrome-end': inkDark.chromeEnd,
  'chrome-raised': inkDark.chromeRaised,
  'chrome-border': inkDark.chromeBorder,
  'chrome-text': inkDark.textStrong,
  'chrome-text-muted': navy[200],
  'sidebar-bg': inkDark.sidebar,
  'sidebar-border': inkDark.borderSubtle,
  'sidebar-section': navy[300],
  'sidebar-text': inkDark.textDefault,
  'sidebar-hover': inkDark.raised,
  'sidebar-active': cobalt[950],
  'tabstrip-bg': inkDark.rail,
  'tab-hover': inkDark.muted,
  'tab-active': inkDark.canvas,
  'content-inverse': ink[950],
  'border-subtle': inkDark.borderSubtle,
  'border-focus': cobalt[400],
  action: cobalt[400],
  'action-hover': cobalt[300],
  'action-active': cobalt[200],
  'action-subtle': cobalt[950],
  'action-border': cobalt[800],
  'action-emphasis': cobalt[200],
  'action-contrast': ink[950],
  'success-border': green[950],
  'success-emphasis': statusDark.successText,
  'success-contrast': ink[950],
  'warning-border': amberScale[950],
  'warning-emphasis': statusDark.warningText,
  'warning-contrast': ink[950],
  'error-border': red[900],
  'error-emphasis': statusDark.dangerText,
  'error-contrast': ink[950],
  'info-border': sky[950],
  'info-emphasis': statusDark.infoText,
  'info-contrast': ink[950],
  'neutral-border': inkDark.borderStrong,
  'neutral-emphasis': inkDark.textStrong,
  'neutral-contrast': ink[950],
  brand: navy[300],
  selection: cobalt[950],
  highlight: amberScale[950],
}

export const semanticColorsLight: Record<SemanticColorKey, string> = {
  // Çekirdek — bugünkü efektif değerler, DURUM RENKLERİ HARİÇ (değiştirilmez,
  // bkz. yukarı yorum). `error`/`info`/`success`/`warning`: ADR-0015 Karar
  // 3.3 — WCAG AA (≥4.5:1) durum paleti, ADR-0011 Açık Soru 4 KARARI (A1).
  // Bugünkü AA-altı değerler: error #B00020 (2,54:1 subtle üzerinde değil,
  // ama metin için yetersiz), info #00ACC1 (2,74:1), success #4CAF50
  // (2,78:1), warning #FB8C00 (2,37:1) — T1a tema anlık görüntüsü bu
  // değişiklikle KASITLI olarak ters çevrilir (bkz. theme-snapshot.baseline.json).
  background: '#FFFFFF',
  surface: '#FFFFFF',
  'surface-bright': '#FFFFFF',
  'surface-light': '#EEEEEE',
  'surface-variant': '#424242',
  primary: brand.primary,
  'primary-darken-1': '#1F5592',
  secondary: '#48A9A6',
  'secondary-darken-1': '#018786',
  error: red[700], // #B91C1C — 5,30:1 (metin), 6,47:1 (beyaz/dolgu)
  info: sky[700], // #0369A1 — 5,17:1 / 5,93:1
  success: green[700], // #15803D — 4,57:1 / 5,02:1
  warning: amberScale[700], // #B45309 — 4,51:1 / 5,02:1 (sınırda, token-unit testiyle zorlanır)
  // Yeni — ADR-0011 Karar 1 tablosu (slate ölçeği + durum "subtle" tonları)
  // + ADR-0015 Karar 3.3/3.7 (`neutral(-subtle)`, `border-input`).
  'surface-muted': slate[50],
  'surface-sunken': slate[100],
  'border-default': slate[200],
  'border-strong': slate[300],
  'border-input': slate[500], // ≥3:1 üzerinde `surface` (WCAG 1.4.11) — token-unit testiyle doğrulanır
  'content-strong': slate[900],
  'content-default': slate[700],
  'content-muted': slate[500],
  'content-subtle': slate[400],
  'error-subtle': red[100],
  'success-subtle': green[100],
  'warning-subtle': amberScale[100],
  'info-subtle': sky[100],
  neutral: slate[600], // #475569 — 6,92:1 / 7,58:1
  'neutral-subtle': slate[100], // #F1F5F9
  // DS-v2 anahtarları (site kullanmaz; değer workspace profiliyle aynı)
  ...workspaceColorsLight,
}

export const semanticColorsDark: Record<SemanticColorKey, string> = {
  // Çekirdek — ADR-0015 Karar 5.2 (A1): dark mode KAPISI hâlâ kapalı
  // (kullanıcı anahtarı yok, ADR-0011 Karar 3), ama semantik anahtarların
  // dark değeri artık TAM tanımlanır VE canlı temaya kablanır (T1a
  // karakterizasyonu bu yüzden KASITLI olarak ters çevrilir). Durum
  // renkleri `palette.ts`'teki `statusDark` (koyu zeminde okunaklı 400
  // tonları) kaynağından gelir; diğer çekirdek anahtarlar (background/
  // surface/primary vb.) bugünkü Vuetify varsayılan dark değerleriyle
  // DEĞİŞMEDEN kalır (dark mode kapısı açılana kadar ince ayar B/C'ye kalır).
  background: '#121212',
  surface: '#212121',
  'surface-bright': '#CCBFD6',
  'surface-light': '#424242',
  'surface-variant': '#C8C8C8',
  primary: darkAccent.primary,
  'primary-darken-1': '#277CC1',
  secondary: '#54B6B2',
  'secondary-darken-1': '#48A9A6',
  error: statusDark.dangerText,
  info: statusDark.infoText,
  success: statusDark.successText,
  warning: statusDark.warningText,
  // Yeni — ADR-0011 Karar 1 tablosu + ADR-0015 Karar 3.3/3.7 ekleri. A1'den
  // itibaren canlı temaya kablı (Karar 5.2); ilk dark değerleri, dark mode
  // kapısı açılırken/P1-P2 ekranları taşınırken görsel olarak doğrulanacak.
  'surface-muted': '#1E293B',
  'surface-sunken': '#182230',
  'border-default': slate[700],
  'border-strong': slate[600],
  'border-input': slate[400],
  'content-strong': slate[50],
  'content-default': slate[200],
  'content-muted': slate[400],
  'content-subtle': slate[500],
  'error-subtle': red[950],
  'success-subtle': green[950],
  'warning-subtle': amberScale[950],
  'info-subtle': sky[950],
  neutral: slate[400],
  'neutral-subtle': slate[800],
  ...workspaceColorsDark,
}
