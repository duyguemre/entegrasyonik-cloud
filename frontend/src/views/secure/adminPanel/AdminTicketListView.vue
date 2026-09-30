<template>
  <div class="ticket-list-view">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <ConfirmationDialogComponent v-model="confirmDialog.show" :title="confirmDialog.title"
      :subtitle="confirmDialog.subtitle" :message="confirmDialog.message" :icon="confirmDialog.icon"
      :color="confirmDialog.color" :confirm-text="confirmDialog.confirmText" @confirm="confirmDialog.onConfirm"
      maxWidth="400px" />

    <!-- Aşama 3: "DESTEK MERKEZİ ANALİZİ" bilgi bandı kalktı — açıklamayı sayfa başlığı zaten taşıyor ve bant
         `warning` tonunu dekoratif amaçla kullanıyordu (renk anlamı kuralı: warning = dikkat/bekliyor). -->
    <EkListScreen
      section="Yönetim"
      class="ticket-list-view__screen"
      title="Destek Yönetimi"
      description="Talepleri filtreleyin, yanıtlayın veya yeni bir destek süreci başlatın."
      label="Destek talepleri tablosu"
      noun="talep"
      row-key="_id"
      label-key="ticketNumber"
      :columns="columns"
      :rows="tickets"
      :loading="loading"
      :error="loadError"
      error-title="Talepler yüklenemedi"
      :search="search"
      search-placeholder="Talep No, Konu veya Mesaj Ara"
      :chips="activeChips"
      :filter-count="panelFilterCount"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.total"
      empty-title="Talep bulunamadı."
      empty-text="Filtreyi değiştirin veya yeni bir destek talebi başlatın."
      empty-icon="mdi-lifebuoy"
      filtered-empty-title="Talep bulunamadı."
      filtered-empty-text="Filtreyi değiştirin veya yeni bir destek talebi başlatın."
      refresh-label="Talepleri yenile"
      @update:search="(v: string) => (search = v)"
      @search-submit="loadTickets(true)"
      @update:sort="onGridSort"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
      @filter-submit="loadTickets(true)"
      @filter-reset="clearFilters"
      @remove-chip="removeChip"
      @clear-filters="clearFilters"
      @refresh="loadTickets(true)"
      @row-click="openTicket"
    >
      <template #header-actions>
        <EkButton icon="mdi-plus" @click="openCreateDialog()">Yeni talep başlat</EkButton>
      </template>

      <template #filters>
        <v-select v-model="statusFilter" :items="statusOptions" item-title="title" item-value="id"
          label="Talep durumu" clearable />
      </template>

      <template #cell-ticketNumber="{ row }">TKT-{{ row.ticketNumber }}</template>
      <template #cell-subject="{ row }">
        <span class="ek-ticket-subject">
          <span class="ek-ticket-subject__title">{{ row.subject }}</span>
          <span class="ek-muted ek-ticket-subject__type">{{ TICKET_TYPE_LABELS[row.type as TicketTypeEnum] ?? row.type }}</span>
        </span>
      </template>
      <template #cell-clientId="{ row }">
        <EkStatusChip tone="neutral" :label="`ID: ${row.clientId}`" />
      </template>
      <template #cell-priority="{ row }">
        <EkStatusChip :tone="getPriorityTone(row.priority)" :label="TICKET_PRIORITY_LABELS[row.priority as TicketPriorityEnum] ?? row.priority" />
      </template>
      <template #cell-status="{ row }">
        <EkStatusChip :tone="getStatusTone(row.status)" :label="formatStatus(row.status)" />
      </template>
      <template #cell-lastMessageAt="{ row }">
        <span class="ek-ticket-last">
          <span class="ek-ticket-last__snippet">{{ row.lastMessageSnippet || 'Mesaj yok' }}</span>
          <span class="ek-muted ek-num">{{ formatDateTime(row.lastMessageAt) }}</span>
        </span>
      </template>
      <template #cell-actions="{ row }">
        <EkRowActions :label="`TKT-${row.ticketNumber} işlemleri`" :items="[
          { key: 'reply', action: 'send', icon: 'mdi-message-reply-text-outline', label: `TKT-${row.ticketNumber} talebini yanıtla`, inline: true, onClick: () => openTicket(row) },
          { key: 'delete', action: 'delete', label: `TKT-${row.ticketNumber} talebini sil`, inline: true, onClick: () => confirmDelete(row) },
        ]" />
      </template>
    </EkListScreen>

    <AdminChatComponent v-model="chatDialog" :ticket="selectedTicket" @reply="handleReply" />

    <ActionDialogComponent v-model="createDialog.show" title="Yeni Destek Talebi Başlat"
      subtitle="Belirli bir dükkan için yeni bir destek süreci başlatın" icon="mdi-store-edit-outline" color="success"
      confirmText="Talebi oluştur" cancelText="İptal" :isLoading="createDialog.loading" @confirm="doCreateTicket"
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
import EkRowActions from '@/components/ds/EkRowActions.vue'
import { ref, reactive, computed, onMounted } from 'vue';
import useRestApi from '@/composables/restapi';
import AdminChatComponent from '@/components/adminPanel/AdminChatComponent.vue';
import LoadingComponent from '@/components/LoadingComponent.vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import { useSnackbarStore } from '@/stores/snackbarStore';
import EkListScreen from '@/components/ds/templates/EkListScreen.vue';
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue';
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue';
import EkButton from '@/components/ds/EkButton.vue';
import { isRequestError } from '@/components/ds/listStandard';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import { formatDateTime } from '@/composables/format';
import type { StatusTone } from '@/design/status-map';
import { TICKET_PRIORITY_LABELS, TICKET_STATUS_COLORS, TICKET_STATUS_LABELS, TICKET_TYPE_LABELS, type TicketPriorityEnum, type TicketStatusEnum, type TicketTypeEnum } from '@/types/TicketTypes';

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();
const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".ticket-list-view");

