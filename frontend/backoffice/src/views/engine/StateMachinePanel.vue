<template>
  <section class="bo-panel" aria-labelledby="bo-sm-title">
    <header class="bo-panel__bar">
      <div>
        <h2 id="bo-sm-title" class="bo-panel__title">Katalog durum makinesi</h2>
        <p class="bo-panel__hint">Ürün gönderim sinyalleri (ExportSignals) ve içe aktarma işleri (ImportJobs). Takılı kira: sahibi dolu ama süresi dolmuş ya da {{ timeoutText }} boyunca ilerlemeyen iş.</p>
      </div>
      <EkRefreshButton :loading="res.refreshing.value || res.phase.value === 'loading'" :last-updated="res.loadedAt.value" @refresh="res.load()" />
    </header>

    <StateBlock :phase="res.phase.value" :error="res.error.value" skeleton="cards" :rows="2" @retry="res.load()">
      <template v-if="res.data.value">
        <div class="bo-grid-2">
          <EkCard title="Gönderim sinyalleri" :subtitle="`${formatCount(res.data.value.exportSignals.locked)} kilitli · kira ${formatDuration(res.data.value.leaseTimeoutMs.export)}`" icon="mdi-upload-outline" icon-tone="info">
            <MeterList :rows="rows(res.data.value.exportSignals.byStatus, EXPORT_ORDER)" label="Gönderim sinyali durum dağılımı" />
          </EkCard>
          <EkCard title="İçe aktarma işleri" :subtitle="`${formatCount(res.data.value.importJobs.locked)} kilitli · kira ${formatDuration(res.data.value.leaseTimeoutMs.import)}`" icon="mdi-download-outline" icon-tone="info">
            <MeterList :rows="rows(res.data.value.importJobs.byStatus, IMPORT_ORDER)" label="İçe aktarma durum dağılımı" />
          </EkCard>
        </div>

        <EkCard
          title="Takılı kiralar"
          :subtitle="res.data.value.stuckLeaseCount ? `${res.data.value.stuckLeaseCount} kayıt${res.data.value.stuckListTruncated ? ' · liste ilk 100 ile sınırlı' : ''}` : 'Sahip pod sağlıklı'"
          icon="mdi-lock-clock"
          :icon-tone="res.data.value.stuckLeaseCount ? 'warning' : 'success'"
          flush
        >
          <EkEmptyState v-if="!res.data.value.stuckLeases.length" variant="no-data" title="Takılı kira yok" message="Tüm kilitli işlerin sahibi pod kirasını yeniliyor." />
          <EkDataTable v-else :items="leases" :columns="COLUMNS" row-key="id">
            <template #cell-kind="{ item }">
              <span class="bo-cell-stack"><span>{{ item.kind === 'export' ? 'Gönderim' : 'İçe aktarma' }}</span><code class="bo-code">{{ item.id }}</code></span>
            </template>
            <template #cell-tenantId="{ item }">
              <RouterLink v-if="item.tenantId" :to="`/musteriler/${item.tenantId}`" class="ek-num">#{{ item.tenantId }}</RouterLink>
              <span v-else class="bo-muted">—</span>
            </template>
            <template #cell-integrationCode="{ item }">
              <EkChannelDot v-if="item.integrationCode" :code="item.integrationCode" :name="CHANNEL[item.integrationCode] ?? item.integrationCode" variant="plain" />
            </template>
            <template #cell-status="{ item }"><code class="bo-code">{{ item.status }}</code></template>
            <template #cell-lockedBy="{ item }"><code class="bo-code">{{ item.lockedBy }}</code></template>
            <template #cell-staleForMs="{ item }">
              <span class="bo-cell-stack"><strong class="ek-num">{{ formatDuration(item.staleForMs) }}</strong><span>son etkinlik {{ formatRelative(item.lastActivityAt ?? undefined) }}</span></span>
            </template>
            <template #cell-actions="{ item }">
              <EkButton size="sm" tone="secondary" icon="mdi-lock-open-variant-outline" :aria-label="`${item.id} kirasını serbest bırak`" data-testid="release" @click="release.open(item as StuckLease)">Serbest bırak</EkButton>
            </template>
          </EkDataTable>
        </EkCard>
      </template>
    </StateBlock>

    <GuardedDialog
      :action="release"
      title="Kira serbest bırakılsın mı?"
      :description="release.context.value ? `${release.context.value.kind === 'export' ? 'Gönderim sinyali' : 'İçe aktarma işi'} · sahip ${release.context.value.lockedBy}` : ''"
      :items="releaseItems"
      confirm-label="Serbest bırak"
      confirm-icon="mdi-lock-open-variant-outline"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { EkButton, EkCard, EkChannelDot, EkDataTable, EkEmptyState, EkRefreshButton, type EkTableColumn, type StatusTone } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { GetStateMachineJobsResponse, StuckLease } from '@bo/api/contract'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import MeterList, { type MeterRow } from '@bo/components/kit/MeterList.vue'
