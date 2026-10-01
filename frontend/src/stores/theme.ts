/**
 * Müşteri uygulamasının tema denetleyicisi (FR2-DARK, ADR-0026 Karar 3). Ortak paketteki `createThemeController`
 * `ek-theme` anahtarıyla — backoffice ile AYNI kural. İlk kareyi `public/theme-boot.js` boyar; bu modül aynı
 * çözümle devralır (titreme yok), kullanıcı menüsündeki seçici `setPreference` çağırır.
 */
import { THEME_STORAGE_KEYS, createThemeController, type ThemeMode, type ThemePreference } from '@entegrasyonik/ui/theme'
import { useTheme } from 'vuetify'

export const appTheme = createThemeController(THEME_STORAGE_KEYS.app)

export type { ThemeMode, ThemePreference }

/** Kabuğun `provide('useThemeStore')` sözleşmesi (geriye uyumlu adlar). */
export default function useThemeStore() {
  const theme = useTheme()
  appTheme.bind(theme)

  function toggleTheme() {
    appTheme.setPreference(appTheme.mode.value === 'dark' ? 'light' : 'dark')
  }

  function getTheme() {
    return theme.global.name.value
  }

  function isDarkMode() {
    return appTheme.mode.value === 'dark'
  }

  return {
    mode: appTheme.mode,
    preference: appTheme.preference,
    setPreference: appTheme.setPreference,
    toggleTheme,
    getTheme,
    isDarkMode,
  }
}
