<template>
  <section class="bo-panel" aria-labelledby="bo-runs-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-runs-title" class="bo-panel__title">Zamanlanmış görevler</h2>
        <p class="bo-panel__hint">Son durum görev başına; geçmişte yalnız anlamlı turlar (başarısız, kısmi, nedenli atlama, iş yapan) ve saatte en az bir tur tutulur · {{ retention }} gün saklanır.</p>
      </div>
      <EkRefreshButton quiet-success :loading="list.refreshing.value || list.phase.value === 'loading'" @refresh="list.reload({ keep: true })" />
    </header>

    <EkCard v-if="states.length || list.phase.value === 'loading'" title="Görev durumu" icon="mdi-calendar-clock-outline" icon-tone="info" flush>
      <EkSkeleton v-if="!states.length" type="table" :rows="4" />
      <EkDataTable v-else :items="stateRows" :columns="STATE_COLUMNS" row-key="job">
        <template #cell-job="{ item }">
          <button type="button" class="bo-link-btn bo-mono" :aria-label="`${item.job} geçmişini süz`" @click="job = item.job">{{ item.job }}</button>
        </template>
        <template #cell-lastStatus="{ item }">
          <span class="bo-runs__status">
            <EkStatusChip v-if="item.runningSince" tone="info" label="Çalışıyor" icon="mdi-progress-clock" />
            <EkStatusChip v-else-if="item.lastStatus" :tone="STATUS[item.lastStatus as JobRunStatus].tone" :label="STATUS[item.lastStatus as JobRunStatus].label" dot />
            <EkStatusChip v-if="item.overdue" tone="warning" label="Gecikti" icon="mdi-clock-alert-outline" />
          </span>
        </template>
        <template #cell-lastFinishedAt="{ item }">
          <span class="bo-cell-stack"><span>{{ formatRelative(item.lastFinishedAt ?? undefined) }}</span><span>her {{ formatDuration(item.expectedIntervalMs) }}</span></span>
        </template>
        <template #cell-lastDurationMs="{ item }"><span class="ek-num">{{ formatDuration(item.lastDurationMs) }}</span></template>
        <template #cell-consecutiveFailures="{ item }">
          <span class="ek-num" :class="{ 'bo-runs__bad': item.consecutiveFailures > 0 }">{{ item.consecutiveFailures }}</span>
        </template>
        <template #cell-lastSuccessAt="{ item }">{{ formatRelative(item.lastSuccessAt ?? undefined) }}</template>
        <template #cell-pod="{ item }"><code v-if="item.pod" class="bo-code">{{ item.pod }}</code></template>
      </EkDataTable>
    </EkCard>

    <div class="bo-toolbar">
      <v-select v-model="job" :items="jobOptions" label="Görev" density="compact" hide-details clearable class="bo-toolbar__field" />
      <v-select v-model="status" :items="STATUS_OPTIONS" label="Sonuç" density="compact" hide-details clearable class="bo-toolbar__field" />
    </div>

    <EkCard title="Koşu geçmişi" icon="mdi-history" flush>
      <StateBlock
        :phase="list.phase.value"
        :error="list.error.value"
        empty-variant="no-results"
        empty-title="Bu filtreyle koşu yok"
        :empty-message="`Son ${retention} günde eşleşen anlamlı tur bulunmuyor. Filtreleri genişletin.`"
        @retry="list.reload()"
      >
        <EkDataTable :items="runRows" :columns="RUN_COLUMNS" row-key="id">
          <template #cell-job="{ item }">
            <span class="bo-cell-stack"><span class="bo-mono">{{ item.job }}</span><span>{{ item.trigger }} · {{ item.runType }}</span></span>
          </template>
          <template #cell-status="{ item }"><EkStatusChip :tone="STATUS[item.status as JobRunStatus].tone" :label="STATUS[item.status as JobRunStatus].label" dot /></template>
          <template #cell-startedAt="{ item }">
            <span class="bo-cell-stack"><span>{{ formatDateTime(item.startedAt) }}</span><span>{{ formatRelative(item.startedAt) }}</span></span>
          </template>
          <template #cell-durationMs="{ item }"><span class="ek-num">{{ formatDuration(item.durationMs) }}</span></template>
          <template #cell-detail="{ item }">
            <span class="bo-cell-stack">
              <span v-if="item.error"><EkStatusChip :tone="codeInfo(item.error.code).tone" :label="item.error.code" /> {{ item.error.message }}</span>
              <span v-else-if="item.skippedReason">Atlandı: <code class="bo-code">{{ item.skippedReason }}</code></span>
              <span v-else-if="Object.keys(item.counts).length" class="bo-runs__counts">
                <span v-for="(v, k) in item.counts" :key="k">{{ k }} <strong class="ek-num">{{ formatCount(v) }}</strong></span>
              </span>
              <span>
                <template v-if="item.scope.level === 'tenant'">Müşteri <RouterLink :to="`/musteriler/${item.scope.tenantId}`" class="bo-hit">#{{ item.scope.tenantId }}</RouterLink><template v-if="item.scope.integrationCode"> · {{ CHANNEL[item.scope.integrationCode] ?? item.scope.integrationCode }}</template> · </template>
                <template v-if="item.pod">{{ item.pod }}</template>
                <template v-if="item.corrId"> · <span class="bo-mono">{{ item.corrId }}</span></template>
              </span>
            </span>
          </template>
        </EkDataTable>
        <LoadMore :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" @more="list.loadMore()" />
      </StateBlock>
    </EkCard>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { EkCard, EkDataTable, EkRefreshButton, EkSkeleton, EkStatusChip, type EkTableColumn, type StatusTone } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { JobRun, JobRunStatus, JobState } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import LoadMore from '@bo/components/kit/LoadMore.vue'
