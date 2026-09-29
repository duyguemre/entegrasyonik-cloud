<template>
  <div class="orderListView d-flex flex-column pt-4">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <BarcodePrintComponent ref="barcodePrintComponentRef" />
    <ManualInvoiceComponent ref="manualInvoiceComponentRef" />
    <ManualShipmentComponent ref="manualShipmentComponentRef" />

    <EkConfirmDialog
      v-model="confirmDialog.show"
      :title="confirmDialog.title"
      :description="confirmDialog.message"
      :confirm-label="confirmDialog.confirmText || 'Onayla'"
      :danger="confirmDialog.color === 'error'"
      @confirm="confirmDialog.onConfirm"
      @cancel="confirmDialog.onCancel && confirmDialog.onCancel()"
    />

    <OrderDetailComponent v-model="isDetailOpen" :order="selectedOrderForDetail"
      @statusAction="handleDetailStatusChange" @cancel="handleCancelRequest" @print="printShippingLabel"
      @resolve-discrepancy="onResolveDiscrepancyRequest" />

    <EkFormDialog v-model="actionDialog.show" :title="isBulk ? 'Toplu sipariş iptali' : 'Sipariş iptali'" :loading="actionDialog.loading"
      @submit="onActionDialogConfirm" @cancel="closeActionDialog">
      <v-alert v-if="hasInvoicedOrder" type="warning" variant="tonal" icon="mdi-file-document-remove-outline">
        <div class="text-caption font-weight-semibold">Fatura iptali gereklidir</div>
        <div class="text-caption">
          Seçtiğiniz {{ isBulk ? invoicedCount + ' adet' : '' }} siparişin faturası kesilmiştir. Siparişi buradan iptal etmeniz faturayı yasal olarak yok etmez — lütfen e-Fatura portalınızdan iptal/iade işlemlerini de yapın.
        </div>
      </v-alert>

      <div v-if="!isBulk">
        <div class="text-caption ek-muted mb-2">
          <strong>{{ actionDialog.order?.orderNumber }}</strong> nolu sipariş için iptal nedeni seçiniz:
        </div>
        <v-select v-model="actionDialog.selectedReason" :items="actionDialog.reasons" item-title="title" item-value="id"
          label="İptal gerekçesi" return-object prepend-inner-icon="mdi-comment-question-outline" />
      </div>

      <div v-else>
        <v-alert type="info" variant="tonal" density="compact" class="mb-2 text-caption">
          Farklı pazar yerlerine ait siparişler gruplandırılmıştır. Her grup için ayrı neden seçmelisiniz.
        </v-alert>

        <div v-for="(data, platform) in bulkCancelData" :key="platform" class="pa-3 border-subtle rounded-lg mb-3">
          <div class="d-flex align-center justify-space-between mb-2">
            <EkPlatformMark :name="platformName(String(platform))" :code="String(platform)" />
            <EkStatusChip tone="neutral" :label="`${data.count} sipariş`" />
          </div>
          <v-select v-model="data.selected" :items="data.reasons" item-title="title" item-value="id"
            :label="`${platformName(String(platform))} için neden seçin`" hide-details return-object />
        </div>
      </div>
    </EkFormDialog>

    <EkFormDialog v-model="searchOrderForm.form.menu" title="Sipariş filtreleri" @submit="() => { getOrders(true); searchOrderForm.form.menu = false }" @cancel="resetFilters()">
      <v-select v-model="searchOrderForm.data.integrationCodes" :items="integrationStore.getClientPlatforms()"
        item-title="title" item-value="code" label="Platformlar" multiple chips clearable />
      <v-select v-model="searchOrderForm.data.internalStatuses" :items="statusOptions" item-title="title"
        item-value="id" label="Sipariş durumu" multiple chips clearable />
    </EkFormDialog>

    <EkListPage
      section="Siparişler"
      title="Siparişler"
      description="Tüm pazaryeri siparişlerinizi buradan yönetin."
      :secondary-actions="[{ label: 'Filtrele', icon: 'mdi-filter-variant', onClick: () => (searchOrderForm.form.menu = true) }]"
      :search="searchOrderForm.data.globalSearch"
      search-placeholder="Sipariş No, Müşteri Adı veya Telefon Ara"
      :state="viewState"
      @update:search="onSearchInput"
      @clear-filters="resetFilters"
      @refresh="() => getOrders(true)"
    >
      <template #empty>
        <EkEmptyState variant="no-results" title="Sipariş Bulunamadı" message="Arama kriterlerinize uygun herhangi bir sipariş kaydı bulunamadı." />
      </template>
      <template #error>
        <EkErrorState message="Siparişler yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="() => getOrders(true)" />
      </template>

      <div class="ek-order-table-wrapper">
        <EkDataTable v-if="isDesktopTable" :items="orders" :columns="columns" row-key="_id" aria-label="Siparişler tablosu">
          <template #cell-select="{ item }">
            <v-checkbox-btn :model-value="isOrderSelected(item)" color="primary" density="compact"
              :aria-label="`Siparişi seç: ${item.orderNumber}`"
              @update:model-value="val => onOrderSelectionUpdate(item, !!val)" />
          </template>

          <template #cell-orderNumber="{ item }">
            <div class="d-flex align-center">
              <EkPlatformMark :name="platformName(item.integrationCode)" :code="item.integrationCode" size="sm" :show-name="false" class="mr-3" />
              <div class="d-flex flex-column">
                <div class="d-flex align-center ek-gap-1">
                  <span class="font-weight-medium text-body-2">{{ item.orderNumber }}</span>
                  <v-icon v-if="item.flags?.isInvoiceGenerated" size="14" color="primary" aria-label="Fatura kesildi">mdi-receipt-text-check</v-icon>
                </div>
                <span class="text-caption ek-muted">{{ item.billingAddress?.firstName }} {{ item.billingAddress?.lastName }}</span>
              </div>
            </div>
          </template>

          <template #cell-items="{ item }">
            <div class="d-flex flex-column ek-gap-1 ek-clickable" @click="openDetailedReport(item)">
              <EkStatusChip tone="neutral" :label="`${item.items?.length || 0} kalem ürün`" />
              <span v-if="item.items?.length > 0" class="text-caption ek-muted text-truncate ek-order-item-name">{{ item.items[0].productName }}</span>
            </div>
          </template>

          <template #cell-total="{ item }">
            <div class="d-flex flex-column align-end">
              <span class="font-weight-semibold ek-num">{{ formatMoney(item.financials?.grandTotal) }}</span>
              <EkStatusChip v-if="item.platformDiscrepancy?.hasDiscrepancy" tone="danger" label="Tutar uyuşmuyor" />
            </div>
          </template>

          <template #cell-internalStatus="{ item }">
            <div class="d-flex flex-column align-start ek-gap-1">
              <EkStatusChip :tone="statusEntry(item.internalStatus).tone" :label="$t(statusEntry(item.internalStatus).labelKey)" />
              <EkStatusChip v-if="isOrderLocked(item)" tone="warning" label="Kilitli / işlem sürüyor" />
              <EkStatusChip v-if="item.internalStatus === OrderInternalStatusEnum.CANCELLED" tone="neutral" :label="getCancelSourceLabel(item.cancelSource)" />
            </div>
          </template>

          <template #cell-orderDate="{ item }">
            <span class="text-caption font-weight-medium ek-num">{{ formatDateTime(item.dates?.orderDate) }}</span>
          </template>

          <template #cell-actions="{ item }">
            <div class="d-flex justify-end align-center ek-gap-1">
              <v-btn icon variant="text" density="comfortable" aria-label="Sipariş detayını görüntüle" @click="openDetailedReport(item)">
                <v-icon>mdi-eye</v-icon>
              </v-btn>
              <v-menu v-if="hasAnyRowAction(item)">
                <template #activator="{ props: menuProps }">
                  <v-btn icon variant="text" density="comfortable" aria-label="Diğer eylemler" v-bind="menuProps">
                    <v-icon>mdi-dots-horizontal</v-icon>
                  </v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item v-if="isOrderActionAllowed(item, 'APPROVE')" :disabled="isOrderLocked(item)" @click="handlePlatformAction(item._id, 'APPROVE')">
                    <template #prepend><v-icon size="18">mdi-check-circle-outline</v-icon></template>
                    <v-list-item-title>Onayla</v-list-item-title>
                  </v-list-item>
                  <v-list-item v-if="isOrderActionAllowed(item, 'INVOICE')" :disabled="isOrderLocked(item)" @click="handlePlatformAction(item._id, 'INVOICE')">
                    <template #prepend><v-icon size="18">mdi-receipt-text-plus-outline</v-icon></template>
                    <v-list-item-title>Fatura oluştur</v-list-item-title>
                  </v-list-item>
                  <v-list-item v-if="isOrderActionAllowed(item, 'SHIP')" :disabled="isOrderLocked(item)" @click="handlePlatformAction(item._id, 'SHIP')">
                    <template #prepend><v-icon size="18">mdi-truck-fast-outline</v-icon></template>
                    <v-list-item-title>Kargoya ver</v-list-item-title>
                  </v-list-item>
                  <v-list-item v-if="isOrderActionAllowed(item, 'PRINT_LABEL')" :disabled="isOrderLocked(item)" @click="printShippingLabel(item)">
                    <template #prepend><v-icon size="18">mdi-barcode-scan</v-icon></template>
                    <v-list-item-title>Kargo etiketi yazdır</v-list-item-title>
                  </v-list-item>
                  <v-list-item v-if="isOrderActionAllowed(item, 'CANCEL')" :disabled="isOrderLocked(item)" class="text-error" @click="handleCancelRequest(item)">
                    <template #prepend><v-icon size="18">mdi-delete-sweep-outline</v-icon></template>
                    <v-list-item-title>Siparişi iptal et</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </div>
          </template>
        </EkDataTable>

        <div v-else class="mobile-orders-list d-flex flex-column h-100">
          <div v-if="loading" class="pa-2">
            <v-skeleton-loader v-for="n in 4" :key="n" type="card" class="mb-3 rounded-lg" />
          </div>
          <template v-else>
            <EkEmptyState v-if="!orders?.length" variant="no-results" title="Sipariş Bulunamadı" message="Arama kriterlerinize uygun herhangi bir sipariş kaydı bulunamadı." />
            <v-card v-for="item in orders" :key="item._id" class="mobile-card mb-3" variant="flat" border rounded="lg">
              <div class="pa-3">
                <div class="d-flex align-start justify-space-between mb-3 ek-gap-2">
                  <div class="d-flex align-start ek-gap-3">
                    <v-checkbox-btn :model-value="isOrderSelected(item)" density="compact" color="primary"
                      :aria-label="`Siparişi seç: ${item.orderNumber}`"
                      @update:model-value="val => onOrderSelectionUpdate(item, !!val)" />
                    <div class="d-flex flex-column">
                      <EkPlatformMark :name="platformName(item.integrationCode)" :code="item.integrationCode" size="sm" :show-name="false" class="mb-1" />
                      <span class="font-weight-medium text-body-2">{{ item.orderNumber }}</span>
                    </div>
                  </div>
                  <div class="d-flex flex-column align-end ek-gap-1">
                    <EkStatusChip :tone="statusEntry(item.internalStatus).tone" :label="$t(statusEntry(item.internalStatus).labelKey)" />
                    <EkStatusChip v-if="item.internalStatus === OrderInternalStatusEnum.CANCELLED" tone="neutral" :label="getCancelSourceLabel(item.cancelSource)" />
                    <EkStatusChip v-if="isOrderLocked(item)" tone="warning" label="Kilitli" />
                  </div>
                </div>

                <div class="d-flex flex-wrap align-center justify-space-between mb-3 ek-gap-2">
                  <div>
                    <div class="text-caption ek-muted">Toplam tutar</div>
                    <span class="font-weight-semibold ek-num">{{ formatMoney(item.financials?.grandTotal) }}</span>
                  </div>
                  <div>
                    <div class="text-caption ek-muted text-right">Sipariş tarihi</div>
                    <span class="text-caption font-weight-medium ek-num d-block">{{ formatDateTime(item.dates?.orderDate) }}</span>
                  </div>
                </div>

                <div class="d-flex flex-wrap mb-3 ek-clickable" @click="openDetailedReport(item)">
                  <div class="d-flex flex-column ek-gap-1 flex-grow-1">
                    <EkStatusChip tone="neutral" :label="`${item.items?.length || 0} kalem ürün`" />
                    <span v-if="item.items?.length > 0" class="text-caption ek-muted">{{ item.items[0].productName }}</span>
                  </div>
                  <div class="text-right">
                    <div class="text-caption ek-muted">Müşteri</div>
                    <span class="text-caption text-truncate">{{ item.billingAddress?.firstName }} {{ item.billingAddress?.lastName }}</span>
                  </div>
                </div>

                <div class="d-flex flex-wrap justify-end ek-gap-1 pt-2 border-top-dashed">
                  <v-btn icon variant="text" density="comfortable" aria-label="Sipariş detayını görüntüle" @click="openDetailedReport(item)"><v-icon>mdi-eye</v-icon></v-btn>
                  <v-btn v-if="isOrderActionAllowed(item, 'INVOICE')" icon variant="text" density="comfortable" :disabled="isOrderLocked(item)" aria-label="Fatura oluştur" @click="handlePlatformAction(item._id, 'INVOICE')"><v-icon>mdi-receipt-text-plus-outline</v-icon></v-btn>
                  <v-btn v-if="isOrderActionAllowed(item, 'SHIP')" icon variant="text" density="comfortable" :disabled="isOrderLocked(item)" aria-label="Kargoya ver" @click="handlePlatformAction(item._id, 'SHIP')"><v-icon>mdi-truck-fast-outline</v-icon></v-btn>
                  <v-btn v-if="isOrderActionAllowed(item, 'PRINT_LABEL')" icon variant="text" density="comfortable" :disabled="isOrderLocked(item)" aria-label="Kargo etiketi yazdır" @click="printShippingLabel(item)"><v-icon>mdi-barcode-scan</v-icon></v-btn>
                  <v-btn v-if="isOrderActionAllowed(item, 'CANCEL')" icon variant="text" density="comfortable" :disabled="isOrderLocked(item)" aria-label="Siparişi iptal et" @click="handleCancelRequest(item)"><v-icon>mdi-delete-sweep-outline</v-icon></v-btn>
                </div>
              </div>
            </v-card>
          </template>
        </div>
      </div>

      <template #pagination>
        <EkPagination :page="pagination.page" :page-size="pagination.limit" :total="pagination.totalNumberOfRecords"
          @update:page="onPageChange" @update:pageSize="onPageSizeChange" />
      </template>
    </EkListPage>

    <div v-if="selectedOrders.length > 0" class="ek-order-bulk-bar">
      <span class="text-body-2 font-weight-medium">{{ selectedOrders.length }} seçildi</span>
      <v-btn variant="outlined" prepend-icon="mdi-check-circle-outline" :disabled="bulkActionCounts.APPROVE === 0" @click="triggerBulkAction('APPROVE')">
        Onayla ({{ bulkActionCounts.APPROVE }})
      </v-btn>
      <v-btn variant="outlined" prepend-icon="mdi-file-document-edit-outline" :disabled="bulkActionCounts.INVOICE === 0" @click="triggerBulkAction('INVOICE')">
        Fatura kes ({{ bulkActionCounts.INVOICE }})
      </v-btn>
      <v-btn variant="outlined" prepend-icon="mdi-truck-delivery-outline" :disabled="bulkActionCounts.SHIP === 0" @click="triggerBulkAction('SHIP')">
        Kargoya ver ({{ bulkActionCounts.SHIP }})
      </v-btn>
      <v-btn color="error" variant="outlined" prepend-icon="mdi-delete-sweep-outline" :disabled="bulkActionCounts.CANCEL === 0" @click="handleCancelRequest()">
        İptal et ({{ bulkActionCounts.CANCEL }})
      </v-btn>
      <v-btn icon="mdi-close" variant="text" density="comfortable" aria-label="Seçimi kaldır" @click="selectedOrders = []" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useDisplay } from 'vuetify'
