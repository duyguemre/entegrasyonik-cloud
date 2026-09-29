<template>
  <div class="adminSystemManagementView d-flex flex-column h-100 overflow-hidden">
    <LoadingComponent :attach="containerId" ref="loadingComponentRef" />

    <div class="flex-grow-1 overflow-y-auto pa-4 pa-sm-6 scroll-area" :aria-busy="loading ? 'true' : 'false'">

      <EkPageHeader section="Yönetim" title="Sistem Yönetimi"
        description="Platform sağlığı, aktif işleyiciler ve bellek durumu anlık olarak izlenir." />

      <!-- Header / Info Section -->
      <div class="d-flex align-center flex-wrap ga-4 mt-4 mb-8">
        <div class="premium-info-banner d-flex align-center pa-3 px-4 border flex-grow-1">
          <div class="info-icon-box mr-4">
            <v-icon color="info" size="20">mdi-shield-check-outline</v-icon>
          </div>
          <div>
            <div class="banner-title">Sistem Durum Özeti</div>
            <div class="banner-text">Platform sağlığı, aktif işleyiciler ve bellek durumu anlık olarak izleniyor.</div>
          </div>
        </div>

      </div>

      <!-- Operational Controls Row -->
      <v-card flat border
        class="pa-3 mb-6 border-subtle bg-slate-50 d-flex align-center justify-space-between flex-wrap ga-4">
        <div class="d-flex align-center ga-3 flex-grow-1">
          <v-icon color="content-muted" size="20">mdi-filter-variant</v-icon>
          <span class="filter-label">Filtre:</span>
          <v-select v-model="timeFrame" :items="timeFrameOptions" hide-details
            class="timeframe-select-inline select-max-140"
            aria-label="Zaman aralığı"></v-select>

          <v-divider vertical class="mx-2" length="20"></v-divider>

          <v-select v-model="targetClientId" :items="clients" item-title="title" item-value="clientId"
            label="Mağaza Seçiniz" hide-details clearable
            class="client-select-inline" placeholder="Tüm Mağazalar">
            <template v-slot:prepend-inner>
              <v-icon size="18" color="content-muted">mdi-store-outline</v-icon>
            </template>
          </v-select>
        </div>

        <div class="d-flex align-center ga-6">
          <v-switch v-model="autoRefresh" hide-details inset>
            <template v-slot:label>
              <span class="filter-label">Canlı izleme</span>
            </template>
          </v-switch>

          <v-divider vertical class="mx-2" length="20"></v-divider>

          <v-btn icon variant="outlined" density="comfortable" @click="loadData()"
            :loading="loading" aria-label="Sistem verilerini yenile">
            <v-icon>mdi-refresh</v-icon>
          </v-btn>
        </div>
      </v-card>

      <!-- Main Analysis Grid -->
      <v-row class="mb-8">
        <!-- Export Column -->
        <v-col cols="12" md="6">
          <div class="section-title mb-4" role="heading" aria-level="2">EXPORT OPERASYONLARI</div>
          <v-card flat class="pa-5 bg-slate-50 border-subtle mb-4">
            <div class="d-flex align-center justify-space-between mb-4">
              <div class="d-flex align-center ga-2">
                <span class="subsection-title">Export Trafiği (Global)</span>
                <v-btn icon="mdi-information-outline" size="24" variant="text" color="primary"
                  @click="openExportDetail()" title="Detaylı Analiz" aria-label="Export trafiği detaylı analizini aç"></v-btn>
              </div>
              <v-icon color="content-muted" size="24">mdi-upload-network-outline</v-icon>
            </div>
            <div class="d-flex flex-wrap ga-2">
              <div v-for="exp in healthData.traffic.exports" :key="exp._id"
                class="metric-pill pa-2 px-4 border flex-grow-1 bg-white">
                <div class="d-flex align-center justify-space-between">
                  <span class="metric-pill-label">{{ formatStatus(exp._id) }}</span>
                  <span class="metric-pill-value ek-num" :class="`job-tone--${jobTone(exp._id)}`">{{ formatNumber(exp.count) }}</span>
                </div>
              </div>
            </div>
          </v-card>

          <v-card flat border class="pa-5 border-subtle">
            <div class="d-flex align-center mb-4">
              <v-icon color="content-muted" class="mr-2" size="20">mdi-chart-bar</v-icon>
              <span class="section-overline">En aktif 5 mağaza</span>
            </div>
            <v-chart v-if="isMounted" class="chart chart-min-350" :option="exportChartOption" autoresize role="img"
              aria-label="En aktif 5 mağaza için export durumu grafiği (başarılı, hatalı, bekleyen)" />
          </v-card>
        </v-col>

        <!-- Import Column -->
        <v-col cols="12" md="6">
          <div class="section-title mb-4" role="heading" aria-level="2">IMPORT OPERASYONLARI</div>
          <v-card flat class="pa-5 bg-slate-50 border-subtle mb-4">
            <div class="d-flex align-center justify-space-between mb-4">
              <span class="subsection-title">Import Trafiği (Global)</span>
              <v-icon color="content-muted" size="24">mdi-download-network-outline</v-icon>
            </div>
            <div class="d-flex flex-wrap ga-2">
              <div v-for="imp in healthData.traffic.imports" :key="imp._id"
                class="metric-pill pa-2 px-4 border flex-grow-1 bg-white">
                <div class="d-flex align-center justify-space-between">
                  <span class="metric-pill-label">{{ formatStatus(imp._id) }}</span>
                  <span class="metric-pill-value ek-num" :class="`job-tone--${jobTone(imp._id)}`">{{ formatNumber(imp.count) }}</span>
                </div>
              </div>
            </div>
          </v-card>

          <v-card flat border class="pa-5 border-subtle">
            <div class="d-flex align-center mb-4">
              <v-icon color="content-muted" class="mr-2" size="20">mdi-chart-bar</v-icon>
              <span class="section-overline">En aktif 5 mağaza</span>
            </div>
            <v-chart v-if="isMounted" class="chart chart-min-350" :option="importChartOption" autoresize role="img"
              aria-label="En aktif 5 mağaza için import durumu grafiği (tamamlanan, hatalı)" />
          </v-card>
        </v-col>
      </v-row>

      <!-- 3. Operasyonel Insight Bölümü -->
      <div class="section-title mb-4 uppercase" role="heading" aria-level="2">Operasyonel Insights & Performans</div>
      <v-card flat border class="pa-5 mb-8 border-subtle bg-slate-50">
        <v-row>
          <!-- Sol: Genel Skor Kartları -->
          <v-col cols="12" lg="4">
            <div class="section-overline mb-4">Temel veri metrikleri</div>
            <div class="d-flex flex-column ga-3">
              <div class="metric-insight-card pa-4 bg-white border d-flex align-center justify-space-between">
                <div class="d-flex align-center ga-3">
                  <v-avatar color="info-subtle" size="36"><v-icon color="info" size="20">mdi-cloud-download</v-icon></v-avatar>
                  <div>
                    <div class="metric-insight-label">Çekilen Kayıt</div>
                    <div class="metric-insight-value ek-num">{{ formatNumber(healthData.operationInsights.metrics.totalFetched) }}</div>
                  </div>
                </div>
                <EkStatusChip tone="info" label="Platform" />
              </div>

              <div class="metric-insight-card pa-4 bg-white border d-flex align-center justify-space-between">
                <div class="d-flex align-center ga-3">
                  <v-avatar color="success-subtle" size="36"><v-icon color="success" size="20">mdi-plus-circle-outline</v-icon></v-avatar>
                  <div>
                    <div class="metric-insight-label">Yeni Eklenen</div>
                    <div class="metric-insight-value ek-num">{{ formatNumber(healthData.operationInsights.metrics.totalInserted) }}</div>
                  </div>
                </div>
                <EkStatusChip tone="success" label="Veritabanı" />
              </div>

              <div class="metric-insight-card pa-4 bg-white border d-flex align-center justify-space-between">
                <div class="d-flex align-center ga-3">
                  <v-avatar color="warning-subtle" size="36"><v-icon color="warning" size="20">mdi-cached</v-icon></v-avatar>
                  <div>
                    <div class="metric-insight-label">Güncellenen</div>
                    <div class="metric-insight-value ek-num">{{ formatNumber(healthData.operationInsights.metrics.totalUpdated) }}</div>
                  </div>
                </div>
                <EkStatusChip tone="warning" label="Sync" />
              </div>

              <div class="metric-insight-card pa-4 bg-white border d-flex align-center justify-space-between">
                <div class="d-flex align-center ga-3">
                  <v-avatar color="error-subtle" size="36"><v-icon color="error" size="20">mdi-alert-circle-outline</v-icon></v-avatar>
                  <div>
                    <div class="metric-insight-label">Hatalı Kayıt</div>
                    <div class="metric-insight-value ek-num">{{ formatNumber(healthData.operationInsights.metrics.totalFailed) }}</div>
                  </div>
                </div>
                <EkStatusChip tone="danger" label="Kritik" />
              </div>
            </div>
          </v-col>

          <!-- Orta: Trend Çizelgesi -->
          <v-col cols="12" lg="5">
            <div class="section-overline mb-4">Operasyonel başarı trendi</div>
            <v-card flat border class="pa-4 bg-white border-subtle fill-height">
              <v-chart v-if="isMounted" class="chart chart-h-300" :option="insightTimelineChartOption" autoresize role="img"
                aria-label="Operasyonel başarı trendi grafiği (günlük başarılı ve hatalı işlemler)" />
            </v-card>
          </v-col>

          <!-- Sağ: Dağılım ve Hız -->
          <v-col cols="12" lg="3">
            <div class="section-overline mb-4">İŞLEM DAĞILIMI</div>
            <v-card flat border class="pa-4 bg-white border-subtle mb-4">
              <v-chart v-if="isMounted" class="chart chart-h-180" :option="insightTypePieChartOption" autoresize role="img"
                aria-label="İşlem türü dağılımı grafiği" />
            </v-card>
            <div class="section-overline mb-2">Ortalama süre (ms)</div>
             <v-card flat border class="pa-4 bg-white border-subtle">
              <v-chart v-if="isMounted" class="chart chart-h-120" :option="insightDurationBarChartOption" autoresize role="img"
                aria-label="İşlem türüne göre ortalama süre grafiği (milisaniye)" />
            </v-card>
          </v-col>
        </v-row>
      </v-card>

      <!-- Sub-Infrastructure Section -->
      <div class="section-title mb-4 uppercase" role="heading" aria-level="2">ALTYAPI VE SAĞLIK</div>
      <v-row class="mb-8">
        <!-- Active Pods -->
        <v-col cols="12" md="4">
          <v-card flat border class="pa-5 h-100 border-subtle">
            <div class="d-flex align-center mb-6">
              <v-icon color="primary" class="mr-2">mdi-server-network-outline</v-icon>
              <span class="text-subtitle-1 font-weight-black color-slate-800">Aktif İşleyiciler / Podlar</span>
            </div>

            <v-list v-if="healthData.infrastructure.activePods.length > 0" class="pa-0" role="list"
              aria-label="Aktif işleyiciler / podlar">
              <v-list-item v-for="pod in healthData.infrastructure.activePods" :key="pod" role="listitem"
                class="pa-2 mb-2 bg-slate-50 border">
                <template v-slot:prepend>
                  <v-avatar color="neutral-subtle" size="32">
                    <v-icon color="content-muted" size="18">mdi-console</v-icon>
                  </v-avatar>
                </template>
                <v-list-item-title class="text-caption font-weight-black color-slate-900">{{ pod }}</v-list-item-title>
                <template v-slot:append>
                  <EkStatusChip tone="success" label="Çalışıyor" />
                </template>
              </v-list-item>
            </v-list>
            <EkEmptyState v-else variant="no-data" title="Aktif işlemci bulunamadı"
              message="Son 15 dakika içerisinde herhangi bir işlem kaydı tespit edilemedi." />
          </v-card>
        </v-col>

        <!-- Queue Depths -->
        <v-col cols="12" md="4">
          <v-card flat border class="pa-5 h-100 border-subtle">
            <div class="d-flex align-center mb-6">
              <v-icon color="amber-darken-2" class="mr-2">mdi-tray-full</v-icon>
              <span class="text-subtitle-1 font-weight-black color-slate-800">Kuyruk Analizi</span>
            </div>

            <div class="d-flex flex-column ga-4">
              <!-- Order Sync Queue -->
              <div class="bg-slate-50 pa-3 border border-dashed">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="queue-label">Sipariş Senkronizasyonu</span>
                  <EkStatusChip tone="neutral" label="BullMQ" />
                </div>
                <div class="d-flex ga-3">
                  <div class="flex-grow-1 text-center pa-1 bg-white border">
                    <div class="queue-value queue-value--wait ek-num">
                      {{ formatNumber(healthData.infrastructure.queues.orderSync.wait) }}
                    </div>
                    <div class="queue-sublabel">Bekleyen</div>
                  </div>
                  <div class="flex-grow-1 text-center pa-1 bg-white border">
                    <div class="queue-value queue-value--active ek-num">
                      {{ formatNumber(healthData.infrastructure.queues.orderSync.active) }}
                    </div>
                    <div class="queue-sublabel">Aktif</div>
                  </div>
                </div>
              </div>

              <!-- Export Queue -->
              <div class="bg-slate-50 pa-3 border border-dashed">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="queue-label">Export İşlemleri</span>
                  <EkStatusChip tone="neutral" label="Internal" />
                </div>
                <div class="d-flex ga-3">
                  <div class="flex-grow-1 text-center pa-1 bg-white border">
                    <div class="queue-value queue-value--wait ek-num">
                      {{ formatNumber(healthData.infrastructure.queues.export.wait) }}
                    </div>
                    <div class="queue-sublabel">Bekleyen</div>
                  </div>
                  <div class="flex-grow-1 text-center pa-1 bg-white border">
                    <div class="queue-value queue-value--active ek-num">
                      {{ formatNumber(healthData.infrastructure.queues.export.active) }}
                    </div>
                    <div class="queue-sublabel">Aktif</div>
                  </div>
                </div>
              </div>

              <!-- Import Queue -->
              <div class="bg-slate-50 pa-3 border border-dashed">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="queue-label">Import İşlemleri</span>
                  <EkStatusChip tone="neutral" label="Internal" />
                </div>
                <div class="d-flex ga-3">
                  <div class="flex-grow-1 text-center pa-1 bg-white border">
                    <div class="queue-value queue-value--wait ek-num">
                      {{ formatNumber(healthData.infrastructure.queues.import.wait) }}
                    </div>
                    <div class="queue-sublabel">Bekleyen</div>
                  </div>
                  <div class="flex-grow-1 text-center pa-1 bg-white border">
                    <div class="queue-value queue-value--active ek-num">
                      {{ formatNumber(healthData.infrastructure.queues.import.active) }}
                    </div>
                    <div class="queue-sublabel">Aktif</div>
                  </div>
                </div>
              </div>
            </div>
          </v-card>
        </v-col>

        <!-- Memory Cache / NodeCache -->
        <v-col cols="12" md="4">
          <v-card flat border class="pa-5 h-100 border-subtle">
            <div class="d-flex align-center mb-6">
              <v-icon color="content-muted" class="mr-2">mdi-memory</v-icon>
              <span class="text-subtitle-1 font-weight-black color-slate-800">Uygulama Önbelleği</span>
            </div>

            <div class="d-flex flex-column ga-3">
              <div @click="openCacheDetail('hits')" @keydown.enter.prevent="openCacheDetail('hits')"
                @keydown.space.prevent="openCacheDetail('hits')" role="button" tabindex="0"
                class="d-flex align-center justify-space-between pa-3 bg-success-subtle border cursor-pointer hover-effect">
                <span class="cache-row-label cache-row-label--success">Başarılı Erişim (Hit)</span>
                <span class="cache-row-value cache-row-value--success ek-num">{{ formatNumber(healthData.infrastructure.memoryCache.hits) }}</span>
              </div>
              <div @click="openCacheDetail('misses')" @keydown.enter.prevent="openCacheDetail('misses')"
                @keydown.space.prevent="openCacheDetail('misses')" role="button" tabindex="0"
                class="d-flex align-center justify-space-between pa-3 bg-error-subtle border cursor-pointer hover-effect">
                <span class="cache-row-label cache-row-label--danger">Başarısız Erişim (Miss)</span>
                <span class="cache-row-value cache-row-value--danger ek-num">{{ formatNumber(healthData.infrastructure.memoryCache.misses) }}</span>
              </div>
              <div @click="openCacheDetail('keys')" @keydown.enter.prevent="openCacheDetail('keys')"
                @keydown.space.prevent="openCacheDetail('keys')" role="button" tabindex="0"
                class="d-flex align-center justify-space-between pa-3 bg-slate-50 border cursor-pointer hover-effect">
                <span class="text-caption font-weight-bold color-slate-600">Toplam Anahtar</span>
                <span class="text-subtitle-2 font-weight-black color-slate-800 ek-num">{{
                  formatNumber(healthData.infrastructure.memoryCache.keys)
                }}</span>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>


      <!-- 4. Redis Diagnostics -->
      <v-card flat border class="pa-5 border-subtle">
        <div class="d-flex align-center mb-6">
          <v-icon color="content-muted" class="mr-2">mdi-database-eye-outline</v-icon>
          <div>
            <div class="text-subtitle-1 font-weight-black color-slate-800">Redis Veri Sağlığı İzleyici</div>
            <div class="text-micro color-slate-400 font-weight-bold">Gerçek zamanlı bellek ve bağlantı havuzu analitiği</div>
          </div>
        </div>

        <v-row>
          <v-col cols="12" sm="3" v-for="(val, label) in redisDisplayMetrics" :key="label">
            <div class="pa-4 bg-slate-50 border text-center">
              <div class="text-subtitle-2 font-weight-bold color-slate-500 uppercase mb-1">{{ label }}</div>
              <div class="text-h6 font-weight-black color-slate-900">{{ val }}</div>
              <div v-if="label === 'Aktif Bağlantı'" class="text-micro color-slate-400 mt-1">Sisteme bağlı toplam istemci sayısı</div>
            </div>
          </v-col>
        </v-row>
      </v-card>

      <!-- Cache Detail Dialog -->
      <ActionDialogComponent v-model="showCacheDialog" :title="cacheDialogTitle" icon="mdi-memory" color="primary"
        maxWidth="700px" :showFooter="false" attach=".adminSystemManagementView">
        <div class="pa-4 pt-0">
          <v-alert v-if="cacheDialogTitle.includes('Erişim')" type="info" variant="tonal" density="compact"
            class="mb-4 border">
            <div class="text-caption font-weight-bold">
              Hits/Misses istatistikleri NodeCache çalışma süresi boyunca birikmiş toplam verilerdir.
            </div>
          </v-alert>

          <!-- ek-pattern-exception: EkDataTable — sabit iki sütunlu basit döküm tablosu, ancak
               DS `EkDataTable` yalnızca `views/secure/**` liste sayfaları için tasarlanmış tip
               sözleşmesi (money/date/status/…) taşır; burada anahtar-sayısı dökümü serbest biçimli
               (modül adı + sayı) olduğundan doğrudan ham tablo bileşeniyle basit KALDI. -->
          <div v-if="healthData.infrastructure.memoryCache.breakdown.length > 0"
            class="border bg-slate-50 overflow-hidden">
            <v-table density="compact" class="bg-transparent custom-cache-table">
              <thead>
                <tr class="bg-white">
                  <th class="text-left font-weight-black color-slate-700">Modül / Prefix</th>
                  <th class="text-right font-weight-black color-slate-700">Anahtar Sayısı</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in healthData.infrastructure.memoryCache.breakdown" :key="item.name">
                  <td class="text-caption font-weight-bold color-slate-600">{{ item.name }}</td>
                  <td class="text-right font-weight-black color-slate-900 ek-num">{{ formatNumber(item.count) }}</td>
                </tr>
              </tbody>
            </v-table>
          </div>
          <EkEmptyState v-else variant="no-data" title="Önbellek verisi yok"
            message="Henüz önbelleğe alınmış veri bulunmamaktadır." />
        </div>
      </ActionDialogComponent>

      <!-- Export Detail Dialog -->
      <ActionDialogComponent v-model="showExportDialog" title="Export Trafiği Detaylı Analiz"
        icon="mdi-upload-network-outline" color="primary" maxWidth="1200px" :showFooter="false"
        attach=".adminSystemManagementView" @close="closeExportDetail">
        <div class="pa-4 pt-0">
          <!-- Filters & View Switcher Area -->
          <div class="d-flex align-center flex-wrap ga-3 mb-4 bg-slate-50 pa-3 border sticky-filters">
            <v-btn-toggle v-model="exportViewMode" mandatory density="compact" color="primary" variant="flat"
              class="border overflow-hidden mr-2" aria-label="Görünüm seçimi">
              <v-btn value="table" icon="mdi-table" aria-label="Tablo görünümü"></v-btn>
              <v-btn value="charts" icon="mdi-chart-box-outline" aria-label="Grafik görünümü"></v-btn>
            </v-btn-toggle>

            <v-select v-model="exportFilters.timeFrame" :items="timeFrameOptions" label="Tarih"
              hide-details class="select-max-140"></v-select>

            <v-select v-model="exportFilters.status" :items="statusOptions" label="Durum" hide-details
              clearable class="select-max-150"></v-select>

            <v-select v-model="exportFilters.mode" :items="modeOptions" label="İşlem Tipi"
              hide-details clearable class="select-max-150"></v-select>

            <v-select v-model="exportFilters.integrationCode" :items="platformOptions" label="Platform"
              hide-details clearable class="select-max-150"></v-select>

            <v-spacer></v-spacer>

            <div class="d-flex align-center ga-4">
              <v-switch v-model="exportAutoRefresh" hide-details inset>
                <template v-slot:label>
                  <span class="filter-label">Canlı izleme</span>
                </template>
              </v-switch>

              <v-divider vertical class="mx-2" length="20"></v-divider>

              <v-btn icon variant="outlined" density="comfortable" @click="loadExportDetails()"
                :loading="exportLoading" aria-label="Export detaylarını yenile">
                <v-icon>mdi-magnify</v-icon>
              </v-btn>
            </div>
          </div>

          <!-- Content Area: Table View -->
          <!-- ek-pattern-exception: EkDataTable — sıralanabilir (`aria-sort` + tıklanabilir `th`)
               ve satır içi koşullu ek-metin (nextRunAt) taşıyan özel bir tablo; `EkDataTable` sıralama
               UI'si veya satır-koşullu ek içerik SUNMUYOR (yalnızca `cell-<key>` slot'u). Hücrelerin
               durum/say rozetleri `EkStatusChip`'e bağlandı. -->
          <template v-if="exportViewMode === 'table'">
            <div class="border bg-white overflow-hidden shadow-sm mb-4">
              <v-table density="comfortable" class="custom-export-table" fixed-header height="550px">
                <thead>
                  <tr class="bg-slate-50">
                    <th class="text-left font-weight-black color-slate-700 text-micro">MÜŞTERİ (ID / AD)</th>
                    <th class="text-left font-weight-black color-slate-700 text-micro cursor-pointer" tabindex="0"
                      :aria-sort="ariaSortFor('createdAt')" @click="toggleExportSort('createdAt')"
                      @keydown.enter.prevent="toggleExportSort('createdAt')">
                      OLUŞTURMA
                      <v-icon size="14" v-if="exportFilters.sortField === 'createdAt'">
                        {{ exportFilters.sortOrder === 1 ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                      </v-icon>
                    </th>
                    <th class="text-left font-weight-black color-slate-700 text-micro cursor-pointer" tabindex="0"
                      :aria-sort="ariaSortFor('updatedAt')" @click="toggleExportSort('updatedAt')"
                      @keydown.enter.prevent="toggleExportSort('updatedAt')">
                      GÜNCELLEME
                      <v-icon size="14" v-if="exportFilters.sortField === 'updatedAt'">
                        {{ exportFilters.sortOrder === 1 ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                      </v-icon>
                    </th>
                    <th class="text-center font-weight-black color-slate-700 text-micro">TOPLAM İTEM</th>
                    <th class="text-center font-weight-black color-slate-700 text-micro">DURUM</th>
                    <th class="text-center font-weight-black color-slate-700 text-micro">PLATFORM</th>
                    <th class="text-left font-weight-black color-slate-700 text-micro">İŞLEM TİPİ</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in exportDetailData" :key="item._id">
                    <td>
                      <div class="d-flex flex-column">
                        <span class="text-micro font-weight-black color-slate-400">#{{ item.clientId }}</span>
                        <span class="text-caption font-weight-bold color-slate-800">{{ item.clientName }}</span>
                      </div>
                    </td>
                    <td>
                      <div class="text-micro font-weight-bold color-slate-600 ek-num">
                        {{ formatDateTime(item.createdAt) }}
                      </div>
                    </td>
                    <td>
                      <div class="text-micro font-weight-bold color-slate-600 ek-num">
                        {{ formatDateTime(item.updatedAt) }}
                      </div>
                    </td>
                    <td class="text-center">
                      <EkStatusChip tone="neutral" :label="String(item.itemCount || 0)" />
                    </td>
                    <td class="text-center">
                      <div class="d-flex flex-column align-center ga-1">
                        <EkStatusChip :tone="jobTone(item.status)" :label="formatStatus(item.status)" />
                        <span v-if="item.status === 'WAITING' && item.nextRunAt"
                          class="text-micro font-weight-black text-warning">
                          Sıradaki: {{ formatTimeOnly(item.nextRunAt) }}
                        </span>
                      </div>
                    </td>
                    <td class="text-center">
                      <div class="d-flex align-center justify-center ga-1">
                        <span class="text-caption font-weight-black uppercase color-slate-700">{{ item.integrationCode
                        }}</span>
                      </div>
                    </td>
                    <td>
                      <span class="text-micro font-weight-bold color-slate-500 uppercase">
                        {{ PLATFORM_PROCESS_LABELS[item.mode as keyof typeof PLATFORM_PROCESS_LABELS] || item.mode }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="exportDetailData.length === 0">
                    <td colspan="7" class="text-center py-10 opacity-50">Kayıt bulunamadı</td>
                  </tr>
                </tbody>
              </v-table>
            </div>

            <!-- Pagination Area -->
            <div class="sticky-pagination-container">
              <EkPagination :page="exportFilters.page" :page-size="exportFilters.limit" :total="exportTotal"
                @update:page="onExportPageChange" @update:page-size="onExportPageSizeChange" />
            </div>
          </template>

          <!-- Content Area: Charts View -->
          <template v-else>
            <v-row class="pa-2">
              <v-col cols="12">
                <v-card flat border class="pa-4 border-subtle">
                  <!-- Karar 1.2 istisnası: spec çapası metin (e2e/specs/admin-system.spec.ts:88
                       `getByText('GÜNLÜK İTEM TRAFİĞİ')`) — Türkçe İ/ı büyük/küçük harf tuzağı
                       (ADR-0015 Bağlam) nedeniyle DOM'da AYNEN korunur, yalnızca CSS ile
                       (`.section-overline`) üst-etiket görünümü verilir. -->
                  <div class="section-overline mb-4">GÜNLÜK İTEM TRAFİĞİ</div>
                  <v-chart v-if="isMounted" class="chart chart-h-400" :option="exportTimelineChartOption" autoresize role="img"
                    aria-label="Günlük export item trafiği grafiği" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card flat border class="pa-4 border-subtle h-100">
                  <div class="section-overline mb-4">İŞLEM TİPİ DAĞILIMI (Ürün Bazlı)</div>
                  <v-chart v-if="isMounted" class="chart chart-h-350" :option="exportModePieChartOption" autoresize role="img"
                    aria-label="Export işlem tipi dağılımı grafiği" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card flat border class="pa-4 border-subtle h-100">
                  <div class="section-overline mb-4">DURUM DAĞILIMI (Ürün Bazlı)</div>
                  <v-chart v-if="isMounted" class="chart chart-h-350" :option="exportStatusPieChartOption" autoresize role="img"
                    aria-label="Export durum dağılımı grafiği" />
                </v-card>
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
import EkStatusChip from '@/components/ds/EkStatusChip.vue';
import EkEmptyState from '@/components/ds/EkEmptyState.vue';
import EkPagination from '@/components/ds/EkPagination.vue';
import { formatNumber, formatDateTime } from '@/composables/format';
import { JOB_STATUS_TONE, type JobStatus, type StatusTone } from '@/design/status-map';
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

// Grafiklerin "canlı iş-durumu" paleti (başarılı/hatalı/bekleyen/kuyruk) — Karar 3.3 "canlı
// iş-durumu paleti" KARARI: bespoke tailwind emerald/red/amber/indigo hex'leri KALDIRILDI (B3),
// tek kaynak `semanticColorsLight`'tan JS değeri olarak okunur (ECharts canvas CSS değişkeni
// okuyamadığı için ADR-0011 Karar 2 istisnası).
const CHART_STATUS = {
  success: semanticColorsLight.success,
  error: semanticColorsLight.error,
  warning: semanticColorsLight.warning,
  accent: semanticColorsLight.primary,
};

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
    legend: { show: true, bottom: 0, textStyle: { fontSize: 10, fontWeight: 'bold' } },
    grid: { top: '10%', left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: clients.map(c => c.name),
      axisLabel: { fontWeight: 'bold', color: CHART_NEUTRAL.axisLabel, fontSize: 10 }
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
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
    legend: { show: true, bottom: 0, textStyle: { fontSize: 10, fontWeight: 'bold' } },
    grid: { top: '10%', left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: clients.map(c => c.name),
      axisLabel: { fontWeight: 'bold', color: CHART_NEUTRAL.axisLabel, fontSize: 10 }
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
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
    legend: { bottom: 0, textStyle: { fontSize: 10, fontWeight: 'bold' } },
    grid: { top: '10%', left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d._id),
      axisLabel: { fontWeight: 'bold', color: CHART_NEUTRAL.axisLabel, fontSize: 10 }
    },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dashed' } } },
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
    legend: { orient: 'vertical', left: 'left', textStyle: { fontSize: 10, fontWeight: 'bold' } },
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
    xAxis: { type: 'value', axisLabel: { fontSize: 10 } },
    yAxis: {
      type: 'category',
      data: data.map((d: any) => OPERATION_LABELS[d._id] || d._id),
      axisLabel: { fontWeight: 'bold', fontSize: 10 }
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
    legend: { bottom: '0', textStyle: { fontSize: 10 } },
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
    legend: { bottom: '0', textStyle: { fontSize: 10 } },
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

// Karar 3.3 — durum kodu status-map.ts TEK KAYNAĞINDAN okunur (ekran renk seçmez). Ham backend
// kodları (COMPLETED/FAILED/…) yerel bir anahtar haritasıyla 5 kanonik iş durumuna indirgenir
// (AdminClientDetailComponent.vue'daki AYNI desen).
const JOB_RAW_TO_KEY: Record<string, JobStatus> = {
  PENDING: 'queued', QUEUED: 'queued',
  PROCESSING: 'processing', FETCHING: 'processing', WAITING: 'processing', IN_QUEUE: 'processing',
  COMPLETED: 'completed', SENT: 'completed', SUCCESS: 'completed',
  FAILED: 'failed', CANCELLED: 'failed', ERROR: 'failed',
};
function jobTone(status: string): StatusTone {
  const key = JOB_RAW_TO_KEY[status?.toUpperCase()];
  return key ? JOB_STATUS_TONE[key].tone : 'neutral';
}

// Sıradaki çalışma zamanı (yalnızca saat) — `composables/format.ts` yalnızca tarih+saat birlikte
// sunar, saat-tek gösterim için (AdminChatComponent.vue'daki AYNI desen) doğrudan
// `Intl.DateTimeFormat` kullanılır (desen mandalının izlediği biçimlendirme çağrıları arasında yer
// almaz, bkz. scripts/pattern-counts.js).
function formatTimeOnly(date: any) {
  return date ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(date)) : '';
}

function onExportPageChange(page: number) {
  exportFilters.page = page;
}

function onExportPageSizeChange(size: number) {
  exportFilters.limit = size;
  exportFilters.page = 1;
}

// Sıralanabilir sütun başlığının erişilebilirlik durumu (yalnızca görünüm; sıralama mantığı aynı).
function ariaSortFor(field: string): 'ascending' | 'descending' | 'none' {
  if (exportFilters.sortField !== field) return 'none';
  return exportFilters.sortOrder === 1 ? 'ascending' : 'descending';
}

function toggleExportSort(field: string) {
  if (exportFilters.sortField === field) {
    exportFilters.sortOrder = exportFilters.sortOrder === 1 ? -1 : 1;
  } else {
    exportFilters.sortField = field;
    exportFilters.sortOrder = -1;
  }
  loadExportDetails();
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
  background: var(--ek-color-background);
}

.scroll-area {
  padding-bottom: 2rem !important;
}

// `transition: all` + hover'da yukarı kayma (translateY) kaldırıldı — premium-ui-standards:
// yalnızca işlevsel geri bildirim (renk/kenarlık, 200ms ease-in-out).
.premium-cube-btn {
  border: 1px solid var(--ek-color-border-default);
  transition: background-color var(--ek-duration-base) var(--ek-easing-standard),
    border-color var(--ek-duration-base) var(--ek-easing-standard);
}

.premium-cube-btn:hover {
  background-color: var(--ek-color-surface-sunken) !important;
}

// Yenile/ara düğmelerindeki (eski inline style) vurgulu kenarlık: legacy `borderColor` token'ı.
.cube-btn-bordered {
  border: 1px solid var(--ek-color-border-color);
}

.timeframe-select-inline,
.client-select-inline {
  max-width: 250px;
}

// Eski inline `max-width` değerleri (mandal: inline style) — sınıfa taşındı; `.timeframe-select-inline`
// den SONRA tanımlı olmalı (aynı özgüllük, sıra belirler).
.select-max-140 {
  max-width: 140px;
}

.select-max-150 {
  max-width: 150px;
}

.timeframe-select-inline :deep(.v-field__input),
.client-select-inline :deep(.v-field__input) {
  font-size: var(--ek-font-size-sm) !important;
  font-weight: 800 !important;
  color: var(--ek-color-primary) !important;
}

// Eski satır-içi (inline) yükseklik/genişlik bildirimleri: grafik boyutları (ECharts kapsayıcıları).
.chart {
  width: 100%;
}

.chart-min-350 {
  min-height: 350px;
}

.chart-h-120 {
  height: 120px;
}

.chart-h-180 {
  height: 180px;
}

.chart-h-300 {
  height: 300px;
}

.chart-h-350 {
  height: 350px;
}

.chart-h-400 {
  height: 400px;
}

.section-title {
  font-size: var(--ek-font-size-xs);
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--ek-color-content-muted);
}

// Karar 1.2 — alt bölüm/kart başlığı "üst etiket" (overline) stilindedir.
.section-overline,
.subsection-title {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
}

.filter-label {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
}

.banner-title {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  line-height: 1.4;
}

.banner-text {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}

.metric-pill {
  min-width: 140px;
  box-shadow: var(--ek-shadow-sm);
}

.metric-pill-label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
}

.metric-pill-value {
  font-size: var(--ek-font-size-lg);
  font-weight: var(--ek-font-weight-semibold);
}

// Karar 3.3 "canlı iş-durumu paleti" — status-map.ts StatusTone değerleriyle BİREBİR.
.job-tone--success { color: var(--ek-color-success); }
.job-tone--warning { color: var(--ek-color-warning); }
.job-tone--danger { color: var(--ek-color-error); }
.job-tone--info { color: var(--ek-color-info); }
.job-tone--neutral { color: var(--ek-color-neutral); }

.metric-insight-label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
}

.metric-insight-value {
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.queue-label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-default);
  text-transform: uppercase;
}

.queue-value {
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
}

.queue-value--wait { color: var(--ek-color-warning); }
.queue-value--active { color: var(--ek-color-success); }

.queue-sublabel {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
}

.cache-row-label {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
}

.cache-row-value {
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
}

.cache-row-label--success, .cache-row-value--success { color: var(--ek-color-success); }
.cache-row-label--danger, .cache-row-value--danger { color: var(--ek-color-error); }

.premium-info-banner {
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default) !important;
  box-shadow: var(--ek-shadow-sm);
}

.info-icon-box {
  width: var(--ek-space-8);
  height: var(--ek-space-8);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-info-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--ek-color-info-subtle);
}

