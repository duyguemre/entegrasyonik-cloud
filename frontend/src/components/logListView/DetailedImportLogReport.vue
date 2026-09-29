<template>
  <div class="report-content-wrapper">
    <LoadingComponent attach=".reportContainer" ref="loadingComponentRef"></LoadingComponent>

    <div v-if="reportData && localItem" class="pa-0 pr-3">

      <div class="d-flex flex-column mb-6 rounded-lg border bg-grey-lighten-5 position-relative overflow-hidden"
        style="gap: var(--ek-space-3);">

        <div class="pa-4 pb-0">
          <div class="d-flex flex-wrap align-center pb-3" style="gap: var(--ek-space-5);">
            <div class="d-flex align-center">
              <span class="text-caption font-weight-bold text-grey-darken-1 mr-2">İşlem No:</span>
              <span class="text-body-2 font-weight-black">{{ localItem.jobId }}</span>
            </div>
            <div class="d-flex align-center">
              <span class="text-caption font-weight-bold text-grey-darken-1 mr-2">Platform:</span>
              <PlatformImageComponent :integrationCode="localItem.integrationCode" :width="80" :height="35"
                class="mr-4">
              </PlatformImageComponent>

              <!--                 <v-chip size="x-small" :color="getPlatformColor(localItem.integrationCode)" variant="flat"
                  class="font-weight-bold text-white">
                  {{ localItem.integrationCode?.toUpperCase() }}
                </v-chip> -->
            </div>
            <div class="d-flex align-center text-no-wrap">
              <v-icon size="16" color="grey" class="mr-1">mdi-clock-start</v-icon>
              <span class="text-caption font-weight-bold text-grey-darken-1 mr-1">Başlangıç:</span>
              <span class="text-caption font-weight-bold">{{ formatDate(localItem.startedAt) }}</span>
            </div>
            <div class="d-flex align-center text-no-wrap">
              <v-icon size="16" color="grey" class="mr-1">mdi-clock-check</v-icon>
              <span class="text-caption font-weight-bold text-grey-darken-1 mr-1">Bitiş:</span>
              <span class="text-caption font-weight-bold">{{ formatDate(localItem.completedAt) }}</span>
            </div>
          </div>

          <div class="w-100 pb-4 stepper-wrapper">
            <div class="stepper-content">
              <div class="stepper-line"></div>
              <div v-for="(step, index) in steps" :key="index" class="step-item">
                <v-avatar size="16"
                  :color="currentStepIndex === index ? getStatusColor(localItem.status) : (currentStepIndex > index ? getStatusColor(step.status) : '#e0e0e0')"
                  :class="[currentStepIndex === index && isProcessing ? 'status-pulse-intense' : '', 'step-avatar', currentStepIndex > index ? 'step-passed' : '']"
                  style="border: 2px solid white; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); position: relative; z-index: 2;">
                </v-avatar>
                <div class="step-text-container" style="z-index: 2;">
                  <span class="step-title"
                    :class="{ 'active-text': currentStepIndex === index, 'passed-text': currentStepIndex > index }"
                    style="font-size: 10px; font-weight: 700; text-transform: uppercase;">
                    {{ currentStepIndex === index && localItem.status === 'FAILED' ? 'Hata Oluştu' : (currentStepIndex
                      ===
                      index && localItem.status === 'CANCELLED' ? 'İptal Edildi' : step.title) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <v-progress-linear v-if="showProgress" :model-value="progressPercentage" height="12"
          class="premium-progress mt-auto" bg-color="#ddd" :bg-opacity="1" style="border-top: 1px solid #ccc;">
          <template v-slot:default="{ value }">
            <strong style="font-weight:bold; font-size: 10px; color: white; text-shadow: 0px 0px 2px rgba(0,0,0,0.8);">
              {{ Math.ceil(value) }}%
            </strong>
          </template>
        </v-progress-linear>
      </div>

      <v-row class="mb-2" align="stretch">
        <v-col cols="12" md="5" class="d-flex flex-column">
          <div class="info-grid flex-grow-1">
            <div class="d-flex flex-column flex-sm-row mb-2" style="gap: var(--ek-space-2);">
              <div class="info-item-card border-passive w-100" style="background-color: #f8f9fa;">
                <div class="text-overline">Toplam Çekilen</div>
                <b class="text-h5" style="color: #455a64;">{{ localItem.totalCount || 0 }}</b>
                <div class="text-caption mt-1">Mağazanızdan çekilen toplam ham ürün ve varyant kaydı.</div>
              </div>
              <div class="info-item-card border-warning w-100" style="background-color: #fff9e9;">

                <span class="text-subtitle-2 font-weight-black text-orange text-darken-2">Kritik Veri
                  Eksikliği</span>
                <b class="text-h6 text-orange text-darken-2">{{ localItem.invalidCount || 0 }}</b>
                <div class="text-caption mt-1">Eksik eşleşme nedeniyle işleme alınamayan ürünler.</div>
              </div>
            </div>

            <div class="info-item-card border-candidate">
              <div class="d-flex align-center mb-1">
                <v-icon color="#06b6d4" size="small" class="mr-2">mdi-check-decagram</v-icon>
                <span class="text-subtitle-2 font-weight-black" style="color: #06b6d4;">Aday Aktarım</span>
                <v-spacer></v-spacer>
                <b class="text-h6" style="color: #06b6d4;">{{ localItem.validCount || 0 }}</b>
              </div>
              <div class="text-caption">Zenginleştirme süreci tamamlanmış, sisteme girmeye hazır ürünler.</div>
            </div>
            <div class="info-item-card border-success" style="background-color: #f1f8e9;">
              <div class="d-flex align-center mb-1">
                <v-icon color="success" size="small" class="mr-2">mdi-alert-circle</v-icon>
                <span class="text-subtitle-2 font-weight-black text-success text-darken-2">Aktarılan Varyant</span>
                <v-spacer></v-spacer>
                <b class="text-h6 text-success text-darken-2">{{ localItem.processedCount || 0 }}</b>
              </div>
              <div class="text-caption">Tüm kontrollerden geçerek sisteme işlenen nihai ürünler.</div>
            </div>
            <div class="info-item-card border-info">
              <div class="d-flex align-center mb-1">
                <v-icon color="info" size="small" class="mr-2">mdi-content-copy</v-icon>
                <span class="text-subtitle-2 font-weight-black" style="color:#6366f1">Mevcut/Mükerrer
                  Ürünler</span>
                <v-spacer></v-spacer>
                <b class="text-h6" style="color:#6366f1">{{ localItem.duplicateCount || 0 }}</b>
              </div>
              <div class="text-caption">Sistemde zaten kayıtlı olduğu için atlanan ürünler.</div>
            </div>
            <div class="info-item-card border-error">
              <div class="d-flex align-center mb-1">
                <v-icon color="error" size="small" class="mr-2">mdi-close-octagon</v-icon>
                <span class="text-subtitle-2 font-weight-black text-error">İşlem Hatası</span>
                <v-spacer></v-spacer>
                <b class="text-h6 text-error">{{ localItem.failedCount || 0 }}</b>
              </div>
              <div class="text-caption ">İşlem sırasında oluşan beklenmedik teknik kesintiler.</div>
            </div>
          </div>
        </v-col>
        <v-col cols="12" md="7">
          <div class="chart-card d-flex align-center" style="height: 100%;">
            <v-chart v-if="isMounted" class="chart" :option="chartOption" autoresize style="min-height: 400px; width: 100%;" />
          </div>
        </v-col>
      </v-row>

      <div v-if="allImpactedCategories.length" class="mt-8 pa-4 rounded-lg border bg-grey-lighten-5"
        style="border:1px solid #ddd!important;">
        <div class="d-flex align-center mb-1">
          <v-icon color="error" class="mr-2">mdi-tag-off</v-icon>
          <span class="text-subtitle-1 font-weight-bold">Eksik Eşleştirme Detayları</span>
        </div>
        <div class="text-caption text-grey-darken-1 mb-4 pl-sm-8 pl-0">
          Pazaryerinden çekilen ürünlerin sisteme tam entegre edilebilmesi için kategori eşleşmelerinin ve ürün
          özellik tanımlamalarının tamamlanması gerekmektedir.
        </div>


        <div class="d-flex align-center mb-4 pl-sm-8 pl-0 flex-wrap" style="gap: var(--ek-space-4);">
          <div class="d-flex align-center px-3 py-1 rounded-pill bg-white border"
            style="gap: 6px; border-style: dashed !important;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: #318600;"></div>
            <span class="text-caption font-weight-bold text-grey-darken-3" style="font-size: 10px !important;">Eşleşme
              Tamam</span>
          </div>
          <div class="d-flex align-center px-3 py-1 rounded-pill bg-white border"
            style="gap: 6px; border-style: dashed !important;">
            <div style="width: 8px; height: 8px; border-radius: 50%; background-color: #c62828;"></div>
            <span class="text-caption font-weight-bold text-grey-darken-3" style="font-size: 10px !important;">Eşleşme
              Bekleniyor</span>
          </div>
          <v-divider vertical class="mx-1 hidden-xs-only"></v-divider>
          <span class="text-caption text-grey-darken-1 italic" style="font-size: 10px !important;">
            * Kategori ve seçeneklerin üzerine tıklayarak eşleştirmeleri anlık olarak tamamlayabilirsiniz.
          </span>
        </div>


        <!--           <div class="d-flex flex-column mb-4 pl-sm-8 pl-0" style="gap: var(--ek-space-3);">
            <div>
              <v-btn elevation="0" color="white" size="small" class="font-weight-bold px-4"
                style="border:1px solid #bbb; text-transform: none; color: var(--ek-color-process-button-color);">
                <v-icon start size="18">mdi-magic-staff</v-icon>
                Eksik Tanımlamaları Otomatik Oluştur
              </v-btn>
            </div>
          </div>
 -->
        <div class="d-flex flex-column" style="gap: var(--ek-space-3);">
          <div v-for="(catId, index) in allImpactedCategories" :key="index"
            class="pa-3 rounded-lg bg-white border d-flex flex-column shadow-sm"
            style="gap: var(--ek-space-3); border-left: 5px solid !important;"
            :style="{ 'border-color': reportData.missingCategories?.includes(catId) ? '#c6282822!important' : '#e6510022!important', borderLeftColor: reportData.missingCategories?.includes(catId) ? '#c62828' : '#e65100' }">

            <div class="d-flex flex-column flex-sm-row align-start align-sm-center justify-space-between"
              style="gap: var(--ek-space-2);">
              <div class="text-caption d-flex align-center flex-wrap" style="line-height: 1.6;">
                <span v-if="resolvedCategories[catId]" class="d-flex align-center flex-wrap">
                  <template v-if="resolvedCategories[catId].path">
                    <span class="text-grey-darken-1 font-weight-medium mr-1">{{
                      resolvedCategories[catId].path.replaceAll('/', ' / ') }}</span>
                  </template>

                  <v-menu :model-value="activeMenuCatId === catId" scroll-strategy="block"
                    @update:model-value="(val) => val ? activeMenuCatId = catId : activeMenuCatId = null"
                    v-if="reportData.missingCategories?.includes(catId)" :close-on-content-click="false"
                    location="bottom start" offset="5" transition="scale-transition">
                    <template v-slot:activator="{ props: menuProps }">

                      <v-chip v-bind="menuProps" size="x-small" label class="px-2 font-weight-black" color="#ef5350"
                        style="background-color: #ffebee;border:1px solid #aaa; color: #c62828;" variant="flat"
                        :style="attributeMappingStore.isIntegrationCategoryMapped(localItem.integrationCode, catId) ? { color: '#318600' } : { color: '#c62828' }">
                        {{ resolvedCategories[catId].last }}
                      </v-chip>

                    </template>


                    <v-card :style="$vuetify.display.smAndDown ? { 'margin-top': '150px' } : {}"
                      :width="$vuetify.display.smAndDown ? '95vw' : '700'"
                      class="elevation-24 rounded-lg border overflow-y-auto mx-auto shadow-lg pa-3"
                      style="display: flex; flex-direction: column; max-height: 80vh;">

                      <!--                       <v-card min-width="280" class="pa-3 shadow-lg border-0 rounded-lg"
                        style="height:fit-content;width:fit-content"> -->
                      <div class="d-flex align-center mb-2">
                        <v-icon size="14" color="orange-darken-3" class="mr-1">mdi-link-variant</v-icon>
                        <span class="text-caption font-weight-black text-grey-darken-3">Platform Kategori
                          Eşleştirme</span>
                      </div>
                      <DetailedImportLogReportMissingCategory :integrationCode="localItem.integrationCode"
                        :platformCategoryId="catId" @close="activeMenuCatId = null">
                      </DetailedImportLogReportMissingCategory>
                    </v-card>
                  </v-menu>



                  <span v-else class="font-weight-black" style="color: #e65100; font-size: 11px;">
                    {{ resolvedCategories[catId].last }}
                  </span>
                </span>
                <span v-else class="text-grey italic">Kategori bilgisi yükleniyor...</span>
              </div>

              <v-chip size="x-small" variant="outlined" class="font-weight-bold cursor-pointer"
                @click="copyToClipboard(catId)"
                :aria-label="`${getMissingCategoryProductCount(catId)} ürün — kategori kimliğini kopyala`"
                :color="reportData.missingCategories?.includes(catId) ? 'error' : 'orange-darken-3'"
                style="border-style: dashed !important; text-transform: none;">
                <!--                   <v-icon start size="12">mdi-counter</v-icon> -->
                {{ getMissingCategoryProductCount(catId) }}
              </v-chip>
            </div>

            <div v-if="groupedMissingAttributes[catId]" class="d-flex flex-column" style="gap: var(--ek-space-3); margin-top: 4px;">



              <div v-for="(attrData, attrName) in groupedMissingAttributes[catId]" :key="attrName"
                class="d-flex flex-column" style="gap: 6px;">
                <span class="text-subtitle-3 ml-1 font-weight-bold" style="font-size: 10px; line-height: 1;" :style="attributeMappingStore.isIntegrationAttributeMapped(localItem.integrationCode, catId,
                  attrData.id) ? { color: '#318600' } : { color: '#e65100' }">
                  {{ attrName }}
                </span>

                <div class="d-flex flex-wrap" style="gap: var(--ek-space-2);">

                  <v-menu scroll-strategy="block"
                    :model-value="activeMenuCatId === catId + attr.attributeId + attr.attributeValueId + attr.attributeValue"
                    @update:model-value="(val) => val ? activeMenuCatId = catId + attr.attributeId + attr.attributeValueId + attr.attributeValue : activeMenuCatId = null"
                    v-for="(attr, aIdx) in attrData.values" :key="aIdx" :close-on-content-click="false"
                    location="bottom start" offset="5" transition="scale-transition">
                    <template v-slot:activator="{ props: menuProps }">
                      <v-chip v-bind="menuProps" size="x-small" variant="flat" :color="'#fff3e0'"
                        class="font-weight-bold" style="color: #e65100 !important; border: 1px solid #ddd !important;"
                        :style="attributeMappingStore.isIntegrationAttributeValueMapped(localItem.integrationCode, catId,
                          attr.attributeId, attr.attributeValuId, attr.attributeValue) ? { color: '#318600' } : { color: '#e65100' }">
                        {{ attr.attributeValue }}
                      </v-chip>
                    </template>


                    <v-card :style="$vuetify.display.smAndDown ? { 'margin-top': '150px' } : {}"
                      :width="$vuetify.display.smAndDown ? '95vw' : '700'"
                      class="elevation-24 rounded-lg border overflow-y-auto mx-auto shadow-lg pa-3"
                      style="display: flex; flex-direction: column; max-height: 80vh;">

                      <div class="d-flex align-center mb-2">
                        <v-icon size="14" color="orange-darken-3" class="mr-1">mdi-link-variant</v-icon>
                        <span class="text-caption font-weight-black text-grey-darken-3">Platform Seçenek
                          Eşleştirme</span>
                      </div>
                      <DetailedImportLogReportMissingAttribute :integrationCode="localItem.integrationCode"
                        :platformCategoryId="catId" :attribute="attr" @close="activeMenuCatId = null">
                      </DetailedImportLogReportMissingAttribute>
                    </v-card>
                  </v-menu>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="!loading" class="d-flex flex-column align-center justify-center text-center pa-12"
      style="height: 100%;">
      <v-icon size="80" color="grey-lighten-2">mdi-database-off-outline</v-icon>
      <h3 class="text-h6 font-weight-black mt-4 grey--text text--darken-2">Rapor Verilerine Ulaşılamadı</h3>
      <p class="text-body-2 text-grey-darken-1 mt-2" style="max-width: 400px;">
        İşlem raporu henüz hazırlanmamış olabilir veya sunucuyla olan bağlantıda bir sorun yaşanıyor.
      </p>

      <v-btn color="processButtonColor" elevation="0" style="min-width:0;border:1px solid #bbb"
        class="mt-6 font-weight-bold" @click="getReport()">
        YENİDEN DENE
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, onBeforeUnmount, computed, reactive, watch } from 'vue'
import useRestApi from '@/composables/restapi'
import LoadingComponent from '@/components/LoadingComponent.vue'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useSnackbarStore } from '@/stores/snackbarStore'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import { LegacyGridContainLabel } from 'echarts/features'
import { useAttributeMappingStore } from '@/stores/site/attributeMapping'
import DetailedImportLogReportMissingCategory from './DetailedImportLogReportMissingCategory.vue'
import DetailedImportLogReportMissingAttribute from './DetailedImportLogReportMissingAttribute.vue'
import PlatformImageComponent from '../platforms/PlatformImageComponent.vue'

