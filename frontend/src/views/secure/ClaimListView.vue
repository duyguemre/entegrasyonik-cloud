<template>
  <div class="claimListView">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <EkConfirmDialog
      v-model="confirmDialog.show"
      :title="confirmDialog.title"
      :description="confirmDialog.message"
      :confirm-label="confirmDialog.confirmText || 'Onayla'"
      :danger="confirmDialog.color === 'error'"
      @confirm="confirmDialog.onConfirm"
      @cancel="confirmDialog.onCancel && confirmDialog.onCancel()"
    />

    <ClaimDetailComponent v-model="isDetailOpen" :claim="selectedClaimForDetail" @approve="triggerSingleApprove"
      @reject="openRejectAction" />

    <EkFormDialog v-model="actionDialog.show" title="İade/talep reddi" :loading="actionDialog.loading" @submit="handleRejectConfirm(confirmDialog)" @cancel="actionDialog.show = false">
      <v-select v-model="actionDialog.selectedReason" :items="actionDialog.reasons" item-title="title" item-value="id"
        label="Red gerekçesi" return-object prepend-inner-icon="mdi-comment-question-outline">
        <template #append><EkHelpHint hint="claim.decision" /></template>
      </v-select>
    </EkFormDialog>

    <EkListScreen channel-key="integrationCode"
      section="Satış"
      title="İade talepleri"
      description="Pazaryerlerinden gelen iade/talep süreçlerini buradan yönetin."
      label="İade talepleri tablosu"
      noun="talep"
      row-key="_id"
      label-key="externalClaimId"
      :columns="columns"
      :rows="claims"
      :loading="loading"
      :error="loadError"
      :error-text="loadProblem?.action ?? undefined"
      :error-cause="loadProblem?.cause"
      :error-details="loadProblem?.details"
      error-title="İade talepleri yüklenemedi"
      :search="searchClaimForm.data.globalSearch"
      search-placeholder="İade No, Sipariş No veya Takip Ara"
      :chips="activeChips"
      :filter-count="panelFilterCount"
      :saved-views="savedViews"
      selectable
      v-model:selected="selectedClaims"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Talep bulunamadı"
      empty-text="Pazaryerlerinden iade talebi geldikçe burada listelenir."
      empty-icon="mdi-undo-variant"
      filtered-empty-title="Talep bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir iade talebi bulunamadı."
      @update:search="onSearchInput"
      @update:sort="onGridSort"
      @update:page="onPageChange"
      @update:page-size="onPageSizeChange"
      @filter-submit="getClaims(true)"
      @filter-reset="resetFilters"
      @remove-chip="removeChip"
      @clear-filters="resetFilters"
      @apply-view="applySavedView"
      @refresh="getClaims(true)"
    >
      <!-- faz3-fe-help: ilk kullanım — hiç kayıt yokken "Nasıl başlanır?" (filtreli boş sonuçta gösterilmez). -->
      <template #empty-action><HelpStartLink article="ord-returns" /></template>
      <template #filters>
        <EkSelect kind="channel" v-model="searchClaimForm.data.integrationCodes" :items="channelOptionsFrom(integrationStore.getClientPlatforms())" label="Kanal" multiple clearable />
        <EkSelect v-model="searchClaimForm.data.internalStatuses" kind="status" :items="toneOptionsFrom(statusOptions, (id) => CLAIM_STATUS_TONE[id as ClaimInternalStatusEnum]?.tone)" item-title="title"
          item-value="id" label="Talep durumu" multiple clearable />
      </template>

      <template #bulk-actions>
        <EkButton size="sm" icon="mdi-check-all" :disabled="bulkActionCounts.APPROVE === 0" @click="triggerBulkAction('APPROVE')">
          Toplu onayla ({{ bulkActionCounts.APPROVE }})
        </EkButton>
      </template>

      <template #cell-externalOrderId="{ row }"><span class="ek-num">{{ row.externalOrderId || '—' }}</span></template>
      <template #cell-integrationCode="{ row }"><EkChannelDot :code="row.integrationCode" /></template>
      <template #cell-items="{ row }">
        <span class="ek-claim-items">
          <span class="ek-num">{{ row.items?.length || 0 }} kalem</span>
          <span v-if="row.items?.length" class="ek-claim-items__name">{{ row.items[0].productName }}</span>
        </span>
      </template>
      <template #cell-totalRefundAmount="{ row }">
        <span class="ek-num">{{ formatMoney(row.totalRefundAmount, row.currencyCode) }}</span>
      </template>
      <template #cell-internalStatus="{ row }">
        <EkStatusChip :tone="statusEntry(row.internalStatus).tone" :label="$t(statusEntry(row.internalStatus).labelKey)" />
      </template>
      <template #cell-claimedAt="{ row }"><span class="ek-num">{{ formatDateTime(row.claimedAt) }}</span></template>
      <template #cell-actions="{ row }">
        <EkRowActions :label="`${row.externalClaimId} işlemleri`" :items="[
          { key: 'view', action: 'view', label: 'Talep detayını görüntüle', onClick: () => openDetailedReport(row) },
          { key: 'approve', action: 'approve', icon: 'mdi-package-variant-closed-check', label: 'Talebi onayla', group: 'Karar', disabled: !isClaimActionAllowed(row, 'APPROVE'), onClick: () => triggerSingleApprove(row) },
          { key: 'reject', action: 'reject', icon: 'mdi-package-variant-remove', label: 'Talebi reddet', group: 'Karar', disabled: !isClaimActionAllowed(row, 'REJECT'), onClick: () => openRejectAction(row) },
        ]" />
      </template>
    </EkListScreen>
  </div>
