<template>
  <section class="bo-panel" aria-labelledby="bo-failed-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-failed-title" class="bo-panel__title">Başarısız işler</h2>
        <p class="bo-panel__hint">En yeni önce. BullMQ başarısız kümesi son 500 işle sınırlıdır; kalıcı hatalar ölü mektup kuyruğundadır.</p>
        <p v-if="filtered && total !== null && source === 'bullmq'" class="bo-failed__total" data-testid="filtered-total" aria-live="polite">{{ formatCount(total) }} iş (süzgeçli)</p>
      </div>
      <EkRefreshButton quiet-success :loading="list.refreshing.value || list.phase.value === 'loading'" @refresh="list.reload({ keep: true })" />
    </header>

    <div class="bo-toolbar">
      <v-select v-model="queue" :items="queues" label="Kuyruk" density="compact" hide-details class="bo-toolbar__field" :disabled="!queues.length" />
      <div class="bo-seg" role="radiogroup" aria-label="Kaynak">
        <button v-for="o in SOURCES" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="source === o.value" @click="source = o.value">{{ o.label }}</button>
      </div>
      <v-text-field
        v-model="tidInput"
        label="Müşteri no"
        inputmode="numeric"
        density="compact"
        hide-details
        clearable
        class="bo-toolbar__field bo-failed__tid"
        data-testid="f-tid"
        @keydown.enter="commitTid"
        @blur="commitTid"
        @click:clear="setFilter('tid', '')"
      />
      <v-select :model-value="integF" :items="integrationItems" label="Entegrasyon" density="compact" hide-details clearable class="bo-toolbar__field" data-testid="f-integ" @update:model-value="(v: string | null) => setFilter('entegrasyon', v ?? '')" />
      <v-select :model-value="codeF" :items="codeItems" label="Hata kodu" density="compact" hide-details clearable class="bo-toolbar__field" data-testid="f-code" @update:model-value="(v: string | null) => setFilter('kod', v ?? '')" />
      <EkButton v-if="filtered" size="sm" tone="ghost" icon="mdi-filter-off-outline" data-testid="f-clear" @click="clearFilters">Süzgeçleri temizle</EkButton>
    </div>
    <p v-if="codeF" class="bo-failed__codehint">{{ codeF }} — {{ codeInfo(codeF).text }}</p>

    <EkAlert v-if="source === 'dlq'" tone="info" dense title="Ölü mektuplar salt okunur" text="Kalıcı hatalı ya da denemesi tükenmiş işler. Yeniden kuyruğa alma/silme kuralı (idempotency) henüz karara bağlanmadı; bu yüzden yalnız listelenir." />

    <div v-if="source === 'bullmq' && list.phase.value === 'ready'" class="bo-selbar" :class="{ 'is-active': selected.size > 0 }" data-testid="selection-bar">
      <v-checkbox
        :model-value="allSelected"
        :indeterminate="selected.size > 0 && !allSelected"
        :label="`Tümünü seç (en çok ${RETRY_JOBS_MAX})`"
        density="compact"
        hide-details
        data-testid="select-all"
        @update:model-value="toggleAll"
      />
      <span class="bo-selbar__count" role="status" aria-live="polite" data-testid="selected-count">{{ selected.size ? `${formatCount(selected.size)} iş seçildi` : 'İş seçilmedi' }}</span>
      <EkButton size="sm" tone="primary" icon="mdi-replay" :disabled="!selected.size" data-testid="bulk-retry" @click="openBulk">Seçilenleri yeniden dene</EkButton>
      <EkButton v-if="selected.size" size="sm" tone="ghost" data-testid="clear-selection" @click="selected = new Set()">Seçimi temizle</EkButton>
    </div>

    <EkCard flush class="bo-dense">
      <StateBlock
        :phase="list.phase.value"
        :error="list.error.value"
        :retrying="list.phase.value === 'loading'"
        degraded-title="Kuyruk şu an kullanılamıyor"
        :empty-title="filtered ? 'Süzgece uyan iş yok' : source === 'dlq' ? 'Ölü mektup yok' : 'Başarısız iş yok'"
        :empty-message="filtered ? 'Bu süzgeçle eşleşen başarısız iş bulunamadı — süzgeci gevşetin ya da temizleyin.' : source === 'dlq' ? 'İnceleme bekleyen kalıcı hata bulunmuyor.' : 'Kuyrukta başarısız iş yok — tüm işler tamamlandı ya da yeniden denendi.'"
        @retry="list.reload()"
      >
        <EkDataTable v-if="source === 'bullmq'" :items="bullItems" :columns="BULL_COLUMNS" row-key="id">
          <template #cell-id="{ item }">
            <span class="bo-jobid">
              <v-checkbox
                :model-value="selected.has(String(item.id))"
                :aria-label="`${item.id} işini seç`"
                density="compact"
                hide-details
                class="bo-jobid__check"
                data-testid="row-select"
                @update:model-value="(v: boolean | null) => toggleOne(String(item.id), !!v)"
              />
              <span class="bo-jobid__body">
                <code class="bo-id" :title="item.operation">{{ item.id }}</code>
                <span v-if="rowErrors[String(item.id)]" class="bo-jobid__err" role="alert" data-testid="row-error">{{ rowErrors[String(item.id)] }}</span>
              </span>
            </span>
          </template>
          <template #cell-reqId="{ item }">
            <span v-if="item.reqId" class="bo-trace-cell">
              <code class="bo-id" data-testid="req-id">{{ item.reqId }}</code>
              <EkCopyButton :value="String(item.reqId)" label="İstek kimliği" />
              <RouterLink :to="{ path: '/loglar', query: { reqId: String(item.reqId) } }" class="bo-trace-cell__link" :aria-label="`${item.id} işinin izini aç`" data-testid="trace-link">İz</RouterLink>
            </span>
            <span v-else class="bo-muted">—</span>
          </template>
          <template #cell-tenantId="{ item }">
            <RouterLink v-if="item.tenantId" :to="`/musteriler/${item.tenantId}`" class="ek-num bo-hit">#{{ item.tenantId }}</RouterLink>
            <span v-else class="bo-muted">platform</span>
          </template>
          <template #cell-integrationCode="{ item }">
            <EkChannelDot v-if="item.integrationCode" :code="item.integrationCode" :name="CHANNEL[item.integrationCode] ?? item.integrationCode" variant="plain" />
            <span v-else class="bo-muted">—</span>
          </template>
          <template #cell-errorCode="{ item }">
            <code class="bo-code-tag" :title="codeInfo(item.errorCode).text">{{ item.errorCode }}</code>
          </template>
          <template #cell-attempts="{ item }"><span class="ek-num">{{ item.attemptsMade }}/{{ item.maxAttempts }}</span></template>
          <template #cell-failedAt="{ item }">
            <EkRelativeTime :value="item.failedAt" />
          </template>
          <template #cell-actions="{ item }">
            <span class="bo-row-actions">
              <EkButton size="sm" tone="ghost" icon="mdi-replay" :aria-label="`${item.id} yeniden dene`" data-testid="retry" @click="retry.open(item as FailedBullJob)">Yeniden dene</EkButton>
              <span class="bo-row-actions__sep" aria-hidden="true"></span>
              <EkButton class="bo-row-actions__danger" size="sm" tone="ghost" icon="mdi-delete-outline" icon-only :aria-label="`${item.id} sil`" data-testid="discard" @click="discard.open(item as FailedBullJob)" />
            </span>
          </template>
        </EkDataTable>

        <EkDataTable v-else :items="dlqItems" :columns="DLQ_COLUMNS" row-key="id">
          <template #cell-originalJobId="{ item }">
            <code class="bo-id" :title="`Ölü mektup kaydı: ${item.id}`">{{ item.originalJobId }}</code>
          </template>
          <template #cell-tenantId="{ item }">
            <RouterLink v-if="item.tenantId" :to="`/musteriler/${item.tenantId}`" class="ek-num bo-hit">#{{ item.tenantId }}</RouterLink>
            <span v-else class="bo-muted">platform</span>
          </template>
          <template #cell-integrationCode="{ item }">
            <EkChannelDot v-if="item.integrationCode" :code="item.integrationCode" :name="CHANNEL[item.integrationCode] ?? item.integrationCode" variant="plain" />
          </template>
          <template #cell-errorCode="{ item }"><code class="bo-code-tag" :title="codeInfo(item.errorCode).text">{{ item.errorCode }}</code></template>
          <template #cell-reqId="{ item }">
            <span v-if="item.reqId" class="bo-trace-cell">
              <code class="bo-id">{{ item.reqId }}</code>
              <EkCopyButton :value="String(item.reqId)" label="İstek kimliği" />
              <RouterLink :to="{ path: '/loglar', query: { reqId: String(item.reqId) } }" class="bo-trace-cell__link" :aria-label="`${item.originalJobId} işinin izini aç`">İz</RouterLink>
            </span>
            <span v-else class="bo-muted">—</span>
          </template>
          <template #cell-dlqType="{ item }">{{ item.dlqType === 'FATAL_ERROR' ? 'Kalıcı hata' : 'Deneme tükendi' }}</template>
          <template #cell-status="{ item }">
            <EkStatusChip :tone="item.status === 'PENDING_MANUAL_REVIEW' ? 'warning' : 'neutral'" :label="item.status === 'PENDING_MANUAL_REVIEW' ? 'İnceleme bekliyor' : item.status" dot />
          </template>
          <template #cell-failedAt="{ item }"><EkRelativeTime :value="item.failedAt" /></template>
        </EkDataTable>
        <LoadMore :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" @more="list.loadMore()" />
      </StateBlock>
    </EkCard>

    <GuardedDialog
      :action="retry"
      title="İş yeniden denensin mi?"
      irreversible
      :description="retry.context.value ? `${retry.context.value.id} · ${retry.context.value.operation}` : ''"
      :items="['İş başarısız kümeden kuyruğa geri alınır ve sıradaki işçi tarafından yeniden çalıştırılır.', 'İş pazaryerine yazabilir; canlı salt-okuma kipinde bu işlem kapalıdır.', 'Gerekçe ve sonuç denetim kaydına yazılır.']"
      confirm-label="Yeniden dene"
      confirm-icon="mdi-replay"
    />
    <GuardedDialog
      :action="bulk"
      :title="`${bulk.context.value?.length ?? 0} iş yeniden denensin mi?`"
      irreversible
      :scope="bulkScope"
      :description="bulkScope"
      :items="['Seçili işler başarısız kümeden kuyruğa geri alınır ve sıradaki işçi tarafından yeniden çalıştırılır.', 'İşler pazaryerine yazabilir; canlı salt-okuma kipinde bu işlem kapalıdır.', 'Zaten işlenen ya da bulunamayan işler atlanır; sonuç iş başına gösterilir.', 'Gerekçe ve sonuç denetim kaydına yazılır.']"
      confirm-label="Seçilenleri yeniden dene"
      confirm-icon="mdi-replay"
    />
    <GuardedDialog
      :action="discard"
      title="Başarısız iş silinsin mi?"
      :description="discard.context.value ? `${discard.context.value.id} · ${discard.context.value.operation}` : ''"
      :items="['İş başarısız kümeden kalıcı olarak silinir; yeniden denenemez.', 'Aktif işler silinemez. Gerekçe denetim kaydına yazılır.']"
      confirm-label="Sil"
      confirm-icon="mdi-delete-outline"
      :confirm-text="discard.context.value?.id"
      danger
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkButton, EkCard, EkChannelDot, EkCopyButton, EkDataTable, EkRefreshButton, EkRelativeTime, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import { RETRY_JOBS_MAX, type DlqRecord, type FailedBullJob, type FailedJobSource, type RetryJobsResponse } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import LoadMore from '@bo/components/kit/LoadMore.vue'
import { CHANNEL } from '@bo/utils/labels'
import { ERROR_CODE_TEXT, codeInfo } from '@bo/utils/codes'
import { formatCount } from '@bo/utils/units'
import { notify } from '@bo/utils/toast'
import '@bo/styles/kit.css'

