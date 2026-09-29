<template>
  <div class="importLogList d-flex flex-column">
    <div id="variant-target-0" v-show="false" style="position:absolute;z-index:-20;left:2000px"></div>

    <ActionDialogComponent v-model="reportInfo.isOpen" title="Ürün Çekim İşlemi Detaylı Raporu"
      subtitle="Analiz ve Aktarım Verileri" icon="mdi-chart-bar" color="primary" maxWidth="1200" :showFooter="false"
      attach=".importLogList">
      <keep-alive>
        <DetailedImportLogReport :jobId="reportInfo.jobId" @close="reportInfo.isOpen = false"
          style="transition: opacity var(--ek-duration-base) var(--ek-easing-standard)!important" />
      </keep-alive>
    </ActionDialogComponent>

    <ConfirmationDialogComponent v-model="confirmationDelete.isDialogOpen"
      :title="confirmationDelete.mode === 'single' ? 'KAYIT SİLİNECEK' : 'SEÇİLİLER SİLİNECEK'"
      :message="confirmationDelete.mode === 'single' ? 'Bu işlem kaydını silmek istediğinizden emin misiniz?' : `${validSelectedJobsCount} adet silinebilir kayıt silinecek. Emin misiniz?`"
      icon="mdi-delete-alert-outline" color="error" confirmText="SİL" cancelText="İPTAL" attach=".importLogList"
      @confirm="confirmDelete()" @cancel="cancelDelete()" />

    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <div class="d-flex pa-2 pt-2 pb-0 mt-1 mb-1 align-start flex-wrap search-section" style="max-width:900px">
      <v-text-field clearable density="compact" label="İşlem No ile Ara" variant="outlined" v-model="searchJobId"
        hide-details bg-color="textfieldColor" class="customTextField" @keyup.enter.stop="getJobs()"
        @click:clear="getJobs(true)">
        <template #append-inner>
          <v-tooltip open-delay="1000" :text="$t('products.product.search')">
            <template v-slot:activator="{ props: tooltipProps }">
              <v-btn flat size="40" v-bind="{ ...tooltipProps }" class="pa-2 " elevation="0"
                style="border:1px solid white" color="white" @click.stop="getJobs()"
                aria-label="Aktarım kayıtlarında ara"><v-icon size="x-large"
                  color="processButtonColor">mdi-magnify</v-icon></v-btn>
            </template>
          </v-tooltip>
        </template>



      </v-text-field>

      <v-tooltip open-delay="1000" text="Yenile">
        <template v-slot:activator="{ props: tooltipProps }">
          <v-btn v-bind="{ ...tooltipProps }" @click="getJobs(true)" size="40" color="white"
            class="premium-cube-btn ml-2" flat aria-label="Listeyi yenile">
            <v-icon size="x-large" color="processButtonColor">mdi-refresh</v-icon>
          </v-btn>
        </template>
      </v-tooltip>

      <div v-if="$vuetify.display.smAndDown && validSelectedJobsCount > 0" class="">
        <v-badge :content="validSelectedJobsCount" :model-value="validSelectedJobsCount > 0" color="error" overlap
          offset-x="3" offset-y="3">
          <v-btn @click="openDeleteConfirm($event, 'batch')" size="40" color="danger" class="premium-cube-btn"
            aria-label="Seçili kayıtları sil">
            <v-icon size="x-large" color="white">mdi-delete</v-icon>
          </v-btn>
        </v-badge>
      </div>

      <div v-if="$vuetify.display.smAndDown" class="w-100 mt-0 mb-0 pa-0">
        <v-select v-model="mobileSortSelection" :items="sortOptions" item-title="title" item-value="value"
          label="Sıralama Kriteri" variant="outlined" density="compact" hide-details bg-color="textfieldColor"
          class="customTextField" :menu-props="{ contentClass: 'mobile-sort-menu' }"
          @update:model-value="onMobileSortUpdate" prepend-inner-icon="mdi-sort-variant">
          <template v-slot:item="{ props, item }">
            <v-list-item v-bind="props" class="custom-menu-item">
              <template v-slot:title>
                <div class="compact-title">{{ item.title }}</div>
              </template>
            </v-list-item>
          </template>
        </v-select>
      </div>
    </div>

    <div class="table-wrapper">
      <v-data-table-server v-if="$vuetify.display.mdAndUp" v-model="selectedJobs" v-model:sort-by="sortBy"
        item-value="_id" :loading="loading" :itemsLength="pagination.totalNumberOfRecords" :items="jobs" fixed-header
        :headers="headers" class="pa-0 ma-0 custom-table desktop-table" show-select @update:sortBy="onSortUpdate"
        aria-label="Aktarım işlemleri tablosu">

        <!-- ADR-0011 Karar 2 KAPSAM ("eksik boş/hata/yükleniyor durumlarını tamamla") —
             bu slot YOKTU (ExportLogList/InvoiceListView ile AYNI eksiklik/AYNI tamamlama,
             T4f/T4g). İş mantığı DEĞİŞMEDİ, yalnızca eksik görsel durum eklendi. -->
        <template v-slot:no-data>
          <EmptyState title="Aktarım Kaydı Bulunamadı" message="Arama kriterlerinize uygun herhangi bir aktarım kaydı bulunamadı." />
        </template>

        <template v-slot:item="{ item }: any">
          <tr>
            <td><v-checkbox-btn :model-value="isJobSelected(item)"
                @update:model-value="val => onJobSelectionUpdate(item, !!val)" density="compact"
                aria-label="Aktarım kaydını seç"></v-checkbox-btn></td>
            <td class="text-center"><span class="text-caption" v-html="formatDate(item.startedAt)"></span></td>
            <td class="text-center"><span class="text-caption"
                v-html="item.completedAt ? formatDate(item.completedAt) : '-'"></span></td>
            <td class="text-center">


              <PlatformImageComponent :integrationCode="item.integrationCode" :width="80" :height="35" class="mr-4">
              </PlatformImageComponent>

              <!--               <v-chip size="x-small" :color="getPlatformColor(item.integrationCode)" variant="flat"
                class="text-white font-weight-bold" @click="copyToClipboard(item.jobId)">
                {{ item.integrationCode?.toUpperCase() }}
              </v-chip> -->
            </td>
            <td class="text-center">
              <v-chip size="x-small" :color="getStatusColor(item.status)" variant="tonal" style="border:1px solid #ddd"
                class="font-weight-bold">
                {{ translateStatus(item.status) }}
              </v-chip>
            </td>

            <td class="text-center">
              <div class="d-flex flex-column align-center justify-center pa-1">
                <div class="d-flex align-center mb-1" style="gap: var(--ek-space-1);">
                  <v-icon size="12" color="passiveColor">mdi-package-variant</v-icon>
                  <span class="text-caption font-weight-bold text-passiveColor" style="font-size: 11px!important;">
                    {{ item.totalCount || 0 }}
                  </span>
                </div>
                <div class="d-flex align-center px-2 py-0 rounded bg-success-lighten-5 border-success"
                  style="gap: var(--ek-space-1); background-color: #f1f8e9; border: 1px solid #c5e1a5; border-radius: var(--ek-radius-sm)!important;">
                  <v-icon size="10" color="success">mdi-check-all</v-icon>
                  <span class="text-caption font-weight-black text-success" style="font-size: 11px!important;">
                    {{ item.processedCount || 0 }}
                  </span>
                </div>
              </div>
            </td>

            <td class="text-center pa-4">
              <div class="d-flex align-center justify-center">
                <div class="data-group-capsule d-flex align-center px-2 py-1 rounded-pill border shadow-sm">
                  <v-tooltip text="Aktarılmaya aday ürünler" location="top">
                    <template v-slot:activator="{ props }">
                      <div v-bind="props" class="stat-item d-flex align-center px-2">
                        <v-icon size="14" color="success" class="mr-1">mdi-check-circle-outline</v-icon>
                        <span class="stat-value text-success font-weight-black">{{ item.validCount || 0 }}</span>
                      </div>
                    </template>
                  </v-tooltip>
                  <v-divider vertical class="mx-1" length="12"></v-divider>
                  <v-tooltip text="Formatı hatalı ürünler" location="top">
                    <template v-slot:activator="{ props }">
                      <div v-bind="props" class="stat-item d-flex align-center px-2">
                        <v-icon size="14" color="orange-darken-1" class="mr-1">mdi-alert-outline</v-icon>
                        <span class="stat-value text-orange-darken-2 font-weight-black">{{ item.invalidCount || 0
                        }}</span>
                      </div>
                    </template>
                  </v-tooltip>
                  <v-divider vertical class="mx-1" length="12"></v-divider>
                  <v-tooltip text="Sistemde zaten mevcut olanlar" location="top">
                    <template v-slot:activator="{ props }">
                      <div v-bind="props" class="stat-item d-flex align-center px-2">
                        <v-icon size="14" color="info" class="mr-1">mdi-content-copy</v-icon>
                        <span class="stat-value text-info font-weight-black">{{ item.duplicateCount || 0 }}</span>
                      </div>
                    </template>
                  </v-tooltip>
                  <v-divider vertical class="mx-1" length="12"></v-divider>
                  <v-tooltip text="Hata alanlar" location="top">
                    <template v-slot:activator="{ props }">
                      <div v-bind="props" class="stat-item d-flex align-center px-2">
                        <v-icon size="14" color="error" class="mr-1">mdi-close-circle-outline</v-icon>
                        <span class="stat-value text-error font-weight-black">{{ item.failedCount || 0 }}</span>
                      </div>
                    </template>
                  </v-tooltip>
                </div>
              </div>
            </td>
            <td>
              <div class="d-flex justify-end pr-1">
                <v-btn flat size="35" color="passiveColor" variant="outlined" class="premium-cube-btn"
                  @click="openDetailedReport(item)" aria-label="Aktarım detaylarını görüntüle"><v-icon size="x-large">mdi-eye-outline</v-icon></v-btn>
                <v-btn flat size="35" color="danger" variant="flat" :disabled="!isDeletable(item)"
                  class="premium-cube-btn ml-2" @click="openDeleteConfirm($event, 'single', item)"
                  aria-label="Aktarım kaydını sil"><v-icon
                    size="x-large">mdi-delete</v-icon></v-btn>
              </div>
            </td>
          </tr>
        </template>

        <template v-slot:header.actions>
          <div class="d-flex justify-end align-center fill-height">
            <v-btn v-if="validSelectedJobsCount > 0" flat size="30" color="error" variant="flat"
              @click="openDeleteConfirm($event, 'batch')" class="premium-cube-btn mr-2" aria-label="Seçili kayıtları sil"><v-icon
                size="large">mdi-delete</v-icon></v-btn>
          </div>
        </template>

        <template v-slot:bottom>
          <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
            @setPage="handlePageChange" v-model="pagination.page" style="position:relative;border-top:1px solid #ddd" />
        </template>
      </v-data-table-server>

      <div v-else class="mobile-container pa-2 overflow-y-auto">
        <EmptyState v-if="!jobs.length" title="Aktarım Kaydı Bulunamadı" message="Arama kriterlerinize uygun herhangi bir aktarım kaydı bulunamadı." />
        <v-card v-for="item in jobs" :key="item._id" class="mb-4 rounded-lg border shadow-sm" elevation="0">
          <div class="pa-3 border-bottom d-flex align-center justify-space-between bg-grey-lighten-5"
            style="background-color:white">

            <div class="d-flex align-center">
              <v-checkbox-btn :model-value="isJobSelected(item)"
                @update:model-value="val => onJobSelectionUpdate(item, !!val)" density="compact"
                class="mr-2" aria-label="Aktarım kaydını seç"></v-checkbox-btn>
              <PlatformImageComponent :integrationCode="item.integrationCode" :width="80" :height="35" class="mr-4">
              </PlatformImageComponent>

              <!--               <v-chip size="x-small" :color="getPlatformColor(item.integrationCode)" variant="flat"
                class="text-white font-weight-bold mr-2">{{ item.integrationCode?.toUpperCase() }}</v-chip> -->
            </div>
            <v-chip size="x-small" :color="getStatusColor(item.status)" variant="tonal" class="font-weight-bold">{{
              translateStatus(item.status) }}</v-chip>
          </div>

          <!-- GİZLİ DAVRANIŞ (YENİ bulgu, T4g — BACKLOG.md): `workspaceColor` hiçbir
               temada tanımlı bir Vuetify anahtarı DEĞİL (kod tabanında BAŞKA HİÇBİR
               yerde kullanılmıyor — muhtemelen `workplaceColor`un yazım hatası);
               `loginColor` ile AYNI kırık kalıp — bu arka plan bildirimi zaten bugün
               de geçersiz/`unset`. Davranış BİLİNÇLİ OLARAK korunuyor, `--ek-color-
               workspace-color` de kasıtlı olarak tanımsız bırakıldı. -->
          <v-card-text class="pa-3" style="background-color:var(--ek-color-workspace-color)!important">
            <div class="d-flex justify-space-between align-center mb-4 pa-2 rounded-lg bg-grey-lighten-4">
              <div class="text-center flex-grow-1 border-right">
                <div class="text-caption text-grey-darken-1" style="font-size: 10px!important">Toplam Ürün</div>
                <div class="font-weight-black text-passiveColor" style="font-size: var(--ek-font-size-md)">{{ item.totalCount || 0 }}
                </div>
              </div>
              <div class="text-center flex-grow-1">
                <div class="text-caption text-grey-darken-1" style="font-size: 10px!important">Aktarılan Ürün</div>
                <div class="font-weight-black text-success" style="font-size: var(--ek-font-size-md)">{{ item.processedCount || 0 }}</div>
              </div>
            </div>

            <div class="d-flex align-center justify-center mb-4">
              <div
                class="data-group-capsule d-flex align-center px-2 py-1 rounded-pill border shadow-sm bg-white w-100 justify-space-around">
                <div class="stat-item d-flex align-center px-1"
                  @click="snackbarStore.addSnackbar({ text: 'Aktarılmaya aday ürünler', color: 'success', textColor: 'white' })">
                  <v-icon size="14" color="success" class="mr-1">mdi-check-circle-outline</v-icon>
                  <span class="stat-value text-success font-weight-black">{{ item.validCount || 0 }}</span>
                </div>
                <v-divider vertical length="12"></v-divider>
                <div class="stat-item d-flex align-center px-1"
                  @click="snackbarStore.addSnackbar({ text: 'Formatı hatalı ürünler', color: 'orange', textColor: 'white' })">
                  <v-icon size="14" color="orange-darken-1" class="mr-1">mdi-alert-outline</v-icon>
                  <span class="stat-value text-orange-darken-2 font-weight-black">{{ item.invalidCount || 0 }}</span>
                </div>
                <v-divider vertical length="12"></v-divider>
                <div class="stat-item d-flex align-center px-1"
                  @click="snackbarStore.addSnackbar({ text: 'Sistemde zaten mevcut olanlar', color: 'info', textColor: 'white' })">
                  <v-icon size="14" color="info" class="mr-1">mdi-content-copy</v-icon>
                  <span class="stat-value text-info font-weight-black">{{ item.duplicateCount || 0 }}</span>
                </div>
                <v-divider vertical length="12"></v-divider>
                <div class="stat-item d-flex align-center px-1"
                  @click="snackbarStore.addSnackbar({ text: 'Hata alanlar', color: 'error', textColor: 'white' })">
                  <v-icon size="14" color="error" class="mr-1">mdi-close-circle-outline</v-icon>
                  <span class="stat-value text-error font-weight-black">{{ item.failedCount || 0 }}</span>
                </div>
              </div>
            </div>

            <div class="d-flex justify-space-between mb-3 px-3 py-3 bg-white rounded-lg border shadow-sm">
              <div class="d-flex align-center">
                <v-avatar size="28" color="blue-lighten-5" class="mr-2 border border-blue-lighten-3">
                  <v-icon size="16" color="blue-darken-2">mdi-clock-start</v-icon>
                </v-avatar>
                <div class="d-flex flex-column">
                  <span class="text-grey-darken-1 font-weight-black"
                    style="font-size: 9px; text-transform: uppercase;">Başlangıç</span>
                  <span style="font-size: 11px;" class="font-weight-medium text-grey-darken-4"
                    v-html="formatDate(item.startedAt)"></span>
                </div>
              </div>
              <v-divider vertical class="mx-2"></v-divider>
              <div class="d-flex align-center">
                <div class="d-flex flex-column text-right mr-2">
                  <span class="text-grey-darken-1 font-weight-black"
                    style="font-size: 9px; text-transform: uppercase;">Bitiş</span>
                  <span style="font-size: 11px;" class="font-weight-medium text-grey-darken-4"
                    v-html="item.completedAt ? formatDate(item.completedAt) : 'Devam...'"></span>
                </div>
                <v-avatar size="28" color="teal-lighten-5" class="border border-teal-lighten-3">
                  <v-icon size="16" color="teal-darken-2">mdi-flag-checkered</v-icon>
                </v-avatar>
              </div>
            </div>

            <div class="d-flex justify-end align-center pa-0" style="gap: var(--ek-space-2);">
              <v-btn flat size="35" color="passiveColor" variant="outlined"
                style="border:1px solid var(--ek-color-border-color);" @click="openDetailedReport(item)"
                aria-label="Aktarım detaylarını görüntüle">
                <v-icon size="x-large">mdi-eye-outline</v-icon>
              </v-btn>
              <v-btn flat size="35" color="danger" variant="flat" style="border:1px solid #ccc;"
                :disabled="!isDeletable(item)" @click="openDeleteConfirm($event, 'single', item)"
                aria-label="Aktarım kaydını sil">
                <v-icon size="x-large">mdi-delete</v-icon>
              </v-btn>
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
import { ref, onMounted, onBeforeMount, reactive, computed } from 'vue'
import useRestApi from '@/composables/restapi'
import LoadingComponent from '@/components/LoadingComponent.vue'
import PaginationComponent from '@/components/PaginationComponent.vue'
import DetailedImportLogReport from '@/components/logListView/DetailedImportLogReport.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue'
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import PlatformImageComponent from '../platforms/PlatformImageComponent.vue'
const restApi = useRestApi()
const snackbarStore = useSnackbarStore()
const loadingComponentRef: any = ref(null)
const dialogAttach = ref(".importLogList")
const loading = ref(false)
const jobs = ref<any[]>([])
const selectedJobs = ref<any[]>([])
const searchJobId = ref("")
const sortBy = ref<any[]>([{ key: 'startedAt', order: 'desc' }])
const integrationStore = useIntegrationStore()
const mobileSortSelection = ref('startedAt-desc')
const sortOptions = [
  { title: 'Tarih (Yeniye Doğru)', value: 'startedAt-desc' },
  { title: 'Tarih (Eskiye Doğru)', value: 'startedAt-asc' },
  { title: 'Toplam Ürün (Azalan)', value: 'totalCount-desc' },
  { title: 'Toplam Ürün (Artan)', value: 'totalCount-asc' },
  { title: 'Aktarılan Ürün (Azalan)', value: 'processedCount-desc' },
  { title: 'Aktarılan Ürün (Artan)', value: 'processedCount-asc' },
]

