<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="loadedAt ?? undefined" :stale="summary.stale.value">
      <template #actions>
        <BoAction kind="add" label="Yeni duyuru" data-testid="new-announcement" to="/sistem/duyurular/yeni" />
        <BoAction kind="refresh" :loading="list.refreshing.value || list.phase.value === 'loading' || summary.refreshing.value" data-page-refresh @click="refresh" />
      </template>
    </BoPageHeader>

    <PageVerdict :verdict="verdict" />

    <EkAlert
      v-if="live.length"
      tone="info"
      dense
      :title="live.length === 1 ? 'Şu an 1 duyuru yayında' : `Şu an ${live.length} duyuru yayında`"
      :text="live.map((a) => a.title.tr).join(' · ')"
      data-testid="live-summary"
    />

    <BoSection id="bo-ann-list" title="Duyurular" description="Yeni oluşturulan önce. Bakım, olay ve yenilik duyuruları müşterilere uygulama içi ve e-posta ile iletilir." icon="mdi-bullhorn-outline">
      <BoFilterBar label="Duyuru süzgeçleri" :active="activeFilters" @clear="clearFilters">
        <BoSegmented v-model="status" label="Durum" :options="STATUS_OPTS" />
        <v-select v-model="kind" :items="KIND_OPTS" label="Tür" density="compact" hide-details clearable class="bo-toolbar__field" data-testid="kind-filter" />
      </BoFilterBar>
      <BoDataTable
        :items="rows"
        :columns="COLUMNS"
        row-key="id"
        label="Duyurular"
        :phase="list.phase.value"
        :error="list.error.value"
        :empty-title="filtered ? 'Filtreye uyan duyuru yok' : 'Henüz duyuru yok'"
        :empty-message="filtered ? 'Durum ya da tür filtresini değiştirin.' : 'Bakım, olay ya da yenilik duyurusu oluşturmak için Yeni duyuru düğmesini kullanın.'"
        @retry="list.reload()"
      >
        <template #cell-title="{ item }">
          <span class="bo-ann__title">
            <v-icon :icon="ANN_KIND[(item as Announcement).kind].icon" aria-hidden="true" />
            <RouterLink :to="`/sistem/duyurular/${item.id}`" class="bo-hit" :data-testid="`ann-${item.id}`">{{ (item as Announcement).title.tr }}</RouterLink>
          </span>
        </template>
        <template #cell-kind="{ item }">
          <span class="bo-cell-stack">
            <span>{{ ANN_KIND[(item as Announcement).kind].label }}</span>
            <EkStatusChip :tone="ANN_SEVERITY[(item as Announcement).severity].tone" :label="ANN_SEVERITY[(item as Announcement).severity].label" />
          </span>
        </template>
        <template #cell-status="{ item }">
          <EkStatusChip :tone="ANN_STATUS[(item as Announcement).status].tone" :label="ANN_STATUS[(item as Announcement).status].label" dot />
        </template>
        <template #cell-target="{ item }">
          <span class="bo-cell-stack">
            <span>{{ targetText((item as Announcement).target) }}</span>
            <span class="bo-muted">{{ channelsText((item as Announcement).channels) }}</span>
          </span>
        </template>
        <template #cell-window="{ item }">
          <span class="bo-cell-stack">
            <span>{{ formatRelative((item as Announcement).startsAt) }}</span>
            <span class="ek-num bo-muted">{{ windowText(item as Announcement) }}</span>
          </span>
        </template>
        <template v-if="list.phase.value === 'ready'" #footer>
          <BoPagination :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" source="BackofficeNotificationService/listAnnouncements" @more="list.loadMore()" />
        </template>
      </BoDataTable>
    </BoSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { Announcement, AnnouncementKind, AnnouncementStatus } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import BoAction from '@bo/components/r2/BoAction.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { useVerdictSources } from '@bo/composables/useVerdictSources'
