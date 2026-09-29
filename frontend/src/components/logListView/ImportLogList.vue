<template>
  <div class="importLogList d-flex flex-column">

    <ActionDialogComponent v-model="reportInfo.isOpen" title="Ürün Çekim İşlemi Detaylı Raporu"
      subtitle="Analiz ve Aktarım Verileri" icon="mdi-chart-bar" color="primary" maxWidth="1200" :showFooter="false"
      attach=".importLogList">
      <keep-alive>
        <DetailedImportLogReport :jobId="reportInfo.jobId" @close="reportInfo.isOpen = false" />
      </keep-alive>
    </ActionDialogComponent>

    <ConfirmationDialogComponent v-model="confirmationDelete.isDialogOpen"
      :title="confirmationDelete.mode === 'single' ? 'KAYIT SİLİNECEK' : 'SEÇİLİLER SİLİNECEK'"
      :message="confirmationDelete.mode === 'single' ? 'Bu işlem kaydını silmek istediğinizden emin misiniz?' : `${validSelectedJobsCount} adet silinebilir kayıt silinecek. Emin misiniz?`"
      icon="mdi-delete-alert-outline" color="error" confirmText="SİL" cancelText="İPTAL" attach=".importLogList"
      @confirm="confirmDelete()" @cancel="cancelDelete()" />

    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <div class="d-flex pa-2 pt-2 pb-0 mt-1 mb-1 align-start flex-wrap search-section">
      <v-text-field clearable density="compact" label="İşlem No ile Ara" variant="outlined" v-model="searchJobId"
        hide-details bg-color="textfieldColor" class="customTextField" @keyup.enter.stop="getJobs()"
        @click:clear="getJobs(true)">
        <template #append-inner>
          <v-tooltip open-delay="1000" :text="$t('products.product.search')">
            <template v-slot:activator="{ props: tooltipProps }">
              <v-btn flat size="40" v-bind="{ ...tooltipProps }" class="pa-2 ek-log-btn" elevation="0"
                color="white" @click.stop="getJobs()"
                aria-label="Aktarım kayıtlarında ara"><v-icon size="x-large"
                  color="processButtonColor">mdi-magnify</v-icon></v-btn>
            </template>
          </v-tooltip>
        </template>



      </v-text-field>

      <v-tooltip open-delay="1000" text="Yenile">
        <template v-slot:activator="{ props: tooltipProps }">
          <v-btn v-bind="{ ...tooltipProps }" @click="getJobs(true)" size="40" color="white"
            class="premium-cube-btn ml-2" flat aria-label="Listeyi yenile">
            <v-icon size="x-large" color="processButtonColor">mdi-refresh</v-icon>
          </v-btn>
        </template>
      </v-tooltip>

      <div v-if="$vuetify.display.smAndDown && validSelectedJobsCount > 0" class="">
        <v-badge :content="validSelectedJobsCount" :model-value="validSelectedJobsCount > 0" color="error" overlap
          offset-x="3" offset-y="3">
          <v-btn @click="openDeleteConfirm($event, 'batch')" size="40" color="danger" class="premium-cube-btn"
            aria-label="Seçili kayıtları sil">
            <v-icon size="x-large" color="white">mdi-delete</v-icon>
          </v-btn>
        </v-badge>
      </div>

      <div v-if="$vuetify.display.smAndDown" class="w-100 mt-0 mb-0 pa-0">
        <v-select v-model="mobileSortSelection" :items="sortOptions" item-title="title" item-value="value"
          label="Sıralama Kriteri" variant="outlined" density="compact" hide-details bg-color="textfieldColor"
          class="customTextField" :menu-props="{ contentClass: 'mobile-sort-menu' }"
          @update:model-value="onMobileSortUpdate" prepend-inner-icon="mdi-sort-variant">
          <template v-slot:item="{ props, item }">
            <v-list-item v-bind="props" class="custom-menu-item">
              <template v-slot:title>
                <div class="compact-title">{{ item.title }}</div>
              </template>
            </v-list-item>
          </template>
        </v-select>
      </div>
    </div>

    <div class="table-wrapper">
      <!-- ek-pattern-exception: EkDataTable — sunucu tarafı sıralama (v-data-table-server @update:sortBy) + limit 13 davranışı logs-characterization.spec.ts ile sabit; EkDataTable sütun sıralamayı desteklemiyor — hedef: Aşama C (EkDataTable sıralama desteği) --><v-data-table-server v-if="$vuetify.display.mdAndUp" v-model="selectedJobs" v-model:sort-by="sortBy"
        item-value="_id" :loading="loading" :itemsLength="pagination.totalNumberOfRecords" :items="jobs" fixed-header
        :headers="headers" class="pa-0 ma-0 custom-table desktop-table" show-select @update:sortBy="onSortUpdate"
        aria-label="Aktarım işlemleri tablosu">

        <!-- Boş durum: hata ile "gerçekten kayıt yok" AYNI karta düşer (gizli davranış,
             logs.spec.ts / BACKLOG.md — bilinçli korunuyor). -->
        <template v-slot:no-data>
          <EkEmptyState variant="no-results" title="Aktarım Kaydı Bulunamadı" message="Arama kriterlerinize uygun herhangi bir aktarım kaydı bulunamadı." />
        </template>

        <template v-slot:item="{ item }: any">
          <tr>
            <td><v-checkbox-btn :model-value="isJobSelected(item)" color="primary"
                @update:model-value="val => onJobSelectionUpdate(item, !!val)" density="compact"
                aria-label="Aktarım kaydını seç"></v-checkbox-btn></td>
            <td class="text-center"><span class="text-caption ek-num">{{ formatDateTime(item.startedAt) }}</span></td>
            <td class="text-center"><span class="text-caption ek-num">{{ item.completedAt ? formatDateTime(item.completedAt) : '-' }}</span></td>
            <td class="text-center">
              <PlatformImageComponent :integrationCode="item.integrationCode" :width="80" :height="35" class="mr-4">
              </PlatformImageComponent>
            </td>
            <td class="text-center">
              <EkStatusChip :tone="statusTone(item.status)" :label="translateStatus(item.status)" />
            </td>

            <td class="text-center">
              <div class="d-flex flex-column align-center justify-center pa-1">
                <div class="d-flex align-center mb-1 ek-log-gap-1">
                  <v-icon size="12" color="passiveColor">mdi-package-variant</v-icon>
                  <span class="text-caption font-weight-medium ek-num">{{ formatNumber(item.totalCount || 0) }}</span>
                </div>
                <div class="d-flex align-center px-2 ek-log-processed ek-log-gap-1">
                  <v-icon size="10" color="success">mdi-check-all</v-icon>
                  <span class="text-caption font-weight-medium ek-num ek-log-processed__value">{{ formatNumber(item.processedCount || 0) }}</span>
                </div>
              </div>
            </td>

            <td class="text-center pa-4">
              <div class="d-flex align-center justify-center">
                <div class="data-group-capsule d-flex align-center px-2 py-1 rounded-pill border">
                  <v-tooltip text="Aktarılmaya aday ürünler" location="top">
                    <template v-slot:activator="{ props }">
                      <div v-bind="props" class="stat-item d-flex align-center px-2">
                        <v-icon size="14" color="success" class="mr-1">mdi-check-circle-outline</v-icon>
                        <span class="stat-value ek-num text-success">{{ formatNumber(item.validCount || 0) }}</span>
                      </div>
                    </template>
                  </v-tooltip>
                  <v-divider vertical class="mx-1" length="12"></v-divider>
                  <v-tooltip text="Formatı hatalı ürünler" location="top">
                    <template v-slot:activator="{ props }">
                      <div v-bind="props" class="stat-item d-flex align-center px-2">
                        <v-icon size="14" color="warning" class="mr-1">mdi-alert-outline</v-icon>
                        <span class="stat-value ek-num text-warning">{{ formatNumber(item.invalidCount || 0) }}</span>
                      </div>
                    </template>
                  </v-tooltip>
                  <v-divider vertical class="mx-1" length="12"></v-divider>
                  <v-tooltip text="Sistemde zaten mevcut olanlar" location="top">
                    <template v-slot:activator="{ props }">
                      <div v-bind="props" class="stat-item d-flex align-center px-2">
                        <v-icon size="14" color="info" class="mr-1">mdi-content-copy</v-icon>
                        <span class="stat-value ek-num text-info">{{ formatNumber(item.duplicateCount || 0) }}</span>
                      </div>
                    </template>
                  </v-tooltip>
                  <v-divider vertical class="mx-1" length="12"></v-divider>
                  <v-tooltip text="Hata alanlar" location="top">
                    <template v-slot:activator="{ props }">
                      <div v-bind="props" class="stat-item d-flex align-center px-2">
                        <v-icon size="14" color="error" class="mr-1">mdi-close-circle-outline</v-icon>
                        <span class="stat-value ek-num text-error">{{ formatNumber(item.failedCount || 0) }}</span>
                      </div>
                    </template>
                  </v-tooltip>
                </div>
              </div>
            </td>
            <td>
              <div class="d-flex justify-end pr-1">
                <v-btn flat size="35" color="passiveColor" variant="outlined" class="premium-cube-btn"
                  @click="openDetailedReport(item)" aria-label="Aktarım detaylarını görüntüle"><v-icon size="x-large">mdi-eye-outline</v-icon></v-btn>
                <v-btn flat size="35" color="danger" variant="flat" :disabled="!isDeletable(item)"
                  class="premium-cube-btn ml-2" @click="openDeleteConfirm($event, 'single', item)"
                  aria-label="Aktarım kaydını sil"><v-icon
                    size="x-large">mdi-delete</v-icon></v-btn>
              </div>
            </td>
          </tr>
        </template>

        <template v-slot:header.actions>
          <div class="d-flex justify-end align-center fill-height">
            <v-btn v-if="validSelectedJobsCount > 0" flat size="30" color="error" variant="flat"
              @click="openDeleteConfirm($event, 'batch')" class="premium-cube-btn mr-2" aria-label="Seçili kayıtları sil"><v-icon
                size="large">mdi-delete</v-icon></v-btn>
          </div>
        </template>

        <template v-slot:bottom>
          <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
            @setPage="handlePageChange" v-model="pagination.page" class="ek-log-pagination" />
        </template>
      </v-data-table-server>

      <div v-else class="mobile-container pa-2 overflow-y-auto">
        <EkEmptyState v-if="!jobs.length" variant="no-results" title="Aktarım Kaydı Bulunamadı" message="Arama kriterlerinize uygun herhangi bir aktarım kaydı bulunamadı." />
        <v-card v-for="item in jobs" :key="item._id" class="mb-4 rounded-lg border" elevation="0">
          <div class="pa-3 ek-log-card-head d-flex align-center justify-space-between">
            <div class="d-flex align-center">
              <v-checkbox-btn :model-value="isJobSelected(item)" color="primary"
                @update:model-value="val => onJobSelectionUpdate(item, !!val)" density="compact"
                class="mr-2" aria-label="Aktarım kaydını seç"></v-checkbox-btn>
              <PlatformImageComponent :integrationCode="item.integrationCode" :width="80" :height="35" class="mr-4">
              </PlatformImageComponent>
            </div>
            <EkStatusChip :tone="statusTone(item.status)" :label="translateStatus(item.status)" />
          </div>

          <!-- GİZLİ DAVRANIŞ (BACKLOG.md): eski `workspaceColor` arka planı hiçbir temada
               tanımlı değildi (zaten `unset`); yenilemede kaldırıldı, kart zemini görünür. -->
          <v-card-text class="pa-3">
            <div class="d-flex justify-space-between align-center mb-4 pa-2 rounded-lg ek-log-summary">
              <div class="text-center flex-grow-1 ek-log-summary__divider">
                <div class="text-caption ek-muted">Toplam Ürün</div>
                <div class="font-weight-semibold ek-num ek-log-summary__value">{{ formatNumber(item.totalCount || 0) }}</div>
              </div>
              <div class="text-center flex-grow-1">
                <div class="text-caption ek-muted">Aktarılan Ürün</div>
                <div class="font-weight-semibold ek-num text-success ek-log-summary__value">{{ formatNumber(item.processedCount || 0) }}</div>
              </div>
            </div>

            <div class="d-flex align-center justify-center mb-4">
              <div class="data-group-capsule d-flex align-center px-2 py-1 rounded-pill border w-100 justify-space-around">
                <div class="stat-item d-flex align-center px-1"
                  @click="snackbarStore.addSnackbar({ text: 'Aktarılmaya aday ürünler', color: 'success', textColor: 'white' })">
                  <v-icon size="14" color="success" class="mr-1">mdi-check-circle-outline</v-icon>
                  <span class="stat-value ek-num text-success">{{ formatNumber(item.validCount || 0) }}</span>
                </div>
                <v-divider vertical length="12"></v-divider>
                <div class="stat-item d-flex align-center px-1"
                  @click="snackbarStore.addSnackbar({ text: 'Formatı hatalı ürünler', color: 'orange', textColor: 'white' })">
                  <v-icon size="14" color="warning" class="mr-1">mdi-alert-outline</v-icon>
                  <span class="stat-value ek-num text-warning">{{ formatNumber(item.invalidCount || 0) }}</span>
                </div>
                <v-divider vertical length="12"></v-divider>
                <div class="stat-item d-flex align-center px-1"
                  @click="snackbarStore.addSnackbar({ text: 'Sistemde zaten mevcut olanlar', color: 'info', textColor: 'white' })">
                  <v-icon size="14" color="info" class="mr-1">mdi-content-copy</v-icon>
                  <span class="stat-value ek-num text-info">{{ formatNumber(item.duplicateCount || 0) }}</span>
                </div>
                <v-divider vertical length="12"></v-divider>
                <div class="stat-item d-flex align-center px-1"
                  @click="snackbarStore.addSnackbar({ text: 'Hata alanlar', color: 'error', textColor: 'white' })">
                  <v-icon size="14" color="error" class="mr-1">mdi-close-circle-outline</v-icon>
                  <span class="stat-value ek-num text-error">{{ formatNumber(item.failedCount || 0) }}</span>
                </div>
              </div>
            </div>

            <div class="d-flex justify-space-between mb-3 pa-3 rounded-lg border ek-log-time-card">
              <div class="d-flex align-center">
                <v-icon size="18" color="content-muted" class="mr-2">mdi-clock-start</v-icon>
                <div class="d-flex flex-column">
                  <span class="ek-log-time-label">Başlangıç</span>
                  <span class="text-caption ek-num">{{ formatDateTime(item.startedAt) }}</span>
                </div>
              </div>
              <v-divider vertical class="mx-2"></v-divider>
              <div class="d-flex align-center">
                <div class="d-flex flex-column text-right mr-2">
                  <span class="ek-log-time-label">Bitiş</span>
                  <span class="text-caption ek-num">{{ item.completedAt ? formatDateTime(item.completedAt) : 'Devam...' }}</span>
                </div>
                <v-icon size="18" color="content-muted">mdi-flag-checkered</v-icon>
              </div>
            </div>

            <div class="d-flex justify-end align-center pa-0 ek-log-gap-2">
              <v-btn flat size="35" color="passiveColor" variant="outlined" class="ek-log-btn"
                @click="openDetailedReport(item)" aria-label="Aktarım detaylarını görüntüle">
                <v-icon size="x-large">mdi-eye-outline</v-icon>
              </v-btn>
              <v-btn flat size="35" color="danger" variant="flat" class="ek-log-btn"
                :disabled="!isDeletable(item)" @click="openDeleteConfirm($event, 'single', item)"
                aria-label="Aktarım kaydını sil">
                <v-icon size="x-large">mdi-delete</v-icon>
              </v-btn>
            </div>
          </v-card-text>
        </v-card>

        <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
          @setPage="handlePageChange" v-model="pagination.page" :static="true" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeMount, reactive, computed } from 'vue'
