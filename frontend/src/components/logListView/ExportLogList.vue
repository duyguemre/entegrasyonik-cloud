<template>
  <div class="exportLogList">
    <ActionDialogComponent v-model="reportInfo.isOpen" title="Pazaryeri Gönderim Detaylı Raporu"
      subtitle="İşlem Günlüğü ve Akış Analizi" icon="mdi-rocket-launch" color="primary" maxWidth="1200"
      :showFooter="false" attach=".exportLogList">
      <keep-alive>
        <DetailedExportLogReport :jobId="reportInfo.jobId || ''" @close="reportInfo.isOpen = false" />
      </keep-alive>
    </ActionDialogComponent>
    <ConfirmationDialogComponent v-model="confirmationDelete.isDialogOpen"
      :title="confirmationDelete.mode === 'single' ? 'KAYIT SİLİNECEK' : 'SEÇİLENLER SİLİNECEK'"
      :message="confirmationDelete.mode === 'single' ? 'Bu işlem kaydını silmek istediğinizden emin misiniz?' : `${validSelectedJobsCount} adet kayıt silinecek. Emin misiniz?`"
      icon="mdi-trash-can-outline" color="error" confirmText="Sil" cancelText="İptal" attach=".exportLogList"
      @confirm="confirmDelete()" @cancel="cancelDelete()" />
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <EkListScreen channel-key="integrationCode"
      label="Gönderim işlemleri tablosu"
      noun="kayıt"
      row-key="_id"
      label-key="title"
      :columns="columns"
      :rows="jobs"
      :loading="loading"
      :error="loadError"
      error-title="Gönderim kayıtları yüklenemedi"
      :search="searchJobId"
      search-placeholder="Ürün Adı, Barkod, Stok Kodu veya Platform Ara"
      :chips="activeChips"
      :filter-count="panelFilterCount"
      :filter-collapsed="filterCollapsed"
      selectable
      v-model:selected="selectedJobs"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Gönderim kaydı bulunamadı"
      empty-text="Pazaryerlerine gönderilen ürün işlemleri burada listelenir."
      empty-icon="mdi-rocket-launch-outline"
      filtered-empty-title="Gönderim kaydı bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir gönderim kaydı bulunamadı."
      refresh-label="Listeyi yenile"
      @update:search="(v) => (searchJobId = v)"
      @search-submit="getJobs(true)"
      @update:filter-collapsed="(v) => (filterCollapsed = v)"
      @update:sort="onGridSort"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
      @filter-submit="advancedSearchJobs(true)"
      @filter-reset="resetSearchExportLogForm()"
      @remove-chip="removeChip"
      @clear-filters="resetSearchExportLogForm()"
      @refresh="handlePageChange()"
    >
      <template #filters>
        <EkDateField v-model="searchExportLogForm.data.startDate" label="Başlangıç tarihi" :max="searchExportLogForm.data.endDate" />
        <EkDateField v-model="searchExportLogForm.data.endDate" label="Bitiş tarihi" :min="searchExportLogForm.data.startDate" />
        <EkSelect kind="channel" v-model="searchExportLogForm.data.integrationCode" :items="channelOptionsFrom(integrationStore.getClientPlatforms())"
          label="Kanal" clearable multiple />
        <v-select v-model="searchExportLogForm.data.mode" :items="processMenuItems" label="İşlem tipi" item-value="id" clearable />
        <v-text-field v-model="searchExportLogForm.data.title" label="Ürün adı" clearable />
        <v-text-field v-model="searchExportLogForm.data.barcode" label="Barkod" clearable />
        <v-text-field v-model="searchExportLogForm.data.stockcode" label="Stok kodu" clearable />
        <EkSelect v-model="searchExportLogForm.data.statuses" :items="statusOptions" item-title="title" item-value="id"
          label="İşlem durumu" clearable multiple />
        <CategorySelectBoxComponent v-model="searchExportLogForm.data.category" :withAll="false" noInit />
        <BrandSelectBoxComponent v-model="searchExportLogForm.data.brand" :withAll="false" noInit />
        <v-select v-for="(choice, index) in choicesStore.choices" :key="index"
          v-model="searchExportLogForm.data.selectedChoices[choice._id || index]"
          :items="choice.values || choice.options" item-title="title" item-value="_id" :label="choice.title" clearable />
      </template>

      <template #bulk-actions>
        <EkButton size="sm" icon="mdi-trash-can-outline" class="ek-log-danger" :disabled="validSelectedJobsCount === 0"
          aria-label="Seçili kayıtları sil" @click="openDeleteConfirm($event, 'batch')">
          Sil ({{ validSelectedJobsCount }})
        </EkButton>
      </template>

      <template #cell-title="{ row }">
        <span class="ek-log-product">
          <span class="ek-log-thumb">
            <v-img :src="row.image" cover :alt="''">
              <template #placeholder><v-icon icon="mdi-image-outline" size="20" aria-hidden="true" /></template>
            </v-img>
          </span>
          <span class="ek-log-product__text">
            <span class="ek-log-product__title">{{ row.title }}</span>
            <span class="ek-log-product__meta">
              <span class="ek-num">{{ row.barcode }}</span>
              <template v-if="row.stockcode != undefined"> · <span class="ek-num">{{ row.stockcode }}</span></template>
              <template v-for="choice in row.choices || []" :key="choice._id"> · {{ choice.choiceTitle }} {{ choice.choiceValueTitle }}</template>
            </span>
          </span>
        </span>
      </template>
      <template #cell-channel="{ row }"><EkChannelDot :code="row.integrationCode" /></template>
      <template #cell-mode="{ row }">{{ PLATFORM_PROCESS_LABELS[row.mode as PLATFORM_PROCESS] || row.mode || '—' }}</template>
      <template #cell-price="{ row }">
        <span class="ek-num">{{ row.price ? formatMoney(row.price) : '—' }}</span>
      </template>
      <template #cell-stock="{ row }"><span class="ek-num">{{ row.stock != undefined ? formatNumber(row.stock) : '—' }}</span></template>
      <template #cell-status="{ row }">
        <EkStatusChip :tone="statusTone(row.status)" :label="translateStatus(row.status)" :dot="!isDeletable(row)" />
      </template>
      <template #cell-createdAt="{ row }"><span class="ek-num">{{ formatDateTime(row.createdAt) }}</span></template>
      <template #cell-completedAt="{ row }">
        <span v-if="row.completedAt" class="ek-num">{{ formatDateTime(row.completedAt) }}</span>
        <span v-else class="ek-muted">Devam ediyor</span>
      </template>
      <template #cell-actions="{ row }">
        <EkRowActions :label="`${row.jobId ?? 'Gönderim'} işlemleri`" :items="[
          { key: 'view', action: 'view', label: 'Gönderim detaylarını görüntüle', onClick: () => openDetailedReport(row) },
          { key: 'delete', action: 'delete', label: 'Gönderim kaydını sil', disabled: !isDeletable(row), onClick: () => openDeleteConfirm(undefined, 'single', row) },
        ]" />
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import EkSelect from '@/components/ds/EkSelect.vue'
import { channelOptionsFrom } from '@/components/ds/selectOptions'
import EkRowActions from '@/components/ds/EkRowActions.vue'
import { ref, onMounted, reactive, computed } from 'vue'
import useRestApi from '@/composables/restapi'
import LoadingComponent from '@/components/LoadingComponent.vue'
import DetailedExportLogReport from '@/components/logListView/DetailedExportLogReport.vue'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useChoicesStore } from '@/stores/choicesStore'
import CategorySelectBoxComponent from '@/components/common/CategorySelectBoxComponent.vue'
import BrandSelectBoxComponent from '@/components/common/BrandSelectBoxComponent.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue'
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue'
import EkListScreen from '@/components/ds/templates/EkListScreen.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkChannelDot from '@/components/ds/EkChannelDot.vue'
import EkDateField from '@/components/ds/EkDateField.vue'
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue'
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue'
import { isRequestError } from '@/components/ds/listStandard'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/composables/format'
import type { StatusTone } from '@/design/status-map'
import { PLATFORM_PROCESS, PLATFORM_PROCESS_LABELS } from '@/types/PlatformProcess';
const restApi = useRestApi()
const snackbarStore = useSnackbarStore()
const integrationStore = useIntegrationStore()
const choicesStore = useChoicesStore()

