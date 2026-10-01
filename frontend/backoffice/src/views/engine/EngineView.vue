<template>
  <div class="bo-page">
    <BoPageHeader />

    <EkPageTabs v-model="tab" :tabs="tabs" label="Motor bölümleri" />

    <QueuesPanel v-if="tab === 'kuyruklar'" @counts="onCounts" @open-failed="tab = 'basarisiz'" />
    <FailedJobsPanel v-else-if="tab === 'basarisiz'" />
    <StateMachinePanel v-else-if="tab === 'durum'" @stuck="(n) => (stuck = n)" />
    <JobRunsPanel v-else />
  </div>
</template>

<script setup lang="ts">
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import { computed, ref } from 'vue'
import { EkPageTabs, type EkPageTab } from '@entegrasyonik/ui/components'
import { useTabQuery } from '@bo/composables/useTabQuery'
import QueuesPanel from './QueuesPanel.vue'
import FailedJobsPanel from './FailedJobsPanel.vue'
import StateMachinePanel from './StateMachinePanel.vue'
import JobRunsPanel from './JobRunsPanel.vue'

const TABS = ['kuyruklar', 'basarisiz', 'durum', 'zamanlanmis'] as const
const tab = useTabQuery(TABS, 'kuyruklar')
const failed = ref<number | null>(null)
const stuck = ref<number | null>(null)

function onCounts(n: number | null) {
  failed.value = n
}

const tabs = computed<EkPageTab[]>(() => [
  { value: 'kuyruklar', label: 'Kuyruklar', icon: 'mdi-tray-full' },
  { value: 'basarisiz', label: 'Başarısız işler', icon: 'mdi-alert-circle-outline', count: failed.value },
  { value: 'durum', label: 'Durum makinesi', icon: 'mdi-state-machine', count: stuck.value },
  { value: 'zamanlanmis', label: 'Zamanlanmış görevler', icon: 'mdi-calendar-clock-outline' },
])
</script>
