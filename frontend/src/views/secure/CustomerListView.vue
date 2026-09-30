<template>
  <div class="customerListView">
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

    <CustomerDetailComponent v-model="editDialog.show" :customer="selectedCustomerForDetail" :can-anonymize="canAnonymize"
      :loading="detailState.loading" :error="detailState.error"
      @save="handleSave" @anonymize="askAnonymize" @retry="loadDetail(detailState.id)" />

    <!-- C1.6 (ADR-0003 F.23) — son kullanıcı silme talebi: kişisel alanlar kalıcı maskelenir, kayıtlar kalır. -->
    <EkConfirmDialog v-model="anonymizeDialog.show" danger :loading="anonymizeDialog.loading"
      :title="`'${anonymizeDialog.name}' anonimleştirilsin mi?`"
      description="Ad, iletişim ve adres bilgileri kalıcı olarak maskelenir; sipariş kayıtları kalır. Bu işlem geri alınamaz."
      confirm-label="Anonimleştir" confirm-icon="mdi-account-cancel-outline"
      @confirm="anonymizeCustomer" @cancel="anonymizeDialog.show = false" />

    <EkListScreen
      section="Satış"
      title="Müşteriler"
      description="Tüm platformlardaki müşteri kayıtlarınızı buradan yönetin."
      label="Müşteriler tablosu"
      noun="müşteri"
      row-key="_id"
      label-key="fullName"
      :columns="columns"
      :rows="rows"
      :loading="loading"
      :error="loadError"
      error-title="Müşteriler yüklenemedi"
      :search="searchCustomerForm.data.globalSearch"
      search-placeholder="İsim, Telefon, E-posta veya Vergi No"
      :chips="activeChips"
      :filter-count="panelFilterCount"
      selectable
      v-model:selected="selectedCustomers"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Müşteri bulunamadı"
      empty-text="Siparişlerle gelen müşteriler burada listelenir."
      empty-icon="mdi-account-group-outline"
      filtered-empty-title="Müşteri bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir müşteri kaydı bulunamadı."
      @update:search="onSearchInput"
      @update:sort="onGridSort"
      @update:page="handlePageChange"
      @update:page-size="onPageSizeChange"
      @filter-submit="applyAdvancedFilters"
      @filter-reset="resetFilters"
      @remove-chip="removeChip"
      @clear-filters="resetFilters"
      @refresh="getCustomers(true)"
    >
      <template #filters>
        <EkSelect v-model="searchCustomerForm.data.cities" :items="CITY_OPTIONS" label="Şehir" multiple clearable />
        <v-select v-model="searchCustomerForm.data.status" :items="STATUS_OPTIONS" label="Müşteri durumu" clearable />
      </template>

      <template #bulk-actions>
        <EkButton size="sm" icon="mdi-trash-can-outline" class="ek-bulk-danger" @click="onBulkDelete">
          Toplu sil ({{ selectedCustomers.length }})
        </EkButton>
      </template>

      <template #cell-name="{ row }">
        <span class="ek-customer">
          <CustomerAvatar :first-name="row.firstName" :last-name="row.lastName" :anonymized="isAnonymized(row.firstName)" size="sm" />
          <span class="ek-customer__name">{{ row.fullName }}</span>
          <EkBadge v-if="row.isCorporate" tone="info">Kurumsal</EkBadge>
        </span>
      </template>
      <template #cell-channel="{ row }">
        <EkChannelDot v-if="row.externalIdentities?.[0]?.integrationCode" :code="row.externalIdentities[0].integrationCode" />
        <span v-else class="ek-muted">Sistem</span>
      </template>
      <!-- A13 · KVKK: listede iletişim her zaman maskeli; açık değer yalnız müşteri kartında "Göster" ile. -->
      <template #cell-phone="{ row }"><span class="ek-num">{{ listContact('phone', row.phone, row.isPhoneMasked) }}</span></template>
      <template #cell-email="{ row }">{{ listContact('email', row.email, row.isEmailMasked) }}</template>
      <template #cell-region="{ row }">
        <span class="ek-region">{{ row.addresses?.[0]?.city || '—' }}<span v-if="row.addresses?.[0]?.state" class="ek-muted"> · {{ row.addresses[0].state }}</span></span>
      </template>
      <template #cell-orders="{ row }"><span class="ek-num">{{ row.metrics?.totalOrderCount || 0 }}</span></template>
      <template #cell-netRevenue="{ row }"><span class="ek-num">{{ formatMoney(row.netRevenue) }}</span></template>
      <template #cell-returnRate="{ row }">
        <EkStatusChip v-if="row.metrics?.totalOrderCount > 0" :tone="rateTone(row.returnRate ?? 0) ?? 'success'" :label="formatPercent((row.returnRate || 0) / 100)" />
        <span v-else class="ek-muted">—<span class="ek-sr-only">sipariş yok</span></span>
      </template>
      <template #cell-actions="{ row }">
        <EkRowActions :label="`${row.firstName ?? ''} ${row.lastName ?? ''} işlemleri`" :items="[
          { key: 'view', action: 'view', label: 'Müşteri karnesini görüntüle', onClick: () => openDetailedReport(row) },
          { key: 'delete', action: 'delete', label: 'Müşteriyi sil', onClick: () => triggerDelete(row) },
        ]" />
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import EkSelect from '@/components/ds/EkSelect.vue'
import EkRowActions from '@/components/ds/EkRowActions.vue'
import { ref, onMounted, computed } from 'vue';
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';
import { useCustomerFilters } from '@/components/customer/composables/useCustomerFilters';
import { useCustomerActions } from '@/components/customer/composables/useCustomerActions';
import { formatMoney, formatPercent } from '@/composables/format';
import CustomerAvatar from '@/components/customer/card/CustomerAvatar.vue';
import EkBadge from '@/components/ds/EkBadge.vue';
import { contactValue, isAnonymized, returnRateTone as rateTone } from '@/components/customer/customerCard';

