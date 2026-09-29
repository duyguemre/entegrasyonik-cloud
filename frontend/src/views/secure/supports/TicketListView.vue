<template>
  <div class="ticketListView d-flex flex-column pt-4">
    <LoadingComponent attach=".ticketListView" ref="loadingComponentRef"></LoadingComponent>

    <!-- Diyaloglar -->
    <ConfirmationDialogComponent v-model="confirmDialog.show" :title="confirmDialog.title" attach=".ticketListView"
      :subtitle="confirmDialog.subtitle" :message="confirmDialog.message" :icon="confirmDialog.icon"
      :color="confirmDialog.color" :confirm-text="confirmDialog.confirmText" :confirm-icon="confirmDialog.confirmIcon"
      @confirm="confirmDialog.onConfirm" @cancel="confirmDialog.onCancel" maxWidth="400px" />

    <TicketCreateDialog v-model="isCreateDialogOpen" :loading="actionLoading" @confirm="handleCreateTicket" />

    <TicketDetailComponent v-model="isDetailOpen" :ticket="selectedTicketForDetail" @reply="handleSendReply" />

    <!-- Arama ve Filtre Bölümü -->
    <div class="d-flex pa-2 pt-2 pb-0 mt-0 mb-1 align-start flex-wrap search-section"
      style="max-width:1200px; gap: 8px;">

      <v-text-field clearable density="compact" label="Destek No veya Konu Ara" variant="outlined"
        v-model="searchTicketForm.data.globalSearch" bg-color="textfieldColor" class="customTextField flex-grow-1"
        hide-details @keyup.enter.stop="getTickets(true)"
        @click:clear="searchTicketForm.data.globalSearch = ''; getTickets(true)">
        <template #append-inner>
          <v-btn flat size="40" class="pa-2" elevation="0" color="white" @click.stop="getTickets(true)"
            style="border:1px solid white">
            <v-icon size="x-large" color="processButtonColor">mdi-magnify</v-icon>
          </v-btn>
        </template>
      </v-text-field>

      <div class="d-flex align-center flex-wrap mobile-controls-group" style="gap: 8px;">
        <v-menu v-model="startDateMenuInline" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedStartDate" label="Başlangıç" variant="outlined" density="compact"
              bg-color="white" prepend-inner-icon="mdi-calendar-start" hide-details readonly clearable
              @click:clear="searchTicketForm.data.startDate = null" v-bind="props" class="customTextField date-input"
              style="min-width: 160px;"></v-text-field>
          </template>
          <v-card class="rounded-lg">
            <v-date-picker v-model="searchTicketForm.data.startDate" :max="searchTicketForm.data.endDate" hide-header
              locale="tr" color="passiveColor" @update:model-value="startDateMenuInline = false"
              style="background-color: rgb(var(--v-theme-loginColor))!important;" show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>

        <v-menu v-model="endDateMenuInline" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedEndDate" label="Bitiş" variant="outlined" density="compact"
              bg-color="white" prepend-inner-icon="mdi-calendar-end" hide-details readonly clearable
              @click:clear="searchTicketForm.data.endDate = null" v-bind="props" class="customTextField date-input"
              style="min-width: 160px;"></v-text-field>
          </template>
          <v-card class="rounded-lg">
            <v-date-picker v-model="searchTicketForm.data.endDate" :min="searchTicketForm.data.startDate" hide-header
              locale="tr" color="passiveColor" style="background-color: rgb(var(--v-theme-loginColor))!important;"
              @update:model-value="endDateMenuInline = false" show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>

        <div class="d-flex gap-2">
          <v-btn @click="searchTicketForm.form.menu = true" size="40" elevation="0" color="white"
            class="premium-cube-btn" style="border:1px solid rgb(var(--v-theme-borderColor));">
            <v-icon size="x-large" color="passiveColor">mdi-filter-variant</v-icon>
            <v-tooltip activator="parent" location="top">Filtreler</v-tooltip>
          </v-btn>
          <v-btn @click="getTickets(true)" size="40" elevation="0" color="white" class="premium-cube-btn "
            style="border:1px solid rgb(var(--v-theme-borderColor));">
            <v-icon size="x-large" color="passiveColor">mdi-refresh</v-icon>
            <v-tooltip activator="parent" location="top">Yenile</v-tooltip>
          </v-btn>
          <v-btn @click="isCreateDialogOpen = true" size="40" elevation="0" color="success" class="premium-cube-btn">
            <v-icon size="x-large">mdi-plus</v-icon>
            <v-tooltip activator="parent" location="top">Yeni Bilet Aç</v-tooltip>
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Gelişmiş Filtre Diyalogu -->
    <ActionDialogComponent v-model="searchTicketForm.form.menu" title="Destek Filtreleri" attach=".ticketListView"
      subtitle="Durum, Öncelik ve Tip bazlı filtreleme" icon="mdi-filter-variant" color="passiveColor" maxWidth="600px"
      confirmText="SONUÇLARI GÖSTER" @confirm="getTickets(true); searchTicketForm.form.menu = false"
      @cancel="resetFilters()">
      <v-row dense>
        <v-col cols="12" sm="6">
          <v-select v-model="searchTicketForm.data.statuses" :items="statusOptions" item-title="title" item-value="id"
            label="Durumlar" variant="outlined" density="compact" multiple chips class="customTextField"></v-select>
        </v-col>
        <v-col cols="12" sm="6">
          <v-select v-model="searchTicketForm.data.priorities" :items="priorityOptions" item-title="title"
            item-value="id" label="Öncelik Seviyesi" variant="outlined" density="compact" multiple chips
            class="customTextField"></v-select>
        </v-col>
        <v-col cols="12">
          <v-select v-model="searchTicketForm.data.types" :items="typeOptions" item-title="title" item-value="id"
            label="Talep Tipleri" variant="outlined" density="compact" multiple chips
            class="customTextField"></v-select>
        </v-col>
      </v-row>
    </ActionDialogComponent>

    <!-- Tablo Bölümü -->
    <div class="table-wrapper mt-2">
      <v-data-table-server v-if="$vuetify.display.mdAndUp" v-model="selectedTickets" v-model:sort-by="sortBy"
        item-value="_id" :loading="loading" :itemsLength="pagination.totalNumberOfRecords" :items="tickets" fixed-header
        :headers="headers" class="pa-0 ma-0 desktop-table" show-select @update:sortBy="onSortUpdate">

        <template v-slot:no-data>
          <EmptyState title="Destek Talebi Bulunamadı" message="Arama kriterlerinize uygun herhangi bir destek talebi kaydı bulunamadı." />
        </template>

        <template v-slot:item="{ item }: any">
          <tr :key="item._id" :class="getStatusRowClass(item.status)">
            <td>
              <v-checkbox-btn :model-value="selectedTickets.includes(item._id)" color="passiveColor"
                @update:model-value="val => onTicketSelectionUpdate(item._id, !!val)"
                density="compact"></v-checkbox-btn>
            </td>

            <td class="text-left py-2">
              <div class="d-flex align-center">
                <v-avatar color="indigo-lighten-5" rounded="lg" size="32" class="mr-3">
                  <v-icon color="indigo-darken-3" size="18">mdi-ticket-outline</v-icon>
                </v-avatar>
                <div class="d-flex flex-column">
                  <span class="font-weight-black text-body-2 text-indigo-darken-3">{{ item.ticketNumber }}</span>
                  <span class="text-micro font-weight-bold text-grey-darken-3">{{ translateType(item.type) }}</span>
                </div>
              </div>
            </td>

            <td class="text-left py-2">
              <div class="d-flex flex-column">
                <span class="text-caption font-weight-black color-slate-900 text-truncate" style="max-width: 250px;">
                  {{ item.subject }}
                </span>
                <span class="text-micro text-passiveColor font-weight-bold text-truncate" style="max-width: 250px;">
                  {{ item.lastMessageSnippet }}
                </span>
              </div>
            </td>

            <td class="text-center">
              <v-chip size="small" variant="tonal" :color="getPriorityColor(item.priority)"
                class="font-weight-black px-3">
                {{ translatePriority(item.priority) }}
              </v-chip>
            </td>

            <td class="text-left">
              <v-chip size="small" variant="flat" :color="getStatusColor(item.status)"
                class="text-white font-weight-black">
                {{ translateStatus(item.status) }}
              </v-chip>
            </td>

            <td class="text-left py-3">
              <div class="d-flex flex-column">
                <span class="text-grey-darken-4 font-weight-black" style="font-size: 11px;">Aktif: {{
                  formatDate(item.lastMessageAt) }}</span>
                <span class="text-micro text-passiveColor font-weight-bold">Açılış: {{ formatDate(item.createdDate)
                  }}</span>
              </div>
            </td>

            <td>
              <div class="d-flex justify-end gap-2 pr-1">
                <v-btn flat size="35" color="white" class="premium-cube-btn " @click="openTicketDetail(item)">
                  <v-icon size="large" color="passiveColor">mdi-message-text-outline</v-icon>
                  <v-tooltip activator="parent" location="top">Görüntüle / Yanıtla</v-tooltip>
                </v-btn>
                <v-btn v-if="item.status !== TicketStatusEnum.CLOSED" flat size="35" color="success"
                  class="premium-cube-btn" @click="confirmCloseTicket(item)">
                  <v-icon size="large">mdi-check-circle-outline</v-icon>
                  <v-tooltip activator="parent" location="top">Kapat</v-tooltip>
                </v-btn>
              </div>
            </td>
          </tr>
        </template>

        <template v-slot:bottom>
          <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
            @setPage="handlePageChange" v-model="pagination.page" style="position:relative;border-top:1px solid #ddd" />
        </template>
      </v-data-table-server>

      <!-- Mobil Görünüm -->
      <div v-else class="mobile-tickets-list d-flex flex-column h-100">
        <div
          class="mobile-sort-bar d-flex align-center justify-space-between px-3 py-2 bg-white border-bottom-subtle shadow-sm">
          <div class="d-flex align-center">
            <v-icon size="18" color="passiveColor" class="mr-2">mdi-sort-variant</v-icon>
            <span class="text-micro font-weight-black color-slate-500 uppercase">Sıralama</span>
          </div>
          <div style="width: 170px;">
            <v-select v-model="mobileSortValue" :items="mobileSortOptions" item-title="title" item-value="value"
              variant="outlined" density="compact" hide-details class="customTextField sort-select-mobile"
              @update:model-value="onMobileSortChange">
              <template v-slot:selection="{ item }">
                <span class="text-micro font-weight-bold color-slate-700 uppercase">{{ item.title }}</span>
              </template>
            </v-select>
          </div>
        </div>

        <div class="pa-2 overflow-y-auto flex-grow-1 bg-slate-50 d-flex flex-column" style="padding-bottom: 90px !important;">
          <div v-if="loading" class="pa-2">
            <v-skeleton-loader v-for="n in 4" :key="n" type="list-item-avatar-three-line" class="mb-3 rounded-lg" />
          </div>
          <template v-else>
            <EmptyState v-if="!tickets?.length" title="Destek Talebi Bulunamadı"
              message="Arama kriterlerinize uygun herhangi bir destek talebi kaydı bulunamadı." />
            <v-card v-for="item in tickets" :key="item._id" class="mobile-ticket-card mb-4" elevation="1" rounded="xl">
              <div class="d-flex align-center justify-space-between pa-3 border-bottom-dashed">
                <div class="d-flex align-center">
                  <v-checkbox-btn :model-value="selectedTickets.includes(item._id)" color="passiveColor"
                    @update:model-value="val => onTicketSelectionUpdate(item._id, !!val)" density="compact"
                    class="mr-1"></v-checkbox-btn>
                  <span class="text-micro font-weight-black text-indigo-darken-3 mr-3">{{ item.ticketNumber }}</span>
                  <v-chip size="x-small" :color="getPriorityColor(item.priority)" variant="tonal"
                    class="font-weight-black">
                    {{ translatePriority(item.priority) }}
                  </v-chip>
                </div>
                <v-chip size="x-small" variant="flat" :color="getStatusColor(item.status)"
                  class="font-weight-black text-white px-3">
                  {{ translateStatus(item.status) }}
                </v-chip>
              </div>

              <div class="pa-3" @click="openTicketDetail(item)">
                <div class="d-flex justify-space-between mb-2">
                  <span class="text-caption font-weight-black color-slate-900">{{ item.subject }}</span>
                </div>
                <div class="bg-white pa-2 rounded-lg border-subtle mb-3">
                  <span class="text-micro font-weight-bold color-slate-500 line-clamp-2">
                    {{ item.lastMessageSnippet }}
                  </span>
                </div>
                <div class="d-flex align-center justify-space-between mt-2">
                  <span class="text-micro font-weight-bold color-slate-400">
                    <v-icon size="12" class="mr-1">mdi-clock-outline</v-icon>Son işlem: {{
                      formatDate(item.lastMessageAt) }}
                  </span>
                  <div class="d-flex gap-2">
                    <v-btn icon="mdi-message-text" size="34" variant="flat" color="passiveColor"
                      @click.stop="openTicketDetail(item)"></v-btn>
                  </div>
                </div>
              </div>
            </v-card>
          </template>
        </div>
        <div class="mobile-pagination-wrapper pa-2 bg-white border-top-subtle shadow-lg">
          <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
            @setPage="handlePageChange" v-model="pagination.page" />
        </div>
      </div>
    </div>

    <!-- Toplu İşlem Menüsü -->
    <BatchProcessMenu :model-value="selectedTickets" title="Destek Talebi Seçildi" :actions="[
      { id: 'CLOSE', label: 'Toplu Kapat', icon: 'mdi-check-all', color: 'success', badgeCount: selectedTickets.length }
    ]" @action="handleBulkAction" @clear="selectedTickets = []" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue'