const loading = ref(false);
const loadError = ref(false);
const tickets = ref<any[]>([]);
const clients = ref<any[]>([]);
const statusFilter = ref<string | null>(null);
const appliedStatus = ref<string | null>(null);
const appliedSearch = ref('');
const search = ref('');
const chatDialog = ref(false);
const selectedTicket = ref<any>(null);

const statusOptions = [
  { title: 'Açık', id: 'OPEN' },
  { title: 'İşlemde', id: 'IN_PROGRESS' },
  { title: 'Çözüldü', id: 'RESOLVED' }
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
  limit: 25,
  total: 0,
});

// DS-v2 liste standardı. Sıralama SUNUCUDA: AdminService.getTickets `sortField`/`sortOrder` alır.
const columns: EkGridColumn[] = [
  { key: 'ticketNumber', label: 'Talep no', type: 'id', sortable: true },
  { key: 'subject', label: 'Konu ve tip', sortable: true },
  { key: 'clientId', label: 'Dükkan', sortable: true },
  { key: 'priority', label: 'Öncelik', sortable: true },
  { key: 'status', label: 'Durum', sortable: true },
  { key: 'lastMessageAt', label: 'Son mesaj', sortable: true },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
];

const gridSort = computed<EkGridSort>(() => {
  const current = sortBy.value[0];
  return current?.key ? { key: current.key, dir: current.order === 'desc' ? 'desc' : 'asc' } : null;
});

function onGridSort(sort: EkGridSort) {
  sortBy.value = sort ? [{ key: sort.key, order: sort.dir }] : [{ key: 'lastMessageAt', order: 'desc' }];
  loadTickets(true);
}

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const chips: EkActiveFilterChip[] = [];
  if (appliedSearch.value) chips.push({ key: 'search', label: 'Arama', value: appliedSearch.value });
  if (appliedStatus.value) chips.push({ key: 'status', label: 'Durum', value: formatStatusLabel(appliedStatus.value) });
  return chips;
});

const panelFilterCount = computed(() => (appliedStatus.value ? 1 : 0));

function removeChip(key: string) {
  if (key === 'search') search.value = '';
  if (key === 'status') statusFilter.value = null;
  loadTickets(true);
}

function clearFilters() {
  search.value = '';
  statusFilter.value = null;
  loadTickets(true);
}

function formatStatusLabel(status: string) {
  return statusOptions.find((o) => o.id === status)?.title ?? status;
}

async function loadTickets(resetPage = false) {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
  appliedSearch.value = (search.value || '').trim();
  appliedStatus.value = statusFilter.value;
  try {
    const payload = {
      status: statusFilter.value || 'ALL',
      search: search.value,
      page: pagination.page,
      limit: pagination.limit,
      sortField: sortBy.value[0]?.key || 'lastMessageAt',
      sortOrder: sortBy.value[0]?.order === 'desc' ? -1 : 1
    };
    const res = await restApi.post('AdminService/getTickets', payload);
    if (isRequestError(res)) {
      loadError.value = true;
    } else if (res?.success) {
      tickets.value = res.tickets;
      pagination.total = res.total;
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
  } catch (e) {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

function onPageChange(page: number) {
  pagination.page = page;
  loadTickets();
}

function onPageSizeChange(size: number) {
  pagination.limit = size;
  loadTickets(true);
}

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
  confirmDialog.icon = 'mdi-trash-can-outline';
  confirmDialog.color = 'error';
  confirmDialog.onConfirm = () => doDelete(ticket);
  confirmDialog.show = true;
}

// Aşama 4: durum adı/tonu mağaza tarafındaki destek listesiyle tek kaynak (TicketTypes).
function formatStatus(status: string) {
  return TICKET_STATUS_LABELS[status as TicketStatusEnum] ?? status;
}

function getStatusTone(status: string): StatusTone {
  return (TICKET_STATUS_COLORS[status as TicketStatusEnum] as StatusTone | undefined) ?? 'neutral';
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

<style scoped>
.ticket-list-view {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  gap: var(--ek-space-3);
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .ticket-list-view {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.ticket-list-view__screen {
  flex: 1;
  height: auto;
  min-height: 0;
}






.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-ticket-subject,
.ek-ticket-last {
  display: inline-flex;
  flex-direction: column;
}

.ek-ticket-subject__title {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-ticket-subject__type {
  font-size: var(--ek-type-caption-size);
}

.ek-ticket-last__snippet {
  color: var(--ek-color-content-default);
}

.ek-row-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}
</style>
