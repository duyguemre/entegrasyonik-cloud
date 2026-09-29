<template>
  <div class="exportLogList d-flex flex-column">
    <ActionDialogComponent v-model="reportInfo.isOpen" title="Pazaryeri Gönderim Detaylı Raporu"
      subtitle="İşlem Günlüğü ve Akış Analizi" icon="mdi-rocket-launch" color="primary" maxWidth="1200"
      :showFooter="false" attach=".exportLogList">
      <keep-alive>
        <DetailedExportLogReport :jobId="reportInfo.jobId || ''" @close="reportInfo.isOpen = false" />
      </keep-alive>
    </ActionDialogComponent>

    <ConfirmationDialogComponent v-model="confirmationDelete.isDialogOpen"
      :title="confirmationDelete.mode === 'single' ? 'KAYIT SİLİNECEK' : 'SEÇİLENLER SİLİNECEK'"
      :message="confirmationDelete.mode === 'single' ? 'Bu işlem kaydını silmek istediğinizden emin misiniz?' : `${validSelectedJobsCount} adet kayıt silinecek. Emin misiniz?`"
      icon="mdi-delete-alert-outline" color="error" confirmText="SİL" cancelText="İPTAL" attach=".exportLogList"
      @confirm="confirmDelete()" @cancel="cancelDelete()" />

    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <div class="d-flex pa-2 pt-2 pb-0 mt-1 mb-1 align-start flex-wrap search-section">
      <v-text-field clearable density="compact" label="Ürün Adı, Barkod, Stok Kodu veya Platform Ara" variant="outlined"
        v-model="searchJobId" bg-color="textfieldColor" class="customTextField flex-grow-1" hide-details
        @keyup.enter.stop="getJobs(true)" @click:clear="searchJobId = ''; getJobs(true)">
        <template #append-inner>
          <v-tooltip open-delay="1000" :text="$t('products.product.search')">
            <template v-slot:activator="{ props: tooltipProps }">
              <v-btn flat size="40" v-bind="{ ...tooltipProps }" class="pa-2 ek-log-btn" elevation="0"
                color="white" @click.stop="getJobs(true)"
                aria-label="Gönderim kayıtlarında ara"><v-icon size="x-large"
                  color="processButtonColor">mdi-magnify</v-icon></v-btn>
            </template>
          </v-tooltip>
        </template>
      </v-text-field>

      <div class="d-flex align-start flex-wrap ek-log-gap-2">
        <v-menu v-model="startDateMenuInline" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedStartDate" label="Başlangıç" variant="outlined" density="compact"
              bg-color="white" prepend-inner-icon="mdi-calendar-start" hide-details readonly clearable
              @click:clear="searchExportLogForm.data.startDate = undefined" v-bind="props" class="customTextField ek-log-date-field"></v-text-field>
          </template>
          <v-card class="rounded-lg">
            <!-- GİZLİ DAVRANIŞ (BACKLOG.md, ADR-0011 Karar 5): `loginColor` hiçbir
                 temada tanımlı bir Vuetify anahtarı DEĞİL; tarih seçici zemini
                 bugün de "unset" kalıyor. Davranış BİLİNÇLİ OLARAK korunuyor —
                 `--ek-color-login-color` de kasıtlı olarak tanımsız bırakıldı
                 (legacy.ts'e eklenmedi, OrderListView/ClaimListView/... ile AYNI karar). -->
            <v-date-picker v-model="searchExportLogForm.data.startDate" :max="searchExportLogForm.data.endDate"
              hide-header locale="tr" color="passiveColor" @update:model-value="startDateMenuInline = false" show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>

        <v-menu v-model="endDateMenuInline" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedEndDate" label="Bitiş" variant="outlined" density="compact"
              bg-color="white" prepend-inner-icon="mdi-calendar-end" hide-details readonly clearable
              @click:clear="searchExportLogForm.data.endDate = undefined" v-bind="props" class="customTextField ek-log-date-field"></v-text-field>
          </template>
          <v-card class="rounded-lg">
            <v-date-picker v-model="searchExportLogForm.data.endDate" :min="searchExportLogForm.data.startDate"
              hide-header locale="tr" color="passiveColor"
              @update:model-value="endDateMenuInline = false" show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>

        <v-tooltip open-delay="4000" text="Gelişmiş arama ve filtreleme seçenekleri">
          <template v-slot:activator="{ props: tooltipProps }">
            <v-btn v-bind="tooltipProps" size="40" color="white" flat class="premium-cube-btn ek-log-btn" @click="searchExportLogForm.form.menu = true"
              aria-label="Gelişmiş arama ve filtreleme seçenekleri">
              <v-icon size="x-large" color="passiveColor">mdi-filter-variant</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <ActionDialogComponent v-model="searchExportLogForm.form.menu" title="Gelişmiş Sorgulama Paneli"
          subtitle="Filtreleme ve Arama Seçenekleri" icon="mdi-layers-search" color="passiveColor"
          confirmText="SONUÇLARI GÖSTER" cancelText="TEMİZLE" maxWidth="750px" :attach="dialogAttach"
          @confirm="advancedSearchJobs(true)" @cancel="resetSearchExportLogForm()">
          <v-form v-model="searchExportLogForm.form.valid" @submit.prevent="advancedSearchJobs(true)">
            <v-row dense>
              <v-col cols="12" class="mb-4">
                <div class="section-title">Tarih & Zaman Bilgileri</div>
                <v-row dense>
                  <v-col cols="12" sm="6">
                    <v-menu v-model="startDateMenuAdvanced" :close-on-content-click="false">
                      <template v-slot:activator="{ props }">
                        <v-text-field :model-value="formattedStartDate" label="Başlangıç Tarihi" variant="outlined"
                          density="compact" bg-color="white" prepend-inner-icon="mdi-calendar-start" hide-details
                          readonly clearable @click:clear="searchExportLogForm.data.startDate = undefined"
                          v-bind="props" class="customTextField"></v-text-field>
                      </template>
                      <v-card class="rounded-lg">
                        <v-date-picker v-model="searchExportLogForm.data.startDate"
                          :max="searchExportLogForm.data.endDate" hide-header locale="tr" color="passiveColor"
                          @update:model-value="startDateMenuAdvanced = false" show-adjacent-months></v-date-picker>
                      </v-card>
                    </v-menu>
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-menu v-model="endDateMenuAdvanced" :close-on-content-click="false">
                      <template v-slot:activator="{ props }">
                        <v-text-field :model-value="formattedEndDate" label="Bitiş Tarihi" variant="outlined"
                          density="compact" bg-color="white" prepend-inner-icon="mdi-calendar-end" hide-details readonly
                          clearable @click:clear="searchExportLogForm.data.endDate = undefined" v-bind="props"
                          class="customTextField"></v-text-field>
                      </template>
                      <v-card class="rounded-lg">
                        <v-date-picker v-model="searchExportLogForm.data.endDate"
                          :min="searchExportLogForm.data.startDate" hide-header locale="tr" color="passiveColor"
                          @update:model-value="endDateMenuAdvanced = false" show-adjacent-months></v-date-picker>
                      </v-card>
                    </v-menu>
                  </v-col>
                </v-row>
              </v-col>

              <v-col cols="12" class="mb-4">
                <div class="section-title">Ürün & Kimlik Bilgileri</div>
                <v-row dense>
                  <v-col cols="12">
                    <v-text-field v-model="searchExportLogForm.data.title" label="Ürün Adı" variant="outlined"
                      density="compact" bg-color="white" prepend-inner-icon="mdi-format-title" hide-details
                      class="mb-2 customTextField"></v-text-field>
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-text-field v-model="searchExportLogForm.data.barcode" label="Barkod" variant="outlined"
                      density="compact" bg-color="white" prepend-inner-icon="mdi-barcode-scan" hide-details
                      class="customTextField"></v-text-field>
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-text-field v-model="searchExportLogForm.data.stockcode" label="Stok Kodu" variant="outlined"
                      density="compact" bg-color="white" prepend-inner-icon="mdi-identifier" hide-details
                      class="customTextField"></v-text-field>
                  </v-col>

                  <v-col cols="12" sm="6" v-for="(choice, index) in choicesStore.choices" :key="index">
                    <v-select v-model="searchExportLogForm.data.selectedChoices[choice._id || index]"
                      :items="choice.values || choice.options" item-title="title" item-value="_id" :label="choice.title"
                      variant="outlined" density="compact" bg-color="grey-lighten-5"
                      prepend-inner-icon="mdi-vector-selection" hide-details clearable
                      class="mt-2 customTextField"></v-select>
                  </v-col>
                </v-row>
              </v-col>

              <v-col cols="12" class="mb-4">
                <div class="section-title">Sınıflandırma & Kategori</div>
                <v-row dense>
                  <v-col cols="12" sm="6">
                    <CategorySelectBoxComponent v-model="searchExportLogForm.data.category" :withAll="false" noInit />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <BrandSelectBoxComponent v-model="searchExportLogForm.data.brand" :withAll="false" noInit />
                  </v-col>
                </v-row>
              </v-col>

              <v-col cols="12">
                <div class="section-title">Platform & İşlem Bilgileri</div>
                <v-row dense>
                  <v-col cols="12" sm="6">
                    <v-select v-model="searchExportLogForm.data.integrationCode"
                      :items="integrationStore.getClientPlatforms()" item-title="title" item-value="code"
                      label="Platform Seçiniz" variant="outlined" density="compact" prepend-inner-icon="mdi-storefront"
                      hide-details clearable multiple chips class="customTextField"></v-select>
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-select v-model="searchExportLogForm.data.mode" :items="processMenuItems" label="İşlem Tipi"
                      item-value="id" variant="outlined" density="compact" prepend-inner-icon="mdi-swap-horizontal"
                      hide-details clearable class="customTextField"></v-select>
                  </v-col>

                  <v-col cols="12" class="mt-3">
                    <div class="text-caption font-weight-medium mb-2 ek-muted">İşlem Durumları</div>
                    <v-select v-model="searchExportLogForm.data.statuses" :items="statusOptions" item-title="title"
                      item-value="id" label="Durum Seçiniz" variant="outlined" density="compact"
                      prepend-inner-icon="mdi-list-status" hide-details clearable multiple chips
                      bg-color="grey-lighten-5" class="customTextField"></v-select>
                  </v-col>
                </v-row>
              </v-col>
            </v-row>
          </v-form>
        </ActionDialogComponent>

        <v-tooltip open-delay="1000" text="Yenile">
          <template v-slot:activator="{ props: tooltipProps }">
            <v-btn-group v-bind="{ ...tooltipProps }" elevation="0">
              <v-btn @click="handlePageChange()" size="40" color="white" class="premium-cube-btn ek-log-btn" aria-label="Listeyi yenile">
                <v-icon size="x-large" color="processButtonColor">mdi-refresh</v-icon>
              </v-btn>
            </v-btn-group>
          </template>
        </v-tooltip>


        <v-tooltip v-if="validSelectedJobsCount > 0" open-delay="1000" text="Seçili Ürünleri Silmek İçin Tıklayınız">
          <template v-slot:activator="{ props: tooltipProps }">
            <v-badge :content="validSelectedJobsCount" color="error" overlap>
              <v-btn @click="openDeleteConfirm($event, 'batch')" size="40" class="premium-cube-btn ek-log-self-start" flat color="danger" aria-label="Seçili kayıtları sil">
                <v-icon size="x-large" color="white">mdi-delete</v-icon>
              </v-btn>
            </v-badge>
          </template>
        </v-tooltip>



        <div v-if="$vuetify.display.smAndDown" class="w-100 mt-2">
          <v-select v-model="sortBy[0]" :items="[
            { title: 'Zaman: En Yeni', value: { key: 'createdAt', order: 'desc' } },
            { title: 'Zaman: En Eski', value: { key: 'createdAt', order: 'asc' } },
            { title: 'Fiyat: Artan', value: { key: 'price', order: 'asc' } },
            { title: 'Fiyat: Azalan', value: { key: 'price', order: 'desc' } },
            { title: 'Ürün Adı: A-Z', value: { key: 'title', order: 'asc' } },
            { title: 'Ürün Adı: Z-A', value: { key: 'title', order: 'desc' } }
          ]" item-title="title" item-value="value" label="İşlem Sıralama" variant="outlined" density="compact"
            hide-details class="customTextField" prepend-inner-icon="mdi-sort-variant"
            @update:model-value="handlePageChange()">
          </v-select>
        </div>
      </div>
    </div>

    <div class="table-wrapper">
      <!-- ek-pattern-exception: EkDataTable — sunucu tarafı sıralama (v-data-table-server @update:sortBy) + gizli limit 13 davranışı logs-characterization.spec.ts ile sabit; EkDataTable sütun sıralamayı desteklemiyor — hedef: Aşama C (EkDataTable sıralama desteği) --><v-data-table-server v-if="$vuetify.display.mdAndUp" v-model="selectedJobs" v-model:sort-by="sortBy"
        item-value="_id" :loading="loading" :itemsLength="pagination.totalNumberOfRecords" :items="jobs" fixed-header
        :headers="headers" class="pa-0 ma-0 custom-table desktop-table" show-select @update:sortBy="onSortUpdate"
        aria-label="Gönderim işlemleri tablosu">

        <!-- Boş durum: hata ile "gerçekten kayıt yok" AYNI karta düşer (gizli davranış,
             logs.spec.ts / BACKLOG.md — bilinçli korunuyor). -->
        <template v-slot:no-data>
          <EkEmptyState variant="no-results" title="Gönderim Kaydı Bulunamadı" message="Arama kriterlerinize uygun herhangi bir gönderim kaydı bulunamadı." />
        </template>

        <template v-slot:item="{ item }: any">
          <tr>
            <td><v-checkbox-btn :model-value="isJobSelected(item)" color="primary"
                @update:model-value="val => onJobSelectionUpdate(item, !!val)" density="compact"
                aria-label="Gönderim kaydını seç"></v-checkbox-btn></td>

            <td class="text-left py-2">
              <div class="d-flex align-center">
                <v-avatar rounded size="56" color="surface-muted" class="mr-3 ek-log-avatar">
                  <v-img :src="item.image" cover>
                    <template v-slot:placeholder><v-icon color="content-subtle"
                        size="56">mdi-image-outline</v-icon></template>
                  </v-img>
                </v-avatar>
                <div class="d-flex flex-column ek-log-product">
                  <span class="font-weight-medium text-truncate text-body-2">{{ item.title }}</span>
                  <div class="d-flex align-center mt-1 text-caption ek-muted flex-wrap ek-log-gap-2">
                    <span class="d-flex align-center"><v-icon size="12" class="mr-1">mdi-barcode</v-icon>{{ item.barcode
                    }}</span>
                    <span class="d-flex align-center" v-if="item.stockcode != undefined">
                      <v-icon size="12" class="mr-1">mdi-identifier</v-icon>{{ item.stockcode }}
                    </span>
                    <div class="d-flex flex-wrap ek-log-gap-1" v-if="item.choices && item.choices.length > 0">
                      <span v-for="choice in item.choices" :key="choice._id" class="ek-log-choice">
                        <span class="ek-muted mr-1">{{ choice.choiceTitle }}</span>
                        <span class="font-weight-medium">{{ choice.choiceValueTitle }}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </td>

            <td class="text-right py-2 ek-log-price-col">
              <div class="d-flex flex-column align-end ek-log-gap-2">
                <span v-if="item.price" class="ek-log-price ek-num">{{ formatMoney(item.price) }}</span>
                <EkStatusChip v-if="item.stock != undefined" tone="success" :label="`${formatNumber(item.stock)} STOK`" />
              </div>
            </td>

            <td class="text-center">
              <div class="d-flex align-center justify-center">
                <PlatformImageComponent :integrationCode="item.integrationCode" :width="52" :height="26" class="mr-1">
                </PlatformImageComponent>
                <div class="d-flex align-center ek-log-gap-2">
                  <span class="ek-log-mode">{{ PLATFORM_PROCESS_LABELS[item.mode as PLATFORM_PROCESS] }}</span>
                  <EkStatusChip :tone="statusTone(item.status)" :label="translateStatus(item.status)"
                    :dot="!isDeletable(item)" />
                </div>
              </div>
            </td>

            <td class="text-left py-3 ek-log-time-col">
              <div class="d-flex flex-column ek-log-gap-2">
                <div class="d-flex flex-column">
                  <span class="ek-log-time-label">Başlangıç</span>
                  <span class="text-caption ek-num">{{ formatDateTime(item.createdAt) }}</span>
                </div>
                <div class="d-flex flex-column">
                  <span class="ek-log-time-label">Bitiş</span>
                  <span class="text-caption ek-num">{{ item.completedAt ? formatDateTime(item.completedAt) : 'Devam Ediyor...' }}</span>
                </div>
              </div>
            </td>

            <td>
              <div class="d-flex justify-end pr-1">
                <v-btn flat size="35" color="white" variant="flat" @click="openDetailedReport(item)"
                  class="mr-2 premium-cube-btn" aria-label="Gönderim detaylarını görüntüle"><v-icon size="x-large"
                    color="passiveColor">mdi-eye-outline</v-icon></v-btn>
                <v-btn flat size="35" color="danger" variant="flat" :disabled="!isDeletable(item)"
                  class="premium-cube-btn" @click="openDeleteConfirm($event, 'single', item)"
                  aria-label="Gönderim kaydını sil"><v-icon
                    size="x-large">mdi-delete</v-icon></v-btn>
              </div>
            </td>
          </tr>
        </template>

        <template v-slot:bottom>
          <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
            @setPage="handlePageChange" v-model="pagination.page" class="ek-log-pagination" />
        </template>
      </v-data-table-server>

      <div v-else class="mobile-container pa-2 overflow-y-auto">
        <EkEmptyState v-if="!jobs.length" variant="no-results" title="Gönderim Kaydı Bulunamadı" message="Arama kriterlerinize uygun herhangi bir gönderim kaydı bulunamadı." />
        <v-card v-for="item in jobs" :key="item._id" class="mb-4 rounded-lg border" elevation="0">
          <div class="pa-3 ek-log-card-head d-flex align-center justify-space-between">
            <v-checkbox-btn :model-value="isJobSelected(item)" color="primary"
              @update:model-value="val => onJobSelectionUpdate(item, !!val)" density="compact"
              class="mr-n2" aria-label="Gönderim kaydını seç"></v-checkbox-btn>

            <div class="d-flex align-center justify-center">
              <PlatformImageComponent :integrationCode="item.integrationCode" :width="52" :height="26" class="mr-1">
              </PlatformImageComponent>
              <div class="d-flex align-center ek-log-gap-2">
                <span class="ek-log-mode">{{ PLATFORM_PROCESS_LABELS[item.mode as PLATFORM_PROCESS] }}</span>
                <EkStatusChip :tone="statusTone(item.status)" :label="translateStatus(item.status)"
                  :dot="!isDeletable(item)" />
              </div>
            </div>
          </div>

          <v-card-text class="pa-3">
            <div class="d-flex align-start mb-4">
              <v-avatar rounded size="120" color="surface-muted" class="mr-3 ek-log-avatar flex-shrink-0">
                <v-img :src="item.image" cover />
              </v-avatar>

              <div class="d-flex flex-column overflow-hidden">
                <div class="font-weight-medium text-body-2 mb-1 text-truncate">{{ item.title }}</div>

                <div class="d-flex flex-column ek-muted">
                  <div class="text-caption d-flex align-center">
                    <v-icon size="12" class="mr-1">mdi-barcode</v-icon> {{ item.barcode }}
                  </div>
                  <div v-if="item.stockcode != undefined" class="text-caption d-flex align-center">
                    <v-icon size="12" class="mr-1">mdi-identifier</v-icon> {{ item.stockcode }}
                  </div>
                </div>

                <div class="d-flex flex-wrap mt-2 ek-log-gap-1" v-if="item.choices && item.choices.length > 0">
                  <span v-for="choice in item.choices" :key="choice._id" class="ek-log-choice">
                    <span class="ek-muted mr-1">{{ choice.choiceTitle }}</span>
                    <span class="font-weight-medium">{{ choice.choiceValueTitle }}</span>
                  </span>
                </div>

                <div class="d-flex flex-wrap align-center mt-3 ek-log-gap-2">
                  <span v-if="item.price" class="ek-log-price ek-num">{{ formatMoney(item.price) }}</span>
                  <EkStatusChip v-if="item.stock != undefined" tone="success" :label="`${formatNumber(item.stock)} Adet`" />
                </div>
              </div>
            </div>

            <div class="d-flex justify-space-between mb-3 pa-3 rounded-lg border ek-log-time-card">
              <div class="d-flex align-center">
                <v-icon size="18" color="content-muted" class="mr-2">mdi-clock-start</v-icon>
                <div class="d-flex flex-column">
                  <span class="ek-log-time-label">Başlangıç</span>
                  <span class="text-caption ek-num">{{ formatDateTime(item.createdAt) }}</span>
                </div>
              </div>
              <v-divider vertical class="mx-2"></v-divider>
              <div class="d-flex align-center">
                <div class="d-flex flex-column text-right mr-2">
                  <span class="ek-log-time-label">Bitiş</span>
                  <span class="text-caption ek-num">{{ item.completedAt ? formatDateTime(item.completedAt) : 'Devam...' }}</span>
                </div>
                <v-icon size="18" color="content-muted">mdi-flag-checkered</v-icon>
              </div>
            </div>

            <div class="d-flex justify-end align-center mt-2 pt-2 border-t ek-log-gap-2">
              <v-btn flat size="35" color="passiveColor" variant="outlined" @click="openDetailedReport(item)"
                aria-label="Gönderim detaylarını görüntüle"><v-icon
                  size="x-large">mdi-eye-outline</v-icon></v-btn>
              <v-btn flat size="35" color="danger" variant="flat" :disabled="!isDeletable(item)"
                @click="openDeleteConfirm($event, 'single', item)" aria-label="Gönderim kaydını sil"><v-icon size="x-large">mdi-delete</v-icon></v-btn>
            </div>
          </v-card-text>
        </v-card>
        <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
          @setPage="handlePageChange" v-model="pagination.page" :static="true" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue'
