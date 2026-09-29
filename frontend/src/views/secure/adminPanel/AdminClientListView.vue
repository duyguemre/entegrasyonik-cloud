<template>
  <div class="adminClientListView d-flex flex-column pt-2">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef" />

    <div class="pa-2 pt-0">
      <EkPageHeader section="Yönetim" title="Mağaza Yönetimi"
        description="Sistemdeki tüm mağazaları buradan yönetin, yeni mağaza oluşturun." />
    </div>

    <!-- Search & Filter Bar -->
    <div class="d-flex pa-2 pt-0 pb-0 mb-1 align-start flex-wrap search-section">
      <v-text-field clearable label="Müşteri / Mağaza Ara" v-model="search"
        class="flex-grow-1" hide-details placeholder="Mağaza adı veya ID giriniz..."
        @keyup.enter.stop="loadClients()">
        <template #append-inner>
          <v-btn icon variant="text" density="comfortable" @click.stop="loadClients()"
            aria-label="Mağazaları ara"><v-icon>mdi-magnify</v-icon></v-btn>
        </template>
      </v-text-field>

      <div class="d-flex align-center flex-wrap ga-2">
        <v-btn icon variant="outlined" density="comfortable" @click="loadClients()"
          aria-label="Listeyi yenile">
          <v-icon>mdi-refresh</v-icon>
          <v-tooltip activator="parent" location="top">Yenile</v-tooltip>
        </v-btn>
      </div>
    </div>

    <!-- ek-pattern-exception: EkDataTable — e2e/specs/admin-clients.spec.ts satır 66/85/104 sıralı DOM
         kancalarına bağlıdır (`tbody tr` içinde `button:has(.mdi-eye-outline)`/`button:has(.mdi-delete-
         sweep-outline)`, `thead button:has(.mdi-plus)`); Ek A'da AÇIKÇA korunan yapılar ("tbody tr /
         thead button yapıları"). `EkDataTable` başlık hücrelerine slot SUNMUYOR — hedef aşama: spec
         kancası `data-testid`'e taşınınca (BACKLOG), bu tablo `EkDataTable`'a geçirilecek. -->
    <div class="table-wrapper mt-1">
      <v-data-table-server v-model:sort-by="sortBy" :items="clients" :items-length="pagination.total"
        :loading="loading" :headers="headers" class="pa-0 ma-0 desktop-table" fixed-header
        aria-label="Mağazalar tablosu" @update:options="onOptionsUpdate">

        <template v-slot:no-data>
          <EkEmptyState variant="no-results" title="Mağaza Bulunamadı"
            message="Listelenecek mağaza kaydı bulunamadı. Arama ölçütünü değiştirin veya listeyi yenileyin." />
        </template>

        <!-- Summary Bar inside Table Top Slot -->
        <template v-slot:top>
          <div class="table-summary-bar">
            <div class="summary-stat">
              <v-icon size="14" color="primary" class="mr-1">mdi-store-outline</v-icon>
              <span class="summary-label">Toplam Mağaza</span>
              <span class="summary-value ek-num">{{ clients.length }}</span>
            </div>
            <v-divider vertical class="mx-3 summary-divider" />
            <div class="summary-stat">
              <v-icon size="14" color="success" class="mr-1">mdi-check-circle-outline</v-icon>
              <span class="summary-label">Aktif Mağaza</span>
              <span class="summary-value summary-value--success ek-num">{{ activeCount }}</span>
            </div>
            <v-divider vertical class="mx-3 summary-divider" />
            <div class="summary-stat">
              <v-icon size="14" color="error" class="mr-1">mdi-minus-circle-outline</v-icon>
              <span class="summary-label">Pasif</span>
              <span class="summary-value summary-value--error ek-num">{{ (pagination.total || 0) - activeCount }}</span>
            </div>
            <v-spacer />
          </div>
        </template>

        <template v-slot:header.actions>
          <div class="d-flex justify-end">
            <v-btn icon variant="text" density="comfortable" color="primary" @click="openCreateDialog()"
              aria-label="Yeni mağaza oluştur">
              <v-icon>mdi-plus</v-icon>
              <v-tooltip activator="parent" location="top">Yeni Mağaza Oluştur</v-tooltip>
            </v-btn>
          </div>
        </template>

        <template v-slot:item="{ item }: any">
          <tr :key="item._id" class="row-hover cursor-pointer" @click="viewDetail(item)">
            <td class="text-left py-2">
              <div class="d-flex align-center">
                <v-avatar size="32" color="neutral-subtle" class="mr-3 border">
                  <span class="avatar-initial">{{ item.name?.[0] || 'C' }}</span>
                </v-avatar>
                <div class="d-flex flex-column">
                  <span class="cell-title">{{ item.name }}</span>
                  <span class="cell-overline mt-1">ID: {{ item.order }}</span>
                </div>
              </div>
            </td>

            <td class="text-left cell-muted">{{ item.title }}</td>

            <td class="text-left">
              <EkStatusChip :tone="storeStatusTone(item.status === 'ACTIVE').tone" :label="$t(storeStatusTone(item.status === 'ACTIVE').labelKey)" />
            </td>

            <td class="text-right">
              <div class="d-flex justify-end ga-1 pr-1">
                <v-btn icon variant="text" density="comfortable" @click.stop="viewDetail(item)"
                  :aria-label="`${item.name} mağaza detaylarını görüntüle`">
                  <v-icon color="primary">mdi-eye-outline</v-icon>
                  <v-tooltip activator="parent" location="top">Detaylar</v-tooltip>
                </v-btn>
                <v-btn icon variant="text" density="comfortable" @click.stop="confirmDelete(item)"
                  :aria-label="`${item.name} mağazasını sil`">
                  <v-icon color="error">mdi-delete-sweep-outline</v-icon>
                  <v-tooltip activator="parent" location="top">Sil</v-tooltip>
                </v-btn>
              </div>
            </td>
          </tr>
        </template>

        <template v-slot:bottom>
          <div class="sticky-pagination-wrapper">
            <EkPagination :page="pagination.page" :page-size="pagination.limit" :total="pagination.total"
              @update:page="onPageChange" @update:page-size="onPageSizeChange" />
          </div>
        </template>
      </v-data-table-server>
    </div>

    <!-- Modals -->
    <AdminClientDetailComponent v-model="detailDialog.show" :client="selectedClient"
      @close="detailDialog.show = false" @refresh="loadClients" />

    <AdminClientCreateComponent v-model="createDialog.show" @close="createDialog.show = false" @refresh="loadClients" />

    <!-- ek-pattern-exception: EkConfirmDialog — `role="alertdialog"` `getByRole('dialog')` bekleyen
         mevcut spec ile (e2e/specs/admin-clients.spec.ts:105) çakışıyor (bkz. SubscriptionView.vue AYNI
         A-yaması bulgusu). `ConfirmationDialogComponent` (varsayılan `role="dialog"`) KORUNDU. -->
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
import EkPageHeader from '@/components/ds/EkPageHeader.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkPagination from '@/components/ds/EkPagination.vue';
import { storeStatusTone } from '@/design/status-map';

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
  totalNumberOfRecords: 0
});

