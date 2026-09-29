<template>
  <div class="financialListView d-flex flex-column pt-2">
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>


    <!-- Arama & Filtre Barı -->
    <div class="d-flex pa-2 pt-0 pb-0 mt-1 mb-1 align-start flex-wrap search-section"
      style="max-width:1200px; gap: 8px;">

      <v-text-field clearable density="compact" label="İşlem No Ara (External ID)" variant="outlined"
        v-model="searchForm.externalIdSearch" bg-color="textfieldColor" class="customTextField flex-grow-1" hide-details
        placeholder="Örn: 12345678" @keyup.enter.stop="getFinancials(true)"
        @click:clear="searchForm.externalIdSearch = ''; getFinancials(true)">
        <template #append-inner>
          <v-btn flat size="40" class="pa-2" elevation="0" color="white" @click.stop="getFinancials(true)"
            style="border:1px solid white">
            <v-icon size="x-large" color="processButtonColor">mdi-magnify</v-icon>
          </v-btn>
        </template>
      </v-text-field>

      <div class="d-flex align-center flex-wrap mobile-controls-group" style="gap: 8px;">
        <v-menu v-model="menuDateStart" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedStartDate" label="Başlangıç" variant="outlined" density="compact"
              bg-color="white" prepend-inner-icon="mdi-calendar-start" hide-details readonly clearable
              @click:clear="searchForm.startDate = null" v-bind="props" class="customTextField date-input"
              style="min-width: 160px;"></v-text-field>
          </template>
          <v-card class="rounded-lg">
            <v-date-picker v-model="searchForm.startDate" :max="searchForm.endDate" hide-header locale="tr"
              color="passiveColor" @update:model-value="menuDateStart = false"
              style="background-color: rgb(var(--v-theme-loginColor))!important;" show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>

        <v-menu v-model="menuDateEnd" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedEndDate" label="Bitiş" variant="outlined" density="compact"
              bg-color="white" prepend-inner-icon="mdi-calendar-end" hide-details readonly clearable
              @click:clear="searchForm.endDate = null" v-bind="props" class="customTextField date-input"
              style="min-width: 160px;"></v-text-field>
          </template>
          <v-card class="rounded-lg">
            <v-date-picker v-model="searchForm.endDate" :min="searchForm.startDate" hide-header locale="tr"
              color="passiveColor" style="background-color: rgb(var(--v-theme-loginColor))!important;"
              @update:model-value="menuDateEnd = false" show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>

        <div class="d-flex gap-2">
          <v-btn @click="isFilterMenuOpen = true" size="40" elevation="0" color="white" class="premium-cube-btn"
            style="border:1px solid rgb(var(--v-theme-borderColor));">
            <v-icon size="x-large" color="passiveColor">mdi-filter-variant</v-icon>
          </v-btn>
          <v-btn @click="getFinancials()" size="40" elevation="0" color="white" class="premium-cube-btn"
            style="border:1px solid rgb(var(--v-theme-borderColor));">
            <v-icon size="x-large" color="passiveColor">mdi-refresh</v-icon>
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Filtre Diyaloğu -->
    <ActionDialogComponent v-model="isFilterMenuOpen" title="Finansal Filtreler" attach=".financialListView"
      subtitle="Platform ve işlem tipi bazlı filtreleme" icon="mdi-filter-variant" color="passiveColor" maxWidth="600px"
      confirmText="SONUÇLARI GÖSTER" @confirm="getFinancials(true); isFilterMenuOpen = false" @cancel="resetFilters()">
      <v-row dense>
        <v-col cols="12" sm="6">
          <v-select v-model="searchForm.integrationCodes" :items="integrationStore.getClientPlatforms()"
            item-title="title" item-value="code" label="Platformlar" variant="outlined" density="compact" multiple chips
            class="customTextField"></v-select>
        </v-col>
        <v-col cols="12" sm="6">
          <v-select v-model="searchForm.transactionTypes" :items="transactionTypeOptions" label="İşlem Tipi"
            variant="outlined" density="compact" multiple chips class="customTextField"></v-select>
        </v-col>
      </v-row>
    </ActionDialogComponent>

    <!-- İşlem Detay Diyaloğu -->
    <ActionDialogComponent v-model="isDetailOpen" title="FİNANSAL İŞLEM DETAYI" attach=".financialListView"
      subtitle="Pazaryeri mutabakat ve hakediş ayrıntıları" icon="mdi-shield-check-outline" color="indigo-darken-3"
      maxWidth="850px" confirmText="KAPAT" @confirm="isDetailOpen = false" hide-cancel>

      <div v-if="selectedTransaction" class="premium-detail-container pa-0">
        <!-- Üst Bilgi Kartı: Platform & Ana Bilgiler -->
        <div
          class="detail-header-strip d-flex align-center justify-space-between px-6 py-4 bg-slate-50 border-bottom-subtle">
          <div class="d-flex align-center">
            <div class="platform-logo-wrapper mr-4">
              <PlatformImageComponent :integrationCode="selectedTransaction.integrationCode" :width="100"
                :height="45" />
            </div>
            <div class="d-flex flex-column">
              <span class="text-micro font-weight-black text-indigo-lighten-1 uppercase letter-spacing-1">İŞLEM
                REFERANSI</span>
              <span class="text-h6 font-weight-black text-slate-900 line-height-1 mt-1">{{
                selectedTransaction.externalId
                }}</span>
            </div>
          </div>
          <div class="d-flex flex-column align-end">
            <v-tooltip :text="selectedTransaction.platformType" location="top">
              <template v-slot:activator="{ props }">
                <v-chip v-bind="props" size="small" variant="flat"
                  :color="getTypeColor(selectedTransaction.transactionType)"
                  class="text-white font-weight-bold px-4 mb-1">
                  {{ translateTransactionType(selectedTransaction.transactionType) }}
                </v-chip>
              </template>
            </v-tooltip>
          </div>
        </div>

        <div class="pa-6">
          <v-row>
            <!-- Sol Kolon: İşlem Özeti -->
            <v-col cols="12" md="7">
              <div class="premium-card h-100 pa-5 border-subtle rounded-xl bg-white shadow-sm">
                <div class="d-flex align-center mb-4">
                  <v-icon color="indigo" class="mr-2">mdi-text-box-search-outline</v-icon>
                  <span class="text-subtitle-2 font-weight-black text-slate-700 uppercase">İŞLEM ÖZETİ</span>
                </div>

                <div class="info-grid">
                  <div class="info-item">
                    <span class="info-label">SİPARİŞ NUMARASI</span>
                    <span class="info-value font-weight-black text-indigo">{{ selectedTransaction.orderNumber || 'MANUEL İŞLEM' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">İŞLEM TARİHİ</span>
                    <span class="info-value">{{ formatDate(selectedTransaction.transactionDate) }}</span>
                  </div>
                  <div v-if="selectedTransaction.payoutDate" class="info-item">
                    <span class="info-label">VADE (ÖDEME) TARİHİ</span>
                    <span class="info-value text-orange-darken-3 font-weight-bold">
                      <v-icon size="14" class="mr-1">mdi-calendar-clock</v-icon>{{
                        formatDate(selectedTransaction.payoutDate) }}
                    </span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">KOMİSYON ORANI</span>
                    <span class="info-value">{{ selectedTransaction.commissionRate ? '%' +
                      selectedTransaction.commissionRate : '-' }}</span>
                  </div>
                </div>

                <v-divider class="my-4 border-dashed"></v-divider>

                <div class="description-box mt-2">
                  <span class="info-label mb-2 d-block">AÇIKLAMA / NOTLAR</span>
                  <div
                    class="text-body-2 text-slate-600 line-height-relaxed italic pa-3 bg-slate-50 rounded-lg border-subtle">
                    "{{ selectedTransaction.description || 'Bu işlem için ek açıklama bulunmuyor.' }}"
                  </div>
                </div>
              </div>
            </v-col>

            <!-- Sağ Kolon: Finansal Akış (Money Flow) -->
            <v-col cols="12" md="5">
              <div class="money-flow-card h-100 pa-5 rounded-xl text-white d-flex flex-column"
                style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);">

                <div class="d-flex align-center mb-6">
                  <v-icon color="indigo-lighten-4" class="mr-2">mdi-finance</v-icon>
                  <span class="text-subtitle-2 font-weight-bold uppercase opacity-80">FİNANSAL AKIŞ</span>
                </div>

                <div class="flow-item d-flex justify-space-between align-center mb-4">
                  <div class="d-flex flex-column">
                    <span class="text-micro opacity-70 font-weight-bold uppercase">BRÜT TUTAR</span>
                    <span class="text-body-1 font-weight-black">{{ formatCurrency(selectedTransaction.credit) }}
                      ₺</span>
                  </div>
                  <v-icon color="success" size="24">mdi-plus-circle-outline</v-icon>
                </div>

                <!-- Komisyon ve Ek Kesintiler -->
                <div v-if="selectedTransaction.commissionAmount"
                  class="flow-item d-flex justify-space-between align-center mb-4 pl-4 border-left-subtle">
                  <div class="d-flex flex-column">
                    <span class="text-micro opacity-70 font-weight-bold uppercase">PAZARYERİ KOMİSYONU</span>
                    <span class="text-body-2 font-weight-bold text-red-lighten-4">-{{
                      formatCurrency(selectedTransaction.commissionAmount) }} ₺</span>
                  </div>
                  <span class="text-micro font-weight-black opacity-50">{{ selectedTransaction.commissionRate ? '%' +
                    selectedTransaction.commissionRate : '' }}</span>
                </div>

                <div class="flow-item d-flex justify-space-between align-center mb-4">
                  <div class="d-flex flex-column">
                    <span class="text-micro opacity-70 font-weight-bold uppercase">DİĞER KESİNTİLER / BORÇ</span>
                    <span class="text-body-1 font-weight-black text-red-lighten-3">{{
                      formatCurrency(selectedTransaction.debt - (selectedTransaction.commissionAmount || 0)) }} ₺</span>
                  </div>
                  <v-icon color="error" size="24">mdi-minus-circle-outline</v-icon>
                </div>

                <v-divider class="my-4 opacity-20"></v-divider>

                <div class="net-result mt-auto">
                  <div class="d-flex flex-column">
                    <div class="d-flex justify-space-between align-center">
                      <span class="text-micro font-weight-black text-indigo-lighten-3 uppercase letter-spacing-1">NET
                        HAKEDİŞ</span>
                      <v-tooltip text="KDV ve tüm kesintiler sonrası net tutar" location="top">
                        <template v-slot:activator="{ props }">
                          <v-icon v-bind="props" size="14" color="indigo-lighten-4">mdi-information-outline</v-icon>
                        </template>
                      </v-tooltip>
                    </div>
                    <span class="text-h4 font-weight-black mt-1">{{ formatCurrency(selectedTransaction.netAmount) }}
                      ₺</span>
                  </div>
                </div>
              </div>
            </v-col>
          </v-row>

          <!-- Alt Kısım: Teknik Detaylar / Meta -->
          <div class="mt-4 px-1">
            <div v-if="getVatFromMeta"
              class="d-flex justify-space-between align-center pa-3 bg-red-lighten-5 rounded-lg border-subtle mb-4">
              <div class="d-flex align-center">
                <v-icon color="error" class="mr-2">mdi-calculator-variant-outline</v-icon>
                <span class="text-caption font-weight-black text-red-darken-4 uppercase">KDV Kesintisi (Meta)</span>
              </div>
              <span class="text-body-2 font-weight-black text-red-darken-4">-{{ formatCurrency(getVatFromMeta) }}
                ₺</span>
            </div>

            <v-expansion-panels flat variant="inset" class="meta-panels">
              <v-expansion-panel class="rounded-xl border-subtle">
                <v-expansion-panel-title class="text-micro font-weight-black text-slate-500 uppercase">
                  <v-icon size="16" class="mr-2">mdi-xml</v-icon> PAZARYERİ HAM VERİSİ (JSON)
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <div class="json-viewer-wrapper pa-2 bg-slate-900 rounded-lg">
                    <pre class="text-micro text-green-lighten-2 overflow-x-auto">{{ JSON.stringify(selectedTransaction.meta
                      || {}, null, 2) }}</pre>
                  </div>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
        </div>
      </div>
    </ActionDialogComponent>

    <!-- Tablo -->
    <div class="table-wrapper mt-1">
      <!-- Masaüstü Tablo -->
      <v-data-table-server v-if="$vuetify.display.mdAndUp" v-model:sort-by="sortBy" :items-length="totalRecords"
        :items="transactions" :loading="loading" :headers="headers" class="pa-0 ma-0 custom-table desktop-table"
        fixed-header @update:sortBy="onSortUpdate">

        <template v-slot:no-data>
          <EmptyState title="Finansal Kayıt Bulunamadı"
            message="Arama kriterlerinize uygun herhangi bir finansal işlem kaydı bulunamadı." />
        </template>

        <!-- Özet Şeridi — Tablonun İçinde, Başlığın Hemen Altında -->
        <template v-slot:top>
          <div class="table-summary-bar">
            <template v-if="summary.loading">
              <v-skeleton-loader v-for="n in 5" :key="n" type="text" width="120" class="mx-1" />
            </template>
            <template v-else>
              <div class="summary-stat">
                <v-icon size="14" color="success" class="mr-1">mdi-cash-multiple</v-icon>
                <span class="summary-label">Toplam Satış</span>
                <span class="summary-value text-success">{{ formatCurrency(summary.totalCredit) }} ₺</span>
              </div>
              <v-divider vertical class="mx-3 summary-divider" />
              <div class="summary-stat">
                <v-icon size="14" color="error" class="mr-1">mdi-percent-outline</v-icon>
                <span class="summary-label">Komisyon</span>
                <span class="summary-value text-error">{{ formatCurrency(summary.totalDebt) }} ₺</span>
              </div>
              <v-divider vertical class="mx-3 summary-divider" />
              <div class="summary-stat">
                <v-icon size="14" color="indigo" class="mr-1">mdi-bank-transfer-in</v-icon>
                <span class="summary-label">Net Hakediş</span>
                <span class="summary-value text-indigo-darken-3 font-weight-black">{{ formatCurrency(summary.netAmount)
                  }} ₺</span>
              </div>
              <v-divider vertical class="mx-3 summary-divider" />
              <div class="summary-stat">
                <v-icon size="14" color="grey" class="mr-1">mdi-truck-delivery-outline</v-icon>
                <span class="summary-label">Kargo</span>
                <span class="summary-value">{{ formatCurrency(summary.totalCargo) }} ₺</span>
              </div>
              <v-divider vertical class="mx-3 summary-divider" />
              <div class="summary-stat">
                <v-icon size="14" color="grey" class="mr-1">mdi-receipt-text-outline</v-icon>
                <span class="summary-label">İşlem</span>
                <span class="summary-value">{{ summary.transactionCount }} adet</span>
              </div>
            </template>
          </div>
        </template>

        <template v-slot:item="{ item }: any">
          <tr :key="item._id" :class="getTransactionRowClass(item)">
            <td class="text-left py-2">
              <div class="d-flex align-center">
                <PlatformImageComponent :integrationCode="item.integrationCode" :width="60" :height="30" class="mr-3" />
                <div class="d-flex flex-column">
                  <span class="font-weight-black text-body-2 text-indigo-darken-3">ID: {{ item.externalId }}</span>
                  <span class="text-micro font-weight-bold text-grey-darken-3">Sipariş: {{ item.orderNumber || 'Manuel'
                  }}</span>
                </div>
              </div>
            </td>

            <td class="text-left">
              <div class="d-flex flex-column">
                <v-tooltip :text="item.platformType" location="top">
                  <template v-slot:activator="{ props }">
                    <v-chip v-bind="props" size="x-small" variant="flat" :color="getTypeColor(item.transactionType)"
                      class="font-weight-black text-white px-2 align-self-start mb-1">
                      {{ translateTransactionType(item.transactionType) }}
                    </v-chip>
                  </template>
                </v-tooltip>
              </div>
            </td>

            <td class="text-right py-2">
              <div class="d-flex flex-column align-end">
                <span :class="item.credit > 0 ? 'text-success font-weight-black' : 'text-grey-lighten-1'"
                  style="font-size: 14px;">
                  {{ item.credit > 0 ? '+' : '' }}{{ formatCurrency(item.credit) }}
                </span>
                <span :class="item.debt > 0 ? 'text-error font-weight-black' : 'text-grey-lighten-1'"
                  style="font-size: 14px;">
                  {{ item.debt > 0 ? '-' : '' }}{{ formatCurrency(item.debt) }}
                </span>
              </div>
            </td>

            <td class="text-right">
              <span class="font-weight-black text-slate-900">{{ formatCurrency(item.netAmount) }}</span>
            </td>

            <td class="text-left py-3">
              <div class="d-flex flex-column">
                <span class="text-grey-darken-4 font-weight-black">{{ formatDate(item.transactionDate) }}</span>
                <span v-if="item.payoutDate" class="text-micro text-indigo font-weight-bold uppercase">
                  Vade: {{ formatDate(item.payoutDate) }}
                </span>
              </div>
            </td>

            <td class="text-right">
              <div class="d-flex justify-end pr-1">
                <v-btn flat size="35" color="white" class="premium-cube-btn border-subtle" @click="openDetail(item)">
                  <v-icon size="large" color="passiveColor">mdi-eye</v-icon>
                </v-btn>
              </div>
            </td>
          </tr>
        </template>

        <template v-slot:bottom>
          <PaginationComponent :totalNumberOfPages="pagination.totalPages" :pagination="pagination"
            @setPage="handlePageChange" v-model="pagination.page" style="position:relative;border-top:1px solid #ddd" />
        </template>
      </v-data-table-server>

      <!-- Mobil Liste -->
      <div v-else class="mobile-financial-list d-flex flex-column h-100">

        <!-- Mobil Özet Şeridi -->
        <div class="mobile-summary-bar">
          <template v-if="summary.loading">
            <v-skeleton-loader type="text" width="100%" />
          </template>
          <template v-else>
            <div class="mobile-summary-item">
              <span class="mobile-summary-label">Satış</span>
              <span class="mobile-summary-value text-success">{{ formatCurrency(summary.totalCredit) }} ₺</span>
            </div>
            <div class="mobile-summary-divider" />
            <div class="mobile-summary-item">
              <span class="mobile-summary-label">Komisyon</span>
              <span class="mobile-summary-value text-error">{{ formatCurrency(summary.totalDebt) }} ₺</span>
            </div>
            <div class="mobile-summary-divider" />
            <div class="mobile-summary-item">
              <span class="mobile-summary-label">Net</span>
              <span class="mobile-summary-value text-indigo font-weight-black">{{ formatCurrency(summary.netAmount) }}
                ₺</span>
            </div>
            <div class="mobile-summary-divider" />
            <div class="mobile-summary-item">
              <span class="mobile-summary-label">İşlem</span>
              <span class="mobile-summary-value">{{ summary.transactionCount }}</span>
            </div>
          </template>
        </div>

        <div
          class="mobile-sort-bar d-flex align-center justify-space-between px-3 py-2 bg-white border-bottom-subtle shadow-sm">
          <div class="d-flex align-center">
            <v-icon size="18" color="passiveColor" class="mr-2">mdi-sort-variant</v-icon>
            <span class="text-micro font-weight-black color-slate-500 uppercase">Sıralama</span>
          </div>
          <div style="width: 170px;">
            <v-select v-model="mobileSortValue" :items="mobileSortOptions" item-title="title" item-value="value"
              variant="outlined" density="compact" hide-details class="customTextField sort-select-mobile"
              @update:model-value="onMobileSortChange">
              <template v-slot:selection="{ item }">
                <span class="text-micro font-weight-bold color-slate-700 uppercase">{{ item.title }}</span>
              </template>
            </v-select>
          </div>
        </div>

        <div class="pa-2 overflow-y-auto flex-grow-1 bg-slate-50 d-flex flex-column"
          style="padding-bottom: 90px !important;">
          <div v-if="loading" class="pa-2">
            <v-skeleton-loader v-for="n in 4" :key="n" type="list-item-avatar-three-line" class="mb-3 rounded-lg" />
          </div>

          <template v-else>
            <EmptyState v-if="!transactions?.length" title="Finansal Kayıt Bulunamadı"
              message="Arama kriterlerinize uygun herhangi bir finansal işlem kaydı bulunamadı." />
            <v-card v-for="item in transactions" :key="item._id" class="mobile-financial-card mb-4" elevation="1"
              rounded="xl">
              <div class="d-flex align-center justify-space-between pa-3 border-bottom-dashed">
                <PlatformImageComponent :integrationCode="item.integrationCode" :width="55" :height="25" />
                <v-chip size="x-small" variant="flat" :color="getTypeColor(item.transactionType)"
                  class="font-weight-black text-white px-3">
                  {{ translateTransactionType(item.transactionType) }}
                </v-chip>
              </div>
              <div class="pa-3">
                <div class="d-flex justify-space-between mb-2">
                  <div class="d-flex flex-column">
                    <span class="text-caption font-weight-black text-indigo-darken-3">
                      {{ item.orderNumber || 'İşlem No: ' + item.externalId }}
                    </span>
                    <span class="text-micro font-weight-bold color-slate-500">{{ item.platformType }}</span>
                  </div>
                  <div class="d-flex flex-column align-end">
                    <span class="text-body-2 font-weight-black"
                      :class="item.netAmount >= 0 ? 'text-success' : 'text-error'">
                      {{ formatCurrency(item.netAmount) }} TRY
                    </span>
                    <span class="text-micro font-weight-bold color-slate-400">
                      <v-icon size="12" class="mr-1">mdi-clock-outline</v-icon>{{ formatDate(item.transactionDate) }}
                    </span>
                  </div>
                </div>

                <div class="bg-white pa-2 rounded-lg border-subtle mb-1">
                  <div class="d-flex justify-space-between">
                    <span class="text-micro font-weight-bold color-slate-500">Gelir</span>
                    <span class="text-micro font-weight-black text-success">+{{ formatCurrency(item.credit) }}</span>
                  </div>
                  <div class="d-flex justify-space-between mt-1">
                    <span class="text-micro font-weight-bold color-slate-500">Gider</span>
                    <span class="text-micro font-weight-black text-error">-{{ formatCurrency(item.debt) }}</span>
                  </div>
                </div>
              </div>
            </v-card>
          </template>
        </div>

        <div class="mobile-pagination-wrapper pa-2 bg-white border-top-subtle shadow-lg">
          <PaginationComponent :totalNumberOfPages="pagination.totalPages" :pagination="pagination"
            @setPage="handlePageChange" v-model="pagination.page" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useIntegrationStore } from '@/stores/integrationStore';