import useRestApi from '@/composables/restapi'
import LoadingComponent from '@/components/LoadingComponent.vue'
import PaginationComponent from '@/components/PaginationComponent.vue'
import DetailedImportLogReport from '@/components/logListView/DetailedImportLogReport.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue'
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import { formatDateTime, formatNumber } from '@/composables/format'
import type { StatusTone } from '@/design/status-map'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import PlatformImageComponent from '../platforms/PlatformImageComponent.vue'
const restApi = useRestApi()
const snackbarStore = useSnackbarStore()
const loadingComponentRef: any = ref(null)
const dialogAttach = ref(".importLogList")
const loading = ref(false)
const jobs = ref<any[]>([])
const selectedJobs = ref<any[]>([])
const searchJobId = ref("")
const sortBy = ref<any[]>([{ key: 'startedAt', order: 'desc' }])
const integrationStore = useIntegrationStore()
const mobileSortSelection = ref('startedAt-desc')
const sortOptions = [
  { title: 'Tarih (Yeniye Doğru)', value: 'startedAt-desc' },
  { title: 'Tarih (Eskiye Doğru)', value: 'startedAt-asc' },
  { title: 'Toplam Ürün (Azalan)', value: 'totalCount-desc' },
  { title: 'Toplam Ürün (Artan)', value: 'totalCount-asc' },
  { title: 'Aktarılan Ürün (Azalan)', value: 'processedCount-desc' },
  { title: 'Aktarılan Ürün (Artan)', value: 'processedCount-asc' },
]

