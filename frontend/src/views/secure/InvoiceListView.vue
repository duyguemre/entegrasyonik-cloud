<template>
  <div class="invoiceListView">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef" />

    <EkConfirmDialog
      v-model="actionDialog.show"
      :title="actionDialog.title"
      :description="actionDialog.message"
      confirm-label="Sil"
      danger
      @confirm="actionDialog.onConfirm"
      @cancel="actionDialog.show = false"
    />

    <InvoiceDetailComponent v-model="detailDialog.show" :invoice="selectedInvoiceForDetail" />
    <CreateInvoiceComponent v-model="createDialog" @saved="getInvoices(true)" />

    <EkListScreen
      title="Faturalar"
      description="Sipariş ve manuel faturalarınızı buradan yönetin."
      label="Faturalar tablosu"
      noun="fatura"
      row-key="_id"
      label-key="invoiceNumber"
      :columns="columns"
      :rows="invoices"
      :loading="loading"
      :error="loadError"
      error-title="Faturalar yüklenemedi"
      :search="searchInvoiceForm.search"
      search-placeholder="Fatura No, Sipariş No veya Pazar Yeri Kodu Filtrele"
      :chips="activeChips"
      :filter-count="panelFilterCount"
      selectable
      v-model:selected="selectedInvoices"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Fatura Bulunamadı"
      empty-text="Kesilen ve manuel eklenen faturalar burada listelenir."
      empty-icon="mdi-receipt-text-outline"
      filtered-empty-title="Fatura Bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir fatura kaydı bulunamadı."
      @update:search="onSearchInput"
      @update:sort="onGridSort"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
      @filter-submit="getInvoices(true)"
      @filter-reset="clearFilters"
      @remove-chip="removeChip"
      @clear-filters="clearFilters"
      @refresh="getInvoices(true)"
    >
      <template #header-actions>
        <EkButton icon="mdi-plus" @click="createDialog = true">Yeni fatura ekle</EkButton>
      </template>

      <template #filters>
        <v-select v-model="searchInvoiceForm.filters.status" :items="STATUS_ITEMS"
          label="Fatura durumu" multiple chips closable-chips clearable item-title="title" item-value="value" />
        <v-select v-model="searchInvoiceForm.filters.type" :items="TYPE_ITEMS"
          clearable item-title="title" item-value="value" label="Belge tipi" />
      </template>

      <template #bulk-actions>
        <EkButton size="sm" icon="mdi-delete-sweep-outline" class="ek-bulk-danger" @click="triggerBulkDelete">
          Toplu sil ({{ selectedInvoices.length }})
        </EkButton>
      </template>

      <template #cell-invoiceNumber="{ row }">{{ row.invoiceNumber || '—' }}</template>
      <template #cell-order="{ row }"><span class="ek-num">{{ row.externalOrderId || row.order?.orderNumber || '—' }}</span></template>
      <template #cell-channel="{ row }">
        <EkChannelDot v-if="row.integrationCode" :code="row.integrationCode" />
        <span v-else class="ek-muted">Manuel</span>
      </template>
      <template #cell-customer="{ row }">
        {{ [row.customer?.firstName, row.customer?.lastName].filter(Boolean).join(' ') || 'Bilinmiyor' }}
      </template>
      <template #cell-documentType="{ row }">
        <EkStatusChip :tone="row.documentType === 'E_FATURA' ? 'info' : 'neutral'" :label="row.documentType === 'E_FATURA' ? 'e-Fatura' : 'e-Arşiv'" />
        <span class="ek-muted ek-invoice-kind">{{ row.type === 'SALES' ? 'Satış' : row.type === 'RETURN' ? 'İade' : 'Diğer' }}</span>
      </template>
      <template #cell-issueDate="{ row }"><span class="ek-num">{{ formatDateTime(row.issueDate || row.createdAt) }}</span></template>
      <template #cell-totalAmount="{ row }"><span class="ek-num">{{ formatMoney(row.totalAmount) }}</span></template>
      <template #cell-status="{ row }">
        <EkStatusChip :tone="statusEntry(row.status).tone" :label="$t(statusEntry(row.status).labelKey)" />
        <span v-if="row.invoiceMethod" class="ek-muted ek-invoice-kind">{{ INVOICE_METHOD_LABELS[row.invoiceMethod as InvoiceMethodEnum] || row.invoiceMethod }}</span>
      </template>
      <template #cell-actions="{ row }">
        <span class="ek-row-actions">
          <EkButton tone="ghost" size="sm" icon="mdi-eye" icon-only aria-label="Fatura detaylarını görüntüle" @click="openDetailedReport(row)" />
          <EkButton tone="ghost" size="sm" icon="mdi-printer" icon-only :disabled="!row.pdfUrl" aria-label="Faturayı görüntüle/yazdır" @click="openPdf(row)" />
          <EkButton tone="ghost" size="sm" icon="mdi-delete-sweep-outline" icon-only aria-label="Faturayı sil" @click="triggerDelete(row)" />
        </span>
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';
import { formatMoney, formatDateTime } from '@/composables/format';
import { INVOICE_STATUS_TONE } from '@/design/status-map';

