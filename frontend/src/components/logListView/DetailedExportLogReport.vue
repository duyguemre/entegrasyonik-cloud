<template>
  <div class="report-content-wrapper">
    <LoadingComponent attach=".reportContainer" ref="loadingComponentRef"></LoadingComponent>

    <EkSkeleton v-if="loading && !localItem" type="detail" />

    <!-- `localItem` boş kaldığında (rapor bulunamadı/servis hatası) aksiyon alınabilir boş/hata durumu.
         İş mantığı (veri çekme/`getReport()` yeniden deneme) DEĞİŞMEDİ. -->
    <EkEmptyState v-if="!localItem && !loading" variant="error" title="Rapor verilerine ulaşılamadı"
      message="İşlem raporu henüz hazırlanmamış olabilir veya sunucuyla olan bağlantıda bir sorun yaşanıyor."
      showAction actionText="Yeniden dene" actionIcon="mdi-refresh" @action="getReport()" />

    <div v-if="localItem" class="report-body">

      <div v-if="isFailed" class="solution-band" role="alert">
        <v-icon color="error" size="28" aria-hidden="true">mdi-lightbulb-on-outline</v-icon>
        <div class="solution-band__text">
          <div class="solution-band__title">Sistem Çözüm Önerisi</div>
          <div class="solution-band__message">{{ getSmartSolution(localItem.logs) }}</div>
        </div>
        <v-btn color="error" variant="text" size="small" prepend-icon="mdi-lifebuoy">DESTEK AL</v-btn>
      </div>

      <div class="panel panel--muted">
        <div class="meta-row">
          <PlatformImageComponent :integrationCode="localItem.integrationCode" :width="80" :height="35">
          </PlatformImageComponent>

          <EkStatusChip tone="info" :dot="true"
            :label="PLATFORM_PROCESS_LABELS[localItem.mode as PLATFORM_PROCESS] || localItem.mode" />

          <span class="meta-spacer"></span>
          <div class="meta-item">
            <v-icon size="16" aria-hidden="true">mdi-clock-outline</v-icon>
            <span class="meta-item__label">Başlangıç:</span>
            <span class="meta-item__value">{{ formatDateTime(localItem.createdAt) }}</span>
          </div>
          <div class="meta-item">
            <v-icon size="16" aria-hidden="true">mdi-clock-check</v-icon>
            <span class="meta-item__label">Bitiş:</span>
            <span class="meta-item__value">{{ localItem.completedAt ? formatDateTime(localItem.completedAt) : '-' }}</span>
          </div>
          <div v-if="localItem.nextRunAt && !localItem.completedAt" class="meta-item">
            <v-icon size="16" aria-hidden="true">mdi-calendar-clock</v-icon>
            <span class="meta-item__label">Sonraki İşlem:</span>
            <span class="meta-item__value">{{ formatDateTime(localItem.nextRunAt) }}</span>
          </div>
        </div>

        <div class="stepper-wrapper">
          <div class="stepper-content">
            <div class="stepper-line"></div>
            <div v-for="(step, index) in exportSteps" :key="index" class="step-item">
              <span class="step-dot"
                :class="[stepDotClass(index), currentStepIndex === index && isProcessing ? 'step-dot--processing' : '']"></span>
              <span class="step-title"
                :class="{ 'active-text': currentStepIndex === index, 'passed-text': currentStepIndex > index }">
                {{ step.title }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel product-card">
        <v-img v-if="localItem.image" :src="localItem.image" width="175" height="175" cover
          class="product-card__image" :alt="localItem.title"></v-img>
        <div v-else class="product-card__image product-card__image--empty">
          <v-icon size="40" aria-hidden="true">mdi-image-off</v-icon>
        </div>
        <div class="product-card__body">
          <div class="product-card__title">{{ localItem.title }}</div>

          <div class="choice-list">
            <span v-for="choice in localItem.choices" :key="choice._id" class="choice-pill">
              <span class="choice-pill__key">{{ choice.choiceTitle }}</span>
              <span class="choice-pill__value">{{ choice.choiceValueTitle }}</span>
            </span>
          </div>

          <div class="field-row">
            <div class="field"><span class="field__label">Barkod</span><span class="field__value">{{ localItem.barcode }}</span></div>
            <div class="field"><span class="field__label">Stok Kodu</span><span class="field__value">{{ localItem.stockcode || '-' }}</span></div>
            <div class="field"><span class="field__label">KATEGORİ</span><span class="field__value">{{
              categoriesStore.getCategoryTitle(localItem.category) || '-' }}</span></div>
            <div class="field"><span class="field__label">MARKA</span><span class="field__value">{{
              brandsStore.getBrandTitle(localItem.brand) || '-' }}</span></div>
          </div>

          <div class="price-row">
            <span v-if="localItem.price" class="price-tag">
              <v-icon size="14" aria-hidden="true">mdi-tag-outline</v-icon>
              {{ localItem.price }} TL
            </span>
            <EkStatusChip v-if="localItem.stock !== undefined" tone="success" :label="`${localItem.stock} STOK`" />
          </div>
        </div>
      </div>

      <div class="panel">
        <EkSection title="İşlem Günlüğü ve Akış Analizi">
          <v-timeline density="compact" line-thickness="1">
            <v-timeline-item v-for="(log, idx) in localItem.logs" :key="idx"
              :dot-color="getLogStatusColor(log.status)" size="x-small">
              <div class="log-card" :class="getLogClass(log.status)">
                <div class="log-card-header">
                  <div class="worker-group">
                    <span class="worker-name">{{ translateWorker(log.worker) }}</span>
                    <v-tooltip location="top" max-width="300">
                      <template v-slot:activator="{ props }">
                        <button v-bind="props" type="button" class="help-btn"
                          :aria-label="`${translateWorker(log.worker)} açıklaması`">
                          <v-icon size="14" aria-hidden="true">mdi-help-circle-outline</v-icon>
                        </button>
                      </template>
                      <span class="text-caption">{{ getWorkerDescription(log.worker) }}</span>
                    </v-tooltip>
                  </div>
                  <EkStatusChip :tone="getLogTone(log.status)" :label="translateStatus(log.status)" />
                  <span class="meta-spacer"></span>
                  <div class="time-group">
                    <v-icon size="12" aria-hidden="true">mdi-clock-outline</v-icon>
                    <span class="timestamp">{{ formatDateTime(log.timestamp) }}</span>
                  </div>
                  <div v-if="Number(idx) > 0" class="duration-badge">+ {{
                    calculateDuration(localItem.logs[Number(idx) - 1].timestamp, log.timestamp) }}</div>
                </div>
                <div class="log-card-body">{{ log.message }}</div>
              </div>
            </v-timeline-item>
          </v-timeline>
        </EkSection>
      </div>

      <div class="panel">
        <EkSection title="Performans Analizi">
          <div class="duration-total">
            <v-icon size="18" aria-hidden="true">mdi-timer-sand</v-icon>
            <span class="duration-total__label">TOPLAM SÜREÇ</span>
            <span class="duration-total__value">{{ totalDurationText }}</span>
          </div>
          <v-chart v-if="isMounted" class="chart" theme="entegrasyonik" :option="chartOption" autoresize />
        </EkSection>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, onBeforeUnmount, computed } from 'vue'
