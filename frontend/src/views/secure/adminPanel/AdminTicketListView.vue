<template>
  <div class="admin-view ticket-list-view d-flex flex-column">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <ConfirmationDialogComponent v-model="confirmDialog.show" :title="confirmDialog.title"
      :subtitle="confirmDialog.subtitle" :message="confirmDialog.message" :icon="confirmDialog.icon"
      :color="confirmDialog.color" :confirm-text="confirmDialog.confirmText" @confirm="confirmDialog.onConfirm"
      maxWidth="400px" />

    <!-- ek-pattern-exception: EkListPage/EkDataTable — talep listesi sunucu-taraflı sayfalama/sıralama yapar
         (`@update:options` ile limit/sortBy alır) ve admin-tickets.spec.ts `thead button:has(.mdi-plus)` ile
         `tbody tr` kancalarını sabitliyor; EkDataTable istemci-taraflıdır. Sunucu-taraflı varyant gelince (Aşama C) geçilecek. -->
    <EkPageHeader section="Yönetim" title="Destek Yönetimi"
      description="Talepleri filtreleyin, yanıtlayın veya yeni bir destek süreci başlatın." />

    <!-- Bilgi bandı -->
    <div class="info-banner" role="note">
      <v-icon size="20" class="info-banner__icon" aria-hidden="true">mdi-information-outline</v-icon>
      <div class="info-banner__text">
        <span class="info-banner__title">DESTEK MERKEZİ ANALİZİ</span>
        <span class="info-banner__body">Müşteri talepleri ve teknik destek biletlerini buradan
          yönetebilir ve cevaplayabilirsiniz.</span>
      </div>
    </div>

    <!-- Arama ve filtre -->
    <div class="d-flex align-center flex-wrap search-section">
      <v-text-field clearable density="compact" label="Talep No, Konu veya Mesaj Ara" variant="outlined" v-model="search"
        class="customTextField flex-grow-1" hide-details @keyup.enter.stop="loadTickets(true)"
        @click:clear="search = ''; loadTickets(true)">
        <template #append-inner>
          <v-btn icon variant="text" density="comfortable" @click.stop="loadTickets(true)"
            aria-label="Talepleri ara">
            <v-icon>mdi-magnify</v-icon>
          </v-btn>
        </template>
      </v-text-field>

      <div class="d-flex align-center filter-group">
        <div class="status-select-wrap">
          <v-select v-model="activeTab" :items="statusOptions" item-title="title" item-value="id" variant="outlined"
            density="compact" hide-details class="customTextField status-select-premium" aria-label="Talep durumu filtresi">
            <template v-slot:prepend-inner>
              <v-icon size="18">mdi-filter-outline</v-icon>
            </template>
          </v-select>
        </div>

        <v-btn @click="loadTickets(true)" icon variant="outlined" density="comfortable" :loading="loading"
          aria-label="Talepleri yenile">
          <v-icon>mdi-refresh</v-icon>
          <v-tooltip activator="parent" location="top">Yenile</v-tooltip>
        </v-btn>
      </div>
    </div>

    <!-- Tablo -->
    <div class="table-wrapper">
      <v-data-table-server v-model:sort-by="sortBy" :items="tickets" :items-length="pagination.total" :loading="loading"
        :headers="headers" class="pa-0 ma-0 custom-table desktop-table" fixed-header aria-label="Destek talepleri tablosu"
        @update:options="onOptionsUpdate">

        <template v-slot:header.actions>
          <div class="d-flex justify-end">
            <v-btn @click="openCreateDialog()" color="primary" icon density="comfortable"
              aria-label="Yeni talep başlat">
              <v-icon>mdi-plus</v-icon>
              <v-tooltip activator="parent" location="top">Yeni Talep Başlat</v-tooltip>
            </v-btn>
          </div>
        </template>

        <template v-slot:item="{ item }: any">
          <tr :key="item._id" @click="openTicket(item)" class="row-hover cursor-pointer">
            <td class="ticket-no">TKT-{{ item.ticketNumber }}</td>
            <td>
              <div class="d-flex flex-column">
                <span class="ticket-subject-cell">{{ item.subject }}</span>
                <span class="ticket-type-cell">{{ item.type }}</span>
              </div>
            </td>
            <td>
              <EkStatusChip tone="neutral" :label="`ID: ${item.clientId}`" />
            </td>
            <td>
              <EkStatusChip :tone="getPriorityTone(item.priority)" :label="item.priority" />
            </td>
            <td class="text-left">
              <EkStatusChip :tone="getStatusTone(item.status)" :label="formatStatus(item.status)" />
            </td>
            <td>
              <div class="d-flex flex-column">
                <span class="last-message line-clamp-1">
                  {{ item.lastMessageSnippet || 'Mesaj yok' }}
                </span>
                <span class="last-message-time">{{ formatDateTime(item.lastMessageAt) }}</span>
              </div>
            </td>
            <td>
              <div class="d-flex justify-end ga-2">
                <v-btn icon variant="text" density="comfortable" @click.stop="openTicket(item)"
                  :aria-label="`TKT-${item.ticketNumber} talebini yanıtla`">
                  <v-icon>mdi-message-reply-text-outline</v-icon>
                  <v-tooltip activator="parent" location="top">Cevapla</v-tooltip>
                </v-btn>
                <v-btn icon variant="text" density="comfortable"
                  @click.stop="confirmDelete(item)" :aria-label="`TKT-${item.ticketNumber} talebini sil`">
                  <v-icon>mdi-delete-sweep-outline</v-icon>
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
              :static="true" @setPage="loadTickets" />
          </div>
        </template>

        <template v-slot:no-data>
          <EkEmptyState v-if="!loading" variant="no-data" title="Talep bulunamadı."
            message="Filtreyi değiştirin veya yeni bir destek talebi başlatın." />
        </template>
      </v-data-table-server>
    </div>

    <AdminChatComponent v-model="chatDialog" :ticket="selectedTicket" @reply="handleReply" />

    <ActionDialogComponent v-model="createDialog.show" title="Yeni Destek Talebi Başlat"
      subtitle="Belirli bir dükkan için yeni bir destek süreci başlatın" icon="mdi-store-edit-outline" color="success"
      confirmText="TALEBİ OLUŞTUR" cancelText="İPTAL" :isLoading="createDialog.loading" @confirm="doCreateTicket"
      @cancel="createDialog.show = false" attach=".ticket-list-view" maxWidth="600px">
      <div class="pa-2">
        <v-autocomplete v-model="createDialog.targetClientId" :items="clients" item-title="name" item-value="clientId"
          label="Hedef Mağaza (Dükkan)" variant="outlined" density="compact" class="customTextField mb-4"
          prepend-inner-icon="mdi-store-outline" hide-details></v-autocomplete>

        <v-text-field v-model="createDialog.subject" label="Talep Konusu" variant="outlined" density="compact"
          class="customTextField mb-4" prepend-inner-icon="mdi-format-title" hide-details></v-text-field>

        <v-textarea v-model="createDialog.content" label="İlk Mesaj İçeriği" variant="outlined" density="compact"
          class="customTextField" prepend-inner-icon="mdi-text-box-outline" rows="4" hide-details></v-textarea>
      </div>
    </ActionDialogComponent>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import useRestApi from '@/composables/restapi';
