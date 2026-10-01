/**
 * ECharts kaydı — TEK yer, tree-shaken: yalnız kullanılan çizim türleri + SVG çizici (keskin, ölçeklenir, testte tuval
 * gerekmez). Tema iki kez kaydedilir (açık/koyu); `BoChart` etkin temaya göre adı seçer.
 */
import { registerTheme, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { CHART_THEME_NAME, buildChartTheme } from './chartTheme'

let done = false
export function registerCharts() {
  if (done) return
  done = true
  use([SVGRenderer, BarChart, LineChart, PieChart, GridComponent, TooltipComponent, MarkLineComponent])
  registerTheme(CHART_THEME_NAME.light, buildChartTheme('light'))
  registerTheme(CHART_THEME_NAME.dark, buildChartTheme('dark'))
}
