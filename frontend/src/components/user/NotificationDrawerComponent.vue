<template>
  <v-navigation-drawer v-model="drawer" temporary location="right" :width="480" color="navigationDrawer"
    class="notification-drawer-border d-flex flex-column" elevation="10">

    <div class="pa-5 d-flex align-center shadow-sm flex-shrink-0 sticky-header"
      :style="{ backgroundColor: `rgb(var(--v-theme-passiveColor))` }">
      <v-badge :content="notificationStore.unreadCount" :model-value="notificationStore.unreadCount > 0" color="error"
        overlap>
        <v-icon size="26" color="white">mdi-bell-outline</v-icon>
      </v-badge>
      <div class="ml-4">
        <h3 class="text-subtitle-1 font-weight-bold text-white mb-0">
          Bildirimler
        </h3>
        <span class="text-caption text-white opacity-80">
          {{ notificationStore.unreadCount }} okunmamış bildiriminiz var
        </span>
      </div>

      <v-spacer></v-spacer>

      <div class="d-flex align-center">
        <v-tooltip text="Tümünü Okundu İşaretle" location="bottom">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon variant="text" size="small" color="white" class="mr-1"
              @click="notificationStore.markAsRead()">
              <v-icon size="20">mdi-check-all</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <v-tooltip text="Tümünü Sil" location="bottom">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon variant="text" size="small" color="white"
              @click="notificationStore.deleteNotification()">
              <v-icon size="20">mdi-trash-can-outline</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <v-btn icon="mdi-close" size="small" variant="tonal" color="white" class="ml-3 rounded-lg"
          @click="notificationStore.drawer = false"></v-btn>
      </div>
    </div>

    <div class="custom-scroll-area flex-grow-1 pa-4">
      <div v-if="notificationStore.notifications.length === 0"
        class="d-flex flex-column align-center justify-center py-10 opacity-50 text-center">
        <v-icon size="64" color="grey">mdi-bell-off-outline</v-icon>
        <span class="mt-2 font-weight-medium">Henüz bildiriminiz yok</span>
      </div>

      <v-card v-for="(item, index) in notificationStore.notifications" :key="item._id" variant="outlined"
        class="notification-card mb-3" :class="{ 'unread-active': !item.isRead }">
        <div class="pa-4">
          <div class="d-flex align-start">
            <v-avatar size="40" variant="flat" :color="getSeverityInfo(item.severity).bg" class="mr-4 rounded-lg">
              <v-icon size="22" :color="getSeverityInfo(item.severity).color">
                {{ getSeverityInfo(item.severity).icon }}
              </v-icon>
            </v-avatar>

            <div class="flex-grow-1">
              <div class="d-flex justify-space-between align-start mb-1">
                <div class="d-flex flex-column">
                  <span class="text-subtitle-2 font-weight-bold text-grey-darken-4">
                    {{ item.title }}
                  </span>
                  <v-chip v-if="item.mode" size="x-small" :color="getModeInfo(item.mode).color" variant="tonal"
                    class="mt-1 font-weight-bold text-uppercase rounded-sm"
                    style="height: 18px; font-size: 0.6rem; width: fit-content;">
                    {{ getModeInfo(item.mode).label }}
                  </v-chip>
                </div>
                <span class="text-xxs text-medium-emphasis font-weight-medium">
                  {{ formatTime(item.createdAt) }}
                </span>
              </div>

              <div class="message-body" :class="{ 'mb-3': ['BATCH_PROCESS', 'IMPORT_READY'].includes(item.type) }">
                {{ item.message }}
              </div>

              <div v-if="item.type === 'BATCH_PROCESS' && item.metaData" class="batch-summary-box pa-3 rounded-lg">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="summary-title">İşlem Özeti</span>
                  <span class="text-xxs font-weight-black text-uppercase text-grey-darken-1"
                    style="font-size: 0.75rem !important;">
                    {{ item.metaData.integrationCode }}
                  </span>
                </div>

                <div class="summary-list">
                  <div class="summary-row">
                    <span class="label"><v-icon size="14" color="success" class="mr-1">mdi-check-circle</v-icon> İşleme
                      Alınan</span>
                    <span class="value text-success-darken-2">{{ item.metaData.totalAccepted || 0 }}</span>
                  </div>

                  <div v-if="item.metaData.totalAlreadyTransfer" class="summary-row">
                    <span class="label"><v-icon size="14" color="info" class="mr-1">mdi-information</v-icon> Zaten
                      Eşleşmiş</span>
                    <span class="value text-info-darken-2">{{ item.metaData.totalAlreadyTransfer }}</span>
                  </div>

                  <div v-if="item.metaData.totalNoTransferSkipped" class="summary-row">
                    <span class="label"><v-icon size="14" color="warning" class="mr-1">mdi-alert</v-icon>Gönderim
                      Gereken Ürünler</span>
                    <span class="value text-warning-darken-2">{{ item.metaData.totalNoTransferSkipped }}</span>
                  </div>
                </div>
              </div>

              <div v-if="item.type === 'IMPORT_READY' && item.metaData" class="batch-summary-box pa-3 rounded-lg">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="summary-title">İşlem Özeti</span>
                  <span class="text-xxs font-weight-black text-uppercase text-grey-darken-1"
                    style="font-size: 0.75rem !important;">
                    {{ item.metaData.integrationCode }}
                  </span>
                </div>

                <div class="summary-list">
                  <div class="summary-row">
                    <span class="label"><v-icon size="14" color="primary" class="mr-1">mdi-database-import</v-icon>
                      Toplam
                      Çekilen Ürün</span>
                    <span class="value text-primary">{{ item.metaData.totalCount || 0 }}</span>
                  </div>
                  <div v-if="item.metaData.invalidCount" class="summary-row">
                    <span class="label"><v-icon size="14" color="warning" class="mr-1">mdi-close-circle-outline</v-icon>
                      Eksik Ürün</span>
                    <span class="value text-warning-darken-2">{{ item.metaData.invalidCount }}</span>
                  </div>
                  <div class="summary-row">
                    <span class="label"><v-icon size="14" color="rgb(6, 182, 212)" class="mr-1">mdi-check-all</v-icon>
                      Aday
                      Aktarım</span>
                    <span class="value " style="color:rgb(6, 182, 212)">{{ item.metaData.validCount || 0 }}</span>
                  </div>
                  <div class="summary-row" style="background-color:#f9fff4;border:1px solid #eee">
                    <span class="label font-weight-bold"><v-icon size="14" color="success"
                        class="mr-1">mdi-content-copy</v-icon>
                      Aktarılan Ürün</span>
                    <span class="value text-success-darken-2">{{ item.metaData.processedCount }}</span>
                  </div>
                  <div v-if="item.metaData.duplicateCount" class="summary-row">
                    <span class="label"><v-icon size="14" color="indigo" class="mr-1">mdi-content-copy</v-icon>
                      Mükerrer Ürün</span>
                    <span class="value text-indigo-darken-2">{{ item.metaData.duplicateCount }}</span>
                  </div>
                  <div v-if="item.metaData.failedCount" class="summary-row">
                    <span class="label"><v-icon size="14" color="error" class="mr-1">mdi-close-circle-outline</v-icon>
                      İşlem Hatası</span>
                    <span class="value text-danger">{{ item.metaData.failedCount }}</span>
                  </div>
                </div>
              </div>
              <div class="d-flex align-center mt-4 pt-3 border-t-subtle">
                <v-btn v-if="item.actionUrl" :to="item.actionUrl" size="x-small" color="processButtonColor"
                  variant="flat" class="text-none px-4 rounded-md font-weight-bold elevation-0"
                  @click="notificationStore.drawer = false">
                  Detayları Gör
                </v-btn>

                <v-spacer />

                <v-btn v-if="!item.isRead" icon="mdi-check" size="30" variant="text" color="success"
                  class="rounded-md mr-1" @click="notificationStore.markAsRead(item._id)">
                </v-btn>

                <v-btn icon="mdi-delete-outline" size="30" variant="text" color="deleteButtonColor" class="rounded-md"
                  @click="notificationStore.deleteNotification(item._id)">
                </v-btn>
              </div>
            </div>
          </div>
        </div>
      </v-card>
    </div>
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { useNotificationDrawerStore } from '@/stores/notificationDrawer'
import { PLATFORM_PROCESS_LABELS, PLATFORM_PROCESS_COLORS, PLATFORM_PROCESS } from '@/types/PlatformProcess';
const notificationStore = useNotificationDrawerStore()