use([CanvasRenderer, BarChart, TooltipComponent, GridComponent, LegacyGridContainLabel])
const activeMenuCatId = ref<string | null>(null);
const props = defineProps<{ jobId: any }>()
const emits = defineEmits(['close'])
const restApi = useRestApi()
const integrationStore = useIntegrationStore()
const snackbarStore = useSnackbarStore()
const attributeMappingStore = useAttributeMappingStore()
const loadingComponentRef = ref<any>(null)
const reportData = ref<any>(null)
const localItem = ref<any>(null)
const loading = ref(false)
const resolvedCategories = reactive<Record<string, { path: string, last: string }>>({})
let pollTimer: any = null
const retryCount = ref(0)
const isMounted = ref(false)

const steps = [
  { title: 'Sırada', status: 'WAITING_FOR_FETCH', icon: 'mdi-clock-outline' },
  { title: 'Ürünler Çekiliyor', status: 'FETCHING', icon: 'mdi-cloud-download-outline' },
  { title: 'Analiz Ediliyor', status: 'READY_TO_SYNC', icon: 'mdi-file-find-outline' },
  { title: 'Ürünler Aktarılıyor', status: 'PROCESSING', icon: 'mdi-cached' },
  { title: 'Tamamlandı', status: 'COMPLETED', icon: 'mdi-check-decagram' }
]