import { CHANNEL } from '@bo/utils/labels'
import { formatRelative } from '@bo/utils/format'
import { formatCount, formatDuration } from '@bo/utils/units'
import { notify } from '@bo/utils/toast'
import '@bo/styles/kit.css'

const emit = defineEmits<{ stuck: [count: number | null] }>()
const EXPORT_ORDER = ['QUEUED', 'PREPARING', 'PENDING', 'SENT', 'WAITING', 'COMPLETED', 'FAILED']
const IMPORT_ORDER = ['WAITING_FOR_FETCH', 'FETCHING', 'READY_TO_SYNC', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'ARCHIVED']
const TONE: Record<string, StatusTone> = { COMPLETED: 'success', FAILED: 'danger', CANCELLED: 'neutral', ARCHIVED: 'neutral' }
const COLUMNS: EkTableColumn[] = [
  { key: 'kind', label: 'Kayıt' },
  { key: 'tenantId', label: 'Müşteri' },
  { key: 'integrationCode', label: 'Entegrasyon' },
  { key: 'status', label: 'Durum' },
  { key: 'lockedBy', label: 'Sahip pod' },
  { key: 'staleForMs', label: 'Takılı süre' },
  { key: 'actions', label: '', type: 'actions' },
]

const res = useResource<GetStateMachineJobsResponse>(() => api.call('BackofficeEngineService/getStateMachineJobs', {}))
const leases = computed(() => (res.data.value?.stuckLeases ?? []) as unknown as Array<Record<string, unknown>>)
const timeoutText = computed(() => (res.data.value ? formatDuration(res.data.value.leaseTimeoutMs.export) : 'kira süresi'))

function rows(byStatus: Record<string, number | undefined>, order: string[]): MeterRow[] {
  return order.filter((k) => byStatus[k] !== undefined).map((k) => ({ key: k, label: k, value: byStatus[k] ?? 0, display: formatCount(byStatus[k] ?? 0), tone: TONE[k] ?? 'info' }))
}

const releaseItems = computed(() => {
  const l = release.context.value
  const base = ['Kira koşulu sunucuda yeniden denetlenir: kira sağlıklıysa hiçbir şey değişmez.', 'Sahip pod bilgisi temizlenir; iş bir sonraki turda başka bir pod tarafından alınabilir.']
  if (l?.kind === 'import' && (l.status === 'FETCHING' || l.status === 'PROCESSING')) base.push('Bu içe aktarma işi FAILED durumuna alınır ve yeniden başlatılmaz; müşteri ya da sonraki tur yeniden başlatır.')
  return base
})

const release = useGuardedAction(
  (l: StuckLease, reason) => api.call('BackofficeEngineService/releaseStuckLease', { kind: l.kind, id: l.id, reason }),
  (r) => {
    notify('success', `Kira serbest bırakıldı (önceki sahip: ${r.previousOwner}).`)
    res.load()
  },
)

watch(() => res.data.value, (d) => emit('stuck', d ? d.stuckLeaseCount : null))
onMounted(() => res.load())
</script>
