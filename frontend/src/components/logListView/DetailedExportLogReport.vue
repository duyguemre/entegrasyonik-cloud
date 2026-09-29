<template>


  <div class="report-content-wrapper">
    <LoadingComponent attach=".reportContainer" ref="loadingComponentRef"></LoadingComponent>

    <!-- ADR-0011 Karar 2 KAPSAM ("eksik boş/hata/yükleniyor durumlarını tamamla") —
         `localItem` boş kaldığında (rapor bulunamadı/servis hatası) HİÇBİR şey
         render OLMUYORDU (DetailedImportLogReport.vue'nin AYNI durum için zaten
         sahip olduğu "Rapor Verilerine Ulaşılamadı" geri dönüşünden FARKLI olarak
         eksikti). İş mantığı (veri çekme/`getReport()` yeniden deneme) DEĞİŞMEDİ,
         yalnızca eksik görsel durum eklendi (bkz. BACKLOG.md, e2e/specs/logs.spec.ts). -->
    <div v-if="!localItem && !loading" class="pa-0 pr-3">
      <EmptyState icon="mdi-database-off-outline" title="Rapor Verilerine Ulaşılamadı"
        message="İşlem raporu henüz hazırlanmamış olabilir veya sunucuyla olan bağlantıda bir sorun yaşanıyor."
        showAction actionText="YENİDEN DENE" actionIcon="mdi-refresh" @action="getReport()" />
    </div>

    <div v-if="localItem" class="pa-0 pr-3">

      <v-expand-transition>
        <div v-if="isFailed" class="mb-4 rounded-lg border-error bg-red-lighten-5 pa-4 d-flex align-center shadow-sm">
          <v-icon color="error" size="32" class="mr-4">mdi-lightbulb-on-outline</v-icon>
          <div>
            <div class="text-subtitle-2 font-weight-black text-red-darken-4">Sistem Çözüm Önerisi</div>
            <div class="text-caption text-red-darken-3 font-weight-medium">
              {{ getSmartSolution(localItem.logs) }}
            </div>
          </div>
          <v-spacer></v-spacer>
          <v-btn color="error" variant="text" size="small" class="font-weight-black" prepend-icon="mdi-lifebuoy">DESTEK
            AL</v-btn>
        </div>
      </v-expand-transition>

      <div class="d-flex flex-column mb-4 rounded-lg border bg-grey-lighten-5" style="gap: var(--ek-space-3);">
        <div class="pa-4 pb-0">

          <div class="d-flex flex-wrap align-center pb-3" style="gap: var(--ek-space-5);">
            <PlatformImageComponent :integrationCode="localItem.integrationCode" :width="80" :height="35" class="mr-4">
            </PlatformImageComponent>


            <div class="mode-badge"
              :style="{ '--mode-color': getModeColor(localItem.mode), 'background-color': getModeColor(localItem.mode) + '15' }">
              <span class="status-dot-static"></span>
              <span class="mode-text">{{ PLATFORM_PROCESS_LABELS[localItem.mode as PLATFORM_PROCESS] }}</span>
            </div>

            <v-spacer></v-spacer>
            <div class="d-flex align-center text-no-wrap">
              <v-icon size="16" color="grey" class="mr-1">mdi-clock-outline</v-icon>
              <span class="text-caption font-weight-bold text-grey-darken-1 mr-1">Başlangıç:</span>
              <span class="text-caption font-weight-bold" v-html="formatDate(localItem.createdAt)"></span>
            </div>
            <div class="d-flex align-center text-no-wrap">
              <v-icon size="16" color="grey" class="mr-1">mdi-clock-check</v-icon>
              <span class="text-caption font-weight-bold text-grey-darken-1 mr-1">Bitiş:</span>
              <span class="text-caption font-weight-bold"
                v-html="localItem.completedAt ? formatDate(localItem.completedAt) : '-'"></span>
            </div>
            <div v-if="localItem.nextRunAt && !localItem.completedAt" class="d-flex align-center text-no-wrap">
              <v-icon size="16" color="indigo" class="mr-1">mdi-calendar-clock</v-icon>
              <span class="text-caption font-weight-bold text-indigo-darken-1 mr-1">Sonraki İşlem:</span>
              <span class="text-caption font-weight-bold text-indigo" v-html="formatDate(localItem.nextRunAt)"></span>
            </div>
          </div>
          <div class="w-100 pb-4 stepper-wrapper">
            <div class="stepper-content">
              <div class="stepper-line"></div>
              <div v-for="(step, index) in exportSteps" :key="index" class="step-item">
                <v-avatar size="16"
                  :color="currentStepIndex === index ? getStatusColor(localItem.status) : (currentStepIndex > index ? 'success' : 'neutral-subtle')"
                  :class="[currentStepIndex === index && isProcessing ? 'status-pulse-intense' : '', 'step-avatar', currentStepIndex > index ? 'step-passed' : '']"
                  class="step-avatar-ring">
                </v-avatar>
                <div class="step-text-container">
                  <span class="step-title step-title-text"
                    :class="{ 'active-text': currentStepIndex === index, 'passed-text': currentStepIndex > index }">
                    {{ step.title }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <v-row class="mb-4" dense>
        <v-col cols="12">
          <div class="pa-4 rounded-lg border bg-white d-flex align-start flex-wrap" style="gap:var(--ek-space-5)">
            <v-img v-if="localItem.image" :src="localItem.image" width="175" height="175" cover
              class="rounded border bg-grey-lighten-4 flex-grow-0" style="max-width: 175px;"></v-img>
            <div v-else class="d-flex align-center justify-center rounded border bg-grey-lighten-4"
              style="width: 175px; height: 175px;">
              <v-icon color="grey-lighten-1" size="40">mdi-image-off</v-icon>
            </div>
            <div class="d-flex flex-column flex-grow-1" style="min-width: 300px;">
              <div class="mb-4">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="text-subtitle-1 font-weight-black text-grey-darken-3">{{ localItem.title
                  }}</span>

                </div>

                <div class="d-flex flex-wrap choice-chip-row">
                  <EkStatusChip v-for="choice in localItem.choices" :key="choice._id" tone="neutral"
                    :label="`${choice.choiceTitle}: ${choice.choiceValueTitle}`" />
                </div>
              </div>
              <div class="d-flex flex-wrap pt-2 meta-row-divider">
                <div class="d-flex flex-column"><span
                    class="text-tiny text-passiveColor font-weight-bold mb-1 uppercase">Barkod</span><span
                    class="text-caption font-weight-black text-grey-darken-3">{{ localItem.barcode }}</span></div>
                <div class="d-flex flex-column"><span
                    class="text-tiny text-passiveColor font-weight-bold mb-1 uppercase">Stok Kodu</span><span
                    class="text-caption font-weight-bold text-grey-darken-1">{{ localItem.stockcode || '-'
                    }}</span></div>
                <div class="d-flex flex-column"><span
                    class="text-tiny text-passiveColor font-weight-bold mb-1 uppercase">KATEGORİ</span><span
                    class="text-caption font-weight-black text-grey-darken-3">{{
                      categoriesStore.getCategoryTitle(localItem.category) || '-' }}</span></div>
                <div class="d-flex flex-column"><span
                    class="text-tiny text-passiveColor font-weight-bold mb-1 uppercase">MARKA</span><span
                    class="text-caption font-weight-bold text-grey-darken-1">{{
                      brandsStore.getBrandTitle(localItem.brand) || '-' }}</span></div>
              </div>

              <div class="d-flex align-center mt-4 price-stock-row">
                <div v-if="localItem.price" class="price-wrapper-mobile">
                  <v-icon size="14" color="info" class="mr-2">mdi-tag-outline</v-icon>
                  <span class="price-amount-mobile">{{ formatMoney(localItem.price) }}</span>
                </div>
                <EkStatusChip v-if="localItem.stock !== undefined" tone="success" :label="`${formatNumber(localItem.stock)} stok`" />
              </div>

            </div>
          </div>
        </v-col>
      </v-row>

      <v-row dense>
        <v-col cols="12" class="mb-4">

          <CardComponent title="İşlem Günlüğü ve Akış Analizi" icon="mdi-history" contentBackgroundColor="white">
            <v-timeline density="compact" line-thickness="1">
              <v-timeline-item v-for="(log, idx) in localItem.logs" :key="idx"
                :dot-color="getLogStatusColor(log.status)" size="x-small">
                <div class="log-card" :class="getLogClass(log.status)">
                  <div class="log-card-header d-flex align-center flex-wrap" style="gap: var(--ek-space-2);">
                    <div class="d-flex align-center">
                      <span class="worker-name mr-1">{{ translateWorker(log.worker) }}</span>
                      <v-tooltip location="top" max-width="300">
                        <template v-slot:activator="{ props }"><v-icon v-bind="props" size="14" color="grey-lighten-1"
                            class="cursor-pointer">mdi-help-circle-outline</v-icon></template>
                        <span class="text-caption">{{ getWorkerDescription(log.worker) }}</span>
                      </v-tooltip>
                    </div>
                    <EkStatusChip :tone="statusTone(log.status)" :label="translateStatus(log.status)" />
                    <v-spacer></v-spacer>
                    <div class="d-flex align-center time-group">
                      <v-icon size="12" class="mr-1">mdi-clock-outline</v-icon>
                      <span class="timestamp" v-html="formatDate(log.timestamp)"></span>
                    </div>
                    <div v-if="Number(idx) > 0" class="duration-badge">+ {{
                      calculateDuration(localItem.logs[Number(idx)
                        - 1].timestamp, log.timestamp) }}</div>
                  </div>
                  <div class="log-card-body">{{ log.message }}</div>
                </div>
              </v-timeline-item>
            </v-timeline>
          </CardComponent>
        </v-col>

        <v-col cols="12">

          <CardComponent title="Performans Analizi" icon="mdi-chart-bar" contentBackgroundColor="white">

            <template #header>
              <div class="premium-duration-badge">
                <div class="badge-icon"><v-icon size="18" color="white">mdi-timer-sand</v-icon></div>
                <div class="badge-content">
                  <span class="label">TOPLAM SÜREÇ</span>
                  <span class="value">{{ totalDurationText }}</span>
                </div>
              </div>
            </template>


            <div class="pa-4">
              <v-chart v-if="isMounted" class="chart" :option="chartOption" autoresize style="min-height: 300px; width: 100%;" />
            </div>
          </CardComponent>
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, onBeforeUnmount, computed } from 'vue'
import useRestApi from '@/composables/restapi'
import LoadingComponent from '@/components/LoadingComponent.vue'
import CardComponent from '@/components/CardComponent.vue'
import { useCategoriesStore } from '@/stores/categoriesStore'
import { useBrandsStore } from '@/stores/brandsStore'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import { LegacyGridContainLabel } from 'echarts/features'
import PlatformImageComponent from '../platforms/PlatformImageComponent.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import { escapeHtml } from '@/utils/escapeHtml'
import { PLATFORM_PROCESS_LABELS, PLATFORM_PROCESS, PLATFORM_PROCESS_COLORS } from '@/types/PlatformProcess'
import { formatMoney, formatNumber, formatDate as formatDateCentral } from '@/composables/format'
import { semanticColorsLight } from '@/design/tokens'

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
// ek-pattern-exception: composables/format.ts — gün/saat/dakika/saniye birleşik süre dizgisi
// ("2g 3s 14dk 5.20 sn") üretir; format.ts'in TEK biçimlendiricilerinin (formatNumber/formatMoney/
// formatRelative) hiçbiri bu bileşik süre gösterimini karşılamıyor — gerçekten farklı bir
// biçimlendirme ihtiyacı (Karar 6.4 istisna gerekçesi).
const formatChartValue = (seconds: number) => {
  if (seconds === 0) return '0 sn';
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2);

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
        itemStyle: { color: statusColorHex(log.status) }
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

