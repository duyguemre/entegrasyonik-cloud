<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="stats.loadedAt.value ?? undefined" :stale="stats.stale.value">
      <template #actions>
        <CopyViewLink />
        <BoAction kind="refresh" :loading="stats.refreshing.value || list.refreshing.value" data-page-refresh @click="refresh" />
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <BoSection id="bo-dlv-stats" title="Teslim durumu" description="E-posta kanalı. Kalıcı hatalar elle yeniden denenebilir ya da atılabilir." icon="mdi-email-fast-outline">
      <template #actions>
        <BoSegmented v-model="win" label="Zaman aralığı" :options="WINDOWS" />
      </template>
      <StateBlock v-if="!stats.data.value" :phase="stats.phase.value" :error="stats.error.value" skeleton="cards" :rows="2" degraded-title="Teslim istatistikleri şu an okunamıyor" @retry="stats.load()" />
      <div v-else class="bo-dlv__stats">
        <BoTileGrid :min="176" dense data-testid="delivery-kpis">
          <BoStat v-for="k in kpis" :key="k.key" :label="k.label" :value="k.value" :hint="k.hint" :tone="k.tone" />
        </BoTileGrid>
        <BoTileGrid :cols="2">
          <BoSection title="Durum dağılımı" :heading-level="3" fill>
            <MeterList :rows="statusRows" label="Teslim durum dağılımı" />
          </BoSection>
          <BoSection title="Koda göre" description="En çok teslim üreten bildirim kodları" :heading-level="3" fill flush>
            <EkEmptyState v-if="!byCode.length" variant="no-data" title="Teslim yok" message="Bu aralıkta e-posta teslimi oluşmadı." />
            <BoTableFrame v-else :label="`Koda göre teslimler (${win === '24h' ? 'son 24 saat' : 'son 7 gün'})`" flat>
              <template #head>
                <tr><th scope="col">Kod</th><th scope="col" class="is-num">Toplam</th><th scope="col" class="is-num">Sorunlu</th></tr>
              </template>
              <tr v-for="c in byCode" :key="c.code">
                <th scope="row"><button type="button" class="bo-link-btn bo-mono" :aria-label="`${c.code} teslimlerini listele`" @click="code = c.code">{{ c.code }}</button></th>
                <td class="is-num ek-num">{{ c.total }}</td>
                <td class="is-num ek-num" :class="{ 'bo-dlv__bad': c.bad > 0 }">{{ c.bad }}</td>
              </tr>
            </BoTableFrame>
          </BoSection>
        </BoTileGrid>
      </div>
    </BoSection>

    <BoSection id="bo-dlv-list" title="Teslimler" description="En yeni önce. Satırda alıcı adresi ve ileti metni yoktur; hata yalnız sınıf koduyla gösterilir." icon="mdi-format-list-bulleted">
      <BoFilterBar label="Teslim süzgeçleri" :active="activeFilters" @clear="clearFilters">
        <BoSegmented v-model="status" label="Teslim durumu" :options="STATUS_OPTS" />
        <v-text-field v-model="codeInput" label="Bildirim kodu" placeholder="ORDER_SYNC_FAILED" density="compact" hide-details clearable class="bo-toolbar__field" data-testid="code-filter" @keydown.enter="code = codeInput?.trim().toUpperCase() || ''" @click:clear="code = ''" @blur="code = codeInput?.trim().toUpperCase() || ''" />
        <v-text-field v-model="tidInput" label="Müşteri no" type="number" min="1" density="compact" hide-details clearable class="bo-toolbar__field bo-dlv__tid" @keydown.enter="applyTid" @blur="applyTid" @click:clear="tid = null" />
      </BoFilterBar>
      <EkAlert v-if="eventId" tone="info" dense :title="`Olay ${eventId} teslimleri`" text="Müşteri bildirim geçmişinden açılan tek olayın teslimleri gösteriliyor.">
        <template #actions><EkButton size="sm" tone="secondary" icon="mdi-close" @click="eventId = ''">Olay süzgecini kaldır</EkButton></template>
      </EkAlert>
      <BoDataTable
        :items="rows"
        :columns="COLUMNS"
        row-key="id"
        label="Teslimler"
        :phase="list.phase.value"
        :error="list.error.value"
        :empty-title="filtered ? 'Süzgece uyan teslim yok' : 'Teslim yok'"
        :empty-message="filtered ? 'Durum, kod ya da müşteri süzgecini değiştirin.' : 'Henüz e-posta teslimi oluşmadı.'"
        @retry="list.reload()"
      >
        <template #cell-code="{ item }">
          <span class="bo-cell-stack"><code class="bo-code">{{ item.code }}</code><span class="bo-mono bo-muted">{{ item.id }}</span></span>
        </template>
        <template #cell-tid="{ item }">
          <RouterLink v-if="(item as DeliveryRow).tid" :to="`/musteriler/${item.tid}`" class="ek-num bo-hit">#{{ item.tid }}</RouterLink>
          <span v-else class="bo-muted">platform</span>
        </template>
        <template #cell-status="{ item }">
          <span class="bo-cell-stack">
            <EkStatusChip :tone="DELIVERY_STATUS[(item as DeliveryRow).status].tone" :label="DELIVERY_STATUS[(item as DeliveryRow).status].label" dot :title="DELIVERY_STATUS[(item as DeliveryRow).status].hint" />
            <span v-if="item.lastErrorCode" class="bo-muted">{{ deliveryErrorLabel((item as DeliveryRow).lastErrorCode) }}</span>
          </span>
        </template>
        <template #cell-attempts="{ item }">
          <span class="bo-cell-stack"><span class="ek-num">{{ item.attempts }}</span><span class="bo-muted">{{ item.mode === 'digest' ? 'özet' : 'anlık' }}</span></span>
        </template>
        <template #cell-when="{ item }">
          <span class="bo-cell-stack">
            <span>{{ formatRelative((item as DeliveryRow).createdAt) }}</span>
            <span class="bo-muted">{{ whenText(item as DeliveryRow) }}</span>
          </span>
        </template>
        <template #cell-actions="{ item }">
          <span class="bo-row-actions">
            <BoAction v-if="canRetry(item as DeliveryRow)" kind="retry" size="sm" icon-only :object="String(item.id)" data-testid="retry" @click="retry.open(item as DeliveryRow)" />
            <BoAction v-if="canDiscard(item as DeliveryRow)" kind="discard" size="sm" icon-only :object="String(item.id)" data-testid="discard" @click="discard.open(item as DeliveryRow)" />
          </span>
        </template>
        <template v-if="list.phase.value === 'ready'" #footer>
          <BoPagination :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" @more="list.loadMore()" />
        </template>
      </BoDataTable>
    </BoSection>

    <GuardedDialog
      :action="retry"
      title="Teslim yeniden denensin mi?"
      irreversible
      :description="retry.context.value ? `${retry.context.value.code} · ${retry.context.value.id}` : ''"
      :tenant="retry.context.value?.tid ? { tid: retry.context.value.tid, name: `Müşteri #${retry.context.value.tid}` } : undefined"
      :items="['Teslim bekleyen duruma alınır, deneme sayacı sıfırlanır ve hemen kuyruğa girer.', 'E-posta gerçekten gönderilebilir; canlı salt-okuma kipinde bu işlem kapalıdır.', 'Gerekçe denetim kaydına yazılır.']"
      confirm-label="Yeniden dene"
      confirm-icon="mdi-replay"
    />
    <GuardedDialog
      :action="discard"
      title="Teslim atılsın mı?"
      danger
      :description="discard.context.value ? `${discard.context.value.code} · ${discard.context.value.id}` : ''"
      :tenant="discard.context.value?.tid ? { tid: discard.context.value.tid, name: `Müşteri #${discard.context.value.tid}` } : undefined"
      :items="['Teslim bastırılır ve bir daha denenmez.', 'Gönderim sırasındaki teslim atılamaz. Gerekçe denetim kaydına yazılır.']"
      :confirm-text="discard.context.value?.id"
      confirm-label="Teslimi at"
      confirm-icon="mdi-delete-outline"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkButton, EkEmptyState, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { DeliveryRow, DeliveryStats, DeliveryStatus, DeliveryWindow } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import CopyViewLink from '@bo/components/CopyViewLink.vue'