const getMissingCategoryProductCount = (catId: string) => {
  if (reportData.value?.missingCategoryProductCounts) {
    return reportData.value.missingCategoryProductCounts.find((item: any) => String(item.platformCategoryId) === String(catId))?.productCount || 0;
  }
  return 0;
}

const allImpactedCategories = computed(() => {
  const cats = new Set<string>();
  if (reportData.value?.missingCategories) {
    reportData.value.missingCategories.forEach((c: string) => cats.add(c));
  }
  if (reportData.value?.missingAttributes) {
    reportData.value.missingAttributes.forEach((a: any) => cats.add(a.category));
  }
  return Array.from(cats);
});

const groupedMissingAttributes = computed(() => {
  if (!reportData.value?.missingAttributes) return {};

  return reportData.value.missingAttributes.reduce((acc: any, curr: any) => {
    if (!acc[curr.category]) acc[curr.category] = {};

    // Eğer bu özellik adı (attrName) ilk kez geliyorsa bir obje oluştur
    if (!acc[curr.category][curr.attributeName]) {
      acc[curr.category][curr.attributeName] = {
        id: curr.attributeId, // ID'yi burada saklıyoruz
        values: []
      };
    }

    // Aynı değeri tekrar eklememek için kontrol
    const exists = acc[curr.category][curr.attributeName].values.some(
      (a: any) => a.attributeValue === curr.attributeValue
    );

    if (!exists) {
      acc[curr.category][curr.attributeName].values.push(curr);
    }

    return acc;
  }, {});
});


