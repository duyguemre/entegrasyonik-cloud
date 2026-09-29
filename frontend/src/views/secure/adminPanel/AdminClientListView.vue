<template>
  <div class="adminClientListView d-flex flex-column pt-2">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef" />

    <!-- Search & Filter Bar -->
    <div class="d-flex pa-2 pt-0 pb-0 mt-1 mb-1 align-start flex-wrap search-section">

      <v-text-field clearable density="compact" label="Müşteri / Mağaza Ara" variant="outlined" v-model="search"
        bg-color="white" class="customTextField flex-grow-1" hide-details placeholder="Mağaza adı veya ID giriniz..."
        @keyup.enter.stop="loadClients()">
        <template #append-inner>
          <v-btn flat size="40" class="pa-2 search-icon-btn" elevation="0" color="white" @click.stop="loadClients()"
            aria-label="Mağazaları ara">
            <v-icon size="x-large" color="passiveColor">mdi-magnify</v-icon>
          </v-btn>
        </template>
      </v-text-field>

      <div class="d-flex align-center flex-wrap gap-2">
        <v-btn @click="loadClients()" size="40" elevation="0" color="white" class="premium-cube-btn cube-btn-bordered"
          aria-label="Listeyi yenile">
          <v-icon size="x-large" color="passiveColor">mdi-refresh</v-icon>
          <v-tooltip activator="parent" location="top">Yenile</v-tooltip>
        </v-btn>
      </div>
    </div>

    <!-- Table Section -->
    <div class="table-wrapper mt-1">
      <v-data-table-server v-model:sort-by="sortBy" :items="clients" :items-length="pagination.total"
        :loading="loading" :headers="headers" class="pa-0 ma-0 custom-table desktop-table" fixed-header
        aria-label="Mağazalar tablosu" @update:options="onOptionsUpdate">

        <template v-slot:no-data>
          <EmptyState title="Mağaza Bulunamadı"
            message="Listelenecek mağaza kaydı bulunamadı. Arama ölçütünü değiştirin veya listeyi yenileyin." />
        </template>

        <!-- Summary Bar inside Table Top Slot -->
        <template v-slot:top>
          <div class="table-summary-bar">
            <div class="summary-stat">
              <v-icon size="14" color="primary" class="mr-1">mdi-store-outline</v-icon>
              <span class="summary-label">Toplam Mağaza</span>
              <span class="summary-value">{{ clients.length }}</span>
            </div>
            <v-divider vertical class="mx-3 summary-divider" />
            <div class="summary-stat">
              <v-icon size="14" color="success" class="mr-1">mdi-check-circle-outline</v-icon>
              <span class="summary-label">Aktif Mağaza</span>
              <span class="summary-value text-success">{{ activeCount }}</span>
            </div>
            <v-divider vertical class="mx-3 summary-divider" />
            <div class="summary-stat">
              <v-icon size="14" color="error" class="mr-1">mdi-minus-circle-outline</v-icon>
              <span class="summary-label">Pasif</span>
              <span class="summary-value text-error">{{ (pagination.total || 0) - activeCount }}</span>
            </div>
            <v-spacer />
          </div>
        </template>

        <template v-slot:header.actions>
          <div class="d-flex justify-end">
            <v-btn @click="openCreateDialog()" color="success" class="premium-cube-btn" elevation="0" size="35"
              aria-label="Yeni mağaza oluştur">
              <v-icon size="large">mdi-plus</v-icon>
              <v-tooltip activator="parent" location="top">Yeni Mağaza Oluştur</v-tooltip>
            </v-btn>
          </div>
        </template>

        <template v-slot:item="{ item }: any">
          <tr :key="item._id" class="row-hover cursor-pointer" @click="viewDetail(item)">
            <td class="text-left py-2">
              <div class="d-flex align-center">
                <v-avatar size="32" color="slate-100" class="mr-3 border">
                  <span class="text-micro font-weight-black color-slate-700">{{ item.name?.[0] || 'C' }}</span>
                </v-avatar>
                <div class="d-flex flex-column">
                  <span class="text-subtitle-2 font-weight-black color-slate-900 leading-tight">
                    {{ item.name }}
                  </span>
                  <span class="text-micro font-weight-bold color-slate-500 mt-1 uppercase">
                    ID: {{ item.order }}
                  </span>
                </div>
              </div>
            </td>

            <td class="text-left font-weight-bold color-slate-700">{{ item.title }}</td>

            <td class="text-left">
              <v-chip size="small" :color="item.status === 'ACTIVE' ? 'success' : 'passiveColor'" variant="flat"
                class="font-weight-black">
                {{ item.status === 'ACTIVE' ? 'AKTİF' : 'PASİF' }}
              </v-chip>
            </td>

            <td class="text-right">
              <div class="d-flex justify-end gap-2 pr-1">
                <v-btn flat size="35" color="white" class="premium-cube-btn border-subtle" @click.stop="viewDetail(item)"
                  :aria-label="`${item.name} mağaza detaylarını görüntüle`">
                  <v-icon size="large" color="primary">mdi-eye-outline</v-icon>
                  <v-tooltip activator="parent" location="top">Detaylar</v-tooltip>
                </v-btn>
                <v-btn flat size="35" color="danger" class="premium-cube-btn"
                  @click.stop="confirmDelete(item)" :aria-label="`${item.name} mağazasını sil`">
                  <v-icon size="large" color="white">mdi-delete-sweep-outline</v-icon>
                  <v-tooltip activator="parent" location="top">Sil</v-tooltip>
                </v-btn>
              </div>
            </td>
          </tr>
        </template>

        <template v-slot:bottom>
          <div class="sticky-pagination-wrapper">
            <PaginationComponent v-model="pagination.page"
              :totalNumberOfPages="Math.ceil(pagination.total / pagination.limit)" :pagination="pagination"
              :static="true" @setPage="loadClients" />
          </div>
        </template>
      </v-data-table-server>
    </div>

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
import PaginationComponent from '@/components/PaginationComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import AdminClientDetailComponent from '@/components/adminPanel/AdminClientDetailComponent.vue';
import AdminClientCreateComponent from '@/components/adminPanel/AdminClientCreateComponent.vue';
import EmptyState from '@/components/layout/EmptyState.vue';

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();
const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".adminClientListView");