import LoadingComponent from '@/components/LoadingComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import CustomerDetailComponent from '@/components/customer/CustomerDetailComponent.vue';
import EkListScreen from '@/components/ds/templates/EkListScreen.vue';
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue';
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue';
import EkButton from '@/components/ds/EkButton.vue';
import EkChannelDot from '@/components/ds/EkChannelDot.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import { isRequestError } from '@/components/ds/listStandard';
import EkConfirmDialog from '@/components/ds/EkConfirmDialog.vue';
import useUser from '@/composables/user';
import { apiMessage, apiStatus, isApiError } from '@/composables/apiErrors';

const emits = defineEmits(['clear'])
const restApi = useRestApi();
const snackbarStore = useSnackbarStore();

const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".customerListView");
const loading = ref(false);
const loadError = ref(false);

const customers = ref<any[]>([]);
const selectedCustomers = ref<Array<string | number>>([]);
const selectedCustomerForDetail = ref<any>(null);

const editDialog = ref({ show: false });
const actionDialog = ref<any>({ show: false });

const CITY_OPTIONS = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Kocaeli'];
const STATUS_OPTIONS = [{ title: 'Aktif', value: 'ACTIVE' }, { title: 'Pasif', value: 'INACTIVE' }, { title: 'Engellenmiş', value: 'BLOCKED' }];

// DS-v2 liste standardı. CustomerService.getCustomers `sortBy.key` ile SUNUCUDA sıralar
// (yalnız saklanan alanlar: ad, şehir); ciro/iade oranı sayfada hesaplandığı için sıralanamaz.
const columns: EkGridColumn[] = [
  { key: 'name', label: 'Müşteri', sortable: true },
  { key: 'channel', label: 'Kaynak' },
  { key: 'phone', label: 'Telefon' },
  { key: 'email', label: 'E-posta', type: 'muted' },
  { key: 'region', label: 'Şehir', sortable: true },
  { key: 'orders', label: 'Sipariş', type: 'num' },
  { key: 'netRevenue', label: 'Net ciro', type: 'num' },
  { key: 'returnRate', label: 'İade oranı' },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
];

const SORT_FIELD: Record<string, string> = { name: 'firstName', region: 'addresses.city' };

const rows = computed(() => customers.value.map((c: any) => ({ ...c, fullName: [c.firstName, c.lastName].filter(Boolean).join(' ') || '—' })));

const getCustomersInternal = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
  const d = searchCustomerForm.data;
  applied.value = { globalSearch: d.globalSearch || '', cities: [...(d.cities || [])], status: d.status || null };

  try {
    const res = await restApi.post('CustomerService/getCustomers', prepareFilterPayload());
    if (isRequestError(res)) {
      loadError.value = true;
    } else if (res?.customers) {
      customers.value = res.customers;
      pagination.totalNumberOfRecords = res.totalNumberOfRecords || 0;
      pagination.totalNumberOfPages = res.totalNumberOfPages || 1;
    }
  } catch (e) {
    loadError.value = true;
    snackbarStore.addSnackbar({ text: "Veri yükleme hatası!", color: "error" });
  } finally {
    loading.value = false;
  }
};

const executeAction = async (endpoint: string, payload: any) => await restApi.post(endpoint, payload);

const {
  searchCustomerForm, pagination, sortBy, resetFilters, onSortUpdate, handlePageChange, prepareFilterPayload
} = useCustomerFilters(getCustomersInternal);

const gridSort = computed<EkGridSort>(() => {
  const current = sortBy.value[0];
  const key = Object.keys(SORT_FIELD).find(k => SORT_FIELD[k] === current?.key);
  return key ? { key, dir: current.order === 'asc' ? 'asc' : 'desc' } : null;
});

