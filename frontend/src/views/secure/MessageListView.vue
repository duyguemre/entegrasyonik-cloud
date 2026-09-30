<template>
  <div class="messageListView">
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

    <EkListScreen channel-key="integrationCode"
      section="Satış"
      title="Mesajlar"
      description="Pazaryerlerinden gelen müşteri mesajlarını buradan yönetin."
      label="Mesajlar tablosu"
      noun="mesaj"
      row-key="_id"
      label-key="shortText"
      :columns="columns"
      :rows="rows"
      :row-class="(r) => (r.status === 'UNREAD' ? 'ek-message-unread' : undefined)"
      :loading="loading"
      :error="loadError"
      error-title="Mesajlar yüklenemedi"
      :search="searchForm.data.globalSearch"
      search-placeholder="Mesaj içeriği, Ürün Adı veya Sipariş No"
      :chips="activeChips"
      :filter-count="panelFilterCount"
      selectable
      v-model:selected="selectedMessages"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Mesaj bulunamadı"
      empty-text="Pazaryerlerinden gelen müşteri soruları burada listelenir."
      empty-icon="mdi-message-text-outline"
      filtered-empty-title="Mesaj bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir mesaj bulunamadı."
      @update:search="onSearchInput"
      @update:sort="onGridSort"
      @update:page="handlePageChange"
      @update:page-size="onPageSizeChange"
      @filter-submit="applyAdvancedFilters"
      @filter-reset="resetFilters"
      @remove-chip="removeChip"
      @clear-filters="resetFilters"
      @refresh="getMessages(true)"
    >
      <template #filters>
        <v-select v-model="searchForm.data.status" :items="statusOptions" label="Mesaj durumu" item-title="label" item-value="value" clearable />
        <v-select v-model="searchForm.data.type" :items="typeOptions" label="Mesaj tipi" item-title="label" item-value="value" clearable />
        <v-select v-model="searchForm.data.isRejected" :items="REJECT_OPTIONS" label="Red durumu" item-title="label" item-value="value" />
        <v-select v-model="searchForm.data.integrationCodes" :items="CHANNEL_OPTIONS" item-title="title" item-value="value" label="Kanal" multiple chips closable-chips clearable />
        <EkDateField v-model="searchForm.data.startDate" label="Başlangıç tarihi" value-format="iso-date" :max="searchForm.data.endDate" />
        <EkDateField v-model="searchForm.data.endDate" label="Bitiş tarihi" value-format="iso-date" :min="searchForm.data.startDate" />
      </template>

      <template #toolbar-end>
        <span class="ek-message-awaiting">
          <span v-if="awaitingOnPage > 0" class="ek-message-awaiting-count" aria-live="polite">{{ t('messages.sla.awaitingCount', { n: awaitingOnPage }) }}</span>
          <EkTooltip :text="t('messages.sla.awaitingFirstHint')">
            <EkButton
              tone="secondary"
              size="sm"
              :icon="awaitingFirst ? 'mdi-check' : 'mdi-sort-clock-descending-outline'"
              class="ek-message-awaiting-toggle"
              :class="{ 'is-active': awaitingFirst }"
              :aria-pressed="awaitingFirst ? 'true' : 'false'"
              :disabled="loading || !rows.length"
              @click="awaitingFirst = !awaitingFirst"
            >
              {{ t('messages.sla.awaitingFirst') }}<span class="ek-message-awaiting-toggle__scope"> · {{ t('messages.sla.thisPage') }}</span>
            </EkButton>
          </EkTooltip>
        </span>
      </template>

      <template #bulk-actions>
        <EkButton size="sm" icon="mdi-delete-sweep-outline" class="ek-bulk-danger" @click="triggerBulkDelete">
          Toplu sil ({{ selectedMessages.length }})
        </EkButton>
      </template>

      <template #cell-type="{ row }">
        <span class="ek-message-type">
          <v-icon :icon="MESSAGE_TYPE_ICONS[row.type as MessageTypeEnum]" size="16" aria-hidden="true" :class="{ 'is-danger': effectiveTone(row) === 'danger' }" />
          {{ MESSAGE_TYPE_LABELS[row.type as MessageTypeEnum] }}
        </span>
      </template>
      <template #cell-channel="{ row }"><EkChannelDot :code="row.integrationCode" /></template>
      <template #cell-text="{ row }">
        <span class="ek-message-text">
          <span class="ek-message-text__body">{{ row.text }}</span>
          <span v-if="row.context?.productName || row.context?.orderNumber || isAwaitingReply(row)" class="ek-message-text__meta">
            <MessageWaitChip :message="row" :now="now" tooltip />
            <span v-if="row.context?.productName || row.context?.orderNumber" class="ek-message-text__ctx">
              <template v-if="row.context?.productName">Ürün: {{ row.context.productName }}</template>
              <template v-if="row.context?.productName && row.context?.orderNumber"> · </template>
              <span v-if="row.context?.orderNumber" class="ek-num">Sipariş: {{ row.context.orderNumber }}</span>
            </span>
          </span>
        </span>
      </template>
      <template #cell-customer="{ row }">
        <template v-if="row.customer">{{ row.customer.firstName }} {{ row.customer.lastName }}</template>
        <span v-else class="ek-muted">{{ row.externalUserName || 'Anonim müşteri' }}</span>
      </template>
      <template #cell-status="{ row }">
        <EkStatusChip :tone="effectiveTone(row)" :label="effectiveLabel(row)" />
      </template>
      <template #cell-date="{ row }"><span class="ek-num">{{ formatDateTime(row.date) }}</span></template>
      <template #cell-actions="{ row }">
        <span class="ek-row-actions">
          <EkButton tone="ghost" size="sm" :icon="needsReply(row) ? 'mdi-message-reply-text' : 'mdi-eye'" icon-only :aria-label="needsReply(row) ? 'Mesajı cevapla' : 'Mesajı görüntüle'" @click="openDetail(row)" />
          <EkButton tone="ghost" size="sm" icon="mdi-delete-sweep-outline" icon-only aria-label="Mesajı sil" @click="triggerDelete(row)" />
        </span>
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
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
import { formatDate, formatDateTime } from '@/composables/format';
import { text, emphasis } from '@/components/layout/messageParts';