import useRestApi from '@/composables/restapi';

// Components
import LoadingComponent from '@/components/LoadingComponent.vue';
import PaginationComponent from '@/components/PaginationComponent.vue';
import PlatformImageComponent from '@/components/platforms/PlatformImageComponent.vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import EmptyState from '@/components/layout/EmptyState.vue';

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

// Renk ve CSS Yardımcıları
const getTypeColor = (type: string) => {
  const colors: any = {
    'SALE': 'success',
    'RETURN': 'warning',
    'PAYOUT': 'indigo',
    'DEDUCTION': 'error',
    'COMMISSION': 'orange',
    'CARGO': 'slate-600'
  };
  return colors[type] || 'passiveColor';
};

const getTransactionRowClass = (item: any) => {
  return '';
};

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
  overflow: hidden;
  background-color: #f5f7f9;
}

/* Masaüstü Tablo Özet Şeridi */
.table-summary-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px 16px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.summary-stat {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.summary-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  margin-right: 4px;
}

.summary-value {
  font-size: 12px;
  font-weight: 700;
  color: #1e293b;
}

.summary-divider {
  opacity: 0.25;
  height: 20px !important;
  align-self: center;
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
  background: white !important;
}

/* Mobil Özet Şeridi */
.mobile-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 8px 12px;
  background: #ffffff;
  border-bottom: 1px solid #e2e8f0;
  flex-shrink: 0;
}