// ek-pattern-exception: composables/format.ts — iki zaman damgası arasındaki farkı "X dk Y sn"
// biçiminde süre olarak gösterir (para/tarih/sayı değil); format.ts'te süre farkı biçimlendiricisi
// yok (Karar 6.4 istisna gerekçesi, bkz. formatChartValue AYNI gerekçe).
const calculateDuration = (start: any, end: any) => {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Number((diff / 1000).toFixed(2));
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
 * Karar 3.3 "canlı iş-durumu paleti" KARARI — status-map.ts'in JOB_STATUS_TONE ailesiyle AYNI
 * mantık, bu dosyanın KENDİ ham durum kümesine (QUEUED/PREPARING/PENDING/SENT/WAITING/COMPLETED/
 * FAILED) uyarlanmış TEK yerel harita. İki tüketici bağlamı var: Vuetify bileşen `color` prop'u
 * (tema anahtarı ADI, `statusColorName`) ve ECharts JS değeri (canvas CSS okuyamaz — ADR-0011
 * Karar 2 istisnası — gerçek hex, `statusColorHex`, `semanticColorsLight`'tan okunur).
 */
const JOB_STATUS_COLOR_NAME: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  QUEUED: 'neutral',
  PREPARING: 'neutral',
  PENDING: 'info',
  SENT: 'info',
  WAITING: 'warning',
  COMPLETED: 'success',
  FAILED: 'error',
  ERROR: 'error',
};

const statusColorName = (status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' => {
  return JOB_STATUS_COLOR_NAME[status?.toUpperCase()] || 'neutral';
};

const statusColorHex = (status: string): string => {
  return semanticColorsLight[statusColorName(status)];
};

/** `EkStatusChip` `tone` prop'u (status-map.ts `StatusTone`) için — Vuetify tema anahtarı 'error',
    StatusTone'da 'danger' adını taşır (Karar 3.3). */
const statusTone = (status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' => {
  const name = statusColorName(status);
  return name === 'error' ? 'danger' : name;
};

/** Genel statü rengi — UI bileşenlerinde (Chip, Badge, Avatar `color` prop'u) kullanım içindir. */
const getStatusColor = statusColorName;

/** Log satırları veya metin bazlı durum göstergeleri için tema anahtarı adı döner. */
const getLogStatusColor = statusColorName;
const getModeColor = (mode: string) => {
  const m = mode?.toUpperCase();
  return PLATFORM_PROCESS_COLORS[m] || semanticColorsLight['content-default'];
};

// ek-pattern-exception: composables/format.ts — tarih kısmı `formatDateCentral` (composables/
// format.ts) ile TEK kaynağa bağlandı; saat kısmı SANİYE hassasiyeti gerektirir (teknik işlem
// günlüğünde aynı dakika içindeki adımları ayırt etmek için) — format.ts'in saat+dakika+saniye
// birleşik bir biçimlendiricisi yok, bu yüzden saat kısmı doğrudan Intl API'siyle üretilir
// (desen mandalının izlediği biçimlendirme çağrıları arasında yer almaz).
const formatDate = (date: any) => {
  if (!date) return '-';
  const d = new Date(date);
  const timePart = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
  return `${formatDateCentral(d)} <span class="font-weight-black">${timePart}</span>`;
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

.choice-chip-row {
  gap: var(--ek-space-1);
}

.price-stock-row {
  gap: var(--ek-space-3);
}

.mode-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-full);
  transition: border-color var(--ek-duration-base) var(--ek-easing-standard),
    box-shadow var(--ek-duration-base) var(--ek-easing-standard);
}

