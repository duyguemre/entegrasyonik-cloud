<!--
  frontend/src/views/secure/NotificationCenterView.vue

  C1.5 (F-06) — Bildirim merkezi (uygulama içi gelen kutusu, birincil kanal).
  DS-v2 liste standardı: EkPageHeader → EkListFrame [EkFilterPanel (sayfa içi) + EkActiveFilters
  (son SORGULANAN değerler)] → kart [araç/seçim çubuğu → EkDataGrid (yalnız satırlar kayar) →
  EkPagerBar (alta sabit)].

  Sözleşme (backend/src/api/services/notification-service.ts, SALT OKU):
    NotificationService/get { onlyUnread?, limit? (≤200) } → { result, data[], unreadCount }
      — sunucu sayfalaması YOK: en yeni 200 kayıt alınır, tür filtresi + sayfalama istemcidedir.
    NotificationService/markAsRead { notificationIds[] } | { all:true }
    NotificationService/delete     { notificationIds[] }   (bu ekranda "tümünü sil" SUNULMAZ)
  İstek gövdeleri `stores/notificationDrawer.ts` ile ORTAK (tek kaynak).

  Kurallar: STOCK_ALERT ve SYSTEM ("dikkat") her zaman üstte sabit; tercih/susturma YOK (B-07).
  `actionUrl` yalnız uygulama içi yol ise "Görüntüle" gösterilir (dış URL açılmaz).
  Hata ≠ boş: istek başarısızsa ham hata değil, "yüklenemedi — tekrar deneyin" durumu.
