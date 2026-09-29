<template>
  <div class="admin-view ticket-list-view d-flex flex-column">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <EkConfirmDialog
      v-model="confirmDialog.show"
      :title="confirmDialog.title"
      :description="confirmDialog.description"
      confirm-label="Sil"
      danger
      :loading="deleting"
      @confirm="confirmDialog.onConfirm"
      @cancel="confirmDialog.show = false"
    />

    <div class="pa-4 pb-0">
      <EkPageHeader
        section="Yönetim"
        title="Destek Yönetimi"
        description="Müşteri taleplerini ve teknik destek biletlerini buradan yönetin ve cevaplayın."
      />
    </div>

    <!-- Bilgi bandı: spec çapası metin "DESTEK MERKEZİ ANALİZİ" büyük harf AYNEN kalır (Karar 1.2
         istisnası — üst etiket/overline stiliyle), açıklama cümle düzeninde. -->
    <div class="pa-4 pb-0">
      <v-alert border="start" density="compact" color="warning" variant="tonal" class="info-banner">
        <template v-slot:prepend>
          <v-icon size="20">mdi-information-outline</v-icon>
        </template>
        <div class="d-flex flex-column">
          <span class="info-banner-overline">DESTEK MERKEZİ ANALİZİ</span>
          <span class="info-banner-text">Müşteri talepleri ve teknik destek biletlerini buradan yönetebilir ve cevaplayabilirsiniz.</span>
        </div>
      </v-alert>
    </div>

    <!-- Arama ve filtreler -->
    <div class="d-flex pa-4 pt-2 pb-0 align-center flex-wrap search-section">
      <v-text-field clearable label="Talep No, Konu veya Mesaj Ara" v-model="search"
        class="flex-grow-1" hide-details @keyup.enter.stop="loadTickets(true)"
        @click:clear="search = ''; loadTickets(true)">
        <template #append-inner>
          <v-btn icon variant="text" density="comfortable" @click.stop="loadTickets(true)"
            aria-label="Talepleri ara"><v-icon>mdi-magnify</v-icon></v-btn>
        </template>
      </v-text-field>

      <div class="d-flex align-center filter-group">
        <div class="status-select-wrap">
          <v-select v-model="activeTab" :items="statusOptions" item-title="title" item-value="id"
            class="status-select-premium" aria-label="Talep durumu filtresi">
            <template v-slot:prepend-inner>
              <v-icon size="18" color="content-muted">mdi-filter-outline</v-icon>
            </template>
          </v-select>
        </div>

        <v-btn icon variant="outlined" density="comfortable" @click="loadTickets(true)"
          :loading="loading" aria-label="Talepleri yenile">
          <v-icon>mdi-refresh</v-icon>
          <v-tooltip activator="parent" location="top">Yenile</v-tooltip>
        </v-btn>
      </div>
    </div>

    <!-- ek-pattern-exception: EkDataTable — e2e/specs/admin-tickets.spec.ts satır 98/114 sıralı DOM
         kancalarına bağlıdır (`thead button:has(.mdi-plus)`, `.status-select-premium`, `tbody tr`
         sayımı); bu kancalar ADR-0015 Ek A'da AÇIKÇA korunan yapılardır ("tbody tr / thead button
         yapıları"). `EkDataTable` başlık hücrelerine özel slot SUNMUYOR (yalnızca `cell-<key>`),
         bu yüzden "+" düğmesini `<thead>` içine taşıyamıyoruz — hedef aşama: spec kancası
         `data-testid`'e taşınınca (BACKLOG), bu tablo `EkDataTable`'a geçirilecek. -->
    <div class="table-wrapper mt-2">
      <v-data-table-server v-model:sort-by="sortBy" :items="tickets" :items-length="pagination.total" :loading="loading"
        :headers="headers" class="pa-0 ma-0 desktop-table" fixed-header aria-label="Destek talepleri tablosu"
        @update:options="onOptionsUpdate">

        <template v-slot:header.actions>
          <div class="d-flex justify-end">
            <v-btn icon variant="text" density="comfortable" color="primary" @click="openCreateDialog()"
              aria-label="Yeni talep başlat">
              <v-icon>mdi-plus</v-icon>
              <v-tooltip activator="parent" location="top">Yeni Talep Başlat</v-tooltip>
            </v-btn>
          </div>
        </template>

        <template v-slot:item="{ item }: any">
          <tr :key="item._id" @click="openTicket(item)" class="cursor-pointer">
            <td class="cell-muted">TKT-{{ item.ticketNumber }}</td>
            <td>
              <div class="d-flex flex-column">
                <span class="cell-title">{{ item.subject }}</span>
                <span class="cell-overline">{{ item.type }}</span>
              </div>
            </td>
            <td>
              <EkStatusChip tone="neutral" :label="`ID: ${item.clientId}`" />
            </td>
            <td>
              <EkStatusChip :tone="priorityTone(item.priority)" :label="item.priority" />
            </td>
            <td class="text-left">
              <EkStatusChip :tone="statusTone(item.status)" :label="$t(statusEntry(item.status).labelKey)" />
            </td>
            <td>
              <div class="d-flex flex-column">
                <span class="cell-snippet line-clamp-1">{{ item.lastMessageSnippet || 'Mesaj yok' }}</span>
                <span class="cell-time">{{ formatTime(item.lastMessageAt) }}</span>
              </div>
            </td>
            <td>
              <div class="d-flex justify-end">
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
            <EkPagination :page="pagination.page" :page-size="pagination.limit" :total="pagination.total"
              @update:page="onPageChange" @update:page-size="onPageSizeChange" />
          </div>
        </template>

        <template v-slot:no-data>
          <EkEmptyState v-if="!loading" variant="no-results" title="Talep bulunamadı."
            message="Arama kriterlerinize uygun destek talebi yok." />
        </template>
      </v-data-table-server>
    </div>

    <AdminChatComponent v-model="chatDialog" :ticket="selectedTicket" @reply="handleReply" />

    <!-- ek-pattern-exception: EkFormDialog — e2e/specs/admin-tickets.spec.ts:118
         `getByRole('button', { name: /TALEBİ OLUŞTUR/ })` (i bayraksız regex) DOM'da birebir metin
         ister; `EkFormDialog`'un onay düğmesi sabit "Kaydet" metnine sahip (özelleştirilemiyor).
         `ActionDialogComponent` (mevcut, `confirmText` prop'u destekliyor) KORUNDU. -->
    <ActionDialogComponent v-model="createDialog.show" title="Yeni Destek Talebi Başlat"
      subtitle="Belirli bir dükkan için yeni bir destek süreci başlatın" icon="mdi-store-edit-outline" color="primary"
      confirmText="TALEBİ OLUŞTUR" cancelText="İptal" :isLoading="createDialog.loading" @confirm="doCreateTicket"
      @cancel="createDialog.show = false" attach=".ticket-list-view" maxWidth="600px">
      <div class="pa-2 d-flex flex-column ga-4">
        <v-autocomplete v-model="createDialog.targetClientId" :items="clients" item-title="name" item-value="clientId"
          label="Hedef Mağaza (Dükkan)" prepend-inner-icon="mdi-store-outline" hide-details></v-autocomplete>

        <v-text-field v-model="createDialog.subject" label="Talep Konusu"
          prepend-inner-icon="mdi-format-title" hide-details></v-text-field>

        <v-textarea v-model="createDialog.content" label="İlk Mesaj İçeriği"
          prepend-inner-icon="mdi-text-box-outline" rows="4" hide-details></v-textarea>
      </div>
    </ActionDialogComponent>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue';
import useRestApi from '@/composables/restapi';
import AdminChatComponent from '@/components/adminPanel/AdminChatComponent.vue';
import LoadingComponent from '@/components/LoadingComponent.vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import EkPageHeader from '@/components/ds/EkPageHeader.vue';
import EkConfirmDialog from '@/components/ds/EkConfirmDialog.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';
import EkPagination from '@/components/ds/EkPagination.vue';
import { formatDateTime } from '@/composables/format';
import { TICKET_STATUS_TONE, type StatusMapEntry, type StatusTone } from '@/design/status-map';
import { TicketStatusEnum } from '@/types/TicketTypes';
import { useSnackbarStore } from '@/stores/snackbarStore';

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();
const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".ticket-list-view");

