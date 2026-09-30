<template>
  <div class="adminSystemManagementView d-flex flex-column h-100 overflow-hidden">
    <LoadingComponent :attach="containerId" ref="loadingComponentRef" />

    <div class="flex-grow-1 overflow-y-auto scroll-area" :aria-busy="loading ? 'true' : 'false'">

      <EkPageHeader section="Yönetim" title="Sistem Yönetimi"
        description="Platform sağlığı, aktif işleyiciler ve bellek durumu anlık olarak izleniyor." />

      <!-- Yeniden yükleme göstergesi: ince 2px çizgi (ilk yükleme dahil yerleşimi kaydırmaz) -->
      <div class="load-indicator">
        <v-progress-linear v-if="loading" indeterminate height="2" color="primary" aria-label="Sistem verileri yükleniyor" />
      </div>

      <!-- Operasyonel kontroller -->
      <EkSection title="Sistem Durum Özeti" class="block">
        <div class="panel controls-bar">
          <div class="controls-group">
            <v-select v-model="timeFrame" :items="timeFrameOptions" density="compact" hide-details variant="outlined"
              class="customTextField timeframe-select-inline select-max-140" color="primary"
              aria-label="Zaman aralığı"></v-select>

            <v-select v-model="targetClientId" :items="clients" item-title="title" item-value="clientId"
              label="Mağaza Seçiniz" density="compact" hide-details clearable variant="outlined"
              class="customTextField client-select-inline" color="primary" placeholder="Tüm Mağazalar">
              <template v-slot:prepend-inner>
                <v-icon size="18">mdi-store-outline</v-icon>
              </template>
            </v-select>
          </div>

          <div class="controls-group">
            <v-switch v-model="autoRefresh" hide-details color="success" inset density="compact">
              <template v-slot:label>
                <span class="controls-label">Canlı izleme</span>
              </template>
            </v-switch>

            <v-btn @click="loadData()" icon variant="outlined" density="comfortable"
              :loading="loading" aria-label="Sistem verilerini yenile">
              <v-icon>mdi-refresh</v-icon>
            </v-btn>
          </div>
        </div>
      </EkSection>

      <!-- Export / Import -->
      <v-row class="block">
        <v-col cols="12" md="6">
          <h2 class="section-title">Export operasyonları</h2>
          <div class="panel panel--muted stack-gap">
            <div class="panel-head">
              <div class="panel-head__left">
                <span class="panel-title">Export trafiği (global)</span>
                <v-btn icon="mdi-information-outline" size="28" variant="text" color="primary"
                  @click="openExportDetail()" title="Detaylı Analiz" aria-label="Export trafiği detaylı analizini aç"></v-btn>
              </div>
              <v-icon color="primary" size="24" aria-hidden="true">mdi-upload-network-outline</v-icon>
            </div>
            <div class="metric-pills">
              <div v-for="exp in healthData.traffic.exports" :key="exp._id" class="metric-pill">
                <span class="metric-pill__label">{{ formatStatus(exp._id) }}</span>
                <span class="metric-pill__value" :class="getStatusColorClass(exp._id)">{{ exp.count }}</span>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div class="panel-head__left">
                <v-icon color="primary" size="20" aria-hidden="true">mdi-chart-bar</v-icon>
                <span class="panel-title">En aktif 5 mağaza</span>
              </div>
            </div>
            <v-chart v-if="isMounted" theme="entegrasyonik" class="chart chart-min-350" :option="exportChartOption" autoresize role="img"
              aria-label="En aktif 5 mağaza için export durumu grafiği (başarılı, hatalı, bekleyen)" />
          </div>
        </v-col>

        <v-col cols="12" md="6">
          <h2 class="section-title">Import operasyonları</h2>
          <div class="panel panel--muted stack-gap">
            <div class="panel-head">
              <span class="panel-title">Import trafiği (global)</span>
              <v-icon color="success" size="24" aria-hidden="true">mdi-download-network-outline</v-icon>
            </div>
            <div class="metric-pills">
              <div v-for="imp in healthData.traffic.imports" :key="imp._id" class="metric-pill">
                <span class="metric-pill__label">{{ formatStatus(imp._id) }}</span>
                <span class="metric-pill__value" :class="getStatusColorClass(imp._id)">{{ imp.count }}</span>
              </div>
            </div>
          </div>

          <div class="panel">
            <div class="panel-head">
              <div class="panel-head__left">
                <v-icon color="success" size="20" aria-hidden="true">mdi-chart-bar</v-icon>
                <span class="panel-title">En aktif 5 mağaza</span>
              </div>
            </div>
            <v-chart v-if="isMounted" theme="entegrasyonik" class="chart chart-min-350" :option="importChartOption" autoresize role="img"
              aria-label="En aktif 5 mağaza için import durumu grafiği (tamamlanan, hatalı)" />
          </div>
        </v-col>
      </v-row>

      <!-- Operasyonel içgörüler -->
      <h2 class="section-title">Operasyonel içgörüler ve performans</h2>
      <div class="panel panel--muted block">
        <v-row>
          <v-col cols="12" lg="4">
            <div class="label-caps col-title">TEMEL VERİ METRİKLERİ</div>
            <div class="insight-list">
              <div class="metric-insight-card">
                <div class="insight-left">
                  <span class="insight-icon insight-icon--info"><v-icon size="20" aria-hidden="true">mdi-cloud-download</v-icon></span>
                  <div>
                    <div class="insight-label">Çekilen Kayıt</div>
                    <div class="insight-value">{{ healthData.operationInsights.metrics.totalFetched }}</div>
                  </div>
                </div>
                <EkStatusChip tone="info" label="PLATFORM" />
              </div>

              <div class="metric-insight-card">
                <div class="insight-left">
                  <span class="insight-icon insight-icon--success"><v-icon size="20" aria-hidden="true">mdi-plus-circle-outline</v-icon></span>
                  <div>
                    <div class="insight-label">Yeni Eklenen</div>
                    <div class="insight-value">{{ healthData.operationInsights.metrics.totalInserted }}</div>
                  </div>
                </div>
                <EkStatusChip tone="success" label="VERİTABANI" />
              </div>

              <div class="metric-insight-card">
                <div class="insight-left">
                  <span class="insight-icon insight-icon--warning"><v-icon size="20" aria-hidden="true">mdi-cached</v-icon></span>
                  <div>
                    <div class="insight-label">Güncellenen</div>
                    <div class="insight-value">{{ healthData.operationInsights.metrics.totalUpdated }}</div>
                  </div>
                </div>
                <EkStatusChip tone="warning" label="SYNC" />
              </div>

              <div class="metric-insight-card">
                <div class="insight-left">
                  <span class="insight-icon insight-icon--danger"><v-icon size="20" aria-hidden="true">mdi-alert-circle-outline</v-icon></span>
                  <div>
                    <div class="insight-label">Hatalı Kayıt</div>
                    <div class="insight-value">{{ healthData.operationInsights.metrics.totalFailed }}</div>
                  </div>
                </div>
                <EkStatusChip tone="danger" label="KRİTİK" />
              </div>
            </div>
          </v-col>

          <v-col cols="12" lg="5">
            <div class="label-caps col-title">OPERASYONEL BAŞARI TRENDİ</div>
            <div class="panel panel--inner fill-height">
              <v-chart v-if="isMounted" theme="entegrasyonik" class="chart chart-h-300" :option="insightTimelineChartOption" autoresize role="img"
                aria-label="Operasyonel başarı trendi grafiği (günlük başarılı ve hatalı işlemler)" />
            </div>
          </v-col>

          <v-col cols="12" lg="3">
            <div class="label-caps col-title">İŞLEM DAĞILIMI</div>
            <div class="panel panel--inner stack-gap">
              <v-chart v-if="isMounted" theme="entegrasyonik" class="chart chart-h-180" :option="insightTypePieChartOption" autoresize role="img"
                aria-label="İşlem türü dağılımı grafiği" />
            </div>
            <div class="label-caps col-title">ORTALAMA SÜRE (MS)</div>
            <div class="panel panel--inner">
              <v-chart v-if="isMounted" theme="entegrasyonik" class="chart chart-h-120" :option="insightDurationBarChartOption" autoresize role="img"
                aria-label="İşlem türüne göre ortalama süre grafiği (milisaniye)" />
            </div>
          </v-col>
        </v-row>
      </div>

      <!-- Altyapı -->
      <h2 class="section-title">Altyapı ve sağlık</h2>
      <v-row class="block">
        <v-col cols="12" md="4">
          <div class="panel h-100">
            <div class="panel-head">
              <div class="panel-head__left">
                <v-icon color="primary" aria-hidden="true">mdi-server-network-outline</v-icon>
                <span class="panel-title">Aktif İşleyiciler / Podlar</span>
              </div>
            </div>

            <ul v-if="healthData.infrastructure.activePods.length > 0" class="pod-list"
              aria-label="Aktif işleyiciler / podlar">
              <li v-for="pod in healthData.infrastructure.activePods" :key="pod" class="pod-item">
                <span class="insight-icon insight-icon--info insight-icon--sm"><v-icon size="18" aria-hidden="true">mdi-console</v-icon></span>
                <span class="pod-item__name">{{ pod }}</span>
                <EkStatusChip tone="success" label="ÇALIŞIYOR" />
              </li>
            </ul>
            <EkEmptyState v-else variant="no-data" title="Aktif işlemci bulunamadı"
              message="Son 15 dakika içerisinde herhangi bir işlem kaydı tespit edilemedi." />
          </div>
        </v-col>

        <v-col cols="12" md="4">
          <div class="panel h-100">
            <div class="panel-head">
              <div class="panel-head__left">
                <v-icon color="warning" aria-hidden="true">mdi-tray-full</v-icon>
                <span class="panel-title">Kuyruk Analizi</span>
              </div>
            </div>

            <div class="queue-list">
              <div class="queue-box">
                <div class="queue-box__head">
                  <span class="label-caps">Sipariş Senkronizasyonu</span>
                  <EkStatusChip tone="warning" label="BULLMQ" />
                </div>
                <div class="queue-box__counts">
                  <div class="queue-count">
                    <div class="queue-count__value tone-warning">{{ healthData.infrastructure.queues.orderSync.wait }}</div>
                    <div class="queue-count__label">Bekleyen</div>
                  </div>
                  <div class="queue-count">
                    <div class="queue-count__value tone-success">{{ healthData.infrastructure.queues.orderSync.active }}</div>
                    <div class="queue-count__label">Aktif</div>
                  </div>
                </div>
              </div>

              <div class="queue-box">
                <div class="queue-box__head">
                  <span class="label-caps">Export İşlemleri</span>
                  <EkStatusChip tone="info" label="INTERNAL" />
                </div>
                <div class="queue-box__counts">
                  <div class="queue-count">
                    <div class="queue-count__value tone-info">{{ healthData.infrastructure.queues.export.wait }}</div>
                    <div class="queue-count__label">Bekleyen</div>
                  </div>
                  <div class="queue-count">
                    <div class="queue-count__value tone-success">{{ healthData.infrastructure.queues.export.active }}</div>
                    <div class="queue-count__label">Aktif</div>
                  </div>
                </div>
              </div>

              <div class="queue-box">
                <div class="queue-box__head">
                  <span class="label-caps">Import İşlemleri</span>
                  <EkStatusChip tone="success" label="INTERNAL" />
                </div>
                <div class="queue-box__counts">
                  <div class="queue-count">
                    <div class="queue-count__value tone-success">{{ healthData.infrastructure.queues.import.wait }}</div>
                    <div class="queue-count__label">Bekleyen</div>
                  </div>
                  <div class="queue-count">
                    <div class="queue-count__value tone-success">{{ healthData.infrastructure.queues.import.active }}</div>
                    <div class="queue-count__label">Aktif</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </v-col>

        <v-col cols="12" md="4">
          <div class="panel h-100">
            <div class="panel-head">
              <div class="panel-head__left">
                <v-icon color="primary" aria-hidden="true">mdi-memory</v-icon>
                <span class="panel-title">Uygulama Önbelleği</span>
              </div>
            </div>

            <div class="cache-list">
              <div @click="openCacheDetail('hits')" @keydown.enter.prevent="openCacheDetail('hits')"
                @keydown.space.prevent="openCacheDetail('hits')" role="button" tabindex="0"
                class="cache-tile cache-tile--success hover-effect">
                <span class="cache-tile__label">Başarılı Erişim (Hit)</span>
                <span class="cache-tile__value">{{ healthData.infrastructure.memoryCache.hits }}</span>
              </div>
              <div @click="openCacheDetail('misses')" @keydown.enter.prevent="openCacheDetail('misses')"
                @keydown.space.prevent="openCacheDetail('misses')" role="button" tabindex="0"
                class="cache-tile cache-tile--danger hover-effect">
                <span class="cache-tile__label">Başarısız Erişim (Miss)</span>
                <span class="cache-tile__value">{{ healthData.infrastructure.memoryCache.misses }}</span>
              </div>
              <div @click="openCacheDetail('keys')" @keydown.enter.prevent="openCacheDetail('keys')"
                @keydown.space.prevent="openCacheDetail('keys')" role="button" tabindex="0"
                class="cache-tile hover-effect">
                <span class="cache-tile__label">Toplam Anahtar</span>
                <span class="cache-tile__value">{{ healthData.infrastructure.memoryCache.keys }}</span>
              </div>
            </div>
          </div>
        </v-col>
      </v-row>

      <!-- Redis -->
      <EkSection title="Redis Veri Sağlığı İzleyici" description="Gerçek zamanlı bellek ve bağlantı havuzu analitiği">
        <EkKpiRow>
          <EkKpiCard v-for="(val, label) in redisDisplayMetrics" :key="label" :label="String(label)" :value="val"
            :secondary-value="label === 'Aktif Bağlantı' ? 'Sisteme bağlı toplam istemci sayısı' : undefined" />
        </EkKpiRow>
      </EkSection>

      <!-- Önbellek dökümü -->
      <ActionDialogComponent v-model="showCacheDialog" :title="cacheDialogTitle" icon="mdi-memory" color="info"
        maxWidth="700px" :showFooter="false" attach=".adminSystemManagementView">
        <div class="dialog-body">
          <v-alert v-if="cacheDialogTitle.includes('Erişim')" type="info" variant="tonal" density="compact"
            class="mb-4 rounded-lg border">
            <div class="text-caption font-weight-bold">
              Hits/Misses istatistikleri NodeCache çalışma süresi boyunca birikmiş toplam verilerdir.
            </div>
          </v-alert>

          <EkDataTable v-if="healthData.infrastructure.memoryCache.breakdown.length > 0"
            :items="healthData.infrastructure.memoryCache.breakdown" :columns="cacheColumns" row-key="name"
            aria-label="Önbellek anahtar dağılımı tablosu" />
          <EkEmptyState v-else variant="no-data" title="Önbellek boş"
            message="Henüz önbelleğe alınmış veri bulunmamaktadır." />
        </div>
      </ActionDialogComponent>

      <!-- Export detay analizi -->
      <ActionDialogComponent v-model="showExportDialog" title="Export Trafiği Detaylı Analiz"
        icon="mdi-upload-network-outline" color="primary" maxWidth="1200px" :showFooter="false"
        attach=".adminSystemManagementView" @close="closeExportDetail">
        <div class="dialog-body">
          <div class="filter-bar sticky-filters">
            <v-btn-toggle v-model="exportViewMode" mandatory density="compact" color="primary" variant="outlined"
              class="view-toggle" aria-label="Görünüm seçimi">
              <v-btn value="table" icon="mdi-table" aria-label="Tablo görünümü"></v-btn>
              <v-btn value="charts" icon="mdi-chart-box-outline" aria-label="Grafik görünümü"></v-btn>
            </v-btn-toggle>

            <v-select v-model="exportFilters.timeFrame" :items="timeFrameOptions" label="Tarih" density="compact"
              hide-details variant="outlined" class="customTextField select-max-140"
              color="primary"></v-select>

            <v-select v-model="exportFilters.status" :items="statusOptions" label="Durum" density="compact" hide-details
              clearable variant="outlined" class="customTextField select-max-150"
              color="primary"></v-select>

            <v-select v-model="exportFilters.mode" :items="modeOptions" label="İşlem Tipi" density="compact"
              hide-details clearable variant="outlined" class="customTextField select-max-150"
              color="primary"></v-select>

            <v-select v-model="exportFilters.integrationCode" :items="platformOptions" label="Platform"
              density="compact" hide-details clearable variant="outlined"
              class="customTextField select-max-150" color="primary"></v-select>

            <v-spacer></v-spacer>

            <div class="controls-group">
              <v-switch v-model="exportAutoRefresh" hide-details color="success" inset density="compact">
                <template v-slot:label>
                  <span class="controls-label">Canlı izleme</span>
                </template>
              </v-switch>

              <v-btn @click="loadExportDetails()" icon variant="outlined" density="comfortable"
                :loading="exportLoading" aria-label="Export detaylarını yenile">
                <v-icon>mdi-magnify</v-icon>
              </v-btn>
            </div>
          </div>

          <!-- Tablo görünümü -->
          <template v-if="exportViewMode === 'table'">
            <div class="export-grid-host">
              <EkListFrame label="Export işleri">
                <EkDataGrid
                  :columns="exportColumns"
                  :rows="exportDetailData"
                  label="Export işleri tablosu"
                  row-key="_id"
                  label-key="clientName"
                  :sort="exportGridSort"
                  :loading="exportLoading && exportDetailData.length === 0"
                  :error="exportLoadError"
                  error-title="Export işleri yüklenemedi"
                  empty-title="Kayıt bulunamadı"
                  empty-text="Filtreleri değiştirerek yeniden deneyin."
                  @update:sort="onExportGridSort"
                >
                  <template #cell-client="{ row }">
                    <div class="d-flex flex-column">
                      <span class="cell-id">#{{ row.clientId }}</span>
                      <span class="cell-strong">{{ row.clientName }}</span>
                    </div>
                  </template>
                  <template #cell-createdAt="{ row }"><span class="cell-muted">{{ formatDateTime(row.createdAt) }}</span></template>
                  <template #cell-updatedAt="{ row }"><span class="cell-muted">{{ formatDateTime(row.updatedAt) }}</span></template>
                  <template #cell-itemCount="{ row }">
                    <EkStatusChip tone="info" :label="String(row.itemCount || 0)" />
                  </template>
                  <template #cell-status="{ row }">
                    <div class="d-flex flex-column align-start ga-1">
                      <EkStatusChip :tone="getStatusTone(row.status)" :label="formatStatus(row.status)" />
                      <span v-if="row.status === 'WAITING' && row.nextRunAt" class="next-run">
                        Sıradaki: {{ formatClock(row.nextRunAt) }}
                      </span>
                    </div>
                  </template>
                  <template #cell-integrationCode="{ row }">
                    <span class="cell-platform">{{ row.integrationCode }}</span>
                  </template>
                  <template #cell-mode="{ row }">
                    <span class="cell-muted cell-caps">
                      {{ PLATFORM_PROCESS_LABELS[row.mode as keyof typeof PLATFORM_PROCESS_LABELS] || row.mode }}
                    </span>
                  </template>
                  <template #error-action>
                    <EkButton tone="secondary" size="sm" icon="mdi-refresh" @click="loadExportDetails()">Tekrar dene</EkButton>
                  </template>
                </EkDataGrid>
                <template #pager>
                  <EkPagerBar
                    :page="exportFilters.page"
                    :page-size="exportFilters.limit"
                    :total="exportTotal"
                    label="Export işleri sayfalama"
                    @update:page="(p: number) => (exportFilters.page = p)"
                    @update:page-size="onExportPageSize"
                  />
                </template>
              </EkListFrame>
            </div>
          </template>

          <!-- Grafik görünümü -->
          <template v-else>
            <v-row class="pa-2">
              <v-col cols="12">
                <div class="panel">
                  <div class="label-caps col-title">GÜNLÜK İTEM TRAFİĞİ</div>
                  <v-chart v-if="isMounted" theme="entegrasyonik" class="chart chart-h-400" :option="exportTimelineChartOption" autoresize role="img"
                    aria-label="Günlük export item trafiği grafiği" />
                </div>
              </v-col>
              <v-col cols="12" md="6">
                <div class="panel h-100">
                  <div class="label-caps col-title">İŞLEM TİPİ DAĞILIMI (Ürün Bazlı)</div>
                  <v-chart v-if="isMounted" theme="entegrasyonik" class="chart chart-h-350" :option="exportModePieChartOption" autoresize role="img"
                    aria-label="Export işlem tipi dağılımı grafiği" />
                </div>
              </v-col>
              <v-col cols="12" md="6">
                <div class="panel h-100">
                  <div class="label-caps col-title">DURUM DAĞILIMI (Ürün Bazlı)</div>
                  <v-chart v-if="isMounted" theme="entegrasyonik" class="chart chart-h-350" :option="exportStatusPieChartOption" autoresize role="img"
                    aria-label="Export durum dağılımı grafiği" />
                </div>
              </v-col>
            </v-row>
          </template>
        </div>
      </ActionDialogComponent>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { PLATFORM_PROCESS, PLATFORM_PROCESS_LABELS } from '@/types/PlatformProcess';
