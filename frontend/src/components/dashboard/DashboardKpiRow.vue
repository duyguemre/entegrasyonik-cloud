<!--
  Dashboard KPI satırı — `OrderService/getOrderDashboardInsights` (member).
  Her değer backend yanıtından BİREBİR gelir; türetilen tek şey son 7 günün toplamıdır
  (`last7Days[].count/revenue` toplamı). Değişim (%) yalnızca dünün değeri > 0 iken gösterilir:
  backend dün 0 iken bugün > 0 için sabit %100 döndürür — bu gerçek bir kıyas değildir.
-->
<template>
  <div class="dash-kpis" :aria-busy="loading || undefined">
    <EkMetricCard
      label="Bugünkü sipariş"
      icon="mdi-cart-outline"
      tone="action"
      :loading="loading"
      :value="fmt(data?.today.count)"
      :trend="countTrend"
      :description="yesterday ? `Dün (tüm gün): ${fmt(yesterday.count)} sipariş` : 'Bugün alınan siparişler'"
      data-kpi="today-count"
    />
    <EkMetricCard
      label="Bugünkü ciro"
      icon="mdi-cash-multiple"
      tone="success"
      :loading="loading"
      :value="money(data?.today.revenue)"
      :trend="revenueTrend"
      :description="yesterday ? `Dün (tüm gün): ${money(yesterday.revenue)}` : 'Bugünkü siparişlerin toplamı'"
      data-kpi="today-revenue"
    />
    <EkMetricCard
      label="Son 7 gün"
      icon="mdi-calendar-week-outline"
      tone="info"
      :loading="loading"
      :value="fmt(week.count)"
      :description="`sipariş · ${money(week.revenue)} ciro`"
      data-kpi="week-count"
    />
    <EkMetricCard
      label="Kargo bekleyen"
      icon="mdi-truck-fast-outline"
      :tone="(data?.pending.shippingCount ?? 0) > 0 ? 'warning' : 'neutral'"
      :loading="loading"
      :value="fmt(data?.pending.shippingCount)"
      description="Onaylı, kargolanmamış sipariş"
      data-kpi="pending-shipping"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkMetricCard } from '@entegrasyonik/ui/components'
import { formatMoney, formatNumber } from '@entegrasyonik/ui/format'
import type { OrderInsights } from './dashboardTypes'

const props = defineProps<{ data: OrderInsights | null; loading: boolean }>()

const fmt = (v: number | undefined) => formatNumber(v ?? 0)
const money = (v: number | undefined) => formatMoney(v ?? 0)

// `last7Days` bugün dahil 7 gün, sıralı; sondan ikinci eleman dündür.
const yesterday = computed(() => {
  const days = props.data?.last7Days ?? []
  return days.length >= 2 ? days[days.length - 2] : null
})

const week = computed(() =>
  (props.data?.last7Days ?? []).reduce(
    (acc, d) => ({ count: acc.count + (d.count ?? 0), revenue: acc.revenue + (d.revenue ?? 0) }),
    { count: 0, revenue: 0 },
  ),
)

const trendOf = (change: number | undefined, base: number | undefined) => {
  if (!base || change === undefined || change === 0) return undefined
  return { direction: change < 0 ? ('down' as const) : ('up' as const), text: `%${Math.abs(change)}` }
}

const countTrend = computed(() => trendOf(props.data?.trend.countChange, yesterday.value?.count))
const revenueTrend = computed(() => trendOf(props.data?.trend.revenueChange, yesterday.value?.revenue))
</script>

<style scoped>
.dash-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ek-space-4);
}

@media (max-width: 1199px) {
  .dash-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 599px) {
  .dash-kpis {
    /* Aşama 4: 2 sütun (kart dar ekranda sütun düzenine geçer). */
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ek-space-3);
  }
}
</style>
