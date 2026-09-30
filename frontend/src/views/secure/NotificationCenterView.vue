<!--
  frontend/src/views/secure/NotificationCenterView.vue

  C1.5 (F-06) — Bildirim merkezi (uygulama içi gelen kutusu, birincil kanal). DS-v2 liste standardı:
  EkPageHeader → EkListFrame [EkFilterPanel + EkActiveFilters] → kart [EkBulkBar → EkDataGrid → alt çubuk].

  C2b (ADR-0029, NOTIFICATION_PLAN F-N1 + NB4) — sözleşme v2:
    NotificationService/get { limit, cursor?, afterId?, category?, onlyUnread? } → { result, data[], nextCursor?, hasMore?, unreadCount }
      — SUNUCU sayfalaması: "Daha fazla göster" imleçle sonraki sayfayı ekler; kategori ve okunmamış filtresi sunucuda.
      — Önem filtresi sözleşmede YOK → yüklenen kayıtlar üzerinde istemcide (alt çubukta açıkça belirtilir).
    NotificationService/markAsRead { notificationIds[] } | { all:true } · NotificationService/delete { notificationIds[] }
  İstek gövdeleri `stores/notificationDrawer.ts` (`listBody`, `idsPayload`) ile ORTAK (tek kaynak).
  Kategori/önem seçenekleri ve zorunluluk `stores/notificationCatalog.ts` (getCatalog; yoksa plan v1 yedeği).
  Canlı: SSE `notification` → ilk sayfadaysak yalnız yenileri (`afterId`) başa ekler; `resync` → tam tazele.
  `actionUrl` yalnız uygulama içi yol ise "Görüntüle" (dış URL açılmaz). Hata ≠ boş.