import { breakpoint } from '@/design/tokens'

// Composables
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useOrderFilters } from '@/components/order/composables/useOrderFilters'
import { useOrderActions } from '@/components/order/composables/useOrderActions'
import { useOrderCancel } from '@/components/order/composables/useOrderCancel'
import { useLifecycle } from '@/composables/useLifecycle'
import { formatMoney, formatDateTime } from '@/composables/format'
import { ORDER_STATUS_TONE } from '@/design/status-map'

// Types & Enums
import { OrderInternalStatusEnum } from '@/types/OrderTypes'

// Components
import LoadingComponent from '@/components/LoadingComponent.vue'
import OrderDetailComponent from '@/components/order/OrderDetailComponent.vue'
import ManualInvoiceComponent from '@/components/order/ManualInvoiceComponent.vue'
import ManualShipmentComponent from '@/components/order/ManualShipmentComponent.vue'
import BarcodePrintComponent from '@/components/order/BarcodePrintComponent.vue'
import EkListPage from '@/components/ds/templates/EkListPage.vue'
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue'
import EkPagination from '@/components/ds/EkPagination.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkConfirmDialog from '@/components/ds/EkConfirmDialog.vue'
import EkFormDialog from '@/components/ds/EkFormDialog.vue'
import EkPlatformMark from '@/components/ds/EkPlatformMark.vue'


