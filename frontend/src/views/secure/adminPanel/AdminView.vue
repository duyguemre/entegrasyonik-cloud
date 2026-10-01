<template>
  <div class="messageListView d-flex flex-column pt-4">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef" />

    <ConfirmationDialogComponent v-model="actionDialog.show" :title="actionDialog.title" attach=".messageListView"
      :subtitle="actionDialog.subtitle" :message="actionDialog.message" :icon="actionDialog.icon"
      :color="actionDialog.color" :confirm-text="actionDialog.confirmText" :confirm-icon="actionDialog.confirmIcon"
      @confirm="actionDialog.onConfirm" @cancel="actionDialog.show = false" maxWidth="400px" />

    <MessageDetailComponent v-model="detailDialog.show" :message="selectedMessage" @reply="handleReply" />

    <div class="d-flex pa-2 pt-2 pb-0 mt-0 mb-1 align-start flex-wrap search-section">
      <v-text-field clearable density="compact" label="Mesaj içeriği, Ürün Adı veya Sipariş No" variant="outlined"
        v-model="searchForm.data.globalSearch" class="customTextField flex-grow-1" hide-details
        @keyup.enter.stop="getMessages(true)" @click:clear="searchForm.data.globalSearch = ''; getMessages(true)">
        <template #append-inner>
          <v-btn flat size="40" class="pa-2 search-submit-btn" elevation="0" color="surface" aria-label="Ara"
            @click.stop="getMessages(true)">
            <v-icon size="x-large" color="neutral">mdi-magnify</v-icon>
          </v-btn>
        </template>
      </v-text-field>

      <div class="d-flex align-center flex-wrap gap-2">
        <v-menu v-model="startDateMenuInline" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedStartDate" label="Başlangıç" variant="outlined" density="compact"
              prepend-inner-icon="mdi-calendar-start-outline" hide-details readonly clearable
              @click:clear="searchForm.data.startDate = null" v-bind="props" class="customTextField date-input"></v-text-field>
          </template>
          <v-card class="rounded-lg">
            <v-date-picker v-model="searchForm.data.startDate" :max="searchForm.data.endDate" hide-header locale="tr"
              color="content-muted" @update:model-value="startDateMenuInline = false"
              show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>

        <v-menu v-model="endDateMenuInline" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedEndDate" label="Bitiş" variant="outlined" density="compact"
              prepend-inner-icon="mdi-calendar-end-outline" hide-details readonly clearable
              @click:clear="searchForm.data.endDate = null" v-bind="props" class="customTextField date-input"></v-text-field>
          </template>
          <v-card class="rounded-lg">
            <v-date-picker v-model="searchForm.data.endDate" :min="searchForm.data.startDate" hide-header locale="tr"
              color="content-muted"
              @update:model-value="endDateMenuInline = false" show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>

        <v-btn @click="searchForm.form.menu = true" size="40" elevation="0" color="surface" class="premium-cube-btn" aria-label="Filtrele">
          <v-icon size="x-large" color="content-muted">mdi-filter-variant</v-icon>
          <v-tooltip activator="parent" location="top">Filtrele</v-tooltip>
        </v-btn>
        <v-btn @click="getMessages(true)" size="40" elevation="0" color="surface" class="premium-cube-btn" aria-label="Yenile">
          <v-icon size="x-large" color="content-muted">mdi-refresh</v-icon>
          <v-tooltip activator="parent" location="top">Yenile</v-tooltip>
        </v-btn>
      </div>
    </div>

    <ActionDialogComponent v-model="searchForm.form.menu" title="Mesaj filtreleme" attach=".messageListView"
      subtitle="Kategori ve durum bazlı filtreleme" icon="mdi-filter-cog-outline" color="content-muted" maxWidth="600px"
      confirmText="Filtreleri uygula" @confirm="getMessages(true); searchForm.form.menu = false"
      @cancel="resetFilters()">
      <v-row dense>
        <v-col cols="12" md="6">
          <v-select v-model="searchForm.data.status" :items="statusOptions" label="Mesaj Durumu" variant="outlined"
            density="compact" chips class="customTextField mt-2" item-title="label" item-value="value" />
        </v-col>
        <v-col cols="12" md="6">
          <v-select v-model="searchForm.data.type" :items="typeOptions" label="Mesaj Tipi" variant="outlined"
            density="compact" chips class="customTextField mt-2" item-title="label" item-value="value" />
        </v-col>
        <v-col cols="12" md="6">
          <v-select v-model="searchForm.data.isRejected"
            :items="[{ label: 'Tümü', value: null }, { label: 'Sadece Reddedilenler', value: true }, { label: 'Reddedilmeyenler', value: false }]"
            label="Red Durumu" variant="outlined" density="compact" class="customTextField" item-title="label"
            item-value="value" />
        </v-col>
        <v-col cols="12">
          <v-select v-model="searchForm.data.integrationCodes" :items="['trendyol', 'hepsiburada', 'n11']"
            label="Pazaryeri" variant="outlined" density="compact" multiple chips class="customTextField" />
        </v-col>
      </v-row>
    </ActionDialogComponent>

    <div class="table-wrapper mt-2">
      <v-data-table-server v-if="$vuetify.display.mdAndUp" v-model="selectedMessages" v-model:sort-by="sortBy"
        item-value="_id" :loading="loading" :itemsLength="pagination.totalNumberOfRecords" :items="messages"
        fixed-header :headers="headers" class="pa-0 ma-0 custom-table desktop-table" show-select
        @update:sortBy="onSortUpdate">

        <template v-slot:item="{ item }: any">
          <tr :key="item._id" class="row-hover" :class="{
            'unanswered-row': item.status === 'WAITING_SELLER',
            'rejected-row': item.isRejected || item.status === 'REJECTED'
          }">
            <td>
              <v-checkbox-btn :model-value="isMessageSelected(item)" color="content-muted"
                aria-label="Mesajı seç" @update:model-value="val => onMessageSelectionUpdate(item, !!val)" density="compact"></v-checkbox-btn>
            </td>
            <td class="text-left py-2">
              <div class="d-flex align-center">
                <v-icon :icon="MESSAGE_TYPE_ICONS[item.type as MessageTypeEnum]" size="24"
                  :color="statusRole(item)"
                  class="mr-3" />
                <div class="d-flex flex-column">
                  <span class="font-weight-black text-body-2 text-strong ek-leading-tight">
                    {{ MESSAGE_TYPE_LABELS[item.type as MessageTypeEnum] }}
                  </span>
                  <div class="d-flex align-center gap-1 mt-1">
                    <span class="text-micro font-weight-black text-uppercase" :class="`text-${statusRole(item)}`">
                      {{ item.integrationCode }}
                    </span>
                  </div>
                </div>
              </div>
            </td>

            <td class="text-left py-2 message-cell">
              <div class="d-flex flex-column position-relative">
                <div v-if="item.status === 'UNREAD'" class="unread-dot"></div>
                <span class="text-caption text-default"
                  :class="item.status === 'UNREAD' ? 'font-weight-black' : 'font-weight-bold'">
                  {{ item.text }}
                </span>
                <span v-if="item.context?.productName"
                  class="text-micro font-weight-medium text-muted text-truncate">
                  Ürün: {{ item.context.productName }}
                </span>
                <span v-if="item.context?.orderNumber" class="text-micro font-weight-bold text-primary">
                  Sipariş: {{ item.context.orderNumber }}
                </span>
              </div>
            </td>

            <td class="text-left py-2">
              <div v-if="item.customer" class="d-flex align-center">
                <v-avatar color="surface-sunken" size="28" class="mr-2">
                  <span class="text-micro font-weight-black text-default">{{ item.customer.firstName?.[0] }}{{
                    item.customer.lastName?.[0] }}</span>
                </v-avatar>
                <div class="d-flex flex-column">
                  <span class="text-micro font-weight-bold text-strong">{{ item.customer.firstName }} {{
                    item.customer.lastName }}</span>
                  <span class="text-micro text-muted">{{ item.customer.phone || 'Telefon Yok' }}</span>
                </div>
              </div>
              <span v-else class="text-micro text-muted">
                {{ item.externalUserName || 'Anonim Müşteri' }}
              </span>
            </td>

            <td class="text-center py-2">
              <EkStatusChip :tone="statusTone(item)" :label="statusLabel(item)"
                :title="item.rejectionReason ? `Red Sebebi: ${item.rejectionReason}` : undefined" />
            </td>

            <td class="text-right py-2">
              <div class="d-flex flex-column align-end">
                <span class="text-caption font-weight-bold text-strong">{{ formatDate(item.date) }}</span>
                <span class="text-micro text-muted">{{ formatTime(item.date) }}</span>
              </div>
            </td>

            <td>
              <div class="d-flex justify-end gap-2 pr-1">
                <v-btn flat size="35" color="surface" class="premium-cube-btn"
                  :aria-label="(item.status === 'WAITING_SELLER' || item.isRejected) ? 'Cevapla / Düzenle' : 'Görüntüle'"
                  @click="openDetail(item)">
                  <v-icon size="large"
                    :color="(item.status === 'WAITING_SELLER' || item.isRejected) ? 'warning' : 'content-muted'">
                    {{ (item.status === 'WAITING_SELLER' || item.isRejected) ? 'mdi-message-reply-text-outline' : 'mdi-eye-outline' }}
                  </v-icon>
                  <v-tooltip activator="parent" location="top">{{ (item.status === 'WAITING_SELLER' || item.isRejected)
                    ? 'Cevapla / Düzenle' : 'Görüntüle' }}</v-tooltip>
                </v-btn>

                <v-btn flat size="35" variant="flat" color="error" class="premium-cube-btn ml-2" aria-label="Mesajı sil"
                  @click="triggerDelete(item)">
                  <v-icon size="large" color="error-contrast">mdi-trash-can-outline</v-icon>
                </v-btn>
              </div>
            </td>
          </tr>
        </template>

        <template v-slot:bottom>
          <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
            @setPage="handlePageChange" v-model="pagination.page" class="table-pagination" />
        </template>
      </v-data-table-server>

      <div v-else class="mobile-list d-flex flex-column h-100">
        <div class="pa-2 overflow-y-auto flex-grow-1 mobile-list__scroll">
          <v-card v-for="item in messages" :key="item._id" class="mobile-card mb-3 border-subtle" elevation="0" :class="{
            'unanswered-row': item.status === 'WAITING_SELLER',
            'rejected-row': item.isRejected || item.status === 'REJECTED'
          }" rounded="lg" @click="openDetail(item)">
            <div class="pa-3 border-bottom-dashed d-flex justify-space-between align-center">
              <div class="d-flex align-center">
                <v-checkbox-btn :model-value="isMessageSelected(item)" color="content-muted" aria-label="Mesajı seç"
                  @update:model-value="val => onMessageSelectionUpdate(item, !!val)" density="compact" class="mr-2"
                  @click.stop></v-checkbox-btn>
                <v-icon :icon="MESSAGE_TYPE_ICONS[item.type as MessageTypeEnum]" size="18"
                  :color="statusRole(item)"
                  class="mr-2" />
                <span class="font-weight-black text-micro text-strong">{{ MESSAGE_TYPE_LABELS[item.type as
                  MessageTypeEnum] }}</span>
              </div>
              <EkStatusChip :tone="statusTone(item)" :label="statusLabel(item)" />
            </div>

            <div class="pa-3">
              <div class="text-caption text-default mb-2 truncate-2-lines position-relative"
                :class="item.status === 'UNREAD' ? 'font-weight-black' : 'font-weight-bold'">
                <div v-if="item.status === 'UNREAD'" class="unread-dot-mobile"></div>
                {{ item.text }}
              </div>

              <EkAlert v-if="(item.isRejected || item.status === 'REJECTED') && item.rejectionReason" tone="error" dense class="mb-2" :text="`Red: ${item.rejectionReason}`" />

              <div class="d-flex justify-space-between align-end">
                <div class="d-flex flex-column">
                  <span v-if="item.context?.productName" class="text-micro font-weight-bold text-muted">Ürün: {{
                    item.context.productName }}</span>
                  <span v-if="item.customer" class="text-micro font-weight-black text-strong">{{
                    item.customer.firstName
                    }} {{ item.customer.lastName }}</span>
                </div>
                <div class="d-flex flex-column align-end">
                  <span class="text-micro font-weight-bold text-muted">{{ formatDate(item.date) }}</span>
                </div>
              </div>
            </div>
          </v-card>
        </div>
        <div class="mobile-pagination-wrapper pa-2 shadow-top">
          <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
            @setPage="handlePageChange" v-model="pagination.page" />
        </div>
      </div>
    </div>
    <BatchProcessMenu :model-value="selectedMessages" title="Mesaj Seçildi" :actions="[
      { id: 'DELETE', label: 'Toplu Sil', icon: 'mdi-trash-can-outline', color: 'error', badgeCount: bulkActionCounts.DELETE }
    ]" @action="triggerBulkDelete" @clear="selectedMessages = []" />
  </div>
