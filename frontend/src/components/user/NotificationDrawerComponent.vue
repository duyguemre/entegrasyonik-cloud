<!--
  frontend/src/components/user/NotificationDrawerComponent.vue

  ADR-0015 B5-3 — görsel katman; C1.5 (F-06) — liste çekmece AÇILINCA çekilir (store `drawer` izleyicisi),
  "Detayları gör" yalnız uygulama içi yolda (dış URL açılmaz), altta "Tümünü gör" → bildirim merkezi.

  C2b (ADR-0029) — sakin, taranabilir çekmece:
    - Başlık: "Bildirimler" + okunmamış sayısı + bağlantı durumu (Canlı / Otomatik yenileme). Birincil eylem
      "Tümünü okundu işaretle"; ⋯ menüsünde "Bildirim tercihleri" ve (tehlikeli, EN SONDA, onaylı) "Tümünü sil".
    - Sekmeler: Tümü · Okunmamış (istemci tarafı, en yeni 20 kayıt üzerinde).
    - Gün grupları (Bugün / Dün / Bu hafta / Daha eski), satır = ikon kapsülü (katalog kodu → ikon, önem → ton)
      + başlık + 2 satır ileti + meta (kategori · zaman · ×sayı). Kritik önem sol vurgu şeridi + "Kritik" çipi.
    - Zorunlu bildirim (katalog `mandatory`) kilit ikonu, a11y etiketi "Zorunlu bildirim".
    - Yeni gelenler (SSE) yalnız çekmece açıkken `afterId` ile başa eklenir (store).
  Ham renk yok (yalnız semantik token) → dark hazır. Zil ikonunun GÖRSELİ üst barın (fe-a8) işidir.

  FE-R4 A3 — pencere baştan (davranış/aynı eylem adları korunur):
    - Kabuktan ayrılan YÜZEN panel (8px boşluk, dialog radius + gölge); dar ekranda tam genişlik.
    - Başlık: büyük "Bildirimler" + okunmamış sayaç hapı; altında bağlantı durumu. Eylemler: okundu · ⋯ | kapat.
    - Satır: içe girik yuvarlak öğe; göreli ZAMAN başlık satırının sağında
      (üzerine gelince yerini okundu/sil düğmelerine bırakır); okunmamış = nokta + kalın başlık; kritik = hata tonlu kapsül + "Kritik" çipi + ince
      hata kenarı (eski 3px şerit kalktı); işlem özeti küçük metrik şeridi; kanal · kategori ve "Detayları gör"
      tek alt satırda.
    - İlk açılış: liste gelene kadar statik iskelet (store `loading`); liste alınamazsa `EkProblemState` + Tekrar dene
      (store `listError`). Boş durum sekmeye göre iki metin.
