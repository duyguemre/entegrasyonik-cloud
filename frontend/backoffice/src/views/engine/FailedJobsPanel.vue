<template>
  <div class="bo-engine-stack">
    <BoSection
      id="bo-failed"
      title="Başarısız işler"
      description="Kuyrukta hata veren işler: her işin türü, durumu, hata nedeni ve zamanı. Özet nedene göre sayar; Ayrıntılı iş iş listeler."
      icon="mdi-alert-circle-outline"
    >
      <template #actions>
        <BoViewSwitch :options="VIEWS" label="Başarısız iş görünümü" />
        <EkRefreshButton quiet-success :loading="list.refreshing.value || list.phase.value === 'loading'" @refresh="reloadAll(true)" />
      </template>

      <BoFilterBar label="Başarısız iş süzgeçleri" :active="activeFilters" @clear="clearFilters">
        <v-select v-model="queue" :items="queues" label="Kuyruk" density="compact" hide-details :disabled="!queues.length" />
        <BoSegmented v-model="source" :options="SOURCES" label="Kaynak" />
        <v-text-field
          v-model="tidInput"
          label="Müşteri no"
          inputmode="numeric"
          density="compact"
          hide-details
          clearable
          class="bo-failed__tid"
          data-testid="f-tid"
          @keydown.enter="commitTid"
          @blur="commitTid"
          @click:clear="setFilter('tid', '')"
        />
        <v-select :model-value="integF" :items="integrationItems" label="Entegrasyon" density="compact" hide-details clearable data-testid="f-integ" @update:model-value="(v: string | null) => setFilter('entegrasyon', v ?? '')" />
        <v-select :model-value="codeF" :items="codeItems" label="Hata kodu" density="compact" hide-details clearable data-testid="f-code" @update:model-value="(v: string | null) => setFilter('kod', v ?? '')" />
      </BoFilterBar>
      <p v-if="filtered && total !== null && source === 'bullmq'" class="bo-failed__total" data-testid="filtered-total" aria-live="polite">{{ formatCount(total) }} iş (süzgeçli)</p>
      <p v-if="codeF" class="bo-failed__codehint">{{ codeF }} — {{ codeInfo(codeF).text }}</p>

      <EkAlert v-if="source === 'dlq'" tone="info" dense title="Ölü mektuplar salt okunur" text="Kalıcı hatalı ya da denemesi tükenmiş işler. Yeniden kuyruğa alma/silme kuralı (idempotency) henüz karara bağlanmadı; bu yüzden yalnız listelenir." />

      <!-- Özet: hata nedenine göre gruplu sayılar; gruptan süzgeçli ayrıntılı görünüme geçilir. -->
      <template v-if="view === 'ozet'">
        <StateBlock
          :phase="summaryPhase"
          :error="sum.error.value"
          :retrying="sum.phase.value === 'loading'"
          degraded-title="Kuyruk şu an kullanılamıyor"
          :empty-title="filtered ? 'Süzgece uyan iş yok' : source === 'dlq' ? 'Ölü mektup yok' : 'Başarısız iş yok'"
          :empty-message="emptyMessage"
          @retry="reloadAll()"
        >
          <template v-if="summary">
            <BoTileGrid :min="176" dense>
              <BoStat
                :label="source === 'dlq' ? 'Ölü mektup' : 'Başarısız iş'"
                :value="summary.exact ? formatCount(summary.count) : `${formatCount(summary.count)}+`"
                :tone="summary.count ? 'critical' : 'success'"
                :hint="summary.exact ? (source === 'bullmq' ? 'Son 500 ile sınırlı' : 'Süzgece uyan kayıt') : `İlk ${formatCount(summary.count)} iş üzerinden`"
              />
              <BoStat label="Hata nedeni" :value="formatCount(summary.rows.length)" hint="Farklı hata kodu" />
              <BoStat label="En eski hata" :value="summary.oldestFailedAt ? formatRelative(summary.oldestFailedAt) : '—'" :hint="summary.oldestFailedAt ? formatDateTime(summary.oldestFailedAt) : undefined" />
            </BoTileGrid>
            <BoDataTable :items="groupItems" :columns="GROUP_COLUMNS" row-key="errorCode" label="Hata nedenine göre başarısız işler" data-testid="failed-summary">
              <template #cell-errorCode="{ item }">
                <span class="bo-cell-stack">
                  <span class="bo-failed__cause">{{ codeInfo(String(item.errorCode)).text }}</span>
                  <code class="bo-code-tag" :title="codeInfo(String(item.errorCode)).text">{{ item.errorCode }}</code>
                </span>
              </template>
              <template #cell-jobTypes="{ item }">
                <span class="bo-failed__types">
                  <span v-for="t in (item as unknown as FailedGroupRow).jobTypes" :key="String(t.code)">{{ jobTypeLabel(t.code) }} <strong class="ek-num">{{ formatCount(t.count) }}</strong></span>
                </span>
              </template>
              <template #cell-count="{ item }"><strong class="ek-num">{{ formatCount(Number(item.count)) }}</strong></template>
              <template #cell-oldestFailedAt="{ item }"><EkRelativeTime :value="item.oldestFailedAt as string | null" /></template>
              <template #cell-actions="{ item }">
                <BoAction kind="detail" size="sm" :aria-label="`${item.errorCode} hatalı işlerini ayrıntılı göster`" data-testid="group-open" @click="drill(String(item.errorCode))">İşleri göster</BoAction>
              </template>
            </BoDataTable>
          </template>
        </StateBlock>
      </template>

      <!-- Ayrıntılı: iş başına tür · durum · hata nedeni · deneme · zaman · müşteri · iz. -->
      <template v-else>
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
          <BoAction kind="retry" tone="primary" size="sm" :disabled="!selected.size" data-testid="bulk-retry" @click="openBulk">Seçilenleri yeniden dene</BoAction>
          <EkButton v-if="selected.size" size="sm" tone="ghost" data-testid="clear-selection" @click="selected = new Set()">Seçimi temizle</EkButton>
        </div>

        <BoDataTable
          :items="source === 'bullmq' ? bullItems : dlqItems"
          :columns="source === 'bullmq' ? BULL_COLUMNS : DLQ_COLUMNS"
          row-key="id"
          :label="source === 'bullmq' ? 'Başarısız işler' : 'Ölü mektuplar'"
          :phase="list.phase.value"
          :error="list.error.value"
          :empty-title="filtered ? 'Süzgece uyan iş yok' : source === 'dlq' ? 'Ölü mektup yok' : 'Başarısız iş yok'"
          :empty-message="emptyMessage"
          @retry="list.reload()"
        >
          <template #cell-id="{ item }">
            <span class="bo-jobid">
              <v-checkbox
                :model-value="selected.has(String(item.id))"
                :disabled="item.state === 'retrying'"
                :aria-label="`${item.id} işini seç`"
                density="compact"
                hide-details
                class="bo-jobid__check"
                data-testid="row-select"
                @update:model-value="(v: boolean | null) => toggleOne(String(item.id), !!v)"
              />
              <span class="bo-jobid__body">
                <span class="bo-failed__type">{{ jobTypeLabel(jobTypeCode(item as never)) }}</span>
                <code class="bo-id" :title="String(item.operation)">{{ item.id }}</code>
                <span v-if="rowErrors[String(item.id)]" class="bo-jobid__err" role="alert" data-testid="row-error">{{ rowErrors[String(item.id)] }}</span>
              </span>
            </span>
          </template>
          <template #cell-originalJobId="{ item }">
            <span class="bo-jobid__body">
              <span class="bo-failed__type">{{ jobTypeLabel(jobTypeCode(item as never)) }}</span>
              <code class="bo-id" :title="`Ölü mektup kaydı: ${item.id}`">{{ item.originalJobId }}</code>
            </span>
          </template>
          <template #cell-state="{ item }">
            <span v-if="source === 'bullmq'" class="bo-cell-stack">
              <EkStatusChip :tone="bullState(item as never).tone" :label="bullState(item as never).label" dot />
            </span>
            <span v-else class="bo-cell-stack">
              <EkStatusChip :tone="dlqState(item as never).tone" :label="dlqState(item as never).label" dot />
              <span>{{ item.dlqType === 'FATAL_ERROR' ? 'Kalıcı hata' : 'Deneme tükendi' }} · {{ item.status === 'PENDING_MANUAL_REVIEW' ? 'inceleme bekliyor' : item.status }}</span>
            </span>
          </template>
          <template #cell-errorCode="{ item }">
            <span class="bo-cell-stack bo-failed__reason">
              <span>{{ codeInfo(String(item.errorCode)).text }}</span>
              <code class="bo-code-tag" :title="codeInfo(String(item.errorCode)).text">{{ item.errorCode }}</code>
            </span>
          </template>
          <template #cell-attempts="{ item }">
            <span v-if="item.attemptsMade !== undefined" class="ek-num">{{ item.attemptsMade }}/{{ item.maxAttempts }}</span>
            <span v-else class="bo-muted">—</span>
          </template>
          <template #cell-failedAt="{ item }">
            <span class="bo-cell-stack bo-failed__times">
              <span>Son hata <EkRelativeTime :value="item.failedAt as string" /></span>
              <span v-if="item.firstFailedAt && item.firstFailedAt !== item.failedAt">İlk hata <EkRelativeTime :value="item.firstFailedAt as string" /></span>
              <span v-else-if="item.enqueuedAt">Kuyruğa alındı <EkRelativeTime :value="item.enqueuedAt as string" /></span>
            </span>
          </template>
          <template #cell-tenantId="{ item }">
            <span class="bo-cell-stack">
              <RouterLink v-if="item.tenantId" :to="`/musteriler/${item.tenantId}`" class="ek-num bo-hit">#{{ item.tenantId }}</RouterLink>
              <span v-else class="bo-muted">platform</span>
              <EkChannelDot v-if="item.integrationCode" :code="String(item.integrationCode)" :name="CHANNEL[String(item.integrationCode)] ?? String(item.integrationCode)" variant="plain" />
            </span>
          </template>
          <template #cell-reqId="{ item }">
            <span v-if="item.reqId" class="bo-trace-cell">
              <code class="bo-id" data-testid="req-id">{{ item.reqId }}</code>
              <EkCopyButton :value="String(item.reqId)" label="İstek kimliği" />
              <BoAction kind="detail" size="sm" :to="{ path: '/loglar', query: { reqId: String(item.reqId) } }" :aria-label="`${item.originalJobId ?? item.id} işinin izini aç`" data-testid="trace-link">İz</BoAction>
            </span>
            <span v-else class="bo-muted">—</span>
          </template>
          <template #cell-actions="{ item }">
            <span class="bo-row-actions">
              <BoAction kind="retry" icon-only size="sm" :object="String(item.id)" :disabled="item.state === 'retrying'" data-testid="retry" @click="retry.open(item as unknown as FailedBullJob)" />
              <span class="bo-row-actions__sep" aria-hidden="true"></span>
              <BoAction kind="delete" icon-only size="sm" :object="String(item.id)" data-testid="discard" @click="discard.open(item as unknown as FailedBullJob)" />
            </span>
          </template>
          <template #footer>
            <BoPagination :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" @more="list.loadMore()" />
          </template>
        </BoDataTable>
      </template>
    </BoSection>

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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkButton, EkChannelDot, EkCopyButton, EkRefreshButton, EkRelativeTime, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import { RETRY_JOBS_MAX, type DlqRecord, type FailedBullJob, type FailedJobSource, type RetryJobsResponse } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import { useCursorList } from '@bo/composables/useCursorList'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import BoDataTable from '@bo/components/r2/BoDataTable.vue'
import BoFilterBar from '@bo/components/r2/BoFilterBar.vue'
import BoSegmented from '@bo/components/r2/BoSegmented.vue'
import BoViewSwitch from '@bo/components/r2/BoViewSwitch.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
import { bullState, dlqState, jobTypeCode, jobTypeLabel, summarize, type FailedGroupRow } from './failedJobs'
import { formatDateTime, formatRelative } from '@bo/utils/format'
import { CHANNEL } from '@bo/utils/labels'
import { ERROR_CODE_TEXT, codeInfo } from '@bo/utils/codes'
import { formatCount } from '@bo/utils/units'
import { notify } from '@bo/utils/toast'
import '@bo/styles/kit.css'

