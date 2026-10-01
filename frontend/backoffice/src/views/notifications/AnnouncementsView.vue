<template>
  <div class="bo-page">
    <BoPageHeader :updated-at="loadedAt ?? undefined" :stale="summary.stale.value">
      <template #actions>
        <EkButton tone="primary" icon="mdi-plus" data-testid="new-announcement" @click="router.push('/sistem/duyurular/yeni')">Yeni duyuru</EkButton>
        <EkButton tone="secondary" icon="mdi-refresh" :loading="list.refreshing.value || list.phase.value === 'loading' || summary.refreshing.value" data-page-refresh @click="refresh">Yenile</EkButton>
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

    <div class="bo-toolbar">
      <div class="bo-seg" role="radiogroup" aria-label="Durum">
        <button v-for="o in STATUS_OPTS" :key="o.value" type="button" role="radio" class="bo-seg__opt" :aria-checked="status === o.value" :data-status="o.value" @click="status = o.value">{{ o.label }}</button>
      </div>
      <v-select v-model="kind" :items="KIND_OPTS" label="Tür" density="compact" hide-details clearable class="bo-toolbar__field" data-testid="kind-filter" />
    </div>

    <EkCard flush>
      <StateBlock
        :phase="list.phase.value"
        :error="list.error.value"
        :retrying="list.phase.value === 'loading'"
        :empty-title="filtered ? 'Filtreye uyan duyuru yok' : 'Henüz duyuru yok'"
        :empty-message="filtered ? 'Durum ya da tür filtresini değiştirin.' : 'Bakım, olay ya da yenilik duyurusu oluşturmak için Yeni duyuru düğmesini kullanın.'"
        :empty-variant="filtered ? 'no-results' : 'no-data'"
        @retry="list.reload()"
      >
        <EkDataTable :items="rows" :columns="COLUMNS" row-key="id">
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
        </EkDataTable>
        <LoadMore :count="list.items.value.length" :has-more="list.hasMore.value" :loading="list.loadingMore.value" :error="list.moreError.value" @more="list.loadMore()" />
      </StateBlock>
    </EkCard>
    <p class="bo-table-foot">Yeni oluşturulan önce · kaynak: BackofficeNotificationService/listAnnouncements</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { EkAlert, EkButton, EkCard, EkDataTable, EkStatusChip, type EkTableColumn } from '@entegrasyonik/ui/components'
import { api } from '@bo/api'
import type { Announcement, AnnouncementKind, AnnouncementStatus } from '@bo/api/contract'
import { useCursorList } from '@bo/composables/useCursorList'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import PageVerdict from '@bo/components/verdict/PageVerdict.vue'
import { useVerdictSources } from '@bo/composables/useVerdictSources'
import { announcementsVerdict } from './notificationsVerdict'
import StateBlock from '@bo/components/kit/StateBlock.vue'
import LoadMore from '@bo/components/kit/LoadMore.vue'
import { ANN_KIND, ANN_SEVERITY, ANN_STATUS } from '@bo/utils/labels'
import { formatRelative } from '@bo/utils/format'
import { channelsText, targetText, windowText } from './announcementText'
import '@bo/styles/kit.css'

const router = useRouter()
const STATUS_OPTS: Array<{ value: AnnouncementStatus | 'all'; label: string }> = [
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