import useRestApi from '@/composables/restapi';
import LoadingComponent from '@/components/LoadingComponent.vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import EkPageHeader from '@/components/ds/EkPageHeader.vue';
import EkSection from '@/components/ds/EkSection.vue';
import EkKpiRow from '@/components/ds/EkKpiRow.vue';
import EkKpiCard from '@/components/ds/EkKpiCard.vue';
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';
import EkDataTable, { type EkTableColumn } from '@/components/ds/EkDataTable.vue';
import EkListFrame from '@/components/ds/EkListFrame.vue';
import EkDataGrid, { type EkGridColumn, type EkGridSort } from '@/components/ds/EkDataGrid.vue';
import EkPagerBar from '@/components/ds/EkPagerBar.vue';
import EkButton from '@/components/ds/EkButton.vue';
import { isRequestError } from '@/components/ds/listStandard';
import { formatDateTime } from '@/composables/format';
import type { StatusTone } from '@/design/status-map';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart, PieChart } from 'echarts/charts';
import { TooltipComponent, GridComponent, LegendComponent } from 'echarts/components';
import { LegacyGridContainLabel } from 'echarts/features';
import { semanticColorsLight } from '@/design/tokens';
import { escapeHtml } from '@/utils/escapeHtml';

use([CanvasRenderer, BarChart, PieChart, TooltipComponent, GridComponent, LegendComponent, LegacyGridContainLabel]);