import { useI18n } from 'vue-i18n'

// Composables & Stores
import useRestApi from '@/composables/restapi'
import { useTicketFilters } from '@/components/ticket/composables/useTicketFilters'
import { useTicketActions } from '@/components/ticket/composables/useTicketActions'

// Types & Enums
import {
  TicketStatusEnum, TicketPriorityEnum, TicketTypeEnum,
  TICKET_STATUS_LABELS, TICKET_STATUS_COLORS,
  TICKET_PRIORITY_LABELS, TICKET_PRIORITY_COLORS,
  TICKET_TYPE_LABELS
} from '@/types/TicketTypes'

// Components
import LoadingComponent from '@/components/LoadingComponent.vue'
import PaginationComponent from '@/components/PaginationComponent.vue'
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue'
import BatchProcessMenu from '@/components/layout/BatchProcessMenu.vue'
import TicketDetailComponent from '@/components/ticket/TicketDetailComponent.vue'
import TicketCreateDialog from '@/components/ticket/TicketCreateDialog.vue'
import EmptyState from '@/components/layout/EmptyState.vue'

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

// --- UTILS ---
const formatDate = (date: any) => date ? new Date(date).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const translateStatus = (s: any) => TICKET_STATUS_LABELS[s as TicketStatusEnum] || s;
const getStatusColor = (s: any) => TICKET_STATUS_COLORS[s as TicketStatusEnum] || 'passiveColor';
const translatePriority = (p: any) => TICKET_PRIORITY_LABELS[p as TicketPriorityEnum] || p;
const getPriorityColor = (p: any) => TICKET_PRIORITY_COLORS[p as TicketPriorityEnum] || 'passiveColor';
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
  overflow: hidden;
  background-color: #f5f7f9;
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
  background: white !important;
}

/* Mobil Sıralama Barı */
.mobile-sort-bar {
  z-index: 10;
  position: sticky;
  top: 0;
}

.sort-select-mobile :deep(.v-field__input) {
  padding-top: 4px !important;
  min-height: 32px !important;
}

.mobile-pagination-wrapper {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 99;
  background: white;
}


.border-subtle {
  border: 1px solid #e2e8f0 !important;
}

.row-status-waiting_client {
  background-color: #fee2e2 !important;
  border-left: 5px solid #ef4444 !important;
}

tr[class*="row-status-"]:hover {
  filter: brightness(0.96);
  transition: filter 0.2s ease;
}

.meta-label {
  font-size: 9px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
}

.text-micro {
  font-size: 10px;
  line-height: 1.2;
}

.gap-2 {
  gap: 8px;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>