const loadingComponentRef: any = ref(null)
const dialogAttach = ref(".exportLogList")
const loading = ref(false)
const jobs = ref<any[]>([])
const selectedJobs = ref<any[]>([])
const searchJobId = ref("")
const sortBy = ref<any[]>([{ key: 'createdAt', order: 'desc' }])

const isAdvancedSearchActive = ref(false);

const searchExportLogForm = ref({
  data: {
    startDate: undefined as any,
    endDate: undefined as any,
    title: undefined,
    barcode: undefined,
    stockcode: undefined,
    selectedChoices: {} as Record<string, any>,
    category: undefined,
    brand: undefined,
    integrationCode: [] as string[],
    mode: undefined,
    statuses: []
  },
  form: { menu: false, valid: false }
});


const processMenuItems = computed(() => {
  return Object.values(PLATFORM_PROCESS).map(mode => ({
    id: mode,
    title: PLATFORM_PROCESS_LABELS[mode]
  }));
});

const statusOptions = ref([
  { id: 'QUEUED', title: 'Kuyrukta' },
  { id: 'PREPARING', title: 'Hazırlanıyor' },
  { id: 'PENDING', title: 'Gönderiliyor' },
  { id: 'SENT', title: 'Gönderim Sorgulanıyor' },
  { id: 'WAITING', title: 'Onay Bekleniyor' },
  { id: 'COMPLETED', title: 'Tamamlandı' },
  { id: 'FAILED', title: 'Hata Oluştu' }
]);

