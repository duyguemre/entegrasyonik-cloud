<!--
  frontend/src/views/secure/supports/TicketListView.vue

  DS-v2 Aşama 2 — liste standardı (EkListScreen). API sözleşmesi DEĞİŞMEDİ: `TicketService/getTickets`
  gövdesi (pagination/sortBy/searchTicketForm), useTicketActions, detay diyaloğunun satır nesnesini
  DOĞRUDAN kullanması, CLOSED talepte "Kapat" eyleminin olmaması, toplu kapatma akışı AYNEN korundu.
  Sıralama SUNUCUDA (ticketNumber, subject, priority, status, lastMessageAt). useTicketFilters
  yalnız durum kaynağı olarak kullanılır (sıfırlama/sıralama yerelde `getTickets(true)` ile).
-->
<template>
  <div class="ticketListView">
    <!-- Diyaloglar -->
    <ConfirmationDialogComponent v-model="confirmDialog.show" :title="confirmDialog.title" attach=".ticketListView"
      :subtitle="confirmDialog.subtitle" :message="confirmDialog.message" :icon="confirmDialog.icon"
      :color="confirmDialog.color" :confirm-text="confirmDialog.confirmText" :confirm-icon="confirmDialog.confirmIcon"
      @confirm="confirmDialog.onConfirm" @cancel="confirmDialog.onCancel" maxWidth="400px" />

    <TicketCreateDialog v-model="isCreateDialogOpen" :submit-ticket="createTicket" @view="openTicketDetail" />

    <TicketDetailComponent v-model="isDetailOpen" :ticket="selectedTicketForDetail" :send-reply="handleSendReply" />

    <EkListScreen
      section="Destek"
      title="Destek Talepleri"
      description="Destek ekibiyle yazışmalarınızı buradan takip edin ve yeni talep açın."
      label="Destek talepleri tablosu"
      noun="talep"
      row-key="_id"
      label-key="ticketNumber"
      :columns="columns"
      :rows="tickets"
      :row-class="(r) => getStatusRowClass(r.status)"
      :loading="loading"
      :error="loadError"
      error-title="Destek talepleri yüklenemedi"
      :search="searchTicketForm.data.globalSearch"
      search-placeholder="Destek No veya Konu Ara"
      :chips="activeChips"
      :filter-count="panelFilterCount"
      selectable
      v-model:selected="selectedTickets"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Destek talebi bulunamadı"
      empty-text="Destek ekibiyle yazışmalarınız burada listelenir."
      empty-icon="mdi-lifebuoy"
      filtered-empty-title="Destek talebi bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir destek talebi kaydı bulunamadı."
      @update:search="onSearchInput"
      @update:sort="onGridSort"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
      @filter-submit="getTickets(true)"
      @filter-reset="resetFilters"
      @remove-chip="removeChip"
      @clear-filters="resetFilters"
      @refresh="getTickets(true)"
    >
      <template #header-actions>
        <EkButton icon="mdi-plus" @click="isCreateDialogOpen = true">Yeni Bilet Aç</EkButton>
      </template>

      <template #filters>
        <v-select v-model="searchTicketForm.data.statuses" :items="statusOptions" item-title="title" item-value="id"
          label="Durumlar" multiple chips clearable />
        <v-select v-model="searchTicketForm.data.priorities" :items="priorityOptions" item-title="title"
          item-value="id" label="Öncelik Seviyesi" multiple chips clearable />
        <v-select v-model="searchTicketForm.data.types" :items="typeOptions" item-title="title" item-value="id"
          label="Talep Tipleri" multiple chips clearable />
        <EkDateField v-model="searchTicketForm.data.startDate" label="Başlangıç" :max="searchTicketForm.data.endDate" />
        <EkDateField v-model="searchTicketForm.data.endDate" label="Bitiş" :min="searchTicketForm.data.startDate" />
      </template>

      <template #bulk-actions>
        <EkButton size="sm" icon="mdi-check-all" @click="handleBulkAction('CLOSE')">
          Toplu Kapat ({{ selectedTickets.length }})
        </EkButton>
      </template>

      <template #cell-ticketNumber="{ row }">
        <span class="ek-ticket-id">
          <span class="ek-num ek-ticket-id__no">{{ row.ticketNumber }}</span>
          <span class="ek-ticket-muted">{{ translateType(row.type) }}</span>
        </span>
      </template>
      <template #cell-subject="{ row }">
        <span class="ek-ticket-subject">
          <span class="ek-ticket-subject__title">{{ row.subject }}</span>
          <span class="ek-ticket-muted ek-ticket-subject__snippet">{{ row.lastMessageSnippet }}</span>
        </span>
      </template>
      <template #cell-priority="{ row }">
        <EkStatusChip :tone="priorityTone(row.priority)" :label="translatePriority(row.priority)" />
      </template>
      <template #cell-status="{ row }">
        <EkStatusChip :tone="statusTone(row.status)" :label="translateStatus(row.status)" />
      </template>
      <template #cell-lastMessageAt="{ row }">
        <span class="ek-ticket-id">
          <span class="ek-num">Aktif: {{ formatDateTime(row.lastMessageAt) }}</span>
          <span class="ek-ticket-muted ek-num">Açılış: {{ formatDateTime(row.createdDate) }}</span>
        </span>
      </template>
      <template #cell-actions="{ row }">
        <EkRowActions :label="`${row.subject ?? 'Talep'} işlemleri`" :items="[
          { key: 'open', action: 'view', icon: 'mdi-message-text-outline', label: 'Görüntüle / Yanıtla', onClick: () => openTicketDetail(row) },
          ...(row.status !== TicketStatusEnum.CLOSED ? [{ key: 'close', action: 'approve' as const, icon: 'mdi-check-circle-outline', label: 'Kapat', onClick: () => confirmCloseTicket(row) }] : []),
        ]" />
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import EkRowActions, { type EkRowAction } from '@/components/ds/EkRowActions.vue'
import { ref, onMounted, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'

// Composables & Stores
import useRestApi from '@/composables/restapi'
import { useTicketFilters } from '@/components/ticket/composables/useTicketFilters'
import { useTicketActions } from '@/components/ticket/composables/useTicketActions'

// Types & Enums
import {
  TicketStatusEnum, TicketPriorityEnum, TicketTypeEnum,
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_TYPE_LABELS
} from '@/types/TicketTypes'
import { TICKET_STATUS_TONE } from '@/design/status-map'
import { TICKET_PRIORITY_TONE } from '@/components/ticket/composables/ticketPriorityTone'

// Components
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue'
import TicketDetailComponent from '@/components/ticket/TicketDetailComponent.vue'
import TicketCreateDialog from '@/components/ticket/TicketCreateDialog.vue'
import EkListScreen from '@/components/ds/templates/EkListScreen.vue'
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue'
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkDateField from '@/components/ds/EkDateField.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import { isRequestError } from '@/components/ds/listStandard'
import { formatDate as formatDay, formatDateTime } from '@/composables/format'

// --- INITIALIZATION ---
const restApi = useRestApi()
const { t } = useI18n()
const loading = ref(false)
const loadError = ref(false)
const tickets = ref<any[]>([])
const selectedTickets = ref<Array<string | number>>([])

// UI
const isCreateDialogOpen = ref(false)
const isDetailOpen = ref(false)
const selectedTicketForDetail = ref<any>(null)

// Composables
const {
  searchTicketForm, pagination, sortBy,
  statusOptions, typeOptions, priorityOptions
} = useTicketFilters(() => getTickets())

const { createTicket, sendMessage, closeTicket } = useTicketActions(() => getTickets())

// Merkezi Onay Diyaloğu State
const confirmDialog = reactive({
  show: false, title: '', subtitle: '', message: '', icon: '', color: 'error', confirmIcon: '',
  confirmText: '', onConfirm: () => { }, onCancel: () => { }
});

// DS-v2 liste standardı. TicketService.getTickets `sortBy.key` ile SUNUCUDA sıralar
// (anahtar = kayıt alanı); sıralanabilir kolonlar: destek no, konu, öncelik, statü, zamanlama.
const columns: EkGridColumn[] = [
  { key: 'ticketNumber', label: 'Destek no & tip', sortable: true },
  { key: 'subject', label: 'Konu & mesaj', sortable: true },
  { key: 'priority', label: 'Öncelik', sortable: true },
  { key: 'status', label: 'Statü', sortable: true },
  { key: 'lastMessageAt', label: 'Zamanlama', sortable: true },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
]

const gridSort = computed<EkGridSort>(() => {
  const current = sortBy.value?.[0]
  return current ? { key: current.key, dir: current.order === 'asc' ? 'asc' : 'desc' } : null
})

const onGridSort = (sort: EkGridSort) => {
  sortBy.value = sort ? [{ key: sort.key, order: sort.dir }] : []
  getTickets(true)
}

// Aktif filtre çipleri — SON SORGULANAN değerlerden.
type TicketFilterData = typeof searchTicketForm.value.data
const applied = ref<TicketFilterData>({ ...searchTicketForm.value.data })

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const a = applied.value
  const chips: EkActiveFilterChip[] = []
  if (a.globalSearch) chips.push({ key: 'globalSearch', label: 'Arama', value: a.globalSearch })
  if (a.statuses.length) chips.push({ key: 'statuses', label: 'Durum', value: a.statuses.map(translateStatus).join(', ') })
  if (a.priorities.length) chips.push({ key: 'priorities', label: 'Öncelik', value: a.priorities.map(translatePriority).join(', ') })
  if (a.types.length) chips.push({ key: 'types', label: 'Tip', value: a.types.map(translateType).join(', ') })
  if (a.startDate) chips.push({ key: 'startDate', label: 'Başlangıç', value: formatDay(a.startDate) })
  if (a.endDate) chips.push({ key: 'endDate', label: 'Bitiş', value: formatDay(a.endDate) })
  return chips
})