const SOURCES = [
  { value: 'bullmq', label: 'Kuyruk (yeniden denenebilir)' },
  { value: 'dlq', label: 'Ölü mektup' },
] as const
const BULL_COLUMNS: EkTableColumn[] = [
  { key: 'id', label: 'İş' },
  { key: 'tenantId', label: 'Müşteri' },
  { key: 'integrationCode', label: 'Entegrasyon' },
  { key: 'errorCode', label: 'Hata kodu' },
  { key: 'attempts', label: 'Deneme', align: 'end' },
  { key: 'reqId', label: 'İz' },
  { key: 'failedAt', label: 'Başarısız' },
  { key: 'actions', label: '', type: 'actions' },
]
const DLQ_COLUMNS: EkTableColumn[] = [
  { key: 'originalJobId', label: 'Özgün iş' },
  { key: 'tenantId', label: 'Müşteri' },
  { key: 'integrationCode', label: 'Entegrasyon' },
  { key: 'errorCode', label: 'Hata kodu' },
  { key: 'dlqType', label: 'Tür' },
  { key: 'status', label: 'Durum' },
  { key: 'reqId', label: 'İz' },
  { key: 'failedAt', label: 'Zaman' },
]

const queues = ref<string[]>([])
const queue = ref<string>('')
// ?kaynak=dlq — genel bakıştaki "elle inceleme bekliyor" bağlantısı doğrudan ölü mektuplara açılır.
const route = useRoute()
const router = useRouter()
const source = ref<FailedJobSource>(route.query.kaynak === 'dlq' ? 'dlq' : 'bullmq')
// Hüküm bloğundaki "Ölü mektuplar" bağlantısı sekme açıkken de kaynağı değiştirir (K51).
watch(
  () => route.query.kaynak,
  (k) => (source.value = k === 'dlq' ? 'dlq' : 'bullmq'),
)
watch(source, (v) => {
  const { kaynak: _k, ...rest } = route.query
  router.replace({ query: v === 'dlq' ? { ...rest, kaynak: 'dlq' } : rest })
})