-->
<template>
  <v-navigation-drawer v-model="drawer" temporary location="right" :width="440"
    class="ek-notification-drawer" :elevation="0" aria-labelledby="ek-nd-title">
    <div class="ek-nd">
      <header class="ek-nd__header">
        <div class="ek-nd__heading">
          <div class="ek-nd__title-row">
            <h2 id="ek-nd-title" class="ek-nd__title">Bildirimler</h2>
            <span v-if="unread" class="ek-nd__count ek-num" :aria-label="`${unread} okunmamış`">{{ unread > 99 ? '99+' : unread }}</span>
          </div>
          <p class="ek-nd__subtitle">
            <span class="ek-nd__live" :class="`is-${liveState.tone}`">
              <span class="ek-nd__live-dot" aria-hidden="true"></span>{{ liveState.label }}
            </span>
            <template v-if="!unread">
              <span class="ek-nd__sep" aria-hidden="true">·</span>
              <span>Hepsi okundu</span>
            </template>
          </p>
        </div>
        <div class="ek-nd__header-actions">
          <EkTooltip text="Tümünü okundu işaretle">
            <EkButton tone="ghost" size="sm" icon="mdi-check-all" icon-only aria-label="Tümünü okundu işaretle"
              :disabled="!unread" @click="notificationStore.markAsRead()" />
          </EkTooltip>
          <EkContextMenu :groups="menuGroups" label="Bildirim işlemleri" @select="onMenu">
            <template #activator="{ props }">
              <EkButton v-bind="props" tone="ghost" size="sm" icon="mdi-dots-horizontal" icon-only aria-label="Bildirim işlemleri" />
            </template>
          </EkContextMenu>
          <span class="ek-nd__divider" aria-hidden="true"></span>
          <EkButton tone="ghost" size="sm" icon="mdi-close" icon-only aria-label="Kapat" @click="notificationStore.drawer = false" />
        </div>
      </header>

      <div class="ek-nd__tabs">
        <EkPageTabs v-model="tab" :tabs="tabs" label="Bildirim görünümü" dense />
      </div>

      <div class="ek-nd__body" tabindex="-1">
        <!-- İlk yükleme: sakin iskelet (sıçrama yok); veri gelince liste aynı ritimde yerine oturur. -->
        <div v-if="initialLoading" class="ek-nd__skeleton" aria-hidden="true">
          <div v-for="n in 4" :key="n" class="ek-nd__skeleton-row">
            <span class="ek-nd__skeleton-tile"></span>
            <span class="ek-nd__skeleton-lines"><span></span><span></span><span></span></span>
          </div>
        </div>
        <p v-if="initialLoading" class="ek-sr-only" role="status">Bildirimler yükleniyor…</p>

        <!-- Hata: liste hiç gelmediyse sakin problem durumu + Tekrar dene (eski liste varsa o kalır, titremez). -->
        <EkProblemState v-else-if="listFailed" class="ek-nd__problem" size="compact" title="Bildirimler yüklenemedi"
          action="Bağlantınızı kontrol edip tekrar deneyin." :retrying="notificationStore.loading"
          @retry="notificationStore.fetchNotifications()" />

        <EkEmptyState v-else-if="!visible.length" :variant="tab === 'unread' && items.length ? 'no-results' : 'no-data'"
          :title="tab === 'unread' && items.length ? 'Okunmamış bildiriminiz yok' : 'Henüz bildiriminiz yok'"
          :message="tab === 'unread' && items.length ? 'Hepsini okudunuz. Önceki bildirimler Tümü sekmesinde.' : 'Yeni bildirimler burada görünecek.'" />

        <section v-for="group in groups" :key="group.key" class="ek-nd__group" :aria-labelledby="`ek-nd-g-${group.key}`">
          <h3 :id="`ek-nd-g-${group.key}`" class="ek-nd__group-title">
            <span>{{ DAY_GROUP_LABELS[group.key] }}</span>
            <span class="ek-nd__group-count ek-num" aria-hidden="true">{{ group.items.length }}</span>
          </h3>
          <ul class="ek-nd__list" role="list">
            <li v-for="item in group.items" :key="item._id" class="ek-nd-item ek-notification-card"
              :class="{ 'is-unread': !item.isRead, 'is-critical': view(item).critical, 'ek-notification-card--unread': !item.isRead }">
              <EkIconTile class="ek-nd-item__tile" :icon="view(item).icon" :tone="view(item).tone" size="md" />
              <div class="ek-nd-item__main">
                <div class="ek-nd-item__head">
                  <span class="ek-nd-item__title">{{ view(item).title }}</span>
                  <span class="ek-nd-item__time ek-num">
                    <time :datetime="item.createdAt">{{ formatTime(item.createdAt) }}</time>
                    <span v-if="!item.isRead" class="ek-nd-item__dot" aria-hidden="true"></span>
                  </span>
                </div>
                <div v-if="view(item).critical || (item.count ?? 1) > 1 || view(item).mandatory" class="ek-nd-item__flags">
                  <EkStatusChip v-if="view(item).critical" tone="danger" label="Kritik" dot />
                  <EkBadge v-if="(item.count ?? 1) > 1" class="ek-nd-item__count" variant="label" tone="neutral"
                    :text="`×${item.count}`" :aria-label="`${item.count} kez`" />
                  <span v-if="view(item).mandatory" class="ek-nd-item__lock" role="img" aria-label="Zorunlu bildirim" title="Zorunlu bildirim">
                    <v-icon icon="mdi-lock-outline" aria-hidden="true" />
                    <span aria-hidden="true">Zorunlu</span>
                  </span>
                </div>
                <p v-if="item.message" class="ek-nd-item__message">{{ item.message }}</p>

                <div v-if="summary(item).length" class="ek-nd-item__summary">
                  <span :id="`ek-nd-s-${item._id}`" class="ek-sr-only">İşlem özeti</span>
                  <dl class="ek-nd-item__summary-list" :aria-labelledby="`ek-nd-s-${item._id}`">
                    <div v-for="row in summary(item)" :key="row.label" class="ek-nd-item__summary-row">
                      <dd class="ek-num">{{ row.value }}</dd>
                      <dt>{{ row.label }}</dt>
                    </div>
                  </dl>
                </div>

                <!-- Alt satır: kanal · kategori · tekrar (zaman başlıkta). "Detayları gör" aynı satırın sağında. -->
                <div class="ek-nd-item__foot">
                  <span class="ek-nd-item__meta">
                    <EkPlatformMark v-if="channelCode(item)" variant="dot" :code="channelCode(item)" :name="channelName(item)" class="ek-nd-item__channel" />
                    <span v-if="metaText(item)" class="ek-nd-item__meta-text">{{ metaText(item) }}</span>
                  </span>
                  <EkButton v-if="internalActionPath(item.actionUrl)" size="sm" tone="ghost" trailing-icon="mdi-arrow-right"
                    class="ek-nd-item__go-btn" :aria-label="`Detayları gör: ${view(item).title}`" @click="openAction(item)">
                    Detayları gör
                  </EkButton>
                </div>
              </div>
              <!-- Satır eylemleri: işaretçili cihazda zamanın yerine, üzerine gelince/odakta (liste sakin); dokunmatikte hep görünür. -->
              <div class="ek-nd-item__actions">
                  <EkTooltip v-if="!item.isRead" text="Okundu işaretle">
                    <EkButton tone="ghost" size="sm" icon="mdi-check" icon-only :aria-label="`Okundu işaretle: ${view(item).title}`"
                      @click="notificationStore.markAsRead(item._id)" />
                  </EkTooltip>
                  <EkActionButton action="delete" :label="`Sil: ${view(item).title}`"
                    @click="notificationStore.deleteNotification(item._id)" />
              </div>
              <span v-if="!item.isRead" class="ek-sr-only">Okunmamış</span>
            </li>
          </ul>
        </section>
      </div>

      <footer v-if="centerLink" class="ek-nd__footer ek-notification-drawer__footer">
        <EkButton block tone="secondary" trailing-icon="mdi-arrow-right" @click="openCenter">Tümünü gör</EkButton>
      </footer>
    </div>

    <EkDialog v-model="confirmClear" tone="danger" width="sm" icon="mdi-trash-can-outline"
      title="Tüm bildirimler silinsin mi?" description="Listenizdeki tüm bildirimler kaldırılır; bu işlem geri alınamaz."
      confirm-label="Tümünü sil" @confirm="clearAll" />
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import { computed, inject, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useNotificationDrawerStore } from '@/stores/notificationDrawer'
import { labelsFor, notificationTitle, useNotificationCatalogStore } from '@/stores/notificationCatalog'
import { PLATFORM_PROCESS_LABELS, PLATFORM_PROCESS } from '@/types/PlatformProcess'
import { EkEmptyState, EkProblemState, EkStatusChip, EkPlatformMark, EkButton, EkBadge, EkIconTile, EkTooltip, EkPageTabs, EkContextMenu, EkDialog, EkActionButton } from '@entegrasyonik/ui/components'
import type { EkMenuGroup, EkMenuItem } from '@entegrasyonik/ui/components'
import { formatNumber, formatRelative } from '@entegrasyonik/ui/format'
import {
  DAY_GROUP_LABELS,
  groupByDay,
  internalActionPath,
  notificationVisual,
  type NotificationItem,
} from '@/types/NotificationTypes'

