<template>
  <div class="report-content-wrapper">
    <LoadingComponent attach=".reportContainer" ref="loadingComponentRef"></LoadingComponent>

    <EkSkeleton v-if="loading && !localItem" type="detail" />

    <div v-if="reportData && localItem" class="report-body">

      <div class="panel panel--muted">
        <div class="meta-row">
          <div class="meta-item">
            <span class="meta-item__label">İşlem No:</span>
            <span class="meta-item__value">{{ localItem.jobId }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-item__label">Platform:</span>
            <PlatformImageComponent :integrationCode="localItem.integrationCode" :width="80" :height="35">
            </PlatformImageComponent>
          </div>
          <div class="meta-item">
            <v-icon size="16" aria-hidden="true">mdi-clock-start</v-icon>
            <span class="meta-item__label">Başlangıç:</span>
            <span class="meta-item__value">{{ formatDate(localItem.startedAt) }}</span>
          </div>
          <div class="meta-item">
            <v-icon size="16" aria-hidden="true">mdi-clock-check</v-icon>
            <span class="meta-item__label">Bitiş:</span>
            <span class="meta-item__value">{{ formatDate(localItem.completedAt) }}</span>
          </div>
        </div>

        <div class="stepper-wrapper">
          <div class="stepper-content">
            <div class="stepper-line"></div>
            <div v-for="(step, index) in steps" :key="index" class="step-item">
              <span class="step-dot"
                :class="[stepDotClass(index, step.status), currentStepIndex === index && isProcessing ? 'step-dot--processing' : '']"></span>
              <span class="step-title"
                :class="{ 'active-text': currentStepIndex === index, 'passed-text': currentStepIndex > index }">
                {{ currentStepIndex === index && localItem.status === 'FAILED' ? 'Hata Oluştu' : (currentStepIndex
                  ===
                  index && localItem.status === 'CANCELLED' ? 'İptal Edildi' : step.title) }}
              </span>
            </div>
          </div>
        </div>

        <v-progress-linear v-if="showProgress" :model-value="progressPercentage" height="16" color="primary"
          class="progress-bar" :aria-label="`İlerleme yüzde ${progressPercentage}`">
          <template v-slot:default="{ value }">
            <strong class="progress-bar__text">{{ Math.ceil(value) }}%</strong>
          </template>
        </v-progress-linear>
      </div>

      <v-row class="mb-2" align="stretch">
        <v-col cols="12" md="5" class="d-flex flex-column">
          <div class="info-grid flex-grow-1">
            <div class="info-pair">
              <div class="info-item-card info-item-card--neutral">
                <div class="info-item-card__label">Toplam Çekilen</div>
                <b class="info-item-card__value info-item-card__value--lg">{{ localItem.totalCount || 0 }}</b>
                <div class="info-item-card__hint">Mağazanızdan çekilen toplam ham ürün ve varyant kaydı.</div>
              </div>
              <div class="info-item-card info-item-card--warning">
                <div class="info-item-card__label info-item-card__label--warning">Kritik Veri Eksikliği</div>
                <b class="info-item-card__value info-item-card__value--warning">{{ localItem.invalidCount || 0 }}</b>
                <div class="info-item-card__hint">Eksik eşleşme nedeniyle işleme alınamayan ürünler.</div>
              </div>
            </div>

            <div class="info-item-card info-item-card--info">
              <div class="info-item-card__head">
                <v-icon color="info" size="small" aria-hidden="true">mdi-check-decagram</v-icon>
                <span class="info-item-card__label info-item-card__label--info">Aday Aktarım</span>
                <v-spacer></v-spacer>
                <b class="info-item-card__value info-item-card__value--info">{{ localItem.validCount || 0 }}</b>
              </div>
              <div class="info-item-card__hint">Zenginleştirme süreci tamamlanmış, sisteme girmeye hazır ürünler.</div>
            </div>
            <div class="info-item-card info-item-card--success">
              <div class="info-item-card__head">
                <v-icon color="success" size="small" aria-hidden="true">mdi-check-circle-outline</v-icon>
                <span class="info-item-card__label info-item-card__label--success">Aktarılan Varyant</span>
                <v-spacer></v-spacer>
                <b class="info-item-card__value info-item-card__value--success">{{ localItem.processedCount || 0 }}</b>
              </div>
              <div class="info-item-card__hint">Tüm kontrollerden geçerek sisteme işlenen nihai ürünler.</div>
            </div>
            <div class="info-item-card info-item-card--neutral">
              <div class="info-item-card__head">
                <v-icon size="small" aria-hidden="true">mdi-content-copy</v-icon>
                <span class="info-item-card__label">Mevcut/Mükerrer Ürünler</span>
                <v-spacer></v-spacer>
                <b class="info-item-card__value">{{ localItem.duplicateCount || 0 }}</b>
              </div>
              <div class="info-item-card__hint">Sistemde zaten kayıtlı olduğu için atlanan ürünler.</div>
            </div>
            <div class="info-item-card info-item-card--danger">
              <div class="info-item-card__head">
                <v-icon color="error" size="small" aria-hidden="true">mdi-close-octagon</v-icon>
                <span class="info-item-card__label info-item-card__label--danger">İşlem Hatası</span>
                <v-spacer></v-spacer>
                <b class="info-item-card__value info-item-card__value--danger">{{ localItem.failedCount || 0 }}</b>
              </div>
              <div class="info-item-card__hint">İşlem sırasında oluşan beklenmedik teknik kesintiler.</div>
            </div>
          </div>
        </v-col>
        <v-col cols="12" md="7">
          <div class="chart-card">
            <v-chart v-if="isMounted" class="chart" theme="entegrasyonik" :option="chartOption" autoresize />
          </div>
        </v-col>
      </v-row>

      <div v-if="allImpactedCategories.length" class="panel panel--muted mapping-section">
        <div class="mapping-section__head">
          <v-icon color="error" aria-hidden="true">mdi-tag-off</v-icon>
          <h3 class="mapping-section__title">Eksik Eşleştirme Detayları</h3>
        </div>
        <div class="mapping-section__desc">
          Pazaryerinden çekilen ürünlerin sisteme tam entegre edilebilmesi için kategori eşleşmelerinin ve ürün
          özellik tanımlamalarının tamamlanması gerekmektedir.
        </div>

        <div class="legend-row">
          <div class="legend-item">
            <span class="legend-dot legend-dot--success"></span>
            <span class="legend-item__text">Eşleşme Tamam</span>
          </div>
          <div class="legend-item">
            <span class="legend-dot legend-dot--danger"></span>
            <span class="legend-item__text">Eşleşme Bekleniyor</span>
          </div>
          <v-divider vertical class="mx-1 hidden-xs-only"></v-divider>
          <span class="legend-hint">
            * Kategori ve seçeneklerin üzerine tıklayarak eşleştirmeleri anlık olarak tamamlayabilirsiniz.
          </span>
        </div>

        <div class="d-flex flex-column cat-list">
          <div v-for="(catId, index) in allImpactedCategories" :key="index" class="cat-row"
            :class="reportData.missingCategories?.includes(catId) ? 'cat-row--danger' : 'cat-row--warning'">

            <div class="cat-row__head">
              <div class="cat-row__path">
                <span v-if="resolvedCategories[catId]" class="cat-row__path-inner">
                  <template v-if="resolvedCategories[catId].path">
                    <span class="cat-row__crumb">{{
                      resolvedCategories[catId].path.replaceAll('/', ' / ') }}</span>
                  </template>

                  <v-menu :model-value="activeMenuCatId === catId" scroll-strategy="block"
                    @update:model-value="(val) => val ? activeMenuCatId = catId : activeMenuCatId = null"
                    v-if="reportData.missingCategories?.includes(catId)" :close-on-content-click="false"
                    location="bottom start" offset="5" transition="scale-transition">
                    <template v-slot:activator="{ props: menuProps }">
                      <button v-bind="menuProps" type="button" class="map-chip"
                        :class="attributeMappingStore.isIntegrationCategoryMapped(localItem.integrationCode, catId) ? 'map-chip--success' : 'map-chip--danger'">
                        {{ resolvedCategories[catId].last }}
                      </button>
                    </template>

                    <v-card :width="$vuetify.display.smAndDown ? '95vw' : '700'" class="map-menu-card"
                      :class="{ 'map-menu-card--mobile': $vuetify.display.smAndDown }">
                      <div class="map-menu-card__head">
                        <v-icon size="14" color="warning" aria-hidden="true">mdi-link-variant</v-icon>
                        <span class="map-menu-card__title">Platform Kategori Eşleştirme</span>
                      </div>
                      <DetailedImportLogReportMissingCategory :integrationCode="localItem.integrationCode"
                        :platformCategoryId="catId" @close="activeMenuCatId = null">
                      </DetailedImportLogReportMissingCategory>
                    </v-card>
                  </v-menu>

                  <span v-else class="cat-row__name-warning">
                    {{ resolvedCategories[catId].last }}
                  </span>
                </span>
                <span v-else class="cat-row__loading">Kategori bilgisi yükleniyor...</span>
              </div>

              <button type="button" class="count-chip"
                :class="reportData.missingCategories?.includes(catId) ? 'count-chip--danger' : 'count-chip--warning'"
                @click="copyToClipboard(catId)"
                :aria-label="`${getMissingCategoryProductCount(catId)} ürün — kategori kimliğini kopyala`">
                {{ getMissingCategoryProductCount(catId) }}
              </button>
            </div>

            <div v-if="groupedMissingAttributes[catId]" class="attr-groups">
              <div v-for="(attrData, attrName) in groupedMissingAttributes[catId]" :key="attrName"
                class="attr-group">
                <span class="attr-group__name"
                  :class="attributeMappingStore.isIntegrationAttributeMapped(localItem.integrationCode, catId, attrData.id) ? 'attr-group__name--success' : 'attr-group__name--warning'">
                  {{ attrName }}
                </span>

                <div class="attr-group__values">
                  <v-menu scroll-strategy="block"
                    :model-value="activeMenuCatId === catId + attr.attributeId + attr.attributeValueId + attr.attributeValue"
                    @update:model-value="(val) => val ? activeMenuCatId = catId + attr.attributeId + attr.attributeValueId + attr.attributeValue : activeMenuCatId = null"
                    v-for="(attr, aIdx) in attrData.values" :key="aIdx" :close-on-content-click="false"
                    location="bottom start" offset="5" transition="scale-transition">
                    <template v-slot:activator="{ props: menuProps }">
                      <button v-bind="menuProps" type="button" class="map-chip"
                        :class="attributeMappingStore.isIntegrationAttributeValueMapped(localItem.integrationCode, catId,
                          attr.attributeId, attr.attributeValuId, attr.attributeValue) ? 'map-chip--success' : 'map-chip--warning'">
                        {{ attr.attributeValue }}
                      </button>
                    </template>

                    <v-card :width="$vuetify.display.smAndDown ? '95vw' : '700'" class="map-menu-card"
                      :class="{ 'map-menu-card--mobile': $vuetify.display.smAndDown }">
                      <div class="map-menu-card__head">
                        <v-icon size="14" color="warning" aria-hidden="true">mdi-link-variant</v-icon>
                        <span class="map-menu-card__title">Platform Seçenek Eşleştirme</span>
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

    <EkEmptyState v-else-if="!loading" variant="error" title="Rapor verilerine ulaşılamadı"
      message="İşlem raporu henüz hazırlanmamış olabilir veya sunucuyla olan bağlantıda bir sorun yaşanıyor."
      showAction actionText="Yeniden dene" actionIcon="mdi-refresh" @action="getReport()" />
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
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'
import { formatDateTime } from '@/composables/format'
import { semanticColorsLight } from '@/design/tokens'
import type { StatusTone } from '@/design/status-map'

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
  { title: 'Ürünler Çekiliyor', status: 'FETCHING', icon: 'mdi-download-outline' },
  { title: 'Analiz Ediliyor', status: 'READY_TO_SYNC', icon: 'mdi-file-find-outline' },
  { title: 'Ürünler Aktarılıyor', status: 'PROCESSING', icon: 'mdi-refresh' },
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
  const colors = [toneHex('warning'), toneHex('success'), toneHex('neutral'), toneHex('danger')];
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'none' } },
    grid: { top: '15%', left: '3%', right: '4%', bottom: '5%', containLabel: true },
    xAxis: { type: 'category', data: categories, axisTick: { show: false } },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
    series: [{
      name: 'Ürün Sayısı', type: 'bar', barWidth: '40%',
      data: values.map((val, idx) => ({ value: val, itemStyle: { color: colors[idx] } })),
      label: { show: true, position: 'top' }
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
/**
 * İş durumu -> anlamsal ton (ADR-0015 Karar 3.3: bespoke "canlı iş-durumu paleti" yerine
 * merkezi anlamsal tonlar; renk tek başına anlam taşımaz, adım etiketi her zaman görünür).
 */
const STATUS_TONES: Record<string, StatusTone> = {
  COMPLETED: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
  PROCESSING: 'info',
  READY_TO_SYNC: 'info',
  FETCHING: 'warning',
  WAITING_FOR_FETCH: 'neutral',
};
const TONE_KEY = { success: 'success', danger: 'error', info: 'info', warning: 'warning', neutral: 'neutral' } as const;
/** ECharts canvas'ı CSS değişkeni çözemez; tema kaynağındaki değer okunur. */
const toneHex = (tone: StatusTone) => semanticColorsLight[TONE_KEY[tone]];
const statusTone = (status: string): StatusTone => STATUS_TONES[status?.toUpperCase()] || 'neutral';

/** Akış adımı noktası: aktif adım durumun tonunu, geçilenler kendi adım tonunu, gelecek adımlar nötr alır. */
const stepDotClass = (index: number, stepStatus: string) => {
  if (currentStepIndex.value === index) return `step-dot--${statusTone(localItem.value?.status)}`;
  return currentStepIndex.value > index ? `step-dot--${statusTone(stepStatus)} step-dot--done` : 'step-dot--upcoming';
};

const formatDate = (date: any) => date ? formatDateTime(date) : '-';

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

.report-body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding-right: var(--ek-space-3);
}

.panel {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
  padding: var(--ek-space-4);
  position: relative;
  overflow: hidden;
}

.panel--muted {
  background: var(--ek-color-surface-muted);
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-5);
  padding-bottom: var(--ek-space-3);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
}