const panelFilterCount = computed(() => activeChips.value.filter(c => c.key !== 'globalSearch').length)

const removeChip = (key: string) => {
  const d = searchTicketForm.value.data as Record<string, any>
  d[key] = Array.isArray(d[key]) ? [] : key === 'globalSearch' ? '' : null
  getTickets(true)
}

const resetFilters = () => {
  searchTicketForm.value.data = {
    globalSearch: '', startDate: null, endDate: null, statuses: [], types: [], priorities: []
  }
  getTickets(true)
}

// --- CORE ACTIONS ---

const getTickets = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
  const d = searchTicketForm.value.data;
  applied.value = { ...d, statuses: [...d.statuses], types: [...d.types], priorities: [...d.priorities] };

  try {
    const res = await restApi.post('TicketService/getTickets', {
      pagination: {
        page: pagination.page,
        limit: pagination.limit
      },
      sortBy: sortBy.value[0],
      searchTicketForm: searchTicketForm.value
    });

    if (isRequestError(res)) {
      loadError.value = true;
    } else if (res.tickets) {
      tickets.value = res.tickets;
      pagination.totalNumberOfRecords = res.totalNumberOfRecords || 0;
      pagination.totalNumberOfPages = Math.ceil(pagination.totalNumberOfRecords / pagination.limit) || 1;
    }
  } catch (error) {
    loadError.value = true;
    console.error('Biletler getirilirken hata:', error);
  } finally {
    loading.value = false;
  }
};