import { deliveriesVerdict } from './notificationsVerdict'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoTileGrid from '@bo/components/r2/BoTileGrid.vue'
import BoStat from '@bo/components/r2/BoStat.vue'
import BoFilterBar from '@bo/components/r2/BoFilterBar.vue'
import BoSegmented, { type BoSegmentOption } from '@bo/components/r2/BoSegmented.vue'
import BoDataTable from '@bo/components/r2/BoDataTable.vue'
import BoTableFrame from '@bo/components/r2/BoTableFrame.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import MeterList, { type MeterRow } from '@bo/components/kit/MeterList.vue'
import { DELIVERY_STATUS, deliveryErrorLabel } from '@bo/utils/labels'
import { formatDateTime, formatRelative } from '@bo/utils/format'
import { formatCount } from '@bo/utils/units'
import { notifyAudited } from '@bo/utils/toast'
import '@bo/styles/kit.css'

const route = useRoute()
const router = useRouter()
const WINDOWS: Array<BoSegmentOption<DeliveryWindow>> = [
  { value: '24h', label: 'Son 24 saat' },
  { value: '7d', label: 'Son 7 gün' },
]
const STATUS_OPTS: Array<BoSegmentOption<DeliveryStatus | 'all'>> = [
  { value: 'all', label: 'Tümü' },
  { value: 'dead', label: 'Kalıcı hata' },
  { value: 'failed', label: 'Başarısız' },
  { value: 'pending', label: 'Bekliyor' },
  { value: 'sent', label: 'Gönderildi' },
  { value: 'skipped', label: 'Atlandı' },
  { value: 'suppressed', label: 'Bastırıldı' },
]
const ORDER: DeliveryStatus[] = ['sent', 'pending', 'sending', 'failed', 'dead', 'skipped', 'suppressed']
const COLUMNS: EkTableColumn[] = [
  { key: 'code', label: 'Bildirim' },
  { key: 'tid', label: 'Müşteri' },
  { key: 'status', label: 'Durum' },
  { key: 'attempts', label: 'Deneme', align: 'end' },
  { key: 'when', label: 'Zaman' },
  { key: 'actions', label: '', type: 'actions' },
]

