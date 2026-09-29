<template>
  <div class="adminClientListView">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef" />

    <EkListScreen
      title="Mağaza Yönetimi"
      description="Platformdaki tüm mağaza kayıtlarını görüntüleyin, oluşturun ve yönetin."
      label="Mağazalar tablosu"
      noun="mağaza"
      row-key="_id"
      label-key="name"
      :columns="columns"
      :rows="clients"
      :loading="loading"
      :error="loadError"
      error-title="Mağazalar yüklenemedi"
      :search="search"
      search-placeholder="Müşteri / Mağaza Ara"
      :chips="activeChips"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.total"
      empty-title="Mağaza Bulunamadı"
      empty-text="Listelenecek mağaza kaydı bulunamadı. Arama ölçütünü değiştirin veya listeyi yenileyin."
      empty-icon="mdi-store-outline"
      filtered-empty-title="Mağaza Bulunamadı"
      filtered-empty-text="Listelenecek mağaza kaydı bulunamadı. Arama ölçütünü değiştirin veya listeyi yenileyin."
      refresh-label="Listeyi yenile"
      @update:search="(v: string) => (search = v)"
      @search-submit="loadClients(true)"
      @update:sort="onGridSort"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
      @remove-chip="removeChip"
      @clear-filters="removeChip"
      @refresh="loadClients()"
      @row-click="viewDetail"
    >
      <template #header-actions>
        <EkButton icon="mdi-plus" @click="openCreateDialog()">Yeni mağaza oluştur</EkButton>
      </template>

      <template #toolbar-start>
        <span class="ek-admin-summary">
          <span class="ek-admin-summary__item">Toplam Mağaza <strong>{{ clients.length }}</strong></span>
          <span class="ek-admin-summary__item">Aktif Mağaza <strong class="is-success">{{ activeCount }}</strong></span>
          <span class="ek-admin-summary__item">Pasif <strong class="is-danger">{{ (pagination.total || 0) - activeCount }}</strong></span>
        </span>
      </template>

      <template #cell-name="{ row }">
        <span class="ek-admin-name">
          <span class="ek-admin-name__title">{{ row.name }}</span>
          <span class="ek-muted ek-num">ID: {{ row.order }}</span>
        </span>
      </template>
      <template #cell-status="{ row }">
        <EkStatusChip :tone="row.status === 'ACTIVE' ? 'success' : 'neutral'" :label="row.status === 'ACTIVE' ? 'AKTİF' : 'PASİF'" />
      </template>
      <template #cell-actions="{ row }">
        <span class="ek-row-actions" @click.stop>
          <EkButton tone="ghost" size="sm" icon="mdi-eye-outline" icon-only :aria-label="`${row.name} mağaza detaylarını görüntüle`" @click="viewDetail(row)" />
          <EkButton tone="ghost" size="sm" icon="mdi-delete-sweep-outline" icon-only :aria-label="`${row.name} mağazasını sil`" @click="confirmDelete(row)" />
        </span>
      </template>
    </EkListScreen>

    <!-- Modals -->
    <AdminClientDetailComponent v-model="detailDialog.show" :client="selectedClient"
      @close="detailDialog.show = false" @refresh="loadClients" />

    <AdminClientCreateComponent v-model="createDialog.show" @close="createDialog.show = false" @refresh="loadClients" />

    <ConfirmationDialogComponent v-model="deleteDialog" title="Müşteri Sil"
      message="Bu müşteriyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz." confirmText="Evet, Sil"
      color="error" icon="mdi-delete-alert" @confirm="doDelete" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';
import LoadingComponent from '@/components/LoadingComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import AdminClientDetailComponent from '@/components/adminPanel/AdminClientDetailComponent.vue';
import AdminClientCreateComponent from '@/components/adminPanel/AdminClientCreateComponent.vue';
import EkListScreen from '@/components/ds/templates/EkListScreen.vue';
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue';
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue';
import EkButton from '@/components/ds/EkButton.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import { isRequestError } from '@/components/ds/listStandard';

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();
const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".adminClientListView");

