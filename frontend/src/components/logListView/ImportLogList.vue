<template>
  <div class="importLogList">
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

    <EkListScreen
      label="Aktarım işlemleri tablosu"
      noun="kayıt"
      row-key="_id"
      label-key="jobId"
      :columns="columns"
      :rows="jobs"
      :loading="loading"
      :error="loadError"
      error-title="Aktarım kayıtları yüklenemedi"
      :search="searchJobId"
      search-placeholder="İşlem No ile Ara"
      :chips="activeChips"
      selectable
      v-model:selected="selectedJobs"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Aktarım kaydı bulunamadı"
      empty-text="Pazaryerlerinden ürün çekim işlemleri burada listelenir."
      empty-icon="mdi-cloud-download-outline"
      filtered-empty-title="Aktarım kaydı bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir aktarım kaydı bulunamadı."
      refresh-label="Listeyi yenile"
      @update:search="(v) => (searchJobId = v)"
      @search-submit="searchJobId.trim() ? getJobs() : getJobs(true)"
      @update:sort="onGridSort"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
      @remove-chip="() => getJobs(true)"
      @clear-filters="() => getJobs(true)"
      @refresh="getJobs(true)"
    >
      <template #bulk-actions>
        <EkButton size="sm" icon="mdi-delete" class="ek-log-danger" :disabled="validSelectedJobsCount === 0"
          aria-label="Seçili kayıtları sil" @click="openDeleteConfirm($event, 'batch')">
          Sil ({{ validSelectedJobsCount }})
        </EkButton>
      </template>

      <template #cell-jobId="{ row }">
        <button type="button" class="ek-log-jobid ek-num" :title="'İşlem numarasını kopyala'" :aria-label="`${row.jobId} — işlem numarasını kopyala`" @click="copyToClipboard(row.jobId)">
          {{ row.jobId || '—' }}
        </button>
      </template>
      <template #cell-channel="{ row }"><EkChannelDot :code="row.integrationCode" /></template>
      <template #cell-status="{ row }">
        <EkStatusChip :tone="statusTone(row.status)" :label="translateStatus(row.status)" />
      </template>
      <template #cell-startedAt="{ row }"><span class="ek-num">{{ formatDateTime(row.startedAt) }}</span></template>
      <template #cell-completedAt="{ row }">
        <span v-if="row.completedAt" class="ek-num">{{ formatDateTime(row.completedAt) }}</span>
        <span v-else class="ek-muted">Devam ediyor</span>
      </template>
      <template #cell-totalCount="{ row }"><span class="ek-num">{{ formatNumber(row.totalCount || 0) }}</span></template>
      <template #cell-processedCount="{ row }"><span class="ek-num">{{ formatNumber(row.processedCount || 0) }}</span></template>
      <template #cell-stats="{ row }">
        <span class="ek-log-stats">
          <span class="ek-log-stat is-success" title="Aktarılmaya aday ürünler">
            <v-icon size="14" icon="mdi-check-circle-outline" aria-hidden="true" /><span class="ek-sr-only">Aktarılmaya aday:</span>
            <span class="ek-num">{{ formatNumber(row.validCount || 0) }}</span>
          </span>
          <span class="ek-log-stat is-warning" title="Formatı hatalı ürünler">
            <v-icon size="14" icon="mdi-alert-outline" aria-hidden="true" /><span class="ek-sr-only">Formatı hatalı:</span>
            <span class="ek-num">{{ formatNumber(row.invalidCount || 0) }}</span>
          </span>
          <span class="ek-log-stat is-info" title="Sistemde zaten mevcut olanlar">
            <v-icon size="14" icon="mdi-content-copy" aria-hidden="true" /><span class="ek-sr-only">Zaten mevcut:</span>
            <span class="ek-num">{{ formatNumber(row.duplicateCount || 0) }}</span>
          </span>
          <span class="ek-log-stat is-error" title="Hata alanlar">
            <v-icon size="14" icon="mdi-close-circle-outline" aria-hidden="true" /><span class="ek-sr-only">Hata alan:</span>
            <span class="ek-num">{{ formatNumber(row.failedCount || 0) }}</span>
          </span>
        </span>
      </template>
      <template #cell-actions="{ row }">
        <span class="ek-log-actions">
          <EkButton tone="ghost" size="sm" icon="mdi-eye-outline" icon-only aria-label="Aktarım detaylarını görüntüle" @click="openDetailedReport(row)" />
          <EkButton tone="ghost" size="sm" icon="mdi-delete" icon-only class="ek-log-danger" :disabled="!isDeletable(row)"
            aria-label="Aktarım kaydını sil" @click="openDeleteConfirm($event, 'single', row)" />
        </span>
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeMount, reactive, computed } from 'vue'
import useRestApi from '@/composables/restapi'
import LoadingComponent from '@/components/LoadingComponent.vue'
import DetailedImportLogReport from '@/components/logListView/DetailedImportLogReport.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue'
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue'
import EkListScreen from '@/components/ds/templates/EkListScreen.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkChannelDot from '@/components/ds/EkChannelDot.vue'
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue'
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue'
import { isRequestError } from '@/components/ds/listStandard'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import { formatDateTime, formatNumber } from '@/composables/format'
import type { StatusTone } from '@/design/status-map'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useIntegrationStore } from '@/stores/integrationStore'
const restApi = useRestApi()
const snackbarStore = useSnackbarStore()
const loadingComponentRef: any = ref(null)
const dialogAttach = ref(".importLogList")
const loading = ref(false)
const jobs = ref<any[]>([])
const selectedJobs = ref<Array<string | number>>([])
const searchJobId = ref("")
const sortBy = ref<any[]>([{ key: 'startedAt', order: 'desc' }])
const integrationStore = useIntegrationStore()

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