.mobile-summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.mobile-summary-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.mobile-summary-value {
  font-size: 11px;
  font-weight: 800;
  color: #1e293b;
}

.mobile-summary-divider {
  width: 1px;
  height: 28px;
  background: #e2e8f0;
}

/* Mobil Sıralama Barı */
.mobile-sort-bar {
  z-index: 10;
  position: sticky;
  top: 0;
}

.sort-select-mobile :deep(.v-field__input) {
  padding-top: 4px !important;
  min-height: 32px !important;
}

.mobile-pagination-wrapper {
  position: fixed;
  bottom: 0;
  left: 0;
  width: 100%;
  z-index: 99;
  background: white;
}

/* Kart Tasarımı */
.mobile-financial-card {
  border: 1px solid #eef2f6 !important;
  transition: transform 0.2s ease;
}

.mobile-financial-card:active {
  transform: scale(0.98);
  background-color: #f8fafc;
}

.border-bottom-dashed {
  border-bottom: 1px dashed #e2e8f0;
}

.border-subtle {
  border: 1px solid #f1f5f9;
}

.bg-slate-50 {
  background-color: #f8fafc;
}

:deep(.v-data-table-footer) {
  display: none !important;
}


/* Premium Detail Dialog Styles */
.premium-detail-container {
  overflow: hidden;
  border-radius: 24px;
}

