<template>
  <div class="customerListView d-flex flex-column pt-4">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef" />

    <!-- ek-pattern-exception: EkConfirmDialog — R7 (e2e/specs/confirmation-dialog.spec.ts,
         bu görevin kapsamı DIŞI) müşteri silme diyaloğunun BUGÜNKÜ görünür yapısını (başlık
         "MÜŞTERİYİ SİL", kalın müşteri adı, satır sonları, küçük not, "EVET, SİL" düğmesi) ve
         G-01/BR-32 depolanmış-XSS güvenlik özelliğini karakterize ediyor; bu akış BİLİNÇLİ
         OLARAK ConfirmationDialogComponent + messageParts.ts ile AYNEN bırakıldı. -->
    <ConfirmationDialogComponent v-model="actionDialog.show" :title="actionDialog.title" attach=".customerListView"
      :subtitle="actionDialog.subtitle" :message="actionDialog.message" :icon="actionDialog.icon"
      :color="actionDialog.color" :confirm-text="actionDialog.confirmText" :confirm-icon="actionDialog.confirmIcon"
      @confirm="actionDialog.onConfirm" @cancel="actionDialog.show = false" maxWidth="400px" />

    <CustomerDetailComponent v-model="editDialog.show" :customer="selectedCustomerForDetail" @save="handleSave" />

    <EkFormDialog v-model="filterDialog" title="Gelişmiş filtreleme" @submit="applyAdvancedFilters">
      <v-select
        v-model="searchCustomerForm.data.cities"
        :items="['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Kocaeli']"
        label="Şehir seçimi"
        multiple
        chips
      />
      <v-select
        v-model="searchCustomerForm.data.status"
        :items="[{ title: 'Aktif', value: 'ACTIVE' }, { title: 'Pasif', value: 'INACTIVE' }, { title: 'Engellenmiş', value: 'BLOCKED' }]"
        label="Müşteri durumu"
      />
    </EkFormDialog>

    <EkListPage
      section="Siparişler"
      title="Müşteriler"
      description="Tüm platformlardaki müşteri kayıtlarınızı buradan yönetin."
      :secondary-actions="[{ label: 'Gelişmiş filtre', icon: 'mdi-filter-variant', onClick: () => (filterDialog = true) }]"
      :search="searchCustomerForm.data.globalSearch"
      search-placeholder="İsim, Telefon, E-posta veya Vergi No"
      :state="viewState"
      @update:search="onSearchInput"
      @clear-filters="resetFilters"
      @refresh="() => getCustomers(true)"
    >
      <template #empty>
        <EkEmptyState variant="no-results" title="Müşteri Bulunamadı" message="Arama kriterlerinize uygun herhangi bir müşteri kaydı bulunamadı." />
      </template>
      <template #error>
        <EkErrorState message="Müşteriler yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="() => getCustomers(true)" />
      </template>

      <div class="ek-customer-table-wrapper">
        <EkDataTable v-if="$vuetify.display.mdAndUp" :items="customers" :columns="columns" row-key="_id" class="ek-customer-desktop-table" aria-label="Müşteriler tablosu">
          <template #cell-select="{ item }">
            <v-checkbox-btn :model-value="isCustomerSelected(item)" color="primary" density="compact"
              :aria-label="`${item.firstName} ${item.lastName} satırını seç`"
              @update:model-value="val => onCustomerSelectionUpdate(item, !!val)" />
          </template>

          <template #cell-name="{ item }">
            <div class="d-flex align-center">
              <v-avatar color="surface-muted" size="38" class="mr-3 avatar-ring">
                <span class="text-body-2 font-weight-bold ek-avatar-initials">{{ item.firstName?.[0] }}{{ item.lastName?.[0] }}</span>
              </v-avatar>
              <div class="d-flex flex-column">
                <span class="font-weight-medium text-body-2">{{ item.firstName }} {{ item.lastName }}</span>
                <div class="d-flex align-center ek-gap-1 mt-1">
                  <EkStatusChip v-if="item.isCorporate" tone="info" label="Kurumsal" />
                  <span class="text-caption ek-muted">{{ item.externalIdentities?.[0]?.integrationCode || 'Sistem' }}</span>
                </div>
              </div>
            </div>
          </template>

          <template #cell-contact="{ item }">
            <div class="d-flex flex-column contact-block">
              <span class="text-caption font-weight-medium"><v-icon size="14" class="mr-1" color="content-muted">mdi-phone</v-icon>{{ item.phone || '—' }}</span>
              <span class="text-caption ek-muted"><v-icon size="14" class="mr-1" color="content-muted">mdi-email</v-icon>{{ item.email || '—' }}</span>
            </div>
          </template>

          <template #cell-region="{ item }">
            <div class="d-flex flex-column">
              <span class="text-caption font-weight-medium">{{ item.addresses?.[0]?.city || '—' }}</span>
              <span class="text-caption ek-muted">{{ item.addresses?.[0]?.state || '' }}</span>
            </div>
          </template>

          <template #cell-netRevenue="{ item }">
            <div class="d-flex flex-column align-end">
              <span class="text-caption ek-muted gross-amount ek-num">{{ formatMoney(item.metrics?.totalSpent) }}</span>
              <span class="font-weight-semibold ek-num">{{ formatMoney(item.netRevenue) }}</span>
              <span class="text-caption ek-muted">{{ item.metrics?.totalOrderCount || 0 }} başarılı sipariş</span>
            </div>
          </template>

          <template #cell-returnRate="{ item }">
            <div class="d-flex flex-column align-center return-risk-cell">
              <v-progress-linear :model-value="item.returnRate" :color="returnRateTone(item.returnRate)" height="6" rounded class="mb-1"
                :aria-label="`İade oranı ${formatPercent((item.returnRate || 0) / 100)}`" />
              <span class="text-caption font-weight-medium ek-num" :class="`ek-text-${returnRateTone(item.returnRate)}`">{{ formatPercent((item.returnRate || 0) / 100) }}</span>
            </div>
          </template>

          <template #cell-actions="{ item }">
            <div class="d-flex justify-end ek-gap-1">
              <v-btn icon variant="text" density="comfortable" aria-label="Müşteri karnesini görüntüle" @click="openDetailedReport(item)">
                <v-icon>mdi-eye</v-icon>
                <v-tooltip activator="parent" location="top">Müşteri karnesi</v-tooltip>
              </v-btn>
              <v-btn icon variant="text" density="comfortable" aria-label="Müşteriyi sil" @click="triggerDelete(item)">
                <v-icon>mdi-delete-sweep-outline</v-icon>
                <v-tooltip activator="parent" location="top">Sil</v-tooltip>
              </v-btn>
            </div>
          </template>
        </EkDataTable>

        <div v-else class="mobile-list d-flex flex-column h-100">
          <div class="pa-2 overflow-y-auto flex-grow-1 d-flex flex-column mobile-list-scroll">
            <EkEmptyState v-if="!customers?.length" variant="no-results" title="Müşteri Bulunamadı" message="Arama kriterlerinize uygun herhangi bir müşteri kaydı bulunamadı." />
            <v-card v-for="item in customers" :key="item._id" class="mobile-card mb-3" variant="flat" border rounded="lg">
              <div class="pa-3 border-bottom-dashed d-flex justify-space-between align-center">
                <div class="d-flex align-center">
                  <v-checkbox-btn :model-value="isCustomerSelected(item)" color="primary" density="compact" class="mr-2"
                    :aria-label="`${item.firstName} ${item.lastName} satırını seç`"
                    @update:model-value="val => onCustomerSelectionUpdate(item, !!val)" />
                  <v-avatar size="32" color="surface-muted" class="mr-2 ek-avatar-initials text-caption font-weight-bold">
                    {{ item.firstName?.[0] }}{{ item.lastName?.[0] }}
                  </v-avatar>
                  <span class="font-weight-medium text-body-2">{{ item.firstName }} {{ item.lastName }}</span>
                </div>
                <EkStatusChip v-if="item.returnRate > 25" tone="danger" label="Riskli" />
              </div>

              <div class="pa-3">
                <div class="d-flex justify-space-between mb-2">
                  <div class="d-flex flex-column">
                    <span class="text-caption ek-muted"><v-icon size="12" color="content-muted">mdi-phone</v-icon> {{ item.phone || '—' }}</span>
                    <span class="text-caption ek-muted"><v-icon size="12" color="content-muted">mdi-map-marker</v-icon> {{ item.addresses?.[0]?.city || '—' }}</span>
                  </div>
                  <div class="d-flex flex-column align-end">
                    <span class="text-body-2 font-weight-semibold ek-num">{{ formatMoney(item.netRevenue) }}</span>
                    <span class="text-caption ek-muted">{{ item.metrics?.totalOrderCount || 0 }} sipariş</span>
                  </div>
                </div>
                <div class="d-flex ek-gap-2 justify-end mt-2">
                  <v-btn icon variant="text" density="comfortable" aria-label="Müşteri karnesini görüntüle" @click="openDetailedReport(item)">
                    <v-icon>mdi-eye</v-icon>
                  </v-btn>
                  <v-btn icon variant="text" density="comfortable" aria-label="Müşteriyi sil" @click="triggerDelete(item)">
                    <v-icon>mdi-delete-sweep-outline</v-icon>
                  </v-btn>
                </div>
              </div>
            </v-card>
          </div>
        </div>
      </div>

      <template #pagination>
        <EkPagination :page="pagination.page" :page-size="pagination.limit" :total="pagination.totalNumberOfRecords"
          @update:page="handlePageChange" @update:pageSize="onPageSizeChange" />
      </template>
    </EkListPage>

    <BatchProcessMenu :model-value="selectedCustomers" title="Müşteri Seçildi" :actions="[
      { id: 'DELETE', label: 'Toplu Sil', icon: 'mdi-delete-sweep-outline', color: 'error', badgeCount: bulkActionCounts.DELETE }
    ]" @action="onBulkDelete" @clear="selectedCustomers = []" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';