import LoadingComponent from '@/components/LoadingComponent.vue';
import InvoiceDetailComponent from '@/components/invoice/InvoiceDetailComponent.vue';
import CreateInvoiceComponent from '@/components/invoice/CreateInvoiceComponent.vue';
import EkListScreen from '@/components/ds/templates/EkListScreen.vue';
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue';
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue';
import EkButton from '@/components/ds/EkButton.vue';
import EkChannelDot from '@/components/ds/EkChannelDot.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkConfirmDialog from '@/components/ds/EkConfirmDialog.vue';
import { isRequestError } from '@/components/ds/listStandard';
import { InvoiceStatusEnum, INVOICE_STATUS_LABELS, InvoiceTypeEnum, INVOICE_TYPE_LABELS, InvoiceMethodEnum, INVOICE_METHOD_LABELS } from '@/types/InvoiceTypes';

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();

const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".invoiceListView");
const loading = ref(false);
const loadError = ref(false);

const invoices = ref<any[]>([]);
const selectedInvoices = ref<Array<string | number>>([]);

const actionDialog = ref<any>({ show: false });
const detailDialog = ref({ show: false });
const createDialog = ref(false);
const selectedInvoiceForDetail = ref<any>(null);

const searchInvoiceForm = ref<any>({
  search: '',
  menu: false,
  filters: {
    status: [],
    type: null,
    startDate: undefined,
    endDate: undefined
  }
});

const sortBy = ref<any>([]);
const pagination = ref({ page: 1, limit: 20, totalNumberOfPages: 1, totalNumberOfRecords: 0 });

// DS-v2 liste standardı. Sıralanabilir kolonlar InvoiceService.getInvoices `sortBy.key`
// izin listesindeki alanlardır (SUNUCU tarafı sıralama).
const columns: EkGridColumn[] = [
  { key: 'invoiceNumber', label: 'Fatura no', type: 'id', sortable: true },
  { key: 'order', label: 'Sipariş no' },
  { key: 'channel', label: 'Kanal' },
  { key: 'customer', label: 'Müşteri' },
  { key: 'documentType', label: 'Belge' },
  { key: 'issueDate', label: 'Tarih', sortable: true },
  { key: 'totalAmount', label: 'Tutar', type: 'num', sortable: true },
  { key: 'status', label: 'Durum', sortable: true },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
];

const STATUS_ITEMS = Object.keys(INVOICE_STATUS_LABELS).map((k: any) => ({ title: INVOICE_STATUS_LABELS[k as InvoiceStatusEnum], value: k }));
const TYPE_ITEMS = Object.keys(INVOICE_TYPE_LABELS).map((k: any) => ({ title: INVOICE_TYPE_LABELS[k as InvoiceTypeEnum], value: k }));

const gridSort = computed<EkGridSort>(() => {
  const current = sortBy.value?.[0];
  return current?.key ? { key: current.key, dir: current.order === 'asc' ? 'asc' : 'desc' } : null;
});

function onGridSort(sort: EkGridSort) {
  onSortUpdate(sort ? [{ key: sort.key, order: sort.dir }] : []);
}

// Aktif filtre çipleri — SON SORGULANAN değerlerden.
const applied = ref<{ search: string; status: string[]; type: string | null }>({ search: '', status: [], type: null });

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const chips: EkActiveFilterChip[] = [];
  if (applied.value.search) chips.push({ key: 'search', label: 'Arama', value: applied.value.search });
  if (applied.value.status.length) chips.push({ key: 'status', label: 'Durum', value: applied.value.status.map(k => INVOICE_STATUS_LABELS[k as InvoiceStatusEnum] ?? k).join(', ') });
  if (applied.value.type) chips.push({ key: 'type', label: 'Belge tipi', value: INVOICE_TYPE_LABELS[applied.value.type as InvoiceTypeEnum] ?? applied.value.type });
  return chips;
});

const panelFilterCount = computed(() => (applied.value.status.length ? 1 : 0) + (applied.value.type ? 1 : 0));

function removeChip(key: string) {
  if (key === 'search') searchInvoiceForm.value.search = '';
  if (key === 'status') searchInvoiceForm.value.filters.status = [];
  if (key === 'type') searchInvoiceForm.value.filters.type = null;
  getInvoices(true);
}

