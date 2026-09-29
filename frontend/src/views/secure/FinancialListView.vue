<!--
  frontend/src/views/secure/FinancialListView.vue

  ADR-0015 B5-3 — GÖRSEL KATMAN (bkz. e2e/specs/financial.spec.ts). Davranış/API sözleşmesi
  DEĞİŞMEDİ: `FinancialService/getTransactionData` gövdesi (searchForm + page/limit/sortBy), özet
  (`res.summary`) işleme, getVatFromMeta, translateTransactionType, formatCurrency/formatDate, sıralama
  (masaüstü başlık + mobil seçici), filtre diyaloğu, detay diyaloğunun satır nesnesini DOĞRUDAN kullanması
  AYNEN korundu.

  - Başlık/arama/yenile/tarih seçicileri/Filtreler `EkListPage`'e taşındı (emsal: TicketListView);
    arama yazdıkça `getFinancials(true)` tetikler (emsal ile aynı; eski ekranda Enter'dı).
  - Tablo BİLEREK `v-data-table-server` KORUNDU (sıralanabilir başlıklar; `EkDataTable` sıralama desteklemiyor).
  - Tür rozetleri `EkStatusChip`'e taşındı (StatusTone eşlemesi yerel; status-map.ts A-owned, dokunulmadı).
  - Özet şeridi: yerel `FinancialSummaryBar` (aynı etiketler/sayılar; token'lı).
  - Karakterizasyon (DÜZELTİLMEDİ): `getFinancials` catch İÇERMEZ; hata ayrı görünüm üretmez — 500 de
    "Finansal Kayıt Bulunamadı" boş durumuna düşer. Filtre diyaloğu "Temizle" (resetFilters) yeniden
    sorgu ATMAZ. Tür filtresi seçenekleri çevrilmemiş ham kodlardır. Mobil kartta detay eylemi YOKTUR.
-->
<template>
  <div class="financialListView d-flex flex-column">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <!-- Filtre Diyaloğu -->
    <ActionDialogComponent v-model="isFilterMenuOpen" title="Finansal Filtreler" attach=".financialListView"
      subtitle="Platform ve işlem tipi bazlı filtreleme" icon="mdi-filter-variant" color="primary" maxWidth="600px"
      confirmText="SONUÇLARI GÖSTER" @confirm="getFinancials(true); isFilterMenuOpen = false" @cancel="resetFilters()">
      <v-row dense>
        <v-col cols="12" sm="6">
          <v-select v-model="searchForm.integrationCodes" :items="integrationStore.getClientPlatforms()"
            item-title="title" item-value="code" label="Platformlar" variant="outlined" density="compact" multiple
            chips></v-select>
        </v-col>
        <v-col cols="12" sm="6">
          <v-select v-model="searchForm.transactionTypes" :items="transactionTypeOptions" label="İşlem Tipi"
            variant="outlined" density="compact" multiple chips></v-select>
        </v-col>
      </v-row>
    </ActionDialogComponent>

    <!-- İşlem Detay Diyaloğu -->
    <ActionDialogComponent v-model="isDetailOpen" title="FİNANSAL İŞLEM DETAYI" attach=".financialListView"
      subtitle="Pazaryeri mutabakat ve hakediş ayrıntıları" icon="mdi-shield-check-outline" color="primary"
      maxWidth="850px" confirmText="KAPAT" @confirm="isDetailOpen = false" hide-cancel>

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

    <EkListPage
      section="Finans"
      title="Finansal İşlemler"
      description="Pazaryeri hakediş, komisyon ve kesinti hareketlerinizi buradan takip edin."
      :secondary-actions="[{ label: 'Filtreler', icon: 'mdi-filter-variant', onClick: () => (isFilterMenuOpen = true) }]"
      :search="searchForm.externalIdSearch"
      search-placeholder="İşlem No Ara (External ID)"
      :state="viewState"
      @update:search="onSearchInput"
      @clear-filters="resetFilters"
      @refresh="() => getFinancials()"
    >
      <template #filters-extra>
        <v-menu v-model="menuDateStart" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedStartDate" label="Başlangıç" prepend-inner-icon="mdi-calendar-start"
              hide-details readonly clearable @click:clear="searchForm.startDate = null" v-bind="props"
              class="ek-fin-date"></v-text-field>
          </template>
          <v-card>
            <v-date-picker v-model="searchForm.startDate" :max="searchForm.endDate" hide-header locale="tr"
              color="primary" @update:model-value="menuDateStart = false" show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>

        <v-menu v-model="menuDateEnd" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedEndDate" label="Bitiş" prepend-inner-icon="mdi-calendar-end"
              hide-details readonly clearable @click:clear="searchForm.endDate = null" v-bind="props"
              class="ek-fin-date"></v-text-field>
          </template>
          <v-card>
            <v-date-picker v-model="searchForm.endDate" :min="searchForm.startDate" hide-header locale="tr"
              color="primary" @update:model-value="menuDateEnd = false" show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>
      </template>

      <template #loading>
        <div class="d-flex flex-column ek-gap-4">
          <FinancialSummaryBar :summary="summary" :loading="summary.loading" :compact="!$vuetify.display.mdAndUp"
            :format-currency="formatCurrency" />
          <EkSkeleton type="table" />
        </div>
      </template>

      <template #empty>
        <div class="d-flex flex-column ek-gap-4">
          <FinancialSummaryBar :summary="summary" :loading="summary.loading" :compact="!$vuetify.display.mdAndUp"
            :format-currency="formatCurrency" />
          <EkEmptyState variant="no-results" title="Finansal Kayıt Bulunamadı"
            message="Arama kriterlerinize uygun herhangi bir finansal işlem kaydı bulunamadı." />
        </div>
      </template>

      <div class="d-flex flex-column ek-gap-4">
        <FinancialSummaryBar :summary="summary" :loading="summary.loading" :compact="!$vuetify.display.mdAndUp"
          :format-currency="formatCurrency" />

        <!-- Masaüstü Tablo -->
        <v-data-table-server v-if="$vuetify.display.mdAndUp" v-model:sort-by="sortBy" :items-length="totalRecords"
          :items="transactions" :loading="loading" :headers="headers" fixed-header hide-default-footer
          @update:sortBy="onSortUpdate">

          <template v-slot:item="{ item }: any">
            <tr :key="item._id">
              <td class="text-left py-2">
                <div class="d-flex align-center">
                  <PlatformImageComponent :integrationCode="item.integrationCode" :width="60" :height="30"
                    class="mr-3" />
                  <div class="d-flex flex-column">
                    <span class="font-weight-semibold text-body-2 ek-num">ID: {{ item.externalId }}</span>
                    <span class="text-caption ek-muted">Sipariş: {{ item.orderNumber || 'Manuel' }}</span>
                  </div>
                </div>
              </td>

              <td class="text-left">
                <v-tooltip :text="item.platformType" location="top">
                  <template v-slot:activator="{ props }">
                    <span v-bind="props" tabindex="0">
                      <EkStatusChip :tone="typeTone(item.transactionType)"
                        :label="translateTransactionType(item.transactionType)" />
                    </span>
                  </template>
                </v-tooltip>
              </td>

              <td class="text-right py-2">
                <div class="d-flex flex-column align-end text-body-2 ek-num">
                  <span :class="item.credit > 0 ? 'ek-fin-positive' : 'ek-muted'">
                    {{ item.credit > 0 ? '+' : '' }}{{ formatCurrency(item.credit) }}
                  </span>
                  <span :class="item.debt > 0 ? 'ek-fin-negative' : 'ek-muted'">
                    {{ item.debt > 0 ? '-' : '' }}{{ formatCurrency(item.debt) }}
                  </span>
                </div>
              </td>

              <td class="text-right">
                <span class="font-weight-semibold ek-num">{{ formatCurrency(item.netAmount) }}</span>
              </td>

              <td class="text-left py-3">
                <div class="d-flex flex-column">
                  <span class="text-body-2 ek-num">{{ formatDate(item.transactionDate) }}</span>
                  <span v-if="item.payoutDate" class="text-caption ek-muted ek-num">
                    Vade: {{ formatDate(item.payoutDate) }}
                  </span>
                </div>
              </td>

              <td class="text-right">
                <div class="d-flex justify-end pr-1">
                  <v-btn icon variant="text" density="comfortable" aria-label="Detayı görüntüle"
                    @click="openDetail(item)">
                    <v-icon>mdi-eye</v-icon>
                    <v-tooltip activator="parent" location="top">Detayı görüntüle</v-tooltip>
                  </v-btn>
                </div>
              </td>
            </tr>
          </template>
        </v-data-table-server>

        <!-- Mobil Liste -->
        <div v-else class="d-flex flex-column">
          <div class="ek-fin-sort-bar d-flex align-center justify-space-between">
            <div class="d-flex align-center">
              <v-icon size="18" class="ek-muted mr-2" aria-hidden="true">mdi-sort-variant</v-icon>
              <span class="text-caption font-weight-medium ek-muted">Sıralama</span>
            </div>
            <v-select v-model="mobileSortValue" :items="mobileSortOptions" item-title="title" item-value="value"
              density="compact" hide-details aria-label="Sıralama" class="ek-fin-sort-select"
              @update:model-value="onMobileSortChange"></v-select>
          </div>

          <v-card v-for="item in transactions" :key="item._id" class="mb-3" variant="flat" border rounded="lg">
            <div class="d-flex align-center justify-space-between pa-3 ek-fin-card-head">
              <PlatformImageComponent :integrationCode="item.integrationCode" :width="55" :height="25" />
              <EkStatusChip :tone="typeTone(item.transactionType)"
                :label="translateTransactionType(item.transactionType)" />
            </div>
            <div class="pa-3">
              <div class="d-flex justify-space-between mb-2">
                <div class="d-flex flex-column">
                  <span class="text-caption font-weight-semibold ek-num">
                    {{ item.orderNumber || 'İşlem No: ' + item.externalId }}
                  </span>
                  <span class="text-caption ek-muted">{{ item.platformType }}</span>
                </div>
                <div class="d-flex flex-column align-end">
                  <span class="text-body-2 font-weight-semibold ek-num"
                    :class="item.netAmount >= 0 ? 'ek-fin-positive' : 'ek-fin-negative'">
                    {{ formatCurrency(item.netAmount) }} TRY
                  </span>
                  <span class="text-caption ek-muted ek-num">
                    <v-icon size="12" class="mr-1" aria-hidden="true">mdi-clock-outline</v-icon>{{ formatDate(item.transactionDate) }}
                  </span>
                </div>
              </div>

              <div class="ek-fin-card-flow">
                <div class="d-flex justify-space-between">
                  <span class="text-caption ek-muted">Gelir</span>
                  <span class="text-caption font-weight-semibold ek-fin-positive ek-num">+{{ formatCurrency(item.credit) }}</span>
                </div>
                <div class="d-flex justify-space-between mt-1">
                  <span class="text-caption ek-muted">Gider</span>
                  <span class="text-caption font-weight-semibold ek-fin-negative ek-num">-{{ formatCurrency(item.debt) }}</span>
                </div>
              </div>
            </div>
          </v-card>
        </div>
      </div>

      <template #pagination>
        <EkPagination :page="pagination.page" :page-size="pagination.limit" :total="pagination.totalNumberOfRecords"
          :page-size-options="[10, 20, 50, 100]" @update:page="handlePageChange"
          @update:page-size="onPageSizeChange" />
      </template>
    </EkListPage>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useIntegrationStore } from '@/stores/integrationStore';
import useRestApi from '@/composables/restapi';

// Components
import LoadingComponent from '@/components/LoadingComponent.vue';
import PlatformImageComponent from '@/components/platforms/PlatformImageComponent.vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import EkListPage from '@/components/ds/templates/EkListPage.vue';
import EkPagination from '@/components/ds/EkPagination.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';
import EkSkeleton from '@/components/ds/EkSkeleton.vue';
import FinancialSummaryBar from '@/components/financial/FinancialSummaryBar.vue';
import type { StatusTone } from '@/design/status-map';

// Sabitler
const transactionTypeOptions = ['SALE', 'RETURN', 'PAYOUT', 'DEDUCTION', 'COMMISSION', 'CARGO'];

const integrationStore = useIntegrationStore();
const restApi = useRestApi();

// State
const loadingComponentRef = ref<any>(null);
const dialogAttach = ref(".financialListView");
const loading = ref(false);
const transactions = ref<any[]>([]);
const totalRecords = ref(0);
const isFilterMenuOpen = ref(false);
const menuDateStart = ref(false);
const menuDateEnd = ref(false);
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
  limit: 20,
  totalPages: 1,
  totalNumberOfRecords: 0,
  totalNumberOfPages: 1,
});