import { useCustomerFilters } from '@/components/customer/composables/useCustomerFilters';
import { useCustomerActions } from '@/components/customer/composables/useCustomerActions';
import { formatMoney, formatPercent } from '@/composables/format';

import LoadingComponent from '@/components/LoadingComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import CustomerDetailComponent from '@/components/customer/CustomerDetailComponent.vue';
import BatchProcessMenu from '@/components/layout/BatchProcessMenu.vue';
import EkListPage from '@/components/ds/templates/EkListPage.vue';
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue';
import EkPagination from '@/components/ds/EkPagination.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';
import EkErrorState from '@/components/ds/EkErrorState.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkFormDialog from '@/components/ds/EkFormDialog.vue';

const emits = defineEmits(['clear'])
const restApi = useRestApi();
const snackbarStore = useSnackbarStore();

const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".customerListView");
const loading = ref(false);
const loadError = ref(false);
const filterDialog = ref(false);

const customers = ref<any[]>([]);
const selectedCustomers = ref<string[]>([]);
const selectedCustomerForDetail = ref<any>(null);

const editDialog = ref({ show: false });
const actionDialog = ref<any>({ show: false });

const columns: EkTableColumn[] = [
  { key: 'select', label: '' },
  { key: 'name', label: 'MÜŞTERİ PROFİLİ' },
  { key: 'contact', label: 'İLETİŞİM' },
  { key: 'region', label: 'LOKASYON' },
  { key: 'netRevenue', label: 'CİRO ANALİZİ (NET)', align: 'end' },
  { key: 'returnRate', label: 'İADE RİSKİ', align: 'end' },
  { key: 'actions', label: '', type: 'actions', align: 'end' },
];

