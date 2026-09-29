<!--
  frontend/src/views/secure/supports/TicketListView.vue

  ADR-0015 B5-3 — GÖRSEL KATMAN (bkz. e2e/specs/support-tickets.spec.ts). Davranış/API sözleşmesi
  DEĞİŞMEDİ: `TicketService/getTickets` gövdesi (pagination/sortBy/searchTicketForm), useTicketFilters/
  useTicketActions composable'ları, detay diyaloğunun satır nesnesini DOĞRUDAN kullanması, CLOSED
  talepte "Kapat" eyleminin olmaması, toplu kapatma akışı AYNEN korundu.

  - Başlık/arama/yenile `EkListPage`'e taşındı (B1 emsali: MessageListView/OrderListView); arama,
    emsallerle AYNI şekilde yazdıkça `getTickets(true)` tetikler.
  - Tablo BİLEREK `v-data-table-server` olarak KORUNDU (AuthorizationListView emsali): DS
    `EkDataTable` sıralanabilir başlık desteklemiyor, ekran ise `onSortUpdate` ile backend'e
    `sortBy` gönderiyor.
  - Durum/öncelik rozetleri `EkStatusChip`'e taşındı (durum: paylaşılan `TICKET_STATUS_TONE`,
    öncelik: yerel `ticketPriorityTone.ts` — status-map.ts A-owned, dokunulmadı).
  - Karakterizasyon (DÜZELTİLMEDİ): `getTickets` hata durumunu yalnızca console'a yazar; ayrı bir
    hata görünümü YOKTUR — 500 de "Destek Talebi Bulunamadı" boş durumuna düşer.
