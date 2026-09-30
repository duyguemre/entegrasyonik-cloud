// FR2-DARK + K13 — kanal rozetleri koyu zeminde: metin AA (≥4,5), marka hex'i DEĞİŞMEZ, kanal işareti (nokta / dolgulu
// çip) açık iç halkasıyla koyu yüzeyden ayrışır (grafik ≥3:1, WCAG 1.4.11).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appSemanticColorsDark as D, channelPalette, contrastRatio } from '@entegrasyonik/ui/tokens'

/** `color-mix(in srgb, fg p%, transparent)` → bg üzerinde görünen renk (alfa birleştirme). */
function over(fg: string, alpha: number, bg: string): string {
  const px = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [a, b] = [px(fg), px(bg)]
  return '#' + a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')
}

const APP_CSS = readFileSync(join(__dirname, '..', '..', 'packages', 'ui', 'src', 'styles', 'app.css'), 'utf8')
const darkBlock = APP_CSS.slice(APP_CSS.indexOf(":root[data-theme='dark']"))
const ringPct = Number(darkBlock.match(/--ek-channel-ring:\s*color-mix\(in srgb, var\(--ek-color-content-strong\) (\d+)%, transparent\)/)?.[1])

describe('kanal rozetleri — koyu tema', () => {
  it('koyu temada kanal halkası açık mürekkepten tanımlı', () => {
    expect(ringPct).toBeGreaterThan(0)
  })

  it.each(['surface', 'surface-raised', 'app-bg', 'surface-muted'] as const)('halka koyu "%s" üzerinde ≥3:1', (bg) => {
    const ring = over(D['content-strong'], ringPct / 100, D[bg])
    expect(contrastRatio(ring, D[bg])).toBeGreaterThanOrEqual(3)
  })

  it('nötr çip metni (content-default) koyu yüzeyde AA', () => {
    expect(contrastRatio(D['content-default'], D.surface)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(Object.entries(channelPalette))('dolgulu çip %s: onBrand / brand AA (temadan bağımsız)', (_code, t) => {
    expect(contrastRatio(t.onBrand, t.brand)).toBeGreaterThanOrEqual(4.5)
  })
})