</template>

<script setup lang="ts">
import { EkAlert, EkStatusChip } from '@entegrasyonik/ui/components'
import { ref, onMounted, reactive, computed } from 'vue';
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';
import {
  MessageStatusEnum,
  MESSAGE_STATUS_LABELS,
  MessageTypeEnum,
  MESSAGE_TYPE_LABELS,
  MESSAGE_TYPE_ICONS
} from '@/types/MessageTypes';

import { formatDate, formatDateTime } from '@entegrasyonik/ui/format';
import { MESSAGE_STATUS_TONE, type StatusTone } from '@/design/status-map';
;
import LoadingComponent from '@/components/LoadingComponent.vue';
import PaginationComponent from '@/components/PaginationComponent.vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import { text, emphasis } from '@/components/layout/messageParts';
import BatchProcessMenu from '@/components/layout/BatchProcessMenu.vue';
import MessageDetailComponent from '@/components/message/MessageDetailComponent.vue';


const emits = defineEmits(['clear'])

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();

const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".messageListView");
const loading = ref(false);
const messages = ref<any[]>([]);
const selectedMessages = ref<string[]>([]);
const selectedMessage = ref<any>(null);
const detailDialog = ref({ show: false });
const actionDialog = ref<any>({ show: false });

const startDateMenuInline = ref(false);
const endDateMenuInline = ref(false);

