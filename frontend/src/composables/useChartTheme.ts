/**
 * FR2-DARK — genel ECharts teması (`entegrasyonik`) light + dark kaydı ve etkin moda göre tema adı.
 * `echarts-theme.ts` saf TS kalır (Vue yok); tepkisel tema seçimi burada. Tüketici: `<v-chart :theme="chartTheme">`.
 */
import { computed } from 'vue'
import * as echarts from 'echarts/core'
import { appSemanticColorsDark, semanticColorsLight } from '@entegrasyonik/ui/tokens'
import { buildEchartsTheme } from '@/design/echarts-theme'
import { appTheme, type ThemeMode } from '@/stores/theme'

export const CHART_THEMES: Record<ThemeMode, string> = { light: 'entegrasyonik', dark: 'entegrasyonik-dark' }

export function registerChartThemes() {
  echarts.registerTheme(CHART_THEMES.light, buildEchartsTheme(semanticColorsLight, 'light'))
  echarts.registerTheme(CHART_THEMES.dark, buildEchartsTheme(appSemanticColorsDark, 'dark'))
}

export function useChartTheme() {
  return computed(() => CHART_THEMES[appTheme.mode.value])
}

/** Grafik seçeneklerinde (canvas) kullanılan token değerleri — etkin moda göre (tepkisel). */
export const CHART_TOKEN_COLORS = { light: semanticColorsLight, dark: appSemanticColorsDark } as const

export function useChartColors() {
  return computed(() => CHART_TOKEN_COLORS[appTheme.mode.value])
}