// ECharts canvas renkleri CSS değişkeni okuyamaz (ADR-0011 Karar 2 Aşama 1 istisnası) — nötr
// (eksen etiketi / dilim kenarlığı / dilim içi yazı) renkler token kaynağından JS değeri olarak
// alınır (eski literal'lar semantik token ile BİREBİR aynı değerdi: slate-500 / beyaz).
const CHART_NEUTRAL = {
  axisLabel: semanticColorsLight['content-muted'],
  sliceBorder: semanticColorsLight.surface,
  sliceLabel: semanticColorsLight.surface,
};

// Grafik durum renkleri: ADR-0015 Karar 3.3 — iş durumları anlamsal tonlara eşlenir, TEK kaynak
// token setidir (semanticColorsLight); literal renk YOK. `accent` (kuyruk/genel vurgu) = `info`.
const CHART_STATUS = {
  success: semanticColorsLight.success,
  error: semanticColorsLight.error,
  warning: semanticColorsLight.warning,
  accent: semanticColorsLight.info,
};

const cacheColumns: EkTableColumn[] = [
  { key: 'name', label: 'Modül / Prefix', type: 'text' },
  { key: 'count', label: 'Anahtar Sayısı', type: 'number' },
];

const showCacheDialog = ref(false);
const cacheDialogTitle = ref('');
const isMounted = ref(false);

