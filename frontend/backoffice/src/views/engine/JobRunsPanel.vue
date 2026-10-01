<template>
  <div class="bo-engine-stack">
    <p class="bo-panel__hint">Arka planda zamanlanmış çalışan görevlerin son durumu ve geçmiş koşuları: hangi görev ne zaman çalıştı, başarılı oldu mu, neden başarısız oldu.</p>

    <BoSection
      id="bo-runs"
      title="Zamanlanmış görevler"
      :description="`Son durum görev başına; geçmişte yalnız anlamlı turlar (başarısız, kısmi, nedenli atlama, iş yapan) ve saatte en az bir tur tutulur · ${retention} gün saklanır.`"
      icon="mdi-calendar-clock-outline"
    >
      <template #actions>
        <BoViewSwitch query="goster" :options="VIEWS" label="Zamanlanmış görev görünümü" />
        <EkRefreshButton quiet-success :loading="list.refreshing.value || list.phase.value === 'loading'" @refresh="list.reload({ keep: true })" />
      </template>

      <BoDataTable
        v-if="view === 'durum'"
        :items="stateRows"
        :columns="STATE_COLUMNS"
        row-key="job"
        label="Görev durumu"
        :phase="statePhase"
        :error="list.error.value"
        empty-title="Görev bulunamadı"
        empty-message="Zamanlanmış görev durumu henüz raporlanmadı."
        :skeleton-rows="4"
        @retry="list.reload()"
      >
        <template #cell-job="{ item }">
          <button type="button" class="bo-link-btn bo-mono" :aria-label="`${item.job} geçmişini süz`" @click="openHistory(String(item.job))">{{ item.job }}</button>
        </template>
        <template #cell-lastStatus="{ item }">
          <span class="bo-runs__status">
            <EkStatusChip v-if="item.runningSince" tone="info" label="Çalışıyor" icon="mdi-progress-clock" />
            <EkStatusChip v-else-if="item.lastStatus" :tone="STATUS[item.lastStatus as JobRunStatus].tone" :label="STATUS[item.lastStatus as JobRunStatus].label" dot />
            <EkStatusChip v-if="item.overdue" tone="warning" label="Gecikti" icon="mdi-clock-alert-outline" />
          </span>
        </template>
        <template #cell-lastFinishedAt="{ item }">
          <span class="bo-cell-stack"><span>{{ formatRelative((item.lastFinishedAt as string | null) ?? undefined) }}</span><span>her {{ formatDuration(item.expectedIntervalMs as number | null) }}</span></span>
        </template>
        <template #cell-lastDurationMs="{ item }"><span class="ek-num">{{ formatDuration(item.lastDurationMs as number | null) }}</span></template>
        <template #cell-consecutiveFailures="{ item }">
          <span class="ek-num" :class="{ 'bo-runs__bad': Number(item.consecutiveFailures) > 0 }">{{ item.consecutiveFailures }}</span>
        </template>
        <template #cell-lastSuccessAt="{ item }">{{ formatRelative((item.lastSuccessAt as string | null) ?? undefined) }}</template>
        <template #cell-pod="{ item }"><code v-if="item.pod" class="bo-code">{{ item.pod }}</code></template>
      </BoDataTable>

      <template v-else>
        <BoFilterBar label="Koşu geçmişi süzgeçleri" :active="activeFilters" @clear="clearFilters">
          <v-select v-model="job" :items="jobOptions" label="Görev" density="compact" hide-details clearable />
          <BoSegmented v-model="status" :options="STATUS_OPTIONS" label="Sonuç" />
        </BoFilterBar>
        <BoDataTable
          :items="runRows"
          :columns="RUN_COLUMNS"
          row-key="id"
          label="Koşu geçmişi"
          :phase="list.phase.value"
          :error="list.error.value"
          empty-title="Bu filtreyle koşu yok"
          :empty-message="`Son ${retention} günde eşleşen anlamlı tur bulunmuyor. Filtreleri genişletin.`"
          @retry="list.reload()"
        >
          <template #cell-job="{ item }">
            <span class="bo-cell-stack"><span class="bo-mono">{{ item.job }}</span><span>{{ item.trigger }} · {{ item.runType }}</span></span>
          </template>
          <template #cell-status="{ item }"><EkStatusChip :tone="STATUS[item.status as JobRunStatus].tone" :label="STATUS[item.status as JobRunStatus].label" dot /></template>
          <template #cell-startedAt="{ item }">
            <span class="bo-cell-stack"><span>{{ formatDateTime(item.startedAt as string) }}</span><span>{{ formatRelative(item.startedAt as string) }}</span></span>
          </template>
          <template #cell-durationMs="{ item }"><span class="ek-num">{{ formatDuration(item.durationMs as number | null) }}</span></template>
          <template #cell-detail="{ item }">
            <span class="bo-cell-stack">
              <span v-if="(item as unknown as JobRun).error"><EkStatusChip :tone="codeInfo((item as unknown as JobRun).error!.code).tone" :label="(item as unknown as JobRun).error!.code" /> {{ (item as unknown as JobRun).error!.message }}</span>
              <span v-else-if="item.skippedReason">Atlandı: <code class="bo-code">{{ item.skippedReason }}</code></span>
              <span v-else-if="Object.keys(item.counts as object).length" class="bo-runs__counts">
                <span v-for="(v, k) in (item.counts as Record<string, number>)" :key="k">{{ k }} <strong class="ek-num">{{ formatCount(v) }}</strong></span>
              </span>
              <span>
                <template v-if="(item as unknown as JobRun).scope.level === 'tenant'">Müşteri <RouterLink :to="`/musteriler/${(item as unknown as JobRun).scope.tenantId}`" class="bo-hit">#{{ (item as unknown as JobRun).scope.tenantId }}</RouterLink><template v-if="(item as unknown as JobRun).scope.integrationCode"> · {{ CHANNEL[(item as unknown as JobRun).scope.integrationCode!] ?? (item as unknown as JobRun).scope.integrationCode }}</template> · </template>
                <template v-if="item.pod">{{ item.pod }}</template>
                <template v-if="item.corrId"> · <span class="bo-mono">{{ item.corrId }}</span></template>
              </span>
            </span>
          </template>
          <template #footer>
            <BoPagination :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" @more="list.loadMore()" />
          </template>
        </BoDataTable>
      </template>
    </BoSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkRefreshButton, EkStatusChip, type EkTableColumn, type StatusTone } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { JobRun, JobRunStatus, JobState } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoDataTable from '@bo/components/r2/BoDataTable.vue'