function clearFilters() {
  // Eski "Filtreleri temizle" gibi: durum/tip sıfırlanır; ek olarak arama da temizlenir (tek tıkla tümü).
  searchInvoiceForm.value.filters = { status: [], type: null };
  searchInvoiceForm.value.search = '';
  getInvoices(true);
}

function openPdf(item: any) {
  if (item.pdfUrl) window.open(item.pdfUrl, '_blank');
}

function statusEntry(status: InvoiceStatusEnum) {
  return INVOICE_STATUS_TONE[status] ?? { tone: 'neutral' as const, labelKey: 'status.invoice.draft' };
}


const getInvoices = async (resetPage: boolean = false) => {
  if (resetPage) pagination.value.page = 1;
  loading.value = true;
  loadError.value = false;
  applied.value = { search: searchInvoiceForm.value.search || '', status: [...(searchInvoiceForm.value.filters.status || [])], type: searchInvoiceForm.value.filters.type || null };

  try {
    let sortPayload: any = undefined;
    if (sortBy.value && sortBy.value.length > 0) {
      sortPayload = {
        key: sortBy.value[0].key,
        order: sortBy.value[0].order
      };
    }

    const payload = {
      pagination: pagination.value,
      sortBy: sortPayload,
      search: searchInvoiceForm.value.search,
      filters: searchInvoiceForm.value.filters
    };

    const res = await restApi.post('InvoiceService/getInvoices', payload);
    if (isRequestError(res)) {
      loadError.value = true;
    } else if (res?.invoices) {
      invoices.value = res.invoices;
      pagination.value.totalNumberOfRecords = res.totalNumberOfRecords || 0;
      pagination.value.totalNumberOfPages = Math.ceil(res.totalNumberOfRecords / pagination.value.limit) || 1;
    }
  } catch (e) {
    loadError.value = true;
    snackbarStore.addSnackbar({ text: "Veri yükleme hatası!", color: "error" });
  } finally {
    loading.value = false;
  }
};

function onSearchInput(value: string) {
  searchInvoiceForm.value.search = value;
  getInvoices(true);
}

function onPageChange(newPage: number) {
  pagination.value.page = newPage;
  getInvoices();
}

function onPageSizeChange(size: number) {
  pagination.value.limit = size;
  onPageChange(1);
}

const onSortUpdate = (newSort: any) => { sortBy.value = newSort; getInvoices(true); };

const openDetailedReport = (item: any) => {
  selectedInvoiceForDetail.value = item;
  detailDialog.value.show = true;
};

const triggerDelete = (item: any) => {
  actionDialog.value = {
    show: true,
    title: "Fatura silinsin mi?",
    message: "Fatura silindikten sonra sipariş sekmesinin 'Faturalandırıldı' tiki kalkacaktır.",
    onConfirm: async () => {
      try {
        actionDialog.value.show = false;
        const guid = loadingComponentRef.value?.info("Siliniyor...");
        const res = await restApi.post('InvoiceService/deleteInvoice', { invoiceId: item._id });
        loadingComponentRef.value?.remove(guid);
        if (res.success) {
          snackbarStore.addSnackbar({ text: res.message, color: 'success' });
          getInvoices();
        }
      } catch (e) {
        snackbarStore.addSnackbar({ text: "Silme işlemi başarısız.", color: "error" });
      }
    }
  }
};

const triggerBulkDelete = () => {
  actionDialog.value = {
    show: true,
    title: `Seçili ${selectedInvoices.value.length} fatura silinsin mi?`,
    message: "Fatura silindikten sonra Sipariş sekmesindeki 'Faturalandırıldı' durumu geri alınır.",
    onConfirm: async () => {
      try {
        actionDialog.value.show = false;
        const guid = loadingComponentRef.value?.info("Faturalar siliniyor...");

        let successCount = 0;
        for (const id of selectedInvoices.value) {
          const res = await restApi.post('InvoiceService/deleteInvoice', { invoiceId: id });
          if (res.success) successCount++;
        }

        loadingComponentRef.value?.remove(guid);
        snackbarStore.addSnackbar({ text: `${successCount} adet fatura başarıyla silindi.`, color: 'success' });
        selectedInvoices.value = [];
        getInvoices();
      } catch (e) {
        snackbarStore.addSnackbar({ text: "Toplu silme sırasında hata oluştu.", color: "error" });
      }
    }
  };
};


onMounted(() => {
  getInvoices(true);
});
</script>

<style scoped>
.invoiceListView {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .invoiceListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-invoice-kind {
  margin-left: var(--ek-space-2);
  font-size: var(--ek-type-caption-size);
}

.ek-row-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}

.ek-bulk-danger {
  color: var(--ek-color-error);
}
</style>