const drawer = computed({
  get: () => notificationStore.drawer,
  set: (val) => (notificationStore.drawer = val)
})

const getModeInfo = (mode: string) => {
  return {
    label: PLATFORM_PROCESS_LABELS[mode as PLATFORM_PROCESS] || mode,
    color: PLATFORM_PROCESS_COLORS[mode as PLATFORM_PROCESS] || '#757575' // Default grey
  };
}

const getSeverityInfo = (severity: string) => {
  // İkonlar ve arka plan renkleri (bg) güncellendi
  const configs: any = {
    success: { icon: 'mdi-check-decagram-outline', color: '#2E7D32', bg: '#E8F5E9' },
    info: { icon: 'mdi-database-search-outline', color: '#1565C0', bg: '#E3F2FD' },
    warning: { icon: 'mdi-alert-box-outline', color: '#EF6C00', bg: '#FFF3E0' },
    error: { icon: 'mdi-shield-remove-outline', color: '#C62828', bg: '#FFEBEE' },
    primary: { icon: 'mdi-star-outline', color: '#6A1B9A', bg: '#F3E5F5' },
    danger: { icon: 'mdi-alert-circle-outline', color: '#C62828', bg: '#FFEBEE' }
  }
  return configs[severity] || configs.info
}

const formatTime = (dateStr: string) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.notification-drawer-border {
  border-left: 1px solid rgba(0, 0, 0, 0.05) !important;
  overflow: hidden !important;
}

