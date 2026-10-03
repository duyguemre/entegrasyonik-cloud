<!--
  frontend/src/views/secure/FinancialListView.vue

  DS-v2 Aşama 2 — liste standardı (EkListScreen). API sözleşmesi DEĞİŞMEDİ:
  `FinancialService/getTransactionData` gövdesi (searchForm + page/limit/sortBy), özet (`res.summary`),
  detay diyaloğu (satır nesnesini doğrudan kullanır) AYNEN korundu. Sıralama SUNUCUDA (externalId,
  netAmount, transactionDate). Tarih filtresi EkDateRange (FR3 madde 10; Date modeli — eski v-date-picker ile aynı).
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
      <!-- FE-LOCAL-1051: yenile düğmesi yok — sayfa adına tıklamak etkin görünümü yeniler; sağda Liste | Özet. -->
      <EkPageHeader section="Finans ve raporlar" :title="t('finance.title')" :description="t('finance.description')"
        refreshable :refreshing="refreshing" @refresh="refreshActive">
        <template #tools><EkViewSwitch v-model="view" /></template>
      </EkPageHeader>
      <EkPageTabs v-if="view === 'list'" v-model="activeTab" :tabs="tabs" :label="t('finance.tabs.label')" />
    </div>

    <!-- İşlem Detay Diyaloğu -->
    <ActionDialogComponent v-model="isDetailOpen" title="Finansal işlem detayı" attach=".financialListView"
      subtitle="Pazaryeri mutabakat ve hakediş ayrıntıları" icon="mdi-shield-check-outline" color="primary"
      maxWidth="850px" confirmText="Kapat" @confirm="isDetailOpen = false" hide-cancel>

      <!-- FE-LOCAL-1048: gövde ortak dile taşındı (kayıt özeti + büyük rakam hücreleri) — FinancialTransactionDetail. -->
      <FinancialTransactionDetail v-if="selectedTransaction" :transaction="selectedTransaction"
        :type-tone="typeTone(selectedTransaction.transactionType)" :type-label="translateTransactionType(selectedTransaction.transactionType)" />
    </ActionDialogComponent>

    <div v-show="activeTab === 'transactions'" class="ek-fin-panel-slot ek-fin-transactions">
    <EkListScreen channel-key="integrationCode"
      class="ek-fin-screen"
      :refreshable="activeTab === 'transactions'"
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
      search-placeholder="İşlem no ile ara"
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
        <EkSelect kind="channel" v-model="searchForm.integrationCodes" :items="channelOptionsFrom(integrationStore.getClientPlatforms())" label="Kanal" multiple clearable />
        <EkSelect v-model="searchForm.transactionTypes" :items="transactionTypeOptions" label="İşlem türü"
          multiple clearable />
        <EkDateRange v-model:start="searchForm.startDate" v-model:end="searchForm.endDate" label="İşlem tarihi" value-format="date" />
      </template>

      <!-- Süzmeyle eşleşen TÜM kayıtların sunucu toplamı — tek satır (ayrıntılı akış Özet görünümünde). -->
      <template #toolbar-start>
        <span v-if="summary.transactionCount" class="ek-fin-totals ek-num" role="status">
          <span><span class="ek-fin-totals__tag">Alacak</span><span class="ek-fin-positive">+{{ formatCurrency(summary.totalCredit) }}</span></span>
          <span><span class="ek-fin-totals__tag">Kesinti</span><span class="ek-fin-negative">−{{ formatCurrency(summary.totalDebt) }}</span></span>
          <span><span class="ek-fin-totals__tag">Net</span><strong>{{ formatCurrency(summary.netAmount) }}</strong></span>
        </span>
      </template>

      <template #cell-externalId="{ row }">
        <span class="ek-fin-id">
          <span class="ek-num">{{ row.externalId }}</span>
          <span class="ek-fin-id__sub">{{ row.orderNumber ? `Sipariş: ${row.orderNumber}` : 'Siparişe bağlı değil' }}</span>
        </span>
      </template>
      <template #cell-channel="{ row }"><EkChannelDot :code="row.integrationCode" /></template>
      <template #cell-transactionType="{ row }">
        <EkTooltip :text="row.platformType" location="top">
          <span tabindex="0">
            <EkStatusChip :tone="typeTone(row.transactionType)" :label="translateTransactionType(row.transactionType)" />
          </span>
        </EkTooltip>
      </template>
      <template #cell-amount="{ row }">
        <!-- FR2-FIN 38: alacak ve kesinti ayrı, etiketli; sıfır kalem "—" (gürültü yok). -->
        <span class="ek-fin-amount ek-num">
          <span v-if="row.credit > 0" class="ek-fin-amount__line"><span class="ek-fin-amount__tag">Alacak</span><span class="ek-fin-positive">+{{ formatCurrency(row.credit) }}</span></span>
          <span v-if="row.debt > 0" class="ek-fin-amount__line"><span class="ek-fin-amount__tag">Kesinti</span><span class="ek-fin-negative">−{{ formatCurrency(row.debt) }}</span></span>
          <span v-if="!(row.credit > 0) && !(row.debt > 0)" class="ek-muted">—</span>
        </span>
      </template>
      <template #cell-netAmount="{ row }"><span class="ek-fin-net ek-num" :class="{ 'ek-fin-net--in': row.netAmount > 0 }">{{ row.netAmount > 0 ? '+' : row.netAmount < 0 ? '−' : '' }}{{ formatCurrency(Math.abs(row.netAmount)) }}</span></template>
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
        <FinancialSummaryTab v-if="activeTab === 'summary'" ref="summaryRef" @open-type="openType" />
        <FinancialCargoInvoicesTab v-else-if="activeTab === 'cargo-invoices'" />
        <FinancialPayoutsTab v-else-if="activeTab === 'payouts'" />
      </KeepAlive>
    </div>
  </div>
