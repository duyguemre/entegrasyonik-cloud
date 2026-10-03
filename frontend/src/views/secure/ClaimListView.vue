<template>
  <div class="claimListView d-flex flex-column pt-4">
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
        label="Red gerekçesi" return-object prepend-inner-icon="mdi-comment-question-outline" />
    </EkFormDialog>

    <EkFormDialog v-model="searchClaimForm.form.menu" title="Talep filtreleri" @submit="() => { getClaims(true); searchClaimForm.form.menu = false }" @cancel="resetFilters()">
      <v-select v-model="searchClaimForm.data.integrationCodes" :items="integrationStore.getClientPlatforms()"
        item-title="title" item-value="code" label="Platformlar" multiple chips />
      <v-select v-model="searchClaimForm.data.internalStatuses" :items="statusOptions" item-title="title"
        item-value="id" label="Talep durumu" multiple chips />
    </EkFormDialog>

    <EkListPage
      section="Siparişler"
      title="İade talepleri"
      description="Pazaryerlerinden gelen iade/talep süreçlerini buradan yönetin."
      :secondary-actions="[{ label: 'Filtrele', icon: 'mdi-filter-variant', onClick: () => (searchClaimForm.form.menu = true) }]"
      :search="searchClaimForm.data.globalSearch"
      search-placeholder="İade No, Sipariş No veya Takip Ara"
      :state="viewState"
      @update:search="onSearchInput"
      @clear-filters="resetFilters"
      @refresh="() => getClaims(true)"
    >
      <template #filters-extra>
        <v-select v-model="mobileSortValue" :items="mobileSortOptions" item-title="title" item-value="value"
          label="Sıralama" density="compact" hide-details class="ek-claim-sort-select" @update:model-value="onMobileSortChange" />
      </template>
      <template #empty>
        <EkEmptyState variant="no-results" title="Talep Bulunamadı" message="Arama kriterlerinize uygun herhangi bir iade talebi bulunamadı." />
      </template>
      <template #error>
        <EkErrorState message="İade talepleri yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="() => getClaims(true)" />
      </template>

      <div class="ek-claim-table-wrapper">
        <EkDataTable v-if="$vuetify.display.mdAndUp" :items="claims" :columns="columns" row-key="_id" aria-label="İade talepleri tablosu">
          <template #cell-select="{ item }">
            <v-checkbox-btn :model-value="isClaimSelected(item)" color="primary" density="compact"
              :aria-label="`Talebi seç: ${item.externalClaimId}`"
              @update:model-value="val => onClaimSelectionUpdate(item, !!val)" />
          </template>

          <template #cell-externalClaimId="{ item }">
            <div class="d-flex align-center">
              <EkPlatformMark :name="platformName(item.integrationCode)" :code="item.integrationCode" class="mr-3" />
              <div class="d-flex flex-column">
                <span class="font-weight-medium text-body-2">{{ item.externalClaimId }}</span>
                <span class="text-caption ek-muted">Sipariş: {{ item.externalOrderId }}</span>
              </div>
            </div>
          </template>

          <template #cell-items="{ item }">
            <div class="d-flex flex-column ek-gap-1">
              <EkStatusChip tone="neutral" :label="`${item.items?.length || 0} kalem ürün`" />
              <span class="text-caption ek-muted text-truncate ek-claim-item-name">{{ item.items?.[0]?.productName }}</span>
            </div>
          </template>

          <template #cell-totalRefundAmount="{ item }">
            <div class="d-flex flex-column align-end">
              <span class="font-weight-semibold ek-num">{{ formatMoney(item.totalRefundAmount, item.currencyCode) }}</span>
              <span class="text-caption ek-muted text-uppercase">{{ item.type }}</span>
            </div>
          </template>

          <template #cell-internalStatus="{ item }">
            <EkStatusChip :tone="statusEntry(item.internalStatus).tone" :label="$t(statusEntry(item.internalStatus).labelKey)" />
          </template>

          <template #cell-claimedAt="{ item }">
            <span class="text-caption font-weight-medium ek-num">{{ formatDateTime(item.claimedAt) }}</span>
          </template>

          <template #cell-actions="{ item }">
            <div class="d-flex justify-end ek-gap-1">
              <v-btn icon variant="text" density="comfortable" aria-label="Talep detayını görüntüle" @click="openDetailedReport(item)">
                <v-icon>mdi-eye</v-icon>
              </v-btn>
              <v-btn icon variant="text" density="comfortable" :disabled="!isClaimActionAllowed(item, 'APPROVE')" aria-label="Talebi onayla" @click="triggerSingleApprove(item)">
                <v-icon>mdi-package-variant-closed-check</v-icon>
              </v-btn>
              <v-btn icon variant="text" density="comfortable" :disabled="!isClaimActionAllowed(item, 'REJECT')" aria-label="Talebi reddet" @click="openRejectAction(item)">
                <v-icon>mdi-package-variant-remove</v-icon>
              </v-btn>
            </div>
          </template>
        </EkDataTable>

        <div v-else class="mobile-claims-list d-flex flex-column h-100">
          <div class="pa-2 overflow-y-auto flex-grow-1 d-flex flex-column mobile-claims-scroll">
            <EkEmptyState v-if="!claims?.length" variant="no-results" title="Talep Bulunamadı" message="Arama kriterlerinize uygun herhangi bir iade talebi bulunamadı." />
            <v-card v-for="item in claims" :key="item._id" class="mobile-claim-card mb-3" variant="flat" border rounded="lg" @click="openDetailedReport(item)">
              <div class="d-flex align-center justify-space-between pa-3 border-bottom-dashed">
                <div class="d-flex align-center">
                  <v-checkbox-btn :model-value="isClaimSelected(item)" color="primary" density="compact" class="mr-1"
                    :aria-label="`Talebi seç: ${item.externalClaimId}`" @click.stop
                    @update:model-value="val => onClaimSelectionUpdate(item, !!val)" />
                  <EkPlatformMark :name="platformName(item.integrationCode)" :code="item.integrationCode" size="sm" :show-name="false" />
                </div>
                <EkStatusChip :tone="statusEntry(item.internalStatus).tone" :label="$t(statusEntry(item.internalStatus).labelKey)" />
              </div>

              <div class="pa-3">
                <div class="d-flex justify-space-between mb-3">
                  <div class="d-flex flex-column">
                    <span class="text-caption font-weight-medium">{{ item.externalClaimId }}</span>
                    <span class="text-caption ek-muted">Sipariş: {{ item.externalOrderId }}</span>
                  </div>
                  <div class="d-flex flex-column align-end">
                    <span class="text-body-2 font-weight-semibold ek-num">{{ formatMoney(item.totalRefundAmount, item.currencyCode) }}</span>
                    <span class="text-caption ek-muted text-uppercase">{{ item.type }}</span>
                  </div>
                </div>

                <div class="pa-2 border-subtle rounded mb-3">
                  <span class="text-caption font-weight-medium d-block text-truncate">{{ item.items?.[0]?.productName || 'Ürün bilgisi yok' }}</span>
                  <span class="text-caption ek-muted d-block">{{ item.items?.length || 0 }} kalem ürün</span>
                </div>

                <div class="d-flex align-center justify-space-between mt-2">
                  <span class="text-caption ek-muted"><v-icon size="12" class="mr-1">mdi-clock-outline</v-icon>{{ formatDateTime(item.claimedAt) }}</span>
                  <div class="d-flex ek-gap-1">
                    <v-btn icon variant="text" density="comfortable" aria-label="Talep detayını görüntüle" @click.stop="openDetailedReport(item)"><v-icon>mdi-eye</v-icon></v-btn>
                    <v-btn icon variant="text" density="comfortable" :disabled="!isClaimActionAllowed(item, 'APPROVE')" aria-label="Talebi onayla" @click.stop="triggerSingleApprove(item)"><v-icon>mdi-check</v-icon></v-btn>
                    <v-btn icon variant="text" density="comfortable" :disabled="!isClaimActionAllowed(item, 'REJECT')" aria-label="Talebi reddet" @click.stop="openRejectAction(item)"><v-icon>mdi-close</v-icon></v-btn>
                  </div>
                </div>
              </div>
            </v-card>
          </div>
        </div>
      </div>

      <template #pagination>
        <EkPagination :page="pagination.page" :page-size="pagination.limit" :total="pagination.totalNumberOfRecords"
          @update:page="onPageChange" @update:pageSize="onPageSizeChange" />
      </template>
    </EkListPage>

    <BatchProcessMenu :model-value="selectedClaims" title="İade Talebi Seçildi" :actions="[
      { id: 'APPROVE', label: 'Toplu Onayla', icon: 'mdi-check-all', color: 'success', badgeCount: bulkActionCounts.APPROVE, disabled: bulkActionCounts.APPROVE === 0 }
    ]" @action="id => triggerBulkAction(id)" @clear="selectedClaims = []" />
  </div>
