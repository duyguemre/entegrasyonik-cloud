/**
 * frontend/src/design/echarts-theme.ts
 *
 * ADR-0015 Karar 3.6 — ECharts tema adaptörü. SAF TS (Vue import'u YASAK;
 * yalnızca `tokens/**`'ten değer okur). ECharts CANVAS çizer, CSS değişkeni
 * OKUYAMAZ (ADR-0011 Karar 2 istisnası) — bu yüzden token'lar burada JS
 * DEĞERİ olarak `buildEchartsTheme(tokens)`'a geçirilir, literal renk
 * YAZILMAZ.
 *
 * **Kullanım (A5/B3'ün işi — bu dosya yalnızca adaptörü HAZIRLAR, mevcut 4
 * tüketiciyi [StatisticsComponent, DetailedImportLogReport,
 * DetailedExportLogReport, AdminSystemManagementView] henüz YENİDEN
 * BAĞLAMAZ, çünkü bunlar dashboard/B3 kapsamındadır):
 *
 * ```ts
 * // Tembel tüketicinin modül kapsamında (main.ts'te DEĞİL — açılış paketi, V-01):
 * import { ensureSiteChartTheme } from '@/components/charts/siteChartTheme'
 * ensureSiteChartTheme()
 *
 * // Bileşende:
 * // <v-chart theme="entegrasyonik" ... />
 * ```
 */
import type { SemanticColorKey } from './tokens/semantic'
import { sky, green, amberScale, red, slate } from './tokens/palette'
import { shadow, radius } from './tokens/scale'
import { JOB_STATUS_TONE, type JobStatus, type StatusTone } from './status-map'

/**
 * Karar 3.6 — kategorik palet (`chart-1..5`), her biri `surface` üzerinde
 * ≥3:1 (WCAG 1.4.11, `chart-token.test.ts` ile doğrulanır). 5'ten fazla seri
 * gerekiyorsa "Diğer" altında toplanır (tüketicinin sorumluluğu).
 */
export function buildChartCategoricalPalette(primaryHex: string, secondaryDarkenHex: string): string[] {
  return [
    primaryHex, // primary — 14,55:1
    secondaryDarkenHex, // secondary-darken-1 — 4,36:1
    sky[700], // 5,93:1
    amberScale[700], // 5,02:1
    slate[500], // 4,76:1
  ]
}

/**
 * Karar 3.3 — "canlı iş-durumu paleti" KARARI: iş durumları anlamsal tonlara
 * eşlenir, özel/bespoke renk kullanılmaz. `CHART_STATUS`, TEK KAYNAK olan
 * `status-map.ts`'in `JOB_STATUS_TONE`'undan TÜRETİLİR (aynı 5 iş durumu,
 * grafik ve `EkStatusChip` AYNI eşlemeyi kullanır — iki yerde tanımlanmaz).
 */
export type ChartStatusKey = JobStatus

/** `StatusTone` (`danger`) → `SemanticColorKey` (`error`) — grafik dolgu rengi çekirdek tema anahtarından okunur. */
function statusToneToSemanticKey(tone: StatusTone): Extract<SemanticColorKey, 'neutral' | 'info' | 'success' | 'warning' | 'error'> {
  return tone === 'danger' ? 'error' : tone
}

export const CHART_STATUS: Record<ChartStatusKey, Extract<SemanticColorKey, 'neutral' | 'info' | 'success' | 'warning' | 'error'>> = {
  queued: statusToneToSemanticKey(JOB_STATUS_TONE.queued.tone),
  processing: statusToneToSemanticKey(JOB_STATUS_TONE.processing.tone),
  completed: statusToneToSemanticKey(JOB_STATUS_TONE.completed.tone),
  partial: statusToneToSemanticKey(JOB_STATUS_TONE.partial.tone),
  failed: statusToneToSemanticKey(JOB_STATUS_TONE.failed.tone),
}

/** `CHART_STATUS`'daki bir iş durumu için tema kaynağından dolgu rengini okur. */
export function chartStatusFill(
  status: ChartStatusKey,
  tokens: Record<SemanticColorKey, string>,
): string {
  return tokens[CHART_STATUS[status]]
}

/**
 * ECharts `registerTheme()` biçiminde minimal, kurumsal-premium tema nesnesi.
 * Karar 3.6 stil kuralları: eksen/ızgara `border-default`, etiket `content-muted`
 * Inter, çubuk üst radius 4 (degrade/gölge YOK), tooltip `surface`+gölge,
 * lejant altta, `animationDuration<=250`, overshoot YOK (`quadraticOut`).
 */
export function buildEchartsTheme(tokens: Record<SemanticColorKey, string>) {
  return {
    color: buildChartCategoricalPalette(tokens.primary, tokens['secondary-darken-1']),
    textStyle: { fontFamily: "'Inter', sans-serif" },
    grid: { borderColor: tokens['border-default'] },
    categoryAxis: {
      axisLine: { lineStyle: { color: tokens['border-default'] } },
      axisTick: { show: false },
      axisLabel: { color: tokens['content-muted'], fontSize: 12 },
      splitLine: { show: false },
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: tokens['content-muted'], fontSize: 12 },
      splitLine: { lineStyle: { color: tokens['border-default'], type: 'solid' } },
    },
    bar: {
      itemStyle: { borderRadius: [4, 4, 0, 0] },
    },
    legend: {
      bottom: 0,
      textStyle: { color: tokens['content-default'] },
    },
    tooltip: {
      backgroundColor: tokens.surface,
      borderColor: tokens['border-default'],
      borderWidth: 1,
      textStyle: { color: tokens['content-strong'] },
      extraCssText: `border-radius: ${radius.lg}px; box-shadow: ${shadow.light.md};`,
    },
    animationDuration: 250,
    animationEasing: 'quadraticOut',
    animationDurationUpdate: 0,
  }
}

// Diğer 700-tier durum primitifleri (dokümantasyon/test amaçlı yeniden
// dışa aktarım — `chart-1..5`'in AA/3:1 birim testi bunları doğrudan
// palette.ts'ten değil, bu modülden de okuyabilir).
export { green, red }