const isDeletable = (item: any) => {
  const status = item?.status?.toUpperCase();
  return ['COMPLETED', 'FAILED'].includes(status);
}

const validSelectedJobsCount = computed(() => {
  return jobs.value.filter(j => selectedJobs.value.includes(j._id) && isDeletable(j)).length;
});

const reportInfo = reactive({ isOpen: false, jobId: null })
const openDetailedReport = (item: any) => { reportInfo.jobId = item.jobId; reportInfo.isOpen = true; }
const copyToClipboard = (text: string) => {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    snackbarStore.addSnackbar({ show: true, text: 'İşlem ID kopyalandı', color: 'success' });
  });
}

const isJobSelected = (item: any) => selectedJobs.value.includes(item._id)
const onJobSelectionUpdate = (item: any, val: boolean) => {
  if (val) { if (!selectedJobs.value.includes(item._id)) selectedJobs.value.push(item._id) }
  else { selectedJobs.value = selectedJobs.value.filter(id => id !== item._id) }
}

const confirmationDelete = reactive<any>({ isDialogOpen: false, activator: undefined, mode: 'single', job: null })
const pagination = reactive({ limit: 13, page: 1, totalNumberOfPages: 1, totalNumberOfRecords: 0 });

const headers: any = [
  { title: 'Başlangıç Tarihi', key: 'startedAt', sortable: true, align: 'center' },
  { title: 'Bitiş Tarihi', key: 'completedAt', sortable: true, align: 'center' },
  { title: 'Platform', key: 'platform', sortable: false, align: 'center' },
  { title: 'Durum', key: 'status', sortable: false, align: 'center' },
  { title: 'Ürün Dağılımı (Top. / Akt.)', key: 'processedCount', sortable: true, align: 'center' },
  { title: 'İstatistikler', key: 'stats', sortable: false, align: 'center' },
  { title: '', key: 'actions', sortable: false, align: 'end' },
];