-->
<template>
  <div class="ek-notification-center">
    <EkPageHeader
      section="Genel"
      title="Bildirimler"
      description="Toplu işlem, aktarım, sipariş ve stok bildirimleriniz. Bildirimler oluşturulduktan 3 gün sonra otomatik silinir."
    />

    <EkListFrame label="Bildirimler" class="ek-notification-center__frame">
      <template #filters>
        <EkFilterPanel
          :collapsed="filtersCollapsed"
          :active-count="activeChips.length"
          :columns="4"
          :loading="loading"
          @update:collapsed="filtersCollapsed = $event"
          @submit="applyFilters"
          @reset="resetFilters"
        >
          <v-select
            v-model="draft.types"
            :items="typeOptions"
            item-title="title"
            item-value="value"
            label="Tür"
            multiple
            chips
            closable-chips
            clearable
          />
          <v-select v-model="draft.read" :items="READ_OPTIONS" item-title="title" item-value="value" label="Okunma durumu" />
        </EkFilterPanel>
        <EkActiveFilters :filters="activeChips" @remove="removeChip" @clear="resetFilters" />
      </template>

      <template #toolbar>
        <div class="ek-nc-toolbar" :class="{ 'is-on': selected.length > 0 }" role="region" :aria-label="selected.length ? 'Toplu işlemler' : 'Liste araç çubuğu'">
          <template v-if="selected.length">
            <span class="ek-nc-toolbar__count" aria-live="polite"><strong class="ek-num">{{ selected.length }}</strong> bildirim seçildi</span>
            <div class="ek-nc-toolbar__actions">
              <EkButton size="sm" icon="mdi-email-open-outline" :disabled="!selectedUnreadIds.length" :loading="busy === 'read-selected'" @click="markSelectedRead">
                Okundu işaretle
              </EkButton>
              <EkButton size="sm" icon="mdi-delete-outline" class="ek-nc-danger-text" @click="confirmOpen = true">Sil</EkButton>
            </div>
            <EkButton tone="ghost" size="sm" icon="mdi-close" @click="selected = []">Seçimi kaldır</EkButton>
          </template>
          <template v-else>
            <span class="ek-nc-toolbar__summary">
              <span class="ek-nc-toolbar__stat"><strong class="ek-num">{{ unreadTotal }}</strong> okunmamış</span>
              <span v-if="attentionUnread" class="ek-nc-toolbar__stat ek-nc-toolbar__stat--attention">
                <v-icon icon="mdi-alert-outline" aria-hidden="true" />
                <strong class="ek-num">{{ attentionUnread }}</strong> okunmamış stok/sistem uyarısı
              </span>
            </span>
            <div class="ek-nc-toolbar__end">
              <span v-if="loadedAt" class="ek-nc-toolbar__stamp">Güncellendi {{ formatRelative(loadedAt, now) }}</span>
              <EkButton tone="ghost" size="sm" icon="mdi-refresh" icon-only aria-label="Listeyi yenile" :loading="loading" @click="load()" />
              <EkButton size="sm" icon="mdi-check-all" :disabled="!unreadTotal" :loading="busy === 'read-all'" @click="markAllRead">
                Tümünü okundu işaretle
              </EkButton>
            </div>
          </template>
        </div>
      </template>

      <div v-if="loadError" class="ek-notification-center__error">
        <EkErrorState message="Bildirimler yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="load()" />
      </div>
      <EkDataGrid
        v-else
        :columns="columns"
        :rows="pageRows"
        label="Bildirim listesi"
        row-key="_id"
        label-key="title"
        selectable
        :selected="selected"
        :sort="sort"
        :loading="loading && !items.length"
        :skeleton-rows="6"
        :empty-title="isFiltered ? 'Filtreye uyan bildirim yok' : 'Henüz bildiriminiz yok'"
        :empty-text="isFiltered ? 'Filtreleri değiştirin ya da temizleyin.' : 'Toplu işlem, içe/dışa aktarma, sipariş ve stok bildirimleri burada görünür.'"
        :empty-icon="isFiltered ? 'mdi-filter-remove-outline' : 'mdi-bell-outline'"
        @update:selected="selected = $event"
        @update:sort="sort = $event"
        @row-click="openDetail"
      >
        <template #cell-type="{ row }">
          <span class="ek-nc-type">
            <EkIconTile :icon="notificationTypeIcon(row.type)" :tone="tileTone(row)" size="sm" />
            <span :class="compact ? 'ek-sr-only' : 'ek-nc-type__label'">{{ typeLabel(row.type) }}</span>
          </span>
        </template>
        <template #cell-title="{ row }">
          <div class="ek-nc-item" :class="{ 'is-unread': !row.isRead }">
            <span v-if="!row.isRead" class="ek-nc-item__dot" aria-hidden="true"></span>
            <div class="ek-nc-item__text">
              <span class="ek-nc-item__head">
                <button type="button" class="ek-nc-item__title" @click.stop="openDetail(row)">{{ row.title }}</button>
                <EkStatusChip v-if="isAttentionType(row.type)" tone="warning" label="Dikkat" dot />
              </span>
              <span class="ek-nc-item__message">{{ row.message }}</span>
              <span v-if="compact" class="ek-nc-item__meta">
                <span class="ek-num">{{ formatRelative(row.createdAt, now) }}</span>
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
          <span class="ek-nc-actions" @click.stop>
            <EkButton v-if="!compact && internalActionPath(row.actionUrl)" tone="ghost" size="sm" icon="mdi-arrow-top-right" icon-only :aria-label="`Görüntüle: ${row.title}`" @click="goTo(row)" />
            <EkButton v-if="!row.isRead" tone="ghost" size="sm" icon="mdi-email-open-outline" icon-only :aria-label="`Okundu işaretle: ${row.title}`" @click="markRowRead(row)" />
            <EkButton tone="ghost" size="sm" icon="mdi-delete-outline" icon-only :aria-label="`Sil: ${row.title}`" @click="deleteRow(row)" />
          </span>
        </template>
        <template #empty-action>
          <EkButton v-if="isFiltered" size="sm" icon="mdi-filter-remove-outline" @click="resetFilters">Filtreleri temizle</EkButton>
        </template>
      </EkDataGrid>

      <template #pager>
        <EkPagerBar
          :page="page"
          :page-size="pageSize"
          :total="visibleRows.length"
          :page-size-options="[25, 50, 100]"
          label="Bildirim sayfaları"
          @update:page="page = $event"
          @update:page-size="onPageSize"
        >
          <template #trailing>
            <span v-if="truncated" class="ek-nc-pager-note">Son {{ NOTIFICATION_LIST_LIMIT }} bildirim gösteriliyor</span>
          </template>
        </EkPagerBar>
      </template>
    </EkListFrame>

    <EkDialog
      v-model="detailOpen"
      :title="detail?.title ?? 'Bildirim'"
      :description="detail ? `${typeLabel(detail.type)} · ${formatDateTime(detail.createdAt)} (${formatRelative(detail.createdAt, now)})` : undefined"
      :icon="detail ? notificationTypeIcon(detail.type) : undefined"
      width="md"
    >
      <div v-if="detail" class="ek-nc-detail">
        <div class="ek-nc-detail__chips">
          <EkStatusChip :tone="notificationSeverityTone(detail.severity)" :label="severityLabel(detail.severity)" dot />
          <EkStatusChip v-if="isAttentionType(detail.type)" tone="warning" label="Dikkat" dot />
          <EkStatusChip :tone="detail.isRead ? 'neutral' : 'info'" :label="detail.isRead ? 'Okundu' : 'Okunmamış'" />
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
        <EkButton v-if="detail" tone="ghost" icon="mdi-delete-outline" class="ek-nc-danger-text" @click="deleteRow(detail)">Sil</EkButton>
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
      icon="mdi-delete-outline"
      :title="`${selected.length} bildirim silinsin mi?`"
      description="Seçili bildirimler listenizden kaldırılır; bu işlem geri alınamaz."
      confirm-label="Sil"
      :confirm-loading="busy === 'delete-selected'"
      @confirm="deleteSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { formatDateTime, formatNumber, formatRelative } from '@/composables/format'
