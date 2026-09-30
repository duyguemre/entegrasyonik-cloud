/**
 * Tema denetleyicisi: ortak paketteki tercih kuralları + Vuetify tema adı + html öznitelikleri tek yerde.
 * İlk kareyi public/theme-boot.js boyar; bu modül aynı kuralla devralır ve değişiklikleri uygular.
 */
import { computed, ref } from 'vue'
import type { ThemeInstance } from 'vuetify'
import {
  THEME_NAMES,
  THEME_STORAGE_KEYS,
  applyThemeToDocument,
  queryOverride,
  readPreference,
  resolveTheme,
  systemPrefersDark,
  writePreference,
  type ThemeMode,
  type ThemePreference,
} from '@entegrasyonik/ui/theme'

const KEY = THEME_STORAGE_KEYS.backoffice
const preference = ref<ThemePreference>(readPreference(KEY))
const prefersDark = ref(systemPrefersDark())
const override = typeof location === 'undefined' ? null : queryOverride(location.search)

export const themeMode = computed<ThemeMode>(() => resolveTheme(preference.value, prefersDark.value, override))
export const themePreference = computed(() => preference.value)

let vuetifyTheme: ThemeInstance | null = null

function apply() {
  applyThemeToDocument(themeMode.value)
  if (vuetifyTheme) vuetifyTheme.global.name.value = THEME_NAMES[themeMode.value]
}

export function initialThemeMode(): ThemeMode {
  return themeMode.value
}

export function bindTheme(theme: ThemeInstance) {
  vuetifyTheme = theme
  apply()
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    prefersDark.value = e.matches
    apply()
  })
}

export function setThemePreference(next: ThemePreference) {
  preference.value = next
  writePreference(KEY, next)
  apply()
}