import useRestApi from '@/composables/restapi'
import LoadingComponent from '@/components/LoadingComponent.vue'
import PaginationComponent from '@/components/PaginationComponent.vue'
import DetailedExportLogReport from '@/components/logListView/DetailedExportLogReport.vue'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useChoicesStore } from '@/stores/choicesStore'
import CategorySelectBoxComponent from '@/components/common/CategorySelectBoxComponent.vue'
import BrandSelectBoxComponent from '@/components/common/BrandSelectBoxComponent.vue'
import PlatformImageComponent from '../platforms/PlatformImageComponent.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue'
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/composables/format'
import type { StatusTone } from '@/design/status-map'
import { PLATFORM_PROCESS, PLATFORM_PROCESS_LABELS } from '@/types/PlatformProcess';
const restApi = useRestApi()
const snackbarStore = useSnackbarStore()
const integrationStore = useIntegrationStore()
const choicesStore = useChoicesStore()

const loadingComponentRef: any = ref(null)
const dialogAttach = ref(".exportLogList")
const loading = ref(false)
const jobs = ref<any[]>([])
const selectedJobs = ref<any[]>([])
const searchJobId = ref("")
const sortBy = ref<any[]>([{ key: 'createdAt', order: 'desc' }])

const isAdvancedSearchActive = ref(false);
const startDateMenuInline = ref(false);
const endDateMenuInline = ref(false);
const startDateMenuAdvanced = ref(false);
const endDateMenuAdvanced = ref(false);

