<template>
  <div class="messageListView d-flex flex-column pt-4">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef" />

    <!-- ek-pattern-exception: EkConfirmDialog — R7 (e2e/specs/confirmation-dialog.spec.ts,
         bu görevin kapsamı DIŞI) mesaj silme diyaloğunun BUGÜNKÜ düz-metin görünür yapısını
         karakterize ediyor; bu akış BİLİNÇLİ OLARAK ConfirmationDialogComponent ile AYNEN
         bırakıldı (bkz. B1 teslim raporu). -->
    <ConfirmationDialogComponent v-model="actionDialog.show" :title="actionDialog.title" attach=".messageListView"
      :subtitle="actionDialog.subtitle" :message="actionDialog.message" :icon="actionDialog.icon"
      :color="actionDialog.color" :confirm-text="actionDialog.confirmText" :confirm-icon="actionDialog.confirmIcon"
      @confirm="actionDialog.onConfirm" @cancel="actionDialog.show = false" maxWidth="400px" />

    <MessageDetailComponent v-model="detailDialog.show" :message="selectedMessage" @reply="handleReply" />

    <EkFormDialog v-model="filterDialog" title="Mesaj filtreleme" @submit="applyAdvancedFilters">
      <v-select v-model="searchForm.data.status" :items="statusOptions" label="Mesaj durumu" item-title="label" item-value="value" />
      <v-select v-model="searchForm.data.type" :items="typeOptions" label="Mesaj tipi" item-title="label" item-value="value" />
      <v-select v-model="searchForm.data.isRejected"
        :items="[{ label: 'Tümü', value: null }, { label: 'Sadece reddedilenler', value: true }, { label: 'Reddedilmeyenler', value: false }]"
        label="Red durumu" item-title="label" item-value="value" />
      <v-select v-model="searchForm.data.integrationCodes" :items="['trendyol', 'hepsiburada', 'n11']" label="Pazaryeri" multiple chips />
      <v-text-field :model-value="formattedStartDate" label="Başlangıç tarihi" readonly type="date" @update:model-value="v => searchForm.data.startDate = v || null" />
      <v-text-field :model-value="formattedEndDate" label="Bitiş tarihi" readonly type="date" @update:model-value="v => searchForm.data.endDate = v || null" />
    </EkFormDialog>

    <EkListPage
      section="Siparişler"
      title="Mesajlar"
      description="Pazaryerlerinden gelen müşteri mesajlarını buradan yönetin."
      :secondary-actions="[{ label: 'Gelişmiş filtre', icon: 'mdi-filter-variant', onClick: () => (filterDialog = true) }]"
      :search="searchForm.data.globalSearch"
      search-placeholder="Mesaj içeriği, Ürün Adı veya Sipariş No"
      :state="viewState"
      @update:search="onSearchInput"
      @clear-filters="resetFilters"
      @refresh="() => getMessages(true)"
    >
      <template #empty>
        <EkEmptyState variant="no-results" title="Mesaj Bulunamadı" message="Arama kriterlerinize uygun herhangi bir mesaj bulunamadı." />
      </template>
      <template #error>
        <EkErrorState message="Mesajlar yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="() => getMessages(true)" />
      </template>

      <div class="ek-message-table-wrapper">
        <EkDataTable v-if="$vuetify.display.mdAndUp" :items="messages" :columns="columns" row-key="_id" aria-label="Mesajlar tablosu">
          <template #cell-select="{ item }">
            <v-checkbox-btn :model-value="isMessageSelected(item)" color="primary" density="compact"
              :aria-label="`Mesajı seç: ${item.text?.slice(0, 30)}`"
              @update:model-value="val => onMessageSelectionUpdate(item, !!val)" />
          </template>

          <template #cell-type="{ item }">
            <div class="d-flex align-center">
              <v-icon :icon="MESSAGE_TYPE_ICONS[item.type as MessageTypeEnum]" size="20" :color="effectiveTone(item) === 'danger' ? 'error' : 'content-muted'" class="mr-2" />
              <div class="d-flex flex-column">
                <span class="font-weight-medium text-body-2">{{ MESSAGE_TYPE_LABELS[item.type as MessageTypeEnum] }}</span>
                <span class="text-caption ek-muted">{{ item.integrationCode }}</span>
              </div>
            </div>
          </template>

          <template #cell-text="{ item }">
            <div class="d-flex flex-column ek-message-text-cell">
              <span class="text-caption" :class="item.status === 'UNREAD' ? 'font-weight-semibold' : 'font-weight-medium'">{{ item.text }}</span>
              <span v-if="item.context?.productName" class="text-caption ek-muted text-truncate">Ürün: {{ item.context.productName }}</span>
              <span v-if="item.context?.orderNumber" class="text-caption ek-num ek-link-color">Sipariş: {{ item.context.orderNumber }}</span>
            </div>
          </template>

          <template #cell-customer="{ item }">
            <div v-if="item.customer" class="d-flex align-center">
              <v-avatar color="surface-muted" size="28" class="mr-2">
                <span class="text-caption font-weight-bold">{{ item.customer.firstName?.[0] }}{{ item.customer.lastName?.[0] }}</span>
              </v-avatar>
              <div class="d-flex flex-column">
                <span class="text-caption font-weight-medium">{{ item.customer.firstName }} {{ item.customer.lastName }}</span>
                <span class="text-caption ek-muted">{{ item.customer.phone || 'Telefon yok' }}</span>
              </div>
            </div>
            <span v-else class="text-caption ek-muted">{{ item.externalUserName || 'Anonim müşteri' }}</span>
          </template>

          <template #cell-status="{ item }">
            <EkStatusChip :tone="effectiveTone(item)" :label="effectiveLabel(item)" />
          </template>

          <template #cell-date="{ item }">
            <div class="d-flex flex-column align-end">
              <span class="text-caption font-weight-medium ek-num">{{ formatDate(item.date) }}</span>
              <span class="text-caption ek-muted ek-num">{{ formatTime(item.date) }}</span>
            </div>
          </template>

          <template #cell-actions="{ item }">
            <div class="d-flex justify-end ek-gap-1">
              <v-btn icon variant="text" density="comfortable" :aria-label="needsReply(item) ? 'Mesajı cevapla' : 'Mesajı görüntüle'" @click="openDetail(item)">
                <v-icon>{{ needsReply(item) ? 'mdi-message-reply-text' : 'mdi-eye' }}</v-icon>
                <v-tooltip activator="parent" location="top">{{ needsReply(item) ? 'Cevapla' : 'Görüntüle' }}</v-tooltip>
              </v-btn>
              <v-btn icon variant="text" density="comfortable" aria-label="Mesajı sil" @click="triggerDelete(item)">
                <v-icon>mdi-delete-sweep-outline</v-icon>
              </v-btn>
            </div>
          </template>
        </EkDataTable>

        <div v-else class="mobile-list d-flex flex-column h-100">
          <div class="pa-2 overflow-y-auto flex-grow-1 d-flex flex-column mobile-list-scroll">
            <EkEmptyState v-if="!messages?.length" variant="no-results" title="Mesaj Bulunamadı" message="Arama kriterlerinize uygun herhangi bir mesaj bulunamadı." />
            <v-card v-for="item in messages" :key="item._id" class="mobile-card mb-3" variant="flat" border rounded="lg" @click="openDetail(item)">
              <div class="pa-3 border-bottom-dashed d-flex justify-space-between align-center">
                <div class="d-flex align-center">
                  <v-checkbox-btn :model-value="isMessageSelected(item)" color="primary" density="compact" class="mr-2"
                    :aria-label="`Mesajı seç: ${item.text?.slice(0, 30)}`"
                    @click.stop @update:model-value="val => onMessageSelectionUpdate(item, !!val)" />
                  <v-icon :icon="MESSAGE_TYPE_ICONS[item.type as MessageTypeEnum]" size="18" class="mr-2" color="content-muted" />
                  <span class="font-weight-medium text-caption">{{ MESSAGE_TYPE_LABELS[item.type as MessageTypeEnum] }}</span>
                </div>
                <EkStatusChip :tone="effectiveTone(item)" :label="effectiveLabel(item)" />
              </div>

              <div class="pa-3">
                <div class="text-caption ek-message-clamp mb-2" :class="item.status === 'UNREAD' ? 'font-weight-semibold' : 'font-weight-medium'">
                  {{ item.text }}
                </div>
                <div class="d-flex justify-space-between align-end">
                  <span v-if="item.customer" class="text-caption font-weight-medium">{{ item.customer.firstName }} {{ item.customer.lastName }}</span>
                  <span class="text-caption ek-muted ek-num">{{ formatDate(item.date) }}</span>
                </div>
              </div>
            </v-card>
          </div>
        </div>
      </div>

      <template #pagination>
        <EkPagination :page="pagination.page" :page-size="pagination.limit" :total="pagination.totalNumberOfRecords"
          @update:page="handlePageChange" @update:pageSize="onPageSizeChange" />
      </template>
    </EkListPage>

    <BatchProcessMenu :model-value="selectedMessages" title="Mesaj Seçildi" :actions="[
      { id: 'DELETE', label: 'Toplu Sil', icon: 'mdi-delete-sweep-outline', color: 'error', badgeCount: bulkActionCounts.DELETE }
    ]" @action="triggerBulkDelete" @clear="selectedMessages = []" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';