.mode-badge:hover {
  box-shadow: var(--ek-shadow-sm);
}

.status-dot-static {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
  background-color: var(--mode-color);
  box-shadow: 0 0 4px var(--mode-color);
}

.mode-text {
  font-size: 10px;
  font-weight: 900;
  color: var(--ek-color-content-default);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.price-wrapper-mobile {
  background: var(--ek-color-info-subtle);
  border: 1px solid var(--ek-color-info);
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: var(--ek-radius-lg);
  transition: border-color var(--ek-duration-base) var(--ek-easing-standard);
}

.price-amount-mobile {
  font-weight: 900;
  font-size: 15px;
  color: var(--ek-color-info);
  letter-spacing: -0.2px;
}

.log-card {
  background: var(--ek-color-surface);
  border-radius: var(--ek-radius-lg);
  border: 1px solid var(--ek-color-border-default);
  box-shadow: var(--ek-shadow-sm);
  margin-bottom: 4px;
  position: relative;
  overflow: hidden;
}

.log-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}

.log-info::before {
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
  padding: 8px 12px;
  background-color: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-surface-sunken);
}

.worker-name {
  font-size: 11px;
  font-weight: 800;
  color: var(--ek-color-neutral);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.duration-badge {
  background: var(--ek-color-surface-sunken);
  color: var(--ek-color-content-muted);
  padding: 2px 8px;
  border-radius: var(--ek-radius-sm);
  font-size: 10px;
  font-weight: 700;
}

.log-card-body {
  padding: 10px 12px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--ek-color-content-default);
  font-weight: 500;
}