const searchExportLogForm = ref({
  data: {
    startDate: undefined as any,
    endDate: undefined as any,
    title: undefined,
    barcode: undefined,
    stockcode: undefined,
    selectedChoices: {} as Record<string, any>,
    category: undefined,
    brand: undefined,
    integrationCode: [] as string[],
    mode: undefined,
    statuses: []
  },
  form: { menu: false, valid: false }
});


const processMenuItems = computed(() => {
  return Object.values(PLATFORM_PROCESS).map(mode => ({
    id: mode,
    title: PLATFORM_PROCESS_LABELS[mode]
  }));
});

const formattedStartDate = computed(() => {
  if (!searchExportLogForm.value.data.startDate) return '';
  return formatDate(searchExportLogForm.value.data.startDate);
});

const formattedEndDate = computed(() => {
  if (!searchExportLogForm.value.data.endDate) return '';
  return formatDate(searchExportLogForm.value.data.endDate);
});

const statusOptions = ref([
  { id: 'QUEUED', title: 'Kuyrukta' },
  { id: 'PREPARING', title: 'Hazırlanıyor' },
  { id: 'PENDING', title: 'Gönderiliyor' },
  { id: 'SENT', title: 'Gönderim Sorgulanıyor' },
  { id: 'WAITING', title: 'Onay Bekleniyor' },
  { id: 'COMPLETED', title: 'Tamamlandı' },
  { id: 'FAILED', title: 'Hata Oluştu' }
]);

