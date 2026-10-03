import { describe, expect, it } from 'vitest'
import { buildChartCategoricalPalette, buildEchartsTheme, CHART_STATUS, chartStatusFill } from '../../src/design/echarts-theme'
import { semanticColorsLight } from '../../src/design/tokens/semantic'
import { contrastRatio } from './contrastRatio'

/**
 * ADR-0015 Karar 3.6 — ECharts tema adaptörü birim testleri: kategorik
 * palet (`chart-1..5`) `surface` üzerinde ≥3:1 (WCAG 1.4.11), `CHART_STATUS`
 * eşlemesi Karar 3.3 tablosuyla birebir, `buildEchartsTheme` literal renk
 * yazmadan token'lardan okuyor.
 */
describe('ECharts kategorik palet (chart-1..5), surface üzerinde ≥3:1', () => {
  const palette = buildChartCategoricalPalette(
    semanticColorsLight.primary,
    semanticColorsLight['secondary-darken-1'],
  )

  it('tam olarak 5 renk üretir', () => {
    expect(palette).toHaveLength(5)
  })

  it.each(palette)('"%s" / surface ≥ 3:1', (hex) => {
    const ratio = contrastRatio(hex, semanticColorsLight.surface)
    expect(ratio).toBeGreaterThanOrEqual(3)
  })
})

describe('CHART_STATUS — iş durumu → anlamsal ton eşlemesi (Karar 3.3)', () => {
  it('5 iş durumunun tamamı tanımlı', () => {
    expect(Object.keys(CHART_STATUS).sort()).toEqual(
      ['completed', 'failed', 'partial', 'processing', 'queued'].sort(),
    )
  })

  it('eşleme Karar 3.3 tablosuyla birebir', () => {
    expect(CHART_STATUS.queued).toBe('neutral')
    expect(CHART_STATUS.processing).toBe('info')
    expect(CHART_STATUS.completed).toBe('success')
    expect(CHART_STATUS.partial).toBe('warning')
    expect(CHART_STATUS.failed).toBe('error')
  })

  it('chartStatusFill, tema kaynağından doğru dolgu değerini döner', () => {
    expect(chartStatusFill('completed', semanticColorsLight)).toBe(semanticColorsLight.success)
    expect(chartStatusFill('failed', semanticColorsLight)).toBe(semanticColorsLight.error)
  })
})

describe('buildEchartsTheme — literal renk değil, token değeri kullanır', () => {
  it('tooltip/grid/legend renkleri semanticColorsLight kaynağından gelir', () => {
    const theme = buildEchartsTheme(semanticColorsLight)
    expect(theme.tooltip.backgroundColor).toBe(semanticColorsLight.surface)
    expect(theme.grid.borderColor).toBe(semanticColorsLight['border-default'])
    expect(theme.legend.textStyle.color).toBe(semanticColorsLight['content-default'])
  })

  it('animasyon süresi ≤250ms ve overshoot yok (quadraticOut)', () => {
    const theme = buildEchartsTheme(semanticColorsLight)
    expect(theme.animationDuration).toBeLessThanOrEqual(250)
    expect(theme.animationEasing).toBe('quadraticOut')
  })
})
