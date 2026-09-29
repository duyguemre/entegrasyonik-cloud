<!--
  Sipariş durum dağılımı — `getOrderDashboardInsights.statusDistribution` (tüm zamanlar, iç durum).
  Halka grafik + durum listesi; ton `status-map.ts` `ORDER_STATUS_TONE`'dan (ekran renk seçmez).
  Satıra tıklamak sipariş listesini o durum filtresiyle açar (`internalStatuses`).
-->
<template>
  <EkCard
    title="Sipariş durumları"
    subtitle="Tüm siparişlerin iç durum dağılımı"
    icon="mdi-chart-donut"
    :heading-level="2"
    :to-label="linkable ? 'Sipariş listesini aç' : undefined"
    class="dash-status"
    @open="open('orderList')"
  >
    <div v-if="loading" class="dash-status__layout" aria-hidden="true">
      <span class="dash-status__ring-skeleton"></span>
      <div class="dash-status__rows-skeleton"><span v-for="n in 5" :key="n"></span></div>
    </div>
    <EkErrorState v-else-if="error" size="inline" message="Sipariş durumları yüklenemedi — tekrar deneyin." @retry="emit('retry')" />
    <DashboardEmpty
      v-else-if="total === 0"
      icon="mdi-cart-outline"
      title="Henüz sipariş yok"
      text="İlk sipariş geldiğinde durum dağılımı burada görünür."
    />
    <div v-else class="dash-status__layout">
      <div class="dash-status__ring">
        <v-chart class="dash-status__chart" :theme="DASHBOARD_CHART_THEME" :option="option" autoresize aria-hidden="true" />
        <div class="dash-status__center" aria-hidden="true">
          <span class="dash-status__total">{{ fmt(total) }}</span>
          <span class="dash-status__total-label">sipariş</span>
        </div>
      </div>
      <ul class="dash-status__list" aria-label="Duruma göre sipariş sayıları">
        <li v-for="row in rows" :key="row.status">
          <component
            :is="linkable ? 'button' : 'div'"
            :type="linkable ? 'button' : undefined"
            class="dash-status__row"
            :class="{ 'dash-status__row--link': linkable }"
            :aria-label="linkable ? `${row.label}: ${fmt(row.count)} sipariş — listede göster` : undefined"
            @click="linkable && open('orderList', { internalStatuses: [row.status] })"
          >
            <span class="dash-status__swatch" :class="`dash-status__swatch--${row.swatch}`" aria-hidden="true"></span>
            <span class="dash-status__label">{{ row.label }}</span>
            <span class="dash-status__count ek-num">{{ fmt(row.count) }}</span>
            <span class="dash-status__pct ek-num">{{ pct(row.count) }}</span>
          </component>
        </li>
      </ul>
    </div>
  </EkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import EkCard from '@/components/ds/EkCard.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import DashboardEmpty from './DashboardEmpty.vue'
import { formatNumber, formatPercent } from '@/composables/format'
import { ORDER_STATUS_TONE, type StatusTone } from '@/design/status-map'
import { OrderInternalStatusEnum } from '@/types/OrderTypes'
import { DASHBOARD_CHART_THEME, chartColors, ensureDashboardChartTheme } from './chartTheme'
import { useDashboardNavigation } from './useDashboardNavigation'
import type { OrderInsights } from './dashboardTypes'

use([CanvasRenderer, PieChart, TooltipComponent])
ensureDashboardChartTheme()

const props = defineProps<{ data: OrderInsights | null; loading: boolean; error: boolean }>()
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
const { canOpen, open } = useDashboardNavigation()
const linkable = computed(() => canOpen('orderList'))

const ORDER: OrderInternalStatusEnum[] = [
  OrderInternalStatusEnum.UNAPPROVED,
  OrderInternalStatusEnum.AWAITING_APPROVAL,
  OrderInternalStatusEnum.APPROVED,
  OrderInternalStatusEnum.SHIPPED,
  OrderInternalStatusEnum.DELIVERED,
  OrderInternalStatusEnum.CANCELLED,
  OrderInternalStatusEnum.RETURNED,
]