</template>

<script setup lang="ts">
import HelpStartLink from '@/components/help/HelpStartLink.vue'
import EkHelpHint from '@/components/ds/EkHelpHint.vue'
import EkSelect from '@/components/ds/EkSelect.vue'
import { channelOptionsFrom, toneOptionsFrom } from '@/components/ds/selectOptions'
import { problemFromError, type ProblemCopy } from '@/composables/useProblem'
import EkRowActions from '@/components/ds/EkRowActions.vue'
import { ref, computed, reactive } from 'vue'

// Composables & Stores
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useClaimFilters } from '@/components/claim/composables/useClaimFilters'
import { useClaimActions } from '@/components/claim/composables/useClaimActions'
import { useLifecycle } from '@/composables/useLifecycle'
import { formatMoney, formatDateTime } from '@/composables/format'
import { CLAIM_STATUS_TONE } from '@/design/status-map'

// Enums & Types
import { ClaimInternalStatusEnum } from '@/types/ClaimTypes'

// Components
import LoadingComponent from '@/components/LoadingComponent.vue'
import ClaimDetailComponent from '@/components/claim/ClaimDetailComponent.vue'
import EkListScreen from '@/components/ds/templates/EkListScreen.vue'
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue'
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue'
import type { EkSavedViewsConfig } from '@/components/ds/EkSavedViews.vue'
import EkButton from '@/components/ds/EkButton.vue'
import EkChannelDot from '@/components/ds/EkChannelDot.vue'
import { isRequestError } from '@/components/ds/listStandard'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkConfirmDialog from '@/components/ds/EkConfirmDialog.vue'
import EkFormDialog from '@/components/ds/EkFormDialog.vue'

const emits = defineEmits(['clear'])
// --- INITIALIZATION ---
const restApi = useRestApi()
const snackbarStore = useSnackbarStore()
const integrationStore = useIntegrationStore()

const loadingComponentRef = ref<any>(null)
const dialogAttach = ref(".claimListView")
const loading = ref(false)
const loadError = ref(false)
/** Aşama 6b (Standart 1): hata desenindeki neden + teknik ayrıntı. */
const loadProblem = ref<ProblemCopy | null>(null)
const claims = ref<any[]>([])
const selectedClaims = ref<Array<string | number>>([])
const isDetailOpen = ref(false)
const selectedClaimForDetail = ref<any>(null)

