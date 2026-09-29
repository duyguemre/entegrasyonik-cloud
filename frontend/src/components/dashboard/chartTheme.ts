// Dashboard grafikleri için ECharts teması — UYGULAMA profili (DS-v2) token değerleriyle.
// `main.ts`'teki `entegrasyonik` teması site profili değerlerini kullanır (diğer tüketiciler için
// korunur); DESIGN_SYSTEM.md §8 madde 4 gereği dashboard uygulama profiline bağlanır. ECharts canvas
// çizdiği için CSS değişkeni okuyamaz; değerler token modülünden JS olarak gelir (literal renk yok).
import * as echarts from 'echarts/core'
import { buildEchartsTheme } from '@/design/echarts-theme'
import { appSemanticColorsLight } from '@/design/tokens'

export const DASHBOARD_CHART_THEME = 'entegrasyonik-app'
export const chartColors = appSemanticColorsLight

let registered = false

export function ensureDashboardChartTheme() {
  if (registered) return
  const base = buildEchartsTheme(appSemanticColorsLight)
  echarts.registerTheme(DASHBOARD_CHART_THEME, {
    ...base,
    color: [chartColors.action, chartColors.info, chartColors.success, chartColors.warning, chartColors.neutral],
    categoryAxis: {
      ...base.categoryAxis,
      axisLine: { lineStyle: { color: chartColors['border-default'] } },
    },
    valueAxis: {
      ...base.valueAxis,
      splitLine: { lineStyle: { color: chartColors['border-subtle'], type: 'dashed' } },
    },
    tooltip: {
      ...base.tooltip,
      backgroundColor: chartColors['surface-inverse'],
      borderColor: chartColors['surface-inverse'],
      textStyle: { color: chartColors['content-inverse'], fontSize: 12 },
    },
  })
  registered = true
}
