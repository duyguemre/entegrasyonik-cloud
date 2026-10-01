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
      <EkAlert v-if="hasInvoicedOrder" tone="warning" title="Fatura iptali gereklidir">
          Seçtiğiniz {{ isBulk ? invoicedCount + ' adet' : '' }} siparişin faturası kesilmiştir. Siparişi buradan iptal etmeniz faturayı yasal olarak yok etmez — lütfen e-Fatura portalınızdan iptal/iade işlemlerini de yapın.
        </EkAlert>

      <div v-if="!isBulk">
        <div class="text-caption ek-muted mb-2">
          <strong>{{ actionDialog.order?.orderNumber }}</strong> nolu sipariş için iptal nedeni seçiniz:
        </div>
        <v-select v-model="actionDialog.selectedReason" :items="actionDialog.reasons" item-title="title" item-value="id"
          label="İptal gerekçesi" return-object prepend-inner-icon="mdi-comment-question-outline">
        <template #append><EkHelpHint hint="order.approveCancel" /></template>
      </v-select>
      </div>

      <div v-else>
        <EkAlert tone="info" dense class="mb-2">
          Farklı pazar yerlerine ait siparişler gruplandırılmıştır. Her grup için ayrı neden seçmelisiniz.
        </EkAlert>

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

    <EkListScreen channel-key="integrationCode"
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
      :error-text="loadProblem?.action ?? undefined"
      :error-cause="loadProblem?.cause"
      :error-details="loadProblem?.details"
      error-title="Siparişler yüklenemedi"
      :search="filters.globalSearch"
      search-placeholder="Sipariş No, Müşteri Adı veya Telefon Ara"
      :chips="activeChips"
      :filter-count="panelFilterCount"
      :saved-views="savedViews"
      selectable
      v-model:selected="selectedOrders"
      :sort="gridSort"
      :page="page"
      :page-size="limit"
      :total="total"
      empty-title="Sipariş bulunamadı"
      empty-text="Pazaryerlerinden sipariş geldikçe burada listelenir."
      empty-icon="mdi-cart-outline"
      filtered-empty-title="Sipariş bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir sipariş kaydı bulunamadı."
      @update:search="search"
      @search-submit="submitSearch"
      @update:sort="onGridSort"
      @update:page="setPage"
      @update:page-size="setPageSize"
      @filter-submit="getOrders(true)"
      @filter-reset="resetFilters"
      @remove-chip="removeChip"
      @clear-filters="resetFilters"
      @apply-view="applySavedView"
      @refresh="getOrders(true)"
    >
      <!-- faz3-fe-help: ilk kullanım — hiç kayıt yokken "Nasıl başlanır?" (filtreli boş sonuçta gösterilmez). -->
      <template #empty-action><HelpStartLink article="gs-first-integration" /></template>
      <template #filters>
        <EkSelect v-model="filters.integrationCodes" kind="channel" :items="channelSelectOptions" label="Kanal" multiple clearable />
        <EkSelect v-model="filters.internalStatuses" kind="status" :items="statusSelectOptions" label="Sipariş durumu" multiple clearable recent-key="orders.status" />
        <EkSelect v-model="filters.allocationStates" kind="status" :items="allocationSelectOptions" label="Stok durumu" multiple clearable />
        <!-- FR3 madde 10: tarih aralığı (OrderService/getOrders `filter.startDate/endDate` → sipariş tarihi). -->
        <EkDateRange v-model:start="filters.startDate" v-model:end="filters.endDate" label="Sipariş tarihi" value-format="iso-date" />
      </template>

      <template #bulk-actions>
        <EkButton size="sm" icon="mdi-check-circle-outline" :disabled="bulkActionCounts.APPROVE === 0" @click="triggerBulkAction('APPROVE')">
          Onayla ({{ bulkActionCounts.APPROVE }})
        </EkButton>
        <EkButton size="sm" icon="mdi-pencil-outline" :disabled="bulkActionCounts.INVOICE === 0" @click="triggerBulkAction('INVOICE')">
          Fatura kes ({{ bulkActionCounts.INVOICE }})
        </EkButton>
        <EkButton size="sm" icon="mdi-truck-delivery-outline" :disabled="bulkActionCounts.SHIP === 0" @click="triggerBulkAction('SHIP')">
          Kargoya ver ({{ bulkActionCounts.SHIP }})
        </EkButton>
        <EkButton size="sm" icon="mdi-cancel" class="ek-bulk-danger" :disabled="bulkActionCounts.CANCEL === 0" @click="handleCancelRequest()">
          İptal et ({{ bulkActionCounts.CANCEL }})
        </EkButton>
      </template>

      <template #cell-orderNumber="{ row }">
        <span class="ek-order-no">
          {{ row.orderNumber }}
          <v-icon v-if="row.flags?.isInvoiceGenerated" size="14" icon="mdi-receipt-text-check-outline" class="ek-order-no__icon" aria-label="Fatura kesildi" />
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
          <span v-if="row.items?.length > 0" class="ek-order-items__name" :title="row.items[0].productName">{{ row.items[0].productName }}</span>
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
        <!-- P04 (K49): listede yalnız gün; saat ipucunda (1440'ta yatay kaydırma kalmaz). -->
        <time class="ek-num" :datetime="row.dates?.orderDate" :title="formatDateTime(row.dates?.orderDate)">{{ formatDate(row.dates?.orderDate) }}</time>
      </template>
      <template #cell-total="{ row }">
        <span class="ek-order-total">
          <span class="ek-num">{{ formatMoney(row.financials?.grandTotal) }}</span>
          <EkStatusChip v-if="row.platformDiscrepancy?.hasDiscrepancy" tone="danger" label="Tutar uyuşmuyor" />
        </span>
      </template>
      <template #cell-internalStatus="{ row }">
        <span class="ek-order-status">
          <span class="ek-order-status__chips">
            <EkStatusChip :tone="statusEntry(row.internalStatus).tone" :label="$t(statusEntry(row.internalStatus).labelKey)" />
            <EkStatusChip v-if="isOrderLocked(row)" tone="warning" icon="mdi-lock-clock" label="Kilitli" />
          </span>
          <span class="ek-order-status__hint">{{ statusHint(row) }}</span>
        </span>
      </template>
      <template #cell-actions="{ row }">
        <EkRowActions :label="`${row.orderNumber} için diğer eylemler`" :items="rowActions(row)" />
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import HelpStartLink from '@/components/help/HelpStartLink.vue'
import EkHelpHint from '@/components/page/EkHelpHint.vue'
import { EkDateRange, EkSelect, EkAlert, EkRowActions, type EkRowAction, EkButton, EkContextMenu, EkChannelDot, EkStatusChip, EkConfirmDialog, EkFormDialog, EkPlatformMark } from '@entegrasyonik/ui/components'
import type { EkGridColumn, EkGridSort, EkActiveFilterChip, EkMenuGroup } from '@entegrasyonik/ui/components'
import { channelOptionsFrom, toneOptionsFrom } from '@entegrasyonik/ui/components/selectOptions'
import { problemFromError, type ProblemCopy } from '@/composables/useProblem'
import { ref, reactive, computed, watch } from 'vue'

// Composables
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useListQuery, listPayload } from '@/composables/useListQuery'
import { isOrderLocked, countBulkEligible, bulkTargetIds } from '@/components/order/orderRules'
import { useOrderActions } from '@/components/order/composables/useOrderActions'
import { useOrderCancel } from '@/components/order/composables/useOrderCancel'
import { useLifecycle } from '@/composables/useLifecycle'
import { formatMoney, formatDate, formatDateTime } from '@entegrasyonik/ui/format'
import { formatDateRange } from '@entegrasyonik/ui/components/dateRange'
import { ORDER_STATUS_TONE, ALLOCATION_STATE_TONE, ALLOCATION_STATES } from '@/design/status-map'
import { orderStatusOptions, ORDER_STATUS_GUIDE } from '@/design/status-map'
import { useI18n } from 'vue-i18n'
import { isAllocationState, summarizeOrderAllocation } from '@/composables/useStockHealthApi'