-->
<template>
  <div class="ek-notification-center">
    <EkPageHeader
      section="Genel"
      title="Bildirimler"
      description="Sipariş, stok, entegrasyon, katalog, abonelik ve güvenlik bildirimleriniz. Bildirimler öneme göre 14–90 gün saklanır."
      :tips="['Zorunlu bildirimler (kilit simgesi) tercihlerden kapatılamaz.', 'Yeni bildirimler bu sayfa açıkken kendiliğinden listeye eklenir.']"
      :secondary-actions="headerActions"
      refreshable
      :refreshing="loading"
      :last-updated="loadedAt"
      @refresh="load()"
    />

    <EkListFrame label="Bildirimler" class="ek-notification-center__frame">
      <template #filters>
        <EkFilterPanel
          :collapsed="filtersCollapsed"
          :active-count="activeChips.length"
          :columns="3"
          :loading="loading"
          @update:collapsed="filtersCollapsed = $event"
          @submit="applyFilters"
          @reset="resetFilters"
        >
          <EkSelect v-model="draft.category" :items="categoryOptions" label="Kategori" clearable />
          <EkSelect v-model="draft.severities" :items="severityOptions" kind="status" label="Önem" multiple clearable />
          <EkSelect v-model="draft.read" :items="READ_OPTIONS" label="Okunma durumu" />
        </EkFilterPanel>
        <EkActiveFilters :filters="activeChips" @remove="removeChip" @clear="resetFilters" />
      </template>

      <template #toolbar>
        <EkBulkBar :count="selected.length" noun="bildirim" @clear="selected = []">
          <template #actions>
            <EkButton size="sm" icon="mdi-email-open-outline" :disabled="!selectedUnreadIds.length" :loading="busy === 'read-selected'" @click="markSelectedRead">
              Okundu işaretle
            </EkButton>
            <EkActionButton action="delete" show-label label="Sil" @click="confirmOpen = true" />
          </template>
          <template #start>
            <span class="ek-nc-toolbar__summary">
              <span class="ek-nc-toolbar__stat"><strong class="ek-num">{{ unreadTotal }}</strong> okunmamış</span>
              <span v-if="criticalUnread" class="ek-nc-toolbar__stat ek-nc-toolbar__stat--attention">
                <v-icon icon="mdi-alert-octagon-outline" aria-hidden="true" />
                <strong class="ek-num">{{ criticalUnread }}</strong> okunmamış kritik
              </span>
              <span class="ek-nc-live" :class="`is-${liveState.tone}`" role="status">
                <span class="ek-nc-live__dot" aria-hidden="true"></span>{{ liveState.label }}
              </span>
            </span>
          </template>
          <template #end>
            <EkButton size="sm" icon="mdi-check-all" :disabled="!unreadTotal" :loading="busy === 'read-all'" @click="markAllRead">
              Tümünü okundu işaretle
            </EkButton>
          </template>
        </EkBulkBar>
      </template>

      <div v-if="loadError" class="ek-notification-center__error">
        <EkProblemState title="Bildirimler yüklenemedi" cause="Sunucuya ulaşılamadı ya da yanıt geçersizdi."
          action="Bağlantınızı kontrol edip tekrar deneyin." :retrying="loading" @retry="load()" />
      </div>
      <EkDataGrid
        v-else
        :columns="columns"
        :rows="visibleRows"
        label="Bildirim listesi"
        row-key="_id"
        label-key="displayTitle"
        selectable
        :selected="selected"
        :loading="loading && !items.length"
        :skeleton-rows="6"
        :empty-title="isFiltered ? 'Filtreye uyan bildirim yok' : 'Henüz bildiriminiz yok'"
        :empty-text="emptyText"
        :empty-icon="isFiltered ? 'mdi-filter-remove-outline' : 'mdi-bell-check-outline'"
        @update:selected="selected = $event"
        @row-click="openDetail"
      >
        <template #cell-category="{ row }">
          <span class="ek-nc-type">
            <EkIconTile :icon="row.visual.icon" :tone="row.visual.tone" size="sm" />
            <span :class="compact ? 'ek-sr-only' : 'ek-nc-type__label'">{{ row.categoryLabel || '—' }}</span>
          </span>
        </template>
        <template #cell-title="{ row }">
          <div class="ek-nc-item" :class="{ 'is-unread': !row.isRead, 'is-critical': row.visual.critical, 'is-fresh': fresh.has(row._id) }">
            <span v-if="!row.isRead" class="ek-nc-item__dot" aria-hidden="true"></span>
            <span v-if="compact" class="ek-nc-type">
              <EkIconTile :icon="row.visual.icon" :tone="row.visual.tone" size="sm" />
              <span class="ek-sr-only">{{ row.categoryLabel }}</span>
            </span>
            <div class="ek-nc-item__text">
              <span class="ek-nc-item__head">
                <button type="button" class="ek-nc-item__title" @click.stop="openDetail(row)">{{ row.displayTitle }}</button>
                <EkStatusChip v-if="row.visual.critical" tone="danger" label="Kritik" dot />
                <EkBadge v-if="row.groupCount > 1" variant="label" tone="neutral" :text="`×${row.groupCount}`" :aria-label="`${row.groupCount} kez`" />
                <span v-if="row.mandatory" class="ek-nc-item__lock" role="img" aria-label="Zorunlu bildirim" title="Zorunlu bildirim">
                  <v-icon icon="mdi-lock-outline" aria-hidden="true" />
                </span>
              </span>
              <span v-if="row.message" class="ek-nc-item__message">{{ row.message }}</span>
              <span v-if="compact || (row.groupCount > 1 && row.lastOccurredAt)" class="ek-nc-item__meta">
                <span v-if="compact" class="ek-num">{{ formatRelative(row.createdAt, now) }}</span>
                <span v-if="row.groupCount > 1 && row.lastOccurredAt" class="ek-num">son: {{ formatRelative(row.lastOccurredAt, now) }}</span>
                <span class="ek-sr-only">, {{ row.isRead ? 'okundu' : 'okunmamış' }}</span>
              </span>
            </div>
          </div>
        </template>
        <template #cell-createdAt="{ row }">
          <span class="ek-nc-time">
            <span class="ek-nc-time__abs ek-num">{{ formatDateTime(row.createdAt) }}</span>
            <span class="ek-nc-time__rel">{{ formatRelative(row.createdAt, now) }}</span>
          </span>
        </template>
        <template #cell-status="{ row }">
          <EkStatusChip :tone="row.isRead ? 'neutral' : 'info'" :label="row.isRead ? 'Okundu' : 'Okunmamış'" />
        </template>
        <template #cell-actions="{ row }">
          <EkRowActions :label="`${row.displayTitle} işlemleri`" :items="rowActions(row)" />
        </template>
        <template #empty-action>
          <EkButton v-if="isFiltered" size="sm" icon="mdi-filter-remove-outline" @click="resetFilters">Filtreleri temizle</EkButton>
        </template>
      </EkDataGrid>

      <template #pager>
        <div class="ek-nc-pager" role="group" aria-label="Bildirim sayfalama">
          <span class="ek-nc-pager__count">
            <strong class="ek-num">{{ visibleRows.length }}</strong> bildirim gösteriliyor
            <span v-if="applied.severities.length" class="ek-nc-pager__note">· önem filtresi yüklenen kayıtlara uygulanır</span>
          </span>
          <EkButton v-if="hasMore" size="sm" tone="secondary" icon="mdi-chevron-down" :loading="loadingMore" @click="loadMore">
            Daha fazla göster
          </EkButton>
          <span v-else-if="items.length" class="ek-nc-pager__end">Hepsi bu kadar</span>
        </div>
      </template>
    </EkListFrame>

    <EkDialog
      v-model="detailOpen"
      :title="detail?.displayTitle ?? 'Bildirim'"
      :description="detail ? `${detail.categoryLabel || 'Bildirim'} · ${formatDateTime(detail.createdAt)} (${formatRelative(detail.createdAt, now)})` : undefined"
      :icon="detail?.visual.icon"
      width="md"
    >
      <div v-if="detail" class="ek-nc-detail">
        <div class="ek-nc-detail__chips">
          <EkStatusChip :tone="notificationSeverityTone(detail.severity)" :label="severityLabel(detail.severity)" dot />
          <EkStatusChip v-if="detail.mandatory" tone="neutral" icon="mdi-lock-outline" label="Zorunlu" />
          <EkStatusChip :tone="detail.isRead ? 'neutral' : 'info'" :label="detail.isRead ? 'Okundu' : 'Okunmamış'" />
          <EkStatusChip v-if="detail.groupCount > 1" tone="neutral" :label="`${detail.groupCount} kez`" />
          <span v-if="detailChannel" class="ek-nc-detail__channel">
            <span class="ek-nc-detail__channel-label">Kanal</span>
            <EkPlatformMark variant="dot" :code="detailChannel.code" :name="detailChannel.name" />
          </span>
        </div>
        <p class="ek-nc-detail__message">{{ detail.message }}</p>
        <section v-if="detailSummary.length" class="ek-nc-detail__summary" aria-label="İşlem özeti">
          <h3 class="ek-nc-detail__summary-title">İşlem özeti</h3>
          <EkDescriptionList :items="detailSummary" />
        </section>
      </div>
      <template #actions-start>
        <EkButton v-if="detail" tone="ghost" icon="mdi-trash-can-outline" class="ek-nc-danger-text" @click="deleteRow(detail)">Sil</EkButton>
      </template>
      <template #actions>
        <EkButton tone="secondary" @click="detailOpen = false">Kapat</EkButton>
        <EkButton v-if="detail && internalActionPath(detail.actionUrl)" tone="primary" icon="mdi-arrow-top-right" @click="goTo(detail)">Görüntüle</EkButton>
      </template>
    </EkDialog>

    <EkDialog
      v-model="confirmOpen"
      tone="danger"
      width="sm"
      icon="mdi-trash-can-outline"
      :title="`${selected.length} bildirim silinsin mi?`"
      description="Seçili bildirimler listenizden kaldırılır; bu işlem geri alınamaz."
      confirm-label="Sil"
      :confirm-loading="busy === 'delete-selected'"
      @confirm="deleteSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { formatDateTime, formatNumber, formatRelative } from '@/composables/format'