import useRestApi from '@/composables/restapi'
import LoadingComponent from '@/components/LoadingComponent.vue'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useBrandsStore } from '@/stores/brandsStore'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import { LegacyGridContainLabel } from 'echarts/features'
import PlatformImageComponent from '../platforms/PlatformImageComponent.vue'
import EkEmptyState from '@/components/ds/EkEmptyState.vue'
import EkSkeleton from '@/components/ds/EkSkeleton.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkSection from '@/components/ds/EkSection.vue'
import { formatDateTime } from '@/composables/format'
import { semanticColorsLight } from '@/design/tokens'
import type { StatusTone } from '@/design/status-map'
import { escapeHtml } from '@/utils/escapeHtml'
import { PLATFORM_PROCESS_LABELS, PLATFORM_PROCESS } from '@/types/PlatformProcess'

use([CanvasRenderer, BarChart, TooltipComponent, GridComponent, LegacyGridContainLabel])

const props = defineProps<{ jobId: string }>()
const emits = defineEmits(['close'])
const restApi = useRestApi()
const loadingComponentRef = ref<any>(null)
const localItem = ref<any>(null)
const loading = ref(false)
let pollTimer: any = null
const categoriesStore = useCategoriesStore()
const brandsStore = useBrandsStore()
const isMounted = ref(false)

