<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="summary.updatedAt.value" :stale="summary.stale.value" refreshable :refreshing="summary.refreshing.value" @refresh="refresh" />

    <PageVerdict :verdict="verdict" />

    <BoTabs v-model="tab" :tabs="tabs" label="Entegrasyon bölümleri" />

    <ApiHealthPanel v-if="tab === 'saglik'" :key="`h${gen}`" />
    <ResiliencePanel v-else-if="tab === 'dayaniklilik'" :key="`r${gen}`" />
    <CatalogPanel v-else :key="`c${gen}`" />
  </div>
</template>

<script setup lang="ts">
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { computed, onMounted, ref } from 'vue'
import { type EkPageTab } from '@entegrasyonik/ui/components'
import BoTabs from '@bo/components/r2/BoTabs.vue'
import { api } from '@bo/api'
import { useTabQuery } from '@bo/composables/useTabQuery'
import { useVerdictSources } from '@bo/composables/useVerdictSources'
import ApiHealthPanel from './ApiHealthPanel.vue'
import ResiliencePanel from './ResiliencePanel.vue'
import CatalogPanel from './CatalogPanel.vue'
import { integrationsVerdict } from './integrationsVerdict'
import '@bo/styles/kit.css'

const TABS = ['saglik', 'dayaniklilik', 'katalog'] as const
const tab = useTabQuery(TABS, 'saglik')
/** Sayfa "Yenile": hüküm kaynakları + açık sekme paneli birlikte tazelenir. */
const gen = ref(0)
const tabs: EkPageTab[] = [
  { value: 'saglik', label: 'API sağlığı', icon: 'mdi-heart-pulse' },
  { value: 'dayaniklilik', label: 'Dayanıklılık', icon: 'mdi-shield-half-full' },
  { value: 'katalog', label: 'Katalog ve etkin ayar', icon: 'mdi-tune-variant' },
]

// Hüküm: son 24 saatin API sağlığı + dayanıklılık anlık görüntüsü; paneller ayrıntıyı kendileri okur.
const summary = useVerdictSources({
  health: () => api.call('BackofficeIntegrationService/getApiHealth', { range: '24h' }),
  resilience: () => api.call('BackofficeIntegrationService/getResilienceState', {}),
})

const verdict = computed(() =>
  summary.settled.value
    ? integrationsVerdict({
        health: summary.sources.health.data.value,
        resilience: summary.sources.resilience.data.value,
        failed: { health: summary.failed('health'), resilience: summary.failed('resilience') },
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