import BoFilterBar from '@bo/components/r2/BoFilterBar.vue'
import BoSegmented from '@bo/components/r2/BoSegmented.vue'
import BoViewSwitch from '@bo/components/r2/BoViewSwitch.vue'
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
const STATUS_OPTIONS: Array<{ value: JobRunStatus | null; label: string }> = [{ value: null, label: 'Tümü' }, ...(Object.keys(STATUS) as JobRunStatus[]).map((value) => ({ value, label: STATUS[value].label }))]
const VIEWS = [
  { value: 'durum', label: 'Görev durumu' },
  { value: 'gecmis', label: 'Koşu geçmişi' },
]
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

const route = useRoute()
const router = useRouter()
// ?goster=gecmis — görev durumu (varsayılan) ya da koşu geçmişi; BoViewSwitch değeri URL'e yazar.
const view = computed(() => (route.query.goster === 'gecmis' ? 'gecmis' : 'durum'))
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
const activeFilters = computed(() => (job.value ? 1 : 0) + (status.value ? 1 : 0))
const statePhase = computed(() => (list.phase.value === 'ready' && !states.value.length ? 'empty' : list.phase.value === 'empty' ? (states.value.length ? 'ready' : 'empty') : list.phase.value))
/** Görev adından koşu geçmişine geçiş: o göreve süzgeçli. */
function openHistory(name: string) {
  job.value = name
  void router.replace({ query: { ...route.query, goster: 'gecmis' } })
}
function clearFilters() {
  job.value = null
  status.value = null
}

watch([job, status], () => list.reload())
onMounted(() => list.reload())
</script>

<style scoped>
.bo-engine-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}
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