watch(allImpactedCategories, () => {
  resolveCategoryNames();
}, { deep: true });

const currentStepIndex = computed(() => {
  if (!localItem.value) return 0;
  const status = localItem.value.status?.toUpperCase();
  if (['FAILED', 'CANCELLED'].includes(status)) {
    const idx = steps.findIndex(s => s.status === status);
    return idx === -1 ? (localItem.value.lastStatus ? steps.findIndex(s => s.status === localItem.value.lastStatus) : 0) : idx;
  }
  const idx = steps.findIndex(s => s.status === status);
  return idx === -1 ? 0 : idx;
});

const isProcessing = computed(() => {
  if (!localItem.value) return false;
  const status = localItem.value.status?.toUpperCase();
  return !['COMPLETED', 'FAILED', 'CANCELLED'].includes(status);
});

const showProgress = computed(() => {
  if (!localItem.value) return false;
  const status = localItem.value.status?.toUpperCase();
  return !['WAITING_FOR_FETCH', 'FETCHING', 'COMPLETED', 'FAILED', 'CANCELLED', 'READY_TO_SYNC'].includes(status);
});

const progressPercentage = computed(() => {
  if (!localItem.value || !localItem.value.validCount) return 0;
  const totalProcessed = (localItem.value.processedCount || 0) + (localItem.value.duplicateCount || 0) + (localItem.value.failedCount || 0);
  const percentage = (totalProcessed / localItem.value.validCount) * 100;
  return percentage > 100 ? 100 : Math.round(percentage);
});