import { useShellBreakpoints } from '@/composables/useShellBreakpoints'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { NOTIFICATION_PAGE_SIZE, mergeNewest, useNotificationDrawerStore, type NotificationListQuery } from '@/stores/notificationDrawer'
import { labelsFor, notificationTitle, useNotificationCatalogStore } from '@/stores/notificationCatalog'
import {
  NOTIFICATION_SEVERITIES,
  internalActionPath,
  normalizeSeverity,
  notificationSeverityTone,
  notificationVisual,
  type NotificationCategory,
  type NotificationItem,
  type NotificationSeverity,
} from '@/types/NotificationTypes'
import EkPageHeader, { type EkPageHeaderAction } from '@/components/ds/EkPageHeader.vue'
import EkListFrame from '@/components/ds/EkListFrame.vue'
import EkFilterPanel from '@/components/ds/EkFilterPanel.vue'
import EkActiveFilters, { type EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue'
import EkDataGrid, { type EkGridColumn } from '@/components/ds/EkDataGrid.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkBadge from '@/components/ds/EkBadge.vue'
import EkIconTile from '@/components/ds/EkIconTile.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkProblemState from '@/components/ds/EkProblemState.vue'
import EkDialog from '@/components/ds/EkDialog.vue'
import EkSelect from '@/components/ds/EkSelect.vue'
import EkBulkBar from '@/components/ds/EkBulkBar.vue'
import EkActionButton from '@/components/ds/EkActionButton.vue'
import EkRowActions, { type EkRowAction } from '@/components/ds/EkRowActions.vue'
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue'
import EkDescriptionList, { type EkDescriptionListItem } from '@/components/ds/EkDescriptionList.vue'

/** Satır = sunucu kaydı + türetilmiş sunum alanları (katalogdan). */
interface NotificationRow extends NotificationItem {
  displayTitle: string
  categoryLabel: string
  category?: NotificationCategory
  mandatory: boolean
  groupCount: number
  visual: ReturnType<typeof notificationVisual>
}
type GridRow = Record<string, any>

type ReadFilter = 'all' | 'unread' | 'read'
interface FilterState {
  category: NotificationCategory | null
  severities: NotificationSeverity[]
  read: ReadFilter
}

const { locale } = useI18n({ useScope: 'global' })
const router = useRouter()
const snackbar = useSnackbarStore()
const notificationStore = useNotificationDrawerStore()
const catalog = useNotificationCatalogStore()
const { isDesktop, isMobile } = useShellBreakpoints()
const eventBus: any = inject('eventBus', undefined)
const menuStore: any = inject('useMenuStore', undefined)

const labels = computed(() => labelsFor(locale.value))

const READ_OPTIONS: Array<{ title: string; value: ReadFilter }> = [
  { title: 'Tümü', value: 'all' },
  { title: 'Okunmamış', value: 'unread' },
  { title: 'Okundu', value: 'read' },
]
const SEVERITY_TONE: Record<NotificationSeverity, string> = { critical: 'danger', error: 'danger', warning: 'warning', info: 'info', success: 'success' }
const categoryOptions = computed(() => catalog.categories.filter((c) => c.codes.length).map((c) => ({ value: c.key, title: labels.value.categories[c.key] })))
const severityOptions = computed(() => NOTIFICATION_SEVERITIES.map((s) => ({ value: s, title: labels.value.severities[s], tone: SEVERITY_TONE[s] })))
const severityLabel = (severity: unknown) => labels.value.severities[normalizeSeverity(severity)]

const FULL_COLUMNS: EkGridColumn[] = [
  { key: 'category', label: 'Kategori', width: '184px' },
  { key: 'title', label: 'Bildirim' },
  { key: 'createdAt', label: 'Zaman', width: '164px' },
  { key: 'status', label: 'Durum', width: '120px' },
  { key: 'actions', label: 'İşlemler', align: 'end', width: '128px', hideLabel: true, pin: 'end' },
]
const COMPACT_COLUMNS: EkGridColumn[] = [
  { key: 'title', label: 'Bildirim' },
  { key: 'actions', label: 'İşlemler', align: 'end', width: '84px', hideLabel: true, pin: 'end' },
]
const compact = computed(() => isMobile.value)
const columns = computed(() => (compact.value ? COMPACT_COLUMNS : FULL_COLUMNS))

// Tercihler ekranı menüde kayıtlıysa başlıkta ikincil eylem.
const prefsLink = computed(() => menuStore?.getMenuLinkWithCode?.('NotificationPreferencesView'))
const headerActions = computed<EkPageHeaderAction[]>(() =>
  prefsLink.value ? [{ label: 'Tercihler', icon: 'mdi-tune-variant', onClick: () => eventBus?.emit('openTab', prefsLink.value) }] : [],
)

// --- durum ---
const items = ref<NotificationItem[]>([])
const nextCursor = ref<string | undefined>()
const hasMore = ref(false)
const loading = ref(false)
const loadingMore = ref(false)
const loadError = ref(false)
const loadedAt = ref<Date | null>(null)
const now = ref(new Date())
const selected = ref<Array<string | number>>([])
const busy = ref<'' | 'read-all' | 'read-selected' | 'delete-selected'>('')
const confirmOpen = ref(false)
const detailOpen = ref(false)
const detail = ref<NotificationRow | null>(null)
const filtersCollapsed = ref(!isDesktop.value)
/** SSE ile yeni eklenen satırlar kısa süre vurgulanır (hareket azaltmada yalnız renk). */
const fresh = ref(new Set<string>())

const emptyFilters = (): FilterState => ({ category: null, severities: [], read: 'all' })
const draft = reactive<FilterState>(emptyFilters())
const applied = ref<FilterState>(emptyFilters())

// --- türetilmiş ---
const isFiltered = computed(() => !!applied.value.category || applied.value.severities.length > 0 || applied.value.read !== 'all')
const unreadTotal = computed(() => notificationStore.unreadCount)

function toRow(item: NotificationItem): NotificationRow {
  const visual = notificationVisual(item, catalog.codeCategory)
  return {
    ...item,
    visual,
    category: visual.category,
    categoryLabel: visual.category ? labels.value.categories[visual.category] : '',
    displayTitle: notificationTitle(item, labels.value, visual.category),
    mandatory: item.mandatory === true || catalog.isMandatory(item.code),
    groupCount: typeof item.count === 'number' && item.count > 1 ? Math.floor(item.count) : 1,
  }
}

const rows = computed(() => items.value.map(toRow))
const visibleRows = computed(() => {
  const { severities, read } = applied.value
  return rows.value
    .filter((n) => (severities.length ? severities.includes(normalizeSeverity(n.severity)) : true))
    .filter((n) => (read === 'read' ? n.isRead : true))
})
const criticalUnread = computed(() => rows.value.filter((n) => !n.isRead && n.visual.critical).length)
const selectedRows = computed(() => rows.value.filter((n) => selected.value.includes(n._id)))
const selectedUnreadIds = computed(() => selectedRows.value.filter((n) => !n.isRead).map((n) => n._id))
const emptyText = computed(() =>
  isFiltered.value
    ? 'Filtreleri değiştirin ya da temizleyin.'
    : 'Sipariş, stok, entegrasyon ve abonelik bildirimleri burada görünür. Yeni bir bildirim geldiğinde bu liste kendiliğinden güncellenir.',
)

const liveState = computed(() => {
  switch (notificationStore.streamMode) {
    case 'live':
      return { tone: 'live', label: 'Canlı' }
    case 'connecting':
    case 'reconnecting':
      return { tone: 'wait', label: 'Bağlanıyor' }
    default:
      return { tone: 'poll', label: 'Otomatik yenileme' }
  }
})

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const chips: EkActiveFilterChip[] = []
  const a = applied.value
  if (a.category) chips.push({ key: 'category', label: 'Kategori', value: labels.value.categories[a.category] })
  if (a.severities.length) chips.push({ key: 'severities', label: 'Önem', value: a.severities.map((s) => labels.value.severities[s]).join(', ') })
  if (a.read !== 'all') chips.push({ key: 'read', label: 'Okunma', value: READ_OPTIONS.find((o) => o.value === a.read)?.title ?? a.read })
  return chips
})