// Süzgeçler URL'dedir (?tid=&entegrasyon=&kod=); sözleşme adları (integrationCode, errorCode) da okunur (genel bakış/müşteri bağlantıları).
const q1 = (k: string[]) => {
  for (const n of k) {
    const v = route.query[n]
    if (typeof v === 'string' && v) return v
  }
  return ''
}
const tidF = computed(() => {
  const n = Number(q1(['tid']))
  return Number.isInteger(n) && n > 0 ? n : null
})
const integF = computed(() => q1(['entegrasyon', 'integrationCode']) || null)
const codeF = computed(() => {
  const v = q1(['kod', 'errorCode'])
  return /^[A-Z_]{2,32}$/.test(v) ? v : null
})
const filtered = computed(() => tidF.value !== null || !!integF.value || !!codeF.value)
const tidInput = ref(tidF.value ? String(tidF.value) : '')
watch(tidF, (v) => (tidInput.value = v ? String(v) : ''))
const integrationItems = computed(() => {
  const base = Object.entries(CHANNEL).map(([value, title]) => ({ value, title }))
  return integF.value && !CHANNEL[integF.value] ? [...base, { value: integF.value, title: integF.value }] : base
})
const codeItems = Object.keys(ERROR_CODE_TEXT).filter((c) => !['NOT_FOUND', 'NOT_SUPPORTED', 'INTERNAL'].includes(c) || codeF.value === c)