const exportSteps = [
  { title: 'Kuyrukta', status: 'QUEUED', icon: 'mdi-queue' },
  { title: 'Ürün Doğrulanıyor', status: 'PREPARING', icon: 'mdi-cog-outline' },
  { title: 'İşlem Pazaryerine Gönderiliyor', status: 'PENDING', icon: 'mdi-tray-arrow-up' },
  { title: 'Gönderim Sorgulanıyor', status: 'SENT', icon: 'mdi-cloud-upload' },
  { title: 'Ürün Onayı Bekleniyor', status: 'WAITING', icon: 'mdi-file-clock' },
  { title: 'Tamamlandı', status: 'COMPLETED', icon: 'mdi-check-all' }
]

const isFailed = computed(() => localItem.value?.status?.toUpperCase() === 'FAILED');

const translateStatus = (status: string) => {
  const s = status?.toUpperCase();
  const translations: any = {
    QUEUED: 'KUYRUKTA',
    PREPARING: 'TANIMLANDI',
    PENDING: 'DOĞRULANDI',
    SENT: 'GÖNDERİLDİ',
    WAITING: 'KONTROL EDİLDİ',
    COMPLETED: 'TAMAMLANDI',
    FAILED: 'BAŞARISIZ',
    ERROR: 'HATA'
  };
  return translations[s] || s;
};

const getSmartSolution = (logs: any[]) => {
  const lastError = [...logs].reverse().find(l => l.status === 'FAILED' || l.status === 'ERROR')?.message?.toLowerCase() || '';
  if (lastError.includes('barcode') || lastError.includes('barkod')) return 'Pazaryerinde bu barkod başka bir ürünle eşleşiyor olabilir. Lütfen barkodu kontrol ediniz.';
  if (lastError.includes('category') || lastError.includes('kategori')) return 'Kategori eşleşmesi eksik veya hatalı. Lütfen kategori ayarlarınızı güncelleyiniz.';
  if (lastError.includes('auth') || lastError.includes('api key')) return 'Pazaryeri API anahtarlarınızın süresi dolmuş veya hatalı olabilir.';
  return 'Sistem şu an pazaryeri ile iletişim kurarken bir engelle karşılaştı. Lütfen 5 dakika sonra tekrar deneyiniz.';
};

const totalDurationText = computed(() => {
  if (!localItem.value?.createdAt) return '-';
  const end = localItem.value.completedAt || new Date();
  return calculateDuration(localItem.value.createdAt, end);
});

const getWorkerDescription = (worker: string) => {
  const w = worker?.toUpperCase() || '';
  const descriptions: any = {
    BATCHCREATOR: 'Tanımlama: Ürünlerinizi uygun paketlere böler ve trafiği düzenleyerek sıraya alır.',
    'CATALOG DISPATCHER': 'Kuyruk Yönetimi: Bekleme listesindeki (QUEUED) ürünleri gruplar, hattın doluluğunu kontrol eder ve trafiği ana üretim bandına sevk eder.',
    'CATALOG VALIDATOR': 'Doğrulama Adımı: Ürün yola çıkmadan önce marka, kategori ve zorunlu alanların doğruluğunu denetler.',
    'CATALOG PUBLISHER': 'Yayınlama Adımı: Verilerinizi pazaryeri diline tercüme eder ve API üzerinden güvenle teslim eder.',
    'CATALOG SENTINEL': 'Kontrol Adımı: Pazaryeri kapısında nöbet tutarak işlemin onaylanıp onaylanmadığını periyodik olarak sorgular.',
    'CATALOG SYNCHRONIZER': 'Senkronizasyon: Pazaryerinden gelen onay müjdesini sistemimize mühürler ve verileri eşitler.'
  };
  return descriptions[w] || 'Sistem bileşeni tarafından yürütülen işlem adımı.';
};

// Grafik verilerini formatlayan fonksiyon
const formatChartValue = (seconds: number) => {
  if (seconds === 0) return '0 sn';
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(Math.round((seconds % 60) * 100) / 100);

  const res = [];
  if (d > 0) res.push(`${d}g`);
  if (h > 0) res.push(`${h}s`);
  if (m > 0) res.push(`${m}dk`);
  if (Number(s) > 0 || res.length === 0) res.push(`${s} sn`);
  return res.join(' ');
};