</template>

<script setup lang="ts">
import { EkSelect, EkRowActions, EkButton, EkDateRange, EkChannelDot, EkStatusChip, EkPageTabs, EkTooltip, type EkPageTab } from '@entegrasyonik/ui/components'
import type { EkGridColumn, EkGridSort, EkActiveFilterChip } from '@entegrasyonik/ui/components'
import { channelOptionsFrom } from '@entegrasyonik/ui/components/selectOptions'
import { ref, reactive, computed, watch } from 'vue';
import { provideListRefreshHub } from '@/components/page/listTools';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useIntegrationStore } from '@/stores/integrationStore';
import useRestApi from '@/composables/restapi';

// Components
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import EkListScreen from '@/components/page/templates/EkListScreen.vue';
;
;
;
;
;
;
import { isRequestError } from '@entegrasyonik/ui/components/listStandard';
import { formatDate as formatDay, formatDateTime, formatMoney } from '@entegrasyonik/ui/format';
import FinancialTransactionDetail from '@/components/financial/FinancialTransactionDetail.vue';
import FinancialSummaryTab, { type FinanceTypeSelection } from '@/components/financial/FinancialSummaryTab.vue';
import EkViewSwitch, { type EkViewMode } from '@/components/page/EkViewSwitch.vue';
import FinancialCargoInvoicesTab from '@/components/financial/FinancialCargoInvoicesTab.vue';
import FinancialPayoutsTab from '@/components/financial/FinancialPayoutsTab.vue';
import EkPageHeader from '@/components/page/EkPageHeader.vue';
import { buildScreenPath, resolveScreenByKey } from '@/navigation/screens';
import type { StatusTone } from '@/design/status-map';
// FE-LOCAL-1051: "Yenile" düğmesi yok — sayfa adına tıklamak etkin sekmenin listesini (ya da Özet panosunu) yeniler.
const refreshHub = provideListRefreshHub()

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
  { key: 'amount', label: 'Alacak / kesinti', align: 'end' },
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

const formatCurrency = (val: any) => formatMoney(Number(val || 0));
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