// Types & Enums
import { OrderInternalStatusEnum, ORDER_INTERNAL_STATUS_LABELS } from '@/types/OrderTypes'

// Components
import LoadingComponent from '@/components/LoadingComponent.vue'
import OrderDetailComponent from '@/components/order/OrderDetailComponent.vue'
import ManualInvoiceComponent from '@/components/order/ManualInvoiceComponent.vue'
import ManualShipmentComponent from '@/components/order/ManualShipmentComponent.vue'
import BarcodePrintComponent from '@/components/order/BarcodePrintComponent.vue'
import EkListScreen from '@/components/page/templates/EkListScreen.vue'
import type { EkSavedViewsConfig } from '@/components/page/EkSavedViews.vue'
import { isRequestError } from '@entegrasyonik/ui/components/listStandard'


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
  // FR2-ORDERS 31: durum, kaydırmadan görünsün diye kimlik bilgisinin hemen ardında (chip + sade ipucu satırı).
  { key: 'internalStatus', label: 'Durum', sortable: true },
  { key: 'total', label: 'Tutar', type: 'num', sortable: true },
  { key: 'items', label: 'İçerik' },
  // C1.1: kalem stok tahsis durumu (en önemli kalem durumu; getOrders items[].allocationState)
  { key: 'allocation', label: 'Stok' },
  { key: 'orderDate', label: 'Tarih', sortable: true },
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

