<!--
  frontend/src/components/logListView/DetailedImportLogReport.vue

  FE-LOCAL-1048 — Ürün Çekim İşlemi Detaylı Raporu, ana sayfa / bölüm panolarıyla AYNI dilde (yalnız sunum; veri,
  yoklama, eşleştirme menüleri ve API çağrıları DEĞİŞMEDİ):
    kayıt özeti        işlem no + kanal + durum · ince çizgiyle ayrılan bilgi hücreleri (başlangıç / bitiş)
    AKIŞ               çerçeveli ikon kapsülleriyle adımlar (+ aktarım sürerken ilerleme çubuğu)
    SONUÇ ÖZETİ        özet şeridi — iş kaydındaki 6 sayaç
    DAĞILIM            toplam + tek yatay oran çubuğu + satırlar (ListDistributionCard) · sütun grafiği
    EKSİK EŞLEŞTİRME   düz kart; kategori satırları ince çizgiyle ayrılır, tıklanınca eşleştirme menüsü açılır
-->
<template>
  <div class="report-content-wrapper">
    <LoadingComponent attach=".reportContainer" ref="loadingComponentRef"></LoadingComponent>

    <EkSkeleton v-if="loading && !localItem" type="detail" />

    <div v-if="reportData && localItem" class="report-body">

      <!-- Kayıt özeti -->
      <section class="panel record" aria-label="Çekim işlemi">
        <div class="record__main">
          <EkIconTile icon="mdi-download-outline" tone="action" size="lg" />
          <div class="record__titles">
            <div class="record__eyebrow">Çekim işlemi</div>
            <div class="meta-item">
              <span class="meta-item__label ek-sr-only">İşlem No:</span>
              <span class="meta-item__value record__id ek-num">{{ localItem.jobId }}</span>
            </div>
          </div>
          <div class="record__channel">
            <span class="meta-item__label ek-sr-only">Platform:</span>
            <PlatformImageComponent :integrationCode="localItem.integrationCode" :width="80" :height="35">
            </PlatformImageComponent>
            <EkStatusChip :tone="statusTone(localItem.status)" :label="statusLabel" />
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <span class="field__label">Başlangıç</span>
            <span class="field__value ek-num">{{ formatDate(localItem.startedAt) }}</span>
          </div>
          <div class="field">
            <span class="field__label">Bitiş</span>
            <span class="field__value ek-num">{{ formatDate(localItem.completedAt) }}</span>
          </div>
          <div class="field">
            <span class="field__label">Adım</span>
            <span class="field__value ek-num">{{ currentStepIndex + 1 }} / {{ steps.length }}</span>
          </div>
        </div>
      </section>

      <ListDashSection label="Akış">
        <div class="panel stepper-wrapper">
          <ol class="stepper-content" aria-label="Çekim adımları">
            <li v-for="(step, index) in steps" :key="index" class="step-item"
              :class="{ 'is-passed': currentStepIndex > index, 'is-active': currentStepIndex === index, 'is-upcoming': currentStepIndex < index }"
              :aria-current="currentStepIndex === index ? 'step' : undefined">
              <span class="step-dot"
                :class="[stepDotClass(index, step.status), currentStepIndex === index && isProcessing ? 'step-dot--processing' : '']">
                <EkIconTile :icon="stepIcon(index, step.icon)" :tone="stepTone(index)" />
              </span>
              <span class="step-title"
                :class="{ 'active-text': currentStepIndex === index, 'passed-text': currentStepIndex > index }">
                {{ currentStepIndex === index && localItem.status === 'FAILED' ? 'Hata oluştu' : (currentStepIndex
                  ===
                  index && localItem.status === 'CANCELLED' ? 'İptal edildi' : step.title) }}
              </span>
            </li>
          </ol>

          <div v-if="showProgress" class="progress">
            <v-progress-linear :model-value="progressPercentage" height="8" color="primary" rounded
              class="progress-bar" :aria-label="`İlerleme yüzde ${progressPercentage}`" />
            <strong class="progress-bar__text ek-num">{{ Math.ceil(progressPercentage) }}%</strong>
          </div>
        </div>
      </ListDashSection>

      <ListDashSection label="Sonuç özeti">
        <ListSummaryStrip :cells="countCells" label="Sonuç özeti" />
      </ListDashSection>

      <ListDashSection label="Dağılım">
        <div class="dist-grid">
          <ListDistributionCard title="Ürün sonuçları" subtitle="Çekilen kayıtların sonuca göre dağılımı" icon="mdi-chart-donut"
            unit="ürün" :rows="distribution" empty-text="Bu işlemde henüz sonuçlanan ürün yok." />
          <EkCard title="Sonuç karşılaştırması" subtitle="Eksik veri · aktarılan · mevcut · hata" icon="mdi-chart-bar" icon-tone="info">
            <v-chart v-if="isMounted" class="chart" :theme="chartTheme" :option="chartOption" autoresize />
          </EkCard>
        </div>
      </ListDashSection>

      <ListDashSection v-if="allImpactedCategories.length" label="Eşleştirme">
        <div class="panel mapping-section">
          <div class="mapping-section__head">
            <EkIconTile icon="mdi-tag-off-outline" tone="error" size="sm" />
            <div class="mapping-section__titles">
              <h3 class="mapping-section__title">Eksik Eşleştirme Detayları</h3>
              <div class="mapping-section__desc">
                Pazaryerinden çekilen ürünlerin sisteme tam entegre edilebilmesi için kategori eşleşmelerinin ve ürün
                özellik tanımlamalarının tamamlanması gerekmektedir.
              </div>
            </div>
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
            <span class="legend-hint">
              Kategori ve seçeneklerin üzerine tıklayarak eşleştirmeleri anlık olarak tamamlayabilirsiniz.
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
                          <EkIconTile icon="mdi-link-variant" tone="action" size="sm" />
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
                          <EkIconTile icon="mdi-link-variant" tone="action" size="sm" />
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
      </ListDashSection>
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
import { EkCard, EkEmptyState, EkIconTile, EkSkeleton, EkStatusChip, type EkTone } from '@entegrasyonik/ui/components'
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import ListDistributionCard, { type ListDistributionRow } from '@/components/page/ListDistributionCard.vue'
import { formatDateTime, formatNumber } from '@entegrasyonik/ui/format'
import { useChartColors, useChartTheme } from '@/composables/useChartTheme'
import type { StatusTone } from '@/design/status-map'
import { reportPollInterval } from '@/stores/publicConfig'

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
  { title: 'Tamamlandı', status: 'COMPLETED', icon: 'mdi-check-decagram-outline' }
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