import {
  MessageStatusEnum,
  MESSAGE_STATUS_LABELS,
  MessageTypeEnum,
  MESSAGE_TYPE_LABELS,
  MESSAGE_TYPE_ICONS
} from '@/types/MessageTypes';
import { MESSAGE_STATUS_TONE, type StatusTone } from '@/design/status-map';
import { formatDate as formatDateShared, formatDateTime } from '@/composables/format';
import { text, emphasis } from '@/components/layout/messageParts';

import LoadingComponent from '@/components/LoadingComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import BatchProcessMenu from '@/components/layout/BatchProcessMenu.vue';
import MessageDetailComponent from '@/components/message/MessageDetailComponent.vue';
import EkListPage from '@/components/ds/templates/EkListPage.vue';
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue';
import EkPagination from '@/components/ds/EkPagination.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';
import EkErrorState from '@/components/ds/EkErrorState.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkFormDialog from '@/components/ds/EkFormDialog.vue';

const emits = defineEmits(['clear'])

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();

const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".messageListView");
const loading = ref(false);
const loadError = ref(false);
const filterDialog = ref(false);
const messages = ref<any[]>([]);
const selectedMessages = ref<string[]>([]);
const selectedMessage = ref<any>(null);
const detailDialog = ref({ show: false });
const actionDialog = ref<any>({ show: false });