const emits = defineEmits(['clear'])

defineProps<{
  parameters: any
}>()


// --- INITIALIZATION ---
const restApi = useRestApi()
const snackbarStore = useSnackbarStore()
const integrationStore = useIntegrationStore()

// Vuetify'ın global display.thresholds'una DEĞİL, ADR-0011/ADR-0012 kırılım
// token'larına (breakpoint.desktop) bağlı yerel kırılım — ADR-0011 Karar 1
// "display.thresholds omurgada DEĞİŞMEZ" kararıyla tutarlı.
const { width: viewportWidth } = useDisplay()
const isDesktopTable = computed(() => viewportWidth.value >= breakpoint.desktop)

const columns: EkTableColumn[] = [
  { key: 'select', label: '' },
  { key: 'orderNumber', label: 'SİPARİŞ & MÜŞTERİ' },
  { key: 'items', label: 'SİPARİŞ İÇERİĞİ' },
  { key: 'total', label: 'TUTAR', align: 'end' },
  { key: 'internalStatus', label: 'SİPARİŞ DURUMU' },
  { key: 'orderDate', label: 'SİPARİŞ TARİHİ', align: 'end' },
  { key: 'actions', label: '', type: 'actions', align: 'end' },
]

const loadingComponentRef = ref<any>(null)
const barcodePrintComponentRef = ref()
const manualInvoiceComponentRef = ref()
const manualShipmentComponentRef = ref()
const dialogAttach = ref(".orderListView")
const loading = ref(false)
const loadError = ref(false)
const orders = ref<any[]>([])
const selectedOrders = ref<string[]>([]) // Sadece ID'leri tutar (UI seçimi için)