const SUMMARY_FIELDS: Array<[string, string]> = [
  ['totalAccepted', 'İşleme alınan'],
  ['totalAlreadyTransfer', 'Zaten eşleşmiş'],
  ['totalNoTransferSkipped', 'Gönderim gereken ürün'],
  ['totalCount', 'Toplam çekilen ürün'],
  ['validCount', 'Aday aktarım'],
  ['processedCount', 'Aktarılan ürün'],
  ['invalidCount', 'Eksik ürün'],
  ['duplicateCount', 'Mükerrer ürün'],
  ['failedCount', 'İşlem hatası'],
]
const detailSummary = computed<EkDescriptionListItem[]>(() => {
  const meta = detail.value?.metaData
  if (!meta || typeof meta !== 'object') return []
  return SUMMARY_FIELDS.filter(([key]) => typeof meta[key] === 'number').map(([key, label]) => ({ label, value: formatNumber(meta[key]) }))
})

const CHANNEL_NAMES: Record<string, string> = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
  n11: 'N11',
  pazarama: 'Pazarama',
  ideasoft: 'Ideasoft',
  bizimhesap: 'Bizimhesap',
}
const detailChannel = computed(() => {
  const code = detail.value?.metaData?.integrationCode ?? detail.value?.params?.integ
  if (typeof code !== 'string' || !code) return null
  return { code, name: CHANNEL_NAMES[code.toLowerCase()] ?? code }
})