-->
<template>
  <div class="ticketListView d-flex flex-column">
    <LoadingComponent attach=".ticketListView" ref="loadingComponentRef"></LoadingComponent>

    <!-- Diyaloglar -->
    <ConfirmationDialogComponent v-model="confirmDialog.show" :title="confirmDialog.title" attach=".ticketListView"
      :subtitle="confirmDialog.subtitle" :message="confirmDialog.message" :icon="confirmDialog.icon"
      :color="confirmDialog.color" :confirm-text="confirmDialog.confirmText" :confirm-icon="confirmDialog.confirmIcon"
      @confirm="confirmDialog.onConfirm" @cancel="confirmDialog.onCancel" maxWidth="400px" />

    <TicketCreateDialog v-model="isCreateDialogOpen" :loading="actionLoading" @confirm="handleCreateTicket" />

    <TicketDetailComponent v-model="isDetailOpen" :ticket="selectedTicketForDetail" @reply="handleSendReply" />

    <!-- Gelişmiş Filtre Diyalogu -->
    <ActionDialogComponent v-model="searchTicketForm.form.menu" title="Destek Filtreleri" attach=".ticketListView"
      subtitle="Durum, Öncelik ve Tip bazlı filtreleme" icon="mdi-filter-variant" color="passiveColor" maxWidth="600px"
      confirmText="SONUÇLARI GÖSTER" @confirm="getTickets(true); searchTicketForm.form.menu = false"
      @cancel="resetFilters()">
      <v-row dense>
        <v-col cols="12" sm="6">
          <v-select v-model="searchTicketForm.data.statuses" :items="statusOptions" item-title="title" item-value="id"
            label="Durumlar" variant="outlined" density="compact" multiple chips></v-select>
        </v-col>
        <v-col cols="12" sm="6">
          <v-select v-model="searchTicketForm.data.priorities" :items="priorityOptions" item-title="title"
            item-value="id" label="Öncelik Seviyesi" variant="outlined" density="compact" multiple chips></v-select>
        </v-col>
        <v-col cols="12">
          <v-select v-model="searchTicketForm.data.types" :items="typeOptions" item-title="title" item-value="id"
            label="Talep Tipleri" variant="outlined" density="compact" multiple chips></v-select>
        </v-col>
      </v-row>
    </ActionDialogComponent>

    <EkListPage
      section="Destek"
      title="Destek Talepleri"
      description="Destek ekibiyle yazışmalarınızı buradan takip edin ve yeni talep açın."
      :primary-action="{ label: 'Yeni Bilet Aç', icon: 'mdi-plus', onClick: () => (isCreateDialogOpen = true) }"
      :secondary-actions="[{ label: 'Filtreler', icon: 'mdi-filter-variant', onClick: () => (searchTicketForm.form.menu = true) }]"
      :search="searchTicketForm.data.globalSearch"
      search-placeholder="Destek No veya Konu Ara"
      :state="viewState"
      @update:search="onSearchInput"
      @clear-filters="resetFilters"
      @refresh="() => getTickets(true)"
    >
      <template #filters-extra>
        <v-menu v-model="startDateMenuInline" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedStartDate" label="Başlangıç" prepend-inner-icon="mdi-calendar-start"
              hide-details readonly clearable @click:clear="searchTicketForm.data.startDate = null" v-bind="props"
              class="ek-ticket-date"></v-text-field>
          </template>
          <v-card>
            <v-date-picker v-model="searchTicketForm.data.startDate" :max="searchTicketForm.data.endDate" hide-header
              locale="tr" color="primary" @update:model-value="startDateMenuInline = false"
              show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>

        <v-menu v-model="endDateMenuInline" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedEndDate" label="Bitiş" prepend-inner-icon="mdi-calendar-end"
              hide-details readonly clearable @click:clear="searchTicketForm.data.endDate = null" v-bind="props"
              class="ek-ticket-date"></v-text-field>
          </template>
          <v-card>
            <v-date-picker v-model="searchTicketForm.data.endDate" :min="searchTicketForm.data.startDate" hide-header
              locale="tr" color="primary" @update:model-value="endDateMenuInline = false"
              show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>
      </template>

      <template #empty>
        <EkEmptyState variant="no-results" title="Destek Talebi Bulunamadı"
          message="Arama kriterlerinize uygun herhangi bir destek talebi kaydı bulunamadı." />
      </template>

      <div class="ek-ticket-table-wrapper">
        <v-data-table-server v-if="$vuetify.display.mdAndUp" v-model="selectedTickets" v-model:sort-by="sortBy"
          item-value="_id" :itemsLength="pagination.totalNumberOfRecords" :items="tickets" fixed-header
          :headers="headers" show-select hide-default-footer @update:sortBy="onSortUpdate">

          <template v-slot:item="{ item }: any">
            <tr :key="item._id" :class="getStatusRowClass(item.status)">
              <td>
                <v-checkbox-btn :model-value="selectedTickets.includes(item._id)" color="primary"
                  :aria-label="`Talebi seç: ${item.ticketNumber}`"
                  @update:model-value="val => onTicketSelectionUpdate(item._id, !!val)"
                  density="compact"></v-checkbox-btn>
              </td>

              <td class="text-left py-2">
                <div class="d-flex align-center">
                  <v-avatar color="surface-muted" rounded="lg" size="32" class="mr-3">
                    <v-icon color="primary" size="18">mdi-ticket-outline</v-icon>
                  </v-avatar>
                  <div class="d-flex flex-column">
                    <span class="font-weight-semibold text-body-2 ek-num">{{ item.ticketNumber }}</span>
                    <span class="text-caption ek-muted">{{ translateType(item.type) }}</span>
                  </div>
                </div>
              </td>

              <td class="text-left py-2">
                <div class="d-flex flex-column ek-ticket-subject">
                  <span class="text-body-2 font-weight-medium text-truncate">{{ item.subject }}</span>
                  <span class="text-caption ek-muted text-truncate">{{ item.lastMessageSnippet }}</span>
                </div>
              </td>

              <td class="text-center">
                <EkStatusChip :tone="priorityTone(item.priority)" :label="translatePriority(item.priority)" />
              </td>

              <td class="text-left">
                <EkStatusChip :tone="statusTone(item.status)" :label="translateStatus(item.status)" />
              </td>

              <td class="text-left py-3">
                <div class="d-flex flex-column">
                  <span class="text-caption font-weight-medium ek-num">Aktif: {{ formatDate(item.lastMessageAt) }}</span>
                  <span class="text-caption ek-muted ek-num">Açılış: {{ formatDate(item.createdDate) }}</span>
                </div>
              </td>

              <td>
                <div class="d-flex justify-end ek-gap-1 pr-1">
                  <v-btn icon variant="text" density="comfortable" aria-label="Görüntüle / Yanıtla"
                    @click="openTicketDetail(item)">
                    <v-icon>mdi-message-text-outline</v-icon>
                    <v-tooltip activator="parent" location="top">Görüntüle / Yanıtla</v-tooltip>
                  </v-btn>
                  <v-btn v-if="item.status !== TicketStatusEnum.CLOSED" icon variant="text" density="comfortable"
                    color="success" aria-label="Kapat" @click="confirmCloseTicket(item)">
                    <v-icon>mdi-check-circle-outline</v-icon>
                    <v-tooltip activator="parent" location="top">Kapat</v-tooltip>
                  </v-btn>
                </div>
              </td>
            </tr>
          </template>
        </v-data-table-server>

        <!-- Mobil Görünüm -->
        <div v-else class="d-flex flex-column">
          <div class="ek-ticket-sort-bar d-flex align-center justify-space-between">
            <div class="d-flex align-center">
              <v-icon size="18" class="ek-muted mr-2">mdi-sort-variant</v-icon>
              <span class="text-caption font-weight-medium ek-muted">Sıralama</span>
            </div>
            <v-select v-model="mobileSortValue" :items="mobileSortOptions" item-title="title" item-value="value"
              density="compact" hide-details aria-label="Sıralama" class="ek-ticket-sort-select"
              @update:model-value="onMobileSortChange"></v-select>
          </div>

          <v-card v-for="item in tickets" :key="item._id" class="mb-3" variant="flat" border rounded="lg">
            <div class="d-flex align-center justify-space-between pa-3 ek-ticket-card-head">
              <div class="d-flex align-center ek-gap-2">
                <v-checkbox-btn :model-value="selectedTickets.includes(item._id)" color="primary" density="compact"
                  :aria-label="`Talebi seç: ${item.ticketNumber}`"
                  @update:model-value="val => onTicketSelectionUpdate(item._id, !!val)"></v-checkbox-btn>
                <span class="text-caption font-weight-semibold ek-num">{{ item.ticketNumber }}</span>
                <EkStatusChip :tone="priorityTone(item.priority)" :label="translatePriority(item.priority)" />
              </div>
              <EkStatusChip :tone="statusTone(item.status)" :label="translateStatus(item.status)" />
            </div>

            <div class="pa-3" @click="openTicketDetail(item)">
              <div class="text-body-2 font-weight-medium mb-2">{{ item.subject }}</div>
              <div class="ek-ticket-snippet text-caption ek-muted mb-3">{{ item.lastMessageSnippet }}</div>
              <div class="d-flex align-center justify-space-between">
                <span class="text-caption ek-muted ek-num">
                  <v-icon size="12" class="mr-1">mdi-clock-outline</v-icon>Son işlem: {{ formatDate(item.lastMessageAt) }}
                </span>
                <v-btn icon="mdi-message-text" variant="tonal" color="primary" density="comfortable"
                  aria-label="Görüntüle / Yanıtla" @click.stop="openTicketDetail(item)"></v-btn>
              </div>
            </div>
          </v-card>
        </div>
      </div>

      <template #pagination>
        <EkPagination :page="pagination.page" :page-size="pagination.limit" :total="pagination.totalNumberOfRecords"
          :page-size-options="[15, 25, 50, 100]" @update:page="onPageChange" @update:page-size="onPageSizeChange" />
      </template>
    </EkListPage>

    <!-- Toplu İşlem Menüsü -->
    <BatchProcessMenu :model-value="selectedTickets" title="Destek Talebi Seçildi" :actions="[
      { id: 'CLOSE', label: 'Toplu Kapat', icon: 'mdi-check-all', color: 'success', badgeCount: selectedTickets.length }
    ]" @action="handleBulkAction" @clear="selectedTickets = []" />
  </div>