const headers: any = [
  { title: 'Ürün Bilgisi', key: 'title', sortable: true, align: 'start', width: '230px' },
  { title: 'Fiyat/Stok', key: 'price', sortable: true, align: 'end', width: '100px' },
  { title: 'İşlem Detayı', key: 'operation', sortable: false, align: 'center', width: '240px' },
  { title: 'Zaman', key: 'createdAt', sortable: true, align: 'start', width: '150px' },
  { title: '', key: 'actions', sortable: false, align: 'end', width: '100px' },
];

const resetSearchExportLogForm = () => {
  searchExportLogForm.value.data = {
    startDate: undefined, endDate: undefined, title: undefined, barcode: undefined,
    stockcode: undefined, selectedChoices: {}, category: undefined, brand: undefined,
    integrationCode: [], mode: undefined, statuses: []
  };
  isAdvancedSearchActive.value = false; searchJobId.value = ""; getJobs(true);
};

const getJobs = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  let guid = loadingComponentRef.value.info("");
  try {
    const payload: any = {
      page: pagination.page, limit: pagination.limit,
      sortBy: sortBy.value[0]?.key, sortOrder: sortBy.value[0]?.order,
      globalSearch: searchJobId.value.trim() || undefined,
      startDate: searchExportLogForm.value.data.startDate,
      endDate: searchExportLogForm.value.data.endDate,
    };
    const res = await restApi.post('IntegrationService/getExportJobs', payload);
    if (res.success) {
      jobs.value = res.data;
      pagination.totalNumberOfPages = res.pagination?.totalNumberOfPages || 1;
      pagination.totalNumberOfRecords = res.pagination?.totalNumberOfRecords || 0;
    }
  } finally { loadingComponentRef.value.remove(guid); loading.value = false; }
};