function rowActions(row: GridRow): EkRowAction[] {
  return [
    ...(!compact.value && internalActionPath(row.actionUrl)
      ? [{ key: 'go', action: 'openExternal' as const, icon: 'mdi-arrow-top-right', label: `Görüntüle: ${row.displayTitle}`, onClick: () => goTo(row) }]
      : []),
    ...(!row.isRead ? [{ key: 'read', action: 'approve' as const, icon: 'mdi-email-open-outline', label: `Okundu işaretle: ${row.displayTitle}`, onClick: () => markRowRead(row) }] : []),
    { key: 'delete', action: 'delete', label: `Sil: ${row.displayTitle}`, onClick: () => deleteRow(row) },
  ]
}

// --- veri (sunucu sayfalaması) ---
function baseQuery(): NotificationListQuery {
  const a = applied.value
  return {
    limit: NOTIFICATION_PAGE_SIZE,
    ...(a.category ? { category: a.category } : {}),
    onlyUnread: a.read === 'unread',
  }
}

/** Yükleme sürerken gelen SSE sinyali düşürülmez: yükleme bitince yenileri ayrıca çeker (istek olaydan önce gitmiş olabilir). */
let pendingNew = false

async function load() {
  loading.value = true
  loadError.value = false
  pendingNew = false
  catalog.ensureLoaded()
  const page = await notificationStore.fetchPage(baseQuery())
  if (page) {
    items.value = page.items
    nextCursor.value = page.nextCursor
    hasMore.value = page.hasMore
    loadedAt.value = new Date()
    now.value = new Date()
    const ids = new Set(items.value.map((n) => n._id))
    selected.value = selected.value.filter((id) => ids.has(String(id)))
  } else {
    loadError.value = true
  }
  loading.value = false
  if (pendingNew && !loadError.value) {
    pendingNew = false
    fetchNew()
  }
}