const notificationStore = useNotificationDrawerStore()
const catalog = useNotificationCatalogStore()
const router = useRouter()
const { locale } = useI18n({ useScope: 'global' })
const eventBus: any = inject('eventBus', undefined)
const menuStore: any = inject('useMenuStore', undefined)

const drawer = computed({
  get: () => notificationStore.drawer,
  set: (val) => (notificationStore.drawer = val),
})

// Katalog oturumda bir kez; çekmece ilk açılışta yüklenir (ikon/kategori/zorunluluk).
watch(drawer, (open) => {
  if (open) catalog.ensureLoaded()
})

// Bildirim merkezi / tercihler yalnız menüde (MenuService) kayıtlıysa önerilir — erişimi olmayan ekrana bağlantı verilmez.
const centerLink = computed(() => menuStore?.getMenuLinkWithCode?.('NotificationCenterView'))
const prefsLink = computed(() => menuStore?.getMenuLinkWithCode?.('NotificationPreferencesView'))

function openTab(link: unknown) {
  notificationStore.drawer = false
  eventBus?.emit('openTab', link)
}
const openCenter = () => openTab(centerLink.value)

const items = computed<NotificationItem[]>(() => (Array.isArray(notificationStore.notifications) ? notificationStore.notifications : []))
const unread = computed(() => notificationStore.unreadCount || 0)
const tab = ref<'all' | 'unread'>('all')
const unreadInList = computed(() => items.value.filter((n) => !n.isRead).length)
const tabs = computed(() => [
  { value: 'all', label: 'Tümü' },
  { value: 'unread', label: 'Okunmamış', count: unreadInList.value },
])
/** İlk açılış: liste henüz gelmedi → iskelet (sonraki tazelemelerde liste yerinde kalır, titremez). */
const initialLoading = computed(() => notificationStore.loading && !items.value.length && !notificationStore.listError)
/** Liste hiç alınamadı (eski liste varsa o gösterilir). */
const listFailed = computed(() => notificationStore.listError && !items.value.length)
const visible = computed(() => (tab.value === 'unread' ? items.value.filter((n) => !n.isRead) : items.value))
const groups = computed(() => groupByDay(visible.value))

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