const chartOption = computed(() => {
  if (!localItem.value?.logs || localItem.value.logs.length < 2) return {};
  const data: any[] = [];
  localItem.value.logs.forEach((log: any, idx: number) => {
    if (idx > 0) {
      const diff = (new Date(log.timestamp).getTime() - new Date(localItem.value.logs[idx - 1].timestamp).getTime()) / 1000;
      data.push({
        name: translateWorker(log.worker),
        value: Math.max(0, diff),
        itemStyle: { color: toneHex(getLogTone(log.status)) }
      });
    }
  });
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const p = params[0];
        return `${escapeHtml(p.name)}<br/>Süre: <b>${escapeHtml(formatChartValue(p.value))}</b>`;
      }
    },
    grid: { top: '15%', left: '3%', right: '3%', bottom: '15%', containLabel: true },
    xAxis: { type: 'category', data: data.map(d => d.name), axisLabel: { fontSize: 10, fontWeight: 'bold' } },
    yAxis: { type: 'value', name: 'Saniye', splitLine: { lineStyle: { type: 'dashed' } } },
    series: [{
      type: 'bar', data: data.map(d => d.value), barWidth: '40%',
      label: {
        show: true,
        position: 'top',
        formatter: (params: any) => formatChartValue(params.value),
        fontWeight: 'bold',
        fontSize: 10
      },
      itemStyle: { borderRadius: [4, 4, 0, 0] }
    }]
  };
});

const currentStepIndex = computed(() => {
  if (!localItem.value) return 0;
  const status = localItem.value.status?.toUpperCase();
  const idx = exportSteps.findIndex(s => s.status === status);
  return idx === -1 ? 0 : idx;
});

const isProcessing = computed(() => {
  if (!localItem.value) return false;
  return !['COMPLETED', 'FAILED', 'CANCELLED'].includes(localItem.value.status?.toUpperCase());
});

const getReport = async (isSilent = false) => {
  if (!props.jobId || !isMounted.value) return;
  let guid = null;
  if (!isSilent) { loading.value = true; guid = loadingComponentRef.value?.info(""); }
  try {
    const res = await restApi.post("IntegrationService/getExportJobDetail", { id: props.jobId });
    if (!isMounted.value) return;
    if (res.success) {
      localItem.value = res.data;
      if (isProcessing.value) startPolling();
      else stopPolling();
    }
  } catch (err) {
    if (!isMounted.value) return;
    stopPolling();
  } finally {
    if (!isMounted.value) return;
    if (!isSilent && guid) { loading.value = false; loadingComponentRef.value?.remove(guid); }
    loading.value = false;
  }
};

const startPolling = () => { stopPolling(); pollTimer = setTimeout(() => { getReport(true) }, 5000); };
const stopPolling = () => { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } };

const calculateDuration = (start: any, end: any) => {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.round((diff / 1000) * 100) / 100;
  return seconds < 0 ? '0 sn' : seconds < 60 ? `${seconds} sn` : `${Math.ceil(seconds / 60)} dk ${seconds % 60} sn`;
};

const translateWorker = (worker: string) => {
  const workers: any = {
    BATCHCREATOR: 'İşlem Tanımlama',
    'CATALOG DISPATCHER': 'Kuyruk ve Görev Dağıtımı', // Yeni: Kuyruktaki işleri yöneten aşama
    'CATALOG SENTINEL': 'Gönderim İşlemi Sorgulama',
    'CATALOG SYNCHRONIZER': 'Ürün Durumu Sorgulama',
    'CATALOG VALIDATOR': 'Ürün Doğrulama',
    'CATALOG PUBLISHER': 'Platforma Gönderim İşlemi'
  };
  return workers[worker?.toUpperCase() || ''] || worker;
};

const getLogClass = (status: string) => {
  const s = status?.toUpperCase();
  if (['FAILED', 'ERROR'].includes(s)) return 'log-error';
  if (['COMPLETED', 'SUCCESS', 'OK'].includes(s)) return 'log-success';
  return ['SENT'].includes(s) ? 'log-sent' : 'log-info';
};

/**
 * İş durumu -> anlamsal ton (ADR-0015 Karar 3.3: "canlı iş-durumu paleti" yerine
 * merkezi anlamsal tonlar; renk tek başına anlam taşımaz, etiket metni her zaman görünür).
 */
const STATUS_TONES: Record<string, StatusTone> = {
  COMPLETED: 'success',
  FAILED: 'danger',
  ERROR: 'danger',
  SENT: 'info',
  WAITING: 'warning',
  PENDING: 'info',
  PREPARING: 'neutral',
  QUEUED: 'neutral',
};

const getLogTone = (status: string): StatusTone => STATUS_TONES[status?.toUpperCase()] || 'neutral';