import LoadingComponent from '@/components/LoadingComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import MessageDetailComponent from '@/components/message/MessageDetailComponent.vue';
import MessageWaitChip from '@/components/message/MessageWaitChip.vue';
import { isAwaitingReply, sortAwaitingFirst } from '@/components/message/messageSla';
import EkListScreen from '@/components/ds/templates/EkListScreen.vue';
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue';
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue';
import EkButton from '@/components/ds/EkButton.vue';
import EkDateField from '@/components/ds/EkDateField.vue';
import EkChannelDot from '@/components/ds/EkChannelDot.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkTooltip from '@/components/ds/EkTooltip.vue';
import { isRequestError } from '@/components/ds/listStandard';

const emits = defineEmits(['clear'])

const restApi = useRestApi();
const { t } = useI18n();
const snackbarStore = useSnackbarStore();

const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".messageListView");
const loading = ref(false);
const loadError = ref(false);
const messages = ref<any[]>([]);
const selectedMessages = ref<Array<string | number>>([]);
const selectedMessage = ref<any>(null);
const detailDialog = ref({ show: false });
const actionDialog = ref<any>({ show: false });


const pagination = reactive({
  page: 1,
  limit: 25,
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

const REJECT_OPTIONS = [{ label: 'Tümü', value: null }, { label: 'Sadece reddedilenler', value: true }, { label: 'Reddedilmeyenler', value: false }];
const CHANNEL_OPTIONS = [{ title: 'Trendyol', value: 'trendyol' }, { title: 'Hepsiburada', value: 'hepsiburada' }, { title: 'N11', value: 'n11' }];

// DS-v2 liste standardı. MessageService.getMessages `sortBy.key` ile SUNUCUDA sıralar
// (saklanan alanlar: tip, durum, tarih).
const columns: EkGridColumn[] = [
  { key: 'type', label: 'Tip', sortable: true },
  { key: 'channel', label: 'Kanal' },
  { key: 'text', label: 'Mesaj' },
  { key: 'customer', label: 'Müşteri' },
  // C2.5 — bekleme süresi rozeti Mesaj hücresinde: ayrı kolon/tarih hücresi dar ekranda yatay kaydırmanın dışında kalıyordu.
  { key: 'date', label: 'Tarih', sortable: true },
  { key: 'status', label: 'Durum', sortable: true },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
];

// Bekleme süresi dakikada bir tazelenir (sekme açık kaldıkça rozetler eskimesin).
const now = ref(new Date());
const nowTimer = window.setInterval(() => { now.value = new Date(); }, 60_000);
onBeforeUnmount(() => window.clearInterval(nowTimer));

// "Bekleyenler önce" YALNIZ istemci tarafı ve yalnız bu sayfa (backend'de bu sıralama yok).
const awaitingFirst = ref(false);
const awaitingOnPage = computed(() => messages.value.filter(isAwaitingReply).length);

const rows = computed(() => {
  const mapped = messages.value.map((m: any) => ({ ...m, shortText: `Mesaj: ${String(m.text ?? '').slice(0, 30)}` }));
  return awaitingFirst.value ? sortAwaitingFirst(mapped, now.value) : mapped;
});

const gridSort = computed<EkGridSort>(() => {
  const current = sortBy.value[0] ?? { key: 'date', order: 'desc' };
  return { key: current.key, dir: current.order === 'asc' ? 'asc' : 'desc' };
});

function onGridSort(sort: EkGridSort) {
  awaitingFirst.value = false;
  sortBy.value = sort ? [{ key: sort.key, order: sort.dir }] : [];
  getMessages(true);
}

// Aktif filtre çipleri — SON SORGULANAN değerlerden.
type MessageFilterData = typeof searchForm.data;
const applied = ref<MessageFilterData>({ ...searchForm.data });

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const a = applied.value;
  const chips: EkActiveFilterChip[] = [];
  if (a.globalSearch) chips.push({ key: 'globalSearch', label: 'Arama', value: a.globalSearch });
  if (a.status) chips.push({ key: 'status', label: 'Durum', value: MESSAGE_STATUS_LABELS[a.status as MessageStatusEnum] ?? a.status });
  if (a.type) chips.push({ key: 'type', label: 'Tip', value: MESSAGE_TYPE_LABELS[a.type as MessageTypeEnum] ?? a.type });
  if (a.isRejected !== null) chips.push({ key: 'isRejected', label: 'Red', value: a.isRejected ? 'Reddedilenler' : 'Reddedilmeyenler' });
  if (a.integrationCodes.length) chips.push({ key: 'integrationCodes', label: 'Kanal', value: a.integrationCodes.map(c => CHANNEL_OPTIONS.find(o => o.value === c)?.title ?? c).join(', ') });
  if (a.startDate) chips.push({ key: 'startDate', label: 'Başlangıç', value: formatDate(a.startDate) });
  if (a.endDate) chips.push({ key: 'endDate', label: 'Bitiş', value: formatDate(a.endDate) });
  return chips;
});

