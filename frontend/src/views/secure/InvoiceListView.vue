<template>
  <div class="invoiceListView d-flex flex-column pt-4">
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

    <EkFormDialog v-model="searchInvoiceForm.menu" title="Gelişmiş filtreleme" @submit="() => { getInvoices(true); searchInvoiceForm.menu = false }" @cancel="() => { searchInvoiceForm.filters = { status: [], type: null }; getInvoices(true) }">
      <v-select v-model="searchInvoiceForm.filters.status"
        :items="Object.keys(INVOICE_STATUS_LABELS).map((k: any) => ({ title: INVOICE_STATUS_LABELS[k as InvoiceStatusEnum], value: k }))"
        label="Fatura durumu (çoklu seçim)" multiple chips item-title="title" item-value="value" />
      <v-select v-model="searchInvoiceForm.filters.type"
        :items="Object.keys(INVOICE_TYPE_LABELS).map((k: any) => ({ title: INVOICE_TYPE_LABELS[k as InvoiceTypeEnum], value: k }))"
        clearable item-title="title" item-value="value" label="Belge tipi" />
    </EkFormDialog>

    <EkListPage
      section="Siparişler"
      title="Faturalar"
      description="Sipariş ve manuel faturalarınızı buradan yönetin."
      :primary-action="{ label: 'Yeni fatura ekle', icon: 'mdi-plus', onClick: () => (createDialog = true) }"
      :secondary-actions="[{ label: 'Gelişmiş filtre', icon: 'mdi-filter-variant', onClick: () => (searchInvoiceForm.menu = true) }]"
      :search="searchInvoiceForm.search"
      search-placeholder="Fatura No, Sipariş No veya Pazar Yeri Kodu Filtrele"
      :state="viewState"
      @update:search="onSearchInput"
      @clear-filters="() => { searchInvoiceForm.filters = { status: [], type: null }; getInvoices(true) }"
      @refresh="() => getInvoices(true)"
    >
      <template #empty>
        <EkEmptyState variant="no-results" title="Fatura Bulunamadı" message="Arama kriterlerinize uygun herhangi bir fatura kaydı bulunamadı." />
      </template>
      <template #error>
        <EkErrorState message="Faturalar yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="() => getInvoices(true)" />
      </template>

      <div class="ek-invoice-table-wrapper">
        <EkDataTable v-if="$vuetify.display.mdAndUp" :items="invoices" :columns="columns" row-key="_id" aria-label="Faturalar tablosu">
          <template #cell-select="{ item }">
            <v-checkbox-btn :model-value="isInvoiceSelected(item)" color="primary" density="compact"
              :aria-label="`Faturayı seç: ${item.invoiceNumber}`"
              @update:model-value="val => onInvoiceSelectionUpdate(item, !!val)" />
          </template>

          <template #cell-invoiceNumber="{ item }">
            <div class="d-flex align-center">
              <EkPlatformMark :name="platformName(item.integrationCode)" :code="item.integrationCode" size="sm" :show-name="false" class="mr-3" />
              <div class="d-flex flex-column">
                <span class="font-weight-medium text-body-2">{{ item.invoiceNumber || '—' }}</span>
                <div class="d-flex align-center ek-gap-1 mt-1">
                  <span class="text-caption ek-muted">Sipariş: {{ item.externalOrderId || item.order?.orderNumber || '—' }}</span>
                  <EkStatusChip :tone="item.documentType === 'E_FATURA' ? 'info' : 'neutral'" :label="item.documentType === 'E_FATURA' ? 'e-Fatura' : 'e-Arşiv'" />
                </div>
              </div>
            </div>
          </template>

          <template #cell-customer="{ item }">
            <div class="d-flex flex-column">
              <span class="text-caption font-weight-medium">{{ item.customer?.firstName || 'Bilinmiyor' }} {{ item.customer?.lastName || '' }}</span>
              <span class="text-caption ek-muted">{{ item.customer?.identities?.[0]?.tcknOrVkn || 'TCKN yok' }}</span>
            </div>
          </template>

          <template #cell-issueDate="{ item }">
            <div class="d-flex flex-column">
              <span class="text-caption font-weight-medium ek-num">{{ formatDateTime(item.issueDate || item.createdAt) }}</span>
              <span class="text-caption ek-muted">{{ item.type === 'SALES' ? 'Satış' : item.type === 'RETURN' ? 'İade faturası' : 'Diğer' }}</span>
            </div>
          </template>

          <template #cell-totalAmount="{ item }">
            <span class="font-weight-semibold ek-num">{{ formatMoney(item.totalAmount) }}</span>
          </template>

          <template #cell-status="{ item }">
            <div class="d-flex flex-column align-center">
              <EkStatusChip :tone="statusEntry(item.status).tone" :label="$t(statusEntry(item.status).labelKey)" />
              <span v-if="item.invoiceMethod" class="text-caption ek-muted mt-1">{{ INVOICE_METHOD_LABELS[item.invoiceMethod as InvoiceMethodEnum] || item.invoiceMethod }}</span>
            </div>
          </template>

          <template #cell-actions="{ item }">
            <div class="d-flex justify-end ek-gap-1">
              <v-btn icon variant="text" density="comfortable" aria-label="Fatura detaylarını görüntüle" @click="openDetailedReport(item)">
                <v-icon>mdi-eye</v-icon>
              </v-btn>
              <v-btn icon variant="text" density="comfortable" :disabled="!item.pdfUrl" :href="item.pdfUrl" target="_blank" aria-label="Faturayı görüntüle/yazdır">
                <v-icon>mdi-printer</v-icon>
              </v-btn>
              <v-btn icon variant="text" density="comfortable" aria-label="Faturayı sil" @click="triggerDelete(item)">
                <v-icon>mdi-delete-sweep-outline</v-icon>
              </v-btn>
            </div>
          </template>
        </EkDataTable>

        <div v-else class="mobile-list d-flex flex-column h-100">
          <div class="pa-3 d-flex align-center justify-space-between border-bottom-subtle">
            <span class="text-caption font-weight-medium">Sıralama</span>
            <v-select v-model="sortBy" :items="[
              { title: 'Yeniden eskiye', value: [{ key: 'createdAt', order: 'desc' }] },
              { title: 'Eskiden yeniye', value: [{ key: 'createdAt', order: 'asc' }] },
              { title: 'Tutar (azalan)', value: [{ key: 'totalAmount', order: 'desc' }] },
              { title: 'Tutar (artan)', value: [{ key: 'totalAmount', order: 'asc' }] }
            ]" item-title="title" item-value="value" density="compact" hide-details class="ek-invoice-sort-select" @update:model-value="onSortUpdate($event)" />
          </div>

          <div class="flex-grow-1 overflow-y-auto pa-3 mobile-list-scroll">
            <EkEmptyState v-if="!invoices?.length" variant="no-results" title="Fatura Bulunamadı" message="Arama kriterlerinize uygun herhangi bir fatura kaydı bulunamadı." />
            <v-card v-for="item in invoices" :key="item._id" class="mobile-card mb-3" variant="flat" border rounded="lg">
              <div class="pa-3">
                <div class="d-flex align-start justify-space-between mb-3 ek-gap-2">
                  <div class="d-flex align-start ek-gap-3">
                    <v-checkbox-btn :model-value="isInvoiceSelected(item)" density="compact" color="primary"
                      :aria-label="`Faturayı seç: ${item.invoiceNumber}`"
                      @update:model-value="val => onInvoiceSelectionUpdate(item, !!val)" />
                    <div class="d-flex flex-column">
                      <span class="font-weight-medium text-body-2">{{ item.invoiceNumber || '—' }}</span>
                      <span class="text-caption ek-muted">{{ item.externalOrderId || item.order?.orderNumber || 'Manuel' }}</span>
                    </div>
                  </div>
                  <EkStatusChip :tone="statusEntry(item.status).tone" :label="$t(statusEntry(item.status).labelKey)" />
                </div>

                <div class="d-flex flex-wrap align-center justify-space-between mb-3 ek-gap-2">
                  <div>
                    <div class="text-caption ek-muted">Toplam tutar</div>
                    <span class="font-weight-semibold ek-num">{{ formatMoney(item.totalAmount) }}</span>
                  </div>
                  <div>
                    <div class="text-caption ek-muted text-right">Tarih</div>
                    <span class="text-caption font-weight-medium ek-num d-block">{{ formatDateTime(item.issueDate || item.createdAt) }}</span>
                  </div>
                </div>

                <div class="d-flex flex-wrap justify-end ek-gap-1 pt-2 border-top-dashed">
                  <v-btn icon variant="text" density="comfortable" aria-label="Fatura detaylarını görüntüle" @click="openDetailedReport(item)"><v-icon>mdi-eye</v-icon></v-btn>
                  <v-btn icon variant="text" density="comfortable" :disabled="!item.pdfUrl" :href="item.pdfUrl" target="_blank" aria-label="Faturayı görüntüle/yazdır"><v-icon>mdi-printer</v-icon></v-btn>
                  <v-btn icon variant="text" density="comfortable" aria-label="Faturayı sil" @click="triggerDelete(item)"><v-icon>mdi-delete-sweep-outline</v-icon></v-btn>
                </div>
              </div>
            </v-card>
          </div>
        </div>
      </div>

      <template #pagination>
        <EkPagination :page="pagination.page" :page-size="pagination.limit" :total="pagination.totalNumberOfRecords"
          @update:page="onPageChange" @update:pageSize="onPageSizeChange" />
      </template>
    </EkListPage>

    <BatchProcessMenu :model-value="selectedInvoices" title="Fatura Seçildi" :actions="[
      { id: 'DELETE', label: 'Toplu Sil', icon: 'mdi-delete-sweep-outline', color: 'error', badgeCount: bulkActionCounts.DELETE }
    ]" @action="triggerBulkDelete" @clear="selectedInvoices = []" />
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
import BatchProcessMenu from '@/components/layout/BatchProcessMenu.vue';
import EkListPage from '@/components/ds/templates/EkListPage.vue';
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue';
import EkPagination from '@/components/ds/EkPagination.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';
import EkErrorState from '@/components/ds/EkErrorState.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkConfirmDialog from '@/components/ds/EkConfirmDialog.vue';
import EkFormDialog from '@/components/ds/EkFormDialog.vue';
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue';
import { InvoiceStatusEnum, INVOICE_STATUS_LABELS, InvoiceTypeEnum, INVOICE_TYPE_LABELS, InvoiceMethodEnum, INVOICE_METHOD_LABELS } from '@/types/InvoiceTypes';

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();