const startPolling = () => { stopPolling(); pollTimer = setTimeout(() => { getReport(true) }, reportPollInterval()); };
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
// FR2-DARK: grafik teması ve seri renkleri etkin moda göre (light/dark).
const chartTheme = useChartTheme();
const chartColors = useChartColors();
const toneHex = (tone: StatusTone) => chartColors.value[TONE_KEY[tone]];
const statusTone = (status: string): StatusTone => STATUS_TONES[status?.toUpperCase()] || 'neutral';

/** Akış adımı noktası: aktif adım durumun tonunu, geçilenler kendi adım tonunu, gelecek adımlar nötr alır. */
const stepDotClass = (index: number, stepStatus: string) => {
  if (currentStepIndex.value === index) return `step-dot--${statusTone(localItem.value?.status)}`;
  return currentStepIndex.value > index ? `step-dot--${statusTone(stepStatus)} step-dot--done` : 'step-dot--upcoming';
};

const formatDate = (date: any) => date ? formatDateTime(date) : '-';

// ---- FE-LOCAL-1048: sunum yardımcıları (özet şeridi, dağılım kartı, adım tonu, durum etiketi) ----
/** Akış adımının ikon kapsülü tonu: geçilen = başarı, etkin = işin durum tonu, sıradaki = nötr. */
const stepTone = (index: number): EkTone => {
  if (currentStepIndex.value > index) return 'success'
  if (currentStepIndex.value < index) return 'neutral'
  const tone = TONE_KEY[statusTone(localItem.value?.status)]
  return tone === 'neutral' ? 'action' : tone
}

/** Geçilen adım onay imi, hata/iptal ile biten etkin adım uyarı imi, diğerleri adımın kendi ikonu. */
const stepIcon = (index: number, icon: string) => {
  if (currentStepIndex.value > index) return 'mdi-check'
  const status = String(localItem.value?.status ?? '').toUpperCase()
  if (currentStepIndex.value === index && status === 'FAILED') return 'mdi-alert-circle-outline'
  if (currentStepIndex.value === index && status === 'CANCELLED') return 'mdi-cancel'
  return icon
}