async function loadMore() {
  if (!hasMore.value || !nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  const page = await notificationStore.fetchPage({ ...baseQuery(), cursor: nextCursor.value })
  loadingMore.value = false
  if (!page) {
    report(false, '', 'Sonraki bildirimler yüklenemedi — tekrar deneyin.')
    return
  }
  const known = new Set(items.value.map((n) => n._id))
  items.value = [...items.value, ...page.items.filter((n) => !known.has(n._id))]
  nextCursor.value = page.nextCursor
  hasMore.value = page.hasMore
}

/** SSE yeni bildirim: yalnız yenileri (`afterId` = listedeki en yeni) başa ekler; liste boşsa tam yükler. */
async function fetchNew() {
  if (loading.value) {
    pendingNew = true
    return
  }
  const newest = items.value[0]?._id
  if (!newest) return load()
  const page = await notificationStore.fetchPage({ ...baseQuery(), afterId: newest })
  if (!page) return
  const known = new Set(items.value.map((n) => n._id))
  const added = page.items.filter((n) => !known.has(n._id)).map((n) => n._id)
  items.value = mergeNewest(items.value, page.items)
  now.value = new Date()
  if (added.length) {
    fresh.value = new Set([...fresh.value, ...added])
    setTimeout(() => {
      const next = new Set(fresh.value)
      added.forEach((id) => next.delete(id))
      fresh.value = next
    }, 4000)
  }
}

function applyFilters() {
  applied.value = { category: draft.category, severities: [...draft.severities], read: draft.read }
  selected.value = []
  load()
}

function resetFilters() {
  Object.assign(draft, emptyFilters())
  applyFilters()
}

function removeChip(key: string) {
  if (key === 'category') draft.category = null
  if (key === 'severities') draft.severities = []
  if (key === 'read') draft.read = 'all'
  applyFilters()
}

// --- eylemler (istek gövdeleri store ile ortak) ---
function report(ok: boolean, success: string, failure: string) {
  snackbar.addSnackbar({ text: ok ? success : failure, color: ok ? 'success' : 'error' })
}

async function markAllRead() {
  busy.value = 'read-all'
  const ok = await notificationStore.markAsRead()
  busy.value = ''
  report(ok, 'Tüm bildirimler okundu olarak işaretlendi.', 'Bildirimler işaretlenemedi — tekrar deneyin.')
  if (ok) await load()
}

async function markSelectedRead() {
  const ids = selectedUnreadIds.value
  if (!ids.length) return
  busy.value = 'read-selected'
  const ok = await notificationStore.markAsRead(ids)
  busy.value = ''
  report(ok, `${ids.length} bildirim okundu olarak işaretlendi.`, 'Bildirimler işaretlenemedi — tekrar deneyin.')
  if (ok) {
    selected.value = []
    items.value = items.value.map((n) => (ids.includes(n._id) ? { ...n, isRead: true } : n))
  }
}

async function markRowRead(row: GridRow) {
  const ok = await notificationStore.markAsRead(row._id)
  if (ok) {
    items.value = items.value.map((n) => (n._id === row._id ? { ...n, isRead: true } : n))
    if (detail.value && detail.value._id === row._id) detail.value = { ...detail.value, isRead: true }
  } else report(false, '', 'Bildirim işaretlenemedi — tekrar deneyin.')
}

async function deleteSelected() {
  const ids = selected.value.map(String)
  if (!ids.length) return
  busy.value = 'delete-selected'
  const ok = await notificationStore.deleteNotification(ids)
  busy.value = ''
  confirmOpen.value = false
  report(ok, `${ids.length} bildirim silindi.`, 'Bildirimler silinemedi — tekrar deneyin.')
  if (ok) {
    selected.value = []
    items.value = items.value.filter((n) => !ids.includes(n._id))
  }
}

async function deleteRow(row: GridRow) {
  const ok = await notificationStore.deleteNotification(row._id)
  report(ok, 'Bildirim silindi.', 'Bildirim silinemedi — tekrar deneyin.')
  if (ok) {
    if (detail.value?._id === row._id) detailOpen.value = false
    items.value = items.value.filter((n) => n._id !== row._id)
  }
}

function openDetail(row: GridRow) {
  detail.value = row as NotificationRow
  detailOpen.value = true
  // Gelen kutusu davranışı: açılan bildirim okundu sayılır.
  if (!row.isRead) markRowRead(row)
}

function goTo(row: GridRow) {
  const path = internalActionPath(row.actionUrl)
  if (!path) return
  detailOpen.value = false
  if (!row.isRead) markRowRead(row)
  router.push(path).catch(() => {})
}

// "x dk önce" metinleri canlı kalsın (istek atmaz) + SSE canlı sinyali (onUnmounted'da bırakılır).
let clock: ReturnType<typeof setInterval> | undefined
let unsubscribe: (() => void) | undefined
onMounted(() => {
  clock = setInterval(() => (now.value = new Date()), 60_000)
  unsubscribe = notificationStore.onLive((signal) => (signal === 'resync' ? load() : fetchNew()))
})
onBeforeUnmount(() => {
  clearInterval(clock)
  unsubscribe?.()
})

defineExpose({
  initialize: () => load(),
  activate: () => load(),
})
</script>

<style scoped>
.ek-notification-center {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  height: 100%;
  min-height: 0;
  padding: var(--ek-space-6);
}

.ek-notification-center__frame {
  flex: 1;
  min-height: 0;
}

.ek-notification-center__error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: var(--ek-space-8) var(--ek-space-4);
}