function setFilter(key: 'tid' | 'entegrasyon' | 'kod', value: string) {
  const { tid: _t, entegrasyon: _e, kod: _k, integrationCode: _i, errorCode: _c, ...rest } = route.query
  const next: Record<string, string> = { ...(rest as Record<string, string>) }
  const cur = { tid: tidF.value ? String(tidF.value) : '', entegrasyon: integF.value ?? '', kod: codeF.value ?? '', [key]: value }
  for (const [k, v] of Object.entries(cur)) if (v) next[k] = v
  router.replace({ query: next })
}
function commitTid() {
  const v = (tidInput.value ?? '').trim()
  if (v === (tidF.value ? String(tidF.value) : '')) return
  setFilter('tid', /^[1-9]\d*$/.test(v) ? v : '')
  if (!/^[1-9]\d*$/.test(v)) tidInput.value = ''
}
function clearFilters() {
  const { tid: _t, entegrasyon: _e, kod: _k, integrationCode: _i, errorCode: _c, ...rest } = route.query
  router.replace({ query: rest })
}

const total = ref<number | null>(null)
const list = useCursorList<FailedBullJob | DlqRecord>(async (cursor) => {
  const res = await api.call('BackofficeEngineService/listFailedJobs', {
    queue: queue.value,
    source: source.value,
    cursor,
    limit: 25,
    ...(tidF.value ? { tid: tidF.value } : {}),
    ...(integF.value ? { integrationCode: integF.value } : {}),
    ...(codeF.value ? { errorCode: codeF.value } : {}),
  })
  if (!cursor) total.value = typeof res.total === 'number' ? res.total : null
  return res
})