const STATUS_TITLES: Record<string, string> = { FAILED: 'Hata oluştu', CANCELLED: 'İptal edildi' }
const statusLabel = computed(() => {
  const status = String(localItem.value?.status ?? '').toUpperCase()
  return STATUS_TITLES[status] ?? steps.find((s) => s.status === status)?.title ?? (localItem.value?.status || '—')
})

const countOf = (field: string) => Number(localItem.value?.[field]) || 0
const countCell = (key: string, label: string, hint: string, icon: string, tone: EkTone): ListSummaryCell => {
  const n = countOf(key)
  return { key, label, hint, icon, tone, value: formatNumber(n), zero: !n }
}
/** İş kaydındaki 6 sayaç (etiketler karakterizasyonla aynı). */
const countCells = computed<ListSummaryCell[]>(() => [
  countCell('totalCount', 'Toplam Çekilen', 'Mağazadan çekilen ham kayıt', 'mdi-package-variant-closed', 'action'),
  countCell('validCount', 'Aday Aktarım', 'Sisteme girmeye hazır', 'mdi-check-decagram-outline', 'info'),
  countCell('processedCount', 'Aktarılan Varyant', 'Sisteme işlenen ürün', 'mdi-check-circle-outline', 'success'),
  countCell('duplicateCount', 'Mevcut / Mükerrer', 'Zaten kayıtlı, atlandı', 'mdi-content-copy', 'neutral'),
  countCell('invalidCount', 'Kritik Veri Eksikliği', 'Eksik eşleşme nedeniyle', 'mdi-alert-outline', 'warning'),
  countCell('failedCount', 'İşlem Hatası', 'Teknik kesinti', 'mdi-close-octagon-outline', 'error'),
])

/** Sonuca göre dağılım (grafikle aynı dört sonuç). */
const distribution = computed<ListDistributionRow[]>(() => [
  { key: 'processedCount', label: 'Aktarılan', count: countOf('processedCount'), tone: 'success' },
  { key: 'duplicateCount', label: 'Zaten mevcut', count: countOf('duplicateCount'), tone: 'neutral' },
  { key: 'invalidCount', label: 'Eksik veri', count: countOf('invalidCount'), tone: 'warning' },
  { key: 'failedCount', label: 'Hata alan', count: countOf('failedCount'), tone: 'error' },
])

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
/* FE-LOCAL-1050: TEK kaydırma — rapor kendi içinde kaymaz (sabit yükseklik + iç kaydırma kaldırıldı); kaydıran yalnız
   diyalog gövdesidir. Önceden gövde ve rapor ayrı ayrı kayıyordu (sağda iki kaydırma çubuğu). */
.report-content-wrapper {
  min-height: 240px;
}

.report-body {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  padding-right: var(--ek-space-3);
}

/* Düz yüzey + ince çerçeve (gölge / degrade yok). */
.panel {
  position: relative;
  margin: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  overflow: hidden;
}

/* Kayıt özeti */
.record {
  display: flex;
  flex-direction: column;
}

.record__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4) var(--ek-space-5);
}

.record__titles {
  display: flex;
  flex: 1 1 220px;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.record__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.record__eyebrow::before {
  content: '';
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.record__id {
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  overflow-wrap: anywhere;
}

.record__channel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.meta-item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
}

.meta-item__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.meta-item__value {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

/* Bilgi hücreleri: ince çizgiyle ayrılır (KPI şeridiyle aynı aile). */
.field-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3) 0;
  padding: var(--ek-space-3) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 0 var(--ek-space-5);
}

.field:first-child {
  padding-left: 0;
}

.field + .field {
  border-left: 1px solid var(--ek-color-border-default);
}

.field__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.field__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

/* Akış adımları: çerçeveli ikon kapsülleri, aralarında ince çizgi. */
.stepper-wrapper {
  display: flex;
  flex-direction: column;
}

.stepper-content {
  display: flex;
  justify-content: space-between;
  margin: 0;
  padding: var(--ek-space-5) var(--ek-space-4) var(--ek-space-4);
  list-style: none;
}