import { CHANNEL } from '@bo/utils/labels'
import { codeInfo } from '@bo/utils/codes'
import { formatDateTime, formatRelative } from '@bo/utils/format'
import { formatCount, formatDuration } from '@bo/utils/units'
import '@bo/styles/kit.css'

const STATUS: Record<JobRunStatus, { label: string; tone: StatusTone }> = {
  ok: { label: 'Başarılı', tone: 'success' },
  partial: { label: 'Kısmi', tone: 'warning' },
  failed: { label: 'Başarısız', tone: 'danger' },
  skipped: { label: 'Atlandı', tone: 'neutral' },
}
const STATUS_OPTIONS = (Object.keys(STATUS) as JobRunStatus[]).map((value) => ({ value, title: STATUS[value].label }))
const STATE_COLUMNS: EkTableColumn[] = [
  { key: 'job', label: 'Görev' },
  { key: 'lastStatus', label: 'Son durum' },
  { key: 'lastFinishedAt', label: 'Son bitiş' },
  { key: 'lastDurationMs', label: 'Süre', align: 'end' },
  { key: 'consecutiveFailures', label: 'Ardışık hata', align: 'end' },
  { key: 'lastSuccessAt', label: 'Son başarı' },
  { key: 'pod', label: 'Pod' },
]
const RUN_COLUMNS: EkTableColumn[] = [
  { key: 'job', label: 'Görev' },
  { key: 'status', label: 'Sonuç' },
  { key: 'startedAt', label: 'Başlangıç' },
  { key: 'durationMs', label: 'Süre', align: 'end' },
  { key: 'detail', label: 'Ayrıntı' },
]

const job = ref<string | null>(null)
const status = ref<JobRunStatus | null>(null)
const states = shallowRef<JobState[]>([])
const retention = ref(14)

const list = useCursorList<JobRun>(async (cursor) => {
  const res = await api.call('BackofficeEngineService/listJobRuns', { job: job.value ?? undefined, status: status.value ?? undefined, cursor, limit: 25 })
  // `states` yalnız ilk sayfada gelir; filtreli ilk sayfada da tam liste döner.
  if (!cursor && res.states) states.value = res.states
  retention.value = res.retentionDays
  return res
})
const runRows = computed(() => list.items.value as unknown as Array<Record<string, unknown>>)
const stateRows = computed(() => states.value as unknown as Array<Record<string, unknown>>)
const jobOptions = computed(() => states.value.map((s) => s.job))

watch([job, status], () => list.reload())
onMounted(() => list.reload())
</script>

<style scoped>
.bo-runs__status {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}
.bo-runs__bad {
  color: var(--ek-color-error-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-runs__counts {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
}
</style>