import AdminChatComponent from '@/components/adminPanel/AdminChatComponent.vue';
import PaginationComponent from '@/components/PaginationComponent.vue';
import LoadingComponent from '@/components/LoadingComponent.vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import { useSnackbarStore } from '@/stores/snackbarStore';
import EkPageHeader from '@/components/ds/EkPageHeader.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';
import { formatDateTime } from '@/composables/format';
import type { StatusTone } from '@/design/status-map';

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();
const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".ticket-list-view");

const loading = ref(false);
const tickets = ref<any[]>([]);
const clients = ref<any[]>([]);
const activeTab = ref('ALL');
const search = ref('');
const chatDialog = ref(false);
const selectedTicket = ref<any>(null);

const statusOptions = [
  { title: 'TÜMÜ', id: 'ALL' },
  { title: 'AÇIK', id: 'OPEN' },
  { title: 'İŞLEMDE', id: 'IN_PROGRESS' },
  { title: 'ÇÖZÜLDÜ', id: 'RESOLVED' }
];

const createDialog = reactive({
  show: false,
  loading: false,
  targetClientId: null,
  subject: '',
  content: ''
});

const confirmDialog = reactive({
  show: false, title: '', subtitle: '', message: '', icon: '', color: 'error', confirmText: '',
  onConfirm: () => { }
});