const formattedStartDate = computed(() => searchForm.data.startDate ? formatDate(searchForm.data.startDate) : '');
const formattedEndDate = computed(() => searchForm.data.endDate ? formatDate(searchForm.data.endDate) : '');

const pagination = reactive({
  page: 1,
  limit: 15,
  totalNumberOfRecords: 0,
  totalNumberOfPages: 1
});

const sortBy = ref<any[]>([]);

const searchForm = reactive({
  form: { menu: false },
  data: {
    globalSearch: '',
    status: null,
    type: null,
    isRejected: null,
    integrationCodes: [],
    startDate: null,
    endDate: null
  }
});

const statusOptions = Object.entries(MESSAGE_STATUS_LABELS).map(([value, label]) => ({ value, label }));
const typeOptions = Object.entries(MESSAGE_TYPE_LABELS).map(([value, label]) => ({ value, label }));

const headers: any = [
  { title: 'TİP / KAYNAK', key: 'type', sortable: false, align: 'start', width: '150px' },
  { title: 'MESAJ İÇERİĞİ', key: 'text', sortable: false, align: 'start', width: '300px' },
  { title: 'MÜŞTERİ', key: 'customer', sortable: false, align: 'start', width: '180px' },
  { title: 'DURUM', key: 'status', sortable: true, align: 'center', width: '130px' },
  { title: 'TARİH', key: 'date', sortable: true, align: 'end', width: '120px' },
  { title: 'İŞLEMLER', key: 'actions', sortable: false, align: 'end', width: '110px' },
];