import { useShellBreakpoints } from '@/composables/useShellBreakpoints'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { NOTIFICATION_LIST_LIMIT, useNotificationDrawerStore } from '@/stores/notificationDrawer'
import {
  NOTIFICATION_TYPES,
  internalActionPath,
  isNotificationType,
  isAttentionType,
  notificationSeverityTone,
  notificationTypeIcon,
  type NotificationType,
} from '@/types/NotificationTypes'
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import EkListFrame from '@/components/ds/EkListFrame.vue'
import EkFilterPanel from '@/components/ds/EkFilterPanel.vue'
import EkActiveFilters, { type EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue'
import EkDataGrid, { type EkGridColumn, type EkGridSort } from '@/components/ds/EkDataGrid.vue'
import EkPagerBar from '@/components/ds/EkPagerBar.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkIconTile, { type EkTone } from '@/components/ds/EkIconTile.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkDialog from '@/components/ds/EkDialog.vue'
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue'
import EkDescriptionList, { type EkDescriptionListItem } from '@/components/ds/EkDescriptionList.vue'

interface NotificationRow {
  _id: string
  type?: string
  severity?: string
  title: string
  message?: string
  actionUrl?: string | null
  metaData?: Record<string, any>
  isRead: boolean
  createdAt?: string
}

/** EkDataGrid satır tipi (genel kayıt); alanlar `NotificationRow` ile aynıdır. */
type GridRow = Record<string, any>

type ReadFilter = 'all' | 'unread' | 'read'
interface FilterState {
  types: NotificationType[]
  read: ReadFilter
}

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const restApi = useRestApi()
const snackbar = useSnackbarStore()
const notificationStore = useNotificationDrawerStore()
const { isDesktop, isMobile } = useShellBreakpoints()

const READ_OPTIONS: Array<{ title: string; value: ReadFilter }> = [
  { title: 'Tümü', value: 'all' },
  { title: 'Okunmamış', value: 'unread' },
  { title: 'Okundu', value: 'read' },
]

// Bilinmeyen tür kodu (şemaya sonradan eklenen) olduğu gibi gösterilir; yoksa "—".
const typeLabel = (type: unknown) => (isNotificationType(type) ? t(`notificationCenter.types.${type}`) : typeof type === 'string' && type ? type : '—')
const typeOptions = computed(() => NOTIFICATION_TYPES.map((value) => ({ value, title: typeLabel(value) })))

const FULL_COLUMNS: EkGridColumn[] = [
  { key: 'type', label: 'Tür', width: '168px' },
  { key: 'title', label: 'Bildirim' },
  { key: 'createdAt', label: 'Zaman', sortable: true, width: '164px' },
  { key: 'status', label: 'Durum', width: '120px' },
  { key: 'actions', label: 'İşlemler', align: 'end', width: '128px' },
]
// Dar ekran: yatay kaydırma yerine üç kolon — tür yalnız ikon, zaman ve okunma bilgisi başlık hücresinde.
const COMPACT_COLUMNS: EkGridColumn[] = [
  { key: 'type', label: 'Tür', width: '52px' },
  { key: 'title', label: 'Bildirim' },
  { key: 'actions', label: 'İşlemler', align: 'end', width: '84px' },
]
const compact = computed(() => isMobile.value)
const columns = computed(() => (compact.value ? COMPACT_COLUMNS : FULL_COLUMNS))

// --- durum ---
const items = ref<NotificationRow[]>([])
const loading = ref(false)
const loadError = ref(false)
const loadedAt = ref<Date | null>(null)
const now = ref(new Date())
const selected = ref<Array<string | number>>([])
const sort = ref<EkGridSort>({ key: 'createdAt', dir: 'desc' })
const page = ref(1)
const pageSize = ref(25)
const busy = ref<'' | 'read-all' | 'read-selected' | 'delete-selected'>('')
const confirmOpen = ref(false)
const detailOpen = ref(false)
const detail = ref<NotificationRow | null>(null)
const filtersCollapsed = ref(!isDesktop.value)

const emptyFilters = (): FilterState => ({ types: [], read: 'all' })
const draft = reactive<FilterState>(emptyFilters())
/** Son SORGULANAN filtre (çipler ve liste buna göre). */
const applied = ref<FilterState>(emptyFilters())

// --- türetilmiş ---
const isFiltered = computed(() => applied.value.types.length > 0 || applied.value.read !== 'all')
const truncated = computed(() => items.value.length >= NOTIFICATION_LIST_LIMIT)
const unreadTotal = computed(() => notificationStore.unreadCount)
const attentionUnread = computed(() => items.value.filter((n) => !n.isRead && isAttentionType(n.type)).length)

const visibleRows = computed(() => {
  const { types, read } = applied.value
  const dir = sort.value?.dir === 'asc' ? 1 : -1
  const time = (n: NotificationRow) => (n.createdAt ? new Date(n.createdAt).getTime() : 0)
  return items.value
    .filter((n) => (types.length ? types.includes(n.type as NotificationType) : true))
    .filter((n) => (read === 'unread' ? !n.isRead : read === 'read' ? n.isRead : true))
    .slice()
    .sort((a, b) => {
      // "Dikkat" türleri her sıralamada üstte sabit.
      const pin = Number(isAttentionType(b.type)) - Number(isAttentionType(a.type))
      return pin !== 0 ? pin : (time(a) - time(b)) * dir
    })
})

const pageRows = computed(() => visibleRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const selectedRows = computed(() => items.value.filter((n) => selected.value.includes(n._id)))
const selectedUnreadIds = computed(() => selectedRows.value.filter((n) => !n.isRead).map((n) => n._id))

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const chips: EkActiveFilterChip[] = []
  const a = applied.value
  if (a.types.length) chips.push({ key: 'types', label: 'Tür', value: a.types.map(typeLabel).join(', ') })
  if (a.read !== 'all') chips.push({ key: 'read', label: 'Okunma', value: READ_OPTIONS.find((o) => o.value === a.read)?.title ?? a.read })
  return chips
})