const search = ref('');
const appliedSearch = ref('');
const clients = ref<any[]>([]);
const loading = ref(false);
const loadError = ref(false);
const deleteDialog = ref(false);
const detailDialog = ref({ show: false });
const createDialog = ref({ show: false });
const selectedClient = ref<any>(null);

const sortBy = ref<any[]>([{ key: 'order', order: 'asc' }]);
const pagination = reactive({
  page: 1,
  // Eski v-data-table-server ilk istekte Vuetify varsayılanı 10'u yazıyordu; sunucuya giden limit AYNI kalsın.
  limit: 10,
  total: 0,
});

// DS-v2 liste standardı. Sıralama SUNUCUDA: AdminService.getClients `sortField`i
// CLIENT_SORT_FIELDS izin listesinden (order, clientId, title, name, status, …) alır.
const columns: EkGridColumn[] = [
  { key: 'name', label: 'Mağaza adı / ID', sortable: true },
  { key: 'title', label: 'Başlık', sortable: true },
  { key: 'status', label: 'Durum', sortable: true },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
];

const gridSort = computed<EkGridSort>(() => {
  const current = sortBy.value[0];
  return current?.key ? { key: current.key, dir: current.order === 'desc' ? 'desc' : 'asc' } : null;
});

function onGridSort(sort: EkGridSort) {
  sortBy.value = sort ? [{ key: sort.key, order: sort.dir }] : [{ key: 'order', order: 'asc' }];
  loadClients(true);
}

const activeChips = computed<EkActiveFilterChip[]>(() =>
  appliedSearch.value ? [{ key: 'search', label: 'Arama', value: appliedSearch.value }] : []
);

function removeChip() {
  search.value = '';
  loadClients(true);
}

const activeCount = computed(() => clients.value.filter(c => c.status === 'ACTIVE').length);

async function loadClients(resetPage: boolean = false) {
  if (resetPage === true) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
  appliedSearch.value = (search.value || '').trim();
  try {
    const payload = {
      search: search.value,
      page: pagination.page,
      limit: pagination.limit,
      sortField: sortBy.value[0]?.key || 'order',
      sortOrder: sortBy.value[0]?.order === 'desc' ? -1 : 1
    };
    const res = await restApi.post('AdminService/getClients', payload);
    if (isRequestError(res)) {
      loadError.value = true;
    } else if (res?.success) {
      clients.value = res.clients;
      pagination.total = res.total;
    }
  } catch (e) {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

function onPageChange(page: number) {
  pagination.page = page;
  loadClients();
}

function onPageSizeChange(size: number) {
  pagination.limit = size;
  loadClients(true);
}

function openCreateDialog() {
  createDialog.value.show = true;
}

function viewDetail(client: any) {
  selectedClient.value = client;
  detailDialog.value.show = true;
}

function confirmDelete(client: any) {
  selectedClient.value = client;
  deleteDialog.value = true;
}

async function doDelete() {
  if (!selectedClient.value) return;
  const guid = loadingComponentRef.value?.info("Müşteri siliniyor...") || "loading";
  try {
    const res = await restApi.post('AdminService/deleteClient', { targetClientId: selectedClient.value.order });
    if (res?.success) {
      snackbarStore.addSnackbar({ text: 'Mağaza başarıyla silindi.', color: 'success' });
      loadClients();
    }
  } catch (e: any) {
    snackbarStore.addSnackbar({ text: e.message || 'Silme hatası!', color: 'error' });
  } finally {
    loadingComponentRef.value?.remove(guid);
    deleteDialog.value = false;
  }
}

onMounted(() => {
  loadClients();
});
</script>

<style scoped>
.adminClientListView {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .adminClientListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-admin-summary {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-4);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-admin-summary strong {
  margin-left: var(--ek-space-1);
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-admin-summary strong.is-success {
  color: var(--ek-color-success-emphasis);
}

.ek-admin-summary strong.is-danger {
  color: var(--ek-color-error-emphasis);
}

.ek-admin-name {
  display: inline-flex;
  flex-direction: column;
}

.ek-admin-name__title {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-row-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}
</style>