const isDeletable = (item: any) => {
  const status = item?.status?.toUpperCase();
  return ['COMPLETED', 'FAILED'].includes(status);
}

const validSelectedJobsCount = computed(() => {
  return jobs.value.filter(j => selectedJobs.value.includes(j._id) && isDeletable(j)).length;
});

const reportInfo = reactive({ isOpen: false, jobId: null })
const openDetailedReport = (item: any) => { reportInfo.jobId = item.jobId; reportInfo.isOpen = true; }
const copyToClipboard = (text: string) => {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    snackbarStore.addSnackbar({ show: true, text: 'İşlem ID kopyalandı', color: 'success' });
  });
}

const isJobSelected = (item: any) => selectedJobs.value.includes(item._id)
const onJobSelectionUpdate = (item: any, val: boolean) => {
  if (val) { if (!selectedJobs.value.includes(item._id)) selectedJobs.value.push(item._id) }
  else { selectedJobs.value = selectedJobs.value.filter(id => id !== item._id) }
}

const confirmationDelete = reactive<any>({ isDialogOpen: false, activator: undefined, mode: 'single', job: null })
const pagination = reactive({ limit: 13, page: 1, totalNumberOfPages: 1, totalNumberOfRecords: 0 });

const headers: any = [
  { title: 'Başlangıç Tarihi', key: 'startedAt', sortable: true, align: 'center' },
  { title: 'Bitiş Tarihi', key: 'completedAt', sortable: true, align: 'center' },
  { title: 'Platform', key: 'platform', sortable: false, align: 'center' },
  { title: 'Durum', key: 'status', sortable: false, align: 'center' },
  { title: 'Ürün Dağılımı (Top. / Akt.)', key: 'processedCount', sortable: true, align: 'center' },
  { title: 'İstatistikler', key: 'stats', sortable: false, align: 'center' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
];

const openDeleteConfirm = (event: any, mode: 'single' | 'batch', job: any = null) => {
  confirmationDelete.activator = event.currentTarget; confirmationDelete.mode = mode;
  confirmationDelete.job = job; confirmationDelete.isDialogOpen = true;
}
const cancelDelete = () => { confirmationDelete.isDialogOpen = false; confirmationDelete.job = null; }

const confirmDelete = async () => {
  confirmationDelete.isDialogOpen = false;
  let ids = confirmationDelete.mode === 'single' ? [confirmationDelete.job._id] : jobs.value.filter(j => selectedJobs.value.includes(j._id) && isDeletable(j)).map(j => j._id);
  if (ids.length === 0) return;
  let guid = loadingComponentRef.value.info("Arşivleniyor...")
  try {
    const res = await restApi.post('IntegrationService/archiveImportJobs', { ids })
    if (res.success) {
      snackbarStore.addSnackbar({ show: true, text: 'Başarıyla arşivlendi', color: 'success' });
      selectedJobs.value = []; getJobs(true);
    }
  } finally { loadingComponentRef.value.remove(guid) }
}

const onSortUpdate = (newSortBy: any) => { sortBy.value = newSortBy; getJobs(true); }

const onMobileSortUpdate = (val: string) => {
  const [key, order] = val.split('-')
  sortBy.value = [{ key, order }]
  getJobs(true)
}

const handlePageChange = () => { getJobs(); };

const getJobs = async (reset: boolean = false) => {
  if (reset) { pagination.page = 1; if (reset === true) searchJobId.value = ""; }
  loading.value = true;
  let guid = loadingComponentRef.value.info("");
  try {
    if (searchJobId.value && searchJobId.value.trim() !== "") {
      const res = await restApi.post('IntegrationService/getImportJobByJobId', { jobId: searchJobId.value.trim() });
      if (res.success && res.data) {
        jobs.value = [res.data]; pagination.totalNumberOfPages = 1; pagination.totalNumberOfRecords = 1;
      } else { jobs.value = []; pagination.totalNumberOfPages = 0; pagination.totalNumberOfRecords = 0; }
    } else {
      const res = await restApi.post('IntegrationService/getImportJobs', {
        page: pagination.page,
        limit: pagination.limit,
        sortBy: sortBy.value[0]?.key,
        sortOrder: sortBy.value[0]?.order
      });
      if (res.success) {
        jobs.value = res.data;
        pagination.totalNumberOfPages = res.pagination?.totalNumberOfPages || 1;
        pagination.totalNumberOfRecords = res.pagination?.totalNumberOfRecords || 0;
      }
    }
  } finally { loadingComponentRef.value.remove(guid); loading.value = false; }
};

// Durum → EkStatusChip tonu (ADR-0015 Karar 3.3; renk ekranda SEÇİLMEZ).
const statusTone = (status: string): StatusTone => {
  const tones: Record<string, StatusTone> = { COMPLETED: 'success', FAILED: 'danger', CANCELLED: 'neutral', PROCESSING: 'info', READY_TO_SYNC: 'info', FETCHING: 'warning', WAITING_FOR_FETCH: 'neutral' };
  return tones[status?.toUpperCase()] || 'neutral';
};

const translateStatus = (status: string) => {
  const s = status?.toUpperCase();
  const translations: any = { WAITING_FOR_FETCH: 'Sırada', FETCHING: 'Ürünler Çekiliyor', READY_TO_SYNC: 'Analiz Ediliyor', PROCESSING: 'Ürünler Aktarılıyor', COMPLETED: 'Tamamlandı', FAILED: 'Hata', CANCELLED: 'İptal Edildi' };
  return translations[s] || status;
};

onMounted(() => { getJobs(); });
onBeforeMount(() => { pagination.page = 1; });
</script>

<style scoped>
.importLogList {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--ek-color-surface-muted);
}