// Merkezi Onay Diyaloğu State
const confirmDialog = reactive({
  show: false, title: '', subtitle: '', message: '', icon: '', color: 'error', confirmIcon: '',
  confirmText: '', onConfirm: () => { }, onCancel: () => { }
});

// DS-v2 liste standardı. Sıralanabilir kolonlar ClaimService.getClaims `sort.field`
// izin listesindeki alanlardır (SUNUCU tarafı sıralama).
const columns: EkGridColumn[] = [
  { key: 'externalClaimId', label: 'Talep no', type: 'id', sortable: true },
  { key: 'externalOrderId', label: 'Sipariş no', sortable: true },
  { key: 'integrationCode', label: 'Kanal', sortable: true },
  { key: 'items', label: 'İçerik' },
  { key: 'type', label: 'Tür', type: 'muted', sortable: true },
  { key: 'claimedAt', label: 'Tarih', sortable: true },
  { key: 'totalRefundAmount', label: 'İade tutarı', type: 'num', sortable: true },
  { key: 'internalStatus', label: 'Durum', sortable: true },
  { key: 'actions', label: 'İşlemler', align: 'end', hideLabel: true, pin: 'end' },
]

const gridSort = computed<EkGridSort>(() => {
  const current = sortBy.value[0]
  return current?.key ? { key: current.key, dir: current.order === 'asc' ? 'asc' : 'desc' } : null
})

function onGridSort(sort: EkGridSort) {
  sortBy.value = sort ? [{ key: sort.key, order: sort.dir }] : [{ key: 'claimedAt', order: 'desc' }]
  getClaims(true)
}

// Aktif filtre çipleri — SON SORGULANAN değerlerden.
const applied = ref({ globalSearch: '', integrationCodes: [] as string[], internalStatuses: [] as string[] })

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const chips: EkActiveFilterChip[] = []
  if (applied.value.globalSearch) chips.push({ key: 'globalSearch', label: 'Arama', value: applied.value.globalSearch })
  if (applied.value.integrationCodes.length) chips.push({ key: 'integrationCodes', label: 'Kanal', value: applied.value.integrationCodes.map(platformName).join(', ') })
  if (applied.value.internalStatuses.length) {
    const titleOf = (id: string) => statusOptions.value.find((o: any) => o.id === id)?.title ?? id
    chips.push({ key: 'internalStatuses', label: 'Durum', value: applied.value.internalStatuses.map(titleOf).join(', ') })
  }
  return chips
})

const panelFilterCount = computed(() => (applied.value.integrationCodes.length ? 1 : 0) + (applied.value.internalStatuses.length ? 1 : 0))

// C2.4 kayıtlı görünümler: görünüme YALNIZ screens.ts `urlParams` alanı (talep durumu) girer.
const savedViews = computed<EkSavedViewsConfig>(() => ({
  screenKey: 'ClaimListView',
  params: applied.value,
  fields: [{ name: 'internalStatuses', label: 'Durum', format: (id) => statusOptions.value.find((o: any) => o.id === id)?.title ?? id }],
}))

/** Görünüm = filtrelerin TAMAMI: görünümde olmayan alanlar (arama, kanal) temizlenir. */
function applySavedView(params: Record<string, any>) {
  const data = searchClaimForm.value.data
  data.globalSearch = ''
  data.integrationCodes = []
  data.internalStatuses = Array.isArray(params.internalStatuses) ? [...params.internalStatuses] : []
  getClaims(true)
}

function removeChip(key: string) {
  const data = searchClaimForm.value.data
  if (key === 'globalSearch') data.globalSearch = ''
  if (key === 'integrationCodes') data.integrationCodes = []
  if (key === 'internalStatuses') data.internalStatuses = []
  getClaims(true)
}

function statusEntry(status: ClaimInternalStatusEnum) {
  return CLAIM_STATUS_TONE[status] ?? { tone: 'neutral' as const, labelKey: 'status.claim.waiting' }
}

function platformName(code: string): string {
  if (code === 'n11') return 'N11'
  return code ? code.charAt(0).toUpperCase() + code.slice(1) : 'Bilinmeyen'
}