</template>

<script setup lang="ts">
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
import BatchProcessMenu from '@/components/layout/BatchProcessMenu.vue'
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
// --- INITIALIZATION ---
const restApi = useRestApi()
const snackbarStore = useSnackbarStore()
const integrationStore = useIntegrationStore()

const loadingComponentRef = ref<any>(null)
const dialogAttach = ref(".claimListView")
const loading = ref(false)
const loadError = ref(false)
const claims = ref<any[]>([])
const selectedClaims = ref<string[]>([])
const isDetailOpen = ref(false)
const selectedClaimForDetail = ref<any>(null)

// Merkezi Onay Diyaloğu State
const confirmDialog = reactive({
  show: false, title: '', subtitle: '', message: '', icon: '', color: 'error', confirmIcon: '',
  confirmText: '', onConfirm: () => { }, onCancel: () => { }
});

const columns: EkTableColumn[] = [
  { key: 'select', label: '' },
  { key: 'externalClaimId', label: 'TALEP NO & PAZAR YERİ' },
  { key: 'items', label: 'TALEP İÇERİĞİ' },
  { key: 'totalRefundAmount', label: 'İADE TUTARI', align: 'end' },
  { key: 'internalStatus', label: 'TALEP DURUMU' },
  { key: 'claimedAt', label: 'TALEP TARİHİ', align: 'end' },
  { key: 'actions', label: '', type: 'actions', align: 'end' },
]