.search-section {
  flex-shrink: 0;
  z-index: 10;
  max-width: 900px;
}

/* A11y (WCAG 1.4.3): bkz. ExportLogList.vue'daki AYNI gerekçe. */
.search-section :deep(.v-field:not(.v-field--focused) .v-field-label) {
  color: var(--ek-color-content-muted);
  opacity: 1;
}

.table-wrapper {
  flex-grow: 1;
  position: relative;
  min-height: 0;
}

.desktop-table {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex !important;
  flex-direction: column;
  border-top: 1px solid var(--ek-color-border-default);
  background-color: var(--ek-color-surface) !important;
}

:deep(.v-table__wrapper) {
  flex-grow: 1 !important;
  overflow-y: auto !important;
  overflow-x: auto !important;
}

.mobile-container {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: var(--ek-color-surface-muted);
  overflow-y: auto;
}

:deep(.v-data-table-header__content) {
  font-weight: var(--ek-font-weight-semibold) !important;
  justify-content: center !important;
}

.custom-menu-item {
  min-height: 30px !important;
  height: 35px !important;
  padding: 0 var(--ek-space-3) !important;
  border-bottom: 1px solid var(--ek-color-border-default);
}

.compact-title {
  color: var(--ek-color-passive-color);
  font-size: var(--ek-font-size-xs) !important;
  font-weight: var(--ek-font-weight-semibold);
  line-height: 1 !important;
}