.detail-header-strip {
  border-bottom: 1px solid #e2e8f0;
}

.platform-logo-wrapper {
  background: transparent;
  padding: 4px 8px;
  border-radius: 12px;
  border: 1px solid #f1f5f9;
}

.premium-card {
  border: 1px solid #e2e8f0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 9px;
  font-weight: 800;
  color: #94a3b8;
  letter-spacing: 0.05em;
}

.info-value {
  font-size: 13px;
  color: #334155;
  font-weight: 600;
}

.money-flow-card {
  box-shadow: 0 10px 25px -5px rgba(49, 46, 129, 0.3);
}

.letter-spacing-1 {
  letter-spacing: 0.1em;
}

.line-height-1 {
  line-height: 1.2;
}

.line-height-relaxed {
  line-height: 1.6;
}

.italic {
  font-style: italic;
}

.border-dashed {
  border-style: dashed !important;
}

.meta-panels :deep(.v-expansion-panel-title) {
  min-height: 48px !important;
  background-color: #f8fafc !important;
}

.json-viewer-wrapper {
  max-height: 300px;
  overflow-y: auto;
}

.json-viewer-wrapper pre {
  font-family: 'Fira Code', 'Courier New', Courier, monospace;
  line-height: 1.5;
}

@media (max-width: 600px) {
  .info-grid {
    grid-template-columns: 1fr;
  }

  .detail-header-strip {
    flex-direction: column;
    align-items: flex-start !important;
    gap: 12px;
  }

  .detail-header-strip .d-flex.flex-column.align-end {
    align-items: flex-start !important;
  }
}
</style>