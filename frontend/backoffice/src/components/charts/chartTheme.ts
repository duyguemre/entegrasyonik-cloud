/**
 * BO2-60 — backoffice ECharts TEMASI (token'dan türer; açık + koyu). SAF TS (Vue yok) — vitest ile doğrulanır.
 * ECharts tuvali CSS değişkeni okuyamaz; bu yüzden renkler `@entegrasyonik/ui/tokens` JS değerlerinden alınır (literal
 * renk YOK; statik test). Görsel dil (CONSOLE_IDENTITY): sakin ızgara, ince eksen, renk yalnız seride ve durumda,
 * gradyan/gölge yok, hareket ≤ 250 ms ve sıçramasız (premium-ui-standards).
 */
import { appSemanticColorsDark, appSemanticColorsLight, fontFamily, radius, typeRole, type SemanticColorKey } from '@entegrasyonik/ui/tokens'

export type ChartMode = 'light' | 'dark'
/** Seri tonu — anlamlı (durum) ya da kategorik (sıra). */
export type ChartTone = 'action' | 'secondary' | 'info' | 'success' | 'warning' | 'error' | 'neutral'

export const CHART_THEME_NAME: Record<ChartMode, string> = { light: 'bo-light', dark: 'bo-dark' }
export const CHART_TOKENS: Record<ChartMode, Record<SemanticColorKey, string>> = { light: appSemanticColorsLight, dark: appSemanticColorsDark }

/** Kategorik sıra (5'ten fazla seri "Diğer" altında toplanır — çağıranın işi). */
export const CATEGORICAL: ChartTone[] = ['action', 'secondary', 'info', 'warning', 'neutral']

export function toneColor(tone: ChartTone, mode: ChartMode): string {
  const t = CHART_TOKENS[mode]
  return t[tone]
}

/** `#RRGGBB` + opaklık → `rgba(…)` (alan dolgusu, vurgu). Yalnız token değerine uygulanır. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function buildChartTheme(mode: ChartMode) {
  const t = CHART_TOKENS[mode]
  const label = { color: t['content-muted'], fontSize: typeRole.caption.size, fontFamily: fontFamily.sans }
  return {
    color: CATEGORICAL.map((c) => toneColor(c, mode)),
    backgroundColor: 'transparent',
    textStyle: { fontFamily: fontFamily.sans, color: t['content-default'] },
    grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
    categoryAxis: {
      axisLine: { show: true, lineStyle: { color: t['border-default'] } },
      axisTick: { show: false },
      axisLabel: { ...label, hideOverlap: true },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: label,
      splitNumber: 3,
      splitLine: { lineStyle: { color: t['border-subtle'], type: 'dashed' } },
    },
    line: { symbol: 'circle', symbolSize: 5, showSymbol: false, lineStyle: { width: 2 }, smooth: 0.25 },
    bar: { itemStyle: { borderRadius: [radius.sm, radius.sm, 0, 0] }, barMaxWidth: 18 },
    pie: { itemStyle: { borderColor: t.surface, borderWidth: 2 } },
    tooltip: {
      backgroundColor: t.surface,
      borderColor: t['border-default'],
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t['content-strong'], fontSize: typeRole.caption.size, fontFamily: fontFamily.sans },
      axisPointer: { lineStyle: { color: t['border-default'] }, shadowStyle: { color: withAlpha(t['content-subtle'], 0.08) } },
      extraCssText: `border-radius: ${radius.lg}px; box-shadow: none;`,
    },
    animationDuration: 250,
    animationEasing: 'cubicOut',
    animationDurationUpdate: 200,
    animationEasingUpdate: 'cubicOut',
  }
}