</template>

<script setup lang="ts">
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
import LoadingComponent from '@/components/LoadingComponent.vue'
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue'
import BatchProcessMenu from '@/components/layout/BatchProcessMenu.vue'
import TicketDetailComponent from '@/components/ticket/TicketDetailComponent.vue'
import TicketCreateDialog from '@/components/ticket/TicketCreateDialog.vue'
import EkListPage from '@/components/ds/templates/EkListPage.vue'
import EkPagination from '@/components/ds/EkPagination.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'

// --- INITIALIZATION ---
const restApi = useRestApi()
const { t } = useI18n()
const loadingComponentRef = ref<any>(null)
const loading = ref(false)
const tickets = ref<any[]>([])
const selectedTickets = ref<string[]>([])
const actionLoading = ref(false)

// UI Menus
const startDateMenuInline = ref(false)
const endDateMenuInline = ref(false)
const isCreateDialogOpen = ref(false)
const isDetailOpen = ref(false)
const selectedTicketForDetail = ref<any>(null)

// Composables
const {
  searchTicketForm, pagination, sortBy,
  statusOptions, typeOptions, priorityOptions,
  formattedStartDate, formattedEndDate,
  resetFilters, onSortUpdate, handlePageChange
} = useTicketFilters(() => getTickets())

// --- MOBİL SIRALAMA ---
const mobileSortValue = ref('lastActivityAt_desc');
const mobileSortOptions = [
  { title: 'Son İşlem: En Yeni', value: 'lastActivityAt_desc' },
  { title: 'Son İşlem: En Eski', value: 'lastActivityAt_asc' },
  { title: 'Oluşturma: En Yeni', value: 'createdDate_desc' },
  { title: 'Oluşturma: En Eski', value: 'createdDate_asc' }
];

const onMobileSortChange = (val: string) => {
  const [key, order] = val.split('_');
  sortBy.value = [{ key, order: order as any }];
  getTickets(true);
};

const { createTicket, sendMessage, closeTicket } = useTicketActions(() => getTickets())