// DS-v2 liste standardı. Sıralama SUNUCUDA (getExportJobs / advancedSearchExportJobs `sortBy`/`sortOrder`).
const columns: EkGridColumn[] = [
  { key: 'title', label: 'Ürün', sortable: true },
  { key: 'channel', label: 'Kanal' },
  { key: 'mode', label: 'İşlem' },
  { key: 'price', label: 'Fiyat', type: 'num', sortable: true },
  { key: 'stock', label: 'Stok', type: 'num' },
  { key: 'status', label: 'Durum' },
  { key: 'createdAt', label: 'Başlangıç', sortable: true },
  { key: 'completedAt', label: 'Bitiş' },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
];

const resetSearchExportLogForm = () => {
  searchExportLogForm.value.data = {
    startDate: undefined, endDate: undefined, title: undefined, barcode: undefined,
    stockcode: undefined, selectedChoices: {}, category: undefined, brand: undefined,
    integrationCode: [], mode: undefined, statuses: []
  };
  isAdvancedSearchActive.value = false; searchJobId.value = ""; getJobs(true);
};

const getJobs = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
  isAdvancedSearchActive.value = false;
  applied.value = { search: searchJobId.value.trim(), advanced: false, data: JSON.parse(JSON.stringify(searchExportLogForm.value.data)) };
  try {
    const payload: any = {
      page: pagination.page, limit: pagination.limit,
      sortBy: sortBy.value[0]?.key, sortOrder: sortBy.value[0]?.order,
      globalSearch: searchJobId.value.trim() || undefined,
      startDate: searchExportLogForm.value.data.startDate,
      endDate: searchExportLogForm.value.data.endDate,
    };
    const res = await restApi.post('IntegrationService/getExportJobs', payload);
    if (isRequestError(res)) {
      loadError.value = true;
    } else if (res?.success) {
      jobs.value = res.data;
      pagination.totalNumberOfPages = res.pagination?.totalNumberOfPages || 1;
      pagination.totalNumberOfRecords = res.pagination?.totalNumberOfRecords || 0;
    }
  } finally { loading.value = false; }
};

const advancedSearchJobs = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
  isAdvancedSearchActive.value = true;
  searchExportLogForm.value.form.menu = false;
  applied.value = { search: '', advanced: true, data: JSON.parse(JSON.stringify(searchExportLogForm.value.data)) };
  try {
    const payload: any = {
      page: pagination.page, limit: pagination.limit,
      sortBy: sortBy.value[0]?.key, sortOrder: sortBy.value[0]?.order,
      ...searchExportLogForm.value.data
    };
    const res = await restApi.post('IntegrationService/advancedSearchExportJobs', payload);
    if (isRequestError(res)) {
      loadError.value = true;
    } else if (res?.success) {
      jobs.value = res.data;
      pagination.totalNumberOfPages = res.pagination?.totalNumberOfPages || 1;
      pagination.totalNumberOfRecords = res.pagination?.totalNumberOfRecords || 0;
    }
  } finally { loading.value = false; }
};

const onSortUpdate = (newSortBy: any) => {
  sortBy.value = newSortBy;
  handlePageChange();
}

const handlePageChange = () => {
  if (isAdvancedSearchActive.value) {
    advancedSearchJobs();
  } else {
    getJobs();
  }
};


const pagination = reactive({ limit: 25, page: 1, totalNumberOfPages: 1, totalNumberOfRecords: 0 });
const reportInfo = reactive({ isOpen: false, jobId: null })
const openDetailedReport = (item: any) => { reportInfo.jobId = item._id; reportInfo.isOpen = true; }

// Durum → EkStatusChip tonu (ADR-0015 Karar 3.3; renk ekranda SEÇİLMEZ). Eski canlı
// palet (hex) kaldırıldı; bilinmeyen/ara durumlar (QUEUED, PREPARING) nötr görünür.
const statusTone = (status: string): StatusTone => {
  const tones: Record<string, StatusTone> = { COMPLETED: 'success', FAILED: 'danger', CANCELLED: 'neutral', PENDING: 'info', SENT: 'info', WAITING: 'warning' };
  return tones[status?.toUpperCase()] || 'neutral';
};