.ek-nc-danger-text {
  color: var(--ek-color-error);
}

.ek-nc-toolbar__summary {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-4);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

.ek-nc-toolbar__stat strong {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-nc-toolbar__stat--attention {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-error-emphasis);
}

.ek-nc-toolbar__stat--attention strong {
  color: inherit;
}

.ek-nc-toolbar__stat--attention :deep(.v-icon) {
  font-size: var(--ek-icon-sm);
}

.ek-nc-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ek-type-caption-size);
}

.ek-nc-live__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ek-color-content-subtle);
}

.ek-nc-live.is-live .ek-nc-live__dot {
  background: var(--ek-color-success);
  box-shadow: 0 0 0 3px var(--ek-color-success-subtle);
}

.ek-nc-live.is-wait .ek-nc-live__dot {
  background: var(--ek-color-warning);
}

.ek-nc-type {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: var(--ek-space-2);
  white-space: nowrap;
}

.ek-nc-type__label {
  color: var(--ek-color-content-default);
}

.ek-nc-item {
  position: relative;
  display: flex;
  gap: var(--ek-space-2);
  min-width: 260px;
  padding: var(--ek-space-2) 0;
  border-radius: var(--ek-radius-tile);
  transition: var(--ek-transition-colors);
}

.ek-nc-item.is-fresh {
  background: var(--ek-color-action-subtle);
  box-shadow: 0 0 0 var(--ek-space-1) var(--ek-color-action-subtle);
}

