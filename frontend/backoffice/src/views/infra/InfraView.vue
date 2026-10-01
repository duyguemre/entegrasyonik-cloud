<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="summary.updatedAt.value" :stale="summary.stale.value">
      <template #actions>
        <BoAction kind="refresh" :loading="summary.refreshing.value" data-page-refresh @click="refresh" />
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <EkPageTabs v-model="tab" :tabs="tabs" label="Altyapı bölümleri" />

    <RedisPanel v-if="tab === 'redis'" :key="`r${gen}`" />
    <MongoPanel v-else-if="tab === 'mongodb'" :key="`m${gen}`" />
    <SlowQueriesPanel v-else :key="`s${gen}`" />
  </div>
</template>

<script setup lang="ts">
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { computed, onMounted, ref } from 'vue'
import { EkPageTabs, type EkPageTab } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import { useTabQuery } from '@bo/composables/useTabQuery'
import { useVerdictSources } from '@bo/composables/useVerdictSources'
import RedisPanel from './RedisPanel.vue'
import MongoPanel from './MongoPanel.vue'
import SlowQueriesPanel from './SlowQueriesPanel.vue'
import { infraVerdict } from './infraVerdict'
import '@bo/styles/kit.css'

const TABS = ['redis', 'mongodb', 'yavas'] as const
const tab = useTabQuery(TABS, 'redis')
/** Sayfa "Yenile": hüküm kaynakları + açık sekme paneli birlikte tazelenir. */
const gen = ref(0)
const tabs: EkPageTab[] = [
  { value: 'redis', label: 'Redis', icon: 'mdi-memory' },
  { value: 'mongodb', label: 'MongoDB', icon: 'mdi-database-outline' },
  { value: 'yavas', label: 'Yavaş sorgular', icon: 'mdi-timer-alert-outline' },
]

// Hüküm: Redis + MongoDB durumu ve son 24 saatin yavaş sorguları; paneller ayrıntıyı kendileri okur.
const summary = useVerdictSources({
  redis: () => api.call('BackofficeInfraService/getRedisStatus', {}),
  mongo: () => api.call('BackofficeInfraService/getMongoStatus', {}),
  slow: () => api.call('BackofficeInfraService/getSlowQueries', { range: '24h' }),
})

const unavailable = (k: 'redis' | 'mongo') => summary.failed(k) && summary.sources[k].phase.value === 'degraded'

const verdict = computed(() =>
  summary.settled.value
    ? infraVerdict({
        redis: summary.sources.redis.data.value,
        mongo: summary.sources.mongo.data.value,
        slow: summary.sources.slow.data.value,
        failed: { redis: summary.failed('redis'), mongo: summary.failed('mongo'), slow: summary.failed('slow') },
        down: { redis: unavailable('redis'), mongo: unavailable('mongo') },
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
