<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="loadedAt ?? undefined">
      <template #meta>
        <span><v-icon icon="mdi-shield-lock-outline" size="small" aria-hidden="true" /> Her görüntüleme hassas okuma olarak denetime yazılır.</span>
      </template>
      <template #actions>
        <BoAction v-if="tid" kind="refresh" :loading="list.refreshing.value || list.phase.value === 'loading'" data-page-refresh @click="list.reload({ keep: true })" />
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <form class="bo-toolbar bo-nh__search" role="search" aria-label="Müşteri seç" @submit.prevent="apply">
      <v-text-field
        v-model="tidInput"
        label="Müşteri numarası"
        type="number"
        min="1"
        density="compact"
        hide-details="auto"
        class="bo-toolbar__field"
        :error-messages="inputError"
        data-testid="tid-input"
      />
      <EkButton type="submit" tone="primary" icon="mdi-magnify" data-testid="show-history">Geçmişi göster</EkButton>
      <BoAction v-if="tid" kind="detail" :to="`/musteriler/${tid}`" :label="`Müşteri #${tid} detayı`" />
    </form>

    <BoSection v-if="!tid" label="Bildirim geçmişi">
      <EkEmptyState variant="first-run" title="Bir müşteri seçin" message="Müşteri numarasını girin ya da müşteri detayındaki bağlantıyı kullanın. Yalnız meta veri gösterilir: bildirim metni, alıcı kimliği ve e-posta adresi yoktur." />
    </BoSection>
    <BoSection v-else id="bo-nh-list" title="Bildirim geçmişi" :description="`Müşteri #${tid} · defter kaydı 30 gün saklanır.`" icon="mdi-history">
      <BoDataTable
        :items="rows"
        :columns="COLUMNS"
        row-key="id"
        label="Bildirim geçmişi"
        :phase="list.phase.value"
        :error="list.error.value"
        empty-title="Bildirim geçmişi yok"
        :empty-message="`Müşteri #${tid} için son 30 günde bildirim üretilmedi.`"
        @retry="list.reload()"
      >
        <template #cell-code="{ item }">
          <span class="bo-cell-stack">
            <code class="bo-code">{{ item.code }}</code>
            <span class="bo-muted">{{ NOTIFY_CATEGORY[(item as TenantHistoryRow).category] ?? item.category }}</span>
          </span>
        </template>
        <template #cell-severity="{ item }">
          <EkStatusChip :tone="sev(item as TenantHistoryRow).tone" :label="sev(item as TenantHistoryRow).label" dot />
        </template>
        <template #cell-count="{ item }">
          <span class="bo-cell-stack"><span class="ek-num">{{ item.count }}</span><span class="bo-muted">{{ (item as TenantHistoryRow).count > 1 ? 'gruplandı' : 'tek olay' }}</span></span>
        </template>
        <template #cell-recipients="{ item }">
          <span class="bo-cell-stack">
            <span class="ek-num">{{ item.recipientCount }} alıcı</span>
            <span class="bo-muted">uygulama içi {{ item.inAppCount }}<template v-if="(item as TenantHistoryRow).suppressedCount"> · bastırılan {{ item.suppressedCount }}</template></span>
          </span>
        </template>
        <template #cell-email="{ item }">
          <span v-if="!Object.keys((item as TenantHistoryRow).emailStatus).length" class="bo-muted">e-posta yok</span>
          <span v-else class="bo-nh__email">
            <EkStatusChip v-for="[s, n] in emailPairs(item as TenantHistoryRow)" :key="s" :tone="DELIVERY_STATUS[s].tone" :label="`${DELIVERY_STATUS[s].label} ${n}`" />
          </span>
        </template>
        <template #cell-at="{ item }">
          <span class="bo-cell-stack"><span>{{ formatRelative((item as TenantHistoryRow).at) }}</span><span class="ek-num bo-muted">{{ formatDateTime((item as TenantHistoryRow).at) }}</span></span>
        </template>
        <template #cell-actions="{ item }">
          <BoAction
            v-if="Object.keys((item as TenantHistoryRow).emailStatus).length"
            kind="detail"
            size="sm"
            label="Teslimler"
            :to="{ path: '/bildirimler/teslimler', query: { olay: item.id } }"
            :aria-label="`${item.code} olayının e-posta teslimlerini aç`"
          />
        </template>
        <template v-if="list.phase.value === 'ready'" #footer>
          <BoPagination :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" source="BackofficeNotificationService/getTenantHistory" @more="list.loadMore()" />
        </template>
      </BoDataTable>
    </BoSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkButton, EkEmptyState, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { DeliveryStatus, TenantHistoryRow } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { tenantHistoryVerdict } from './notificationsVerdict'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoDataTable from '@bo/components/r2/BoDataTable.vue'
import { DELIVERY_STATUS, NOTIFY_CATEGORY, NOTIFY_SEVERITY } from '@bo/utils/labels'
import { formatDateTime, formatRelative } from '@bo/utils/format'
import '@bo/styles/kit.css'

const COLUMNS: EkTableColumn[] = [
  { key: 'code', label: 'Bildirim' },
  { key: 'severity', label: 'Önem' },
  { key: 'count', label: 'Olay', align: 'end' },
  { key: 'recipients', label: 'Alıcı' },
  { key: 'email', label: 'E-posta' },
  { key: 'at', label: 'Zaman' },
  { key: 'actions', label: '', type: 'actions' },
]

const route = useRoute()
const router = useRouter()
const initial = Number(route.query.tid)
const tid = ref<number | null>(Number.isInteger(initial) && initial > 0 ? initial : null)
const tidInput = ref(tid.value ? String(tid.value) : '')
const inputError = ref<string | undefined>()
const loadedAt = ref<number | null>(null)

function apply() {
  const n = Number(tidInput.value)
  if (!Number.isInteger(n) || n < 1) {
    inputError.value = 'Pozitif bir müşteri numarası girin.'
    return
  }
  inputError.value = undefined
  if (tid.value === n) list.reload()
  tid.value = n
}

const list = useCursorList<TenantHistoryRow>(async (cursor) => {
  const res = await api.call('BackofficeNotificationService/getTenantHistory', { tid: tid.value!, cursor, limit: 25 })
  loadedAt.value = Date.now()
  return res
})
const rows = computed(() => list.items.value as unknown as Array<Record<string, unknown>>)
const verdict = computed(() =>
  !tid.value || list.phase.value !== 'loading'
    ? tenantHistoryVerdict({ tid: tid.value, rows: list.phase.value === 'error' || list.phase.value === 'degraded' ? null : (list.items.value as TenantHistoryRow[]), failed: list.phase.value === 'error' || list.phase.value === 'degraded', retry: () => list.reload() })
    : null,
)
const sev = (r: TenantHistoryRow) => NOTIFY_SEVERITY[r.severity] ?? { label: r.severity, tone: 'neutral' as const }
const emailPairs = (r: TenantHistoryRow) => Object.entries(r.emailStatus).filter(([, n]) => (n ?? 0) > 0) as Array<[DeliveryStatus, number]>

watch(tid, (v) => {
  router.replace({ query: v ? { tid: String(v) } : {} })
  if (v) list.reload()
})
onMounted(() => {
  if (tid.value) list.reload()
})
</script>

<style scoped>
.bo-nh__search {
  align-items: center;
}
.bo-nh__email {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}
</style>
