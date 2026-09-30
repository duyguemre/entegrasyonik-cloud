import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryOverride, readPreference, resolveTheme, writePreference, type ThemePreference } from '../src/theme/themePreference'

const BOOT = readFileSync(join(__dirname, '..', 'src', 'theme', 'theme-boot.js'), 'utf8')

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
}

/** theme-boot.js'i sahte bir tarayıcıda koşturur, html'e yazdıklarını döner. */
function runBoot(opts: { key: string; stored?: string; prefersDark: boolean; search?: string }) {
  const attrs: Record<string, string> = {}
  const classes = new Set<string>()
  const style: Record<string, string> = {}
  const document = {
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v), classList: { add: (c: string) => classes.add(c) }, style },
    currentScript: { getAttribute: (k: string) => (k === 'data-storage-key' ? opts.key : null) },
  }
  runInNewContext(BOOT, {
    document,
    location: { search: opts.search ?? '' },
    URLSearchParams,
    localStorage: fakeStorage(opts.stored ? { [opts.key]: opts.stored } : {}),
    window: { matchMedia: () => ({ matches: opts.prefersDark }) },
  })
  return { theme: attrs['data-theme'], dark: classes.has('ek-dark'), colorScheme: style.colorScheme }
}

afterEach(() => vi.unstubAllGlobals())

describe('tema tercihi', () => {
  it('çözüm kuralı: ?theme > tercih > sistem', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
    expect(resolveTheme('light', false, 'dark')).toBe('dark')
    expect(queryOverride('?theme=dark')).toBe('dark')
    expect(queryOverride('?theme=blue')).toBeNull()
  })

  it('geçersiz/eksik kayıt → system; yazılan okunur', () => {
    vi.stubGlobal('localStorage', fakeStorage({ 'ek-bo-theme': 'mor' }))
    expect(readPreference('ek-bo-theme')).toBe('system')
    writePreference('ek-bo-theme', 'dark')
    expect(readPreference('ek-bo-theme')).toBe('dark')
  })

  it('depolama erişimi hata verirse system (gizli pencere)', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } })
    expect(readPreference('ek-theme')).toBe('system')
    expect(() => writePreference('ek-theme', 'dark')).not.toThrow()
  })

  const cases: Array<[ThemePreference | undefined, boolean, string]> = [
    [undefined, false, ''], [undefined, true, ''], ['light', true, ''], ['dark', false, ''], ['system', true, ''],
    ['light', false, '?theme=dark'], ['dark', true, '?theme=light'],
  ]
  it.each(cases)('theme-boot.js = resolveTheme (kayıt %s, sistem koyu %s, url %s)', (stored, prefersDark, search) => {
    const out = runBoot({ key: 'ek-bo-theme', stored, prefersDark, search })
    const expected = resolveTheme(stored ?? 'system', prefersDark, queryOverride(search))
    expect(out.theme).toBe(expected)
    expect(out.colorScheme).toBe(expected)
    expect(out.dark).toBe(expected === 'dark')
  })

  it('theme-boot.js anahtarı ad alanlı okur (uygulama tercihi backoffice\'i etkilemez)', () => {
    expect(runBoot({ key: 'ek-bo-theme', prefersDark: false }).theme).toBe('light')
  })
})
