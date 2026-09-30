import { describe, expect, it } from 'vitest'
import {
  semanticColorsLight,
  semanticColorsDark,
  type SemanticColorKey,
} from '@entegrasyonik/ui/tokens'
import {
  legacyColorsLight,
  legacyColorsDark,
  type LegacyColorKey,
} from '@entegrasyonik/ui/tokens'
import { duration, easing } from '@entegrasyonik/ui/tokens'
import { contrastRatio } from './contrastRatio'

/**
 * ADR-0011 Karar 1/4 — token birim testleri: light/dark anahtar eşitliği
 * (TS tipi zaten derleme zamanında zorluyor; burada RUNTIME kanıtı),
 * yasak anahtar adları (Vuetify'ın bg/text/border yardımcı sınıfları ve `on-` önekiyle çakışması),
 * motion sınırları (150-300ms, yalnızca `ease-in-out`/`ease-out`),
 * `content-*` metin token'larının `background` üzerinde ≥4.5:1 kontrastı.
 */
describe('semantic.ts / legacy.ts — anahtar kümesi eşitliği (light ↔ dark)', () => {
  it('semanticColorsLight ve semanticColorsDark aynı anahtar kümesine sahip', () => {
    expect(Object.keys(semanticColorsLight).sort()).toEqual(Object.keys(semanticColorsDark).sort())
  })

  it('legacyColorsLight ve legacyColorsDark aynı anahtar kümesine sahip', () => {
    expect(Object.keys(legacyColorsLight).sort()).toEqual(Object.keys(legacyColorsDark).sort())
  })
})

describe('yasak anahtar adları (ADR-0011 Karar 1 — Vuetify .bg-*/.text-*/.border-*/on-* çakışması)', () => {
  const FORBIDDEN_EXACT = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'caption', 'overline', 'button',
    'center', 'left', 'right', 'start', 'end', 'justify',
    'truncate', 'wrap', 'no-wrap',
    'uppercase', 'lowercase', 'capitalize',
    'sm', 'md', 'lg', 'xl', 'thin',
  ])
  const FORBIDDEN_PREFIXES = ['subtitle-', 'body-', 'opacity-', 'on-']

  function isForbidden(key: string): boolean {
    if (FORBIDDEN_EXACT.has(key)) return true
    return FORBIDDEN_PREFIXES.some((prefix) => key.startsWith(prefix))
  }

  const allKeys: string[] = [
    ...(Object.keys(semanticColorsLight) as SemanticColorKey[]),
    ...(Object.keys(legacyColorsLight) as LegacyColorKey[]),
  ]

  it.each(allKeys)('"%s" yasak ad listesinde DEĞİL', (key) => {
    expect(isForbidden(key)).toBe(false)
  })
})

describe('motion sınırları (ADR-0011 Karar 1 — 150-300ms, ease-in-out/ease-out DIŞINDA eğri YOK)', () => {
  it('duration.fast/base/slow 150-300ms aralığında', () => {
    for (const value of Object.values(duration)) {
      expect(value).toBeGreaterThanOrEqual(150)
      expect(value).toBeLessThanOrEqual(300)
    }
  })

  it('easing yalnızca ease-in-out/ease-out', () => {
    for (const value of Object.values(easing)) {
      expect(['ease-in-out', 'ease-out']).toContain(value)
    }
  })
})

describe('content-* metin token kontrastı (ADR-0011 Karar 1 — ≥4.5:1 AA; content-subtle İSTİSNA, yalnızca dekoratif)', () => {
  const AA_MIN = 4.5
  const readableTextKeys: Array<'content-strong' | 'content-default' | 'content-muted'> = [
    'content-strong',
    'content-default',
    'content-muted',
  ]

  it.each(readableTextKeys)('light: "%s", background üzerinde ≥4.5:1', (key) => {
    const ratio = contrastRatio(semanticColorsLight[key], semanticColorsLight.background)
    expect(ratio).toBeGreaterThanOrEqual(AA_MIN)
  })

  it.each(readableTextKeys)('dark: "%s", background üzerinde ≥4.5:1', (key) => {
    const ratio = contrastRatio(semanticColorsDark[key], semanticColorsDark.background)
    expect(ratio).toBeGreaterThanOrEqual(AA_MIN)
  })

  it('content-subtle metin için AA eşiğinin ALTINDA olabilir (yalnızca dekoratif/devre dışı kullanım — ADR notu)', () => {
    const ratio = contrastRatio(semanticColorsLight['content-subtle'], semanticColorsLight.background)
    expect(ratio).toBeLessThan(AA_MIN)
    expect(ratio).toBeGreaterThan(1)
  })
})

describe('ADR-0015 Karar 3.3 — durum paleti (5 ton) WCAG AA kapısı (metin/subtle ≥4.5:1, beyaz/dolgu ≥4.5:1)', () => {
  const AA_MIN = 4.5
  const WHITE = '#FFFFFF'
  const tones: Array<{ name: string; core: keyof typeof semanticColorsLight; subtle: keyof typeof semanticColorsLight }> = [
    { name: 'success', core: 'success', subtle: 'success-subtle' },
    { name: 'warning', core: 'warning', subtle: 'warning-subtle' },
    { name: 'danger (error)', core: 'error', subtle: 'error-subtle' },
    { name: 'info', core: 'info', subtle: 'info-subtle' },
    { name: 'neutral', core: 'neutral', subtle: 'neutral-subtle' },
  ]

  it.each(tones)('light: "$name" çekirdek rengi, kendi "subtle" zemini üzerinde ≥4.5:1', ({ core, subtle }) => {
    const ratio = contrastRatio(semanticColorsLight[core], semanticColorsLight[subtle])
    expect(ratio).toBeGreaterThanOrEqual(AA_MIN)
  })

  it.each(tones)('light: "$name" çekirdek rengi, beyaz metin/ikon (dolgu rozet) için ≥4.5:1', ({ core }) => {
    const ratio = contrastRatio(WHITE, semanticColorsLight[core])
    expect(ratio).toBeGreaterThanOrEqual(AA_MIN)
  })
})

describe('ADR-0015 Karar 3.7 — border-input, "surface" üzerinde ≥3:1 (WCAG 1.4.11, form alanı kenarlığı)', () => {
  it('light: border-input / surface ≥ 3:1', () => {
    const ratio = contrastRatio(semanticColorsLight['border-input'], semanticColorsLight.surface)
    expect(ratio).toBeGreaterThanOrEqual(3)
  })

  it('dark: border-input / surface ≥ 3:1', () => {
    const ratio = contrastRatio(semanticColorsDark['border-input'], semanticColorsDark.surface)
    expect(ratio).toBeGreaterThanOrEqual(3)
  })
})