const translateStatus = (status: string) => {
  return statusOptions.value.find(x => x.id === status)?.title || status;

  /*   const translations: any = { PREPARING: 'Hazırlanıyor', PENDING: 'Kuyrukta', SENT: 'İletildi', WAITING: 'Sorgulanıyor', COMPLETED: 'Başarılı', FAILED: 'Hata' };
    return translations[status?.toUpperCase()] || status; */
};


const openDeleteConfirm = (event: any, mode: 'single' | 'batch', item: any = null) => {
  confirmationDelete.mode = mode;
  if (mode === 'single') {
    confirmationDelete.job = item;
  } else {
    confirmationDelete.job = null;
  }

  // Menünün açılacağı konumu belirlemek için activator'ı set ediyoruz
  confirmationDelete.activator = event.currentTarget;
  confirmationDelete.isDialogOpen = true;
};

const isDeletable = (item: any) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(item?.status?.toUpperCase());
const validSelectedJobsCount = computed(() => jobs.value.filter(j => selectedJobs.value.includes(j._id) && isDeletable(j)).length);
const confirmationDelete = reactive<any>({ isDialogOpen: false, activator: undefined, mode: 'single', job: null })
const cancelDelete = () => { confirmationDelete.isDialogOpen = false; }
const confirmDelete = async () => { /* Arşivleme kodu buraya */ }

// --- DS-v2 liste standardı yardımcıları ---
const loadError = ref(false)
const filterCollapsed = ref(true)
const applied = ref<{ search: string; advanced: boolean; data: any }>({ search: '', advanced: false, data: {} })

const gridSort = computed<EkGridSort>(() => {
  const current = sortBy.value[0]
  return current?.key ? { key: current.key, dir: current.order === 'asc' ? 'asc' : 'desc' } : null
})

function onGridSort(sort: EkGridSort) {
  onSortUpdate(sort ? [{ key: sort.key, order: sort.dir }] : [{ key: 'createdAt', order: 'desc' }])
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

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const { search, advanced, data: d } = applied.value
  const chips: EkActiveFilterChip[] = []
  if (search) chips.push({ key: 'search', label: 'Arama', value: search })
  if (d.startDate) chips.push({ key: 'startDate', label: 'Başlangıç', value: formatDate(d.startDate) })
  if (d.endDate) chips.push({ key: 'endDate', label: 'Bitiş', value: formatDate(d.endDate) })
  if (!advanced) return chips
  if (d.integrationCode?.length) chips.push({ key: 'integrationCode', label: 'Kanal', value: d.integrationCode.map((c: string) => integrationStore.getClientPlatforms().find((p: any) => p.code === c)?.title ?? c).join(', ') })
  if (d.mode) chips.push({ key: 'mode', label: 'İşlem', value: PLATFORM_PROCESS_LABELS[d.mode as PLATFORM_PROCESS] ?? d.mode })
  if (d.title) chips.push({ key: 'title', label: 'Ürün adı', value: d.title })
  if (d.barcode) chips.push({ key: 'barcode', label: 'Barkod', value: d.barcode })
  if (d.stockcode) chips.push({ key: 'stockcode', label: 'Stok kodu', value: d.stockcode })
  if (d.statuses?.length) chips.push({ key: 'statuses', label: 'Durum', value: d.statuses.map((id: string) => translateStatus(id)).join(', ') })
  if (d.category) chips.push({ key: 'category', label: 'Kategori', value: 'Seçili' })
  if (d.brand) chips.push({ key: 'brand', label: 'Marka', value: 'Seçili' })
  const choiceCount = Object.values(d.selectedChoices || {}).filter(Boolean).length
  if (choiceCount) chips.push({ key: 'selectedChoices', label: 'Seçenek', value: `${choiceCount} seçili` })
  return chips
})

const panelFilterCount = computed(() => activeChips.value.filter(c => c.key !== 'search').length)

function removeChip(key: string) {
  const d: any = searchExportLogForm.value.data
  if (key === 'search') searchJobId.value = ''
  else if (key === 'integrationCode' || key === 'statuses') d[key] = []
  else if (key === 'selectedChoices') d.selectedChoices = {}
  else d[key] = undefined
  pagination.page = 1
  handlePageChange()
}

onMounted(() => getJobs(true));
</script>

<style scoped>
.exportLogList {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@media (max-width: 767px) {
  .exportLogList {
    overflow-y: auto;
  }
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-log-product {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  max-width: 360px;
}

.ek-log-thumb {
  flex: none;
  width: 40px;
  height: 40px;
  overflow: hidden;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-subtle);
}

.ek-log-product__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ek-log-product__title {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

.ek-log-product__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-log-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}

.ek-log-danger {
  color: var(--ek-color-error);
}
</style>
