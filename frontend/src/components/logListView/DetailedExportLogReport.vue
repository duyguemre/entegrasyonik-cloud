<!--
  frontend/src/components/logListView/DetailedExportLogReport.vue

  FE-LOCAL-1048 — Pazaryeri Gönderim Detaylı Raporu, ana sayfa / bölüm panolarıyla AYNI dilde (yalnız sunum; veri,
  yoklama ve API çağrıları DEĞİŞMEDİ):
    [çözüm önerisi]  başarısız işte tonun düz açık zemini + ince çerçeve (degrade / dolgu başlık yok)
    kayıt özeti      ürün görseli + ad + seçenekler · kanal + işlem tipi · ince çizgiyle ayrılan bilgi hücreleri
    İŞLEM ÖZETİ      özet şeridi (durum, adım, toplam süre, günlük kaydı[, sonraki deneme])
    AKIŞ             çerçeveli ikon kapsülleriyle adımlar (geçilen = başarı, etkin = durum tonu, sıradaki = nötr)
    İŞLEM GÜNLÜĞÜ    tek düz kart; her satır ikon kapsülü + adım adı + durum + zaman (+ önceki adıma göre süre)
    PERFORMANS       adım süreleri grafiği (kart başlığında toplam süre)
-->
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
        <EkIconTile icon="mdi-lightbulb-on-outline" tone="error" />
        <div class="solution-band__text">
          <div class="solution-band__title">Sistem Çözüm Önerisi</div>
          <div class="solution-band__message">{{ getSmartSolution(localItem.logs) }}</div>
        </div>
        <v-btn color="error" variant="text" size="small" prepend-icon="mdi-lifebuoy">DESTEK AL</v-btn>
      </div>

      <!-- Kayıt özeti: ürün kimliği + kanal + bilgi hücreleri -->
      <section class="panel product-card" aria-label="Gönderilen ürün">
        <div class="product-card__main">
          <v-img v-if="localItem.image" :src="localItem.image" width="72" height="72" cover
            class="product-card__image" :alt="localItem.title"></v-img>
          <div v-else class="product-card__image product-card__image--empty">
            <v-icon size="28" aria-hidden="true">mdi-image-off-outline</v-icon>
          </div>
          <div class="product-card__body">
            <div class="product-card__eyebrow">Gönderilen ürün</div>
            <div class="product-card__title">{{ localItem.title }}</div>
            <div v-if="localItem.choices?.length" class="choice-list">
              <span v-for="choice in localItem.choices" :key="choice._id" class="choice-pill">
                <span class="choice-pill__key">{{ choice.choiceTitle }}</span>
                <span class="choice-pill__value">{{ choice.choiceValueTitle }}</span>
              </span>
            </div>
          </div>
          <div class="product-card__channel">
            <PlatformImageComponent :integrationCode="localItem.integrationCode" :width="80" :height="35">
            </PlatformImageComponent>
            <EkStatusChip tone="info" :dot="true"
              :label="PLATFORM_PROCESS_LABELS[localItem.mode as PLATFORM_PROCESS] || localItem.mode" />
          </div>
        </div>

        <div class="field-row">
          <div class="field"><span class="field__label">Barkod</span><span class="field__value ek-num">{{ localItem.barcode }}</span></div>
          <div class="field"><span class="field__label">Stok Kodu</span><span class="field__value ek-num">{{ localItem.stockcode || '-' }}</span></div>
          <div class="field"><span class="field__label">KATEGORİ</span><span class="field__value">{{
            categoriesStore.getCategoryTitle(localItem.category) || '-' }}</span></div>
          <div class="field"><span class="field__label">MARKA</span><span class="field__value">{{
            brandsStore.getBrandTitle(localItem.brand) || '-' }}</span></div>
          <div v-if="localItem.price" class="field">
            <span class="field__label">Fiyat</span>
            <span class="field__value field__value--action ek-num price-tag">{{ localItem.price }} TL</span>
          </div>
          <div v-if="localItem.stock !== undefined" class="field">
            <span class="field__label">Stok</span>
            <span class="field__value"><EkStatusChip tone="success" :label="`${localItem.stock} STOK`" /></span>
          </div>
        </div>
      </section>

      <ListDashSection label="İşlem özeti">
        <ListSummaryStrip :cells="summaryCells" label="İşlem özeti" />
      </ListDashSection>

      <ListDashSection label="Akış">
        <div class="panel stepper-wrapper">
          <ol class="stepper-content" aria-label="Gönderim adımları">
            <li v-for="(step, index) in exportSteps" :key="index" class="step-item"
              :class="{ 'is-passed': currentStepIndex > index, 'is-active': currentStepIndex === index, 'is-upcoming': currentStepIndex < index }"
              :aria-current="currentStepIndex === index ? 'step' : undefined">
              <span class="step-dot"
                :class="[stepDotClass(index), currentStepIndex === index && isProcessing ? 'step-dot--processing' : '']">
                <EkIconTile :icon="stepIcon(index, step.icon)" :tone="stepTone(index)" />
              </span>
              <span class="step-title"
                :class="{ 'active-text': currentStepIndex === index, 'passed-text': currentStepIndex > index }">
                {{ step.title }}
              </span>
            </li>
          </ol>
          <div class="meta-row">
            <div class="meta-item">
              <v-icon size="16" aria-hidden="true">mdi-clock-outline</v-icon>
              <span class="meta-item__label">Başlangıç:</span>
              <span class="meta-item__value ek-num">{{ formatDateTime(localItem.createdAt) }}</span>
            </div>
            <div class="meta-item">
              <v-icon size="16" aria-hidden="true">mdi-clock-check-outline</v-icon>
              <span class="meta-item__label">Bitiş:</span>
              <span class="meta-item__value ek-num">{{ localItem.completedAt ? formatDateTime(localItem.completedAt) : '-' }}</span>
            </div>
            <div v-if="localItem.nextRunAt && !localItem.completedAt" class="meta-item">
              <v-icon size="16" aria-hidden="true">mdi-calendar-clock-outline</v-icon>
              <span class="meta-item__label">Sonraki İşlem:</span>
              <span class="meta-item__value ek-num">{{ formatDateTime(localItem.nextRunAt) }}</span>
            </div>
          </div>
        </div>
      </ListDashSection>

      <ListDashSection label="İşlem Günlüğü ve Akış Analizi">
        <ol class="panel log-list">
          <li v-for="(log, idx) in localItem.logs" :key="idx" class="log-card" :class="getLogClass(log.status)">
            <span class="log-card__rail" aria-hidden="true">
              <EkIconTile :icon="workerIcon(log.worker)" :tone="TONE_KEY[getLogTone(log.status)]" size="sm" />
            </span>
            <div class="log-card__main">
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
                  <span class="timestamp ek-num">{{ formatDateTime(log.timestamp) }}</span>
                </div>
                <div v-if="Number(idx) > 0" class="duration-badge ek-num">+ {{
                  calculateDuration(localItem.logs[Number(idx) - 1].timestamp, log.timestamp) }}</div>
              </div>
              <div class="log-card-body">{{ log.message }}</div>
            </div>
          </li>
        </ol>
      </ListDashSection>

      <ListDashSection label="Performans Analizi">
        <EkCard title="Adım süreleri" subtitle="Her adımın bir öncekine göre ne kadar sürdüğü" icon="mdi-timer-sand" icon-tone="info">
          <template #actions>
            <div class="duration-total">
              <span class="duration-total__label">TOPLAM SÜREÇ</span>
              <span class="duration-total__value ek-num" :title="totalDurationText">{{ totalDurationCompact }}</span>
            </div>
          </template>
          <v-chart v-if="isMounted" class="chart" :theme="chartTheme" :option="chartOption" autoresize />
        </EkCard>
      </ListDashSection>
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
import { EkCard, EkEmptyState, EkIconTile, EkSkeleton, EkStatusChip, type EkTone } from '@entegrasyonik/ui/components'
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import { formatDateTime } from '@entegrasyonik/ui/format'
import { useChartColors, useChartTheme } from '@/composables/useChartTheme'
import type { StatusTone } from '@/design/status-map'
import { escapeHtml } from '@/utils/escapeHtml'
import { PLATFORM_PROCESS_LABELS, PLATFORM_PROCESS } from '@/types/PlatformProcess'
import { reportPollInterval } from '@/stores/publicConfig'

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
  { title: 'Kuyrukta', status: 'QUEUED', icon: 'mdi-tray-full' },
  { title: 'Ürün Doğrulanıyor', status: 'PREPARING', icon: 'mdi-cog-outline' },
  { title: 'İşlem Pazaryerine Gönderiliyor', status: 'PENDING', icon: 'mdi-tray-arrow-up' },
  { title: 'Gönderim Sorgulanıyor', status: 'SENT', icon: 'mdi-upload-outline' },
  { title: 'Ürün Onayı Bekleniyor', status: 'WAITING', icon: 'mdi-file-clock-outline' },
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

