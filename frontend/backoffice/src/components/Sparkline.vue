<!--
  Sparkline — satır içi küçük eğilim çizgisi. BO2-60: çizim ortak grafik sarmalayıcısında (BoChart, ECharts, token teması);
  bu bileşen yalnız eski API'yi (`values`, `label`, `tone`) korur. Erişilebilir ad `label` (+ türetilen özet).
-->
<template>
  <BoChart class="bo-spark" kind="sparkline" :height="28" :series="[{ name: label, data: values, tone: chartTone }]" :summary="label" :table="false" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BoChart from './charts/BoChart.vue'

const props = withDefaults(defineProps<{ values: number[]; label: string; tone?: 'action' | 'error' | 'warning' | 'neutral' }>(), { tone: 'action' })
const chartTone = computed(() => props.tone)
</script>

<style scoped>
.bo-spark {
  width: 100%;
}

.bo-spark :deep(.bo-chart__msg) {
  min-height: 28px !important;
  padding: 0;
  border: 0;
}
</style>