// Detail & Context
const isDetailOpen = ref(false)
const selectedOrderForDetail = ref<any>(null)

// --- ONAY DİYALOGLARI VE YARDIMCI METOTLAR ---

const confirmDialog = reactive({
  show: false, title: '', subtitle: '', message: '', icon: '', color: 'error',
  confirmText: '', confirmIcon: '', onConfirm: () => { }, onCancel: () => { }
});

const closeActionDialog = () => {
  actionDialog.value.show = false;
};


const onResolveDiscrepancyRequest = async (order: any) => {
  if (!order || !order._id) return;
  await handleResolveDiscrepancy(order._id, confirmDialog);
};


// Kargo sonrası barkod sorusu (Tekil ve Toplu Destekli)
const askForBarcode = (isBulkPrint: boolean = false, count: number = 1): Promise<boolean> => {
  return new Promise((resolve) => {
    confirmDialog.title = isBulkPrint ? "Toplu kargo barkodu yazdırılsın mı?" : "Kargo barkodu yazdırılsın mı?";
    confirmDialog.message = isBulkPrint
      ? `${count} adet paketin kargo barkodunu tek seferde yazdırmak istiyor musunuz?`
      : "Paket için kargo barkodu yazdırmak istiyor musunuz?";
    confirmDialog.color = "success";
    confirmDialog.confirmText = 'Bastır';
    confirmDialog.onConfirm = () => { confirmDialog.show = false; resolve(true); };
    confirmDialog.onCancel = () => { confirmDialog.show = false; resolve(false); };
    confirmDialog.show = true;
  });
};