const openDeleteConfirm = (event: any, mode: 'single' | 'batch', job: any = null) => {
  confirmationDelete.activator = event.currentTarget; confirmationDelete.mode = mode;
  confirmationDelete.job = job; confirmationDelete.isDialogOpen = true;
}
const cancelDelete = () => { confirmationDelete.isDialogOpen = false; confirmationDelete.job = null; }

const confirmDelete = async () => {
  confirmationDelete.isDialogOpen = false;
  let ids = confirmationDelete.mode === 'single' ? [confirmationDelete.job._id] : jobs.value.filter(j => selectedJobs.value.includes(j._id) && isDeletable(j)).map(j => j._id);
  if (ids.length === 0) return;
  let guid = loadingComponentRef.value.info("Arşivleniyor...")
  try {
    const res = await restApi.post('IntegrationService/archiveImportJobs', { ids })
    if (res.success) {
      snackbarStore.addSnackbar({ show: true, text: 'Başarıyla arşivlendi', color: 'success' });
      selectedJobs.value = []; getJobs(true);
    }
  } finally { loadingComponentRef.value.remove(guid) }
}

const onSortUpdate = (newSortBy: any) => { sortBy.value = newSortBy; getJobs(true); }

const onMobileSortUpdate = (val: string) => {
  const [key, order] = val.split('-')
  sortBy.value = [{ key, order }]
  getJobs(true)
}