const showExportDialog = ref(false);
const exportLoading = ref(false);
const exportAutoRefresh = ref(false);
let exportInterval: any = null;
const exportDetailData = ref<any[]>([]);
const exportAnalyticsData = ref<any>(null);
const exportViewMode = ref('table');
const exportTotal = ref(0);
const exportLoadError = ref(false);
const exportFilters = reactive({
  status: null,
  mode: null,
  integrationCode: null,
  timeFrame: 'WEEK',
  page: 1,
  limit: 25,
  sortField: 'createdAt',
  sortOrder: -1
});

const statusOptions = [
  { title: 'Tamamlanan', value: 'COMPLETED' },
  { title: 'Hatalı', value: 'FAILED' },
  { title: 'Bekliyor', value: 'WAITING' },
  { title: 'Kuyrukta', value: 'QUEUED' }
];

const modeOptions = Object.entries(PLATFORM_PROCESS_LABELS).map(([value, title]) => ({
  title,
  value
}));

const platformOptions = [
  { title: 'Trendyol', value: 'trendyol' },
  { title: 'Hepsiburada', value: 'hepsiburada' },
  { title: 'Pazarama', value: 'pazarama' },
  { title: 'Amazon', value: 'amazon' }
];

const restApi = useRestApi();
const loadingComponentRef = ref<any>(null);
const containerId = ref('.adminSystemManagementView');
const targetClientId = ref(null);
const clients = ref([]);
let refreshTimer: any = null;