// --- COMPOSABLES ---

const {
  searchOrderForm, pagination, statusOptions,
  resetFilters,
  handlePageChange, prepareFilterPayload
} = useOrderFilters(getOrders);

const {
  processPlatformAction, processBulkAction, printShippingLabel, handleResolveDiscrepancy
} = useOrderActions(
  restApi, snackbarStore, loadingComponentRef,
  getOrders, askForBarcode, barcodePrintComponentRef
);

const {
  actionDialog, bulkCancelData, isCancelFormValid, isBulk,
  openCancelAction, handleCancelConfirm
} = useOrderCancel(executeOrderAction, snackbarStore, getOrders);

const { isOrderActionAllowed } = useLifecycle();


// --- COMPUTED ---

const viewState = computed(() => {
  if (loading.value) return 'loading'
  if (loadError.value) return 'error'
  if (!orders.value.length) return 'empty'
  return 'ready'
})

const selectedOrderObjects = computed(() => {
  return orders.value.filter(order => selectedOrders.value.includes(order._id));
});

const bulkActionCounts = computed(() => {
  const objects = selectedOrderObjects.value.filter(o => !isOrderLocked(o));
  return {
    APPROVE: objects.filter(o => o.internalStatus === OrderInternalStatusEnum.AWAITING_APPROVAL).length,
    CANCEL: objects.filter(o => [OrderInternalStatusEnum.UNAPPROVED, OrderInternalStatusEnum.AWAITING_APPROVAL, OrderInternalStatusEnum.APPROVED].includes(o.internalStatus)).length,
    INVOICE: objects.filter(o => [OrderInternalStatusEnum.APPROVED, OrderInternalStatusEnum.SHIPPED].includes(o.internalStatus) && !o.invoice?.invoiceNumber).length,
    SHIP: objects.filter(o => [OrderInternalStatusEnum.APPROVED].includes(o.internalStatus)).length
  };
});