const advancedSearchJobs = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  isAdvancedSearchActive.value = true;
  searchExportLogForm.value.form.menu = false;
  let guid = loadingComponentRef.value.info("Filtreleniyor...");
  try {
    const payload: any = {
      page: pagination.page, limit: pagination.limit,
      sortBy: sortBy.value[0]?.key, sortOrder: sortBy.value[0]?.order,
      ...searchExportLogForm.value.data
    };
    const res = await restApi.post('IntegrationService/advancedSearchExportJobs', payload);
    if (res.success) {
      jobs.value = res.data;
      pagination.totalNumberOfPages = res.pagination?.totalNumberOfPages || 1;
      pagination.totalNumberOfRecords = res.pagination?.totalNumberOfRecords || 0;
    }
  } finally { loadingComponentRef.value.remove(guid); loading.value = false; }
};

const onSortUpdate = (newSortBy: any) => {
  sortBy.value = newSortBy;
  handlePageChange();
}

const handlePageChange = () => {
  if (isAdvancedSearchActive.value) {
    advancedSearchJobs();
  } else {
    getJobs();
  }
};

const isJobSelected = (item: any) => selectedJobs.value.includes(item._id)
const onJobSelectionUpdate = (item: any, val: boolean) => {
  if (val) selectedJobs.value.push(item._id);
  else selectedJobs.value = selectedJobs.value.filter(id => id !== item._id);
}