const healthData: any = reactive({
  traffic: { exports: [], imports: [] },
  infrastructure: {
    activePods: [],
    redis: { usedMemory: '0', connectedClients: '0', uptime: '0', version: '0' },
    queues: { 
      orderSync: { wait: 0, active: 0 },
      export: { wait: 0, active: 0 },
      import: { wait: 0, active: 0 }
    },
    memoryCache: { hits: 0, misses: 0, keys: 0, breakdown: [] },
    topExports: [],
    topImports: []
  },
  operationInsights: {
    types: [],
    statuses: [],
    timeline: [],
    metrics: { totalFetched: 0, totalInserted: 0, totalUpdated: 0, totalFailed: 0, totalSkipped: 0, avgDuration: 0 }
  }
});

const redisDisplayMetrics = computed(() => ({
  'Hafıza Kullanımı': healthData.infrastructure.redis.usedMemory,
  'Aktif Bağlantı': healthData.infrastructure.redis.connectedClients,
  'Çalışma Süresi': formatUptime(healthData.infrastructure.redis.uptime),
  'Redis Versiyon': healthData.infrastructure.redis.version
}));

const loading = ref(false);
const autoRefresh = ref(false);
const timeFrame = ref('DAY');
const timeFrameOptions = [
  { title: 'Bugün', value: 'DAY' },
  { title: 'Bu Hafta', value: 'WEEK' },
  { title: 'Bu Ay', value: 'MONTH' },
  { title: 'Tümü', value: 'ALL' }
];

async function loadData() {
  loading.value = true;
  /*   const guid = loadingComponentRef.value?.info('Sistem verileri taranıyor...') || 'loading'; */
  try {
    const res = await restApi.post('AdminService/getSystemHealth', {
      timeFrame: timeFrame.value,
      targetClientId: targetClientId.value
    });
    if (res?.success) {
      healthData.traffic = res.traffic;

      // Sıralama Düzeltmesi (Stabil order)
      if (healthData.traffic.exports) {
        healthData.traffic.exports.sort((a: any, b: any) => formatStatus(a._id).localeCompare(formatStatus(b._id)));
      }
      if (healthData.traffic.imports) {
        healthData.traffic.imports.sort((a: any, b: any) => formatStatus(a._id).localeCompare(formatStatus(b._id)));
      }

      healthData.infrastructure = res.infrastructure;
      healthData.operationInsights = res.operationInsights;
      if (res.clients) clients.value = res.clients;
    }
  } finally {
    /*     loadingComponentRef.value?.remove(guid); */
    loading.value = false;
  }
}

const exportChartOption = computed(() => {
  const data = healthData.infrastructure.topExports || [];
  return buildExportChartOption(data);
});

const importChartOption = computed(() => {
  const data = healthData.infrastructure.topImports || [];
  return buildImportChartOption(data);
});

function buildExportChartOption(clients: any[]) {
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const item = clients[params[0].dataIndex];
        if (!item) return '';
        return `
          <div class="pa-2">
            <div class="text-caption font-weight-black color-slate-900 mb-1">${escapeHtml(item.name)}</div>
            <div class="d-flex align-center justify-space-between gap-4 mb-1">
              <span class="text-micro font-weight-bold color-success">Başarılı:</span>
              <span class="text-micro font-weight-black color-success">${escapeHtml(item.data.completed)}</span>
            </div>
            <div class="d-flex align-center justify-space-between gap-4 mb-1">
              <span class="text-micro font-weight-bold color-error">Hatalı:</span>
              <span class="text-micro font-weight-black color-error">${escapeHtml(item.data.failed)}</span>
            </div>
            <div class="d-flex align-center justify-space-between gap-4">
              <span class="text-micro font-weight-bold color-warning">Bekleyen:</span>
              <span class="text-micro font-weight-black color-warning">${escapeHtml(item.data.pending)}</span>
            </div>
          </div>
        `;
      }
    },
    legend: { show: true, bottom: 0 },
    grid: { top: '10%', left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: clients.map(c => c.name),
      axisLabel: { color: CHART_NEUTRAL.axisLabel }
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: 'Başarılı',
        type: 'bar',
        stack: 'status',
        emphasis: { focus: 'series' },
        data: clients.map(c => c.data.completed),
        itemStyle: { color: CHART_STATUS.success, borderRadius: [0, 0, 0, 0] }
      },
      {
        name: 'Hatalı',
        type: 'bar',
        stack: 'status',
        emphasis: { focus: 'series' },
        data: clients.map(c => c.data.failed),
        itemStyle: { color: CHART_STATUS.error, borderRadius: [4, 4, 0, 0] }
      },
      {
        name: 'Bekleyen',
        type: 'bar',
        emphasis: { focus: 'series' },
        data: clients.map(c => c.data.pending),
        itemStyle: { color: CHART_STATUS.warning, borderRadius: [4, 4, 0, 0] }
      }
    ]
  };
}