.line-height-1 {
  line-height: 1.4 !important;
}

// Tıklanabilir önbellek kartları: hover'da yalnızca zemin + gölge geri bildirimi (eski
// `translateY(-2px)` zıplaması kaldırıldı), klavye odağında aynı geri bildirim + görünür odak halkası.
.hover-effect {
  transition: background-color var(--ek-duration-base) var(--ek-easing-standard),
    box-shadow var(--ek-duration-base) var(--ek-easing-standard);
  cursor: pointer;
}

.hover-effect:hover,
.hover-effect:focus-visible {
  background-color: var(--ek-color-surface-sunken) !important;
  box-shadow: var(--ek-shadow-md);
}

.hover-effect:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: 2px;
}

.custom-cache-table :deep(tr:last-child td) {
  border-bottom: none !important;
}

.custom-cache-table :deep(th) {
  font-size: var(--ek-font-size-xs) !important;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.dash-border {
  border-style: dashed !important;
}

// Sıralanabilir tablo başlıkları (klavye ile odaklanabilir): görünür odak halkası.
.custom-export-table th[tabindex]:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: -2px;
}

.sticky-pagination-container {
  position: sticky;
  bottom: calc(-1 * var(--ek-space-4));
  background: var(--ek-color-surface);
  z-index: 10;
  border-top: 1px solid var(--ek-color-border-default);
  margin-left: calc(-1 * var(--ek-space-4));
  margin-right: calc(-1 * var(--ek-space-4));
  padding: var(--ek-space-2) var(--ek-space-4);
}