const viewState = computed(() => {
  if (loading.value) return 'loading';
  if (loadError.value) return 'error';
  if (!customers.value.length) return 'empty';
  return 'ready';
});

const getCustomersInternal = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
  const guid = loadingComponentRef.value?.info("Müşteri verileri senkronize ediliyor...") || "loading";

  try {
    const res = await restApi.post('CustomerService/getCustomers', prepareFilterPayload());
    if (res.customers) {
      customers.value = res.customers;
      pagination.totalNumberOfRecords = res.totalNumberOfRecords || 0;
      pagination.totalNumberOfPages = res.totalNumberOfPages || 1;
    }
  } catch (e) {
    loadError.value = true;
    snackbarStore.addSnackbar({ text: "Veri yükleme hatası!", color: "error" });
  } finally {
    loadingComponentRef.value?.remove(guid);
    loading.value = false;
  }
};

const executeAction = async (endpoint: string, payload: any) => await restApi.post(endpoint, payload);

const {
  searchCustomerForm, pagination, resetFilters, handlePageChange, prepareFilterPayload
} = useCustomerFilters(getCustomersInternal);

const { handleDelete, handleBulkDelete } = useCustomerActions(executeAction, snackbarStore, getCustomersInternal);

const onBulkDelete = () => handleBulkDelete(selectedCustomers.value, actionDialog.value);