const loading = ref(false);
const deleting = ref(false);
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

const confirmDialog = reactive<{ show: boolean; description: string; title: string; onConfirm: () => void }>({
  show: false, title: 'Talebi sil', description: '', onConfirm: () => { },
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
  { title: '', key: 'actions', align: 'end', sortable: false, width: '80px' },
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

function onPageChange(page: number) {
  pagination.page = page;
  loadTickets();
}

function onPageSizeChange(size: number) {
  pagination.limit = size;
  loadTickets(true);
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
  deleting.value = true;
  try {
    const res = await restApi.post('AdminService/deleteTicket', { ticketId: ticket._id });
    if (res?.success) {
      snackbarStore.addSnackbar({ text: 'Talep başarıyla silindi.', color: 'success' });
      loadTickets();
    }
  } finally {
    deleting.value = false;
    confirmDialog.show = false;
  }
}

function confirmDelete(ticket: any) {
  confirmDialog.title = `'TKT-${ticket.ticketNumber}' silinsin mi?`;
  confirmDialog.description = 'Bu işlem geri alınamaz; talep ve mesaj geçmişi kalıcı olarak silinir.';
  confirmDialog.onConfirm = () => doDelete(ticket);
  confirmDialog.show = true;
}

// Karar 3.3 — durum kodu status-map.ts TEK KAYNAĞINDAN okunur (ekran renk seçmez).
function statusEntry(status: string): StatusMapEntry {
  return TICKET_STATUS_TONE[status as TicketStatusEnum] ?? { tone: 'neutral', labelKey: 'status.ticket.closed' };
}
function statusTone(status: string): StatusTone {
  return statusEntry(status).tone;
}

// Öncelik (priority), status-map.ts'in kapsadığı durum ailelerinden biri DEĞİL — talebe özgü, yerel
// bir ton eşlemesidir (bkz. AdminChatComponent.vue'daki AYNI eşleme).
const PRIORITY_TONE: Record<string, StatusTone> = {
  URGENT: 'danger', HIGH: 'warning', MEDIUM: 'info', LOW: 'neutral',
};
function priorityTone(priority: string): StatusTone {
  return PRIORITY_TONE[priority] ?? 'neutral';
}

const formatTime = (date: any) => date ? formatDateTime(date) : '—';

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
  background: var(--ek-color-background);
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

/* A-yaması bulgusu (B3): `EkPagination`'ın sayfa-başına seçicisinin yüzen etiketi Vuetify
   varsayılan rengiyle (~4,29:1) render oluyor, AA'nın (4,5:1) altında kalıyor — `ds/**`
   dokunulmaz olduğu için burada, YEREL olarak `content-default`'a bağlandı (BACKLOG'a A-yaması
   olarak yazıldı: EkPagination.vue'nun kendisi düzeltilmeli, tüm tüketicileri etkiliyor). */
:deep(.ek-pagination__page-size .v-field-label) {
  color: var(--ek-color-content-default) !important;
  opacity: 1 !important;
}

.info-banner {
  border-color: var(--ek-color-warning) !important;
}

.info-banner-overline {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  color: var(--ek-color-content-muted);
  line-height: 1.4;
}

.info-banner-text {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}

// Tablo başlık metni: global başlık zemininde AA kontrastı için `content-default`.
:deep(.v-data-table-header__content) {
  span {
    font-size: var(--ek-font-size-xs) !important;
    color: var(--ek-color-content-default) !important;
  }
}

.status-select-premium :deep(.v-field__input) {
  font-size: var(--ek-font-size-xs) !important;
  font-weight: var(--ek-font-weight-semibold) !important;
}

.cell-muted {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-semibold);
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

.cell-snippet {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-neutral);
}

.cell-time {
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