const handlePageChange = () => { getJobs(); };

const getJobs = async (reset: boolean = false) => {
  if (reset) { pagination.page = 1; if (reset === true) searchJobId.value = ""; }
  loading.value = true;
  let guid = loadingComponentRef.value.info("");
  try {
    if (searchJobId.value && searchJobId.value.trim() !== "") {
      const res = await restApi.post('IntegrationService/getImportJobByJobId', { jobId: searchJobId.value.trim() });
      if (res.success && res.data) {
        jobs.value = [res.data]; pagination.totalNumberOfPages = 1; pagination.totalNumberOfRecords = 1;
      } else { jobs.value = []; pagination.totalNumberOfPages = 0; pagination.totalNumberOfRecords = 0; }
    } else {
      const res = await restApi.post('IntegrationService/getImportJobs', {
        page: pagination.page,
        limit: pagination.limit,
        sortBy: sortBy.value[0]?.key,
        sortOrder: sortBy.value[0]?.order
      });
      if (res.success) {
        jobs.value = res.data;
        pagination.totalNumberOfPages = res.pagination?.totalNumberOfPages || 1;
        pagination.totalNumberOfRecords = res.pagination?.totalNumberOfRecords || 0;
      }
    }
  } finally { loadingComponentRef.value.remove(guid); loading.value = false; }
};