const chartOption = computed(() => {
  if (!localItem.value) return {};
  const categories = ['Eksik Veri', 'Aktarılan', 'Mevcut', 'Hata'];
  const values = [localItem.value.invalidCount || 0, localItem.value.processedCount || 0, localItem.value.duplicateCount || 0, localItem.value.failedCount || 0];
  const colors = [{ start: '#f59e0b', end: '#d97706' }, { start: '#06b6d4', end: '#0891b2' }, { start: '#6366f1', end: '#4f46e5' }, { start: '#f43f5e', end: '#e11d48' }];
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'none' } },
    grid: { top: '15%', left: '3%', right: '4%', bottom: '5%', containLabel: true },
    xAxis: { type: 'category', data: categories, axisTick: { show: false }, axisLabel: { fontWeight: 'bold' } },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
    series: [{
      name: 'Ürün Sayısı', type: 'bar', barWidth: '40%',
      data: values.map((val, idx) => ({
        value: val,
        itemStyle: { borderRadius: [6, 6, 0, 0], color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: colors[idx].start }, { offset: 1, color: colors[idx].end }] } }
      })),
      label: { show: true, position: 'top', fontWeight: 'bold' }
    }]
  };
});

const getReport = async (isSilent = false) => {
  if (!props.jobId || !isMounted.value) return;
  let guid = null;
  if (!isSilent) { loading.value = true; guid = loadingComponentRef.value?.info("Rapor hazırlanıyor..."); }
  try {
    const jobResponse = await restApi.post("IntegrationService/getImportJobByJobId", { jobId: props.jobId });
    if (!isMounted.value) return;
    if (jobResponse && jobResponse.data) {
      localItem.value = jobResponse.data || jobResponse;
      localItem.value.status !== 'COMPLETED' && localItem.value.status !== 'FAILED' && localItem.value.status !== 'CANCELLED' ? startPolling() : stopPolling();
      retryCount.value = 0;
    } else { throw new Error("Veri boş"); }
    const res = await restApi.post("IntegrationService/getJobReport", { jobId: props.jobId });
    if (!isMounted.value) return;
    if (res) { reportData.value = res.data || res; await resolveCategoryNames(); }
  } catch (err) {
    if (!isMounted.value) return;
    retryCount.value++;
    if (retryCount.value >= 3) { stopPolling(); reportData.value = null; localItem.value = null; }
    else { startPolling(); }
  } finally {
    if (!isMounted.value) return;
    if (!isSilent && guid) { loading.value = false; loadingComponentRef.value?.remove(guid); }
    loading.value = false;
  }
};