function buildImportChartOption(clients: any[]) {
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const item = clients[params[0].dataIndex];
        if (!item) return '';
        return `
          <div class="pa-2">
            <div class="text-caption font-weight-black color-slate-900 mb-1">${escapeHtml(item.name)}</div>
            <div class="d-flex align-center justify-space-between gap-4 mb-1">
              <span class="text-micro font-weight-bold color-success">Tamamlanan:</span>
              <span class="text-micro font-weight-black color-success">${escapeHtml(item.data.completed)}</span>
            </div>
            <div class="d-flex align-center justify-space-between gap-4">
              <span class="text-micro font-weight-bold color-error">Hatalı:</span>
              <span class="text-micro font-weight-black color-error">${escapeHtml(item.data.failed)}</span>
            </div>
          </div>
        `;
      }
    },
    legend: { show: true, bottom: 0 },
    grid: { top: '10%', left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: clients.map(c => c.name),
      axisLabel: { color: CHART_NEUTRAL.axisLabel }
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: 'Tamamlanan',
        type: 'bar',
        data: clients.map(c => c.data.completed),
        itemStyle: { color: CHART_STATUS.success, borderRadius: [4, 4, 0, 0] }
      },
      {
        name: 'Hatalı',
        type: 'bar',
        data: clients.map(c => c.data.failed),
        itemStyle: { color: CHART_STATUS.error, borderRadius: [4, 4, 0, 0] }
      }
    ]
  };
}

const OPERATION_LABELS: Record<string, string> = {
  'ORDER_SYNC': 'Sipariş Senk.',
  'CLAIM_SYNC': 'İade Senk.',
  'MESSAGE_SYNC': 'Mesaj Senk.',
  'FINANCIAL_SYNC': 'Finansal Senk.',
  'EXPORT': 'Ürün Export',
  'IMPORT_FETCH': 'Ürün Çekme',
  'IMPORT_SYNC': 'Ürün Senk.'
};

const insightTimelineChartOption = computed(() => {
  const data = healthData.operationInsights.timeline || [];
  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { top: '10%', left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d._id),
      axisLabel: { color: CHART_NEUTRAL.axisLabel }
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: 'Başarılı',
        type: 'line',
        smooth: true,
        data: data.map((d: any) => d.success),
        itemStyle: { color: CHART_STATUS.success },
        areaStyle: { opacity: 0.1 }
      },
      {
        name: 'Hatalı',
        type: 'line',
        smooth: true,
        data: data.map((d: any) => d.failed),
        itemStyle: { color: CHART_STATUS.error },
        areaStyle: { opacity: 0.1 }
      }
    ]
  };
});

const insightTypePieChartOption = computed(() => {
  const data = healthData.operationInsights.types || [];
  return {
    tooltip: { trigger: 'item' },
    legend: { orient: 'vertical', left: 'left' },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: { borderRadius: 10, borderColor: CHART_NEUTRAL.sliceBorder, borderWidth: 2 },
        label: { show: false },
        data: data.map((d: any) => ({
          value: d.count,
          name: OPERATION_LABELS[d._id] || d._id
        }))
      }
    ]
  };
});

const insightDurationBarChartOption = computed(() => {
  const data = healthData.operationInsights.types || [];
  return {
    tooltip: { trigger: 'axis' },
    grid: { top: '5%', left: '3%', right: '4%', bottom: '5%', containLabel: true },
    xAxis: { type: 'value' },
    yAxis: {
      type: 'category',
      data: data.map((d: any) => OPERATION_LABELS[d._id] || d._id),
      axisLabel: {}
    },
    series: [
      {
        type: 'bar',
        data: data.map((d: any) => Math.round(d.avgDuration)),
        itemStyle: {
          color: CHART_STATUS.accent,
          borderRadius: [0, 5, 5, 0]
        }
      }
    ]
  };
});

function openCacheDetail(type: string) {
  cacheDialogTitle.value = type === 'keys' ? 'Önbellek Anahtar Dağılımı' : 'Önbellek Erişim Detayları';
  showCacheDialog.value = true;
}

function formatUptime(seconds: string) {
  const s = parseInt(seconds);
  if (isNaN(s)) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

async function openExportDetail() {
  showExportDialog.value = true;
  await loadExportDetails();
}

function closeExportDetail() {
  showExportDialog.value = false;
  exportAutoRefresh.value = false;
  if (exportInterval) {
    clearInterval(exportInterval);
    exportInterval = null;
  }
}

watch(exportAutoRefresh, (val) => {
  if (val) {
    exportInterval = setInterval(() => {
      loadExportDetails();
    }, 10000);
  } else {
    if (exportInterval) {
      clearInterval(exportInterval);
      exportInterval = null;
    }
  }
});

watch(showExportDialog, (val) => {
  if (!val && exportInterval) {
    clearInterval(exportInterval);
    exportInterval = null;
    exportAutoRefresh.value = false;
  }
});

async function loadExportDetails() {
  exportLoading.value = true;
  try {
    const res = await restApi.post('AdminService/getExportDetails', {
      ...exportFilters,
      targetClientId: targetClientId.value
    });
    exportLoadError.value = isRequestError(res);
    if (res?.success) {
      exportDetailData.value = res.data;
      exportTotal.value = res.total;
      exportAnalyticsData.value = res.analytics;
    }
  } finally {
    exportLoading.value = false;
  }
}

const exportTimelineChartOption = computed(() => {
  if (!exportAnalyticsData.value) return {};
  const data = exportAnalyticsData.value.timeline || [];
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', data: data.map((d: any) => d.date) },
    yAxis: { type: 'value' },
    series: [{
      name: 'Toplam İtem',
      type: 'bar',
      data: data.map((d: any) => d.value),
      itemStyle: { color: CHART_STATUS.accent, borderRadius: [4, 4, 0, 0] }
    }]
  };
});

const exportModePieChartOption = computed(() => {
  if (!exportAnalyticsData.value) return {};
  const data = exportAnalyticsData.value.modes || [];
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: '70%',
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: CHART_NEUTRAL.sliceBorder, borderWidth: 2 },
      label: { show: true, position: 'inside', formatter: '{d}%', fontSize: 10, fontWeight: 'bold', color: CHART_NEUTRAL.sliceLabel },
      data: data.map((d: any) => ({ name: PLATFORM_PROCESS_LABELS[d.name as keyof typeof PLATFORM_PROCESS_LABELS] || d.name, value: d.value }))
    }]
  };
});

