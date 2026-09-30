// `entegrasyonik` ECharts teması (site profili token değerleri; ADR-0015 Karar 3.6). Kayıt tembel
// tüketicilerin modül kapsamında yapılır — `main.ts` echarts'i statik çekince `vendor-echarts`
// açılış paketine giriyordu (FRONTEND_CLEANUP_PLAN V-01). Desen: `dashboard/chartTheme.ts`.
import * as echarts from 'echarts/core'
import { buildEchartsTheme } from '@/design/echarts-theme'
import { semanticColorsLight } from '@/design/tokens'

export const SITE_CHART_THEME = 'entegrasyonik'

let registered = false

export function ensureSiteChartTheme() {
  if (registered) return
  echarts.registerTheme(SITE_CHART_THEME, buildEchartsTheme(semanticColorsLight))
  registered = true
}