const q = (k: string) => (typeof route.query[k] === 'string' ? (route.query[k] as string) : '')
const win = ref<DeliveryWindow>('24h')
const status = ref<DeliveryStatus | 'all'>((STATUS_OPTS.some((o) => o.value === q('durum')) ? q('durum') : 'all') as DeliveryStatus | 'all')
const code = ref(q('kod'))
const codeInput = ref(code.value)
const tid = ref<number | null>(Number(q('tid')) > 0 ? Number(q('tid')) : null)
const tidInput = ref<string>(tid.value ? String(tid.value) : '')
const eventId = ref(/^[a-f0-9]{24}$/i.test(q('olay')) ? q('olay') : '')
const activeFilters = computed(() => (status.value !== 'all' ? 1 : 0) + (code.value ? 1 : 0) + (tid.value ? 1 : 0) + (eventId.value ? 1 : 0))
function clearFilters() {
  status.value = 'all'
  code.value = ''
  tid.value = null
  tidInput.value = ''
  eventId.value = ''
}
const filtered = computed(() => status.value !== 'all' || !!code.value || !!tid.value || !!eventId.value)

function applyTid() {
  const n = Number(tidInput.value)
  tid.value = Number.isInteger(n) && n > 0 ? n : null
}

const stats = useResource<DeliveryStats>(() => api.call('BackofficeNotificationService/getDeliveryStats', {}))
const w = computed(() => stats.data.value?.windows[win.value] ?? null)
const kpis = computed(() => {
  const s = w.value?.byStatus
  const oldest = stats.data.value?.oldestPendingAgeSec ?? null
  if (!s) return []
  const total = Object.values(s).reduce((a, b) => a + b, 0)
  return [
    { key: 'total', label: 'Toplam', value: formatCount(total), hint: win.value === '24h' ? 'son 24 saat' : 'son 7 gün', tone: undefined },
    { key: 'sent', label: 'Gönderildi', value: formatCount(s.sent), hint: total ? `%${Math.round((s.sent / total) * 100)}` : '—', tone: undefined },
    { key: 'dead', label: 'Kalıcı hata', value: formatCount(s.dead), hint: s.dead ? 'elle işlem bekliyor' : 'yok', tone: s.dead ? ('critical' as const) : undefined },
    {
      key: 'oldest',
      label: 'En eski bekleyen',
      value: oldest === null ? '—' : oldest < 60 ? `${oldest} sn` : `${Math.round(oldest / 60)} dk`,
      hint: oldest === null ? 'bekleyen teslim yok' : `${formatCount(s.pending)} bekliyor`,
      tone: oldest !== null && oldest > 600 ? ('warning' as const) : undefined,
    },
  ]
})
const statusRows = computed<MeterRow[]>(() =>
  ORDER.map((k) => ({ key: k, label: DELIVERY_STATUS[k].label, value: w.value?.byStatus[k] ?? 0, tone: DELIVERY_STATUS[k].tone, dot: true })),
)
const byCode = computed(() =>
  (w.value?.byCode ?? []).slice(0, 8).map((c) => {
    const v = (k: DeliveryStatus) => c.statuses[k] ?? 0
    const total = Object.values(c.statuses).reduce((a, b) => a + (b ?? 0), 0)
    return { code: c.code, total, sent: v('sent'), bad: v('dead') + v('failed') }
  }),
)

