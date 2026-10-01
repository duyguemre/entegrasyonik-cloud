/**
 * BoChart seçenek kurucusu — SAF (vitest). Görsel kararlar burada, bileşen yalnız durum/erişilebilirlik çizer.
 */
import type { EChartsCoreOption } from 'echarts/core'
import { toneColor, withAlpha, type ChartMode, type ChartTone, CATEGORICAL } from './chartTheme'

export type ChartKind = 'line' | 'area' | 'bar' | 'stacked-bar' | 'sparkline' | 'donut'

export interface ChartSeries {
  name: string
  data: number[]
  tone?: ChartTone
}

export interface ChartInput {
  kind: ChartKind
  series: ChartSeries[]
  categories?: string[]
  /** Değer biçimi (eksen + ipucu). Varsayılan: Türkçe sayı. */
  format?: (v: number) => string
  /** Yatay eşik çizgisi (ör. hata oranı eşiği) — ince, kesikli, uyarı tonunda. */
  threshold?: { value: number; label: string }
  mode: ChartMode
  animate: boolean
}

const nf = new Intl.NumberFormat('tr-TR')

export function seriesColor(s: ChartSeries, i: number, mode: ChartMode): string {
  return toneColor(s.tone ?? CATEGORICAL[i % CATEGORICAL.length], mode)
}

export function buildOption(input: ChartInput): EChartsCoreOption {
  const fmt = input.format ?? ((v: number) => nf.format(v))
  const { kind, mode } = input
  const base = { animation: input.animate, aria: { enabled: false } }

  if (kind === 'donut') {
    const s = input.series[0]
    return {
      ...base,
      tooltip: { trigger: 'item', valueFormatter: (v: number) => fmt(v) },
      series: [
        {
          type: 'pie',
          radius: ['62%', '88%'],
          avoidLabelOverlap: true,
          label: { show: false },
          data: (input.categories ?? []).map((name, i) => ({ name, value: s?.data[i] ?? 0, itemStyle: { color: toneColor(CATEGORICAL[i % CATEGORICAL.length], mode) } })),
        },
      ],
    }
  }

  if (kind === 'sparkline') {
    const s = input.series[0]
    const c = s ? seriesColor(s, 0, mode) : toneColor('action', mode)
    return {
      ...base,
      grid: { left: 1, right: 1, top: 2, bottom: 2, containLabel: false },
      xAxis: { type: 'category', show: false, boundaryGap: false, data: input.categories ?? s?.data.map((_, i) => String(i)) },
      yAxis: { type: 'value', show: false, min: 0 },
      tooltip: { show: false },
      series: [
        {
          type: 'line',
          data: s?.data ?? [],
          smooth: 0.3,
          showSymbol: false,
          silent: true,
          lineStyle: { width: 1.75, color: c },
          areaStyle: { color: withAlpha(c, 0.12) },
        },
      ],
    }
  }

  const stacked = kind === 'stacked-bar'
  const isBar = kind === 'bar' || stacked
  return {
    ...base,
    grid: { left: 4, right: 8, top: input.threshold ? 20 : 12, bottom: 4, containLabel: true },
    tooltip: { trigger: 'axis', axisPointer: { type: isBar ? 'shadow' : 'line' }, valueFormatter: (v: number) => fmt(v) },
    xAxis: { type: 'category', data: input.categories ?? [], boundaryGap: isBar },
    yAxis: { type: 'value', min: 0, axisLabel: { formatter: (v: number) => fmt(v) } },
    series: input.series.map((s, i) => {
      const color = seriesColor(s, i, mode)
      return {
        name: s.name,
        type: isBar ? 'bar' : 'line',
        data: s.data,
        stack: stacked ? 'total' : undefined,
        itemStyle: { color, borderRadius: stacked && i < input.series.length - 1 ? 0 : [3, 3, 0, 0] },
        lineStyle: isBar ? undefined : { color, width: 2 },
        areaStyle: kind === 'area' ? { color: withAlpha(color, 0.1) } : undefined,
        emphasis: { focus: 'series' },
        markLine:
          i === 0 && input.threshold
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: toneColor('warning', mode), type: 'dashed', width: 1 },
                label: { formatter: input.threshold.label, position: 'insideEndTop', color: toneColor('warning', mode), fontSize: 11 },
                data: [{ yAxis: input.threshold.value }],
              }
            : undefined,
      }
    }),
  }
}

/** Erişilebilir özet: her seri için toplam, en yüksek ve son değer (ekran okuyucu + "Tablo olarak göster" yerine geçmez). */
export function describeSeries(series: ChartSeries[], categories: string[] | undefined, format = (v: number) => nf.format(v)): string {
  return series
    .map((s) => {
      if (!s.data.length) return `${s.name}: veri yok`
      const max = Math.max(...s.data)
      const at = categories?.[s.data.indexOf(max)]
      const total = s.data.reduce((a, b) => a + b, 0)
      return `${s.name}: toplam ${format(total)}, en yüksek ${format(max)}${at ? ` (${at})` : ''}, son ${format(s.data[s.data.length - 1])}`
    })
    .join('; ')
}