// Toplu seçim (yalnız bullmq): en çok RETRY_JOBS_MAX; başarısız olanlar seçili kalır, nedeni satırda görünür.
const selected = ref<Set<string>>(new Set())
const rowErrors = ref<Record<string, string>>({})
const selectable = computed(() => bullItems.value.slice(0, RETRY_JOBS_MAX).map((j) => String(j.id)))
const allSelected = computed(() => selectable.value.length > 0 && selectable.value.every((id) => selected.value.has(id)))
function toggleAll(v: boolean | null) {
  selected.value = v ? new Set(selectable.value) : new Set()
}
function toggleOne(id: string, on: boolean) {
  const next = new Set(selected.value)
  if (!on) next.delete(id)
  else if (next.size < RETRY_JOBS_MAX) next.add(id)
  else notify('warning', `Tek seferde en çok ${RETRY_JOBS_MAX} iş seçilebilir.`)
  selected.value = next
}
const REASON_TEXT: Record<string, string> = {
  JOB_NOT_FAILED: 'zaten işleniyor',
  JOB_NOT_FOUND: 'iş bulunamadı (silinmiş olabilir)',
  RETRY_FAILED: 'yeniden denenemedi',
}
const reasonText = (e?: string) => (e && REASON_TEXT[e]) || 'yeniden denenemedi'
const bulkJobs = (): FailedBullJob[] => (list.items.value as FailedBullJob[]).filter((j) => selected.value.has(j.id))
const bulkScope = computed(() => {
  const jobs = bulk.context.value ?? []
  const codes = [...new Set(jobs.map((j) => j.errorCode))]
  const integs = [...new Set(jobs.map((j) => j.integrationCode ?? 'platform'))]
  return [`${formatCount(jobs.length)} iş`, codes.length === 1 ? codes[0] : `${codes.length} farklı hata kodu`, integs.length === 1 ? (CHANNEL[integs[0]] ?? integs[0]) : `${integs.length} entegrasyon`].join(' · ')
})
const bulk = useGuardedAction<FailedBullJob[], RetryJobsResponse>(
  (jobs, reason) => api.call('BackofficeEngineService/retryJobs', { queue: queue.value, jobIds: jobs.map((j) => j.id), reason }),
  (res) => {
    const okIds = new Set(res.results.filter((r) => r.ok).map((r) => r.jobId))
    list.removeWhere((j) => okIds.has(j.id))
    const errs: Record<string, string> = {}
    for (const r of res.results) if (!r.ok) errs[r.jobId] = `Atlandı: ${reasonText(r.error)}`
    rowErrors.value = { ...rowErrors.value, ...errs }
    selected.value = new Set(res.results.filter((r) => !r.ok).map((r) => r.jobId))
    const reasons = [...new Set(res.results.filter((r) => !r.ok).map((r) => reasonText(r.error)))]
    const skipped = res.failed ? `, ${formatCount(res.failed)} iş atlandı${reasons.length === 1 ? ` (${reasons[0]})` : ''}` : ''
    notify(res.failed ? 'warning' : 'success', `${formatCount(res.succeeded)} iş yeniden kuyruğa alındı${skipped}.`)
  },
)
function openBulk() {
  const jobs = bulkJobs()
  if (jobs.length) bulk.open(jobs)
}
const bullItems = computed(() => list.items.value as FailedBullJob[] as unknown as Array<Record<string, unknown>>)
const dlqItems = computed(() => list.items.value as DlqRecord[] as unknown as Array<Record<string, unknown>>)

const retry = useGuardedAction(
  (job: FailedBullJob, reason) => api.call('BackofficeEngineService/retryJob', { queue: queue.value, jobId: job.id, reason }),
  (_r, job) => {
    list.removeWhere((j) => j.id === job.id)
    notify('success', `${job.id} yeniden kuyruğa alındı.`)
  },
)
const discard = useGuardedAction(
  (job: FailedBullJob, reason) => api.call('BackofficeEngineService/discardJob', { queue: queue.value, jobId: job.id, reason }),
  (_r, job) => {
    list.removeWhere((j) => j.id === job.id)
    notify('success', `${job.id} silindi.`)
  },
)

watch([queue, source, tidF, integF, codeF], () => {
  selected.value = new Set()
  rowErrors.value = {}
  if (queue.value) void list.reload()
})

onMounted(async () => {
  try {
    const res = await api.call('BackofficeEngineService/getQueues', {})
    queues.value = res.queues.map((q) => q.name)
  } catch {
    // Kuyruk listesi okunamazsa sözleşmedeki tek kuyrukla devam (liste ucu kendi hatasını gösterir).
    queues.value = ['order-sync-queue']
  }
  queue.value = queues.value[0] ?? 'order-sync-queue'
})
</script>

<style scoped>
.bo-failed__total {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: 600;
}
.bo-failed__tid {
  max-width: 160px;
}
.bo-failed__codehint {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-selbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-muted);
  transition: background-color 150ms ease-out, border-color 150ms ease-out;
}
.bo-selbar.is-active {
  border-color: var(--ek-color-primary);
  background: var(--ek-color-surface);
}
.bo-selbar__count {
  flex: 1 1 auto;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}
.bo-jobid {
  display: inline-flex;
  align-items: flex-start;
  gap: var(--ek-space-1);
  min-width: 0;
}
.bo-jobid__check {
  flex: none;
  margin-block: -6px;
}
.bo-jobid__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding-top: 2px;
}
.bo-jobid__err {
  color: var(--ek-color-warning-emphasis);
  font-size: var(--ek-type-caption-size);
}
.bo-trace-cell {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}
.bo-trace-cell__link {
  font-size: var(--ek-type-caption-size);
}
</style>
