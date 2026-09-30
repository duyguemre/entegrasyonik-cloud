<!--
  frontend/src/views/secure/FinancialListView.vue

  DS-v2 Aşama 2 — liste standardı (EkListScreen). API sözleşmesi DEĞİŞMEDİ:
  `FinancialService/getTransactionData` gövdesi (searchForm + page/limit/sortBy), özet (`res.summary`),
  detay diyaloğu (satır nesnesini doğrudan kullanır) AYNEN korundu. Sıralama SUNUCUDA (externalId,
  netAmount, transactionDate). Tarih filtreleri EkDateField (Date modeli — eski v-date-picker ile aynı).
  Arama Enter ile sorgular. Özet şeridi tablonun üstünde kalır.

  C1.4 — sayfa başlığı (EkPageHeader) + sekmeler (EkPageTabs): İşlemler (yukarıdaki içerik, DEĞİŞMEDİ) ·
  Özet · Kargo faturaları · Ödeme dökümü (components/financial/*Tab.vue, her biri kendi EkListFrame'inde).
  Sekme URL'de `?tab=` (screens.ts `urlParams`); ekran `parameters.tab`'ı okur (ilk açılış + activate).
  İşlemler içeriği `v-show` ile korunur (filtre/sayfa durumu sekme değişiminde kaybolmaz) ve ilk kez
  görünür olduğunda yüklenir; diğer sekmeler KeepAlive ile önbelleğe alınır, yalnız aktifken DOM'dadır.
-->
<template>
  <div class="financialListView">
    <div class="ek-fin-head">
      <EkPageHeader section="Finans ve raporlar" :title="t('finance.title')" :description="t('finance.description')" />
      <EkPageTabs v-model="activeTab" :tabs="tabs" :label="t('finance.tabs.label')" />
    </div>

    <!-- İşlem Detay Diyaloğu -->
    <ActionDialogComponent v-model="isDetailOpen" title="Finansal işlem detayı" attach=".financialListView"
      subtitle="Pazaryeri mutabakat ve hakediş ayrıntıları" icon="mdi-shield-check-outline" color="primary"
      maxWidth="850px" confirmText="Kapat" @confirm="isDetailOpen = false" hide-cancel>

      <div v-if="selectedTransaction" class="ek-fin-detail">
        <!-- Üst Bilgi: Platform & Ana Bilgiler -->
        <div class="ek-fin-detail__head d-flex align-center justify-space-between">
          <div class="d-flex align-center ek-gap-4">
            <div class="ek-fin-detail__logo">
              <PlatformImageComponent :integrationCode="selectedTransaction.integrationCode" :width="100"
                :height="45" />
            </div>
            <div class="d-flex flex-column">
              <span class="ek-fin-label">İŞLEM REFERANSI</span>
              <span class="ek-fin-detail__ref ek-num">{{ selectedTransaction.externalId }}</span>
            </div>
          </div>
          <v-tooltip :text="selectedTransaction.platformType" location="top">
            <template v-slot:activator="{ props }">
              <span v-bind="props" tabindex="0">
                <EkStatusChip :tone="typeTone(selectedTransaction.transactionType)"
                  :label="translateTransactionType(selectedTransaction.transactionType)" />
              </span>
            </template>
          </v-tooltip>
        </div>

        <div class="ek-fin-detail__body">
          <v-row>
            <!-- Sol Kolon: İşlem Özeti -->
            <v-col cols="12" md="7">
              <div class="ek-fin-panel h-100">
                <div class="ek-fin-panel__title">
                  <v-icon size="18" class="mr-2" aria-hidden="true">mdi-text-box-search-outline</v-icon>
                  <span>İŞLEM ÖZETİ</span>
                </div>

                <div class="ek-fin-info-grid">
                  <div class="ek-fin-info-item">
                    <span class="ek-fin-label">SİPARİŞ NUMARASI</span>
                    <span class="ek-fin-info-value ek-num">{{ selectedTransaction.orderNumber || 'MANUEL İŞLEM' }}</span>
                  </div>
                  <div class="ek-fin-info-item">
                    <span class="ek-fin-label">İŞLEM TARİHİ</span>
                    <span class="ek-fin-info-value ek-num">{{ formatDate(selectedTransaction.transactionDate) }}</span>
                  </div>
                  <div v-if="selectedTransaction.payoutDate" class="ek-fin-info-item">
                    <span class="ek-fin-label">VADE (ÖDEME) TARİHİ</span>
                    <span class="ek-fin-info-value ek-num">
                      <v-icon size="14" class="mr-1" aria-hidden="true">mdi-calendar-clock</v-icon>{{
                        formatDate(selectedTransaction.payoutDate) }}
                    </span>
                  </div>
                  <div class="ek-fin-info-item">
                    <span class="ek-fin-label">KOMİSYON ORANI</span>
                    <span class="ek-fin-info-value ek-num">{{ selectedTransaction.commissionRate ? '%' +
                      selectedTransaction.commissionRate : '-' }}</span>
                  </div>
                </div>

                <v-divider class="my-4"></v-divider>

                <div>
                  <span class="ek-fin-label d-block mb-2">AÇIKLAMA / NOTLAR</span>
                  <div class="ek-fin-note">
                    "{{ selectedTransaction.description || 'Bu işlem için ek açıklama bulunmuyor.' }}"
                  </div>
                </div>
              </div>
            </v-col>

            <!-- Sağ Kolon: Finansal Akış -->
            <v-col cols="12" md="5">
              <div class="ek-fin-panel ek-fin-flow h-100 d-flex flex-column">
                <div class="ek-fin-panel__title">
                  <v-icon size="18" class="mr-2" aria-hidden="true">mdi-finance</v-icon>
                  <span>FİNANSAL AKIŞ</span>
                </div>

                <div class="ek-fin-flow__row">
                  <div class="d-flex flex-column">
                    <span class="ek-fin-label">BRÜT TUTAR</span>
                    <span class="ek-fin-flow__amount ek-num">{{ formatCurrency(selectedTransaction.credit) }}
                      ₺</span>
                  </div>
                  <v-icon color="success" size="22" aria-hidden="true">mdi-plus-circle-outline</v-icon>
                </div>

                <div v-if="selectedTransaction.commissionAmount" class="ek-fin-flow__row ek-fin-flow__row--nested">
                  <div class="d-flex flex-column">
                    <span class="ek-fin-label">PAZARYERİ KOMİSYONU</span>
                    <span class="ek-fin-flow__amount ek-fin-negative ek-num">-{{
                      formatCurrency(selectedTransaction.commissionAmount) }} ₺</span>
                  </div>
                  <span class="ek-fin-label">{{ selectedTransaction.commissionRate ? '%' +
                    selectedTransaction.commissionRate : '' }}</span>
                </div>

                <div class="ek-fin-flow__row">
                  <div class="d-flex flex-column">
                    <span class="ek-fin-label">DİĞER KESİNTİLER / BORÇ</span>
                    <span class="ek-fin-flow__amount ek-fin-negative ek-num">{{
                      formatCurrency(selectedTransaction.debt - (selectedTransaction.commissionAmount || 0)) }} ₺</span>
                  </div>
                  <v-icon color="error" size="22" aria-hidden="true">mdi-minus-circle-outline</v-icon>
                </div>

                <v-divider class="my-3"></v-divider>

                <div class="mt-auto">
                  <div class="d-flex justify-space-between align-center">
                    <span class="ek-fin-label">NET HAKEDİŞ</span>
                    <v-tooltip text="KDV ve tüm kesintiler sonrası net tutar" location="top">
                      <template v-slot:activator="{ props }">
                        <v-icon v-bind="props" size="16" tabindex="0" aria-label="Net hakediş bilgisi">mdi-information-outline</v-icon>
                      </template>
                    </v-tooltip>
                  </div>
                  <span class="ek-fin-flow__net ek-num">{{ formatCurrency(selectedTransaction.netAmount) }}
                    ₺</span>
                </div>
              </div>
            </v-col>
          </v-row>

          <!-- Alt Kısım: Teknik Detaylar / Meta -->
          <div class="mt-4">
            <div v-if="getVatFromMeta" class="ek-fin-vat">
              <div class="d-flex align-center">
                <v-icon color="error" class="mr-2" aria-hidden="true">mdi-calculator-variant-outline</v-icon>
                <span class="ek-fin-label">KDV Kesintisi (Meta)</span>
              </div>
              <span class="ek-fin-negative ek-num">-{{ formatCurrency(getVatFromMeta) }} ₺</span>
            </div>

            <v-expansion-panels flat variant="inset">
              <v-expansion-panel>
                <v-expansion-panel-title class="ek-fin-label">
                  <v-icon size="16" class="mr-2" aria-hidden="true">mdi-xml</v-icon> PAZARYERİ HAM VERİSİ (JSON)
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="ek-fin-json">
                    <pre>{{ JSON.stringify(selectedTransaction.meta || {}, null, 2) }}</pre>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
        </div>
      </div>
    </ActionDialogComponent>

    <div v-show="activeTab === 'transactions'" class="ek-fin-panel-slot ek-fin-transactions">
    <FinancialSummaryBar class="ek-fin-summary-slot" :summary="summary" :loading="summary.loading"
      :compact="!$vuetify.display.mdAndUp" :format-currency="formatCurrency" />

    <EkListScreen channel-key="integrationCode"
      class="ek-fin-screen"
      label="Finansal işlemler tablosu"
      noun="işlem"
      row-key="_id"
      label-key="externalId"
      :columns="columns"
      :rows="transactions"
      :loading="loading"
      :error="loadError"
      error-title="Finansal işlemler yüklenemedi"
      :search="searchForm.externalIdSearch"
      search-placeholder="İşlem No Ara (External ID)"
      :chips="activeChips"
      :filter-count="panelFilterCount"
      :sort="gridSort"
      :page="pagination.page"
      :page-size="pagination.limit"
      :total="pagination.totalNumberOfRecords"
      empty-title="Finansal kayıt bulunamadı"
      empty-text="Arama kriterlerinize uygun herhangi bir finansal işlem kaydı bulunamadı."
      empty-icon="mdi-cash-multiple"
      filtered-empty-title="Finansal kayıt bulunamadı"
      filtered-empty-text="Arama kriterlerinize uygun herhangi bir finansal işlem kaydı bulunamadı."
      @update:search="(v: string) => (searchForm.externalIdSearch = v)"
      @search-submit="getFinancials(true)"
      @update:sort="onGridSort"
      @update:page="handlePageChange"
      @update:page-size="onPageSizeChange"
      @filter-submit="getFinancials(true)"
      @filter-reset="resetFilters"
      @remove-chip="removeChip"
      @clear-filters="clearAll"
      @refresh="getFinancials(true)"
    >
      <template #filters>
        <EkSelect kind="channel" v-model="searchForm.integrationCodes" :items="channelOptionsFrom(integrationStore.getClientPlatforms())" label="Platformlar" multiple clearable />
        <EkSelect v-model="searchForm.transactionTypes" :items="transactionTypeOptions" label="İşlem Tipi"
          multiple clearable />
        <EkDateField v-model="searchForm.startDate" label="Başlangıç" :max="searchForm.endDate" />
        <EkDateField v-model="searchForm.endDate" label="Bitiş" :min="searchForm.startDate" />
      </template>

      <template #cell-externalId="{ row }">
        <span class="ek-fin-id">
          <span class="ek-num">{{ row.externalId }}</span>
          <span class="ek-fin-id__sub">Sipariş: {{ row.orderNumber || 'Manuel' }}</span>
        </span>
      </template>
      <template #cell-channel="{ row }"><EkChannelDot :code="row.integrationCode" /></template>
      <template #cell-transactionType="{ row }">
        <v-tooltip :text="row.platformType" location="top">
          <template v-slot:activator="{ props }">
            <span v-bind="props" tabindex="0">
              <EkStatusChip :tone="typeTone(row.transactionType)" :label="translateTransactionType(row.transactionType)" />
            </span>
          </template>
        </v-tooltip>
      </template>
      <template #cell-amount="{ row }">
        <span class="ek-fin-amount ek-num">
          <span :class="row.credit > 0 ? 'ek-fin-positive' : 'ek-muted'">
            {{ row.credit > 0 ? '+' : '' }}{{ formatCurrency(row.credit) }}
          </span>
          <span :class="row.debt > 0 ? 'ek-fin-negative' : 'ek-muted'">
            {{ row.debt > 0 ? '-' : '' }}{{ formatCurrency(row.debt) }}
          </span>
        </span>
      </template>
      <template #cell-netAmount="{ row }"><span class="ek-fin-net ek-num">{{ formatCurrency(row.netAmount) }}</span></template>
      <template #cell-transactionDate="{ row }">
        <span class="ek-fin-id">
          <span class="ek-num">{{ formatDate(row.transactionDate) }}</span>
          <span v-if="row.payoutDate" class="ek-fin-id__sub ek-num">Vade: {{ formatDate(row.payoutDate) }}</span>
        </span>
      </template>
      <template #cell-actions="{ row }">
        <EkRowActions label="İşlem eylemleri" :items="[{ key: 'view', action: 'view', label: 'Detayı görüntüle', onClick: () => openDetail(row) }]" />
      </template>
    </EkListScreen>
    </div>

    <div v-if="activeTab !== 'transactions'" class="ek-fin-panel-slot" :class="{ 'ek-fin-panel-slot--flow': activeTab === 'summary' }">
      <KeepAlive>
        <FinancialSummaryTab v-if="activeTab === 'summary'" />
        <FinancialCargoInvoicesTab v-else-if="activeTab === 'cargo-invoices'" />
        <FinancialPayoutsTab v-else-if="activeTab === 'payouts'" />
      </KeepAlive>
    </div>
  </div>
</template>

<script setup lang="ts">
import EkSelect from '@/components/ds/EkSelect.vue'
import { channelOptionsFrom } from '@/components/ds/selectOptions'
import EkRowActions from '@/components/ds/EkRowActions.vue'
import { ref, reactive, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useIntegrationStore } from '@/stores/integrationStore';
import useRestApi from '@/composables/restapi';

// Components
import PlatformImageComponent from '@/components/platforms/PlatformImageComponent.vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import EkListScreen from '@/components/ds/templates/EkListScreen.vue';
import type { EkGridColumn, EkGridSort } from '@/components/ds/EkDataGrid.vue';
import type { EkActiveFilterChip } from '@/components/ds/EkActiveFilters.vue';
import EkButton from '@/components/ds/EkButton.vue';
import EkDateField from '@/components/ds/EkDateField.vue';
import EkChannelDot from '@/components/ds/EkChannelDot.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import { isRequestError } from '@/components/ds/listStandard';
import { formatDate as formatDay, formatDateTime } from '@/composables/format';
import FinancialSummaryBar from '@/components/financial/FinancialSummaryBar.vue';
import FinancialSummaryTab from '@/components/financial/FinancialSummaryTab.vue';
import FinancialCargoInvoicesTab from '@/components/financial/FinancialCargoInvoicesTab.vue';
import FinancialPayoutsTab from '@/components/financial/FinancialPayoutsTab.vue';
import EkPageHeader from '@/components/ds/EkPageHeader.vue';
import EkPageTabs, { type EkPageTab } from '@/components/ds/EkPageTabs.vue';
import { buildScreenPath, resolveScreenByKey } from '@/navigation/screens';
import type { StatusTone } from '@/design/status-map';

// Sabitler
const transactionTypeOptions = ['SALE', 'RETURN', 'PAYOUT', 'DEDUCTION', 'COMMISSION', 'CARGO'];

const integrationStore = useIntegrationStore();
const restApi = useRestApi();

// State
const loading = ref(false);
const transactions = ref<any[]>([]);
const totalRecords = ref(0);
const loadError = ref(false);
const isDetailOpen = ref(false);
const selectedTransaction = ref<any>(null);

const summary = reactive({
  totalCredit: 0,
  totalDebt: 0,
  netAmount: 0,
  totalCargo: 0,
  transactionCount: 0,
  loading: false
});

const searchForm = reactive({
  externalIdSearch: '',
  startDate: null as any,
  endDate: null as any,
  integrationCodes: [] as string[],
  transactionTypes: [] as string[]
});

const pagination = reactive({
  page: 1,
  limit: 25,
  totalPages: 1,
  totalNumberOfRecords: 0,
  totalNumberOfPages: 1,
});

const sortBy = ref<any[]>([{ key: 'transactionDate', order: 'desc' }]);

// DS-v2 liste standardı. FinancialService.getTransactionData `sortBy` dizisini SUNUCUDA uygular
// (anahtar = model alanı); sıralanabilir kolonlar: işlem no, net etki, işlem tarihi.
const columns: EkGridColumn[] = [
  { key: 'externalId', label: 'İşlem no', type: 'id', sortable: true },
  { key: 'channel', label: 'Kanal' },
  { key: 'transactionType', label: 'Tür' },
  { key: 'amount', label: 'Tutar detayı (+/-)', align: 'end' },
  { key: 'netAmount', label: 'Net etki', type: 'num', align: 'end', sortable: true },
  { key: 'transactionDate', label: 'İşlem tarihi', sortable: true },
  { key: 'actions', label: 'Detay', align: 'end', hideLabel: true, pin: 'end' },
];

const gridSort = computed<EkGridSort>(() => {
  const current = sortBy.value?.[0];
  return current ? { key: current.key, dir: current.order === 'asc' ? 'asc' : 'desc' } : null;
});

const onGridSort = (sort: EkGridSort) => {
  sortBy.value = sort ? [{ key: sort.key, order: sort.dir }] : [];
  getFinancials(true);
};

// Aktif filtre çipleri — SON SORGULANAN değerlerden.
type FinancialFilterData = typeof searchForm;
const applied = ref<FinancialFilterData>({ ...searchForm, integrationCodes: [], transactionTypes: [] });

const activeChips = computed<EkActiveFilterChip[]>(() => {
  const a = applied.value;
  const chips: EkActiveFilterChip[] = [];
  if (a.externalIdSearch) chips.push({ key: 'externalIdSearch', label: 'İşlem no', value: a.externalIdSearch });
  if (a.integrationCodes.length) chips.push({ key: 'integrationCodes', label: 'Platform', value: a.integrationCodes.join(', ') });
  if (a.transactionTypes.length) chips.push({ key: 'transactionTypes', label: 'İşlem tipi', value: a.transactionTypes.map(translateTransactionType).join(', ') });
  if (a.startDate) chips.push({ key: 'startDate', label: 'Başlangıç', value: formatDay(a.startDate) });
  if (a.endDate) chips.push({ key: 'endDate', label: 'Bitiş', value: formatDay(a.endDate) });
  return chips;
});

const panelFilterCount = computed(() => activeChips.value.filter(c => c.key !== 'externalIdSearch').length);

const removeChip = (key: string) => {
  const f = searchForm as Record<string, any>;
  f[key] = key === 'integrationCodes' || key === 'transactionTypes' ? [] : key === 'externalIdSearch' ? '' : null;
  getFinancials(true);
};

const handlePageChange = (page: number) => {
  pagination.page = page;
  getFinancials();
};

// API
const getFinancials = async (reset = false) => {
  if (reset) pagination.page = 1;
  loading.value = true;
  loadError.value = false;
  summary.loading = true;
  applied.value = { ...searchForm, integrationCodes: [...searchForm.integrationCodes], transactionTypes: [...searchForm.transactionTypes] };
  try {
    const res = await restApi.post('FinancialService/getTransactionData', {
      ...searchForm,
      page: pagination.page,
      limit: pagination.limit,
      sortBy: sortBy.value
    });
    if (isRequestError(res)) {
      loadError.value = true;
    } else if (res && res.transactions) {
      transactions.value = res.transactions;
      totalRecords.value = res.totalNumberOfRecords || 0;
      pagination.totalNumberOfRecords = totalRecords.value;
      pagination.totalPages = Math.ceil(totalRecords.value / pagination.limit) || 1;
      pagination.totalNumberOfPages = pagination.totalPages;
    }
    // Dip toplam: arama/filtre ile eşleşen TÜM kayıtlar (sayfa bağımsız)
    if (res && res.summary) {
      summary.totalCredit = res.summary.totalCredit ?? 0;
      summary.totalDebt = res.summary.totalDebt ?? 0;
      summary.netAmount = res.summary.netAmount ?? 0;
      summary.totalCargo = res.summary.totalCargo ?? 0;
      summary.transactionCount = res.summary.transactionCount ?? 0;
    }
  } finally {
    loading.value = false;
    summary.loading = false;
  }
};



// Panel "Temizle": yalnız panel alanları (arama korunur) + yeniden sorgu.
const resetFilters = () => {
  searchForm.integrationCodes = [];
  searchForm.transactionTypes = [];
  searchForm.startDate = null;
  searchForm.endDate = null;
  getFinancials(true);
};

const clearAll = () => {
  searchForm.externalIdSearch = '';
  resetFilters();
};

const openDetail = (item: any) => {
  selectedTransaction.value = item;
  isDetailOpen.value = true;
};

const getVatFromMeta = computed(() => {
  if (!selectedTransaction.value?.meta) return 0;
  const meta = selectedTransaction.value.meta;
  // KDV olabilecek anahtarları tara
  const vatKeys = ['vatAmount', 'vat', 'kdv', 'KdvAmount', 'VatAmount'];
  for (const key of vatKeys) {
    if (meta[key] && !isNaN(parseFloat(meta[key]))) {
      return parseFloat(meta[key]);
    }
  }
  return 0;
});

// İşlem türü -> rozet tonu (yerel; status-map.ts A-owned)
const TYPE_TONE: Record<string, StatusTone> = {
  SALE: 'success',
  RETURN: 'warning',
  PAYOUT: 'info',
  DEDUCTION: 'danger',
  COMMISSION: 'warning',
  CARGO: 'neutral'
};
const typeTone = (type: string): StatusTone => TYPE_TONE[type] || 'neutral';

const formatCurrency = (val: any) => parseFloat(val || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 });
// Aşama 3: diğer listelerle aynı biçim (GG.AA.YYYY SS:dd — saniye yok), `composables/format`.
const formatDate = (d: any) => d ? formatDateTime(d) : '—';

const translateTransactionType = (type: string) => {
  // Aşama 3: durum çipleri cümle düzeninde (diğer tüm listelerle aynı çip dili).
  const translations: any = {
    'SALE': 'Satış',
    'RETURN': 'İade',
    'PAYOUT': 'Ödeme',
    'DEDUCTION': 'Kesinti',
    'COMMISSION': 'Komisyon',
    'CARGO': 'Kargo',
    'CANCEL': 'İptal',
    'DISCOUNT': 'İndirim',
    'COUPON': 'Kupon',
    'PROVISION': 'Provizyon',
    'CORRECTION': 'Düzeltme'
  };
  return translations[type] || type;
};
const onPageSizeChange = (size: number) => {
  pagination.limit = size;
  getFinancials(true);
};

// ---- C1.4 sekmeler + URL parametresi (`?tab=`) ----
const props = defineProps<{ parameters?: any }>();
const { t } = useI18n();
const router = useRouter();

const FINANCE_TABS = ['transactions', 'summary', 'cargo-invoices', 'payouts'] as const;
type FinanceTab = (typeof FINANCE_TABS)[number];
const isFinanceTab = (v: unknown): v is FinanceTab => typeof v === 'string' && (FINANCE_TABS as readonly string[]).includes(v);

const tabs = computed<EkPageTab[]>(() => [
  { value: 'transactions', label: t('finance.tabs.transactions') },
  { value: 'summary', label: t('finance.tabs.summary') },
  { value: 'cargo-invoices', label: t('finance.tabs.cargoInvoices') },
  { value: 'payouts', label: t('finance.tabs.payouts') },
]);

const activeTab = ref<FinanceTab>(isFinanceTab(props.parameters?.tab) ? props.parameters.tab : 'transactions');

// Sekme değişimi URL'ye `replace` ile yazılır (geçmiş girdisi üretmez). Yalnız bu ekranın rotasındayken:
// kabuğun rota izleyicisi değeri sekmenin `link.parameters`'ına geri yazar (ADR-0012 parametre sahipliği).
const screen = resolveScreenByKey('FinancialListView');
const syncUrl = (tab: FinanceTab) => {
  if (!screen) return;
  const current = router.currentRoute.value;
  if (current.path !== buildScreenPath(screen) || current.query.tab === tab) return;
  router.replace({ path: current.path, query: { ...current.query, tab } }).catch(() => {});
};

// İşlemler yalnız ilk kez görünür olduğunda yüklenir (derin bağlantı başka sekmeye açtıysa gereksiz istek yok).
let transactionsLoaded = false;
watch(activeTab, (tab, previous) => {
  if (tab === 'transactions' && !transactionsLoaded) {
    transactionsLoaded = true;
    getFinancials();
  }
  if (previous !== undefined) syncUrl(tab);
}, { immediate: true });

const applyParameters = (parameters: any) => {
  if (isFinanceTab(parameters?.tab)) activeTab.value = parameters.tab;
};
defineExpose({ initialize: applyParameters, activate: applyParameters });
</script>

<style scoped>
.financialListView {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  overflow: hidden;
  padding: var(--ek-space-5) var(--ek-space-6);
}

.ek-fin-head {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: var(--ek-space-3);
}
.ek-fin-panel-slot {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ek-space-3);
  min-height: 0;
}
.ek-fin-panel-slot > :only-child { flex: 1; min-height: 0; }
.ek-fin-panel-slot--flow { overflow-y: auto; }
.ek-fin-panel-slot--flow > :only-child { flex: none; }
.ek-fin-summary-slot { flex: none; }
.ek-fin-screen { flex: 1; min-height: 0; }

@media (max-width: 767px) {
  .financialListView {
    overflow-y: auto;
    padding: var(--ek-space-4);
  }
  .ek-fin-panel-slot { flex: none; }
}

.ek-muted { color: var(--ek-color-content-muted); }
.ek-gap-4 { gap: var(--ek-space-4); }
.ek-fin-positive { color: var(--ek-color-success); }
.ek-fin-negative { color: var(--ek-color-danger); }

.ek-fin-id { display: flex; flex-direction: column; }
.ek-fin-id__sub {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.ek-fin-amount { display: flex; flex-direction: column; align-items: flex-end; }
.ek-fin-net { font-weight: var(--ek-font-weight-semibold); }

/* Detay diyaloğu */
.ek-fin-detail__head {
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-6);
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-default);
}
.ek-fin-detail__logo {
  padding: var(--ek-space-1) var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
}
.ek-fin-detail__ref {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}
.ek-fin-detail__body { padding: var(--ek-space-6); }

