/**
 * frontend/src/design/tokens/legacy.ts
 *
 * ADR-0011 Karar 1 — bugünkü `plugins/vuetify.ts`'teki ~45 özel Vuetify
 * anahtarından `primary`/`info` DIŞINDAKİ 43'ü (bu ikisi Vuetify'ın kendi
 * semantik renk sözleşmesinin parçası olduğu için `semantic.ts`'e taşındı;
 * `danger` bir Vuetify çekirdek anahtarı OLMADIĞI için burada kalır — ADR
 * Karar 1: "danger ve info legacy'de kalır, değerleri `#` ile normalize
 * edilir" — `info` semantik tarafa taşındı, `danger` burada, ikisi de bu
 * dosyanın/`semantic.ts`'in ürettiği hex string'ler zaten `#` ile başlıyor).
 *
 * `LEGACY_TO_SEMANTIC_MAP` her eski anahtarın hedef semantik token'ını
 * belgeler (ekran göçünün "neye çevrilir" kılavuzu, ADR Karar 1). Dark
 * değerleri bu eşlemeden TÜRETİLİR — TEK istisna: bugün `darkTheme.colors`
 * içinde GERÇEKTEN var olan 12 anahtar (+ `danger`) — bunlar Aşama 0
 * sıfır-fark kısıtı gereği bugünkü BİREBİR dark değeriyle EZİLİR
 * (`DARK_ZERO_DIFF_OVERRIDES`); aksi halde `vuetify-theme.ts`'in ürettiği
 * canlı dark tema, T1a'nın `theme-snapshot.baseline.json`'ından sapar.
 */
import { brand, accent, red } from './palette'
import { semanticColorsDark, type SemanticColorKey } from './semantic'

export type LegacyColorKey =
  | 'primaryLighten'
  | 'primaryLightenMore'
  | 'processButtonColor'
  | 'passiveColor'
  | 'selectedMenuColor'
  | 'borderColor'
  | 'borderColorLight'
  | 'cardComponentHeaderColor'
  | 'cardComponentHeaderHoverColor'
  | 'tableHeaderColor'
  | 'tableHeaderHoverColor'
  | 'cardComponentHoverColor'
  | 'cardComponentColor'
  | 'workplaceColor'
  | 'loginForm'
  | 'lightColor'
  | 'amber'
  | 'amber-light'
  | 'turquoise'
  | 'turquoise-dark'
  | 'teal'
  | 'teal-dark'
  | 'smartSearchColor'
  | 'navigationButtonColor'
  | 'actionButtonColor'
  | 'newButtonColor'
  | 'saveButtonColor'
  | 'deleteButtonColor'
  | 'updateButtonColor'
  | 'copyButtonColor'
  | 'activeButtonColor'
  | 'appbarColor'
  | 'tabColor'
  | 'navigationDrawer'
  | 'pageToolBar'
  | 'mainBackground'
  | 'worksheetColor'
  | 'buttonColor'
  | 'textfieldColor'
  | 'switchColor'
  | 'checkboxColor'
  | 'iconColor'
  | 'danger'

/** light = BUGÜNKÜ BİREBİR değer (`plugins/vuetify.ts` `lightTheme.colors`). */
export const legacyColorsLight: Record<LegacyColorKey, string> = {
  primaryLighten: brand.primaryLighten,
  primaryLightenMore: brand.primaryLightenMore,
  processButtonColor: brand.primaryLightenMore,
  passiveColor: brand.primaryLightenMore,
  selectedMenuColor: brand.selectedMenu,
  borderColor: brand.borderColor,
  borderColorLight: brand.borderColorLight,
  cardComponentHeaderColor: brand.cardHeader,
  cardComponentHeaderHoverColor: brand.cardHeaderHover,
  tableHeaderColor: brand.tableHeader,
  tableHeaderHoverColor: brand.tableHeaderHover,
  cardComponentHoverColor: brand.cardHover,
  cardComponentColor: brand.card,
  workplaceColor: brand.workplace,
  loginForm: brand.loginForm,
  lightColor: brand.light,
  amber: accent.amber,
  'amber-light': accent.amberLight,
  turquoise: accent.turquoise,
  'turquoise-dark': accent.turquoiseDark,
  teal: accent.teal,
  'teal-dark': accent.tealDark,
  smartSearchColor: accent.smartSearch,
  navigationButtonColor: accent.navigationButton,
  actionButtonColor: accent.actionButton,
  newButtonColor: accent.newButton,
  saveButtonColor: accent.saveButton,
  deleteButtonColor: accent.deleteButton,
  updateButtonColor: accent.updateButton,
  copyButtonColor: accent.copyButton,
  activeButtonColor: accent.activeButton,
  appbarColor: accent.chrome,
  tabColor: accent.chrome,
  navigationDrawer: accent.navigationDrawer,
  pageToolBar: accent.navigationDrawer,
  mainBackground: accent.mainBackground,
  worksheetColor: accent.worksheet,
  buttonColor: accent.chrome,
  textfieldColor: accent.textfield,
  switchColor: accent.chrome,
  checkboxColor: accent.chrome,
  iconColor: accent.chrome,
  // ADR-0015 Karar 3.3 — "danger (+ legacy `danger` eşlemesi)": legacy
  // `danger` artık yeni `error` tonuyla (red-700) aynı değeri kullanır (tek
  // anlamsal palet ilkesi); eski `accent.danger` (#E53935, AA-altı) KASITLI
  // olarak terk edilir (T1a ters çevirme, A1).
  danger: red[700],
}