// --- METHODS ---

async function getOrders(resetPage: boolean = false) {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
  const guid = loadingComponentRef.value?.info("") || "loading";

  try {
    const res = await restApi.post('OrderService/getOrders', {
      searchOrderForm: prepareFilterPayload()
    });
    if (res.orders) {
      orders.value = res.orders;

      if (isDetailOpen.value && selectedOrderForDetail.value) {
        const updated = res.orders.find((o: any) => o._id === selectedOrderForDetail.value._id);
        if (updated) selectedOrderForDetail.value = updated;
      }

      pagination.totalNumberOfRecords = res.totalNumberOfRecords || 0;
      pagination.totalNumberOfPages = Math.ceil(pagination.totalNumberOfRecords / pagination.limit) || 1;
    }
  } catch (e) {
    loadError.value = true;
  } finally {
    loadingComponentRef.value?.remove(guid);
    loading.value = false;
  }
}

async function executeOrderAction(endpoint: string, payload: any) {
  return await restApi.post(endpoint, payload);
}

function onSearchInput(value: string) {
  searchOrderForm.value.data.globalSearch = value;
  getOrders(true);
}

function onPageChange(newPage: number) {
  pagination.page = newPage;
  handlePageChange();
}

function onPageSizeChange(size: number) {
  pagination.limit = size;
  onPageChange(1);
}