.ek-fin-label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
  letter-spacing: 0.02em;
}

.ek-fin-panel {
  padding: var(--ek-space-5);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}
.ek-fin-panel__title {
  display: flex;
  align-items: center;
  margin-bottom: var(--ek-space-4);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}
.ek-fin-flow { background: var(--ek-color-surface-muted); }
.ek-fin-flow__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--ek-space-4);
}
.ek-fin-flow__row--nested {
  padding-left: var(--ek-space-4);
  border-left: 2px solid var(--ek-color-border-strong);
}
.ek-fin-flow__amount {
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}
.ek-fin-flow__amount.ek-fin-negative { color: var(--ek-color-danger); }
.ek-fin-flow__net {
  display: block;
  margin-top: var(--ek-space-1);
  font-size: var(--ek-font-size-2xl);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-fin-info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ek-space-5);
}
.ek-fin-info-item { display: flex; flex-direction: column; gap: var(--ek-space-1); }
.ek-fin-info-value {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-default);
}
.ek-fin-note {
  padding: var(--ek-space-3);
  font-size: var(--ek-font-size-sm);
  line-height: var(--ek-line-height-normal);
  color: var(--ek-color-content-default);
  background: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
}
.ek-fin-vat {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--ek-space-4);
  padding: var(--ek-space-3);
  background: var(--ek-color-error-subtle);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
}
.ek-fin-json {
  max-height: 300px;
  overflow: auto;
  padding: var(--ek-space-2);
  background: var(--ek-color-surface-sunken);
  border-radius: var(--ek-radius-md);
}
.ek-fin-json pre {
  font-family: var(--ek-font-mono);
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-default);
  line-height: var(--ek-line-height-normal);
}

@media (max-width: 600px) {
  .ek-fin-info-grid { grid-template-columns: 1fr; }
  .ek-fin-detail__head { flex-direction: column; align-items: flex-start !important; }
}
</style>
