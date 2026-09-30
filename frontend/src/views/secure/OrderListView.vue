<template>
  <div class="orderListView">
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

    <EkListScreen
      section="Satış"
      title="Siparişler"
      description="Tüm pazaryeri siparişlerinizi buradan yönetin."
      label="Siparişler tablosu"
      noun="sipariş"
      row-key="_id"
      label-key="orderNumber"
      :columns="columns"
      :rows="orders"
      :loading="loading"
      :error="loadError"
      error-title="Siparişler yüklenemedi"
      :search="searchOrderForm.data.globalSearch"
      search-placeholder="Sipariş No, Müşteri Adı veya Telefon Ara"
      :chips="activeChips"
      :filter-count="panelFilterCount"
      :saved-views="savedViews"
      selectable
      v-model:selected="selectedOrders"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Sipariş bulunamadı"
      empty-text="Pazaryerlerinden sipariş geldikçe burada listelenir."
      empty-icon="mdi-cart-outline"
      filtered-empty-title="Sipariş bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir sipariş kaydı bulunamadı."
      @update:search="onSearchInput"
      @update:sort="onGridSort"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
      @filter-submit="getOrders(true)"
      @filter-reset="resetFilters"
      @remove-chip="removeChip"
      @clear-filters="resetFilters"
      @apply-view="applySavedView"
      @refresh="getOrders(true)"
    >
      <template #filters>
        <v-select v-model="searchOrderForm.data.integrationCodes" :items="integrationStore.getClientPlatforms()"
          item-title="title" item-value="code" label="Kanal" multiple chips closable-chips clearable />
        <v-select v-model="searchOrderForm.data.internalStatuses" :items="statusOptions" item-title="title"
          item-value="id" label="Sipariş durumu" multiple chips closable-chips clearable />
        <v-select v-model="searchOrderForm.data.allocationStates" :items="allocationOptions" item-title="title"
          item-value="id" label="Stok durumu" multiple chips closable-chips clearable />
      </template>

      <template #bulk-actions>
        <EkButton size="sm" icon="mdi-check-circle-outline" :disabled="bulkActionCounts.APPROVE === 0" @click="triggerBulkAction('APPROVE')">
          Onayla ({{ bulkActionCounts.APPROVE }})
        </EkButton>
        <EkButton size="sm" icon="mdi-file-document-edit-outline" :disabled="bulkActionCounts.INVOICE === 0" @click="triggerBulkAction('INVOICE')">
          Fatura kes ({{ bulkActionCounts.INVOICE }})
        </EkButton>
        <EkButton size="sm" icon="mdi-truck-delivery-outline" :disabled="bulkActionCounts.SHIP === 0" @click="triggerBulkAction('SHIP')">
          Kargoya ver ({{ bulkActionCounts.SHIP }})
        </EkButton>
        <EkButton size="sm" icon="mdi-delete-sweep-outline" class="ek-bulk-danger" :disabled="bulkActionCounts.CANCEL === 0" @click="handleCancelRequest()">
          İptal et ({{ bulkActionCounts.CANCEL }})
        </EkButton>
      </template>

      <template #cell-orderNumber="{ row }">
        <span class="ek-order-no">
          {{ row.orderNumber }}
          <v-icon v-if="row.flags?.isInvoiceGenerated" size="14" icon="mdi-receipt-text-check" class="ek-order-no__icon" aria-label="Fatura kesildi" />
        </span>
      </template>
      <template #cell-integrationCode="{ row }">
        <EkChannelDot :code="row.integrationCode" />
      </template>
      <template #cell-customer="{ row }">
        {{ customerName(row) }}
      </template>
      <template #cell-items="{ row }">
        <button type="button" class="ek-order-items" :aria-label="`${row.orderNumber} içeriğini görüntüle`" @click="openDetailedReport(row)">
          <span class="ek-num">{{ row.items?.length || 0 }} kalem</span>
          <span v-if="row.items?.length > 0" class="ek-order-items__name">{{ row.items[0].productName }}</span>
        </button>
      </template>
      <template #cell-allocation="{ row }">
        <span v-if="allocationSummary(row)" class="ek-order-alloc">
          <EkStatusChip :tone="ALLOCATION_STATE_TONE[allocationSummary(row)!.state].tone"
            :label="$t(ALLOCATION_STATE_TONE[allocationSummary(row)!.state].labelKey)" />
          <span v-if="allocationSummary(row)!.distinct > 1" class="ek-order-alloc__count ek-num">
            {{ allocationSummary(row)!.count }}/{{ allocationSummary(row)!.tracked }} kalem
          </span>
        </span>
        <span v-else class="ek-order-alloc__none">—</span>
      </template>
      <template #cell-orderDate="{ row }">
        <span class="ek-num">{{ formatDateTime(row.dates?.orderDate) }}</span>
      </template>
      <template #cell-total="{ row }">
        <span class="ek-order-total">
          <span class="ek-num">{{ formatMoney(row.financials?.grandTotal) }}</span>
          <EkStatusChip v-if="row.platformDiscrepancy?.hasDiscrepancy" tone="danger" label="Tutar uyuşmuyor" />
        </span>
      </template>
      <template #cell-internalStatus="{ row }">
        <span class="ek-order-status">
          <EkStatusChip :tone="statusEntry(row.internalStatus).tone" :label="$t(statusEntry(row.internalStatus).labelKey)" />
          <EkStatusChip v-if="isOrderLocked(row)" tone="warning" label="Kilitli" />
          <EkStatusChip v-if="row.internalStatus === OrderInternalStatusEnum.CANCELLED" tone="neutral" :label="getCancelSourceLabel(row.cancelSource)" />
        </span>
      </template>
      <template #cell-actions="{ row }">
        <span class="ek-row-actions">
          <EkButton tone="ghost" size="sm" icon="mdi-eye" icon-only aria-label="Sipariş detayını görüntüle" @click="openDetailedReport(row)" />
          <span v-if="!hasAnyRowAction(row)" class="ek-row-actions__spacer" aria-hidden="true"></span>
          <EkContextMenu v-else :groups="rowMenu(row)" :label="`${row.orderNumber} işlemleri`" @select="(it) => onRowMenu(row, it.key)">
            <template #activator="{ props: menuProps }">
              <EkButton v-bind="menuProps" tone="ghost" size="sm" icon="mdi-dots-horizontal" icon-only :aria-label="`${row.orderNumber} için diğer eylemler`" />
            </template>
          </EkContextMenu>
        </span>
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue'