const sortBy = ref<any[]>([{ key: 'lastMessageAt', order: 'desc' }]);
const pagination = reactive({
  page: 1,
  limit: 50,
  total: 0,
  totalNumberOfRecords: 0
});

const headers: any = [
  { title: 'TALEP NO', key: 'ticketNumber', align: 'start', sortable: true, width: '120px' },
  { title: 'KONU & TİP', key: 'subject', align: 'start', sortable: true },
  { title: 'DÜKKAN', key: 'clientId', align: 'start', sortable: true, width: '100px' },
  { title: 'ÖNCELİK', key: 'priority', align: 'start', sortable: true, width: '120px' },
  { title: 'DURUM', key: 'status', align: 'start', sortable: true, width: '120px' },
  { title: 'SON MESAJ', key: 'lastMessageAt', align: 'start', sortable: true, width: '180px' },
  { title: '', key: 'actions', align: 'end', sortable: false, width: '100px' },
];

async function loadTickets(resetPage = false) {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  const guid = loadingComponentRef.value?.info("Talepler yükleniyor...") || "loading";
  try {
    const payload = {
      status: activeTab.value,
      search: search.value,
      page: pagination.page,
      limit: pagination.limit,
      sortField: sortBy.value[0]?.key || 'lastMessageAt',
      sortOrder: sortBy.value[0]?.order === 'desc' ? -1 : 1
    };
    const res = await restApi.post('AdminService/getTickets', payload);
    if (res?.success) {
      tickets.value = res.tickets;
      pagination.total = res.total;
      pagination.totalNumberOfRecords = res.total;
    }

    // Load clients if not loaded (for create dialog)
    if (clients.value.length === 0) {
      const clientRes = await restApi.post('AdminService/getClients', { limit: 1000 });
      if (clientRes?.success) {
        clients.value = clientRes.clients.map((c: any) => ({
          clientId: Number(c.clientId),
          name: `${c.title} (${c.clientId})`
        }));
      }
    }
  } finally {
    loadingComponentRef.value?.remove(guid);
    loading.value = false;
  }
}

function onOptionsUpdate(options: any) {
  sortBy.value = options.sortBy;
  pagination.limit = options.itemsPerPage;
  loadTickets();
}

watch(activeTab, () => loadTickets(true));

function openCreateDialog() {
  createDialog.targetClientId = null;
  createDialog.subject = '';
  createDialog.content = '';
  createDialog.show = true;
}

async function doCreateTicket() {
  if (!createDialog.targetClientId || !createDialog.subject || !createDialog.content) {
    snackbarStore.addSnackbar({ text: 'Lütfen tüm alanları doldurunuz.', color: 'warning' });
    return;
  }
  createDialog.loading = true;
  try {
    const res = await restApi.post('AdminService/createTicket', {
      targetClientId: createDialog.targetClientId,
      subject: createDialog.subject,
      content: createDialog.content
    });
    if (res?.success) {
      snackbarStore.addSnackbar({ text: 'Talep başarıyla oluşturuldu.', color: 'success' });
      createDialog.show = false;
      loadTickets(true);
    }
  } finally {
    createDialog.loading = false;
  }
}

function openTicket(ticket: any) {
  selectedTicket.value = ticket;
  chatDialog.value = true;
}