const sortBy = ref<any[]>([{ key: 'transactionDate', order: 'desc' }]);

const headers: any = [
  { title: 'Platform & İşlem No', key: 'externalId', align: 'start', sortable: true },
  { title: 'Tür', key: 'transactionType', align: 'start', sortable: false },
  { title: 'Tutar Detayı (+/-)', key: 'amount', align: 'end', sortable: false },
  { title: 'Net Etki', key: 'netAmount', align: 'end', sortable: true },
  { title: 'İşlem Tarihi', key: 'transactionDate', align: 'start', sortable: true },
  { title: 'Detay', key: 'actions', align: 'end', sortable: false },
];

// Mobil Sıralama
const mobileSortValue = ref('transactionDate_desc');
const mobileSortOptions = [
  { title: 'Tarih: En Yeni', value: 'transactionDate_desc' },
  { title: 'Tarih: En Eski', value: 'transactionDate_asc' },
  { title: 'Tutar: En Yüksek', value: 'netAmount_desc' },
  { title: 'Tutar: En Düşük', value: 'netAmount_asc' },
];

const onMobileSortChange = (val: string) => {
  const [key, order] = val.split('_');
  sortBy.value = [{ key, order }];
  getFinancials(true);
};

const onSortUpdate = (val: any) => {
  sortBy.value = val;
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
  summary.loading = true;
  const guid = loadingComponentRef.value?.info("") || "loading";
  try {
    const res = await restApi.post('FinancialService/getTransactionData', {
      ...searchForm,
      page: pagination.page,
      limit: pagination.limit,
      sortBy: sortBy.value
    });
    if (res && res.transactions) {
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
    loadingComponentRef.value?.remove(guid);
    loading.value = false;
    summary.loading = false;
  }
};



const resetFilters = () => {
  searchForm.integrationCodes = [];
  searchForm.transactionTypes = [];
  isFilterMenuOpen.value = false;
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
const formatDate = (d: any) => d ? new Date(d).toLocaleString('tr-TR') : '-';

const translateTransactionType = (type: string) => {
  const translations: any = {
    'SALE': 'SATIŞ',
    'RETURN': 'İADE',
    'PAYOUT': 'ÖDEME',
    'DEDUCTION': 'KESİNTİ',
    'COMMISSION': 'KOMİSYON',
    'CARGO': 'KARGO',
    'CANCEL': 'İPTAL',
    'DISCOUNT': 'İNDİRİM',
    'COUPON': 'KUPON',
    'PROVISION': 'PROVİZYON',
    'CORRECTION': 'DÜZELTME'
  };
  return translations[type] || type;
};
const formattedStartDate = computed(() => searchForm.startDate ? formatDate(searchForm.startDate) : '');
const formattedEndDate = computed(() => searchForm.endDate ? formatDate(searchForm.endDate) : '');

// Karakterizasyon: ayrı bir hata durumu YOK (getFinancials catch içermez) — boş liste, gerçek boş
// sonuç ile aynı "empty" görünümüne düşer.
const viewState = computed<'loading' | 'empty' | 'ready'>(() => {
  if (loading.value) return 'loading';
  if (!transactions.value?.length) return 'empty';
  return 'ready';
});

const onSearchInput = (value: string) => {
  searchForm.externalIdSearch = value;
  getFinancials(true);
};

const onPageSizeChange = (size: number) => {
  pagination.limit = size;
  getFinancials(true);
};

onMounted(() => getFinancials());
</script>

<style scoped>
.financialListView {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
  padding: var(--ek-space-6);
  gap: var(--ek-space-4);
}

.ek-muted { color: var(--ek-color-content-muted); }
.ek-gap-4 { gap: var(--ek-space-4); }
.ek-fin-positive { color: var(--ek-color-success); }
.ek-fin-negative { color: var(--ek-color-danger); }

.ek-fin-date { min-width: 160px; }

.ek-fin-sort-bar { gap: var(--ek-space-3); padding: var(--ek-space-2) 0 var(--ek-space-3); }
.ek-fin-sort-select { max-width: 200px; }
.ek-fin-card-head { border-bottom: 1px dashed var(--ek-color-border-default); }
.ek-fin-card-flow {
  padding: var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
}

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