// Composables
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useOrderFilters } from '@/components/order/composables/useOrderFilters'
import { useOrderActions } from '@/components/order/composables/useOrderActions'
import { useOrderCancel } from '@/components/order/composables/useOrderCancel'
import { useLifecycle } from '@/composables/useLifecycle'
import { formatMoney, formatDateTime } from '@/composables/format'
import { ORDER_STATUS_TONE, ALLOCATION_STATE_TONE, ALLOCATION_STATES } from '@/design/status-map'
import { useI18n } from 'vue-i18n'
import { isAllocationState, summarizeOrderAllocation } from '@/composables/useStockHealthApi'

// Types & Enums
import { OrderInternalStatusEnum } from '@/types/OrderTypes'

// Components
import LoadingComponent from '@/components/LoadingComponent.vue'
import OrderDetailComponent from '@/components/order/OrderDetailComponent.vue'
import ManualInvoiceComponent from '@/components/order/ManualInvoiceComponent.vue'
import ManualShipmentComponent from '@/components/order/ManualShipmentComponent.vue'
import BarcodePrintComponent from '@/components/order/BarcodePrintComponent.vue'
import EkListScreen from '@/components/ds/templates/EkListScreen.vue'
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue'
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue'
import type { EkMenuGroup } from '@/components/ds/EkMenuPanel.vue'
import type { EkSavedViewsConfig } from '@/components/ds/EkSavedViews.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkContextMenu from '@/components/ds/EkContextMenu.vue'
import EkChannelDot from '@/components/ds/EkChannelDot.vue'
import { isRequestError } from '@/components/ds/listStandard'
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
const { t } = useI18n()
const snackbarStore = useSnackbarStore()
const integrationStore = useIntegrationStore()

