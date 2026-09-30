// C1 — kanal marka renkleri (tek kaynak `palette.ts` `channelPalette`): kullanıcı onaylı değerler AYNEN
// (`docs/cloud-contracts/CHANNEL_BRAND_COLORS.md`), `onBrand` siyah/beyazdan ≥ 4.5:1 olanı, her kanal kodu tek
// kaynaktan çözülür (CSS değişkeni + kapsam sınıfı + TS yardımcıları), tint türetilmez, bilinmeyen kanal nötr.
import { describe, expect, it } from 'vitest'
import { channelPalette, integrationAccent } from '../../src/design/tokens/palette'
import { renderTokenCss } from '../../src/design/tokens/render'
import { CHANNEL_NAMES, channelClass, channelCode, channelColors, channelName } from '../../src/design/channels'
import { contrastRatio } from './contrastRatio'

/** CHANNEL_BRAND_COLORS.md tablosunun kopyası (değişiklik yalnız belge + token ile birlikte). */
const CONTRACT: Record<string, { brand: string; secondary?: string }> = {
  trendyol: { brand: '#FF6620' },
  hepsiburada: { brand: '#FF6000' },
  n11: { brand: '#FF44EE', secondary: '#1C1C1E' },
  pazarama: { brand: '#0137F3', secondary: '#FF008B' },
  ideasoft: { brand: '#391EE0' },
  bizimhesap: { brand: '#20554E' },
  shopify: { brand: '#7AB55C' },
  woocommerce: { brand: '#873EFF' },
}
const BLACK = '#000000'
const WHITE = '#FFFFFF'
const tones = channelPalette as Record<string, { brand: string; onBrand: string; secondary?: string }>

describe('kanal marka renkleri — değerler', () => {
  it('kanal kümesi ve marka renkleri sözleşmeyle AYNEN aynı', () => {
    expect(Object.keys(channelPalette).sort()).toEqual(Object.keys(CONTRACT).sort())
    for (const [code, c] of Object.entries(CONTRACT)) {
      expect(tones[code].brand, code).toBe(c.brand)
      expect(tones[code].secondary, `${code} ikincil`).toBe(c.secondary)
    }
  })

  for (const [code, t] of Object.entries(tones)) {
    it(`${code}: onBrand siyah/beyazdan biri, marka zemininde ≥ 4.5:1 ve ikisinin daha iyisi`, () => {
      expect([BLACK, WHITE]).toContain(t.onBrand)
      expect(contrastRatio(t.onBrand, t.brand)).toBeGreaterThanOrEqual(4.5)
      const other = t.onBrand === BLACK ? WHITE : BLACK
      expect(contrastRatio(t.onBrand, t.brand)).toBeGreaterThan(contrastRatio(other, t.brand))
    })
  }

  it('ikincil renk yalnız N11 ve Pazarama’da (logo zemini aksanı)', () => {
    expect(Object.entries(tones).filter(([, t]) => t.secondary).map(([c]) => c).sort()).toEqual(['n11', 'pazarama'])
  })

  it('tint/ton türetilmez: kanal kaydında yalnız brand/onBrand/secondary alanları', () => {
    for (const t of Object.values(tones)) for (const k of Object.keys(t)) expect(['brand', 'onBrand', 'secondary']).toContain(k)
  })

  it('Trendyol ve Hepsiburada bilinçli olarak aynı turuncu ailesinde (kullanıcı isteği)', () => {
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      const max = Math.max(r, g, b), d = max - Math.min(r, g, b)
      return (((max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60) + 360) % 360
    }
    expect(Math.abs(hue(tones.trendyol.brand) - hue(tones.hepsiburada.brand))).toBeLessThan(10)
  })
})

describe('kanal marka renkleri — tek kaynaktan çözülür', () => {
  const css = renderTokenCss('app')
  const staticCss = renderTokenCss('static')

  for (const [code, t] of Object.entries(tones)) {
    it(`${code}: CSS değişkeni, kapsam sınıfı ve TS yardımcıları aynı değeri verir`, () => {
      expect(css).toContain(`--ek-channel-${code}-brand: ${t.brand};`)
      expect(css).toContain(`--ek-channel-${code}-on-brand: ${t.onBrand};`)
      const scope = css.slice(css.indexOf(`.ek-ch-${code} {`), css.indexOf('}', css.indexOf(`.ek-ch-${code} {`)))
      expect(scope).toContain(`--ek-ch-brand: var(--ek-channel-${code}-brand);`)
      expect(scope).toContain(`--ek-ch-on-brand: var(--ek-channel-${code}-on-brand);`)
      expect(scope).toContain(`--ek-ch-secondary: var(--ek-channel-${code}-${t.secondary ? 'secondary' : 'brand'});`)
      expect(channelCode(code.toUpperCase())).toBe(code)
      expect(channelClass(` ${code.toUpperCase()} `)).toBe(`ek-ch-${code}`)
      expect(channelColors(code)).toEqual({ brand: t.brand, onBrand: t.onBrand, secondary: t.secondary })
      expect((integrationAccent as Record<string, string>)[code]).toBe(t.brand)
      expect(channelName(code)).toBe((CHANNEL_NAMES as Record<string, string>)[code])
    })
  }

  it('dark tema marka rengini değiştirmez (kanal değişkenleri yalnız :root, tema bloğunda yok)', () => {
    expect(staticCss).not.toContain('--ek-channel-')
    expect(css.match(/--ek-channel-[a-z0-9]+-brand:/g)?.length).toBe(Object.keys(tones).length + 1)
  })

  it('geri uyum takma adları marka tonu TÜRETMEZ (solid/border = marka, subtle/text = nötr rol)', () => {
    for (const code of [...Object.keys(tones), 'neutral']) {
      const i = css.indexOf(`.ek-ch-${code} {`)
      const scope = css.slice(i, css.indexOf('}', i))
      expect(scope).toContain(`--ek-ch-solid: var(--ek-channel-${code}-brand);`)
      expect(scope).toContain(`--ek-ch-border: var(--ek-channel-${code}-brand);`)
      expect(scope).toContain('--ek-ch-subtle: var(--ek-color-neutral-subtle);')
      expect(scope).toContain('--ek-ch-text: var(--ek-color-content-default);')
    }
  })

  it('bilinmeyen kanal → nötr (sınıf, renk, ad)', () => {
    expect(channelClass('xyz')).toBe('ek-ch-neutral')
    expect(channelClass(undefined)).toBe('ek-ch-neutral')
    expect(channelClass('constructor')).toBe('ek-ch-neutral')
    expect(channelColors('amazon')).toBeUndefined()
    expect(css).toContain('--ek-channel-neutral-brand: var(--ek-color-neutral);')
    expect(css).toContain('--ek-channel-neutral-on-brand: var(--ek-color-neutral-contrast);')
    expect(channelName('xyz')).toBe('Xyz')
    expect(channelName('xyz', 'Özel')).toBe('Özel')
    expect(channelName('')).toBe('Bilinmeyen')
  })

  it('nötr halka tema rolünden türetilir (marka renginden değil)', () => {
    expect(css).toMatch(/--ek-channel-ring: color-mix\(in srgb, var\(--ek-color-content-default\) \d+%, transparent\);/)
  })
})