const SEVERITY_LABELS: Record<string, string> = { success: 'Başarılı', info: 'Bilgi', primary: 'Bilgi', warning: 'Uyarı', error: 'Hata', danger: 'Hata' }
const severityLabel = (severity: unknown) => (typeof severity === 'string' && SEVERITY_LABELS[severity]) || 'Bilgi'

const tileTone = (row: GridRow): EkTone => {
  const tone = notificationSeverityTone(row.severity)
  return tone === 'danger' ? 'error' : tone
}

// Ayrıntı özeti: yalnız backend'in metaData'da GERÇEKTEN döndürdüğü sayaçlar (uydurma alan yok).
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
  const code = detail.value?.metaData?.integrationCode
  if (typeof code !== 'string' || !code) return null
  return { code, name: CHANNEL_NAMES[code.toLowerCase()] ?? code }
})

// --- veri ---
async function load() {
  loading.value = true
  loadError.value = false
  const onlyUnread = applied.value.read === 'unread'
  try {
    const response: any = await restApi.post('NotificationService/get', { limit: NOTIFICATION_LIST_LIMIT, onlyUnread })
    if (response?.result && Array.isArray(response.data)) {
      items.value = response.data
      if (typeof response.unreadCount === 'number') notificationStore.unreadCount = response.unreadCount
      loadedAt.value = new Date()
      now.value = new Date()
      const ids = new Set(items.value.map((n) => n._id))
      selected.value = selected.value.filter((id) => ids.has(String(id)))
      const lastPage = Math.max(1, Math.ceil(visibleRows.value.length / pageSize.value))
      if (page.value > lastPage) page.value = lastPage
    } else {
      loadError.value = true
    }
  } catch (error) {
    logger.error('Bildirim merkezi listesi alınamadı', { module: 'NotificationCenterView', op: 'load', error })
    loadError.value = true
  } finally {
    loading.value = false
  }
}