async function getMessages(resetPage: boolean = false) { await getMessagesInternal(resetPage); }

const bulkActionCounts = computed(() => {
  return {
    DELETE: selectedMessages.value.length
  };
});

const getMessagesInternal = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  const guid = loadingComponentRef.value?.info("Mesajlar yükleniyor...") || "loading";

  try {
    const payload = {
      searchMessageForm: { data: searchForm.data },
      pagination: { page: pagination.page, limit: pagination.limit },
      sortBy: sortBy.value[0] || { key: 'date', order: 'desc' }
    };

    const res = await restApi.post('MessageService/getMessages', payload);
    if (res.messages) {
      messages.value = res.messages;
      pagination.totalNumberOfRecords = res.totalNumberOfRecords || 0;
      pagination.totalNumberOfPages = res.totalNumberOfPages || 1;
    }
  } catch (e) {
    snackbarStore.addSnackbar({ text: "Veri yükleme hatası!", color: "error" });
  } finally {
    loadingComponentRef.value?.remove(guid);
    loading.value = false;
  }
};

const onSortUpdate = (newSort: any) => {
  sortBy.value = newSort;
  getMessages(true);
};

const handlePageChange = (newPage: number) => {
  pagination.page = newPage;
  getMessages();
};

const resetFilters = () => {
  searchForm.data = {
    globalSearch: '',
    status: null,
    type: null,
    isRejected: null,
    integrationCodes: [],
    startDate: null,
    endDate: null
  };
  getMessages(true);
};

