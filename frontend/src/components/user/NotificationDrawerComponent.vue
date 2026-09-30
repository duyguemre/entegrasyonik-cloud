<!--
  frontend/src/components/user/NotificationDrawerComponent.vue

  ADR-0015 B5-3 — GÖRSEL KATMAN (bkz. e2e/specs/notification-drawer.spec.ts). API sözleşmesi/
  davranış DEĞİŞMEDİ: `NotificationService` (GET), `NotificationService/markAsRead|delete`
  çağrıları, id'siz (toplu) eylemlerin `fetchNotifications()`'ı yan etki olarak tetiklemesi AYNEN
  korundu. C1.5 (F-06) bilinçli değişiklik: eski karakterizasyon notundaki "çekmece açılınca veri
  yüklenmiyor" davranışı DÜZELTİLDİ — tam liste artık çekmece AÇILINCA çekilir (store `drawer`
  izleyicisi); üst bar rozeti ayrı, hafif `getUnreadCount` yoklamasıyla beslenir. "Detayları Gör"
  yalnız uygulama içi yolda görünür (dış URL açılmaz); altta "Tümünü gör" → bildirim merkezi.

  Renkli ikon kutuları/pastel zeminler (Karar 1.1 "renkli ikon kutuları... yasaktır") tek anlamsal
  palete (success/warning/danger/info/neutral, `EkStatusChip` ile AYNI ton kümesi) taşındı. `mode`
  rozeti (`PLATFORM_PROCESS_COLORS`, `types/PlatformProcess.ts`) bu görevin kapsamı DIŞI (paylaşılan
  tip dosyası) — kategori-başı renk şeması KORUNDU, yalnızca bu dosyadaki eski gri yedek hex
  değeri token'a çevrildi.
