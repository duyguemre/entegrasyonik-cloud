/**
 * Tema denetleyicisi: ortak paketteki fabrika (`createThemeController`) backoffice anahtarıyla.
 * İlk kareyi public/theme-boot.js boyar; bu modül aynı kuralla devralır ve değişiklikleri uygular.
 */
import type { ThemeInstance } from 'vuetify'
import { THEME_STORAGE_KEYS, createThemeController, type ThemeMode, type ThemePreference } from '@entegrasyonik/ui/theme'

const controller = createThemeController(THEME_STORAGE_KEYS.backoffice)

export const themeMode = controller.mode
export const themePreference = controller.preference

export function initialThemeMode(): ThemeMode {
  return controller.initialMode()
}

export function bindTheme(theme: ThemeInstance) {
  controller.bind(theme)
}

export function setThemePreference(next: ThemePreference) {
  controller.setPreference(next)
}