.customTextField :deep(.v-select__selection-text) {
  color: var(--ek-color-passive-color) !important;
  font-weight: var(--ek-font-weight-bold);
}

.customTextField :deep(.v-prepend-inner .v-icon) {
  color: var(--ek-color-passive-color) !important;
  opacity: 1;
}

@media (max-width: 600px) {
  .desktop-table {
    display: none !important;
  }
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-log-gap-1 {
  gap: var(--ek-space-1);
}

.ek-log-gap-2 {
  gap: var(--ek-space-2);
}

.ek-log-btn {
  border: 1px solid var(--ek-color-border-default);
}

.ek-log-pagination {
  position: relative !important;
  flex-shrink: 0;
  border-top: 1px solid var(--ek-color-border-default);
}

.ek-log-processed {
  background: var(--ek-color-success-subtle);
  border-radius: var(--ek-radius-sm);
}

.ek-log-processed__value {
  color: var(--ek-color-success);
}

.ek-log-card-head {
  background: var(--ek-color-surface);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.ek-log-summary {
  background: var(--ek-color-surface-muted);
}

.ek-log-summary__divider {
  border-right: 1px solid var(--ek-color-border-default);
}

.ek-log-summary__value {
  font-size: var(--ek-font-size-md);
}

.ek-log-time-card {
  background: var(--ek-color-surface);
}

.ek-log-time-label {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.data-group-capsule {
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default) !important;
  height: 28px;
}

.stat-item {
  cursor: help;
  transition: opacity var(--ek-duration-base) var(--ek-easing-standard);
}

.stat-item:hover {
  opacity: 0.7;
}

.stat-value {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
}

:deep(.v-divider--vertical) {
  border-color: var(--ek-color-border-default) !important;
}
</style>