const openDetail = async (item: any) => {
  selectedMessage.value = item;
  detailDialog.value.show = true;

  if (item.status === 'UNREAD') {
    try {
      await restApi.post('MessageService/markAsRead', { messageId: item._id });
      item.status = 'READ';
    } catch (e) {
      console.error("Okundu işaretlenirken hata:", e);
    }
  }
};

const handleReply = async ({ messageId, answerText }: any) => {
  const guid = loadingComponentRef.value?.info("Cevap iletiliyor...") || "loading";
  try {
    const res = await restApi.post('MessageService/replyMessage', { messageId, answerText });
    if (res.success) {
      snackbarStore.addSnackbar({ text: "Mesaj başarıyla cevaplandı", color: "success" });
      getMessages();
      detailDialog.value.show = false;
    }
  } catch (e: any) {
    snackbarStore.addSnackbar({ text: e.message || "Cevaplanırken hata oluştu", color: "error" });
  } finally {
    loadingComponentRef.value?.remove(guid);
  }
};

const triggerDelete = (item: any) => {
  actionDialog.value = {
    show: true,
    title: "Mesajı Sil",
    subtitle: "Bu işlem geri alınamaz",
    message: "Seçili mesajı sistemden silmek istediğinize emin misiniz?",
    icon: "mdi-trash-can-outline",
    color: "error",
    confirmText: "EVET, SİL",
    onConfirm: async () => {
      try {
        await restApi.post('MessageService/deleteMessage', { messageId: item._id });
        snackbarStore.addSnackbar({ text: "Mesaj silindi", color: "success" });
        getMessages();
      } catch (e) {
        snackbarStore.addSnackbar({ text: "Silinirken hata oluştu", color: "error" });
      } finally {
        actionDialog.value.show = false;
      }
    }
  };
};

const triggerBulkDelete = () => {
  if (selectedMessages.value.length === 0) return;

  actionDialog.value = {
    show: true,
    title: "Mesajları Toplu Sil",
    subtitle: "Seçilen tüm mesajlar kalıcı olarak silinecektir.",
    message: [text('Seçili olan '), emphasis(selectedMessages.value.length), text(' mesajı silmek istediğinize emin misiniz?')],
    icon: "mdi-trash-can-outline",
    color: "error",
    confirmText: "EVET, TOPLU SİL",
    onConfirm: async () => {
      const guid = loadingComponentRef.value?.info("Mesajlar siliniyor...") || "loading";
      try {
        await restApi.post('MessageService/bulkDeleteMessages', { messageIds: selectedMessages.value });
        snackbarStore.addSnackbar({ text: "Mesajlar başarıyla silindi", color: "success" });
        selectedMessages.value = [];
        getMessages();
      } catch (e) {
        snackbarStore.addSnackbar({ text: "Silinirken hata oluştu", color: "error" });
      } finally {
        actionDialog.value.show = false;
        loadingComponentRef.value?.remove(guid);
      }
    }
  };
};

const onMessageSelectionUpdate = (item: any, isSelected: boolean) => {
  if (isSelected) selectedMessages.value.push(item._id);
  else selectedMessages.value = selectedMessages.value.filter(id => id !== item._id);
};