const list = useCursorList<DeliveryRow>((cursor) =>
  api.call('BackofficeNotificationService/listDeliveries', {
    ...(status.value !== 'all' ? { status: status.value } : {}),
    ...(code.value ? { code: code.value } : {}),
    ...(tid.value ? { tid: tid.value } : {}),
    ...(eventId.value ? { eventId: eventId.value } : {}),
    cursor,
    limit: 25,
  }),
)
const rows = computed(() => list.items.value as unknown as Array<Record<string, unknown>>)
const canRetry = (d: DeliveryRow) => d.status === 'dead' || d.status === 'failed'
const canDiscard = (d: DeliveryRow) => ['pending', 'dead', 'failed', 'skipped'].includes(d.status)
function whenText(d: DeliveryRow) {
  if (d.sentAt) return `gönderildi ${formatDateTime(d.sentAt)}`
  if (d.nextAttemptAt && (d.status === 'pending' || d.status === 'failed')) return `sonraki deneme ${formatRelative(d.nextAttemptAt)}`
  return formatDateTime(d.createdAt)
}

const retry = useGuardedAction(
  (d: DeliveryRow, reason) => api.call('BackofficeNotificationService/retryDelivery', { id: d.id, ...(d.tid ? { tid: d.tid } : {}), reason }),
  (_r, d) => {
    list.reload({ keep: true })
    notifyAudited(`${d.code} teslimi yeniden kuyruğa alındı.`, () => router.push({ path: '/denetim', query: { event: 'backoffice.write', ...(d.tid ? { tid: String(d.tid) } : {}) } }))
    stats.load()
  },
)
const discard = useGuardedAction(
  (d: DeliveryRow, reason) => api.call('BackofficeNotificationService/discardDelivery', { id: d.id, ...(d.tid ? { tid: d.tid } : {}), reason }),
  (_r, d) => {
    list.reload({ keep: true })
    notifyAudited(`${d.code} teslimi atıldı; bir daha denenmeyecek.`, () => router.push({ path: '/denetim', query: { event: 'backoffice.write', ...(d.tid ? { tid: String(d.tid) } : {}) } }))
    stats.load()
  },
)

const verdict = computed(() =>
  stats.data.value || stats.phase.value !== 'loading'
    ? deliveriesVerdict({
        stats: stats.data.value,
        failed: !stats.data.value,
        stale: stats.stale.value,
        rows: list.items.value,
        retry: () => stats.load(),
        retryDelivery: (d) => retry.open(d),
      })
    : null,
)

function refresh() {
  stats.load()
  list.reload({ keep: true })
}

// Hüküm bağlantıları aynı sayfada yalnız sorgu değiştirir: sorgu → süzgeç.
watch(
  () => [q('durum'), q('kod'), q('tid'), q('olay')],
  ([d, k, t, o]) => {
    status.value = (STATUS_OPTS.some((x) => x.value === d) ? d : 'all') as DeliveryStatus | 'all'
    code.value = k
    tid.value = Number(t) > 0 ? Number(t) : null
    tidInput.value = tid.value ? String(tid.value) : ''
    eventId.value = /^[a-f0-9]{24}$/i.test(o) ? o : ''
  },
)
watch([status, code, tid, eventId], () => {
  codeInput.value = code.value
  router.replace({
    query: {
      ...(status.value !== 'all' ? { durum: status.value } : {}),
      ...(code.value ? { kod: code.value } : {}),
      ...(tid.value ? { tid: String(tid.value) } : {}),
      ...(eventId.value ? { olay: eventId.value } : {}),
    },
  })
  list.reload()
})
onMounted(() => {
  stats.load()
  list.reload()
})
</script>

<style scoped>
.bo-dlv__bad {
  color: var(--ek-color-error-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-dlv__tid {
  max-width: 160px;
}
.bo-dlv__stats {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}
</style>