.meta-item__label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}

.meta-item__value {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

/* Sayaç kartları */
.info-grid {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  height: 100%;
}

.info-pair {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.info-pair > .info-item-card {
  flex: 1 1 180px;
}

.info-item-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex-grow: 1;
  gap: var(--ek-space-1);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-left: 4px solid var(--ek-color-border-strong);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
}

.info-item-card--neutral {
  border-left-color: var(--ek-color-content-subtle);
}

.info-item-card--warning {
  border-left-color: var(--ek-color-warning);
}

.info-item-card--info {
  border-left-color: var(--ek-color-info);
}

.info-item-card--success {
  border-left-color: var(--ek-color-success);
}

.info-item-card--danger {
  border-left-color: var(--ek-color-error);
}

.info-item-card__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.info-item-card__label {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-default);
}

.info-item-card__label--warning {
  color: var(--ek-color-warning);
}

.info-item-card__label--info {
  color: var(--ek-color-info);
}

.info-item-card__label--success {
  color: var(--ek-color-success);
}

.info-item-card__label--danger {
  color: var(--ek-color-error);
}

.info-item-card__value {
  font-size: var(--ek-font-size-xl);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.info-item-card__value--lg {
  font-size: var(--ek-font-size-2xl);
}

.info-item-card__value--warning {
  color: var(--ek-color-warning);
}

.info-item-card__value--info {
  color: var(--ek-color-info);
}

.info-item-card__value--success {
  color: var(--ek-color-success);
}

.info-item-card__value--danger {
  color: var(--ek-color-error);
}

.info-item-card__hint {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.chart-card {
  display: flex;
  align-items: center;
  height: 100%;
  width: 100%;
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
}

.chart {
  min-height: 400px;
  width: 100%;
}

.progress-bar {
  margin-top: var(--ek-space-3);
  border-radius: var(--ek-radius-full);
}

.progress-bar__text {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-surface);
}

/* Eksik eşleştirme */
.mapping-section {
  margin-top: var(--ek-space-4);
}

.mapping-section__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-1);
}

