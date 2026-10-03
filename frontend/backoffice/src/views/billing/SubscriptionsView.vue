<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="summary.updatedAt.value" :stale="summary.stale.value" refreshable :refreshing="summary.refreshing.value" @refresh="refresh" />

    <PageVerdict :verdict="verdict" />

    <BoTabs :tabs="TABS" fallback="abonelikler" label="Abonelik bölümleri">
      <template #default="{ tab }">
        <SubscriptionsPanel v-if="tab === 'abonelikler'" :key="`s${gen}`" />
        <RevenuePanel v-else :key="`r${gen}`" />
      </template>
    </BoTabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import BoTabs from '@bo/components/r2/BoTabs.vue'
import type { EkPageTab } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import { useVerdictSources } from '@bo/composables/useVerdictSources'
import SubscriptionsPanel from './SubscriptionsPanel.vue'
import RevenuePanel from './RevenuePanel.vue'
import { subscriptionsVerdict } from './billingVerdict'

/** Sekme sayısı: abonelik toplamı gelir özetinin durum dağılımından (+ muaf) okunur; özet gelene dek sayı gösterilmez. */
const totalSubs = computed(() => {
  const r = summary.sources.revenue.data.value
  return r ? Object.values(r.statusDistribution).reduce((a, b) => a + b, 0) + r.exemptSubscriptions : null
})
const TABS = computed<EkPageTab[]>(() => [
  { value: 'abonelikler', label: 'Abonelikler', icon: 'mdi-card-account-details-outline', count: totalSubs.value },
  { value: 'gelir', label: 'Gelir metrikleri', icon: 'mdi-chart-line' },
])
/** Sayfa "Yenile": hüküm kaynakları + açık sekme paneli birlikte tazelenir. */
const gen = ref(0)

// Hüküm (Durum -> Karar -> Eylem): hafif özet okumaları; panel ayrıntıyı (filtre, sayfalama, aralık) kendisi okur.
// Gelir özeti sabit 30 gün: panelin aralık seçimi hükmü değiştirmez.
const summary = useVerdictSources({
  revenue: () => api.call('BackofficeBillingService/getRevenueMetrics', { range: '30d' }),
  pastDue: () => api.call('BackofficeBillingService/listSubscriptions', { status: 'past_due', limit: 50 }),
  suspended: () => api.call('BackofficeBillingService/listSubscriptions', { status: 'suspended', limit: 50 }),
  trialing: () => api.call('BackofficeBillingService/listSubscriptions', { status: 'trialing', limit: 50 }),
})

const verdict = computed(() =>
  summary.settled.value
    ? subscriptionsVerdict({
        revenue: summary.sources.revenue.data.value,
        pastDue: summary.sources.pastDue.data.value,
        suspended: summary.sources.suspended.data.value,
        trialing: summary.sources.trialing.data.value,
        failed: { revenue: summary.failed('revenue'), pastDue: summary.failed('pastDue'), suspended: summary.failed('suspended'), trialing: summary.failed('trialing') },
        retry: () => summary.load(),
      })
    : null,
)

function refresh() {
  gen.value++
  void summary.load()
}
onMounted(() => void summary.load())
</script>