import { announcementsVerdict } from './notificationsVerdict'
import BoPagination from '@bo/components/r2/BoPagination.vue'
import BoSection from '@bo/components/r2/BoSection.vue'
import BoFilterBar from '@bo/components/r2/BoFilterBar.vue'
import BoSegmented, { type BoSegmentOption } from '@bo/components/r2/BoSegmented.vue'
import BoDataTable from '@bo/components/r2/BoDataTable.vue'
import { ANN_KIND, ANN_SEVERITY, ANN_STATUS } from '@bo/utils/labels'
import { formatRelative } from '@bo/utils/format'
import { channelsText, targetText, windowText } from './announcementText'
import '@bo/styles/kit.css'

const router = useRouter()
const STATUS_OPTS: Array<BoSegmentOption<AnnouncementStatus | 'all'>> = [
  { value: 'all', label: 'Tümü' },
  { value: 'active', label: 'Yayında' },
  { value: 'scheduled', label: 'Zamanlandı' },
  { value: 'draft', label: 'Taslak' },
  { value: 'ended', label: 'Bitti' },
  { value: 'cancelled', label: 'İptal' },
]
const KIND_OPTS = (Object.keys(ANN_KIND) as AnnouncementKind[]).map((k) => ({ title: ANN_KIND[k].label, value: k }))
const COLUMNS: EkTableColumn[] = [
  { key: 'title', label: 'Duyuru' },
  { key: 'kind', label: 'Tür' },
  { key: 'status', label: 'Durum' },
  { key: 'target', label: 'Hedef ve kanal' },
  { key: 'window', label: 'Başlangıç' },
]

const route = useRoute()
// Hüküm bağlantıları `?durum=` ile açar; paylaşılabilir görünüm.
const qDurum = () => (typeof route.query.durum === 'string' && STATUS_OPTS.some((o) => o.value === route.query.durum) ? (route.query.durum as AnnouncementStatus) : 'all')
const status = ref<AnnouncementStatus | 'all'>(qDurum())
const kind = ref<AnnouncementKind | null>(null)
const activeFilters = computed(() => (status.value !== 'all' ? 1 : 0) + (kind.value ? 1 : 0))
function clearFilters() {
  status.value = 'all'
  kind.value = null
}
const filtered = computed(() => status.value !== 'all' || !!kind.value)
const loadedAt = ref<number | null>(null)

const list = useCursorList<Announcement>(async (cursor) => {
  const res = await api.call('BackofficeNotificationService/listAnnouncements', {
    ...(status.value !== 'all' ? { status: status.value } : {}),
    ...(kind.value ? { kind: kind.value } : {}),
    cursor,
    limit: 25,
  })
  loadedAt.value = Date.now()
  return res
})
const rows = computed(() => list.items.value as unknown as Array<Record<string, unknown>>)
const live = computed(() => list.items.value.filter((a) => a.status === 'active'))

// Hüküm: süzgeçten bağımsız, süzgeçsiz ilk sayfa (liste süzgeçliyken hüküm eksik kalmasın).
const summary = useVerdictSources({ all: () => api.call('BackofficeNotificationService/listAnnouncements', { limit: 50 }) })
const verdict = computed(() =>
  summary.settled.value
    ? announcementsVerdict({
        items: summary.sources.all.data.value?.items ?? null,
        failed: summary.failed('all'),
        stale: summary.stale.value,
        now: Date.now(),
        retry: () => void summary.load(),
      })
    : null,
)
function refresh() {
  void summary.load()
  list.reload({ keep: true })
}

watch(qDurum, (v) => {
  status.value = v
})
watch([status, kind], () => {
  router.replace({ query: status.value !== 'all' ? { durum: status.value } : {} })
  list.reload()
})
onMounted(() => {
  void summary.load()
  list.reload()
})
</script>

<style scoped>
.bo-ann__title {
  display: inline-flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  min-width: 0;
}
.bo-ann__title .v-icon {
  margin-top: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}
.bo-ann__title a {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
  text-decoration: none;
  overflow-wrap: anywhere;
}
.bo-ann__title a:hover {
  text-decoration: underline;
}
</style>