function onSearchInput(value: string) {
  searchCustomerForm.data.globalSearch = value;
  getCustomers(true);
}

function applyAdvancedFilters() {
  filterDialog.value = false;
  getCustomers(true);
}

function onPageSizeChange(size: number) {
  pagination.limit = size;
  handlePageChange(1);
}

function returnRateTone(rate: number): 'success' | 'warning' | 'danger' {
  if (rate > 30) return 'danger';
  if (rate > 15) return 'warning';
  return 'success';
}

async function getCustomers(resetPage: boolean = false) { await getCustomersInternal(resetPage); }

const bulkActionCounts = computed(() => {
  return {
    DELETE: selectedCustomers.value.length
  };
});


const openDetailedReport = async (item: any) => {
  const guid = loadingComponentRef.value?.info("Analitik veriler hazırlanıyor...") || "loading";
  try {
    const res = await restApi.post('CustomerService/getCustomerDetail', { customerId: item._id });
    selectedCustomerForDetail.value = res;
    editDialog.value.show = true;
  } catch (error) {
    snackbarStore.addSnackbar({ text: "Detay verisi alınamadı", color: "error" });
  } finally {
    loadingComponentRef.value?.remove(guid);
  }
};

const handleSave = async ({ customerId, updateData }: any) => {
  try {
    const res = await restApi.post('CustomerService/updateCustomer', { customerId, updateData });
    if (res.success) {
      snackbarStore.addSnackbar({ text: 'Müşteri profili güncellendi', color: 'success' });
      getCustomers();
      editDialog.value.show = false;
    }
  } catch (e) {
    snackbarStore.addSnackbar({ text: 'Kaydedilirken hata oluştu', color: 'error' });
  }
};

const triggerDelete = (item: any) => handleDelete(item, actionDialog.value);

const onCustomerSelectionUpdate = (item: any, isSelected: boolean) => {
  if (isSelected) selectedCustomers.value.push(item._id);
  else selectedCustomers.value = selectedCustomers.value.filter(id => id !== item._id);
};

const isCustomerSelected = (item: any) => selectedCustomers.value.includes(item._id);

onMounted(() => getCustomers());


const initialize = async (parameters: any) => {
  if (parameters?.globalSearch) {
    searchCustomerForm.data.globalSearch = parameters.globalSearch;
  }
  await getCustomers(true);
  emits('clear')
};

const activate = async (parameters: any) => {
  let flag = false
  if (parameters?.globalSearch) {
    searchCustomerForm.data.globalSearch = parameters.globalSearch;
    flag = true
  }
  if (flag) {
    await getCustomers(true);
    emits('clear')
  }
};

const destroy = () => {
  resetFilters()
}

defineExpose({
  initialize,
  activate,
  destroy
});



</script>

<style scoped>
.customerListView {
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

.contact-block {
  gap: 2px;
}

.gross-amount {
  text-decoration: line-through;
}

.return-risk-cell {
  min-width: 100px;
}

.mobile-list-scroll {
  padding-bottom: var(--ek-space-8);
}

.ek-customer-table-wrapper {
  width: 100%;
}

.avatar-ring {
  border: 1px solid var(--ek-color-border-default);
}

.ek-avatar-initials {
  color: var(--ek-color-content-strong);
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-text-success { color: var(--ek-color-success); }
.ek-text-warning { color: var(--ek-color-warning); }
.ek-text-danger { color: var(--ek-color-error); }

.border-bottom-dashed {
  border-bottom: 1px dashed var(--ek-color-border-default);
}

.ek-gap-1 { gap: var(--ek-space-1); }
.ek-gap-2 { gap: var(--ek-space-2); }
</style>
