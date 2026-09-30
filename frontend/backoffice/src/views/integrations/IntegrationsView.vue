<template>
  <div class="bo-page">
    <BoPageHeader />

    <EkPageTabs v-model="tab" :tabs="tabs" label="Entegrasyon bölümleri" />

    <ApiHealthPanel v-if="tab === 'saglik'" />
    <ResiliencePanel v-else-if="tab === 'dayaniklilik'" />
    <CatalogPanel v-else />
  </div>
</template>

<script setup lang="ts">
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import { EkPageTabs, type EkPageTab } from '@entegrasyonik/ui/components'
import { useTabQuery } from '@bo/composables/useTabQuery'
import ApiHealthPanel from './ApiHealthPanel.vue'
import ResiliencePanel from './ResiliencePanel.vue'
import CatalogPanel from './CatalogPanel.vue'
import '@bo/styles/kit.css'

const TABS = ['saglik', 'dayaniklilik', 'katalog'] as const
const tab = useTabQuery(TABS, 'saglik')
const tabs: EkPageTab[] = [
  { value: 'saglik', label: 'API sağlığı', icon: 'mdi-heart-pulse' },
  { value: 'dayaniklilik', label: 'Dayanıklılık', icon: 'mdi-shield-half-full' },
  { value: 'katalog', label: 'Katalog ve etkin ayar', icon: 'mdi-tune-variant' },
]
</script>