const panelFilterCount = computed(() => activeChips.value.filter(c => c.key !== 'globalSearch').length);

function removeChip(key: string) {
  const d = searchForm.data as Record<string, any>;
  d[key] = key === 'integrationCodes' ? [] : key === 'globalSearch' ? '' : null;
  getMessages(true);
}

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


const getMessagesInternal = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
  applied.value = { ...searchForm.data, integrationCodes: [...searchForm.data.integrationCodes] };

  try {
    const payload = {
      searchMessageForm: { data: searchForm.data },
      pagination: { page: pagination.page, limit: pagination.limit },
      sortBy: sortBy.value[0] || { key: 'date', order: 'desc' }
    };

    const res = await restApi.post('MessageService/getMessages', payload);
    if (isRequestError(res)) {
      loadError.value = true;
    } else if (res?.messages) {
      messages.value = res.messages;
      pagination.totalNumberOfRecords = res.totalNumberOfRecords || 0;
      pagination.totalNumberOfPages = res.totalNumberOfPages || 1;
    }
  } catch (e) {
    loadError.value = true;
    snackbarStore.addSnackbar({ text: "Veri yükleme hatası!", color: "error" });
  } finally {
    loading.value = false;
  }
};

function onSearchInput(value: string) {
  searchForm.data.globalSearch = value;
  getMessages(true);
}

function applyAdvancedFilters() {
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
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .messageListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-message-type {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-message-type .v-icon {
  color: var(--ek-color-content-muted);
}

.ek-message-type .v-icon.is-danger {
  color: var(--ek-color-error);
}

.ek-message-text {
  display: flex;
  flex-direction: column;
  max-width: 420px;
}

.ek-message-text__body,
.ek-message-text__ctx {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-message-text__ctx {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

:deep(.ek-message-unread) .ek-message-text__body {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-row-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}

.ek-message-text__meta {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

.ek-message-awaiting {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
}

.ek-message-awaiting-count {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.ek-message-awaiting-toggle.is-active {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ek-message-awaiting-toggle__scope {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.ek-message-awaiting-toggle.is-active .ek-message-awaiting-toggle__scope {
  color: inherit;
}

.ek-bulk-danger {
  color: var(--ek-color-error);
}
</style>