const labels = computed(() => labelsFor(locale.value))
function view(item: NotificationItem) {
  const visual = notificationVisual(item, catalog.codeCategory)
  return {
    ...visual,
    title: notificationTitle(item, labels.value, visual.category),
    categoryLabel: visual.category ? labels.value.categories[visual.category] : '',
    mandatory: item.mandatory === true || catalog.isMandatory(item.code),
  }
}

const CHANNEL_NAMES: Record<string, string> = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
  n11: 'N11',
  pazarama: 'Pazarama',
  ideasoft: 'Ideasoft',
  bizimhesap: 'Bizimhesap',
}
/** Kanal kodu: eski kayıtta `metaData.integrationCode`, v2'de `params.integ`. */
function channelCode(item: NotificationItem): string | undefined {
  const code = item.metaData?.integrationCode ?? item.params?.integ
  return typeof code === 'string' && code ? code : undefined
}
const channelName = (item: NotificationItem) => {
  const code = channelCode(item) ?? ''
  return CHANNEL_NAMES[code.toLowerCase()] ?? code
}
/** Kategori (yoksa eski işlem türü) · grup son olay. Göreli zaman (FE-R4 A3) başlık satırının sağında. */
function metaText(item: NotificationItem): string {
  const v = view(item)
  const parts = [
    v.categoryLabel || (item.mode ? PLATFORM_PROCESS_LABELS[item.mode as PLATFORM_PROCESS] || item.mode : ''),
    (item.count ?? 1) > 1 && item.lastOccurredAt ? `son: ${formatTime(item.lastOccurredAt)}` : '',
  ]
  return parts.filter(Boolean).join(' · ')
}

// Eski toplu işlem / içe aktarma kayıtlarının özeti: yalnız backend'in metaData'da GERÇEKTEN döndürdüğü sayaçlar.
const SUMMARY_FIELDS: Array<[string, string]> = [
  ['totalAccepted', 'İşleme alınan'],
  ['totalAlreadyTransfer', 'Zaten eşleşmiş'],
  ['totalNoTransferSkipped', 'Gönderim gereken'],
  ['totalCount', 'Toplam çekilen'],
  ['validCount', 'Aday aktarım'],
  ['processedCount', 'Aktarılan'],
  ['invalidCount', 'Eksik'],
  ['duplicateCount', 'Mükerrer'],
  ['failedCount', 'Hata'],
]
function summary(item: NotificationItem) {
  const meta = item.metaData
  if (!meta || (item.type !== 'BATCH_PROCESS' && item.type !== 'IMPORT_READY')) return []
  return SUMMARY_FIELDS.filter(([key]) => typeof meta[key] === 'number').map(([key, label]) => ({ label, value: formatNumber(meta[key]) }))
}

function openAction(item: NotificationItem) {
  const path = internalActionPath(item.actionUrl)
  if (!path) return
  if (!item.isRead) notificationStore.markAsRead(item._id)
  notificationStore.drawer = false
  router.push(path).catch(() => {})
}

