<template>
  <div class="admin-view ticket-list-view d-flex flex-column">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <ConfirmationDialogComponent v-model="confirmDialog.show" :title="confirmDialog.title"
      :subtitle="confirmDialog.subtitle" :message="confirmDialog.message" :icon="confirmDialog.icon"
      :color="confirmDialog.color" :confirm-text="confirmDialog.confirmText" @confirm="confirmDialog.onConfirm"
      maxWidth="400px" />

    <!-- Info Banner -->
    <div class="pa-4 pb-0">
      <v-alert border="start" density="compact" color="warning" variant="tonal" class="rounded-xl premium-info-banner">
        <template v-slot:prepend>
          <div class="info-icon-box mr-3">
            <v-icon size="20">mdi-information-outline</v-icon>
          </div>
        </template>
        <div class="d-flex flex-column">
          <span class="text-caption font-weight-black color-slate-700 line-height-1">DESTEK MERKEZİ ANALİZİ</span>
          <span class="text-micro font-weight-bold color-slate-500">Müşteri talepleri ve teknik destek biletlerini buradan
            yönetebilir ve cevaplayabilirsiniz.</span>
        </div>
      </v-alert>
    </div>

    <!-- Search & Filters Section -->
    <div class="d-flex pa-4 pt-2 pb-0 align-center flex-wrap search-section">
      <v-text-field clearable density="compact" label="Talep No, Konu veya Mesaj Ara" variant="outlined" v-model="search"
        bg-color="white" class="customTextField flex-grow-1" hide-details @keyup.enter.stop="loadTickets(true)"
        @click:clear="search = ''; loadTickets(true)">
        <template #append-inner>
          <v-btn flat size="40" class="pa-2 search-icon-btn" elevation="0" color="white" @click.stop="loadTickets(true)"
            aria-label="Talepleri ara">
            <v-icon size="x-large" color="passiveColor">mdi-magnify</v-icon>
          </v-btn>
        </template>
      </v-text-field>

      <div class="d-flex align-center filter-group">
        <div class="status-select-wrap">
          <v-select v-model="activeTab" :items="statusOptions" item-title="title" item-value="id" variant="outlined"
            density="compact" hide-details class="customTextField status-select-premium" aria-label="Talep durumu filtresi">
            <template v-slot:prepend-inner>
              <v-icon size="18" color="passiveColor">mdi-filter-outline</v-icon>
            </template>
          </v-select>
        </div>

        <v-btn @click="loadTickets(true)" size="40" elevation="0" color="white" class="premium-cube-btn cube-btn-bordered"
          :loading="loading" aria-label="Talepleri yenile">
          <v-icon size="x-large" color="passiveColor">mdi-refresh</v-icon>
          <v-tooltip activator="parent" location="top">Yenile</v-tooltip>
        </v-btn>
      </div>
    </div>

    <!-- Table Section -->
    <div class="table-wrapper mt-2">
      <v-data-table-server v-model:sort-by="sortBy" :items="tickets" :items-length="pagination.total" :loading="loading"
        :headers="headers" class="pa-0 ma-0 custom-table desktop-table" fixed-header aria-label="Destek talepleri tablosu"
        @update:options="onOptionsUpdate">

        <template v-slot:header.actions>
          <div class="d-flex justify-end">
            <v-btn @click="openCreateDialog()" color="success" class="premium-cube-btn" elevation="0" size="35"
              aria-label="Yeni talep başlat">
              <v-icon size="large">mdi-plus</v-icon>
              <v-tooltip activator="parent" location="top">Yeni Talep Başlat</v-tooltip>
            </v-btn>
          </div>
        </template>

        <template v-slot:item="{ item }: any">
          <tr :key="item._id" @click="openTicket(item)" class="cursor-pointer">
            <td class="font-weight-black color-slate-400">TKT-{{ item.ticketNumber }}</td>
            <td>
              <div class="d-flex flex-column">
                <span class="text-subtitle-2 font-weight-black color-slate-900">{{ item.subject }}</span>
                <span class="text-micro font-weight-bold color-slate-500 uppercase">{{ item.type }}</span>
              </div>
            </td>
            <td>
              <v-chip size="x-small" color="slate-100" class="font-weight-black color-slate-700 border-subtle">
                ID: {{ item.clientId }}
              </v-chip>
            </td>
            <td>
              <v-chip size="x-small" :color="getPriorityColor(item.priority)" variant="flat"
                class="font-weight-black text-white px-3">
                {{ item.priority }}
              </v-chip>
            </td>
            <td class="text-left">
              <v-chip size="small" variant="flat" :color="getStatusColor(item.status)"
                class="text-white font-weight-black">
                {{ formatStatus(item.status) }}
              </v-chip>
            </td>
            <td>
              <div class="d-flex flex-column">
                <span class="text-micro font-weight-bold color-slate-600 line-clamp-1">
                  {{ item.lastMessageSnippet || 'Mesaj yok' }}
                </span>
                <span class="text-micro color-slate-400">{{ formatTime(item.lastMessageAt) }}</span>
              </div>
            </td>
            <td>
              <div class="d-flex justify-end ga-2">
                <v-btn flat size="35" color="white" class="premium-cube-btn border-subtle" @click.stop="openTicket(item)"
                  :aria-label="`TKT-${item.ticketNumber} talebini yanıtla`">
                  <v-icon size="large" color="primary">mdi-message-reply-text-outline</v-icon>
                  <v-tooltip activator="parent" location="top">Cevapla</v-tooltip>
                </v-btn>
                <v-btn flat size="35" color="danger" class="premium-cube-btn"
                  @click.stop="confirmDelete(item)" :aria-label="`TKT-${item.ticketNumber} talebini sil`">
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
              :static="true" @setPage="loadTickets" />
          </div>
        </template>

        <template v-slot:no-data>
          <div class="text-center py-10" v-if="!loading">
            <v-icon color="slate-200" size="64">mdi-ticket-outline</v-icon>
            <p class="mt-4 text-caption color-slate-400 font-weight-bold">Talep bulunamadı.</p>
          </div>
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

