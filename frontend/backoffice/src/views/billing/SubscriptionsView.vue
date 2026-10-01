<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="summary.updatedAt.value" :stale="summary.stale.value">
      <template #actions>
        <BoAction kind="refresh" :loading="summary.refreshing.value" data-page-refresh @click="refresh" />
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <EkPageTabs v-model="tab" :tabs="TABS" label="Abonelik bölümleri" />

    <SubscriptionsPanel v-if="tab === 'abonelikler'" :key="`s${gen}`" />
    <RevenuePanel v-else :key="`r${gen}`" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { EkPageTabs } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import { useTabQuery } from '@bo/composables/useTabQuery'
import { useVerdictSources } from '@bo/composables/useVerdictSources'
import SubscriptionsPanel from './SubscriptionsPanel.vue'
import RevenuePanel from './RevenuePanel.vue'
import { subscriptionsVerdict } from './billingVerdict'

const TAB_VALUES = ['abonelikler', 'gelir'] as const
const tab = useTabQuery(TAB_VALUES, 'abonelikler')
const TABS = [
  { value: 'abonelikler', label: 'Abonelikler', icon: 'mdi-card-account-details-outline' },
  { value: 'gelir', label: 'Gelir metrikleri', icon: 'mdi-chart-line' },
]
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
