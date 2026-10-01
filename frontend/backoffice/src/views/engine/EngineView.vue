<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="summary.updatedAt.value" :stale="summary.stale.value">
      <template #actions>
        <CopyViewLink />
        <EkButton tone="secondary" icon="mdi-refresh" :loading="summary.refreshing.value" data-page-refresh @click="refresh">Yenile</EkButton>
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <EkPageTabs v-model="tab" :tabs="tabs" label="Motor bölümleri" />

    <QueuesPanel v-if="tab === 'kuyruklar'" :key="`q${gen}`" @counts="onCounts" @open-failed="tab = 'basarisiz'" />
    <FailedJobsPanel v-else-if="tab === 'basarisiz'" :key="`f${gen}`" />
    <StateMachinePanel v-else-if="tab === 'durum'" :key="`s${gen}`" @stuck="(n) => (stuck = n)" />
    <JobRunsPanel v-else :key="`j${gen}`" />
  </div>
</template>

<script setup lang="ts">
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import CopyViewLink from '@bo/components/CopyViewLink.vue'
import { computed, onMounted, ref } from 'vue'
import { EkButton, EkPageTabs, type EkPageTab } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import { useTabQuery } from '@bo/composables/useTabQuery'
import { useVerdictSources } from '@bo/composables/useVerdictSources'
import QueuesPanel from './QueuesPanel.vue'
import FailedJobsPanel from './FailedJobsPanel.vue'
import StateMachinePanel from './StateMachinePanel.vue'
import JobRunsPanel from './JobRunsPanel.vue'
import type { FailedBullJob } from '@bo/api/contract'
import { engineVerdict } from './engineVerdict'

const TABS = ['kuyruklar', 'basarisiz', 'durum', 'zamanlanmis'] as const
const tab = useTabQuery(TABS, 'kuyruklar')
const failed = ref<number | null>(null)
const stuck = ref<number | null>(null)
/** Sayfa "Yenile": hüküm kaynakları + açık sekme paneli birlikte tazelenir. */
const gen = ref(0)

// Hüküm (Durum → Karar → Eylem): üç özet okuması; paneller ayrıntıyı kendileri okur.
const summary = useVerdictSources({
  queues: () => api.call('BackofficeEngineService/getQueues', {}),
  sm: () => api.call('BackofficeEngineService/getStateMachineJobs', {}),
  jobs: () => api.call('BackofficeEngineService/listJobRuns', { limit: 1 }),
  // Baskın hata kodu için en yeni 50 başarısız iş (Redis yoksa 503 → hüküm kodsuz sürer; ayrıca "okunamadı" üretmez).
  sample: () => api.call('BackofficeEngineService/listFailedJobs', { queue: 'order-sync-queue', source: 'bullmq', limit: 50 }).catch(() => null),
})

const verdict = computed(() =>
  summary.settled.value
    ? engineVerdict({
        queues: summary.sources.queues.data.value,
        sm: summary.sources.sm.data.value,
        jobs: summary.sources.jobs.data.value?.states ?? null,
        failedSample: (summary.sources.sample.data.value?.items as FailedBullJob[] | undefined) ?? null,
        failed: { queues: summary.failed('queues'), sm: summary.failed('sm'), jobs: summary.failed('jobs') },
        retry: () => summary.load(),
      })
    : null,
)

function refresh() {
  gen.value++
  void summary.load()
}

function onCounts(n: number | null) {
  failed.value = n
}

const tabs = computed<EkPageTab[]>(() => [
  { value: 'kuyruklar', label: 'Kuyruklar', icon: 'mdi-tray-full' },
  { value: 'basarisiz', label: 'Başarısız işler', icon: 'mdi-alert-circle-outline', count: failed.value ?? summary.sources.queues.data.value?.queues.reduce((n, q) => n + (q.counts?.failed ?? 0), 0) ?? null },
  { value: 'durum', label: 'Durum makinesi', icon: 'mdi-state-machine', count: stuck.value ?? summary.sources.sm.data.value?.stuckLeaseCount ?? null },
  { value: 'zamanlanmis', label: 'Zamanlanmış görevler', icon: 'mdi-calendar-clock-outline' },
])

onMounted(() => void summary.load())
</script>