const confirmationDelete = reactive<any>({ isDialogOpen: false, activator: undefined, mode: 'single', job: null })
const pagination = reactive({ limit: 25, page: 1, totalNumberOfPages: 1, totalNumberOfRecords: 0 });

// DS-v2 liste standardı. Sıralama SUNUCUDA (getImportJobs `sortBy`/`sortOrder`).
const columns: EkGridColumn[] = [
  { key: 'jobId', label: 'İşlem no' },
  { key: 'channel', label: 'Kanal' },
  { key: 'status', label: 'Durum' },
  { key: 'startedAt', label: 'Başlangıç', sortable: true },
  { key: 'completedAt', label: 'Bitiş', sortable: true },
  { key: 'totalCount', label: 'Toplam', type: 'num', sortable: true },
  { key: 'processedCount', label: 'Aktarılan', type: 'num', sortable: true },
  { key: 'stats', label: 'Dağılım' },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
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


const handlePageChange = () => { getJobs(); };

const getJobs = async (reset: boolean = false) => {
  if (reset) { pagination.page = 1; if (reset === true) searchJobId.value = ""; }
  loading.value = true;
  loadError.value = false;
  appliedSearch.value = searchJobId.value.trim();
  try {
    if (searchJobId.value && searchJobId.value.trim() !== "") {
      const res = await restApi.post('IntegrationService/getImportJobByJobId', { jobId: searchJobId.value.trim() });
      if (isRequestError(res)) {
        loadError.value = true;
      } else if (res?.success && res.data) {
        jobs.value = [res.data]; pagination.totalNumberOfPages = 1; pagination.totalNumberOfRecords = 1;
      } else { jobs.value = []; pagination.totalNumberOfPages = 0; pagination.totalNumberOfRecords = 0; }
    } else {
      const res = await restApi.post('IntegrationService/getImportJobs', {
        page: pagination.page,
        limit: pagination.limit,
        sortBy: sortBy.value[0]?.key,
        sortOrder: sortBy.value[0]?.order
      });
      if (isRequestError(res)) {
        loadError.value = true;
      } else if (res?.success) {
        jobs.value = res.data;
        pagination.totalNumberOfPages = res.pagination?.totalNumberOfPages || 1;
        pagination.totalNumberOfRecords = res.pagination?.totalNumberOfRecords || 0;
      }
    }
  } finally { loading.value = false; }
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

// --- DS-v2 liste standardı yardımcıları ---
const loadError = ref(false)
const appliedSearch = ref('')
const activeChips = computed<EkActiveFilterChip[]>(() => (appliedSearch.value ? [{ key: 'search', label: 'İşlem no', value: appliedSearch.value }] : []))

const gridSort = computed<EkGridSort>(() => {
  const current = sortBy.value[0]
  return current?.key ? { key: current.key, dir: current.order === 'asc' ? 'asc' : 'desc' } : null
})

function onGridSort(sort: EkGridSort) {
  onSortUpdate(sort ? [{ key: sort.key, order: sort.dir }] : [{ key: 'startedAt', order: 'desc' }])
}

function onPageChange(page: number) {
  pagination.page = page
  handlePageChange()
}

function onPageSizeChange(size: number) {
  pagination.limit = size
  pagination.page = 1
  handlePageChange()
}

onMounted(() => { getJobs(); });
onBeforeMount(() => { pagination.page = 1; });
</script>

<style scoped>
.importLogList {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 767px) {
  .importLogList {
    overflow-y: auto;
  }
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-log-jobid {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ek-color-action);
  font: inherit;
  font-weight: var(--ek-font-weight-semibold);
  cursor: copy;
}

.ek-log-jobid:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
  border-radius: var(--ek-radius-sm);
}

.ek-log-stats {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-3);
  height: 24px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
}

.ek-log-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-log-stat.is-success { color: var(--ek-color-success-emphasis); }
.ek-log-stat.is-warning { color: var(--ek-color-warning-emphasis); }
.ek-log-stat.is-info { color: var(--ek-color-info-emphasis); }
.ek-log-stat.is-error { color: var(--ek-color-error-emphasis); }

.ek-log-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}

.ek-log-danger {
  color: var(--ek-color-error);
}
</style>
