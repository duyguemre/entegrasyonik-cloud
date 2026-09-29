/**
 * frontend/src/design/tokens/workspace.ts
 *
 * DS-v2 (Aşama 1) — "workspace" (web uygulaması) renk profili. SAF TS
 * (vue/vuetify/`@/` import'u YASAK).
 *
 * **Neden ayrı bir profil?** `semantic.ts`'teki çekirdek anahtarların
 * (`background`, `surface-*`, `content-*`, `border-*`, `primary` …) değerleri
 * tanıtım sitesi tarafından `tokens.static.css` üzerinden yüzlerce yerde
 * kullanılıyor (ADR-0015 Karar 1.3 "sitenin kullandığı anahtarların değeri
 * değiştirilmez"). Uygulama ise yeni tasarım dilinde (tonlu zemin, tek vurgu
 * rengi, kimlik kabuğu) bu anahtarlara FARKLI değer ister. Çözüm:
 *   - `tokens.static.css` (site) → `semanticColorsLight/Dark` (değişmedi)
 *   - Vuetify teması (uygulama) → `appSemanticColorsLight/Dark` =
 *     semantik kayıt + aşağıdaki `WORKSPACE_OVERRIDES_*`
 * `tokens.app.css` renkleri `rgb(var(--v-theme-<key>))` ile Vuetify'a
 * bağladığı için uygulamadaki her `--ek-color-*` otomatik olarak workspace
 * değerini alır; ADLAR aynıdır (geriye uyumluluk — hiçbir ad kaldırılmadı).
 *
 * Legacy (camelCase, eski `plugins/vuetify.ts`) anahtarları da uygulamada
 * DS-v2 rollerine eşlenir (`LEGACY_TO_WORKSPACE_MAP`) — eski ekranlar yeni
 * paletin değerlerini TOKEN ÜZERİNDEN alır; kaynak kodlarına dokunulmaz.
 * Site için legacy değerleri (`legacyColorsLight`) aynen kalır.
 */
import { ink, cobalt, inkDark } from './palette'
import {
  semanticColorsLight,
  semanticColorsDark,
  type SemanticColorKey,
} from './semantic'
import {
  legacyColorsDark,
  DARK_WIRED_LEGACY_KEYS,
  type LegacyColorKey,
} from './legacy'

/**
 * Uygulamada değeri değişen PAYLAŞILAN anahtarlar (light). Burada olmayan her
 * anahtar `semanticColorsLight` değerini korur (durum renkleri, secondary …).
 */
export const WORKSPACE_OVERRIDES_LIGHT: Partial<Record<SemanticColorKey, string>> = {
  // Yüzeyler — "ağırlıklı beyazı azalt": zemin tonlu, kart beyaz.
  background: ink[100],
  'surface-light': ink[100],
  'surface-variant': ink[800], // Vuetify: tooltip zemini (ters yüzey)
  'surface-muted': ink[50],
  'surface-sunken': '#F1F4F8', // ink 50 ile 100 arası "çukur" (input kuyusu, filtre paneli)
  // Kenarlık
  'border-default': ink[200],
  'border-strong': ink[300],
  'border-input': ink[500],
  // Metin (tonlu zeminde de AA: bkz. tests/theme/ds-v2-contrast.test.ts)
  'content-strong': ink[900],
  'content-default': ink[700],
  'content-muted': ink[600],
  'content-subtle': ink[400],
  // Tek vurgu rengi: uygulamadaki `primary` = aksiyon (cobalt). Marka
  // laciverti `brand` anahtarındadır (logo, kimlik kabuğu).
  primary: cobalt[600],
  'primary-darken-1': cobalt[700],
  // Nötr durum tonu `ink` ailesine hizalanır.
  neutral: ink[600],
  'neutral-subtle': ink[100],
}

export const WORKSPACE_OVERRIDES_DARK: Partial<Record<SemanticColorKey, string>> = {
  background: inkDark.canvas,
  surface: inkDark.surface,
  'surface-bright': inkDark.raised,
  'surface-light': inkDark.muted,
  'surface-variant': inkDark.textStrong,
  'surface-muted': inkDark.muted,
  'surface-sunken': inkDark.sunken,
  'border-default': inkDark.borderDefault,
  'border-strong': inkDark.borderStrong,
  'border-input': inkDark.borderInput,
  'content-strong': inkDark.textStrong,
  'content-default': inkDark.textDefault,
  'content-muted': inkDark.textMuted,
  'content-subtle': inkDark.textSubtle,
  primary: cobalt[400],
  'primary-darken-1': cobalt[300],
  neutral: inkDark.textMuted,
  'neutral-subtle': inkDark.muted,
}

