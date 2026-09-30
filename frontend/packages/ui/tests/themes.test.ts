import { describe, expect, it } from 'vitest'
import { darkTheme, lightTheme, legacyColorsWorkspaceDark } from '../src/theme/themes'
import { contrastRatio, LEGACY_TO_WORKSPACE_MAP } from '../src/tokens'

const HEX = /^#[0-9A-Fa-f]{6}$/

describe('ortak tema — aynı token seti, tam dark', () => {
  it('light ve dark aynı anahtar kümesine sahip (dark eksiksiz)', () => {
    expect(Object.keys(darkTheme.colors).sort()).toEqual(Object.keys(lightTheme.colors).sort())
  })

  it('tüm değerler 6 haneli hex (Vuetify teması)', () => {
    for (const [key, value] of Object.entries(darkTheme.colors)) expect(value, key).toMatch(HEX)
  })

  it('43 legacy anahtarın tamamı dark rolünden türer', () => {
    expect(Object.keys(legacyColorsWorkspaceDark)).toHaveLength(Object.keys(LEGACY_TO_WORKSPACE_MAP).length)
    for (const [key, role] of Object.entries(LEGACY_TO_WORKSPACE_MAP)) {
      expect(darkTheme.colors[key], key).toBe(darkTheme.colors[role])
    }
  })

  it.each([
    ['light', lightTheme.colors],
    ['dark', darkTheme.colors],
  ])('%s: metin rolleri zemin ve yüzeyde AA (≥4,5)', (_mode, c) => {
    for (const text of ['content-strong', 'content-default', 'content-muted']) {
      for (const bg of ['background', 'surface', 'app-bg']) {
        expect(contrastRatio(c[text], c[bg]), `${text} / ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it.each([
    ['light', lightTheme.colors],
    ['dark', darkTheme.colors],
  ])('%s: durum metni kendi subtle zemininde AA; girdi kenarlığı ≥3', (_mode, c) => {
    for (const tone of ['success', 'warning', 'error', 'info']) {
      expect(contrastRatio(c[`${tone}-emphasis`] ?? c[tone], c[`${tone}-subtle`]), tone).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrastRatio(c['border-input'], c.surface)).toBeGreaterThanOrEqual(3)
  })
})