// --- API & FILTERS ---
const getClaimsInternal = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
  const d = searchClaimForm.value.data;
  applied.value = { globalSearch: d.globalSearch || '', integrationCodes: [...(d.integrationCodes || [])], internalStatuses: [...(d.internalStatuses || [])] };

  try {
    const res = await restApi.post('ClaimService/getClaims', {
      searchClaimForm: prepareFilterPayload()
    });
    if (isRequestError(res)) {
      loadError.value = true;
      loadProblem.value = problemFromError(res, 'ClaimService/getClaims');
    } else if (res?.claims) {
      claims.value = res.claims;
      pagination.totalNumberOfRecords = res.totalNumberOfRecords || 0;
      pagination.totalNumberOfPages = Math.ceil(pagination.totalNumberOfRecords / pagination.limit) || 1;
    }
  } catch (e) {
    loadError.value = true;
    loadProblem.value = problemFromError(e, 'ClaimService/getClaims');
  } finally {
    loading.value = false;
  }
};

const {
  searchClaimForm, pagination, sortBy, statusOptions,
  resetFilters,
  handlePageChange, prepareFilterPayload
} = useClaimFilters(getClaimsInternal);

const executeClaimAction = async (endpoint: string, payload: any) => await restApi.post(endpoint, payload);

const {
  actionDialog, openRejectAction, handleRejectConfirm, processBulkApprove, handleApproveRequest
} = useClaimActions(executeClaimAction, snackbarStore, getClaimsInternal);

const { isClaimActionAllowed } = useLifecycle();

// --- METHODS ---
async function getClaims(resetPage: boolean = false) { await getClaimsInternal(resetPage); }

function onSearchInput(value: string) {
  searchClaimForm.value.data.globalSearch = value;
  getClaims(true);
}

function onPageChange(newPage: number) {
  pagination.page = newPage;
  handlePageChange();
}

function onPageSizeChange(size: number) {
  pagination.limit = size;
  onPageChange(1);
}

const openDetailedReport = (item: any) => { selectedClaimForDetail.value = item; isDetailOpen.value = true; };
const triggerSingleApprove = (item: any) => handleApproveRequest(item, confirmDialog);


const bulkActionCounts = computed(() => {
  const selectedObjects = claims.value.filter(c => selectedClaims.value.includes(c._id));
  const approveValid = [
    ClaimInternalStatusEnum.UNDER_REVIEW,
    ClaimInternalStatusEnum.DISPUTED
  ];
  return {
    APPROVE: selectedObjects.filter(o => approveValid.includes(o.internalStatus)).length
  };
});

const triggerBulkAction = (action: string) => {
  const targetIds = claims.value.filter(c => selectedClaims.value.includes(c._id)).map(o => o._id);
  confirmDialog.title = `${targetIds.length} adet iade talebi onaylansın mı?`;
  confirmDialog.message = 'Seçili tüm talepler onaylanacak ve pazaryerine bildirilecektir.';
  confirmDialog.color = 'success';
  confirmDialog.confirmText = 'Onayla';
  confirmDialog.onConfirm = () => { confirmDialog.show = false; processBulkApprove(targetIds); };
  confirmDialog.show = true;
};

// onMounted YOK (initialize/activate ile çağrılıyor — parent şell tab yaşam döngüsü, davranış korunur).

const initialize = async (parameters: any) => {
  if (parameters?.internalStatuses) {
    searchClaimForm.value.data.internalStatuses = parameters.internalStatuses;
  }
  await getClaims(true);
  emits('clear')

};

const activate = async (parameters: any) => {
  if (parameters?.internalStatuses) {
    searchClaimForm.value.data.internalStatuses = parameters.internalStatuses;
    await getClaims(true);
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
.claimListView {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

@media (max-width: 767px) {
  .claimListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
}

.ek-claim-items {
  display: inline-flex;
  flex-direction: column;
  max-width: 240px;
}

.ek-claim-items__name {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-row-actions {
  display: inline-flex;
  gap: var(--ek-space-1);
}
</style>