const headers: any = [
  { title: 'MAĞAZA ADI / ID', key: 'name', align: 'start', sortable: true },
  { title: 'BAŞLIK', key: 'title', align: 'start', sortable: true },
  { title: 'DURUM', key: 'status', align: 'start', sortable: true },
  { title: '', key: 'actions', align: 'end', sortable: false },
];

const activeCount = computed(() => clients.value.filter(c => c.status === 'ACTIVE').length);

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

function onPageChange(page: number) {
  pagination.page = page;
  loadClients();
}

function onPageSizeChange(size: number) {
  pagination.limit = size;
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
  background: var(--ek-color-background);
}

.search-section {
  max-width: 1200px;
  gap: var(--ek-space-2);
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
  font-weight: var(--ek-font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--ek-color-content-muted);
  margin-right: var(--ek-space-1);
}

.summary-value {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.summary-value--success { color: var(--ek-color-success); }
.summary-value--error { color: var(--ek-color-error); }

.summary-divider {
  opacity: 0.6;
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

/* A-yaması bulgusu (B3, AdminTicketListView.vue'daki AYNI bulgu): `EkPagination`'ın sayfa-başına
   seçicisinin yüzen etiketi Vuetify varsayılan rengi+opaklığıyla AA'nın altında kalıyor; `ds/**`
   dokunulmaz olduğu için burada yerel olarak düzeltildi. */
:deep(.ek-pagination__page-size .v-field-label) {
  color: var(--ek-color-content-default) !important;
  opacity: 1 !important;
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
    background-color: var(--ek-color-surface-muted) !important;
  }
}

.cursor-pointer {
  cursor: pointer;
}

.avatar-initial {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.cell-title {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.cell-overline {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.cell-muted {
  color: var(--ek-color-content-default);
  font-weight: var(--ek-font-weight-medium);
}

:deep(.v-data-table-footer) {
  display: none !important;
}

// Tablo başlık metni: `content-muted` tablo başlık zemininde AA kontrastı için `content-default`.
:deep(.v-data-table-header__content) {
  span {
    font-size: var(--ek-font-size-xs) !important;
    font-weight: var(--ek-font-weight-semibold) !important;
    color: var(--ek-color-content-default) !important;
    letter-spacing: 0.04em;
  }
}
</style>