// X-01: filtre/sayfa/sıralama/yükleme + debounce'lu arama + bayat yanıt koruması.
const {
  filters, applied, sortBy, page, limit, total, items: orders, loading, error,
  load, search, submitSearch, setPage, setPageSize, setSort, resetFilters
} = useListQuery({
  filters: () => ({
    globalSearch: '',
    startDate: undefined as any,
    endDate: undefined as any,
    integrationCodes: [] as string[],
    internalStatuses: [] as string[],
    // C1.1: kalem stok tahsis durumu (OrderService/getOrders `filter.allocationStates`, API_TENANT_SURFACE §2.2)
    allocationStates: [] as string[]
  }),
  sortBy: [{ key: 'dates.orderDate', order: 'desc' }],
  fetch: async (q) => {
    const res = await restApi.post('OrderService/getOrders', { searchOrderForm: listPayload(q) });
    if (isRequestError(res)) throw res;
    return res?.orders ? { items: res.orders, total: res.totalNumberOfRecords || 0 } : null;
  }
});
const loadError = computed(() => error.value !== null)
/** Aşama 6b (Standart 1): hata desenindeki neden + teknik ayrıntı. */
const loadProblem = computed<ProblemCopy | null>(() => error.value ? problemFromError(error.value, 'OrderService/getOrders') : null)
const getOrders = load

const statusOptions = computed(() => Object.values(OrderInternalStatusEnum).map((id) => ({ id, title: ORDER_INTERNAL_STATUS_LABELS[id] })))

// Açık detay, yenilenen listedeki güncel kaydı gösterir.
watch(orders, (rows) => {
  if (!isDetailOpen.value || !selectedOrderForDetail.value) return
  const updated = rows.find((o: any) => o._id === selectedOrderForDetail.value._id)
  if (updated) selectedOrderForDetail.value = updated
})

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
  setSort(sort ? [{ key: SORT_FIELD[sort.key], order: sort.dir }] : [{ key: 'dates.orderDate', order: 'desc' }])
}

// Aktif filtre çipleri — SON SORGULANAN değerlerden (`applied`; panelde düzenlenip henüz sorgulanmamış değer çip olmaz).

// "Stok durumu" filtresi — kapalı küme (status-map ALLOCATION_STATES), etiketler status.allocation.*
const allocationOptions = computed(() => ALLOCATION_STATES.map(id => ({ id, title: allocationTitle(id) })))
// Aşama 6b (Standart 12): alana özel seçim deneyimi — kanal rengi / durum tonu noktası (tek kaynak status-map).
const channelSelectOptions = computed(() => channelOptionsFrom(integrationStore.getClientPlatforms()))
// FR2-ORDERS 31: yaşam döngüsü sırası + sade açıklama alt satırı + iş akışı grupları (status-guide).
const statusSelectOptions = computed(() => orderStatusOptions((s) => ORDER_INTERNAL_STATUS_LABELS[s]))
/** Satırdaki durum ipucu: iptalde kaynak (müşteri/satıcı), diğerlerinde sıradaki işin sade adı. */
function statusHint(row: any): string {
  if (row?.internalStatus === OrderInternalStatusEnum.CANCELLED) return row.cancelSource ? `${getCancelSourceLabel(row.cancelSource)} iptal etti` : 'Sipariş iptal edildi'
  return ORDER_STATUS_GUIDE[row?.internalStatus as OrderInternalStatusEnum]?.hint ?? ''
}
const allocationSelectOptions = computed(() => toneOptionsFrom(allocationOptions.value, (id) => ALLOCATION_STATE_TONE[id as keyof typeof ALLOCATION_STATE_TONE]?.tone))
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
  if (applied.value.startDate || applied.value.endDate) chips.push({ key: 'date', label: 'Tarih', value: formatDateRange(applied.value.startDate, applied.value.endDate) })
  return chips
})