.sticky-header {
  position: sticky;
  top: 0;
  z-index: 100;
  flex-shrink: 0;
}

.custom-scroll-area {
  overflow-y: auto !important;
  overflow-x: hidden;
  background-color: rgb(var(--v-theme-workplaceColor)) !important;
}

.custom-scroll-area::-webkit-scrollbar {
  width: 6px;
  display: block;
}

.custom-scroll-area::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.03);
}

.custom-scroll-area::-webkit-scrollbar-thumb {
  background: #bdbdbd;
  border-radius: 10px;
}

.custom-scroll-area::-webkit-scrollbar-thumb:hover {
  background: #9e9e9e;
}

.notification-card {
  background-color: #ffffff !important;
  border: 1px solid #eceff1 !important;
  border-radius: 10px !important;
  transition: border-color 0.25s ease, background-color 0.25s ease;
}

/* Hover efekti yumuşatıldı */
.notification-card:hover {
  border-color: #cfd8dc !important;
  background-color: #fafbfc !important;
}

.unread-active {
  border-left: 4px solid rgb(var(--v-theme-passiveColor)) !important;
}

.message-body {
  font-size: 0.85rem;
  line-height: 1.45;
  color: #546e7a;
}

.batch-summary-box {
  background-color: #fafbfc;
  border: 1px solid #f1f3f5;
}

.summary-title {
  font-size: 0.65rem;
  font-weight: 800;
  color: #b0bec5;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.summary-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
}

.summary-row .label {
  color: #78909c;
}

/* Rakam Renkleri */
.value {
  font-weight: 800;
}

.text-success-darken-2 {
  color: #2e7d32;
}

.text-info-darken-2 {
  color: #1565c0;
}

.text-warning-darken-2 {
  color: #ef6c00;
}

.text-red-darken-2 {
  color: #c62828;
}

.text-xxs {
  font-size: 0.65rem;
}

.border-t-subtle {
  border-top: 1px solid #f5f7f9;
}
</style>