.mapping-section__title {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.mapping-section__desc {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
  margin-bottom: var(--ek-space-4);
}

.legend-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-4);
  margin-bottom: var(--ek-space-4);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-1) var(--ek-space-3);
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface);
}

.legend-item__text {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-default);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-full);
}

.legend-dot--success {
  background-color: var(--ek-color-success);
}

.legend-dot--danger {
  background-color: var(--ek-color-error);
}

.legend-hint {
  font-size: var(--ek-font-size-xs);
  font-style: italic;
  color: var(--ek-color-content-muted);
}

.cat-list {
  gap: var(--ek-space-3);
}

.cat-row {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-left: 4px solid var(--ek-color-border-strong);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-sm);
}

.cat-row--danger {
  border-left-color: var(--ek-color-error);
}

.cat-row--warning {
  border-left-color: var(--ek-color-warning);
}

.cat-row__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
}

.cat-row__path {
  font-size: var(--ek-font-size-xs);
  line-height: var(--ek-line-height-normal);
  min-width: 0;
}

.cat-row__path-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1);
}

.cat-row__crumb {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-medium);
}

.cat-row__name-warning {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-warning);
}

.cat-row__loading {
  font-style: italic;
  color: var(--ek-color-content-muted);
}

.map-chip,
.count-chip {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--ek-space-2);
  min-height: 24px;
  border: 1px solid var(--ek-color-border-strong);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard);
}