const pagination = reactive({ limit: 13, page: 1, totalNumberOfPages: 1, totalNumberOfRecords: 0 });
const reportInfo = reactive({ isOpen: false, jobId: null })
const openDetailedReport = (item: any) => { reportInfo.jobId = item._id; reportInfo.isOpen = true; }

// Durum → EkStatusChip tonu (ADR-0015 Karar 3.3; renk ekranda SEÇİLMEZ). Eski canlı
// palet (hex) kaldırıldı; bilinmeyen/ara durumlar (QUEUED, PREPARING) nötr görünür.
const statusTone = (status: string): StatusTone => {
  const tones: Record<string, StatusTone> = { COMPLETED: 'success', FAILED: 'danger', CANCELLED: 'neutral', PENDING: 'info', SENT: 'info', WAITING: 'warning' };
  return tones[status?.toUpperCase()] || 'neutral';
};

const translateStatus = (status: string) => {
  return statusOptions.value.find(x => x.id === status)?.title || status;

  /*   const translations: any = { PREPARING: 'Hazırlanıyor', PENDING: 'Kuyrukta', SENT: 'İletildi', WAITING: 'Sorgulanıyor', COMPLETED: 'Başarılı', FAILED: 'Hata' };
    return translations[status?.toUpperCase()] || status; */
};


