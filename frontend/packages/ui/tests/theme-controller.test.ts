// FR2-DARK — ortak tema denetleyicisi: tercih kalıcılığı, ?theme= önceliği, sistem değişimi ve Vuetify bağlaması.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createThemeController } from '../src/theme/themeController'

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data }
}

function fakeBrowser(opts: { stored?: Record<string, string>; prefersDark?: boolean; search?: string } = {}) {
  const listeners: Array<(e: { matches: boolean }) => void> = []
  const storage = fakeStorage(opts.stored)
  const root = { dataset: {} as Record<string, string>, classList: new Set<string>(), style: {} as Record<string, string> }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('location', { search: opts.search ?? '' })
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: !!opts.prefersDark, addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.push(cb) }),
  })
  vi.stubGlobal('document', {
    documentElement: {
      dataset: root.dataset,
      style: root.style,
      classList: {
        add: (c: string) => root.classList.add(c),
        remove: (c: string) => root.classList.delete(c),
        toggle: (c: string, on: boolean) => (on ? root.classList.add(c) : root.classList.delete(c)),
      },
    },
    defaultView: { requestAnimationFrame: (cb: () => void) => cb() },
  })
  const vuetify = { global: { name: { value: 'lightTheme' } } }
  return { storage, root, vuetify, fireSystem: (matches: boolean) => listeners.forEach((cb) => cb({ matches })) }
}

afterEach(() => vi.unstubAllGlobals())

describe('createThemeController', () => {
  it('kayıt yoksa sistem tercihini izler; sistem değişince tema değişir', () => {
    const b = fakeBrowser({ prefersDark: true })
    const c = createThemeController('ek-theme')
    expect(c.preference.value).toBe('system')
    expect(c.initialMode()).toBe('dark')
    c.bind(b.vuetify as never)
    expect(b.vuetify.global.name.value).toBe('darkTheme')
    expect(b.root.dataset.theme).toBe('dark')
    expect(b.root.classList.has('ek-dark')).toBe(true)
    b.fireSystem(false)
    expect(c.mode.value).toBe('light')
    expect(b.vuetify.global.name.value).toBe('lightTheme')
    expect(b.root.classList.has('ek-dark')).toBe(false)
  })

  it('seçim kalıcıdır ve sistem değişimini geçersiz kılar', () => {
    const b = fakeBrowser({ prefersDark: false })
    const c = createThemeController('ek-theme')
    c.bind(b.vuetify as never)
    c.setPreference('dark')
    expect(b.storage.data.get('ek-theme')).toBe('dark')
    expect(b.vuetify.global.name.value).toBe('darkTheme')
    expect(b.root.style.colorScheme).toBe('dark')
    b.fireSystem(false)
    expect(c.mode.value).toBe('dark')
    // Yeni oturum aynı tercihi okur (ilk kare theme-boot.js ile aynı kural).
    expect(createThemeController('ek-theme').initialMode()).toBe('dark')
  })

  it('?theme= geçersiz kılması tercihten önce gelir; anahtar uygulamaya göre ayrıdır', () => {
    fakeBrowser({ stored: { 'ek-theme': 'dark', 'ek-bo-theme': 'light' }, search: '?theme=light' })
    const c = createThemeController('ek-theme')
    expect(c.overridden).toBe(true)
    expect(c.initialMode()).toBe('light')
    fakeBrowser({ stored: { 'ek-theme': 'dark', 'ek-bo-theme': 'light' } })
    expect(createThemeController('ek-bo-theme').initialMode()).toBe('light')
    expect(createThemeController('ek-theme').initialMode()).toBe('dark')
  })
})