-->
<template>
  <v-navigation-drawer v-model="drawer" temporary location="right" :width="420"
    class="ek-notification-drawer d-flex flex-column" elevation="3">

    <div class="ek-notification-drawer__header pa-5 d-flex align-center flex-shrink-0">
      <v-badge :content="notificationStore.unreadCount" :model-value="notificationStore.unreadCount > 0" color="error"
        overlap>
        <v-icon size="24" icon="mdi-bell-outline" color="primary" />
      </v-badge>
      <div class="ml-4">
        <h2 class="ek-notification-drawer__title">Bildirimler</h2>
        <span class="ek-notification-drawer__subtitle">
          {{ notificationStore.unreadCount }} okunmamış bildiriminiz var
        </span>
      </div>

      <v-spacer></v-spacer>

      <div class="d-flex align-center">
        <v-btn icon="mdi-check-all" variant="text" density="comfortable" aria-label="Tümünü okundu işaretle"
          @click="notificationStore.markAsRead()" />
        <v-tooltip :eager="false" activator="parent" location="bottom">Tümünü Okundu İşaretle</v-tooltip>

        <v-btn icon="mdi-trash-can-outline" variant="text" density="comfortable" aria-label="Tümünü sil"
          @click="notificationStore.deleteNotification()" />
        <v-tooltip :eager="false" activator="parent" location="bottom">Tümünü sil</v-tooltip>

        <v-btn icon="mdi-close" variant="text" density="comfortable" class="ml-1" aria-label="Kapat"
          @click="notificationStore.drawer = false" />
      </div>
    </div>

    <div class="ek-notification-drawer__body flex-grow-1 pa-4">
      <EkEmptyState v-if="notificationStore.notifications.length === 0" variant="no-data"
        title="Henüz bildiriminiz yok" message="Yeni bildirimler burada görünecek." />

      <v-card v-for="item in notificationStore.notifications" :key="item._id" variant="outlined"
        class="ek-notification-card mb-3" :class="{ 'ek-notification-card--unread': !item.isRead }">
        <div class="pa-4">
          <div class="d-flex align-start">
            <div class="ek-notif-icon mr-4" :class="`ek-notif-icon--${severityTone(item.severity)}`">
              <v-icon size="20" :icon="severityIcon(item.severity)" />
            </div>

            <div class="flex-grow-1">
              <div class="d-flex justify-space-between align-start mb-1">
                <div class="d-flex flex-column">
                  <span class="ek-notification-card__title">{{ item.title }}</span>
                  <EkStatusChip v-if="item.mode" class="mt-1 align-self-start" tone="neutral" :label="getModeInfo(item.mode).label" />
                </div>
                <span class="ek-notification-card__time ek-num">{{ formatTime(item.createdAt) }}</span>
              </div>

              <div class="ek-notification-card__message"
                :class="{ 'mb-3': ['BATCH_PROCESS', 'IMPORT_READY'].includes(item.type) }">
                {{ item.message }}
              </div>

              <div v-if="item.type === 'BATCH_PROCESS' && item.metaData" class="ek-notification-summary pa-3">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="ek-notification-summary__title">İşlem Özeti</span>
                  <EkChannelDot class="ek-notification-summary__channel" :code="item.metaData.integrationCode" />
                </div>

                <div class="ek-notification-summary__list">
                  <div class="ek-notification-summary__row">
                    <span class="label"><v-icon size="14" color="success" class="mr-1">mdi-check-circle</v-icon> İşleme
                      Alınan</span>
                    <span class="value text-success">{{ item.metaData.totalAccepted || 0 }}</span>
                  </div>

                  <div v-if="item.metaData.totalAlreadyTransfer" class="ek-notification-summary__row">
                    <span class="label"><v-icon size="14" color="info" class="mr-1">mdi-information</v-icon> Zaten
                      Eşleşmiş</span>
                    <span class="value text-info">{{ item.metaData.totalAlreadyTransfer }}</span>
                  </div>

                  <div v-if="item.metaData.totalNoTransferSkipped" class="ek-notification-summary__row">
                    <span class="label"><v-icon size="14" color="warning" class="mr-1">mdi-alert</v-icon>Gönderim
                      Gereken Ürünler</span>
                    <span class="value text-warning">{{ item.metaData.totalNoTransferSkipped }}</span>
                  </div>
                </div>
              </div>

              <div v-if="item.type === 'IMPORT_READY' && item.metaData" class="ek-notification-summary pa-3">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="ek-notification-summary__title">İşlem Özeti</span>
                  <EkChannelDot class="ek-notification-summary__channel" :code="item.metaData.integrationCode" />
                </div>

                <div class="ek-notification-summary__list">
                  <div class="ek-notification-summary__row">
                    <span class="label"><v-icon size="14" color="primary" class="mr-1">mdi-database-import</v-icon>
                      Toplam Çekilen Ürün</span>
                    <span class="value text-primary">{{ item.metaData.totalCount || 0 }}</span>
                  </div>
                  <div v-if="item.metaData.invalidCount" class="ek-notification-summary__row">
                    <span class="label"><v-icon size="14" color="warning" class="mr-1">mdi-close-circle-outline</v-icon>
                      Eksik Ürün</span>
                    <span class="value text-warning">{{ item.metaData.invalidCount }}</span>
                  </div>
                  <div class="ek-notification-summary__row">
                    <span class="label"><v-icon size="14" color="info" class="mr-1">mdi-check-all</v-icon>
                      Aday Aktarım</span>
                    <span class="value text-info">{{ item.metaData.validCount || 0 }}</span>
                  </div>
                  <div class="ek-notification-summary__row ek-notification-summary__row--highlight">
                    <span class="label font-weight-bold"><v-icon size="14" color="success"
                        class="mr-1">mdi-content-copy</v-icon>
                      Aktarılan Ürün</span>
                    <span class="value text-success">{{ item.metaData.processedCount }}</span>
                  </div>
                  <div v-if="item.metaData.duplicateCount" class="ek-notification-summary__row">
                    <span class="label"><v-icon size="14" color="neutral" class="mr-1">mdi-content-copy</v-icon>
                      Mükerrer Ürün</span>
                    <span class="value">{{ item.metaData.duplicateCount }}</span>
                  </div>
                  <div v-if="item.metaData.failedCount" class="ek-notification-summary__row">
                    <span class="label"><v-icon size="14" color="error" class="mr-1">mdi-close-circle-outline</v-icon>
                      İşlem Hatası</span>
                    <span class="value text-error">{{ item.metaData.failedCount }}</span>
                  </div>
                </div>
              </div>

              <div class="d-flex align-center mt-4 pt-3 ek-notification-card__footer">
                <v-btn v-if="internalActionPath(item.actionUrl)" :to="internalActionPath(item.actionUrl)" size="small" color="primary" variant="tonal"
                  @click="notificationStore.drawer = false">
                  Detayları Gör
                </v-btn>

                <v-spacer />

                <v-btn v-if="!item.isRead" icon="mdi-check" size="small" variant="text" color="success"
                  aria-label="Okundu işaretle" @click="notificationStore.markAsRead(item._id)" />

                <v-btn icon="mdi-delete-outline" size="small" variant="text" aria-label="Sil"
                  @click="notificationStore.deleteNotification(item._id)" />
              </div>
            </div>
          </div>
        </div>
      </v-card>
    </div>

    <div v-if="centerLink" class="ek-notification-drawer__footer flex-shrink-0">
      <EkButton block tone="secondary" trailing-icon="mdi-arrow-right" @click="openCenter">Tümünü gör</EkButton>
    </div>
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import { computed, inject } from 'vue'
import { useNotificationDrawerStore } from '@/stores/notificationDrawer'
import { PLATFORM_PROCESS_LABELS, PLATFORM_PROCESS_COLORS, PLATFORM_PROCESS } from '@/types/PlatformProcess';
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkChannelDot from '@/components/ds/EkChannelDot.vue'
import EkButton from '@/components/ds/EkButton.vue'
import { formatRelative } from '@/composables/format'
import { internalActionPath } from '@/types/NotificationTypes'
const notificationStore = useNotificationDrawerStore()
const eventBus: any = inject('eventBus', undefined)
const menuStore: any = inject('useMenuStore', undefined)