const confirmClear = ref(false)
const menuGroups = computed<EkMenuGroup[]>(() => [
  ...(prefsLink.value ? [{ items: [{ key: 'prefs', label: 'Bildirim tercihleri', icon: 'mdi-tune-variant' }] }] : []),
  { items: [{ key: 'clear', label: 'Tümünü sil', icon: 'mdi-trash-can-outline', danger: true, disabled: !items.value.length }] },
])
function onMenu(item: EkMenuItem) {
  if (item.key === 'prefs') openTab(prefsLink.value)
  if (item.key === 'clear') confirmClear.value = true
}
async function clearAll() {
  await notificationStore.deleteNotification()
  confirmClear.value = false
}

// C1.5: tarayıcı yereline bağlı "10:29 PM" yerine uygulamanın tek biçimi ("5 dk önce").
const formatTime = (dateStr?: string) => (dateStr ? formatRelative(dateStr) : '')
</script>

<style scoped>
/* FE-R4 A3 — bildirim penceresi: kabuktan ayrılan YÜZEN panel (kenarlardan 8px, `radius-dialog`, `shadow-dialog`).
   Çekmece kabı şeffaftır; görünen yüzey `.ek-nd`. Dar ekranda (< 600px) tam genişlik, köşesiz. */
.ek-notification-drawer {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}

.ek-nd {
  display: flex;
  flex-direction: column;
  height: calc(100% - var(--ek-space-4));
  margin: var(--ek-space-2);
  overflow: hidden;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-dialog);
  background: var(--ek-color-surface-raised);
  box-shadow: var(--ek-shadow-dialog);
}

@media (max-width: 599px) {
  .ek-nd {
    height: 100%;
    margin: 0;
    border: 0;
    border-radius: 0;
  }
}

/* ---------- Başlık ---------- */
.ek-nd__header {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-5) var(--ek-space-3) var(--ek-space-3) var(--ek-space-5);
}

.ek-nd__heading {
  flex: 1;
  min-width: 0;
}

.ek-nd__title-row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-nd__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  letter-spacing: -0.01em;
}

/* Okunmamış sayacı: dolgu hap (EkBadge count dili), başlığın sağında. */
.ek-nd__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-bold);
  line-height: 1;
}

.ek-nd__subtitle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1);
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-nd__sep {
  color: var(--ek-color-content-subtle);
}

.ek-nd__live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ek-nd__live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ek-color-content-subtle);
}

.ek-nd__live.is-live .ek-nd__live-dot {
  background: var(--ek-color-success);
  box-shadow: 0 0 0 3px var(--ek-color-success-subtle);
}

.ek-nd__live.is-wait .ek-nd__live-dot {
  background: var(--ek-color-warning);
}

.ek-nd__header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
}

.ek-nd__divider {
  width: 1px;
  height: 20px;
  margin: 0 var(--ek-space-1);
  background: var(--ek-color-border-default);
}

.ek-nd__tabs {
  padding: 0 var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

/* ---------- Gövde ---------- */
.ek-nd__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 0 var(--ek-space-3);
  outline: none;
  overscroll-behavior: contain;
}

.ek-nd__problem {
  margin: var(--ek-space-8) var(--ek-space-5) 0;
}

.ek-nd__body :deep(.ek-empty) {
  margin-top: var(--ek-space-10);
}

.ek-nd__group-title {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: var(--ek-space-4) var(--ek-space-5) var(--ek-space-2);
  background: var(--ek-color-surface-raised);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-nd__group-count {
  color: var(--ek-color-content-subtle);
  letter-spacing: 0;
}

.ek-nd__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0 var(--ek-space-2);
  list-style: none;
}

/* Satır = içe girik yuvarlak öğe (kart değil), zeminsiz; okunmamış = nokta + kalın başlık (renkli blok yok — liste
   sakin kalır, dark'ta ağırlaşmaz); hover/odak yüzey. */
.ek-nd-item {
  position: relative;
  display: flex;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  border-radius: var(--ek-radius-card);
  transition: var(--ek-transition-colors);
}

.ek-nd-item:hover,
.ek-nd-item:focus-within {
  background: var(--ek-color-surface-muted);
}

/* Kritik: ikon kapsülü hata tonu + "Kritik" çipi; ek olarak öğenin içinde ince hata kenarı (şerit kabı taşmaz). */
.ek-nd-item.is-critical {
  box-shadow: inset 0 0 0 1px var(--ek-color-error-border);
}

.ek-nd-item__tile {
  flex: none;
}

.ek-nd-item__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.ek-nd-item__head {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-3);
}