const startPolling = () => { stopPolling(); pollTimer = setTimeout(() => { getReport(true) }, reportPollInterval()); };
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
// FR2-DARK: grafik teması ve seri renkleri etkin moda göre (light/dark).
const chartTheme = useChartTheme();
const chartColors = useChartColors();
const toneHex = (tone: StatusTone) => chartColors.value[TONE_KEY[tone]];

/** Log satırları için Vuetify `dot-color` değeri. */
const getLogStatusColor = (status: string) => toneVar(getLogTone(status));

// ---- FE-LOCAL-1048: sunum yardımcıları (özet şeridi, adım tonu, günlük ikonu) ----
/** Akış adımının ikon kapsülü tonu: geçilen = başarı, etkin = işin durum tonu, sıradaki = nötr. */
const stepTone = (index: number): EkTone => {
  if (currentStepIndex.value > index) return 'success'
  if (currentStepIndex.value < index) return 'neutral'
  const tone = TONE_KEY[getLogTone(localItem.value?.status)]
  return tone === 'neutral' ? 'action' : tone
}

/** Geçilen adım onay imi, başarısız/iptal olan etkin adım uyarı imi, diğerleri adımın kendi ikonu. */
const stepIcon = (index: number, icon: string) => {
  if (currentStepIndex.value > index) return 'mdi-check'
  if (currentStepIndex.value === index && isFailed.value) return 'mdi-alert-circle-outline'
  return icon
}

