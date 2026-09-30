// DS-v2 Aşama 5 — kanal renk ailesi (tek kaynak `palette.ts` `channelPalette`): AA metin kontrastı, kanalların
// birbirinden AYRIŞMASI (renk açısı), üretilen CSS'te değişken + kapsam sınıfı, `integrationAccent` geri uyumu.
import { describe, expect, it } from 'vitest'
import { channelPalette, integrationAccent, ink } from '../../src/design/tokens/palette'
import { renderTokenCss } from '../../src/design/tokens/render'
import { channelClass, channelName } from '../../src/design/channels'
import { contrastRatio } from './contrastRatio'

const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const d = max - min
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

describe('kanal renkleri', () => {
  for (const [code, t] of Object.entries(channelPalette)) {
    it(`${code}: metin kanal zemininde, beyazda ve uygulama zemininde AA (≥ 4.5)`, () => {
      expect(contrastRatio(t.text, t.subtle)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t.text, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(t.text, ink[100])).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('kanallar birbirinden ayrışır: her çiftin renk açısı farkı ≥ 20°', () => {
    const entries = Object.entries(channelPalette)
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const d = Math.abs(hue(entries[i][1].solid) - hue(entries[j][1].solid))
        expect(Math.min(d, 360 - d), `${entries[i][0]} ↔ ${entries[j][0]}`).toBeGreaterThanOrEqual(20)
      }
    }
  })

  it('integrationAccent = solid (geri uyum, tek kaynak)', () => {
    for (const [code, t] of Object.entries(channelPalette)) expect((integrationAccent as Record<string, string>)[code]).toBe(t.solid)
  })

  it('uygulama CSS’i kanal değişkenlerini ve .ek-ch-* kapsam sınıflarını üretir', () => {
    const css = renderTokenCss('app')
    for (const code of [...Object.keys(channelPalette), 'neutral']) {
      expect(css).toContain(`.ek-ch-${code} {`)
      expect(css).toContain(`--ek-channel-${code}-text`)
    }
  })

  it('channelClass / channelName', () => {
    expect(channelClass('TRENDYOL')).toBe('ek-ch-trendyol')
    expect(channelClass('xyz')).toBe('ek-ch-neutral')
    expect(channelName('n11')).toBe('N11')
    expect(channelName('xyz')).toBe('Xyz')
    expect(channelName('xyz', 'Özel')).toBe('Özel')
  })
})