// DS-v2 liste standardı: kolonlar. Sıralanabilir kolonlar backend izin listesindeki alanlara
// eşlenir (OrderService.getOrders `sort.field` — SUNUCU tarafı sıralama).
const columns: EkGridColumn[] = [
  { key: 'orderNumber', label: 'Sipariş no', type: 'id', sortable: true },
  { key: 'integrationCode', label: 'Kanal', sortable: true },
  { key: 'customer', label: 'Müşteri' },
  { key: 'items', label: 'İçerik' },
  // C1.1: kalem stok tahsis durumu (en önemli kalem durumu; getOrders items[].allocationState)
  { key: 'allocation', label: 'Stok' },
  { key: 'orderDate', label: 'Tarih', sortable: true },
  { key: 'total', label: 'Tutar', type: 'num', sortable: true },
  { key: 'internalStatus', label: 'Durum', sortable: true },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
]

const SORT_FIELD: Record<string, string> = {
  orderNumber: 'orderNumber',
  integrationCode: 'integrationCode',
  orderDate: 'dates.orderDate',
  total: 'financials.grandTotal',
  internalStatus: 'internalStatus',
}

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
  searchOrderForm, pagination, statusOptions, sortBy,
  resetFilters, onSortUpdate,
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

// Grid sıralama durumu ← sunucu sıralama durumu (varsayılan: tarih, yeniden eskiye).
const gridSort = computed<EkGridSort>(() => {
  const current = sortBy.value[0]
  const key = Object.keys(SORT_FIELD).find(k => SORT_FIELD[k] === current?.key)
  return key ? { key, dir: current.order === 'asc' ? 'asc' : 'desc' } : null
})

function onGridSort(sort: EkGridSort) {
  // Üçüncü tık (sıralama kaldır) → backend varsayılanı: en yeni sipariş üstte.
  onSortUpdate(sort ? [{ key: SORT_FIELD[sort.key], order: sort.dir }] : [{ key: 'dates.orderDate', order: 'desc' }])
}

// Aktif filtre çipleri — SON SORGULANAN değerlerden (panelde düzenlenip henüz sorgulanmamış değer çip olmaz).
const applied = ref({ globalSearch: '', integrationCodes: [] as string[], internalStatuses: [] as string[], allocationStates: [] as string[] })

// "Stok durumu" filtresi — kapalı küme (status-map ALLOCATION_STATES), etiketler status.allocation.*
const allocationOptions = computed(() => ALLOCATION_STATES.map(id => ({ id, title: allocationTitle(id) })))
function allocationTitle(id: string): string {
  return isAllocationState(id) ? t(ALLOCATION_STATE_TONE[id].labelKey) : id
}
const allocationSummary = (row: any) => summarizeOrderAllocation(row?.items)
/** Sekme/URL parametresinden yalnızca geçerli durum kodları (screens.ts `allocationStates` ile aynı küme). */
function allocationParam(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter(isAllocationState)
}

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const chips: EkActiveFilterChip[] = []
  if (applied.value.globalSearch) chips.push({ key: 'globalSearch', label: 'Arama', value: applied.value.globalSearch })
  if (applied.value.integrationCodes.length) {
    chips.push({ key: 'integrationCodes', label: 'Kanal', value: applied.value.integrationCodes.map(platformName).join(', ') })
  }
  if (applied.value.internalStatuses.length) {
    const titleOf = (id: string) => statusOptions.value.find(o => o.id === id)?.title ?? id
    chips.push({ key: 'internalStatuses', label: 'Durum', value: applied.value.internalStatuses.map(titleOf).join(', ') })
  }
  if (applied.value.allocationStates.length) {
    chips.push({ key: 'allocationStates', label: 'Stok durumu', value: applied.value.allocationStates.map(allocationTitle).join(', ') })
  }
  return chips
})

const panelFilterCount = computed(() => (applied.value.integrationCodes.length ? 1 : 0) + (applied.value.internalStatuses.length ? 1 : 0)
  + (applied.value.allocationStates.length ? 1 : 0))

// C2.4 kayıtlı görünümler: son sorgulanan filtreler verilir; görünüme YALNIZ screens.ts `urlParams`
// alanları (durum, stok durumu) girer — arama metni/kanal süzülür (useSavedViews → pickUrlParams).
const savedViews = computed<EkSavedViewsConfig>(() => ({
  screenKey: 'OrderListView',
  params: applied.value,
  fields: [
    { name: 'internalStatuses', label: 'Durum', format: (id) => statusOptions.value.find(o => o.id === id)?.title ?? id },
    { name: 'allocationStates', label: 'Stok durumu', format: allocationTitle },
  ],
}))

