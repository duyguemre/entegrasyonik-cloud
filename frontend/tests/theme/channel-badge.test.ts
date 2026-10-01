// K13 / FR2 madde 11–14 — kanal ROZETİ (koyu kenarlık + açık iç zemin + koyu harf) ve kısa/uzun ad kaydı.
// Rozet tonları marka renginden YALNIZ `channelBadgeMix` oranlarıyla türetilir; her kanal (ve nötr) için iki temada
// AA hesaplanır. Açık tema oranları sitenin `--channel-badge-*` değerleriyle birebir (site dalı birleşince dosyadan da doğrulanır).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CARRIERS, CHANNEL_NAMES, CHANNEL_SHORT, appSemanticColorsDark, appSemanticColorsLight, brandName, carrierCode, carrierOptions,
  channelBadgeMix, channelPalette, channelShort, renderTokenCss,
} from '@entegrasyonik/ui/tokens'
import { THEME_NAMES } from '@entegrasyonik/ui/theme'
import { contrastRatio } from './contrastRatio'

/** color-mix(in srgb, A p%, B): gama kodlu sRGB'de doğrusal karışım (tarayıcı davranışı). */
function mix(a: string, pct: number, b: string): string {
  const p = pct / 100
  return (
    '#' +
    [1, 3, 5]
      .map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * p + parseInt(b.slice(i, i + 2), 16) * (1 - p)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  )
}

const THEMES = {
  light: { c: appSemanticColorsLight, r: channelBadgeMix.light },
  dark: { c: appSemanticColorsDark, r: channelBadgeMix.dark },
} as const

describe('kanal rozeti — kontrast (AA, iki tema)', () => {
  for (const [theme, { c, r }] of Object.entries(THEMES)) {
    const brands: Array<[string, string]> = [
      ...Object.entries(channelPalette).map(([code, t]) => [code, t.brand] as [string, string]),
      ['nötr', c.neutral],
    ]
    for (const [code, brand] of brands) {
      it(`${theme} · ${code}: harf/zemin ≥ 4.5, kenarlık/yüzey ≥ 3, kenarlık/iç zemin ≥ 3`, () => {
        const bg = mix(brand, r.tint, c.surface)
        const border = mix(brand, r.shade, c['content-strong'])
        const fg = mix(brand, r.ink, c['content-strong'])
        expect(contrastRatio(fg, bg), 'harf/zemin').toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(border, c.surface), 'kenarlık/yüzey').toBeGreaterThanOrEqual(3)
        expect(contrastRatio(border, bg), 'kenarlık/iç zemin').toBeGreaterThanOrEqual(3)
        // Zemin sayfa zeminine yakın (açık temada açık, koyu temada koyu) — rozet "dolgu" değil, tonlu kutu.
        expect(contrastRatio(bg, c.surface), 'zemin yüzeye yakın').toBeLessThan(1.6)
      })
    }
  }
})