.sticky-filters {
  position: sticky;
  top: calc(-1 * var(--ek-space-2));
  z-index: 11;
  background: var(--ek-color-surface-muted) !important;
  margin-left: calc(-1 * var(--ek-space-4));
  margin-right: calc(-1 * var(--ek-space-4));
  padding: var(--ek-space-3) var(--ek-space-4) !important;
  border-radius: 0 !important;
  border-bottom: 1px solid var(--ek-color-border-default) !important;
}

.color-slate-900 {
  color: var(--ek-color-content-strong);
}

.color-slate-800 {
  color: var(--ek-color-content-strong);
}

.color-slate-700 {
  color: var(--ek-color-content-default);
}

.color-slate-600 {
  color: var(--ek-color-neutral);
}

.color-slate-500 {
  color: var(--ek-color-content-muted);
}

.color-slate-400 {
  color: var(--ek-color-content-muted);
}

.text-micro {
  font-size: var(--ek-font-size-xs);
}

.gap-2 {
  gap: var(--ek-space-2);
}

.gap-3 {
  gap: var(--ek-space-3);
}

.gap-4 {
  gap: var(--ek-space-4);
}

.gap-6 {
  gap: var(--ek-space-6);
}

.uppercase {
  text-transform: uppercase;
}

.border-subtle {
  border: 1px solid var(--ek-color-border-default) !important;
}

// Eski yana kayma (translateX) ve özel geçiş eğrisi kaldırıldı: hover'da yalnızca kenarlık/gölge
// geri bildirimi (token süre/eğri).
.metric-insight-card {
  transition: border-color var(--ek-duration-base) var(--ek-easing-standard),
    box-shadow var(--ek-duration-base) var(--ek-easing-standard);
  border: 1px solid var(--ek-color-border-default) !important;
  box-shadow: var(--ek-shadow-sm);

  &:hover {
    box-shadow: var(--ek-shadow-md);
    border-color: var(--ek-color-border-strong) !important;
  }
}
</style>