/** Toplam süre — en büyük iki birim (gün/saat/dakika/saniye), tam sayı; hücreye ve kart başlığına sığar. */
const totalDurationCompact = computed(() => {
  const item = localItem.value
  if (!item?.createdAt) return '-'
  const total = Math.max(0, Math.round((new Date(item.completedAt || new Date()).getTime() - new Date(item.createdAt).getTime()) / 1000))
  const parts = [
    [Math.floor(total / 86400), 'g'], [Math.floor((total % 86400) / 3600), 'sa'], [Math.floor((total % 3600) / 60), 'dk'], [total % 60, 'sn'],
  ].filter(([n]) => Number(n) > 0).map(([n, unit]) => `${n} ${unit}`)
  return parts.length ? parts.slice(0, 2).join(' ') : '0 sn'
})

const WORKER_ICONS: Record<string, string> = {
  BATCHCREATOR: 'mdi-playlist-plus',
  'CATALOG DISPATCHER': 'mdi-tray-full',
  'CATALOG VALIDATOR': 'mdi-shield-check-outline',
  'CATALOG PUBLISHER': 'mdi-send-outline',
  'CATALOG SENTINEL': 'mdi-radar',
  'CATALOG SYNCHRONIZER': 'mdi-sync',
}
const workerIcon = (worker: string) => WORKER_ICONS[worker?.toUpperCase() || ''] || 'mdi-cog-outline'

const STATUS_ICONS: Record<string, string> = {
  QUEUED: 'mdi-tray-full', PREPARING: 'mdi-cog-sync-outline', PENDING: 'mdi-send-outline', SENT: 'mdi-progress-check',
  WAITING: 'mdi-clock-outline', COMPLETED: 'mdi-check-circle-outline', FAILED: 'mdi-alert-circle-outline', CANCELLED: 'mdi-cancel',
}
const STATUS_TITLES: Record<string, string> = { FAILED: 'Başarısız', CANCELLED: 'İptal edildi' }