/** Her eski anahtarın hedef semantik token'ı — ekran göçü kılavuzu. */
export const LEGACY_TO_SEMANTIC_MAP: Record<LegacyColorKey, SemanticColorKey> = {
  primaryLighten: 'content-muted',
  primaryLightenMore: 'content-muted',
  processButtonColor: 'content-muted',
  passiveColor: 'content-muted',
  selectedMenuColor: 'primary-darken-1',
  borderColor: 'border-default',
  borderColorLight: 'border-default',
  cardComponentHeaderColor: 'surface-muted',
  cardComponentHeaderHoverColor: 'surface-muted',
  tableHeaderColor: 'surface-muted',
  tableHeaderHoverColor: 'surface-muted',
  cardComponentHoverColor: 'surface-muted',
  cardComponentColor: 'surface-muted',
  workplaceColor: 'background',
  loginForm: 'surface',
  lightColor: 'surface-light',
  amber: 'warning',
  'amber-light': 'warning-subtle',
  turquoise: 'info',
  'turquoise-dark': 'info',
  teal: 'success',
  'teal-dark': 'success',
  smartSearchColor: 'surface-muted',
  navigationButtonColor: 'primary',
  actionButtonColor: 'primary',
  newButtonColor: 'success',
  saveButtonColor: 'error',
  deleteButtonColor: 'error',
  updateButtonColor: 'success',
  copyButtonColor: 'warning',
  activeButtonColor: 'success',
  appbarColor: 'primary',
  tabColor: 'primary',
  navigationDrawer: 'surface',
  pageToolBar: 'surface',
  mainBackground: 'background',
  worksheetColor: 'surface-muted',
  buttonColor: 'primary',
  textfieldColor: 'surface',
  switchColor: 'primary',
  checkboxColor: 'primary',
  iconColor: 'primary',
  danger: 'error',
}

/**
 * Aşama 0 sıfır-fark kısıtı: bugün `darkTheme.colors` içinde GERÇEKTEN var
 * olan anahtarlar (ADR Bağlam madde 5 / T1a testi — `darkTheme` 26 anahtar,
 * bunun 12'si bu legacy anahtarları + `danger`). Bu anahtarların dark değeri
 * `LEGACY_TO_SEMANTIC_MAP` türetmesi yerine bugünkü BİREBİR değerle sabitlenir.
 */
const DARK_ZERO_DIFF_OVERRIDES: Partial<Record<LegacyColorKey, string>> = {
  appbarColor: '#222222',
  tabColor: '#2D2D2D',
  navigationDrawer: '#222222',
  pageToolBar: '#1B1B1B',
  mainBackground: '#111111',
  worksheetColor: '#1B1B1B',
  buttonColor: '#323232',
  textfieldColor: '#333333',
  switchColor: '#FFFFFF',
  checkboxColor: '#DDDDDD',
  iconColor: '#1976D2',
  danger: '#E53935',
}

function buildLegacyColorsDark(): Record<LegacyColorKey, string> {
  const result = {} as Record<LegacyColorKey, string>
  for (const key of Object.keys(LEGACY_TO_SEMANTIC_MAP) as LegacyColorKey[]) {
    const override = DARK_ZERO_DIFF_OVERRIDES[key]
    result[key] = override ?? semanticColorsDark[LEGACY_TO_SEMANTIC_MAP[key]]
  }
  return result
}

/**
 * dark = eşlendiği semantik token'ın dark değeri (Karar 1), EZİLEN 12
 * anahtar hariç (yukarı bkz. `DARK_ZERO_DIFF_OVERRIDES`). Bu, TOKEN
 * KAYNAĞINDAKİ tam (43 anahtarlı) kayıttır — "token katmanında TAM
 * tanımlanır" (Karar 3) gereğini TS tipi düzeyinde karşılar.
 *
 * **Bu kaydın TAMAMI canlı Vuetify temasına KABLOLANMAZ.** Bugün
 * `darkTheme.colors` yalnızca 12 legacy anahtar (+ `danger`) içeriyor;
 * kalan 31 anahtar dark'ta HİÇ TANIMLI DEĞİL (T1a testi, "GİZLİ DAVRANIŞ").
 * Bu 31 anahtarı da canlı temaya eklemek `darkTheme.colors`'ın anahtar
 * SAYISINI artırır → T1a'nın karakterizasyon testi (`toEqual` + tam anahtar
 * sayısı) KIRILIR. `vuetify-theme.ts` bu yüzden yalnızca
 * `DARK_ZERO_DIFF_OVERRIDES`'taki 12 anahtarı (bugün zaten var olanları)
 * canlı `darkTheme.colors`'a kablolar; kalan 31'i (bu kayıtta hazır) canlı
 * temaya eklemek — dark mode kapısı açılırken (Karar 3) veya ilgili legacy
 * anahtarı kullanan ekran taşınırken (Karar 2) — ayrı, bilinçli bir commit'tir.
 */
export const legacyColorsDark: Record<LegacyColorKey, string> = buildLegacyColorsDark()

/** Bugün `darkTheme.colors` içinde GERÇEKTEN var olan legacy anahtarları — `vuetify-theme.ts` yalnızca bunları kablolar (Aşama 0 sıfır-fark kısıtı). */
export const DARK_WIRED_LEGACY_KEYS = Object.keys(
  DARK_ZERO_DIFF_OVERRIDES,
) as LegacyColorKey[]
