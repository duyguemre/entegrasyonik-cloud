<!--
  frontend/src/components/claim/ClaimListDashboard.vue

  FE-LOCAL-1043 — İade talepleri sayfasının "Özet" görünümü (Liste | Özet anahtarıyla listenin yerine açılır).
    1) İade özeti — işlem bekleyen (TIKLAYINCA listeye dönülür, işlem bekleyen taleplere süzülür) / toplam iade /
       iade tutarı / iade oranı
    2) Oranlar — iadenin sipariş adedi ve ciro içindeki payı (oran çubukları)
    3) Sipariş durumları — iptal ve iade edilenlerin tüm siparişler içindeki yeri
  Veri: `OrderService/getOrderDashboardInsights` (pending.claimCount, totals.*, statusDistribution). Backend'de iade
  taleplerine özel istatistik ucu yok; burada yalnız bu sayılar ve oranları gösterilir (uydurma sayı yok).
-->
<template>
  <div class="cld">
    <ListDashSection label="İade özeti">
      <ListSummaryStrip :cells="cells" :loading="loading" label="İade özeti" @select="onSelect" />
    </ListDashSection>

    <ListDashSection label="Oranlar">
      <div class="cld__ratios">
        <div v-for="r in ratios" :key="r.key" class="cld__ratio">
          <p class="cld__ratio-label">{{ r.label }}</p>
          <p class="cld__ratio-value"><strong class="ek-num">{{ r.pct }}</strong><span>{{ r.detail }}</span></p>
          <div class="cld__bar" aria-hidden="true"><span class="cld__bar-fill" :style="{ width: `${r.width}%` }"></span></div>
        </div>
      </div>
    </ListDashSection>

    <ListDashSection label="Sipariş durumları">
      <OrderStatusCard :data="insights.data.value" :loading="loading" :error="insights.state.value === 'error'" @retry="insights.load" />
    </ListDashSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { formatMoney, formatNumber, formatPercent } from '@entegrasyonik/ui/format'
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import OrderStatusCard from '@/components/dashboard/OrderStatusCard.vue'
import { useDashboardResource } from '@/components/dashboard/useDashboardResource'
import { isOrderInsights, type OrderInsights } from '@/components/dashboard/dashboardTypes'

/** İşlem bekleyen talep durumları (ana sayfadaki "iade talebini sonuçlandırın" göreviyle aynı küme). */
const PENDING_STATUSES = ['WAITING', 'DELIVERED', 'SHIPPED']

const props = defineProps<{ active: string[] }>()
const emit = defineEmits<{ select: [statuses: string[]] }>()

const insights = useDashboardResource<OrderInsights>('OrderService/getOrderDashboardInsights', () => ({}), isOrderInsights)
const loading = computed(() => insights.state.value === 'loading')
const pendingActive = computed(() => props.active.length === PENDING_STATUSES.length && PENDING_STATUSES.every((s) => props.active.includes(s)))

const cells = computed<ListSummaryCell[]>(() => {
  const d = insights.data.value
  const pending = d?.pending.claimCount ?? 0
  const returns = d?.totals.returnCount ?? 0
  const orders = d?.totals.orderCount ?? 0
  return [
    { key: 'pending', label: 'İşlem bekleyen', hint: 'Onay ya da ret bekliyor', icon: 'mdi-clock-outline', tone: 'warning', value: formatNumber(pending), zero: pending === 0, clickable: true, active: pendingActive.value },
    { key: 'returns', label: 'Toplam iade', hint: 'Tüm siparişlerde', icon: 'mdi-undo-variant', tone: 'info', value: formatNumber(returns), zero: returns === 0 },
    { key: 'amount', label: 'İade tutarı', hint: 'İade edilen toplam', icon: 'mdi-cash-refund', tone: 'error', value: formatMoney(d?.totals.returnAmount ?? 0), zero: !d?.totals.returnAmount },
    { key: 'rate', label: 'İade oranı', hint: `${formatNumber(orders)} sipariş içinde`, icon: 'mdi-percent-outline', tone: 'action', value: orders > 0 ? formatPercent(returns / orders) : '—', zero: orders === 0 || returns === 0 },
  ]
})

const ratios = computed(() => {
  const t = insights.data.value?.totals
  const orders = t?.orderCount ?? 0
  const revenue = t?.revenue ?? 0
  const countShare = orders > 0 ? (t?.returnCount ?? 0) / orders : 0
  const amountShare = revenue > 0 ? (t?.returnAmount ?? 0) / revenue : 0
  return [
    { key: 'count', label: 'İade / sipariş adedi', pct: orders > 0 ? formatPercent(countShare) : '—', detail: `${formatNumber(t?.returnCount ?? 0)} iade · ${formatNumber(orders)} sipariş`, width: Math.min(100, Math.round(countShare * 100)) },
    { key: 'amount', label: 'İade tutarı / ciro', pct: revenue > 0 ? formatPercent(amountShare) : '—', detail: `${formatMoney(t?.returnAmount ?? 0)} iade · ${formatMoney(revenue)} ciro`, width: Math.min(100, Math.round(amountShare * 100)) },
  ]
})

function onSelect(key: string) {
  if (key === 'pending') emit('select', pendingActive.value ? [] : PENDING_STATUSES)
}

const refresh = () => insights.load()
onMounted(refresh)
defineExpose({ refresh })
</script>

<style scoped>
.cld {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}

/* Oran kartı: iki hücre, arada ince çizgi (şeritlerle aynı dil). */
.cld__ratios {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-border-subtle);
  box-shadow: var(--ek-shadow-card);
}

.cld__ratio {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-4) var(--ek-space-5);
  background: var(--ek-color-surface);
}

.cld__ratio-label {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.cld__ratio-value {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-3);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.cld__ratio-value strong {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  line-height: 1.15;
  font-weight: var(--ek-type-metric-weight);
  letter-spacing: -0.02em;
}

.cld__bar {
  height: 8px;
  overflow: hidden;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-sunken);
}

.cld__bar-fill {
  display: block;
  height: 100%;
  min-width: 2px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-error);
}

@media (max-width: 767px) {
  .cld__ratios {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