// Merkezi Onay Diyaloğu State
const confirmDialog = reactive({
  show: false, title: '', subtitle: '', message: '', icon: '', color: 'error', confirmIcon: '',
  confirmText: '', onConfirm: () => { }, onCancel: () => { }
});

const headers: any = [
  { title: 'Destek No & Tip', key: 'ticketNumber', sortable: true, align: 'start', width: '180px' },
  { title: 'Konu & Mesaj Snippet', key: 'subject', sortable: true, align: 'start', width: '300px' },
  { title: 'Öncelik', key: 'priority', sortable: true, align: 'center', width: '120px' },
  { title: 'Statü', key: 'status', sortable: true, align: 'left', width: '150px' },
  { title: 'Zamanlama', key: 'lastMessageAt', sortable: true, align: 'start', width: '180px' },
  { title: 'İşlemler', key: 'actions', sortable: false, align: 'end', width: '120px' },
]

// --- CORE ACTIONS ---

const getTickets = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  const guid = loadingComponentRef.value?.info() || "loading";

  try {
    const res = await restApi.post('TicketService/getTickets', {
      pagination: {
        page: pagination.page,
        limit: pagination.limit
      },
      sortBy: sortBy.value[0],
      searchTicketForm: searchTicketForm.value
    });

    if (res.tickets) {
      tickets.value = res.tickets;
      pagination.totalNumberOfRecords = res.totalNumberOfRecords || 0;
      pagination.totalNumberOfPages = Math.ceil(pagination.totalNumberOfRecords / pagination.limit) || 1;
    }
  } catch (error) {
    console.error('Biletler getirilirken hata:', error);
  } finally {
    loading.value = false;
    loadingComponentRef.value?.remove(guid);
  }
};

const handleCreateTicket = async (formData: any) => {
  actionLoading.value = true;
  const res = await createTicket(formData);
  if (res) isCreateDialogOpen.value = false;
  actionLoading.value = false;
};

const openTicketDetail = (item: any) => {
  selectedTicketForDetail.value = item;
  isDetailOpen.value = true;
};

const handleSendReply = async (payload: { ticketId: string, content: string }) => {
  const res = await sendMessage(payload.ticketId, payload.content);
  if (res) {
    // Local update to avoid full reload
    if (selectedTicketForDetail.value) {
      selectedTicketForDetail.value.messages = res.messages;
      selectedTicketForDetail.value.status = res.status;
      selectedTicketForDetail.value.lastMessageAt = res.lastMessageAt;
    }
    getTickets();
  }
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
        await closeTicket(id);
      }
      selectedTickets.value = [];
    };
    confirmDialog.show = true;
  }
};

const onTicketSelectionUpdate = (id: string, isSelected: boolean) => {
  if (isSelected) {
    if (!selectedTickets.value.includes(id)) selectedTickets.value.push(id);
  } else {
    selectedTickets.value = selectedTickets.value.filter(item => item !== id);
  }
};

// Karakterizasyon: ayrı bir hata durumu YOK (getTickets hatayı yalnızca console'a yazar) —
// boş liste, gerçek boş sonuç ile aynı "empty" görünümüne düşer.
const viewState = computed<'loading' | 'empty' | 'ready'>(() => {
  if (loading.value) return 'loading';
  if (!tickets.value?.length) return 'empty';
  return 'ready';
});

const onSearchInput = (value: string) => {
  searchTicketForm.value.data.globalSearch = value;
  getTickets(true);
};

const onPageChange = (page: number) => {
  pagination.page = page;
  handlePageChange();
};

const onPageSizeChange = (size: number) => {
  pagination.limit = size;
  pagination.page = 1;
  handlePageChange();
};

// --- UTILS ---
const formatDate = (date: any) => date ? new Date(date).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
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
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: var(--ek-space-6);
  gap: var(--ek-space-4);
}

.ek-ticket-table-wrapper {
  width: 100%;
}

.ek-ticket-date {
  min-width: 160px;
}

.ek-ticket-subject {
  max-width: 250px;
}

.ek-ticket-sort-bar {
  gap: var(--ek-space-3);
  padding: var(--ek-space-2) 0 var(--ek-space-3);
}

.ek-ticket-sort-select {
  max-width: 200px;
}

.ek-ticket-card-head {
  border-bottom: 1px dashed var(--ek-color-border-default);
}

.ek-ticket-snippet {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  padding: var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
}

/* Müşteri yanıtı bekleyen talepler (WAITING_CLIENT) satırda vurgulanır — orijinal davranış. */
.row-status-waiting_client {
  background-color: var(--ek-color-error-subtle) !important;
  box-shadow: inset 4px 0 0 var(--ek-color-danger);
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-gap-1 { gap: var(--ek-space-1); }
.ek-gap-2 { gap: var(--ek-space-2); }
</style>