/** Özet şeridi: durum · adım · toplam süre · günlük kaydı (+ sürüyorsa sonraki deneme). */
const summaryCells = computed<ListSummaryCell[]>(() => {
  const item = localItem.value
  if (!item) return []
  const status = String(item.status ?? '').toUpperCase()
  const statusTone = TONE_KEY[getLogTone(status)]
  const logCount = Array.isArray(item.logs) ? item.logs.length : 0
  const cells: ListSummaryCell[] = [
    {
      key: 'status', label: 'Durum', icon: STATUS_ICONS[status] ?? 'mdi-circle-outline', tone: statusTone,
      value: STATUS_TITLES[status] ?? exportSteps.find((s) => s.status === status)?.title ?? (item.status || '—'),
      hint: isProcessing.value ? 'İşlem sürüyor' : 'İşlem sonuçlandı',
    },
    {
      key: 'step', label: 'Adım', icon: 'mdi-format-list-numbered', tone: 'action',
      value: `${currentStepIndex.value + 1} / ${exportSteps.length}`, hint: exportSteps[currentStepIndex.value]?.title,
    },
    { key: 'duration', label: 'Toplam süre', icon: 'mdi-timer-sand', tone: 'info', value: totalDurationCompact.value, hint: item.completedAt ? 'Başlangıçtan bitişe' : 'Başlangıçtan bu yana' },
    { key: 'logs', label: 'Günlük kaydı', icon: 'mdi-text-box-outline', tone: 'neutral', value: String(logCount), zero: !logCount, hint: 'Kaydedilen işlem adımı' },
  ]
  if (item.nextRunAt && !item.completedAt) {
    cells.push({ key: 'next', label: 'Sonraki işlem', icon: 'mdi-calendar-clock-outline', tone: 'warning', value: formatDateTime(item.nextRunAt), hint: 'Planlanan sorgu zamanı' })
  }
  return cells
})

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
  margin: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

/* Çözüm önerisi: tonun düz açık zemini + ince çerçevesi; ikon kutusu düz yüzeyde. */
.solution-band {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  flex-wrap: wrap;
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-error-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-error-subtle);
}

.solution-band :deep(.ek-icon-tile) {
  background: var(--ek-color-surface);
}

.solution-band__text {
  flex: 1 1 240px;
  min-width: 0;
}

.solution-band__title {
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.solution-band__message {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
}

/* Kayıt özeti */
.product-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.product-card__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4) var(--ek-space-5);
}

.product-card__image {
  flex: 0 0 72px;
  width: 72px;
  max-width: 72px;
  height: 72px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-muted);
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
  flex: 1 1 260px;
  min-width: 0;
  gap: var(--ek-space-1);
}

.product-card__eyebrow {
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

.product-card__eyebrow::before {
  content: '';
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.product-card__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-semibold);
  overflow-wrap: anywhere;
}

.product-card__channel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.choice-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1);
  margin-top: var(--ek-space-1);
}

.choice-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: 2px var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-muted);
}

.choice-pill__key {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.choice-pill__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-caption-size);
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
  overflow-wrap: anywhere;
}

.field__value--action {
  color: var(--ek-color-action-emphasis);
}

/* Akış adımları: çerçeveli ikon kapsülleri, aralarında ince çizgi. */
.stepper-wrapper {
  display: flex;
  flex-direction: column;
  overflow: hidden;
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

.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-5);
  padding: var(--ek-space-3) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
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
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.meta-item__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

/* İşlem günlüğü: tek düz kart, satırlar ince çizgiyle ayrılır; ikon kapsülleri dikey çizgiyle bağlanır. */
.log-list {
  display: flex;
  flex-direction: column;
  padding: 0;
  list-style: none;
  overflow: hidden;
}

.log-card {
  position: relative;
  display: flex;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
}

.log-card + .log-card {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.log-card__rail {
  position: relative;
  z-index: 1;
  flex: none;
}

/* Ray çizgisi: kapsülden bir sonraki satırın kapsülüne. */
.log-card:not(:last-child)::after {
  content: '';
  position: absolute;
  top: calc(var(--ek-space-3) + var(--ek-icon-tile-sm));
  bottom: calc(-1 * var(--ek-space-3));
  left: calc(var(--ek-space-4) + var(--ek-icon-tile-sm) / 2);
  width: 1px;
  background: var(--ek-color-border-default);
}

.log-card__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.log-card-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  min-height: var(--ek-icon-tile-sm);
}

.worker-group {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.worker-name {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
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
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.time-group {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.duration-badge {
  padding: 1px var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}

.log-card-body {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-line-height-normal);
  overflow-wrap: anywhere;
}

/* Hata / gönderim mesajı: tonun düz açık zemini + ince çerçeve. */
.log-error .log-card-body,
.log-sent .log-card-body {
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
}

.log-error .log-card-body {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

/* Performans */
.duration-total {
  display: inline-flex;
  align-items: baseline;
  gap: var(--ek-space-2);
  white-space: nowrap;
}

.duration-total__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
}

.duration-total__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-font-weight-semibold);
}

.chart {
  min-height: 280px;
  width: 100%;
}

@media (max-width: 768px) {
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
}
</style>