// Bildirim merkezi yalnız menüde (MenuService) kayıtlıysa önerilir — erişimi olmayan ekrana bağlantı verilmez.
const centerLink = computed(() => menuStore?.getMenuLinkWithCode?.('NotificationCenterView'))
function openCenter() {
  notificationStore.drawer = false
  eventBus?.emit('openTab', centerLink.value)
}

const drawer = computed({
  get: () => notificationStore.drawer,
  set: (val) => (notificationStore.drawer = val)
})

const getModeInfo = (mode: string) => {
  return {
    label: PLATFORM_PROCESS_LABELS[mode as PLATFORM_PROCESS] || mode,
    // Karakterizasyon: `PLATFORM_PROCESS_COLORS` (kategori-başı hex şeması) bu görevin kapsamı
    // DIŞI (paylaşılan `types/PlatformProcess.ts`) — yalnızca yerel yedek değeri token'a çevrildi.
    color: PLATFORM_PROCESS_COLORS[mode as PLATFORM_PROCESS] || 'var(--ek-color-content-muted)'
  };
}

type SeverityTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

const severityIcon = (severity: string): string => {
  const icons: Record<string, string> = {
    success: 'mdi-check-decagram-outline',
    info: 'mdi-database-search-outline',
    warning: 'mdi-alert-box-outline',
    error: 'mdi-shield-remove-outline',
    primary: 'mdi-star-outline',
    danger: 'mdi-alert-circle-outline',
  }
  return icons[severity] || icons.info
}

const severityTone = (severity: string): SeverityTone => {
  const tones: Record<string, SeverityTone> = {
    success: 'success', info: 'info', warning: 'warning', error: 'danger', danger: 'danger', primary: 'info',
  }
  return tones[severity] || 'info'
}

// C1.5: tarayıcı yereline bağlı "10:29 PM" yerine uygulamanın tek biçimi ("5 dk önce").
const formatTime = (dateStr: string) => (dateStr ? formatRelative(dateStr) : '')
</script>

<style scoped>
.ek-notification-drawer {
  border-left: 1px solid var(--ek-color-border-default);
}

.ek-notification-drawer__header {
  border-bottom: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
}

.ek-notification-drawer__title {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  margin: 0;
}

.ek-notification-drawer__subtitle {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.ek-notification-drawer__footer {
  position: sticky;
  bottom: 0;
  z-index: 1;
  padding: var(--ek-space-3) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
}

.ek-notification-drawer__body {
  overflow-y: auto;
  background: var(--ek-color-surface-muted);
}

.ek-notification-card {
  background-color: var(--ek-color-surface);
  border-color: var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  transition: border-color var(--ek-duration-fast) var(--ek-easing-standard);
}

.ek-notification-card--unread {
  border-left: 3px solid var(--ek-color-primary);
}

.ek-notif-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--ek-radius-md);
  flex: none;
}

.ek-notif-icon--success {
  background-color: var(--ek-color-success-subtle);
  color: var(--ek-color-success);
}
.ek-notif-icon--info {
  background-color: var(--ek-color-info-subtle);
  color: var(--ek-color-info);
}
.ek-notif-icon--warning {
  background-color: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning);
}
.ek-notif-icon--danger {
  background-color: var(--ek-color-error-subtle);
  color: var(--ek-color-error);
}

.ek-notification-card__title {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-notification-card__time {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  flex: none;
  white-space: nowrap;
}

.ek-notification-card__message {
  font-size: var(--ek-font-size-sm);
  line-height: 1.45;
  color: var(--ek-color-content-default);
}

.ek-notification-card__footer {
  border-top: 1px solid var(--ek-color-border-default);
}

.ek-notification-summary {
  background-color: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
}

.ek-notification-summary__title {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ek-notification-summary__channel {
  font-size: var(--ek-type-caption-size);
}

.ek-notification-summary__list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.ek-notification-summary__row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--ek-font-size-xs);
}

.ek-notification-summary__row .label {
  color: var(--ek-color-content-muted);
}

.ek-notification-summary__row .value {
  font-weight: var(--ek-font-weight-semibold);
}

.ek-notification-summary__row--highlight {
  background-color: color-mix(in srgb, var(--ek-color-success) 8%, transparent);
  border-radius: var(--ek-radius-sm);
  padding: 2px var(--ek-space-2);
  margin: 0 calc(var(--ek-space-2) * -1);
}
</style>
