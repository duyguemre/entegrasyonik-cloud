/**
 * Tema tercihi (ADR-0026 Karar 3.3-3.4): 'system' | 'light' | 'dark', varsayılan 'system'.
 * Kalıcılık localStorage'da, anahtar uygulamaya göre ad alanlı (`ek-theme` / `ek-bo-theme`).
 * `?theme=dark|light` geliştirici/test geçersiz kılmasıdır, kalıcılaştırılmaz (ADR-0011 Karar 3).
 * Aynı çözüm kuralını ilk boyamadan önce `theme-boot.js` uygular (tests: theme-boot.test.ts eşitliği korur).
 */
import type { ThemeMode } from './themes'

export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEYS = { app: 'ek-theme', backoffice: 'ek-bo-theme' } as const

const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark']

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (PREFERENCES as readonly string[]).includes(value)
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readPreference(key: string): ThemePreference {
  try {
    const value = storage()?.getItem(key)
    return isThemePreference(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export function writePreference(key: string, preference: ThemePreference): void {
  try {
    storage()?.setItem(key, preference)
  } catch {
    /* gizli pencere / kapalı depolama: tercih yalnız bu oturumda geçerli */
  }
}

/** URL'deki `?theme=` geçersiz kılması (yoksa null). */
export function queryOverride(search: string): ThemeMode | null {
  const value = new URLSearchParams(search).get('theme')
  return value === 'dark' || value === 'light' ? value : null
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean, override: ThemeMode | null = null): ThemeMode {
  if (override) return override
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

/**
 * Belgeye tema uygular: `html[data-theme]`, `.ek-dark`, `color-scheme`. Geçişte bir karelik
 * `ek-theme-switching` sınıfı renk animasyonlarını keser (kademeli renk geçişi yok, Karar 3.4).
 */
export function applyThemeToDocument(mode: ThemeMode, doc: Document = document): void {
  const root = doc.documentElement
  const changed = root.dataset.theme !== undefined && root.dataset.theme !== mode
  if (changed) root.classList.add('ek-theme-switching')
  root.dataset.theme = mode
  root.classList.toggle('ek-dark', mode === 'dark')
  root.style.colorScheme = mode
  if (changed) {
    const raf = doc.defaultView?.requestAnimationFrame ?? ((cb: FrameRequestCallback) => setTimeout(cb, 16))
    raf(() => raf(() => root.classList.remove('ek-theme-switching')))
  }
}