function onGridSort(sort: EkGridSort) {
  onSortUpdate(sort ? [{ key: SORT_FIELD[sort.key], order: sort.dir }] : [{ key: 'createdAt', order: 'desc' }]);
}

// Aktif filtre çipleri — SON SORGULANAN değerlerden.
const applied = ref<{ globalSearch: string; cities: string[]; status: string | null }>({ globalSearch: '', cities: [], status: null });

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const chips: EkActiveFilterChip[] = [];
  if (applied.value.globalSearch) chips.push({ key: 'globalSearch', label: 'Arama', value: applied.value.globalSearch });
  if (applied.value.cities.length) chips.push({ key: 'cities', label: 'Şehir', value: applied.value.cities.join(', ') });
  if (applied.value.status) chips.push({ key: 'status', label: 'Durum', value: STATUS_OPTIONS.find(o => o.value === applied.value.status)?.title ?? applied.value.status });
  return chips;
});

const panelFilterCount = computed(() => (applied.value.cities.length ? 1 : 0) + (applied.value.status ? 1 : 0));

function removeChip(key: string) {
  if (key === 'globalSearch') searchCustomerForm.data.globalSearch = '';
  if (key === 'cities') searchCustomerForm.data.cities = [];
  if (key === 'status') searchCustomerForm.data.status = null;
  getCustomers(true);
}

const { handleDelete, handleBulkDelete } = useCustomerActions(executeAction, snackbarStore, getCustomersInternal);

const onBulkDelete = () => handleBulkDelete(selectedCustomers.value as string[], actionDialog.value);

function onSearchInput(value: string) {
  searchCustomerForm.data.globalSearch = value;
  getCustomers(true);
}

function applyAdvancedFilters() {
  getCustomers(true);
}

function onPageSizeChange(size: number) {
  pagination.limit = size;
  handlePageChange(1);
}


async function getCustomers(resetPage: boolean = false) { await getCustomersInternal(resetPage); }



// A13 — yan sayfa hemen açılır (iskelet); hata boş kayıt gibi çizilmez (EkProblemState + Tekrar dene).
const detailState = ref({ id: '', loading: false, error: false });

async function loadDetail(id: string) {
  if (!id) return;
  detailState.value = { id, loading: true, error: false };
  const res: any = await restApi.post('CustomerService/getCustomerDetail', { customerId: id }).catch(() => null);
  if (detailState.value.id !== id) return; // başka müşteri açıldı
  if (!res || isRequestError(res) || isApiError(res) || !res._id) {
    detailState.value = { id, loading: false, error: true };
    return;
  }
  selectedCustomerForDetail.value = res;
  detailState.value = { id, loading: false, error: false };
}

const openDetailedReport = (item: any) => {
  selectedCustomerForDetail.value = null;
  editDialog.value.show = true;
  loadDetail(String(item._id));
};

function listContact(kind: 'phone' | 'email', raw: string, sourceMasked?: boolean) {
  const v = contactValue(kind, raw, { sourceMasked });
  if (v.hidden === 'marketplace') return 'Pazaryeri gizledi';
  if (v.hidden === 'anonymized') return 'Anonimleştirildi';
  return v.display ?? '—';
}

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

// C1.6 — müşteri anonimleştirme (CustomerService/anonymizeCustomer, admin).
const user = useUser();
const canAnonymize = computed(() => user.isTenantAdmin());
const anonymizeDialog = ref({ show: false, loading: false, customerId: '', name: '' });

function askAnonymize(customer: any) {
  if (!customer?._id) return;
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Müşteri';
  anonymizeDialog.value = { show: true, loading: false, customerId: String(customer._id), name };
}

async function anonymizeCustomer() {
  anonymizeDialog.value.loading = true;
  const res: any = await restApi.post('CustomerService/anonymizeCustomer', { customerId: anonymizeDialog.value.customerId });
  anonymizeDialog.value.loading = false;
  if (isApiError(res) || res?.success !== true) {
    const text = apiStatus(res) === 403
      ? 'Bu işlem için yönetici yetkisi gerekir.'
      : apiMessage(res, 'Müşteri anonimleştirilemedi — birkaç dakika sonra tekrar deneyin.');
    snackbarStore.addSnackbar({ text, color: 'error' });
    return;
  }
  anonymizeDialog.value.show = false;
  editDialog.value.show = false;
  snackbarStore.addSnackbar({ text: 'Müşterinin kişisel verileri anonimleştirildi.', color: 'success' });
  getCustomers();
}

const triggerDelete = (item: any) => handleDelete(item, actionDialog.value);


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
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .customerListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-customer {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-region {
  white-space: nowrap;
}

.ek-customer__name {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

.ek-row-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}

.ek-bulk-danger {
  color: var(--ek-color-error);
}
</style>
