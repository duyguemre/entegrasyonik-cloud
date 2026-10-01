<template>
  <section class="bo-panel" aria-labelledby="bo-failed-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-failed-title" class="bo-panel__title">Başarısız işler</h2>
        <p class="bo-panel__hint">En yeni önce. BullMQ başarısız kümesi son 500 işle sınırlıdır; kalıcı hatalar ölü mektup kuyruğundadır.</p>
      </div>
      <EkRefreshButton :loading="list.refreshing.value || list.phase.value === 'loading'" @refresh="list.reload({ keep: true })" />
    </header>

    <div class="bo-toolbar">
      <v-select v-model="queue" :items="queues" label="Kuyruk" density="compact" hide-details class="bo-toolbar__field" :disabled="!queues.length" />
      <div class="bo-seg" role="radiogroup" aria-label="Kaynak">
        <button v-for="o in SOURCES" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="source === o.value" @click="source = o.value">{{ o.label }}</button>
      </div>
    </div>

    <EkAlert v-if="source === 'dlq'" tone="info" dense title="Ölü mektuplar salt okunur" text="Kalıcı hatalı ya da denemesi tükenmiş işler. Yeniden kuyruğa alma/silme kuralı (idempotency) henüz karara bağlanmadı; bu yüzden yalnız listelenir." />

    <EkCard flush class="bo-dense">
      <StateBlock
        :phase="list.phase.value"
        :error="list.error.value"
        :retrying="list.phase.value === 'loading'"
        degraded-title="Kuyruk şu an kullanılamıyor"
        :empty-title="source === 'dlq' ? 'Ölü mektup yok' : 'Başarısız iş yok'"
        :empty-message="source === 'dlq' ? 'İnceleme bekleyen kalıcı hata bulunmuyor.' : 'Kuyrukta başarısız iş yok — tüm işler tamamlandı ya da yeniden denendi.'"
        @retry="list.reload()"
      >
        <EkDataTable v-if="source === 'bullmq'" :items="bullItems" :columns="BULL_COLUMNS" row-key="id">
          <template #cell-id="{ item }">
            <code class="bo-id" :title="item.operation">{{ item.id }}</code>
          </template>
          <template #cell-tenantId="{ item }">
            <RouterLink v-if="item.tenantId" :to="`/musteriler/${item.tenantId}`" class="ek-num">#{{ item.tenantId }}</RouterLink>
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
            <RouterLink v-if="item.tenantId" :to="`/musteriler/${item.tenantId}`" class="ek-num">#{{ item.tenantId }}</RouterLink>
            <span v-else class="bo-muted">platform</span>
          </template>
          <template #cell-integrationCode="{ item }">
            <EkChannelDot v-if="item.integrationCode" :code="item.integrationCode" :name="CHANNEL[item.integrationCode] ?? item.integrationCode" variant="plain" />
          </template>
          <template #cell-errorCode="{ item }"><code class="bo-code-tag" :title="codeInfo(item.errorCode).text">{{ item.errorCode }}</code></template>
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
      :action="discard"
      title="Başarısız iş silinsin mi?"
      :description="discard.context.value ? `${discard.context.value.id} · ${discard.context.value.operation}` : ''"
      :items="['İş başarısız kümeden kalıcı olarak silinir; yeniden denenemez.', 'Aktif işler silinemez. Gerekçe denetim kaydına yazılır.']"
      confirm-label="Sil"
      confirm-icon="mdi-delete-outline"
      danger
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkButton, EkCard, EkChannelDot, EkDataTable, EkRefreshButton, EkRelativeTime, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { DlqRecord, FailedBullJob, FailedJobSource } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import LoadMore from '@bo/components/kit/LoadMore.vue'
import { CHANNEL } from '@bo/utils/labels'
import { codeInfo } from '@bo/utils/codes'
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
  { key: 'failedAt', label: 'Zaman' },
]

const queues = ref<string[]>([])
const queue = ref<string>('')
// ?kaynak=dlq — genel bakıştaki "elle inceleme bekliyor" bağlantısı doğrudan ölü mektuplara açılır.
const route = useRoute()
const router = useRouter()
const source = ref<FailedJobSource>(route.query.kaynak === 'dlq' ? 'dlq' : 'bullmq')
watch(source, (v) => {
  const { kaynak: _k, ...rest } = route.query
  router.replace({ query: v === 'dlq' ? { ...rest, kaynak: 'dlq' } : rest })
})

const list = useCursorList<FailedBullJob | DlqRecord>((cursor) =>
  api.call('BackofficeEngineService/listFailedJobs', { queue: queue.value, source: source.value, cursor, limit: 25 }),
)
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

watch([queue, source], () => queue.value && list.reload())

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