const exportStatusPieChartOption = computed(() => {
  if (!exportAnalyticsData.value) return {};
  const data = exportAnalyticsData.value.statuses || [];
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: '70%',
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: CHART_NEUTRAL.sliceBorder, borderWidth: 2 },
      label: { show: true, position: 'inside', formatter: '{d}%', fontSize: 10, fontWeight: 'bold', color: CHART_NEUTRAL.sliceLabel },
      data: data.map((d: any) => ({
        name: formatStatus(d.name),
        value: d.value,
        itemStyle: { color: getStatusColorHex(d.name) }
      }))
    }]
  };
});

function getStatusColorHex(status: string) {
  const s = status?.toUpperCase();
  if (['COMPLETED', 'SENT', 'SUCCESS'].includes(s)) return CHART_STATUS.success;
  if (['FAILED', 'CANCELLED', 'ERROR'].includes(s)) return CHART_STATUS.error;
  if (s === 'IN_QUEUE') return CHART_STATUS.accent;
  return CHART_STATUS.warning;
}

// Sıralanabilir sütun başlığının erişilebilirlik durumu (yalnızca görünüm; sıralama mantığı aynı).
// DS-v2 liste standardı — sıralama SUNUCUDA (getExportDetails `sortField`/`sortOrder`: 1 artan, -1 azalan).
const exportColumns: EkGridColumn[] = [
  { key: 'client', label: 'Müşteri (ID / Ad)' },
  { key: 'createdAt', label: 'Oluşturma', sortable: true },
  { key: 'updatedAt', label: 'Güncelleme', sortable: true },
  { key: 'itemCount', label: 'Toplam item' },
  { key: 'status', label: 'Durum' },
  { key: 'integrationCode', label: 'Platform' },
  { key: 'mode', label: 'İşlem tipi' },
];

const exportGridSort = computed<EkGridSort>(() =>
  exportFilters.sortField
    ? { key: exportFilters.sortField, dir: exportFilters.sortOrder === 1 ? 'asc' : 'desc' }
    : null
);

function onExportGridSort(sort: EkGridSort) {
  // Sunucuda "sırasız" yok: üçüncü tıklama varsayılana (oluşturma, yeniden eskiye) döner.
  exportFilters.sortField = sort?.key ?? 'createdAt';
  exportFilters.sortOrder = sort ? (sort.dir === 'asc' ? 1 : -1) : -1;
  loadExportDetails();
}

function onExportPageSize(size: number) {
  exportFilters.limit = size;
  exportFilters.page = 1;
}

// Auto-refresh on filter change
watch(() => exportFilters.status, () => loadExportDetails());
watch(() => exportFilters.mode, () => loadExportDetails());
watch(() => exportFilters.integrationCode, () => loadExportDetails());
watch(() => exportFilters.timeFrame, () => {
  exportFilters.page = 1;
  loadExportDetails();
});

watch(() => [exportFilters.page, exportFilters.limit], () => {
  loadExportDetails();
});

function getStatusTone(status: string): StatusTone {
  const s = status?.toUpperCase();
  if (['COMPLETED', 'SENT', 'SUCCESS'].includes(s)) return 'success';
  if (['FAILED', 'CANCELLED', 'ERROR'].includes(s)) return 'danger';
  return 'warning';
}

// Saat kısmı ("13:15"): tarih+saat biçimlendiricisinden alınır.
function formatClock(value: any): string {
  return formatDateTime(value).split(' ')[1] ?? '';
}

function formatStatus(status: string) {
  const mapping: any = {
    'COMPLETED': 'TAMAMLANDI',
    'FAILED': 'HATALI',
    'PENDING': 'BEKLEMEDE',
    'PROCESSING': 'İŞLENİYOR',
    'CANCELLED': 'İPTAL EDİLDİ',
    'ERROR': 'HATA',
    'SENT': 'GÖNDERİLDİ',
    'QUEUED': 'KUYRUKTA',
    'SUCCESS': 'BAŞARILI',
    'FETCHING': 'VERİ ÇEKİLİYOR',
    'WAITING': 'BEKLİYOR',
    'IN_QUEUE': 'SİNYAL KUYRUĞU'
  };
  return mapping[status] || status;
}

function getStatusColorClass(status: string) {
  const s = status?.toUpperCase();
  if (['COMPLETED', 'SENT', 'SUCCESS', 'SUCCESS_LOG'].includes(s)) return 'tone-success';
  if (['FAILED', 'CANCELLED', 'ERROR', 'FAILED_LOG'].includes(s)) return 'tone-danger';
  if (['PENDING', 'QUEUED', 'PROCESSING', 'FETCHING', 'WAITING'].includes(s)) return 'tone-warning';
  if (s === 'IN_QUEUE') return 'tone-info';
  return 'tone-muted';
}

watch([timeFrame, targetClientId], () => {
  loadData();
});

watch(autoRefresh, (val: any) => {
  if (val) {
    refreshTimer = setInterval(loadData, 10000); // 10 saniyede bir güncelle
  } else if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});

onMounted(() => {
  loadData();
  isMounted.value = true;
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<style scoped lang="scss">
.adminSystemManagementView {
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

.scroll-area {
  padding: var(--ek-space-6);
  padding-bottom: var(--ek-space-8);
}

.block {
  margin-bottom: var(--ek-space-8);
}

.load-indicator {
  height: 2px;
  margin: var(--ek-space-3) 0 var(--ek-space-4);
}

// ── Yüzeyler ────────────────────────────────────────────────────────────────
.panel {
  padding: var(--ek-space-5);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);

  &--muted { background: var(--ek-color-surface-muted); }
  &--inner { padding: var(--ek-space-4); }
}

.stack-gap { margin-bottom: var(--ek-space-4); }

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-4);

  &__left {
    display: flex;
    align-items: center;
    gap: var(--ek-space-2);
  }
}

// Aşama 3: başlık hiyerarşisi DS rollerine bağlandı — bölüm başlığı `heading` (16/24/600, cümle düzeni),
// kart başlığı `subheading`, mikro etiket `micro`. Eskiden bölüm başlıkları 11px BÜYÜK HARF, kart başlıkları
// BÜYÜK HARF'ti ve hiyerarşi tersine dönüyordu.
.panel-title {
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
  color: var(--ek-color-content-strong);
}

