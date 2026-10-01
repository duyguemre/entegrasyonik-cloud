<!--
  SeriesBars — zaman serisi için yığılmış sütun grafiği (ör. saatlik işlenen + başarısız). BO2-60: çizim ortak grafik
  sarmalayıcısında (BoChart — ECharts, token teması, lejant, ipucu, "Tablo olarak göster", erişilebilir özet); bu
  bileşen yalnız seri sözleşmesini (`points`, `series`, `bucket`) korur.
-->
<template>
  <BoChart kind="stacked-bar" :height="height" :categories="categories" :series="chartSeries" :summary="label" :category-label="bucket === 'day' ? 'Gün' : 'Saat'" legend />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BoChart from '../charts/BoChart.vue'
import type { ChartTone } from '../charts/chartTheme'

export interface SeriesDef {
  key: string
  label: string
  /** Grafik temasının tonları (bo-r2b: masaüstü serisi `info`). */
  tone: ChartTone
}
export interface SeriesPoint {
  t: string
  values: Record<string, number>
}
const props = withDefaults(defineProps<{ points: SeriesPoint[]; series: SeriesDef[]; label: string; bucket?: 'hour' | 'day'; height?: number }>(), { bucket: 'hour', height: 160 })

const categories = computed(() =>
  props.points.map((p) =>
    new Intl.DateTimeFormat('tr-TR', props.bucket === 'day' ? { day: '2-digit', month: 'short' } : { hour: '2-digit', minute: '2-digit' }).format(new Date(p.t)),
  ),
)
const chartSeries = computed(() => props.series.map((s) => ({ name: s.label, tone: s.tone, data: props.points.map((p) => p.values[s.key] ?? 0) })))
</script>