const TONE_KEY = { success: 'success', danger: 'error', info: 'info', warning: 'warning', neutral: 'neutral' } as const;
/** CSS özel özelliği olarak ton rengi (Vuetify `color`/`dot-color` prop'ları için). */
const toneVar = (tone: StatusTone) => `var(--ek-color-${TONE_KEY[tone]})`;
/** ECharts canvas'ı CSS değişkeni çözemez; tema kaynağındaki değer okunur. */
const toneHex = (tone: StatusTone) => semanticColorsLight[TONE_KEY[tone]];

/** Log satırları için Vuetify `dot-color` değeri. */
const getLogStatusColor = (status: string) => toneVar(getLogTone(status));

/** Akış adımı noktası: aktif adım durumun tonunu, geçilenler başarı tonunu, gelecek adımlar nötr alır. */
const stepDotClass = (index: number) => {
  if (currentStepIndex.value === index) return `step-dot--${getLogTone(localItem.value?.status)}`;
  return currentStepIndex.value > index ? 'step-dot--done' : 'step-dot--upcoming';
};

onMounted(() => {
  isMounted.value = true
  getReport()
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
}

.panel--muted {
  background: var(--ek-color-surface-muted);
}

.solution-band {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
  flex-wrap: wrap;
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-error);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-error-subtle);
}

.solution-band__text {
  flex: 1 1 240px;
  min-width: 0;
}

.solution-band__title {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-error);
}

.solution-band__message {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-default);
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-4);
  padding-bottom: var(--ek-space-3);
}

.meta-spacer {
  flex: 1 1 0;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  white-space: nowrap;
  color: var(--ek-color-content-muted);
}

.meta-item__label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}

.meta-item__value {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

/* Ürün kartı */
.product-card {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--ek-space-5);
}

.product-card__image {
  flex: 0 0 175px;
  width: 175px;
  max-width: 175px;
  height: 175px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-sunken);
}

.product-card__image--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ek-color-content-subtle);
}

.product-card__body {
  display: flex;
  flex-direction: column;
  flex: 1 1 300px;
  min-width: 0;
  gap: var(--ek-space-3);
}

.product-card__title {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.choice-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
}

.choice-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-1) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-muted);
}

.choice-pill__key {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.choice-pill__value {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.field-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-4) var(--ek-space-10);
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-default);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.field__label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.field__value {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}

.price-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
}

.price-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-1) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-info-subtle);
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-info);
}

/* İşlem günlüğü */
.log-card {
  position: relative;
  overflow: hidden;
  margin-bottom: var(--ek-space-1);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
}

.log-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background-color: var(--ek-color-content-subtle);
}

.log-success::before {
  background-color: var(--ek-color-success);
}

.log-error::before {
  background-color: var(--ek-color-error);
}

.log-sent::before {
  background-color: var(--ek-color-info);
}

.log-card-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  background-color: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.worker-group {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.worker-name {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-default);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.help-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--ek-radius-full);
  color: var(--ek-color-content-muted);
  cursor: pointer;
}

.help-btn:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

.time-group {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-muted);
}

.duration-badge {
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-default);
  padding: var(--ek-space-1) var(--ek-space-2);
  border-radius: var(--ek-radius-sm);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
}

.log-card-body {
  padding: var(--ek-space-3);
  font-size: var(--ek-font-size-sm);
  line-height: var(--ek-line-height-normal);
  color: var(--ek-color-content-default);
}

.log-error .log-card-body {
  color: var(--ek-color-error);
  background-color: var(--ek-color-error-subtle);
}

.log-sent .log-card-body {
  color: var(--ek-color-info);
  background-color: var(--ek-color-info-subtle);
}

/* Performans */
.duration-total {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  color: var(--ek-color-primary);
}

.duration-total__label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  letter-spacing: 0.04em;
  color: var(--ek-color-content-muted);
}

.duration-total__value {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.chart {
  min-height: 300px;
  width: 100%;
}

/* Akış adımları */
.stepper-content {
  display: flex;
  justify-content: space-between;
  position: relative;
  z-index: 1;
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

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
  flex: 1;
  z-index: 2;
  position: relative;
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

.step-dot--done,
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
  color: var(--ek-color-success);
}

@media (max-width: 768px) {
  .stepper-content {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ek-space-5);
    padding-left: var(--ek-space-5);
  }

  .stepper-line {
    top: 0;
    bottom: 0;
    left: 28px;
    width: 1px;
    height: 100%;
    right: auto;
  }

  .step-item {
    flex-direction: row;
    align-items: center;
    gap: var(--ek-space-4);
    flex: none;
  }

  .step-title {
    text-align: left;
  }
}
</style>