const startPolling = () => { stopPolling(); pollTimer = setTimeout(() => { getReport(true) }, 5000); };
const stopPolling = () => { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } };

const resolveCategoryNames = async () => {
  const categoriesToResolve = allImpactedCategories.value;
  if (!categoriesToResolve.length || !localItem.value || !isMounted.value) return;
  for (const catId of categoriesToResolve) {
    if (!isMounted.value) break;
    if (resolvedCategories[catId]) continue;
    try {
      const category = await integrationStore.getIntegrationCategory3(localItem.value.integrationCode, catId);
      if (!isMounted.value) break;
      if (category) {
        let parts = Array.isArray(category.breadcrumb) ? [...category.breadcrumb] : [category.title];
        const last = parts.length > 1 ? parts.pop() : parts[0];
        resolvedCategories[catId] = { path: parts.length > 1 ? parts.join(' / ') + ' / ' : '', last: last || 'İsimsiz' };
      }
    } catch (e) {
      if (!isMounted.value) break;
      resolvedCategories[catId] = { path: '', last: 'Hata' };
    }
  }
};

const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text).then(() => { snackbarStore.addSnackbar({ show: true, text: 'ID kopyalandı', color: 'success' }); }); };
// ADR-0011 Karar 1/Açık Soru 4 kapsamı DIŞI (bilinçli, göç edilmedi) — bkz.
// ExportLogList.vue'daki AYNI gerekçe (ImportLogList.vue'da BİREBİR tekrarlanan palet).
const getStatusColor = (status: string) => {
  const s = status?.toUpperCase();
  const colors: any = { COMPLETED: '#10b981', FAILED: '#f43f5e', CANCELLED: '#757575', PROCESSING: '#0078D4', READY_TO_SYNC: '#6366f1', FETCHING: '#f59e0b', WAITING_FOR_FETCH: 'var(--ek-color-content-subtle)' };
  return colors[s] || 'grey';
};