function statusEntry(status: OrderInternalStatusEnum) {
  return ORDER_STATUS_TONE[status] ?? { tone: 'neutral' as const, labelKey: 'status.order.unapproved' };
}

function platformName(code: string): string {
  return code ? code.charAt(0).toUpperCase() + code.slice(1) : 'Bilinmeyen';
}

function hasAnyRowAction(item: any): boolean {
  return isOrderActionAllowed(item, 'APPROVE') || isOrderActionAllowed(item, 'INVOICE')
    || isOrderActionAllowed(item, 'SHIP') || isOrderActionAllowed(item, 'PRINT_LABEL')
    || isOrderActionAllowed(item, 'CANCEL');
}

const handlePlatformAction = (id: string, type: 'INVOICE' | 'SHIP' | 'APPROVE') => {
  const refs = { manualInvoiceComponentRef, manualShipmentComponentRef, barcodePrintComponentRef };
  processPlatformAction(id, type, null, refs);
};

const isOrderLocked = (order: any) => {
  if (!order?.platformOperation?.lockedUntil) return false;
  const lockedUntil = new Date(order.platformOperation.lockedUntil);
  return lockedUntil > new Date();
};

const handleDetailStatusChange = async (p: any) => {
  const refs = { manualInvoiceComponentRef, manualShipmentComponentRef, barcodePrintComponentRef };
  await processPlatformAction(p.orderId, p.action, null, refs);
};

const hasInvoicedOrder = computed(() => {
  return selectedOrderObjects.value.some((o: any) => o.flags?.isInvoiceGenerated);
});

const invoicedCount = computed(() => {
  return selectedOrderObjects.value.filter((o: any) => o.flags?.isInvoiceGenerated).length;
});


const handleCancelRequest = (item?: any) => {
  if (item) {
    openCancelAction(item);
  } else {
    const targets = selectedOrderObjects.value;
    if (targets.length === 0) {
      snackbarStore.addSnackbar({ text: 'İptal edilebilir durumda sipariş bulunamadı.', color: 'warning' });
      return;
    }
    openCancelAction(targets);
  }
};

const onActionDialogConfirm = () => {
  if (!isCancelFormValid.value) {
    snackbarStore.addSnackbar({ text: 'Devam etmeden önce iptal gerekçesini seçin.', color: 'warning' });
    return;
  }
  const refs = { manualInvoiceComponentRef, manualShipmentComponentRef, barcodePrintComponentRef };
  handleCancelConfirm(confirmDialog,
    (id: string, type: any, data: any) => processPlatformAction(id, type, data, refs),
    processBulkCancel
  );
};

const processBulkCancel = async (payload: any) => {
  const guid = loadingComponentRef.value.info(`Toplu işlem yürütülüyor...`);
  try {
    const res = await executeOrderAction('OrderService/bulkCancelOrder', payload);
    if (res.success) snackbarStore.addSnackbar({ text: res.message, color: 'success' });
    return res;
  } finally {
    loadingComponentRef.value.remove(guid);
  }
};