const SOURCES: Array<{ value: FailedJobSource; label: string }> = [
  { value: 'bullmq', label: 'Kuyruk (yeniden denenebilir)' },
  { value: 'dlq', label: 'Ölü mektup' },
]
const VIEWS = [
  { value: 'ozet', label: 'Özet' },
  { value: 'ayrinti', label: 'Ayrıntılı' },
]
const BULL_COLUMNS: EkTableColumn[] = [
  { key: 'id', label: 'İş' },
  { key: 'state', label: 'Durum' },
  { key: 'errorCode', label: 'Hata nedeni' },
  { key: 'attempts', label: 'Deneme', align: 'end' },
  { key: 'failedAt', label: 'Zaman' },
  { key: 'tenantId', label: 'Müşteri' },
  { key: 'reqId', label: 'İz' },
  { key: 'actions', label: '', type: 'actions' },
]
const DLQ_COLUMNS: EkTableColumn[] = [
  { key: 'originalJobId', label: 'İş' },
  { key: 'state', label: 'Durum' },
  { key: 'errorCode', label: 'Hata nedeni' },
  { key: 'attempts', label: 'Deneme', align: 'end' },
  { key: 'failedAt', label: 'Zaman' },
  { key: 'tenantId', label: 'Müşteri' },
  { key: 'reqId', label: 'İz' },
]
const GROUP_COLUMNS: EkTableColumn[] = [
  { key: 'errorCode', label: 'Hata nedeni' },
  { key: 'jobTypes', label: 'İş türleri' },
  { key: 'count', label: 'Adet', align: 'end' },
  { key: 'oldestFailedAt', label: 'En eski hata' },
  { key: 'actions', label: '', type: 'actions' },
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

// Görünüm (?gorunum=ayrinti): varsayılan özet; BoViewSwitch değeri URL'e yazar.
const view = computed(() => (route.query.gorunum === 'ayrinti' ? 'ayrinti' : 'ozet'))
const activeFilters = computed(() => [tidF.value !== null, !!integF.value, !!codeF.value].filter(Boolean).length)
const emptyMessage = computed(() =>
  filtered.value
    ? 'Bu süzgeçle eşleşen başarısız iş bulunamadı — süzgeci gevşetin ya da temizleyin.'
    : source.value === 'dlq'
      ? 'İnceleme bekleyen kalıcı hata bulunmuyor.'
      : 'Kuyrukta başarısız iş yok — tüm işler tamamlandı ya da yeniden denendi.',
)
// Özet: süzgeçe uyan işler (backend `groups` verirse kesin; yoksa ilk 50 iş örneklemi) hata koduna göre gruplanır.
const sum = useResource(() =>
  api.call('BackofficeEngineService/listFailedJobs', {
    queue: queue.value,
    source: source.value,
    limit: 50,
    ...(tidF.value ? { tid: tidF.value } : {}),
    ...(integF.value ? { integrationCode: integF.value } : {}),
    ...(codeF.value ? { errorCode: codeF.value } : {}),
  }),
)
const summary = computed(() => (sum.data.value ? summarize(sum.data.value) : null))
const summaryPhase = computed(() => (sum.phase.value === 'ready' && summary.value && !summary.value.rows.length ? 'empty' : sum.phase.value))
const groupItems = computed(() => (summary.value?.rows ?? []) as unknown as Array<Record<string, unknown>>)
/** Gruptan ayrıntılı görünüme geçiş: hata koduna süzgeçli. */
function drill(code: string) {
  const { kod: _k, errorCode: _c, ...rest } = route.query
  router.replace({ query: { ...rest, kod: code, gorunum: 'ayrinti' } })
}
function reloadAll(keep = false) {
  if (!queue.value) return
  void list.reload({ keep })
  void sum.load()
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
const selectable = computed(() => bullItems.value.filter((j) => j.state !== 'retrying').slice(0, RETRY_JOBS_MAX).map((j) => String(j.id)))
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
    void sum.load()
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
  reloadAll()
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
.bo-engine-stack {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  min-width: 0;
}
.bo-failed__total {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
}
.bo-failed__tid {
  max-width: 160px;
}
.bo-failed__codehint {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-failed__type {
  white-space: nowrap;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
}
.bo-failed__cause {
  min-width: 14em;
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-type-label-weight);
}
.bo-failed__reason {
  min-width: 16em;
}
.bo-failed__times {
  white-space: nowrap;
}
.bo-failed__types {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-3);
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
</style>