.section-title {
  margin: 0 0 var(--ek-space-4);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
  color: var(--ek-color-content-strong);
}

.label-caps {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.controls-label {
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  color: var(--ek-color-content-default);
}

.col-title {
  margin-bottom: var(--ek-space-3);
  color: var(--ek-color-content-muted);
}

// ── Kontroller ──────────────────────────────────────────────────────────────
.controls-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-4);
  padding: var(--ek-space-3) var(--ek-space-4);
}

.controls-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.timeframe-select-inline,
.client-select-inline {
  max-width: 250px;
}

.client-select-inline {
  min-width: 180px;
}

// `.timeframe-select-inline`'dan SONRA tanımlı olmalı (aynı özgüllük, sıra belirler).
.select-max-140 { max-width: 140px; }
.select-max-150 { max-width: 150px; }

.timeframe-select-inline :deep(.v-field__input),
.client-select-inline :deep(.v-field__input) {
  font-size: var(--ek-font-size-sm) !important;
  font-weight: var(--ek-font-weight-semibold) !important;
  color: var(--ek-color-primary) !important;
}

// ── Grafik boyutları ────────────────────────────────────────────────────────
.chart { width: 100%; }
.chart-min-350 { min-height: 350px; }
.chart-h-120 { height: 120px; }
.chart-h-180 { height: 180px; }
.chart-h-300 { height: 300px; }
.chart-h-350 { height: 350px; }
.chart-h-400 { height: 400px; }

// ── Trafik özetleri ─────────────────────────────────────────────────────────
.metric-pills {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.metric-pill {
  flex: 1 1 140px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) var(--ek-space-4);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);

  &__label {
    font-size: var(--ek-font-size-xs);
    font-weight: var(--ek-font-weight-semibold);
    text-transform: uppercase;
    color: var(--ek-color-content-muted);
  }

  &__value {
    font-size: var(--ek-font-size-lg);
    font-weight: var(--ek-font-weight-semibold);
  }
}

.tone-success { color: var(--ek-color-success); }
.tone-danger { color: var(--ek-color-error); }
.tone-warning { color: var(--ek-color-warning); }
.tone-info { color: var(--ek-color-info); }
.tone-muted { color: var(--ek-color-content-muted); }

// ── İçgörü kartları ─────────────────────────────────────────────────────────
.insight-list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.metric-insight-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  transition: border-color var(--ek-duration-base) var(--ek-easing-standard);

  &:hover { border-color: var(--ek-color-border-strong); }
}

.insight-left {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}

.insight-label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.insight-value {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.insight-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--ek-radius-full);

  &--sm { width: 32px; height: 32px; }
  &--info { background: var(--ek-color-info-subtle); color: var(--ek-color-info); }
  &--success { background: var(--ek-color-success-subtle); color: var(--ek-color-success); }
  &--warning { background: var(--ek-color-warning-subtle); color: var(--ek-color-warning); }
  &--danger { background: var(--ek-color-error-subtle); color: var(--ek-color-error); }
}

// ── Altyapı ─────────────────────────────────────────────────────────────────
.pod-list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pod-item {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-2);
  background: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);

  &__name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: var(--ek-font-size-sm);
    font-weight: var(--ek-font-weight-semibold);
    color: var(--ek-color-content-strong);
  }
}

.queue-list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.queue-box {
  padding: var(--ek-space-3);
  background: var(--ek-color-surface-muted);
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-lg);

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ek-space-2);
    margin-bottom: var(--ek-space-2);
  }

  &__counts {
    display: flex;
    gap: var(--ek-space-3);
  }
}

.queue-count {
  flex: 1;
  padding: var(--ek-space-1);
  text-align: center;
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);

  &__value {
    font-size: var(--ek-font-size-lg);
    font-weight: var(--ek-font-weight-semibold);
  }

  &__label {
    font-size: var(--ek-font-size-xs);
    text-transform: uppercase;
    color: var(--ek-color-content-muted);
  }
}

.cache-list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.cache-tile {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3);
  background: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-left-width: 3px;
  border-radius: var(--ek-radius-md);

  &--success { background: var(--ek-color-success-subtle); border-left-color: var(--ek-color-success); }
  &--danger { background: var(--ek-color-error-subtle); border-left-color: var(--ek-color-error); }

  &__label {
    font-size: var(--ek-font-size-sm);
    color: var(--ek-color-content-default);
  }

  &__value {
    font-size: var(--ek-font-size-md);
    font-weight: var(--ek-font-weight-semibold);
    color: var(--ek-color-content-strong);
  }
}

// Tıklanabilir önbellek kartları: hover/odakta yalnızca kenarlık geri bildirimi + görünür odak halkası.
.hover-effect {
  cursor: pointer;
  transition: border-color var(--ek-duration-base) var(--ek-easing-standard),
    box-shadow var(--ek-duration-base) var(--ek-easing-standard);
}

.hover-effect:hover,
.hover-effect:focus-visible {
  border-color: var(--ek-color-border-strong);
  box-shadow: var(--ek-shadow-md);
}

.hover-effect:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

// ── Diyaloglar ──────────────────────────────────────────────────────────────
.dialog-body {
  padding: 0 var(--ek-space-4) var(--ek-space-4);
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
  margin-bottom: var(--ek-space-4);
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-default);
}

.sticky-filters {
  position: sticky;
  top: calc(-1 * var(--ek-space-2));
  z-index: 11;
  margin-left: calc(-1 * var(--ek-space-4));
  margin-right: calc(-1 * var(--ek-space-4));
}

.view-toggle {
  margin-right: var(--ek-space-2);
  border-radius: var(--ek-radius-md);
}

.export-grid-host {
  height: 550px;
  margin-bottom: var(--ek-space-4);
}

.cell-id {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
}

.cell-strong {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.cell-muted {
  font-size: var(--ek-font-size-xs);
  color: var(--ek-color-content-default);
}

.cell-caps { text-transform: uppercase; }

.cell-platform {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  text-transform: uppercase;
  color: var(--ek-color-content-default);
}

.next-run {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-warning);
}
</style>