/** Uygulamanın (Vuetify teması) çözülmüş semantik renk kaydı — light. */
export const appSemanticColorsLight: Record<SemanticColorKey, string> = {
  ...semanticColorsLight,
  ...WORKSPACE_OVERRIDES_LIGHT,
}

/** Uygulamanın (Vuetify teması) çözülmüş semantik renk kaydı — dark. */
export const appSemanticColorsDark: Record<SemanticColorKey, string> = {
  ...semanticColorsDark,
  ...WORKSPACE_OVERRIDES_DARK,
}

/**
 * Eski (legacy) anahtar → DS-v2 rolü. Uygulamada eski anahtarların DEĞERİ bu
 * rolün workspace değeridir (ADI korunur). Bu tablo aynı zamanda Aşama 2
 * ekran göçünün "neye çevrilir" kılavuzudur (DESIGN_SYSTEM.md §Envanter).
 * `legacy.ts`'teki `LEGACY_TO_SEMANTIC_MAP` (ADR-0011) site/dark tarafında
 * geçerli kalır; burası onun DS-v2 karşılığıdır.
 */
export const LEGACY_TO_WORKSPACE_MAP: Record<LegacyColorKey, SemanticColorKey> = {
  primaryLighten: 'content-muted',
  primaryLightenMore: 'content-muted',
  processButtonColor: 'neutral',
  passiveColor: 'content-muted',
  selectedMenuColor: 'sidebar-active',
  borderColor: 'border-default',
  borderColorLight: 'border-subtle',
  cardComponentHeaderColor: 'surface-muted',
  cardComponentHeaderHoverColor: 'surface-sunken',
  tableHeaderColor: 'surface-muted',
  tableHeaderHoverColor: 'surface-sunken',
  cardComponentHoverColor: 'surface-muted',
  cardComponentColor: 'surface-muted',
  workplaceColor: 'app-bg',
  loginForm: 'surface',
  lightColor: 'surface-muted',
  amber: 'warning',
  'amber-light': 'warning-subtle',
  turquoise: 'info',
  'turquoise-dark': 'info-emphasis',
  teal: 'success',
  'teal-dark': 'success-emphasis',
  smartSearchColor: 'surface-sunken',
  navigationButtonColor: 'action',
  actionButtonColor: 'action',
  newButtonColor: 'action',
  saveButtonColor: 'action',
  deleteButtonColor: 'error',
  updateButtonColor: 'action',
  copyButtonColor: 'neutral',
  activeButtonColor: 'success',
  appbarColor: 'chrome',
  tabColor: 'action',
  navigationDrawer: 'sidebar-bg',
  pageToolBar: 'surface-muted',
  mainBackground: 'app-bg',
  worksheetColor: 'surface-muted',
  buttonColor: 'action',
  textfieldColor: 'surface',
  switchColor: 'action',
  checkboxColor: 'action',
  iconColor: 'action',
  danger: 'error',
}

function buildLegacyWorkspaceLight(): Record<LegacyColorKey, string> {
  const result = {} as Record<LegacyColorKey, string>
  for (const key of Object.keys(LEGACY_TO_WORKSPACE_MAP) as LegacyColorKey[]) {
    result[key] = appSemanticColorsLight[LEGACY_TO_WORKSPACE_MAP[key]]
  }
  return result
}

/** Uygulamada (Vuetify light) legacy anahtarlarının DS-v2 değerleri. */
export const legacyColorsWorkspaceLight: Record<LegacyColorKey, string> = buildLegacyWorkspaceLight()

/**
 * Dark tarafta legacy kablolaması DEĞİŞMEZ (dark mode kapısı kapalı,
 * `DARK_WIRED_LEGACY_KEYS` — ADR-0015 Karar 5.2); yalnızca bugün kablolu 12
 * anahtar, `legacy.ts`'teki değerleriyle.
 */
export const legacyColorsWorkspaceDarkWired: Partial<Record<LegacyColorKey, string>> = Object.fromEntries(
  DARK_WIRED_LEGACY_KEYS.map((key) => [key, legacyColorsDark[key]]),
)