// Aynı tondaki ikinci durum, tonun koyu (`-emphasis`) adımıyla ayrışır; anlamı yine etiket taşır.
type Swatch = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'warning-2' | 'info-2' | 'danger-2'
const toneColor: Record<Swatch, string> = {
  success: chartColors.success,
  warning: chartColors.warning,
  'warning-2': chartColors['warning-emphasis'],
  info: chartColors.info,
  'info-2': chartColors['info-emphasis'],
  danger: chartColors.error,
  'danger-2': chartColors['error-emphasis'],
  neutral: chartColors.neutral,
}

const fmt = (v: number) => formatNumber(v ?? 0)
const total = computed(() => ORDER.reduce((a, s) => a + (props.data?.statusDistribution?.[s] ?? 0), 0))
const pct = (v: number) => (total.value ? formatPercent(v / total.value) : '')

const rows = computed(() => {
  const seen = new Set<StatusTone>()
  return ORDER.map((status) => {
    const tone = ORDER_STATUS_TONE[status].tone
    const swatch = (seen.has(tone) ? `${tone}-2` : tone) as Swatch
    seen.add(tone)
    return { status, label: t(ORDER_STATUS_TONE[status].labelKey), count: props.data?.statusDistribution?.[status] ?? 0, swatch }
  })
})

const option = computed(() => ({
  tooltip: {
    trigger: 'item',
    formatter: (p: any) => `${p.name}<br/><strong>${fmt(p.value)}</strong> sipariş (${pct(p.value)})`,
  },
  series: [
    {
      type: 'pie',
      radius: ['68%', '92%'],
      avoidLabelOverlap: true,
      label: { show: false },
      labelLine: { show: false },
      itemStyle: { borderColor: chartColors.surface, borderWidth: 2 },
      emphasis: { scale: false },
      data: rows.value
        .filter((r) => r.count > 0)
        .map((r) => ({ name: r.label, value: r.count, itemStyle: { color: toneColor[r.swatch] } })),
    },
  ],
}))
</script>

<style scoped>
.dash-status__layout {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  align-items: center;
  gap: var(--ek-space-5);
}

.dash-status__ring {
  position: relative;
  width: 168px;
  height: 168px;
}

.dash-status__chart {
  width: 100%;
  height: 100%;
}

.dash-status__center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.dash-status__total {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  line-height: var(--ek-type-metric-line);
  font-weight: var(--ek-type-metric-weight);
  font-variant-numeric: tabular-nums;
}

.dash-status__total-label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dash-status__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dash-status__row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto 48px;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 32px;
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
  text-align: left;
}

.dash-status__row--link {
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.dash-status__row--link:hover {
  background: var(--ek-color-surface-muted);
}

.dash-status__row--link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.dash-status__swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--ek-color-neutral);
}

.dash-status__swatch--success { background: var(--ek-color-success); }
.dash-status__swatch--warning { background: var(--ek-color-warning); }
.dash-status__swatch--warning-2 { background: var(--ek-color-warning-emphasis); }
.dash-status__swatch--info { background: var(--ek-color-info); }
.dash-status__swatch--info-2 { background: var(--ek-color-info-emphasis); }
.dash-status__swatch--danger { background: var(--ek-color-error); }
.dash-status__swatch--danger-2 { background: var(--ek-color-error-emphasis); }

.dash-status__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dash-status__count {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.dash-status__pct {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  text-align: right;
}

.dash-status__ring-skeleton {
  width: 168px;
  height: 168px;
  border-radius: 50%;
  border: 24px solid var(--ek-color-surface-sunken);
}

.dash-status__rows-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.dash-status__rows-skeleton span {
  height: 16px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}


.dash-status {
  container-type: inline-size;
}

@container (max-width: 440px) {
  .dash-status__layout {
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
  }

  .dash-status__list {
    width: 100%;
  }
}
</style>