.log-error .log-card-body {
  color: var(--ek-color-error);
  background-color: var(--ek-color-error-subtle);
}

.log-sent .log-card-body {
  color: var(--ek-color-info);
  background-color: var(--ek-color-info-subtle);
}

.meta-row-divider {
  gap: var(--ek-space-10);
  border-top: 1px solid var(--ek-color-border-default);
}

.text-tiny {
  font-size: 10px;
}

.text-passiveColor {
  color: var(--ek-color-content-muted);
}

.uppercase {
  text-transform: uppercase;
}

.border-error {
  border: 1px solid var(--ek-color-error) !important;
}

.premium-duration-badge {
  display: flex;
  align-items: center;
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  padding: 4px 12px 4px 4px;
  box-shadow: var(--ek-shadow-sm);
}

.badge-icon {
  /* Karar 1.1 — dekoratif degrade YASAK; düz `primary` zemine çekildi. */
  background: var(--ek-color-primary);
  width: 32px;
  height: 32px;
  border-radius: var(--ek-radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 10px;
}

.badge-content {
  display: flex;
  flex-direction: column;
}

.badge-content .label {
  font-size: 8px;
  font-weight: 800;
  color: var(--ek-color-content-subtle);
  letter-spacing: 1px;
  line-height: 1;
  margin-bottom: 2px;
}

.badge-content .value {
  font-size: var(--ek-font-size-xs);
  font-weight: 900;
  color: var(--ek-color-content-strong);
  line-height: 1;
}

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
  background: var(--ek-color-border-default);
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

.step-avatar-ring {
  border: 2px solid var(--ek-color-surface);
  box-shadow: var(--ek-shadow-sm);
  position: relative;
  z-index: 2;
}

.step-text-container {
  z-index: 2;
}

.step-title-text {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

@media (max-width: 768px) {
  .stepper-content {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ek-space-5);
    padding-left: 20px;
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
    gap: 15px;
    flex: none;
  }
}

.step-avatar {
  transition: all var(--ek-duration-slow) var(--ek-easing-standard);
}

.step-passed {
  opacity: 0.6;
}

.step-title {
  color: var(--ek-color-content-subtle);
  text-align: center;
}

.active-text {
  color: var(--ek-color-content-strong) !important;
  font-weight: 900;
}

.passed-text {
  color: var(--ek-color-success) !important;
}

@keyframes intense-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--ek-color-primary) 70%, transparent);
  }
  100% {
    box-shadow: 0 0 0 12px transparent;
  }
}

/* ADR-0011 Bağlam "pulse/ripple ihlali": eskiden çok daha uzun bir döngü
   süresi ve overshoot eğrisi kullanılıyordu; premium-ui-standards'ın motion
   sınırını (yalnızca duration/easing token aralığı, bounce/elastik eğrisi
   YASAK) aşıyordu. `infinite` tekrarı (aktif adımı işaret eden bir durum
   göstergesi) KORUNDU — yalnızca tek döngünün süresi/eğrisi token'a
   çekildi (bilinçli davranış değişikliği, ekran görüntüsü
   `animations:'disabled'` ile alındığı için testte fark üretmiyor, bkz.
   e2e/specs/logs.spec.ts — ClaimDetailComponent'teki AYNI göç, T4f). */
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
  border: 2px solid color-mix(in srgb, var(--ek-color-primary) 50%, transparent);
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