const panelFilterCount = computed(() => (applied.value.integrationCodes.length ? 1 : 0) + (applied.value.internalStatuses.length ? 1 : 0)
  + (applied.value.allocationStates.length ? 1 : 0) + (applied.value.startDate || applied.value.endDate ? 1 : 0))

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
  const data = filters.value
  data.globalSearch = ''
  data.integrationCodes = []
  data.internalStatuses = Array.isArray(params.internalStatuses) ? [...params.internalStatuses] : []
  data.allocationStates = allocationParam(params.allocationStates) ?? []
  data.startDate = undefined
  data.endDate = undefined
  getOrders(true)
}

function removeChip(key: string) {
  const data = filters.value
  if (key === 'globalSearch') data.globalSearch = ''
  if (key === 'integrationCodes') data.integrationCodes = []
  if (key === 'internalStatuses') data.internalStatuses = []
  if (key === 'allocationStates') data.allocationStates = []
  if (key === 'date') { data.startDate = undefined; data.endDate = undefined }
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
    groups.push({ items: [{ key: 'CANCEL', label: 'Siparişi iptal et', icon: 'mdi-cancel', danger: true, disabled: locked }] })
  }
  return groups
}

/** Aşama 6b (Standart 3): satır eylemleri tek desende — görüntüle görünür, platform işlemleri + iptal `⋯` menüsünde. */
function rowActions(item: any): EkRowAction[] {
  const actions: EkRowAction[] = [{ key: 'view', action: 'view', label: 'Sipariş detayını görüntüle', inline: true, onClick: () => openDetailedReport(item) }]
  for (const group of rowMenu(item)) {
    for (const it of group.items) {
      actions.push({ key: it.key, action: it.key === 'CANCEL' ? 'cancel' : it.key === 'PRINT_LABEL' ? 'print' : 'approve', icon: it.icon, label: it.label, disabled: it.disabled, onClick: () => onRowMenu(item, it.key) })
    }
  }
  return actions
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

const bulkActionCounts = computed(() => countBulkEligible(selectedOrderObjects.value));

// --- METHODS ---

async function executeOrderAction(endpoint: string, payload: any) {
  return await restApi.post(endpoint, payload);
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
  const targetIds = bulkTargetIds(selectedOrderObjects.value, type);

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
    filters.value.internalStatuses = parameters.internalStatuses;
  }
  if (parameters?.globalSearch) {
    filters.value.globalSearch = parameters.globalSearch;
  }
  const allocationStates = allocationParam(parameters?.allocationStates);
  if (allocationStates) {
    filters.value.allocationStates = allocationStates;
  }
  await getOrders(true);
  emits('clear')
};

const activate = async (parameters: any) => {
  let flag = false
  if (parameters?.globalSearch) {
    filters.value.globalSearch = parameters.globalSearch;
    flag = true
  }
  if (parameters?.internalStatuses) {
    filters.value.internalStatuses = parameters.internalStatuses;
    flag = true
  }
  const allocationStates = allocationParam(parameters?.allocationStates);
  if (allocationStates) {
    filters.value.allocationStates = allocationStates;
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
  max-width: 220px;
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
  /* fe-polish: ürün adı kolonu genişletip 1440px'te Tarih kolonunu yapışık eylem kolonunun altına itiyordu;
     tam ad ipucunda (title). */
  max-width: 160px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-order-total,
.ek-order-status {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.ek-order-status__chips {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.ek-order-status__hint {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
  white-space: nowrap;
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