const openDeleteConfirm = (event: any, mode: 'single' | 'batch', item: any = null) => {
  confirmationDelete.mode = mode;
  if (mode === 'single') {
    confirmationDelete.job = item;
  } else {
    confirmationDelete.job = null;
  }

  // Menünün açılacağı konumu belirlemek için activator'ı set ediyoruz
  confirmationDelete.activator = event.currentTarget;
  confirmationDelete.isDialogOpen = true;
};

const isDeletable = (item: any) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(item?.status?.toUpperCase());
const validSelectedJobsCount = computed(() => jobs.value.filter(j => selectedJobs.value.includes(j._id) && isDeletable(j)).length);
const confirmationDelete = reactive<any>({ isDialogOpen: false, activator: undefined, mode: 'single', job: null })
const cancelDelete = () => { confirmationDelete.isDialogOpen = false; }
const confirmDelete = async () => { /* Arşivleme kodu buraya */ }

onMounted(() => getJobs(true));
</script>

<style scoped>
.exportLogList {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--ek-color-surface-muted);
}

.search-section {
  flex-shrink: 0;
  z-index: 10;
  background: transparent;
  max-width: 1000px;
  gap: var(--ek-space-2);
}

/* A11y (WCAG 1.4.3): alan etiketi beyaz zeminde AA eşiğinin altında kalıyordu;
   ADR-0011 `content-muted` (beyazda 4,76:1) ile yükseltildi. Odak durumunda
   Vuetify'ın kendi vurgu rengi korunur. */
