/**
 * Tema denetleyicisi fabrikası (ADR-0026 Karar 3.3-3.5): tercih (`system/light/dark`) + `?theme=` geçersiz kılması +
 * sistem tercihi dinleyicisi + Vuetify tema adı + `<html>` öznitelikleri TEK yerde. İki uygulama aynı fabrikayı
 * yalnız depolama anahtarıyla (`ek-theme` / `ek-bo-theme`) kurar; ilk kareyi `theme-boot.js` aynı kuralla boyar.
 */
import { computed, ref, type ComputedRef } from 'vue'
import type { ThemeInstance } from 'vuetify'
import { THEME_NAMES, type ThemeMode } from './themes'
import {
  applyThemeToDocument,
  queryOverride,
  readPreference,
  resolveTheme,
  systemPrefersDark,
  writePreference,
  type ThemePreference,
} from './themePreference'

export interface ThemeController {
  /** Etkin mod (tercih + sistem + `?theme=`). */
  mode: ComputedRef<ThemeMode>
  /** Kullanıcının kayıtlı tercihi. */
  preference: ComputedRef<ThemePreference>
  /** `?theme=` geçersiz kılması etkin mi (tercih seçici bilgi verir; kayıt yine yapılır). */
  overridden: boolean
  initialMode(): ThemeMode
  bind(theme: ThemeInstance): void
  setPreference(next: ThemePreference): void
}

export function createThemeController(storageKey: string): ThemeController {
  const preference = ref<ThemePreference>(readPreference(storageKey))
  const prefersDark = ref(systemPrefersDark())
  const override = typeof location === 'undefined' ? null : queryOverride(location.search)
  const mode = computed<ThemeMode>(() => resolveTheme(preference.value, prefersDark.value, override))
  let vuetifyTheme: ThemeInstance | null = null
  let listening = false

  function apply() {
    if (typeof document !== 'undefined') applyThemeToDocument(mode.value)
    if (vuetifyTheme) vuetifyTheme.global.name.value = THEME_NAMES[mode.value]
  }

  return {
    mode,
    preference: computed(() => preference.value),
    overridden: override !== null,
    initialMode: () => mode.value,
    bind(theme) {
      vuetifyTheme = theme
      apply()
      if (listening || typeof window === 'undefined') return
      listening = true
      window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
        prefersDark.value = e.matches
        apply()
      })
    },
    setPreference(next) {
      preference.value = next
      writePreference(storageKey, next)
      apply()
    },
  }
}
