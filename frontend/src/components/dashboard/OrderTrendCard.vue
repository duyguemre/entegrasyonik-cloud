<!--
  Son 7 gün sipariş/ciro grafiği — `getOrderDashboardInsights.last7Days` (backend, Europe/Istanbul
  günleri). Çubuk = sipariş adedi, çizgi = ciro (ikinci eksen). Ekran okuyucu için aynı veri
  görünmez bir tabloyla da verilir (grafik canvas'tır).
-->
<template>
  <EkCard
    title="Son 7 gün"
    subtitle="Günlük sipariş adedi ve ciro"
    icon="mdi-chart-bar"
    :heading-level="3"
    :to-label="canOpen('orderList') ? 'Sipariş listesini aç' : undefined"
    class="dash-trend"
    @open="open('orderList')"
  >
    <!-- Lejant başlık satırında (grafiğe dikey yer kalsın). -->
    <template v-if="!loading && !error && hasData" #actions>
      <div class="dash-trend__legend" aria-hidden="true">
        <span class="dash-trend__key dash-trend__key--count">Sipariş</span>
        <span class="dash-trend__key dash-trend__key--revenue">Ciro</span>
      </div>
    </template>
    <div v-if="loading" class="dash-trend__skeleton" aria-hidden="true">
      <span v-for="n in 7" :key="n" class="dash-trend__bar" :class="`dash-trend__bar--${n}`"></span>
    </div>
    <EkErrorState v-else-if="error" size="inline" message="Sipariş verileri yüklenemedi — tekrar deneyin." @retry="emit('retry')" />
    <DashboardEmpty
      v-else-if="!hasData"
      icon="mdi-chart-bar"
      title="Son 7 günde sipariş yok"
      text="Pazaryerlerinden sipariş geldikçe günlük dağılım burada görünür."
    />
    <template v-else>
      <v-chart
        class="dash-trend__chart"
        :theme="chartTheme"
        :option="option"
        autoresize
        role="img"
        :aria-label="ariaSummary"
      />
      <table class="ek-sr-only">
        <caption>Son 7 gün günlük sipariş ve ciro</caption>
        <thead><tr><th scope="col">Gün</th><th scope="col">Sipariş</th><th scope="col">Ciro</th></tr></thead>
        <tbody>
          <tr v-for="d in days" :key="d.date"><td>{{ dayLabel(d.date) }}</td><td>{{ fmt(d.count) }}</td><td>{{ money(d.revenue) }}</td></tr>
        </tbody>
      </table>
    </template>
  </EkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { EkCard, EkErrorState } from '@entegrasyonik/ui/components'
import DashboardEmpty from './DashboardEmpty.vue'
import { formatMoney, formatNumber } from '@entegrasyonik/ui/format'
import { useDashboardChartTheme } from './chartTheme'
import { useDashboardNavigation } from './useDashboardNavigation'
import type { OrderInsights } from './dashboardTypes'

use([CanvasRenderer, BarChart, LineChart, GridComponent, TooltipComponent])
// FR2-DARK: tema adı ve seri renkleri etkin moda göre (light/dark).
const { theme: chartTheme, colors: themeColors } = useDashboardChartTheme()

const props = defineProps<{ data: OrderInsights | null; loading: boolean; error: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { canOpen, open } = useDashboardNavigation()

const fmt = (v: number) => formatNumber(v ?? 0)
const money = (v: number) => formatMoney(v ?? 0)

const WEEKDAYS = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
// `date` = 'YYYY-MM-DD' (platform günü). Gün adı UTC öğlesinden hesaplanır → saat dilimi kayması yok.
const dayLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  const wd = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12)).getUTCDay()
  return `${WEEKDAYS[wd]} ${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}`
}

const days = computed(() => props.data?.last7Days ?? [])
const hasData = computed(() => days.value.some((d) => (d.count ?? 0) > 0 || (d.revenue ?? 0) > 0))

const ariaSummary = computed(() => {
  const total = days.value.reduce((a, d) => a + (d.count ?? 0), 0)
  const peak = days.value.reduce((best, d) => ((d.count ?? 0) > (best?.count ?? -1) ? d : best), days.value[0])
  return `Son 7 günde ${fmt(total)} sipariş; en yoğun gün ${peak ? dayLabel(peak.date) : '-'} (${fmt(peak?.count ?? 0)} sipariş). Ayrıntı tabloda.`
})

const option = computed(() => {
  const chartColors = themeColors.value
  return {
  grid: { top: 16, right: 8, bottom: 4, left: 8, containLabel: true },
  tooltip: {
    trigger: 'axis',
    axisPointer: { type: 'shadow', shadowStyle: { color: chartColors['action-subtle'] } },
    formatter: (items: any[]) => {
      const i = items?.[0]?.dataIndex ?? 0
      const d = days.value[i]
      if (!d) return ''
      return `<strong>${dayLabel(d.date)}</strong><br/>Sipariş: ${fmt(d.count)}<br/>Ciro: ${money(d.revenue)}`
    },
  },
  xAxis: { type: 'category', data: days.value.map((d) => dayLabel(d.date)) },
  yAxis: [
    { type: 'value', minInterval: 1, axisLabel: { formatter: (v: number) => fmt(v) } },
    { type: 'value', splitLine: { show: false }, axisLabel: { show: false } },
  ],
  series: [
    {
      name: 'Sipariş',
      type: 'bar',
      barMaxWidth: 22,
      itemStyle: { color: chartColors.action, borderRadius: [3, 3, 0, 0] },
      emphasis: { itemStyle: { color: chartColors['action-hover'] } },
      data: days.value.map((d) => d.count ?? 0),
    },
    {
      name: 'Ciro',
      type: 'line',
      yAxisIndex: 1,
      smooth: false,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: { width: 2, color: chartColors.success },
      itemStyle: { color: chartColors.success },
      data: days.value.map((d) => d.revenue ?? 0),
    },
  ],
}
})
</script>

<style scoped>
.dash-trend :deep(.ek-card__body) {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding-top: var(--ek-space-4);
}

/* C3: satır komşusu (durum dağılımı) daha uzunsa grafik kalan yüksekliği doldurur (autoresize); en az 232px. */
.dash-trend__chart {
  flex: 1 1 232px;
  width: 100%;
  min-height: 232px;
}

.dash-trend__legend {
  display: flex;
  gap: var(--ek-space-4);
  margin-right: var(--ek-space-2);
  white-space: nowrap;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dash-trend__key {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.dash-trend__key::before {
  content: '';
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--ek-color-action);
}

.dash-trend__key--revenue::before {
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-success);
}

.dash-trend__skeleton {
  display: flex;
  align-items: flex-end;
  gap: var(--ek-space-4);
  height: 272px;
  padding: var(--ek-space-4) var(--ek-space-2) 0;
}

.dash-trend__bar {
  flex: 1;
  border-radius: 4px 4px 0 0;
  background: var(--ek-color-surface-sunken);
}

.dash-trend__bar--1 { height: 35%; }
.dash-trend__bar--2 { height: 55%; }
.dash-trend__bar--3 { height: 42%; }
.dash-trend__bar--4 { height: 70%; }
.dash-trend__bar--5 { height: 50%; }
.dash-trend__bar--6 { height: 80%; }
.dash-trend__bar--7 { height: 30%; }

</style>
