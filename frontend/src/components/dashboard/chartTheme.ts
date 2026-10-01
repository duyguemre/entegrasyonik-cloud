// Dashboard grafikleri için ECharts teması — UYGULAMA profili (DS-v2) token değerleriyle.
// `main.ts`'teki `entegrasyonik` teması site profili değerlerini kullanır (diğer tüketiciler için
// korunur); DESIGN_SYSTEM.md §8 madde 4 gereği dashboard uygulama profiline bağlanır. ECharts canvas
// çizdiği için CSS değişkeni okuyamaz; değerler token modülünden JS olarak gelir (literal renk yok).
// FR2-DARK: light ve dark AYRI tema olarak kaydedilir; bileşen etkin moda göre tema adını ve seri
// renklerini tepkisel alır (tema değişince vue-echarts grafiği yeniden kurar).
import { computed } from 'vue'
import * as echarts from 'echarts/core'
import { buildEchartsTheme } from '@/design/echarts-theme'
import { appSemanticColorsDark, appSemanticColorsLight, type SemanticColorKey } from '@entegrasyonik/ui/tokens'
import { appTheme, type ThemeMode } from '@/stores/theme'

export const DASHBOARD_CHART_THEMES: Record<ThemeMode, string> = { light: 'entegrasyonik-app', dark: 'entegrasyonik-app-dark' }
export const DASHBOARD_CHART_THEME = DASHBOARD_CHART_THEMES.light
export const CHART_COLORS: Record<ThemeMode, Record<SemanticColorKey, string>> = {
  light: appSemanticColorsLight,
  dark: appSemanticColorsDark,
}
/** Geriye uyum: light renk kaydı (yeni kod `useDashboardChartTheme().colors` kullanır). */
export const chartColors = appSemanticColorsLight

let registered = false

function dashboardTheme(mode: ThemeMode) {
  const c = CHART_COLORS[mode]
  const base = buildEchartsTheme(c, mode)
  return {
    ...base,
    color: [c.action, c.info, c.success, c.warning, c.neutral],
    categoryAxis: {
      ...base.categoryAxis,
      axisLine: { lineStyle: { color: c['border-default'] } },
    },
    valueAxis: {
      ...base.valueAxis,
      splitLine: { lineStyle: { color: c['border-subtle'], type: 'dashed' } },
    },
    tooltip: {
      ...base.tooltip,
      backgroundColor: c['surface-inverse'],
      borderColor: c['surface-inverse'],
      textStyle: { color: c['content-inverse'], fontSize: 12 },
    },
  }
}

export function ensureDashboardChartTheme() {
  if (registered) return
  echarts.registerTheme(DASHBOARD_CHART_THEMES.light, dashboardTheme('light'))
  echarts.registerTheme(DASHBOARD_CHART_THEMES.dark, dashboardTheme('dark'))
  registered = true
}

/** Etkin moda göre tema adı + seri renkleri (tepkisel). */
export function useDashboardChartTheme() {
  ensureDashboardChartTheme()
  return {
    theme: computed(() => DASHBOARD_CHART_THEMES[appTheme.mode.value]),
    colors: computed(() => CHART_COLORS[appTheme.mode.value]),
  }
}