const search = ref('');
const clients = ref<any[]>([]);
const loading = ref(false);
const deleteDialog = ref(false);
const detailDialog = ref({ show: false });
const createDialog = ref({ show: false });
const selectedClient = ref<any>(null);

const sortBy = ref<any[]>([{ key: 'order', order: 'asc' }]);
const pagination = reactive({
  page: 1,
  limit: 50,
  total: 0,
  totalNumberOfRecords: 0 // PaginationComponent range calculation requires this
});

const headers: any = [
  { title: 'MAĞAZA ADI / ID', key: 'name', align: 'start', sortable: true },
  { title: 'BAŞLIK', key: 'title', align: 'start', sortable: true },
  { title: 'DURUM', key: 'status', align: 'start', sortable: true },
  { title: '', key: 'actions', align: 'end', sortable: false },
];

const activeCount = computed(() => clients.value.filter(c => c.status === 'ACTIVE').length);

const filteredClients = computed(() => {
  if (!search.value) return clients.value;
  const s = search.value.toLowerCase();
  return clients.value.filter(c =>
    c.name?.toLowerCase().includes(s) ||
    c.title?.toLowerCase().includes(s) ||
    c.order?.toString().includes(s)
  );
});

async function loadClients() {
  loading.value = true;
  const guid = loadingComponentRef.value?.info("Müşteriler yükleniyor...") || "loading";
  try {
    const payload = {
      search: search.value,
      page: pagination.page,
      limit: pagination.limit,
      sortField: sortBy.value[0]?.key || 'order',
      sortOrder: sortBy.value[0]?.order === 'desc' ? -1 : 1
    };
    const res = await restApi.post('AdminService/getClients', payload);
    if (res?.success) {
      clients.value = res.clients;
      pagination.total = res.total;
      pagination.totalNumberOfRecords = res.total;
    }
  } finally {
    loadingComponentRef.value?.remove(guid);
    loading.value = false;
  }
}