const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".invoiceListView");
const loading = ref(false);
const loadError = ref(false);

const invoices = ref<any[]>([]);
const selectedInvoices = ref<string[]>([]);

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

const columns: EkTableColumn[] = [
  { key: 'select', label: '' },
  { key: 'invoiceNumber', label: 'FATURA KİMLİĞİ' },
  { key: 'customer', label: 'MÜŞTERİ' },
  { key: 'issueDate', label: 'TARİH VE TİP' },
  { key: 'totalAmount', label: 'TUTAR', align: 'end' },
  { key: 'status', label: 'DURUM' },
  { key: 'actions', label: '', type: 'actions', align: 'end' },
];

function statusEntry(status: InvoiceStatusEnum) {
  return INVOICE_STATUS_TONE[status] ?? { tone: 'neutral' as const, labelKey: 'status.invoice.draft' };
}

function platformName(code: string): string {
  return code ? code.charAt(0).toUpperCase() + code.slice(1) : 'Bilinmeyen';
}

const viewState = computed(() => {
  if (loading.value) return 'loading';
  if (loadError.value) return 'error';
  if (!invoices.value.length) return 'empty';
  return 'ready';
});

const bulkActionCounts = computed(() => ({ DELETE: selectedInvoices.value.length }));

const getInvoices = async (resetPage: boolean = false) => {
  if (resetPage) pagination.value.page = 1;
  loading.value = true;
  loadError.value = false;
  const guid = loadingComponentRef.value?.info("Faturalar yükleniyor...") || "loading";

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
    if (res.invoices) {
      invoices.value = res.invoices;
      pagination.value.totalNumberOfRecords = res.totalNumberOfRecords || 0;
      pagination.value.totalNumberOfPages = Math.ceil(res.totalNumberOfRecords / pagination.value.limit) || 1;
    }
  } catch (e) {
    loadError.value = true;
    snackbarStore.addSnackbar({ text: "Veri yükleme hatası!", color: "error" });
  } finally {
    loadingComponentRef.value?.remove(guid);
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

const onInvoiceSelectionUpdate = (item: any, isSelected: boolean) => {
  if (isSelected) selectedInvoices.value.push(item._id);
  else selectedInvoices.value = selectedInvoices.value.filter(id => id !== item._id);
};

const isInvoiceSelected = (item: any) => selectedInvoices.value.includes(item._id);

onMounted(() => {
  getInvoices(true);
});
</script>

<style scoped>
.invoiceListView {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-6);
  gap: var(--ek-space-4);
}

.ek-invoice-table-wrapper {
  width: 100%;
}

.ek-invoice-sort-select {
  max-width: 200px;
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-gap-1 { gap: var(--ek-space-1); }
.ek-gap-2 { gap: var(--ek-space-2); }
.ek-gap-3 { gap: var(--ek-space-3); }

.mobile-list-scroll {
  padding-bottom: var(--ek-space-8);
}

.border-bottom-subtle {
  border-bottom: 1px solid var(--ek-color-border-default);
}

.border-top-dashed {
  border-top: 1px dashed var(--ek-color-border-default);
}
</style>