function applyFilters() {
  const needsReload = (draft.read === 'unread') !== (applied.value.read === 'unread')
  applied.value = { types: [...draft.types], read: draft.read }
  page.value = 1
  selected.value = []
  if (needsReload) load()
}

function resetFilters() {
  Object.assign(draft, emptyFilters())
  applyFilters()
}

function removeChip(key: string) {
  if (key === 'types') draft.types = []
  if (key === 'read') draft.read = 'all'
  applyFilters()
}

function onPageSize(size: number) {
  pageSize.value = size
  page.value = 1
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
    await load()
  }
}

async function markRowRead(row: GridRow) {
  const ok = await notificationStore.markAsRead(row._id)
  if (ok) row.isRead = true
  else report(false, '', 'Bildirim işaretlenemedi — tekrar deneyin.')
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
    await load()
  }
}

async function deleteRow(row: GridRow) {
  const ok = await notificationStore.deleteNotification(row._id)
  report(ok, 'Bildirim silindi.', 'Bildirim silinemedi — tekrar deneyin.')
  if (ok) {
    if (detail.value?._id === row._id) detailOpen.value = false
    await load()
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
  router.push(path).catch(() => {})
}

// "x dk önce" metinleri canlı kalsın (istek atmaz).
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  clock = setInterval(() => (now.value = new Date()), 60_000)
})
onBeforeUnmount(() => clearInterval(clock))

// Rozet sayımı değişirse (arka planda yeni bildirim) ve ekran açıksa liste tazelenir.
watch(
  () => notificationStore.unreadCount,
  (next, prev) => {
    if (next > prev && !loading.value && !busy.value) load()
  },
)

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

/* Araç / seçim çubuğu (liste standardı: seçim yokken özet + eylemler, seçimde toplu eylemler). */
.ek-nc-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  min-height: 52px;
  padding: var(--ek-space-2) var(--ek-space-4);
  background: var(--ek-color-surface);
  transition: var(--ek-transition-colors);
}

.ek-nc-toolbar.is-on {
  background: var(--ek-color-selection);
  box-shadow: inset 3px 0 0 var(--ek-color-action);
}

.ek-nc-toolbar__count {
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-nc-toolbar__actions {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.ek-nc-danger-text {
  color: var(--ek-color-error);
}

.ek-nc-toolbar__summary {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-4);
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
  color: var(--ek-color-warning-emphasis);
}

.ek-nc-toolbar__stat--attention strong {
  color: inherit;
}

.ek-nc-toolbar__stat--attention :deep(.v-icon) {
  font-size: var(--ek-icon-sm);
}

.ek-nc-toolbar__end {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-nc-toolbar__stamp {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* Hücreler */
.ek-nc-type {
  display: inline-flex;
  align-items: center;
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
}

.ek-nc-item__dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 50%;
  background: var(--ek-color-action);
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

.ek-nc-actions {
  display: inline-flex;
  justify-content: flex-end;
  gap: var(--ek-space-1);
}

.ek-nc-pager-note {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* Ayrıntı */
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

.ek-nc-item__meta {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
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

@media (max-width: 767px) {
  .ek-notification-center {
    height: auto;
    padding: var(--ek-space-4);
  }

  .ek-nc-toolbar__end {
    width: 100%;
    justify-content: space-between;
  }

  .ek-nc-toolbar__stamp {
    display: none;
  }

  .ek-nc-item {
    min-width: 0;
  }

}
</style>
