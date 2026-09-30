<template>
  <div class="bo-page">
    <BoPageHeader />

    <EkPageTabs v-model="tab" :tabs="TABS" label="Abonelik bölümleri" />

    <SubscriptionsPanel v-if="tab === 'abonelikler'" />
    <RevenuePanel v-else />
  </div>
</template>

<script setup lang="ts">
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import { EkPageTabs } from '@entegrasyonik/ui/components'
import { useTabQuery } from '@bo/composables/useTabQuery'
import SubscriptionsPanel from './SubscriptionsPanel.vue'
import RevenuePanel from './RevenuePanel.vue'

const TAB_VALUES = ['abonelikler', 'gelir'] as const
const tab = useTabQuery(TAB_VALUES, 'abonelikler')
const TABS = [
  { value: 'abonelikler', label: 'Abonelikler', icon: 'mdi-card-account-details-outline' },
  { value: 'gelir', label: 'Gelir metrikleri', icon: 'mdi-chart-line' },
]
</script>