const formattedStartDate = computed(() => searchForm.data.startDate ?? '');
const formattedEndDate = computed(() => searchForm.data.endDate ?? '');

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
    status: null as string | null,
    type: null as string | null,
    isRejected: null as boolean | null,
    integrationCodes: [] as string[],
    startDate: null as string | null,
    endDate: null as string | null
  }
});

const statusOptions = Object.entries(MESSAGE_STATUS_LABELS).map(([value, label]) => ({ value, label }));
const typeOptions = Object.entries(MESSAGE_TYPE_LABELS).map(([value, label]) => ({ value, label }));

const columns: EkTableColumn[] = [
  { key: 'select', label: '' },
  { key: 'type', label: 'TİP / KAYNAK' },
  { key: 'text', label: 'MESAJ İÇERİĞİ' },
  { key: 'customer', label: 'MÜŞTERİ' },
  { key: 'status', label: 'DURUM' },
  { key: 'date', label: 'TARİH', align: 'end' },
  { key: 'actions', label: '', type: 'actions', align: 'end' },
];

const viewState = computed(() => {
  if (loading.value) return 'loading';
  if (loadError.value) return 'error';
  if (!messages.value.length) return 'empty';
  return 'ready';
});

function needsReply(item: any): boolean {
  return item.status === MessageStatusEnum.WAITING_SELLER || !!item.isRejected;
}

function effectiveTone(item: any): StatusTone {
  if (item.isRejected) return 'danger';
  return MESSAGE_STATUS_TONE[item.status as MessageStatusEnum]?.tone ?? 'neutral';
}

function effectiveLabel(item: any): string {
  if (item.isRejected) return 'Reddedildi';
  return MESSAGE_STATUS_LABELS[item.status as MessageStatusEnum] ?? item.status;
}

async function getMessages(resetPage: boolean = false) { await getMessagesInternal(resetPage); }

const bulkActionCounts = computed(() => ({ DELETE: selectedMessages.value.length }));

const getMessagesInternal = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
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
    loadError.value = true;
    snackbarStore.addSnackbar({ text: "Veri yükleme hatası!", color: "error" });
  } finally {
    loadingComponentRef.value?.remove(guid);
    loading.value = false;
  }
};

function onSearchInput(value: string) {
  searchForm.data.globalSearch = value;
  getMessages(true);
}

function applyAdvancedFilters() {
  filterDialog.value = false;
  getMessages(true);
}

function onPageSizeChange(size: number) {
  pagination.limit = size;
  handlePageChange(1);
}

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
      // Sessizce yok say (okundu işaretleme ikincil bir etkidir; kullanıcı akışını engellemez).
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

// R7 (e2e/specs/confirmation-dialog.spec.ts, bu görevin kapsamı DIŞI) mesaj silme diyaloğunun
// BUGÜNKÜ düz-metin (biçimlendirmesiz) yapısını karakterize ediyor; bu akış BİLİNÇLİ OLARAK
// ConfirmationDialogComponent ile AYNEN bırakıldı (bkz. B1 teslim raporu).
const triggerDelete = (item: any) => {
  actionDialog.value = {
    show: true,
    title: "Mesajı Sil",
    subtitle: "Bu işlem geri alınamaz",
    message: "Seçili mesajı sistemden silmek istediğinize emin misiniz?",
    icon: "mdi-delete-alert",
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
    icon: "mdi-delete-sweep",
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

const formatDate = (date: any) => formatDateShared(date);
const formatTime = (date: any) => {
  const full = formatDateTime(date);
  return full === '—' ? '' : full.split(' ')[1] ?? '';
};

// onMounted YOK (initialize/activate ile çağrılıyor — parent şell tab yaşam döngüsü, davranış korunur).

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

<style scoped>
.messageListView {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-6);
  gap: var(--ek-space-4);
}

.ek-message-table-wrapper {
  width: 100%;
}

.ek-message-text-cell {
  max-width: 320px;
}

.ek-message-clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-link-color {
  color: var(--ek-color-primary);
}

.mobile-list-scroll {
  padding-bottom: var(--ek-space-8);
}

.border-bottom-dashed {
  border-bottom: 1px dashed var(--ek-color-border-default);
}

.ek-gap-1 { gap: var(--ek-space-1); }
</style>