/** Görünüm = filtrelerin TAMAMI: görünümde olmayan alanlar (arama, kanal) temizlenir. */
function applySavedView(params: Record<string, any>) {
  const data = searchOrderForm.value.data
  data.globalSearch = ''
  data.integrationCodes = []
  data.internalStatuses = Array.isArray(params.internalStatuses) ? [...params.internalStatuses] : []
  data.allocationStates = allocationParam(params.allocationStates) ?? []
  getOrders(true)
}

function removeChip(key: string) {
  const data = searchOrderForm.value.data
  if (key === 'globalSearch') data.globalSearch = ''
  if (key === 'integrationCodes') data.integrationCodes = []
  if (key === 'internalStatuses') data.internalStatuses = []
  if (key === 'allocationStates') data.allocationStates = []
  getOrders(true)
}

function rowMenu(item: any): EkMenuGroup[] {
  const locked = isOrderLocked(item)
  const ops = [
    { key: 'APPROVE', label: 'Onayla', icon: 'mdi-check-circle-outline' },
    { key: 'INVOICE', label: 'Fatura oluştur', icon: 'mdi-receipt-text-plus-outline' },
    { key: 'SHIP', label: 'Kargoya ver', icon: 'mdi-truck-fast-outline' },
    { key: 'PRINT_LABEL', label: 'Kargo etiketi yazdır', icon: 'mdi-barcode-scan' },
  ].filter(o => isOrderActionAllowed(item, o.key as any)).map(o => ({ ...o, disabled: locked }))
  const groups: EkMenuGroup[] = ops.length ? [{ items: ops }] : []
  if (isOrderActionAllowed(item, 'CANCEL')) {
    groups.push({ items: [{ key: 'CANCEL', label: 'Siparişi iptal et', icon: 'mdi-delete-sweep-outline', danger: true, disabled: locked }] })
  }
  return groups
}

function onRowMenu(item: any, key: string) {
  if (key === 'PRINT_LABEL') return printShippingLabel(item)
  if (key === 'CANCEL') return handleCancelRequest(item)
  handlePlatformAction(item._id, key as 'INVOICE' | 'SHIP' | 'APPROVE')
}

function customerName(item: any): string {
  const name = [item.billingAddress?.firstName, item.billingAddress?.lastName].filter(Boolean).join(' ')
  return name || '—'
}

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
  const d = searchOrderForm.value.data;
  applied.value = {
    globalSearch: d.globalSearch || '', integrationCodes: [...(d.integrationCodes || [])], internalStatuses: [...(d.internalStatuses || [])],
    allocationStates: [...(d.allocationStates || [])],
  };

  try {
    const res = await restApi.post('OrderService/getOrders', {
      searchOrderForm: prepareFilterPayload()
    });
    if (isRequestError(res)) {
      loadError.value = true;
    } else if (res?.orders) {
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
  const known: Record<string, string> = { n11: 'N11' }
  if (known[code]) return known[code]
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
  const allocationStates = allocationParam(parameters?.allocationStates);
  if (allocationStates) {
    searchOrderForm.value.data.allocationStates = allocationStates;
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
  const allocationStates = allocationParam(parameters?.allocationStates);
  if (allocationStates) {
    searchOrderForm.value.data.allocationStates = allocationStates;
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
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .orderListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.border-subtle {
  border: 1px solid var(--ek-color-border-default);
}

.ek-order-no {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.ek-order-no__icon {
  color: var(--ek-color-action);
}

.ek-order-items {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 240px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ek-order-items:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
  border-radius: var(--ek-radius-sm);
}

.ek-order-items__name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-order-total,
.ek-order-status {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.ek-order-alloc {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.ek-order-alloc__count,
.ek-order-alloc__none {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-row-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}

.ek-row-actions__spacer {
  width: var(--ek-control-h-sm);
}

.ek-bulk-danger {
  color: var(--ek-color-error);
}
</style>