.ek-nc-item__dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--ek-color-action);
}

.ek-nc-item.is-critical .ek-nc-item__dot {
  background: var(--ek-color-error);
}

.ek-nc-item:not(.is-unread) {
  padding-left: calc(8px + var(--ek-space-2));
}

.ek-nc-item__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
}

.ek-nc-item__head {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-nc-item__title {
  padding: 0;
  border: 0;
  background: none;
  color: var(--ek-color-content-default);
  font: inherit;
  font-weight: var(--ek-font-weight-medium);
  text-align: left;
  cursor: pointer;
}

.ek-nc-item.is-unread .ek-nc-item__title {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-nc-item__title:hover {
  color: var(--ek-color-action-emphasis);
  text-decoration: underline;
}

.ek-nc-item__title:focus-visible {
  outline: none;
  border-radius: 2px;
  box-shadow: var(--ek-focus-ring);
}

.ek-nc-item__lock {
  display: inline-flex;
  color: var(--ek-color-content-muted);
}

.ek-nc-item__lock :deep(.v-icon) {
  font-size: var(--ek-icon-xs);
}

.ek-nc-item__message {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-nc-item__meta {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-nc-time {
  display: flex;
  flex-direction: column;
  white-space: nowrap;
}

.ek-nc-time__rel {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-nc-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2) var(--ek-space-4);
  min-height: 52px;
  padding: var(--ek-space-2) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

.ek-nc-pager__count strong {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-nc-pager__note,
.ek-nc-pager__end {
  font-size: var(--ek-type-caption-size);
}

.ek-nc-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-nc-detail__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.ek-nc-detail__channel {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin-left: var(--ek-space-2);
  font-size: var(--ek-type-label-size);
}

.ek-nc-detail__channel-label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-nc-detail__message {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  white-space: pre-line;
}

.ek-nc-detail__summary {
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.ek-nc-detail__summary-title {
  margin: 0 0 var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

@media (prefers-reduced-motion: reduce) {
  .ek-nc-item {
    transition: none;
  }
}

@media (max-width: 767px) {
  .ek-notification-center {
    height: auto;
    padding: var(--ek-space-4);
  }

  .ek-nc-item {
    min-width: 0;
  }
}
</style>