describe('kanal rozeti — formül tek yerde, marka rengi değişmez', () => {
  const css = renderTokenCss('app')

  it('oranlar :root (açık) ve koyu tema (html[data-theme=dark] + Vuetify koyu tema sınıfı) üzerinde', () => {
    expect(css).toContain(`--ek-channel-badge-tint: ${channelBadgeMix.light.tint}%;`)
    expect(css).toContain(`--ek-channel-badge-shade: ${channelBadgeMix.light.shade}%;`)
    expect(css).toContain(`--ek-channel-badge-ink: ${channelBadgeMix.light.ink}%;`)
    const head = ":root[data-theme='dark'],\n.v-theme--darkTheme {"
    expect(css).toContain(head)
    const dark = css.slice(css.indexOf(head), css.indexOf('}', css.indexOf(head)))
    expect(dark).toContain(`--ek-channel-badge-tint: ${channelBadgeMix.dark.tint}%;`)
    // fe-polish: Vuetify koyu tema sınıfı tema adından türer; `.v-theme--dark` hiçbir öğeyle eşleşmez
    expect(`.v-theme--${THEME_NAMES.dark}`).toBe('.v-theme--darkTheme')
    expect(css).not.toMatch(/\.v-theme--dark\s*\{/)
  })

  it('tüm kanal kapsamları + nötr aynı formülü alır (zemin=yüzey, kenarlık/harf=mürekkep)', () => {
    for (const code of [...Object.keys(channelPalette), 'neutral']) expect(css).toMatch(new RegExp(`\\.ek-ch-${code}[,\\s]`))
    expect(css).toContain('--ek-ch-badge-bg: color-mix(in srgb, var(--ek-ch-brand) var(--ek-channel-badge-tint), var(--ek-color-surface));')
    expect(css).toContain('--ek-ch-badge-border: color-mix(in srgb, var(--ek-ch-brand) var(--ek-channel-badge-shade), var(--ek-color-content-strong));')
    expect(css).toContain('--ek-ch-badge-fg: color-mix(in srgb, var(--ek-ch-brand) var(--ek-channel-badge-ink), var(--ek-color-content-strong));')
    expect(css.match(/--ek-ch-badge-bg:/g)?.length).toBe(1)
  })

  it('açık tema oranları tanıtım sitesiyle aynı (site 14/78/58; site dosyası varsa oradan)', () => {
    const site = join(__dirname, '../../../site/src/styles/site-tokens.css')
    const siteCss = existsSync(site) ? readFileSync(site, 'utf8') : ''
    const val = (n: string) => siteCss.match(new RegExp(`--channel-badge-${n}:\\s*(\\d+)%`))?.[1]
    const expected = { tint: val('tint') ?? '14', shade: val('shade') ?? '78', ink: val('ink') ?? '58' }
    expect(channelBadgeMix.light).toEqual({ tint: Number(expected.tint), shade: Number(expected.shade), ink: Number(expected.ink) })
  })
})

describe('kısa/uzun ad — tek kayıt', () => {
  it('her kanalın kısa formu var, tekil ve ≤ 3 karakter', () => {
    expect(Object.keys(CHANNEL_SHORT).sort()).toEqual(Object.keys(CHANNEL_NAMES).sort())
    const shorts = Object.values(CHANNEL_SHORT)
    expect(new Set(shorts).size).toBe(shorts.length)
    for (const s of shorts) expect(s.length).toBeLessThanOrEqual(3)
  })

  it('kargo firmaları: kısa formlar tekil, kanal kısa formlarıyla çakışmaz', () => {
    const all = [...Object.values(CHANNEL_SHORT), ...Object.values(CARRIERS).map((c) => c.short)]
    expect(new Set(all).size).toBe(all.length)
  })

  it('channelShort: kanal → kayıt, kargo adı/kodu → kayıt, bilinmeyen → baş harfler', () => {
    expect(channelShort('trendyol')).toBe('TY')
    expect(channelShort('HEPSIBURADA')).toBe('HB')
    expect(channelShort('yurtici')).toBe('YK')
    expect(channelShort(undefined, 'Aras Kargo')).toBe('AR')
    expect(channelShort('amazon')).toBe('AM')
    expect(channelShort('', 'Özel mağaza')).toBe('ÖM')
    expect(channelShort('')).toBe('?')
  })

  it('carrierCode: serbest metin firma adları eşleşir (Türkçe büyük/küçük duyarsız)', () => {
    expect(carrierCode('Yurtiçi Kargo')).toBe('yurtici')
    expect(carrierCode('YURTİÇİ KARGO')).toBe('yurtici')
    expect(carrierCode('PTT Kargo')).toBe('ptt')
    expect(carrierCode('Trendyol Express')).toBe('trendyolexpress')
    expect(carrierCode('Diğer')).toBeUndefined()
    expect(carrierCode('')).toBeUndefined()
  })

  it('carrierOptions: değer = görünen ad (mevcut kayıtlarla uyumlu), "Diğer" en sonda ve nötr', () => {
    const opts = carrierOptions()
    // Eski sabit listedeki değerler aynen korunur (backend `carrierName` serbest metin).
    for (const legacy of ['Aras Kargo', 'Yurtiçi Kargo', 'MNG Kargo', 'Sürat Kargo', 'Trendyol Express', 'PTT Kargo', 'Diğer']) {
      expect(opts.map((o) => o.value)).toContain(legacy)
    }
    expect(opts.at(-1)).toEqual({ value: 'Diğer', title: 'Diğer', carrier: '' })
  })

  it('brandName: uzun form kanal ve kargo için aynı yardımcıdan', () => {
    expect(brandName('n11')).toBe('N11')
    expect(brandName('mng')).toBe('MNG Kargo')
    expect(brandName('x', 'Özel')).toBe('Özel')
  })
})