const isMessageSelected = (item: any) => selectedMessages.value.includes(item._id);

const formatTime = (date: any) => date ? (formatDateTime(date).split(' ')[1] ?? '') : '';

const isRejectedMessage = (item: any) => !!item.isRejected || item.status === 'REJECTED';
const statusTone = (item: any): StatusTone =>
  isRejectedMessage(item) ? 'danger' : (MESSAGE_STATUS_TONE[item.status as MessageStatusEnum]?.tone ?? 'neutral');
const statusLabel = (item: any) =>
  isRejectedMessage(item) ? 'REDDEDİLDİ' : (MESSAGE_STATUS_LABELS[item.status as MessageStatusEnum] ?? item.status);
/** Durum tonu → Vuetify tema rolü (ikon/metin rengi). */
const TONE_ROLE: Record<StatusTone, string> = { danger: 'error', warning: 'warning', success: 'success', info: 'info', neutral: 'content-muted' };
const statusRole = (item: any) => TONE_ROLE[statusTone(item)];

// onMounted(() => getMessages()); // Removed to avoid race condition with initialize

const initialize = async (parameters: any) => {
  if (parameters?.status) {
    searchForm.data.status = parameters.status;
  }
  await getMessages(true);
  emits('clear')
};

const activate = async (parameters: any) => {
  if (parameters?.status) {
    searchForm.data.status = parameters.status;
    await getMessages(true);
  }
  emits('clear')
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

<style scoped lang="scss">
.messageListView {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-section {
  background: transparent;
  z-index: var(--ek-z-sticky);
  max-width: 1200px;
  gap: var(--ek-space-2);
}

.search-submit-btn {
  border: 1px solid var(--ek-color-surface);
}

.date-input {
  min-width: 160px;
}

.message-cell {
  max-width: 300px;
}

.table-wrapper {
  flex-grow: 1;
  position: relative;
  min-height: 0;
  background: var(--ek-color-surface);
}

.desktop-table {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

.table-pagination {
  position: relative;
  border-top: 1px solid var(--ek-color-border-default);
}

.row-hover {
  transition: background-color var(--ek-motion-reveal);
  cursor: pointer;

  &:hover {
    background-color: var(--ek-color-surface-muted) !important;
  }
}

.mobile-list {
  background: var(--ek-color-surface-muted);
}

.mobile-list__scroll {
  padding-bottom: 80px !important;
}

.border-subtle {
  border: 1px solid var(--ek-color-border-default) !important;
}

.border-bottom-dashed {
  border-bottom: 1px dashed var(--ek-color-border-default);
}

.mobile-pagination-wrapper {
  background: var(--ek-color-surface);
}

.shadow-top {
  border-top: 1px solid var(--ek-color-border-default);
}

.text-micro {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-line-height-tight);
}

.ek-leading-tight {
  line-height: var(--ek-line-height-tight);
}

.truncate-2-lines {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.text-strong {
  color: var(--ek-color-content-strong);
}

.text-default {
  color: var(--ek-color-content-default);
}

.text-muted {
  color: var(--ek-color-content-muted);
}

.unread-dot {
  position: absolute;
  left: -12px;
  top: 6px;
  width: 8px;
  height: 8px;
  background-color: var(--ek-color-info);
  border-radius: var(--ek-radius-full);
}

.unread-dot-mobile {
  position: absolute;
  left: -10px;
  top: 6px;
  width: 6px;
  height: 6px;
  background-color: var(--ek-color-info);
  border-radius: var(--ek-radius-full);
}

.unanswered-row {
  background-color: var(--ek-color-warning-subtle) !important;
}

.rejected-row {
  background-color: var(--ek-color-error-subtle) !important;
}

:deep(.v-data-table-header__content) {
  span {
    font-size: var(--ek-type-micro-size) !important;
    font-weight: var(--ek-font-weight-semibold) !important;
    color: var(--ek-color-content-muted) !important;
    letter-spacing: 0.04em;
  }
}

:deep(.v-data-table-footer) {
  display: none !important;
}

@media (max-width: 959px) {
  .date-input {
    flex: 1;
  }
}
</style>