.step-item {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
}

/* Adımı bir sonrakine bağlayan çizgi (geçilen adımdan sonra başarı tonu). */
.step-item + .step-item::before {
  content: '';
  position: absolute;
  top: 18px;
  right: calc(50% + 26px);
  left: calc(-50% + 26px);
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-border-default);
}

.step-item.is-passed + .step-item::before {
  background: var(--ek-color-success);
}

.step-dot {
  position: relative;
  z-index: 1;
  display: inline-flex;
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
}

.step-item.is-upcoming .step-dot {
  opacity: 0.6;
}

/* İşlemde olan adım: sakin, statik halka (sonsuz animasyon yok). */
.step-dot--processing {
  box-shadow: 0 0 0 3px var(--ek-color-info-subtle);
}

.step-title {
  padding: 0 var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-medium);
  text-align: center;
}

.active-text {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.passed-text {
  color: var(--ek-color-content-default);
}

.progress {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.progress-bar {
  flex: 1;
  border-radius: var(--ek-radius-full);
}

.progress-bar__text {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

/* Dağılım: oran kartı + sütun grafiği yan yana. */
.dist-grid {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: var(--ek-space-4);
  align-items: stretch;
}

.chart {
  min-height: 280px;
  width: 100%;
}

/* Eksik eşleştirme */
.mapping-section {
  display: flex;
  flex-direction: column;
}

.mapping-section__head {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.mapping-section__titles {
  min-width: 0;
}

.mapping-section__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.mapping-section__desc {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.legend-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2) var(--ek-space-4);
  padding: var(--ek-space-2) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.legend-item__text {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.legend-dot--success {
  background-color: var(--ek-color-success);
}

.legend-dot--danger {
  background-color: var(--ek-color-error);
}

.legend-hint {
  margin-left: auto;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

/* Kategori satırları: düz, ince çizgiyle ayrılır; ton solda küçük karede (kalın kenar şeridi yok). */
.cat-row {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-5);
}

.cat-row + .cat-row {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.cat-row__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
}

.cat-row__head::before {
  content: '';
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  background: var(--ek-color-warning);
}

.cat-row--danger .cat-row__head::before {
  background: var(--ek-color-error);
}

.cat-row__path {
  flex: 1;
  min-width: 0;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-line-height-normal);
}

.cat-row__path-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-1);
}

.cat-row__crumb {
  color: var(--ek-color-content-muted);
}

.cat-row__name-warning {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.cat-row__loading {
  color: var(--ek-color-content-muted);
}

.map-chip,
.count-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.map-chip:focus-visible,
.count-chip:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.map-chip--danger {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.map-chip--warning {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.map-chip--success {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}

.map-chip:hover {
  border-color: var(--ek-color-border-strong);
}

.count-chip {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.count-chip:hover {
  border-color: var(--ek-color-border-strong);
}

.attr-groups {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding-left: calc(10px + var(--ek-space-2));
}

.attr-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}

.attr-group__name {
  min-width: 96px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.attr-group__name--success {
  color: var(--ek-color-success-emphasis);
}

.attr-group__name--warning {
  color: var(--ek-color-warning-emphasis);
}

.attr-group__values {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

/* Eşleştirme menüsü: düz yüzey + ince çerçeve; açılır katman olduğu için tek yükseltme gölgesi. */
.map-menu-card {
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  overflow-y: auto;
  margin: 0 auto;
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-lg);
}

.map-menu-card--mobile {
  margin-top: 150px;
}

.map-menu-card__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-3);
}

.map-menu-card__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-type-heading-weight);
}

@media (max-width: 959px) {
  .dist-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 600px) {
  .field,
  .field:first-child {
    flex: 1 1 40%;
    padding: 0;
  }

  .field + .field {
    border-left: 0;
  }

  .stepper-content {
    flex-direction: column;
    gap: var(--ek-space-3);
  }

  .step-item {
    flex: none;
    flex-direction: row;
    gap: var(--ek-space-3);
  }

  .step-item + .step-item::before {
    top: calc(-1 * var(--ek-space-3));
    right: auto;
    left: 17px;
    width: 2px;
    height: var(--ek-space-3);
  }

  .step-title {
    text-align: left;
  }

  .legend-hint {
    margin-left: 0;
  }
}
</style>