async function handleReply({ ticketId, content }: any) {
  try {
    const res = await restApi.post('AdminService/replyToTicket', { ticketId, content });
    if (res?.success) {
      snackbarStore.addSnackbar({ text: 'Cevap gönderildi.', color: 'success' });
      loadTickets();
      chatDialog.value = false;
    }
  } catch (e) {
    snackbarStore.addSnackbar({ text: 'Hata oluştu.', color: 'error' });
  }
}

async function doDelete(ticket: any) {
  loading.value = true;
  try {
    const res = await restApi.post('AdminService/deleteTicket', { ticketId: ticket._id });
    if (res?.success) {
      snackbarStore.addSnackbar({ text: 'Talep başarıyla silindi.', color: 'success' });
      loadTickets();
    }
  } finally {
    loading.value = false;
    confirmDialog.show = false;
  }
}

function confirmDelete(ticket: any) {
  confirmDialog.title = 'Talebi Sil';
  confirmDialog.message = `TKT-${ticket.ticketNumber} numaralı talebi silmek istediğinizden emin misiniz?`;
  confirmDialog.icon = 'mdi-delete-alert';
  confirmDialog.color = 'error';
  confirmDialog.onConfirm = () => doDelete(ticket);
  confirmDialog.show = true;
}

function formatStatus(status: string) {
  const mapping: any = {
    'OPEN': 'AÇIK',
    'IN_PROGRESS': 'İŞLEMDE',
    'RESOLVED': 'ÇÖZÜLDÜ'
  };
  return mapping[status] || status;
}

function getStatusTone(status: string): StatusTone {
  switch (status) {
    case 'OPEN': return 'danger';
    case 'IN_PROGRESS': return 'warning';
    case 'RESOLVED': return 'success';
    default: return 'neutral';
  }
}

function getPriorityTone(priority: string): StatusTone {
  switch (priority) {
    case 'URGENT': return 'danger';
    case 'HIGH': return 'warning';
    case 'LOW': return 'neutral';
    default: return 'info';
  }
}

onMounted(() => {
  loadTickets();
});
</script>

<style scoped lang="scss">
.admin-view {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: var(--ek-space-6);
  gap: var(--ek-space-4);
  background-color: var(--ek-color-surface-muted);
}

.info-banner {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-warning-subtle);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.info-banner__icon {
  color: var(--ek-color-warning);
}

.info-banner__text {
  display: flex;
  flex-direction: column;
}

.info-banner__title {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  color: var(--ek-color-content-strong);
}

.info-banner__body {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-default);
}

.search-section {
  max-width: 1200px;
  gap: var(--ek-space-2);
}

.filter-group {
  gap: var(--ek-space-2);
}

.status-select-wrap {
  width: 180px;
}

.table-wrapper {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  overflow: hidden;
  flex-grow: 1;
  position: relative;
  min-height: 320px;
}

.desktop-table {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--ek-color-surface) !important;
}

.sticky-pagination-wrapper {
  position: sticky;
  bottom: 0;
  z-index: 10;
  background: var(--ek-color-surface);
  border-top: 1px solid var(--ek-color-border-default);
}

.row-hover {
  transition: background-color var(--ek-duration-base) var(--ek-easing-standard);

  &:hover {
    background-color: color-mix(in srgb, var(--ek-color-surface-sunken) 60%, transparent) !important;
  }
}

// Tablo başlık metni: `content-default` (slate-700) — tablo başlık zemininde AA (4,5:1).
:deep(.v-data-table-header__content) {
  span {
    font-size: var(--ek-font-size-xs) !important;
    color: var(--ek-color-content-default) !important;
  }
}

.status-select-premium :deep(.v-field__input) {
  font-size: var(--ek-font-size-xs) !important;
  font-weight: var(--ek-font-weight-semibold) !important;
  text-transform: uppercase;
}

// Metin rolleri: `content-subtle` (slate-400) metin için AA'yı geçemez → `content-muted`.
.ticket-no {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
}

.ticket-subject-cell {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ticket-type-cell {
  font-size: var(--ek-font-size-xs);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.last-message {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-default);
}

.last-message-time {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.cursor-pointer {
  cursor: pointer;
}

.line-clamp-1 {
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