const openTicketDetail = (item: any) => {
  selectedTicketForDetail.value = item;
  isDetailOpen.value = true;
};

const handleSendReply = async (payload: { ticketId: string, content: string }) => {
  const result = await sendMessage(payload.ticketId, payload.content);
  if (result.ok && selectedTicketForDetail.value) {
    // Local update to avoid full reload
    const res = result.ticket;
    selectedTicketForDetail.value.messages = res.messages;
    selectedTicketForDetail.value.status = res.status;
    selectedTicketForDetail.value.lastMessageAt = res.lastMessageAt;
    getTickets();
  }
  return result;
};

const confirmCloseTicket = (item: any) => {
  confirmDialog.title = 'TALEBİ KAPAT';
  confirmDialog.message = `${item.ticketNumber} numaralı destek talebi kapatılacak. Emin misiniz?`;
  confirmDialog.color = 'success';
  confirmDialog.confirmIcon = 'mdi-check-circle-outline';
  confirmDialog.onConfirm = async () => {
    confirmDialog.show = false;
    await closeTicket(item._id);
  };
  confirmDialog.show = true;
};

const handleBulkAction = (actionId: string) => {
  if (actionId === 'CLOSE') {
    confirmDialog.title = 'TOPLU KAPATMA';
    confirmDialog.message = `${selectedTickets.value.length} adet destek talebi kapatılacak. Emin misiniz?`;
    confirmDialog.onConfirm = async () => {
      confirmDialog.show = false;
      for (const id of selectedTickets.value) {
        await closeTicket(String(id));
      }
      selectedTickets.value = [];
    };
    confirmDialog.show = true;
  }
};

const onSearchInput = (value: string) => {
  searchTicketForm.value.data.globalSearch = value;
  getTickets(true);
};

const onPageChange = (page: number) => {
  pagination.page = page;
  getTickets();
};

const onPageSizeChange = (size: number) => {
  pagination.limit = size;
  getTickets(true);
};

// --- UTILS ---
const translateStatus = (s: any) => TICKET_STATUS_LABELS[s as TicketStatusEnum] || s;
const statusTone = (s: any) => TICKET_STATUS_TONE[s as TicketStatusEnum]?.tone || 'neutral';
const translatePriority = (p: any) => TICKET_PRIORITY_LABELS[p as TicketPriorityEnum] || p;
const priorityTone = (p: any) => TICKET_PRIORITY_TONE[p as TicketPriorityEnum] || 'neutral';
const translateType = (t: any) => TICKET_TYPE_LABELS[t as TicketTypeEnum] || t;
const getStatusRowClass = (status: string) => `row-status-${(status || '').toLowerCase()}`;

onMounted(() => getTickets());
</script>

<style scoped>
.ticketListView {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .ticketListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.ek-ticket-id,
.ek-ticket-subject {
  display: flex;
  flex-direction: column;
}

.ek-ticket-id__no,
.ek-ticket-subject__title {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-medium);
}

.ek-ticket-subject {
  max-width: 320px;
}

.ek-ticket-subject__title,
.ek-ticket-subject__snippet {
  overflow: hidden;
  text-overflow: ellipsis;
}

.ek-ticket-muted {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-row-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}

/* Müşteri yanıtı bekleyen talepler (WAITING_CLIENT) satırda vurgulanır — orijinal davranış. */
:deep(.row-status-waiting_client) {
  background-color: var(--ek-color-error-subtle);
  box-shadow: inset 4px 0 0 var(--ek-color-danger);
}
</style>