.ek-nd-item__title {
  flex: 1;
  min-width: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-medium);
  overflow-wrap: anywhere;
}

.ek-nd-item.is-unread .ek-nd-item__title {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

/* Zaman + okunmamış noktası: başlık satırının sağında, sabit genişlikte değil — taşmaz. */
.ek-nd-item__time {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  white-space: nowrap;
  transition: opacity var(--ek-motion-feedback);
}

.ek-nd-item__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ek-color-action);
}

/* Bildirim merkeziyle aynı: kritik okunmamışın noktası hata tonunda. */
.ek-nd-item.is-critical .ek-nd-item__dot {
  background: var(--ek-color-error);
}

/* Bildirim merkeziyle aynı: kritik okunmamışın noktası hata tonunda. */
.ek-nd-item.is-critical .ek-nd-item__dot {
  background: var(--ek-color-error);
}

.ek-nd-item__flags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-2);
}

.ek-nd-item__lock {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-nd-item__lock :deep(.v-icon) {
  font-size: var(--ek-icon-xs);
}

.ek-nd-item__message {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-caption-line);
  overflow-wrap: anywhere;
}

/* İşlem özeti: sayı üstte (tabular), etiket altta — küçük metrik şeridi, ince ayraçlı. */
.ek-nd-item__summary {
  margin-top: var(--ek-space-1);
}

.ek-nd-item__summary-list {
  display: flex;
  flex-wrap: wrap;
  margin: 0;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
}

.ek-nd-item__summary-row {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-width: 72px;
  padding: var(--ek-space-2) var(--ek-space-3);
}

.ek-nd-item__summary-row + .ek-nd-item__summary-row {
  border-left: 1px solid var(--ek-color-border-subtle);
}

.ek-nd-item__summary-row dd {
  order: 0;
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-nd-item__summary-row dt {
  order: 1;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-nd-item__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-1) var(--ek-space-3);
}

.ek-nd-item__meta {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1) var(--ek-space-2);
  min-width: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-nd-item__channel {
  font-size: var(--ek-type-caption-size);
}

.ek-nd-item__channel + .ek-nd-item__meta-text::before {
  content: '·';
  margin-right: var(--ek-space-2);
  color: var(--ek-color-content-subtle);
}

.ek-nd-item__go-btn {
  margin-right: calc(var(--ek-space-2) * -1);
  color: var(--ek-color-action-emphasis);
}

/* Satır düğmeleri (okundu/sil): işaretçili cihazda başlık satırının sağında, zamanın YERİNE (üzerine gelince/odakta);
   dokunmatikte alt satırın sonunda hep görünür. Satır yüksekliği değişmez. */
.ek-nd-item__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: none;
  align-self: flex-start;
}

@media (hover: hover) {
  .ek-nd-item__actions {
    position: absolute;
    top: 6px;
    right: var(--ek-space-2);
    padding: 2px;
    border: 1px solid var(--ek-color-border-subtle);
    border-radius: var(--ek-radius-control);
    background: var(--ek-color-surface-raised);
    box-shadow: var(--ek-shadow-raised);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--ek-motion-feedback);
  }

  .ek-nd-item:hover .ek-nd-item__actions,
  .ek-nd-item:focus-within .ek-nd-item__actions {
    opacity: 1;
    pointer-events: auto;
  }

  .ek-nd-item:hover .ek-nd-item__time,
  .ek-nd-item:focus-within .ek-nd-item__time {
    opacity: 0;
  }
}

@media (hover: none) {
  .ek-nd-item {
    flex-wrap: wrap;
  }

  .ek-nd-item__actions {
    margin-left: auto;
  }
}

/* ---------- İlk yükleme iskeleti (statik; hareket yok) ---------- */
.ek-nd__skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-4) var(--ek-space-5);
}

.ek-nd__skeleton-row {
  display: flex;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) 0;
}

.ek-nd__skeleton-tile {
  flex: none;
  width: var(--ek-icon-tile-md);
  height: var(--ek-icon-tile-md);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.ek-nd__skeleton-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding-top: 2px;
}

.ek-nd__skeleton-lines span {
  height: 10px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.ek-nd__skeleton-lines span:first-child {
  width: 55%;
}

.ek-nd__skeleton-lines span:last-child {
  width: 35%;
}

/* ---------- Alt çubuk ---------- */
.ek-nd__footer {
  flex: none;
  padding: var(--ek-space-3) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}
</style>