// --- MOBİL SIRALAMA LOGIC ---
const mobileSortValue = ref('claimedAt_desc');
const mobileSortOptions = [
  { title: 'Tarih: En Yeni', value: 'claimedAt_desc' },
  { title: 'Tarih: En Eski', value: 'claimedAt_asc' },
  { title: 'Tutar: En Yüksek', value: 'totalRefundAmount_desc' },
  { title: 'Tutar: En Düşük', value: 'totalRefundAmount_asc' }
];

const onMobileSortChange = (val: string) => {
  const [key, order] = val.split('_');
  sortBy.value = [{ key, order: order as any }];
  getClaims(true);
};

function statusEntry(status: ClaimInternalStatusEnum) {
  return CLAIM_STATUS_TONE[status] ?? { tone: 'neutral' as const, labelKey: 'status.claim.waiting' }
}

function platformName(code: string): string {
  return code ? code.charAt(0).toUpperCase() + code.slice(1) : 'Bilinmeyen'
}

const viewState = computed(() => {
  if (loading.value) return 'loading'
  if (loadError.value) return 'error'
  if (!claims.value.length) return 'empty'
  return 'ready'
})

// --- API & FILTERS ---
const getClaimsInternal = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
  const guid = loadingComponentRef.value?.info("") || "loading";

  try {
    const res = await restApi.post('ClaimService/getClaims', {
      searchClaimForm: prepareFilterPayload()
    });
    if (res.claims) {
      claims.value = res.claims;
      pagination.totalNumberOfRecords = res.totalNumberOfRecords || 0;
      pagination.totalNumberOfPages = Math.ceil(pagination.totalNumberOfRecords / pagination.limit) || 1;
    }
  } catch (e) {
    loadError.value = true;
  } finally {
    loadingComponentRef.value?.remove(guid);
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

const onClaimSelectionUpdate = (item: any, isSelected: boolean) => {
  if (isSelected) selectedClaims.value.push(item._id);
  else selectedClaims.value = selectedClaims.value.filter(id => id !== item._id);
};

const isClaimSelected = (item: any) => selectedClaims.value.includes(item._id);

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

.ek-claim-table-wrapper {
  width: 100%;
}

.ek-claim-item-name {
  max-width: 200px;
}

.ek-claim-sort-select {
  max-width: 220px;
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-gap-1 {
  gap: var(--ek-space-1);
}

.mobile-claims-scroll {
  padding-bottom: var(--ek-space-8);
}

.border-bottom-dashed {
  border-bottom: 1px dashed var(--ek-color-border-default);
}

.border-subtle {
  border: 1px solid var(--ek-color-border-default);
}
</style>