// GİZLİ DAVRANIŞ (YENİ bulgu, T4g — BACKLOG.md, kod DEĞİŞTİRİLMEDİ): ÖLÜ KOD,
// yalnızca yorum satırına alınmış bir `<v-chip>`'ten çağrılıyor (bkz. dosya
// içindeki yorumlu blok + ImportLogList.vue'daki AYNI bulgu).
const getPlatformColor = (code: string) => {
  const c = code?.toLowerCase();
  const colors: any = { trendyol: '#f27a1a', hepsiburada: '#ff6000', n11: '#5e43a9', pazarama: '#005494' };
  return colors[c] || 'grey-darken-2';
};
const formatDate = (date: any) => date ? new Date(date).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

onMounted(() => {
  isMounted.value = true
  getReport()
  attributeMappingStore.retrieveAttributeMappings()
});
onBeforeUnmount(() => {
  isMounted.value = false
  stopPolling()
});
</script>

<style scoped>
.report-content-wrapper {
  overflow-y: auto;
  flex: 1 1 auto;
  height: calc(100vh - 280px);
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  height: 100%;
}

.info-item-card {
  background: white;
  padding: 12px 16px;
  border-radius: var(--ek-radius-lg);
  border: 1px solid #ddd;
  border-left: 5px solid transparent;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.border-success {
  border-left-color: #10b981;
}

.border-info {
  border-left-color: #6366f1;
}

.border-warning {
  border-left-color: #f59e0b;
}

.border-error {
  border-left-color: #f43f5e;
}

.border-passive {
  border-left-color: var(--ek-color-content-subtle);
}

.border-candidate {
  border-left-color: #06b6d4;
}

.chart-card {
  background: white;
  width: 100%;
  padding: 15px;
  border-radius: var(--ek-radius-lg);
  border: 1px solid #ddd;
}

.stepper-content {
  display: flex;
  justify-content: space-between;
  position: relative;
  z-index: 1;
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  z-index: 2;
  position: relative;
}

.stepper-line {
  position: absolute;
  top: 8px;
  left: 10%;
  right: 10%;
  height: 1px;
  background: #ddd;
  z-index: 1;
}

@media (max-width: 600px) {
  .stepper-content {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ek-space-5);
    padding-left: 10px;
  }

  .step-item {
    flex-direction: row;
    gap: 15px;
    width: 100%;
    align-items: center;
  }

  .stepper-line {
    left: 22px;
    top: 20px;
    bottom: 20px;
    width: 1px;
    height: auto;
  }

  .step-text-container {
    text-align: left;
  }
}

.step-avatar {
  transition: all var(--ek-duration-slow) var(--ek-easing-standard);
}

.step-passed {
  opacity: 0.6;
  filter: grayscale(0.3);
}

.step-title {
  color: #bbb;
  text-align: center;
}

.active-text {
  color: #333 !important;
  font-weight: 900;
}

.passed-text {
  color: #888 !important;
}

@keyframes intense-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--v-theme-primary), 0.7);
  }
  100% {
    box-shadow: 0 0 0 12px rgba(var(--v-theme-primary), 0);
  }
}

/* ADR-0011 Bağlam "pulse/ripple ihlali" — bkz. DetailedExportLogReport.vue'daki
   AYNI gerekçe (ClaimDetailComponent'teki T4f göçüyle birebir): `infinite`
   tekrar korunuyor, tek döngü süresi/eğrisi token'a çekildi. */
.status-pulse-intense {
  animation: intense-pulse var(--ek-duration-slow) var(--ek-easing-standard) infinite !important;
  z-index: 3;
}

.status-pulse-intense::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border-radius: 50%;
  border: 2px solid rgba(var(--v-theme-primary), 0.5);
  animation: ripple-effect var(--ek-duration-slow) var(--ek-easing-standard) infinite;
}

@keyframes ripple-effect {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(1.8);
    opacity: 0;
  }
}
</style>