.search-section :deep(.v-field:not(.v-field--focused) .v-field-label) {
  color: var(--ek-color-content-muted);
  opacity: 1;
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
  display: flex !important;
  flex-direction: column;
  background-color: var(--ek-color-surface) !important;
}

:deep(.v-table__wrapper) {
  flex-grow: 1 !important;
  overflow-y: auto !important;
  overflow-x: auto !important;
}

.mobile-container {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: var(--ek-color-surface-muted);
  overflow-y: auto;
}

@media (max-width: 600px) {
  .desktop-table {
    display: none !important;
  }
}

.ek-muted {
  color: var(--ek-color-content-muted);
}

.ek-log-gap-1 {
  gap: var(--ek-space-1);
}

.ek-log-gap-2 {
  gap: var(--ek-space-2);
}

.ek-log-self-start {
  align-self: start;
}

.ek-log-btn {
  border: 1px solid var(--ek-color-border-default);
}

.ek-log-date-field {
  min-width: 160px;
  align-self: start;
}

.ek-log-avatar {
  border: 1px solid var(--ek-color-border-default);
}

.ek-log-product {
  max-width: 110px;
}

.ek-log-price-col {
  min-width: 100px;
}

.ek-log-time-col {
  min-width: 130px;
}

.ek-log-choice {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--ek-space-2);
  font-size: var(--ek-font-size-xs);
  background: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-sm);
}

.ek-log-price {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-log-mode {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}

.ek-log-time-label {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.ek-log-card-head {
  background: var(--ek-color-surface);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.ek-log-time-card {
  background: var(--ek-color-surface);
}

.ek-log-pagination {
  position: relative !important;
  flex-shrink: 0;
  border-top: 1px solid var(--ek-color-border-default);
}

.section-title {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  text-transform: uppercase;
  color: var(--ek-color-content-subtle);
  letter-spacing: 1px;
  margin-bottom: var(--ek-space-3);
  display: flex;
  align-items: center;
}

.section-title::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--ek-color-surface-sunken);
  margin-left: var(--ek-space-3);
}
</style>