.map-chip:focus-visible,
.count-chip:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

.map-chip--danger {
  color: var(--ek-color-error);
  background: var(--ek-color-error-subtle);
}

.map-chip--warning {
  color: var(--ek-color-warning);
  background: var(--ek-color-warning-subtle);
}

.map-chip--success {
  color: var(--ek-color-success);
  background: var(--ek-color-success-subtle);
}

.map-chip:hover {
  background: var(--ek-color-surface-sunken);
}

.count-chip {
  border-style: dashed;
}

.count-chip--danger {
  color: var(--ek-color-error);
}

.count-chip--warning {
  color: var(--ek-color-warning);
}

.attr-groups {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.attr-group {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.attr-group__name {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
}

.attr-group__name--success {
  color: var(--ek-color-success);
}

.attr-group__name--warning {
  color: var(--ek-color-warning);
}

.attr-group__values {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.map-menu-card {
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  overflow-y: auto;
  margin: 0 auto;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  box-shadow: var(--ek-shadow-lg);
}

.map-menu-card--mobile {
  margin-top: 150px;
}

.map-menu-card__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin-bottom: var(--ek-space-2);
}

.map-menu-card__title {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

/* Akış adımları */
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
  gap: var(--ek-space-2);
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
  background: var(--ek-color-border-strong);
  z-index: 1;
}

.step-dot {
  width: 16px;
  height: 16px;
  border-radius: var(--ek-radius-full);
  border: 2px solid var(--ek-color-surface);
  background: var(--ek-color-border-strong);
  position: relative;
  z-index: 2;
  transition: background-color var(--ek-duration-slow) var(--ek-easing-standard);
}

.step-dot--upcoming {
  background: var(--ek-color-border-strong);
}

.step-dot--success {
  background: var(--ek-color-success);
}

.step-dot--danger {
  background: var(--ek-color-error);
}

.step-dot--info {
  background: var(--ek-color-info);
}

.step-dot--warning {
  background: var(--ek-color-warning);
}

.step-dot--neutral {
  background: var(--ek-color-content-subtle);
}

.step-dot--done {
  opacity: 0.7;
}

/* İşlemde olan adım: sakin, statik halka (sonsuz animasyon yok). */
.step-dot--processing {
  box-shadow: 0 0 0 4px var(--ek-color-info-subtle);
}

.step-title {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  text-transform: uppercase;
  text-align: center;
  color: var(--ek-color-content-muted);
}

.active-text {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.passed-text {
  color: var(--ek-color-content-muted);
}

@media (max-width: 600px) {
  .stepper-content {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ek-space-5);
    padding-left: var(--ek-space-3);
  }

  .step-item {
    flex-direction: row;
    gap: var(--ek-space-4);
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

  .step-title {
    text-align: left;
  }
}
</style>