let transactionsLoaded = false;
const FINANCE_TABS = ['transactions', 'summary', 'cargo-invoices', 'payouts'] as const;
type FinanceTab = (typeof FINANCE_TABS)[number];
const isFinanceTab = (v: unknown): v is FinanceTab => typeof v === 'string' && (FINANCE_TABS as readonly string[]).includes(v);

// FE-LOCAL-1051: "Özet" sekme değil — sayfa adı satırındaki Liste | Özet anahtarıyla listelerin YERİNE açılır.
// `activeTab` değerleri (ve `?tab=summary` derin bağlantısı) aynı kalır; sekme şeridinde yalnız liste sekmeleri durur.
const tabs = computed<EkPageTab[]>(() => [
  { value: 'transactions', label: t('finance.tabs.transactions') },
  { value: 'cargo-invoices', label: t('finance.tabs.cargoInvoices') },
  { value: 'payouts', label: t('finance.tabs.payouts') },
]);

const activeTab = ref<FinanceTab>(isFinanceTab(props.parameters?.tab) ? props.parameters.tab : 'transactions');

let lastListTab: Exclude<FinanceTab, 'summary'> = activeTab.value === 'summary' ? 'transactions' : activeTab.value;
const view = computed<EkViewMode>({
  get: () => (activeTab.value === 'summary' ? 'summary' : 'list'),
  set: (mode) => {
    if (mode === 'summary') {
      if (activeTab.value !== 'summary') lastListTab = activeTab.value;
      activeTab.value = 'summary';
    } else if (activeTab.value === 'summary') activeTab.value = lastListTab;
  },
});

const summaryRef = ref<InstanceType<typeof FinancialSummaryTab> | null>(null);
const refreshing = computed(() => (activeTab.value === 'summary' ? !!summaryRef.value?.loading : refreshHub.loading.value));
const refreshActive = () => (activeTab.value === 'summary' ? summaryRef.value?.load() : refreshHub.run());

/** Özet'te bir işlem türüne tıklanınca: İşlemler listesi aynı dönem + kanal ve o türle açılır. */
const openType = (sel: FinanceTypeSelection) => {
  searchForm.externalIdSearch = '';
  searchForm.transactionTypes = [sel.type];
  searchForm.integrationCodes = [...sel.integrationCodes];
  searchForm.startDate = sel.startDate;
  searchForm.endDate = sel.endDate;
  transactionsLoaded = true;
  activeTab.value = 'transactions';
  getFinancials(true);
};

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
  /* P15: bu ekranlar EkListFrame'i EkListScreen dışında kullanır — liste kartı asgari yüksekliğe (340px)
     ulaşınca ekran kökü kendi içinde kayar (kırpılıp sayfalama erişilemez olmasın). */
  overflow-x: hidden;
  overflow-y: auto;
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

/* Tablo üstündeki tek satır toplam (süzmeyle eşleşen tüm kayıtlar). */
.ek-fin-totals {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-5);
  font-size: var(--ek-type-label-size);
}
.ek-fin-totals > span { display: inline-flex; align-items: baseline; gap: var(--ek-space-2); }
.ek-fin-totals__tag {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}
.ek-fin-totals strong { color: var(--ek-color-content-strong); font-weight: var(--ek-font-weight-semibold); }

.ek-muted { color: var(--ek-color-content-muted); }
.ek-fin-positive { color: var(--ek-color-success); }
.ek-fin-negative { color: var(--ek-color-danger); }

.ek-fin-id { display: flex; flex-direction: column; }
.ek-fin-id__sub {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.ek-fin-amount { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.ek-fin-amount__line { display: inline-flex; align-items: baseline; gap: var(--ek-space-2); }
.ek-fin-amount__tag {
  font-size: var(--ek-type-micro-size);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}
.ek-fin-net { font-weight: var(--ek-font-weight-semibold); color: var(--ek-color-content-strong); }
.ek-fin-net--in { color: var(--ek-color-success-emphasis); }

/* Detay diyaloğunun gövdesi: components/financial/FinancialTransactionDetail.vue (FE-LOCAL-1048). */
</style>
