<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="stats.loadedAt.value ?? undefined" :stale="stats.stale.value">
      <template #actions>
        <CopyViewLink />
        <EkButton tone="secondary" icon="mdi-refresh" :loading="stats.refreshing.value || list.refreshing.value" data-page-refresh @click="refresh">Yenile</EkButton>
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <section class="bo-panel" aria-labelledby="bo-dlv-stats">
      <header class="bo-panel__bar">
        <div>
          <h2 id="bo-dlv-stats" class="bo-panel__title">Teslim durumu</h2>
          <p class="bo-panel__hint">E-posta kanalı. Kalıcı hatalar elle yeniden denenebilir ya da atılabilir.</p>
        </div>
        <div class="bo-seg" role="radiogroup" aria-label="Zaman aralığı">
          <button v-for="w in WINDOWS" :key="w.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="win === w.value" :data-window="w.value" @click="win = w.value">{{ w.label }}</button>
        </div>
      </header>
      <StateBlock v-if="!stats.data.value" :phase="stats.phase.value" :error="stats.error.value" skeleton="cards" :rows="2" degraded-title="Teslim istatistikleri şu an okunamıyor" @retry="stats.load()" />
      <template v-else>
        <div class="bo-nstat" data-testid="delivery-kpis">
          <div v-for="k in kpis" :key="k.key" class="bo-nstat__tile" :class="k.tone && `is-${k.tone}`">
            <span class="bo-nstat__label">{{ k.label }}</span>
            <span class="bo-nstat__value ek-num">{{ k.value }}</span>
            <span class="bo-nstat__hint">{{ k.hint }}</span>
          </div>
        </div>
        <div class="bo-grid-2">
          <EkCard title="Durum dağılımı" :heading-level="3">
            <MeterList :rows="statusRows" label="Teslim durum dağılımı" />
          </EkCard>
          <EkCard title="Koda göre" subtitle="En çok teslim üreten bildirim kodları" :heading-level="3" flush>
            <EkEmptyState v-if="!byCode.length" variant="no-data" title="Teslim yok" message="Bu aralıkta e-posta teslimi oluşmadı." />
            <div v-else class="bo-table-wrap" tabindex="0" role="region" aria-label="Koda göre teslimler">
              <table class="bo-table" data-density="compact">
                <caption class="ek-sr-only">Koda göre teslimler ({{ win === '24h' ? 'son 24 saat' : 'son 7 gün' }})</caption>
                <thead>
                  <tr><th scope="col">Kod</th><th scope="col" class="is-num">Toplam</th><th scope="col" class="is-num">Gönderildi</th><th scope="col" class="is-num">Sorunlu</th></tr>
                </thead>
                <tbody>
                  <tr v-for="c in byCode" :key="c.code">
                    <th scope="row"><button type="button" class="bo-link-btn bo-mono" :aria-label="`${c.code} teslimlerini listele`" @click="code = c.code">{{ c.code }}</button></th>
                    <td class="is-num ek-num">{{ c.total }}</td>
                    <td class="is-num ek-num">{{ c.sent }}</td>
                    <td class="is-num ek-num" :class="{ 'bo-dlv__bad': c.bad > 0 }">{{ c.bad }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </EkCard>
        </div>
      </template>
    </section>

    <section class="bo-panel" aria-labelledby="bo-dlv-list">
      <header class="bo-panel__bar">
        <div>
          <h2 id="bo-dlv-list" class="bo-panel__title">Teslimler</h2>
          <p class="bo-panel__hint">En yeni önce. Satırda alıcı adresi ve ileti metni yoktur; hata yalnız sınıf koduyla gösterilir.</p>
        </div>
      </header>
      <div class="bo-toolbar">
        <div class="bo-seg" role="radiogroup" aria-label="Teslim durumu">
          <button v-for="o in STATUS_OPTS" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="status === o.value" :data-status="o.value" @click="status = o.value">{{ o.label }}</button>
        </div>
        <v-text-field v-model="codeInput" label="Bildirim kodu" placeholder="ORDER_SYNC_FAILED" density="compact" hide-details clearable class="bo-toolbar__field" data-testid="code-filter" @keydown.enter="code = codeInput?.trim().toUpperCase() || ''" @click:clear="code = ''" @blur="code = codeInput?.trim().toUpperCase() || ''" />
        <v-text-field v-model="tidInput" label="Müşteri no" type="number" min="1" density="compact" hide-details clearable class="bo-toolbar__field bo-dlv__tid" @keydown.enter="applyTid" @blur="applyTid" @click:clear="tid = null" />
      </div>
      <EkAlert v-if="eventId" tone="info" dense :title="`Olay ${eventId} teslimleri`" text="Müşteri bildirim geçmişinden açılan tek olayın teslimleri gösteriliyor.">
        <template #actions><EkButton size="sm" tone="secondary" icon="mdi-close" @click="eventId = ''">Olay süzgecini kaldır</EkButton></template>
      </EkAlert>
      <EkCard flush>
        <StateBlock
          :phase="list.phase.value"
          :error="list.error.value"
          :retrying="list.phase.value === 'loading'"
          :empty-title="filtered ? 'Süzgece uyan teslim yok' : 'Teslim yok'"
          :empty-message="filtered ? 'Durum, kod ya da müşteri süzgecini değiştirin.' : 'Henüz e-posta teslimi oluşmadı.'"
          :empty-variant="filtered ? 'no-results' : 'no-data'"
          @retry="list.reload()"
        >
          <EkDataTable :items="rows" :columns="COLUMNS" row-key="id">
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
                <EkButton v-if="canRetry(item as DeliveryRow)" size="sm" tone="secondary" icon="mdi-replay" :aria-label="`${item.id} yeniden dene`" data-testid="retry" @click="retry.open(item as DeliveryRow)">Yeniden dene</EkButton>
                <EkButton v-if="canDiscard(item as DeliveryRow)" size="sm" tone="ghost" icon="mdi-delete-outline" icon-only :aria-label="`${item.id} at`" data-testid="discard" @click="discard.open(item as DeliveryRow)" />
              </span>
            </template>
          </EkDataTable>
          <BoPagination :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" @more="list.loadMore()" />
        </StateBlock>
      </EkCard>
    </section>

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
import { EkAlert, EkButton, EkCard, EkDataTable, EkEmptyState, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { DeliveryRow, DeliveryStats, DeliveryStatus, DeliveryWindow } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import { useResource } from '@bo/composables/useResource'
import { useGuardedAction } from '@bo/composables/useGuardedAction'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import CopyViewLink from '@bo/components/CopyViewLink.vue'
import { deliveriesVerdict } from './notificationsVerdict'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import GuardedDialog from '@bo/components/kit/GuardedDialog.vue'
import MeterList, { type MeterRow } from '@bo/components/kit/MeterList.vue'
import { DELIVERY_STATUS, deliveryErrorLabel } from '@bo/utils/labels'
import { formatDateTime, formatRelative } from '@bo/utils/format'
import { formatCount } from '@bo/utils/units'
import { notifyAudited } from '@bo/utils/toast'
import '@bo/styles/kit.css'

const route = useRoute()
const router = useRouter()
const WINDOWS: Array<{ value: DeliveryWindow; label: string }> = [
  { value: '24h', label: 'Son 24 saat' },
  { value: '7d', label: 'Son 7 gün' },
]
const STATUS_OPTS: Array<{ value: DeliveryStatus | 'all'; label: string }> = [
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
    { key: 'total', label: 'Toplam', value: formatCount(total), hint: win.value === '24h' ? 'son 24 saat' : 'son 7 gün', tone: '' },
    { key: 'sent', label: 'Gönderildi', value: formatCount(s.sent), hint: total ? `%${Math.round((s.sent / total) * 100)}` : '—', tone: '' },
    { key: 'dead', label: 'Kalıcı hata', value: formatCount(s.dead), hint: s.dead ? 'elle işlem bekliyor' : 'yok', tone: s.dead ? 'danger' : '' },
    {
      key: 'oldest',
      label: 'En eski bekleyen',
      value: oldest === null ? '—' : oldest < 60 ? `${oldest} sn` : `${Math.round(oldest / 60)} dk`,
      hint: oldest === null ? 'bekleyen teslim yok' : `${formatCount(s.pending)} bekliyor`,
      tone: oldest !== null && oldest > 600 ? 'warning' : '',
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
.bo-nstat {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ek-space-3);
  margin-bottom: var(--ek-space-4);
}
.bo-nstat__tile {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-raised);
}
.bo-nstat__tile.is-danger {
  border-color: var(--ek-color-error-border);
}
.bo-nstat__tile.is-warning {
  border-color: var(--ek-color-warning-border);
}
.bo-nstat__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}
.bo-nstat__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  line-height: var(--ek-type-metric-line);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-nstat__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-dlv__bad {
  color: var(--ek-color-error-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-dlv__tid {
  max-width: 160px;
}
@media (max-width: 959px) {
  .bo-nstat {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
