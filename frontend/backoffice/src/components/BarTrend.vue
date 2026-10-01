<!--
  BarTrend — olay sayısı eğilimi (saatlik/günlük kova). BO2-60: çizim BoChart'ta (ECharts, token teması, ipucu, "Tablo
  olarak göster"); bu bileşen yalnız eski API'yi korur.
-->
<template>
  <BoChart kind="bar" :height="120" :categories="categories" :series="[{ name: 'Olay', data: points.map((p) => p.count), tone: 'action' }]" :summary="label" :category-label="bucket === 'day' ? 'Gün' : 'Saat'" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BoChart from './charts/BoChart.vue'

const props = defineProps<{ points: Array<{ t: string; count: number }>; bucket: 'hour' | 'day'; label: string }>()
const categories = computed(() =>
  props.points.map((p) =>
    new Intl.DateTimeFormat('tr-TR', props.bucket === 'day' ? { day: '2-digit', month: 'short' } : { hour: '2-digit', minute: '2-digit' }).format(new Date(p.t)),
  ),
)
</script>