function onOptionsUpdate(options: any) {
  sortBy.value = options.sortBy;
  pagination.limit = options.itemsPerPage;
  loadClients();
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

<style scoped lang="scss">
.adminClientListView {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  // Çalışma alanı zemini: token setinde TAM eşleşen değer yok (en yakın `surface-muted`
  // slate-50, farklı bir ton) — ADR-0011 Açık Soru 4 gereği yakın-ama-farklı renk
  // ZORLANMADI, canlı değer olduğu gibi korundu (mandalda tek literal).
  background-color: #f5f7f9;
}

.search-section {
  max-width: 1200px;
  gap: var(--ek-space-2);
  background: transparent;
  z-index: 10;
}

.search-icon-btn {
  border: 1px solid var(--ek-color-surface);
}

// Yenile düğmesindeki (eski inline style) vurgulu kenarlık: legacy `borderColor` token'ı.
.cube-btn-bordered {
  border: 1px solid var(--ek-color-border-color);
}

.table-summary-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
  padding: var(--ek-space-2) var(--ek-space-4);
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.summary-stat {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  white-space: nowrap;
}

.summary-label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ek-color-content-muted);
  margin-right: var(--ek-space-1);
}

.summary-value {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-bold);
  // slate-800 için semantik token yok (content-strong = slate-900) — yakın-ama-farklı, zorlanmadı.
  color: #1e293b;
}

.summary-divider {
  opacity: 0.25;
  height: 20px !important;
  align-self: center;
}

.table-wrapper {
  flex-grow: 1;
  position: relative;
  min-height: 0;
}

.sticky-pagination-wrapper {
  position: sticky;
  bottom: 0;
  z-index: 10;
  background: var(--ek-color-surface);
  border-top: 1px solid var(--ek-color-border-default);
}

.desktop-table {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--ek-color-surface) !important;
}

.row-hover {
  transition: background-color var(--ek-duration-base) var(--ek-easing-standard);

  &:hover {
    // Eski değer: slate-100 %60 opaklık.
    background-color: color-mix(in srgb, var(--ek-color-surface-sunken) 60%, transparent) !important;
  }
}

.cursor-pointer {
  cursor: pointer;
}

.border-subtle {
  border: 1px solid var(--ek-color-surface-sunken);
}

.color-slate-900 {
  color: var(--ek-color-content-strong);
}

.color-slate-700 {
  color: var(--ek-color-content-default);
}

.color-slate-500 {
  color: var(--ek-color-content-muted);
}

.text-micro {
  font-size: var(--ek-font-size-xs);
}

.uppercase {
  text-transform: uppercase;
}

.gap-2 {
  gap: var(--ek-space-2);
}

:deep(.v-data-table-footer) {
  display: none !important;
}

// Tablo başlık metni: `content-muted` (slate-500) tablo başlık zemininde ~4,2:1'de kalıp AA'yı
// (4,5:1) geçemiyordu → `content-default` (slate-700).
:deep(.v-data-table-header__content) {
  span {
    font-size: var(--ek-font-size-xs) !important;
    font-weight: 800 !important;
    color: var(--ek-color-content-default) !important;
    letter-spacing: 0.5px;
  }
}

// `transition: all` yerine yalnızca değişen özellikler (işlevsel geri bildirim, 200ms ease-in-out).
.premium-cube-btn {
  border: 1px solid var(--ek-color-border-default);
  transition: background-color var(--ek-duration-base) var(--ek-easing-standard),
    border-color var(--ek-duration-base) var(--ek-easing-standard);
}
</style>