// ADR-0011 Karar 1/Açık Soru 4 kapsamı DIŞI (bilinçli, göç edilmedi) — bkz.
// ExportLogList.vue'daki AYNI gerekçe (canlı iş-durumu paleti, mevcut token
// setiyle GÖZLE GÖRÜLÜR fark üretmeden eşleşmiyor; DetailedImportLogReport.vue'da
// BİREBİR tekrarlanıyor). `WAITING_FOR_FETCH` tek istisna: slate-400 ↔
// `content-subtle` TAM eşleşiyor (slate-400), o yüzden zaten token'landı.
const getStatusColor = (status: string) => {
  const s = status?.toUpperCase();
  const colors: any = { COMPLETED: '#10b981', FAILED: '#f43f5e', CANCELLED: '#757575', PROCESSING: '#0078D4', READY_TO_SYNC: '#6366f1', FETCHING: '#f59e0b', WAITING_FOR_FETCH: 'var(--ek-color-content-subtle)' };
  return colors[s] || 'grey';
};

const translateStatus = (status: string) => {
  const s = status?.toUpperCase();
  const translations: any = { WAITING_FOR_FETCH: 'Sırada', FETCHING: 'Ürünler Çekiliyor', READY_TO_SYNC: 'Analiz Ediliyor', PROCESSING: 'Ürünler Aktarılıyor', COMPLETED: 'Tamamlandı', FAILED: 'Hata', CANCELLED: 'İptal Edildi' };
  return translations[s] || status;
};