function getStatusColor(status: string) {
  switch (status) {
    case 'OPEN': return 'error';
    case 'IN_PROGRESS': return 'warning';
    case 'RESOLVED': return 'success';
    default: return 'passiveColor';
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'URGENT': return 'error';
    case 'HIGH': return 'orange';
    case 'MEDIUM': return 'info';
    case 'LOW': return 'passiveColor';
    default: return 'info';
  }
}

const formatTime = (date: any) => date ? new Date(date).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

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
  overflow: hidden;
  // Çalışma alanı zemini: token setinde TAM eşleşen değer yok — ADR-0011 Açık Soru 4 gereği
  // yakın-ama-farklı renk ZORLANMADI (canlı değer korundu; mandalda tek literal).
  background-color: #f5f7f9;
}

.search-section {
  max-width: 1200px;
  gap: var(--ek-space-2);
}

.search-icon-btn {
  border: 1px solid var(--ek-color-surface);
}

.filter-group {
  gap: var(--ek-space-2);
}

.status-select-wrap {
  width: 180px;
}

// Yenile düğmesindeki (eski inline style) vurgulu kenarlık: legacy `borderColor` token'ı.
.cube-btn-bordered {
  border: 1px solid var(--ek-color-border-color);
}

.table-wrapper {
  flex-grow: 1;
  position: relative;
  min-height: 0;
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

// Uyarı (amber) tonlu bilgi bandı: amber-50/amber-200/amber-600 için semantik token yok (yalnızca
// `warning-subtle` = amber-100 var) — canlı bespoke değerler ZORLANMADI (ADR-0011 Açık Soru 4);
// zemin tonu `--banner-tint` ile TEK yerde tanımlanır (eskiden iki yerde tekrar yazılıyordu).
.premium-info-banner {
  --banner-tint: #fffbeb;
  background: linear-gradient(to right, var(--ek-color-surface), var(--banner-tint));
  border: 1px solid #fde68a !important;
}

.info-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--banner-tint);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ek-color-warning-subtle);
  color: #d97706;
}

.premium-cube-btn {
  border: 1px solid var(--ek-color-border-default);
  transition: background-color var(--ek-duration-base) var(--ek-easing-standard),
    border-color var(--ek-duration-base) var(--ek-easing-standard);
}

.line-height-1 {
  line-height: 1.4 !important;
}

// Tablo başlık metni: global `custom-table` başlık rengi tablo başlık zemininde ~4,35:1'de kalıp AA'yı
// (4,5:1) geçemiyordu → `content-default` (slate-700); boyut xs (12px).
:deep(.v-data-table-header__content) {
  span {
    font-size: var(--ek-font-size-xs) !important;
    color: var(--ek-color-content-default) !important;
  }
}

.status-select-premium :deep(.v-field__input) {
  font-size: var(--ek-font-size-xs) !important;
  font-weight: 800 !important;
  text-transform: uppercase;
}

.color-slate-900 {
  color: var(--ek-color-content-strong);
}

.color-slate-700 {
  color: var(--ek-color-content-default);
}

// slate-600 için semantik token yok (content-default=700, content-muted=500) — yakın-ama-farklı,
// zorlanmadı.
.color-slate-600 {
  color: #475569;
}

.color-slate-500 {
  color: var(--ek-color-content-muted);
}

// Bu sınıf yalnızca METİN için kullanılıyor (talep no, son mesaj zamanı, boş-durum notu):
// `content-subtle` (slate-400) beyazda 2,56:1 ile AA'yı geçemez ve token belgesi metin için
// kullanımı yasaklar → `content-muted` (4,76:1).
.color-slate-400 {
  color: var(--ek-color-content-muted);
}

.text-micro {
  font-size: var(--ek-font-size-xs);
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
