/**
 * İki uygulamanın ortak Vuetify tema tanımları — aynı token seti (ADR-0026 Karar 3.1).
 *
 * light: uygulamadaki `frontend/src/design/vuetify-theme.ts` ile birebir aynı değerler.
 * dark : TAM set — semantik (workspace) dark kaydı + 43 legacy anahtarın TAMAMI, legacy→DS-v2 rol eşlemesinden
 *        (`LEGACY_TO_WORKSPACE_MAP`) dark değerlerle türetilir. Uygulamadaki `darkTheme` bugün legacy'de
 *        `DARK_WIRED_LEGACY_KEYS` ile sınırlı (dark kapısı kapalı); uygulama Aşama 1a'da bu tanıma geçer.
 */
import {
  appSemanticColorsDark,
  appSemanticColorsLight,
  legacyColorsWorkspaceLight,
  LEGACY_TO_WORKSPACE_MAP,
  type LegacyColorKey,
} from '../tokens'

export type ThemeMode = 'light' | 'dark'

export interface EkThemeDefinition {
  dark: boolean
  colors: Record<string, string>
}

/** Vuetify tema adları — uygulamadaki adlarla aynı (tek adaptör, iki tüketici). */
export const THEME_NAMES: Record<ThemeMode, string> = { light: 'lightTheme', dark: 'darkTheme' }

export const legacyColorsWorkspaceDark = Object.fromEntries(
  (Object.keys(LEGACY_TO_WORKSPACE_MAP) as LegacyColorKey[]).map((key) => [key, appSemanticColorsDark[LEGACY_TO_WORKSPACE_MAP[key]]]),
) as Record<LegacyColorKey, string>

export const lightTheme: EkThemeDefinition = {
  dark: false,
  colors: { ...appSemanticColorsLight, ...legacyColorsWorkspaceLight },
}

export const darkTheme: EkThemeDefinition = {
  dark: true,
  colors: { ...appSemanticColorsDark, ...legacyColorsWorkspaceDark },
}