// GİZLİ DAVRANIŞ (YENİ bulgu, T4g — BACKLOG.md, kod DEĞİŞTİRİLMEDİ): bu fonksiyon
// ÖLÜ KOD — yalnızca yorum satırına alınmış bir `<v-chip>`'ten çağrılıyor
// (`PlatformImageComponent` marka görselini zaten gösteriyor). Marka renkleri
// (Trendyol/Hepsiburada/N11/Pazarama) üçüncü taraf kimlik renkleri olduğundan
// zaten token'lanmazdı; kullanılmadığı için hiç dokunulmadı.
const getPlatformColor = (code: string) => {
  const c = code?.toLowerCase();
  const colors: any = { trendyol: '#f27a1a', hepsiburada: '#ff6000', n11: '#5e43a9', pazarama: '#005494' };
  return colors[c] || 'grey-darken-2';
};

const formatDate = (date: any) => {
  if (!date) return '-';
  const d = new Date(date);
  const datePart = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timePart = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} <b class="font-weight-black">${timePart}</b>`;
};

onMounted(() => { getJobs(); });
onBeforeMount(() => { pagination.page = 1; });
</script>

<style scoped>
/* ADR-0015 B3 — bkz. ExportLogList.vue AYNI gerekçe (flexbox denemesi yükseklik zincirini
   çözemedi; kanıtlanmış `position:absolute;inset:0` desenine dönüldü, yalnızca `top` LogListView.vue'nun
   yeni EkPageHeader+EkPageTabs başlığına göre güncellendi). */
.importLogList {
  position: absolute;
  top: 148px;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--ek-color-background);
}

@media (max-width: 767px) {
  .importLogList {
    top: 220px;
  }
}

.search-section {
  flex-shrink: 0;
  z-index: 10;
}

/* A11y (WCAG 1.4.3 — bilinçli görsel değişiklik): bkz. ExportLogList.vue'daki AYNI gerekçe. */
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
  border-top: 1px solid #96a9b7;
  background-color: white !important;
}

:deep(.v-table__wrapper) {
  flex-grow: 1 !important;
  overflow-y: auto !important;
}

.mobile-container {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #f5f7f9;
  overflow-y: auto;
}

.border-bottom {
  border-bottom: 1px solid #eee;
}

.border-right {
  border-right: 1px solid #ddd;
}

:deep(.v-data-table-header__content) {
  font-weight: bold !important;
  justify-content: center !important;
}

.text-passiveColor {
  color: #96a9b7;
}

.text-danger {
  color: #ff5252;
}

.custom-menu-item {
  min-height: 30px !important;
  height: 35px !important;
  padding: 0 12px !important;
  border-bottom: 1px solid #eee;
}

.compact-title {
  color: var(--ek-color-passive-color);
  font-size: var(--ek-font-size-xs) !important;
  font-weight: 600;
  line-height: 1 !important;
}

.customTextField :deep(.v-select__selection-text) {
  color: var(--ek-color-passive-color) !important;
  font-weight: 700;
}

.customTextField :deep(.v-prepend-inner .v-icon) {
  color: var(--ek-color-passive-color) !important;
  opacity: 1;
}

@media (max-width: 600px) {
  .desktop-table {
    display: none !important;
  }
}

.data-group-capsule {
  background: rgba(var(--v-theme-surface), 0.7);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(0, 0, 0, 0.05) !important;
  height: 28px;
  transition: all var(--ek-duration-base) var(--ek-easing-standard);
}

.stat-item {
  cursor: help;
  transition: opacity var(--ek-duration-base) var(--ek-easing-standard);
}

.stat-item:hover {
  opacity: 0.7;
}

.stat-value {
  font-size: 11px;
  letter-spacing: -0.2px;
}

:deep(.v-divider--vertical) {
  border-color: rgba(0, 0, 0, 0.08) !important;
}
</style>