const triggerBulkAction = (type: 'INVOICE' | 'SHIP' | 'APPROVE') => {
  const targetIds = selectedOrderObjects.value
    .filter(o => {
      if (type === 'APPROVE') return o.internalStatus === OrderInternalStatusEnum.AWAITING_APPROVAL;
      if (type === 'INVOICE') {
        return [OrderInternalStatusEnum.APPROVED, OrderInternalStatusEnum.SHIPPED].includes(o.internalStatus) && !o.invoice?.invoiceNumber;
      } else {
        return [OrderInternalStatusEnum.APPROVED].includes(o.internalStatus);
      }
    })
    .map(o => o._id);

  if (targetIds.length === 0) {
    snackbarStore.addSnackbar({ text: 'İşlem yapılacak sipariş bulunamadı.', color: 'warning' });
    return;
  }

  if (type === 'APPROVE') {
    confirmDialog.title = `${targetIds.length} sipariş onaylansın mı?`;
    confirmDialog.message = 'Seçilen siparişler satıcı tarafından onaylanacaktır.';
    confirmDialog.color = 'primary';
    confirmDialog.confirmText = 'Onayla';
  } else {
    confirmDialog.title = type === 'INVOICE' ? `${targetIds.length} siparişe fatura kesilsin mi?` : `${targetIds.length} sipariş kargoya verilsin mi?`;
    confirmDialog.message = 'Eksik bilgi içeren siparişler atlanabilir.';
    confirmDialog.color = type === 'INVOICE' ? 'info' : 'success';
    confirmDialog.confirmText = type === 'INVOICE' ? 'Fatura kes' : 'Kargoya ver';
  }

  confirmDialog.onConfirm = () => {
    confirmDialog.show = false;
    processBulkAction(type, targetIds);
  };

  confirmDialog.show = true;
};

// Yardımcı UI Fonksiyonları
const isOrderSelected = (item: any) => selectedOrders.value.includes(item._id);
const onOrderSelectionUpdate = (item: any, val: boolean) => {
  if (val) selectedOrders.value.push(item._id);
  else selectedOrders.value = selectedOrders.value.filter(id => id !== item._id);
};
const openDetailedReport = (item: any) => { selectedOrderForDetail.value = item; isDetailOpen.value = true; };

const getCancelSourceLabel = (source: string) => {
  if (source === 'SELLER') return 'Satıcı';
  if (source === 'CUSTOMER') return 'Müşteri';
  if (source === 'PLATFORM') return 'Platform';
  return source || 'Bilinmiyor';
};

const initialize = async (parameters: any) => {
  if (parameters?.internalStatuses) {
    searchOrderForm.value.data.internalStatuses = parameters.internalStatuses;
  }
  if (parameters?.globalSearch) {
    searchOrderForm.value.data.globalSearch = parameters.globalSearch;
  }
  await getOrders(true);
  emits('clear')
};

const activate = async (parameters: any) => {
  let flag = false
  if (parameters?.globalSearch) {
    searchOrderForm.value.data.globalSearch = parameters.globalSearch;
    flag = true
  }
  if (parameters?.internalStatuses) {
    searchOrderForm.value.data.internalStatuses = parameters.internalStatuses;
    flag = true
  }
  if (flag) {
    await getOrders(true);
    emits('clear')
  }
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
.orderListView {
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

.ek-order-table-wrapper {
  width: 100%;
}

.ek-order-item-name {
  max-width: 200px;
}

.ek-clickable {
  cursor: pointer;
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-gap-1 { gap: var(--ek-space-1); }
.ek-gap-2 { gap: var(--ek-space-2); }
.ek-gap-3 { gap: var(--ek-space-3); }

.border-subtle {
  border: 1px solid var(--ek-color-border-default);
}

.border-top-dashed {
  border-top: 1px dashed var(--ek-color-border-default);
}

.mobile-orders-list {
  width: 100%;
}

/* Toplu eylem çubuğu — Karar 3.2 "n seçildi · [eylemler] · Seçimi kaldır",
   sade sabit alt çubuk (bounce/hover-lift YOK, Karar 1.1). */
.ek-order-bulk-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  box-shadow: var(--ek-shadow-md);
  margin-top: var(--ek-space-2);
}
</style>
