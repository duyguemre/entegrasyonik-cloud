<template>
  <div class="adminSystemManagementView d-flex flex-column h-100 overflow-hidden">
    <LoadingComponent :attach="containerId" ref="loadingComponentRef" />

    <div class="flex-grow-1 overflow-y-auto pa-4 pa-sm-6 scroll-area" :aria-busy="loading ? 'true' : 'false'">

      <!-- Header / Info Section -->
      <div class="d-flex align-center flex-wrap gap-4 mb-8">
        <div class="premium-info-banner d-flex align-center pa-3 px-4 rounded-xl border flex-grow-1">
          <div class="info-icon-box mr-4">
            <v-icon color="primary" size="20">mdi-shield-check-outline</v-icon>
          </div>
          <div>
            <div class="text-caption font-weight-black color-slate-900 line-height-1">Sistem Durum Özeti</div>
            <div class="text-micro font-weight-bold color-slate-500">Platform sağlığı, aktif işleyiciler ve bellek
              durumu
              anlık olarak izleniyor.</div>
          </div>
        </div>

      </div>

      <!-- Operational Controls Row -->
      <v-card flat border
        class="rounded-xl pa-3 mb-6 border-subtle bg-slate-50 d-flex align-center justify-space-between flex-wrap ga-4">
        <div class="d-flex align-center ga-3 flex-grow-1">
          <v-icon color="primary" size="20">mdi-filter-variant</v-icon>
          <span class="text-caption font-weight-black color-slate-700">FİLTRE:</span>
          <v-select v-model="timeFrame" :items="timeFrameOptions" density="compact" hide-details variant="outlined"
            bg-color="white" class="customTextField timeframe-select-inline select-max-140 rounded-lg" color="primary"
            aria-label="Zaman aralığı"></v-select>

          <v-divider vertical class="mx-2" length="20"></v-divider>

          <v-select v-model="targetClientId" :items="clients" item-title="title" item-value="clientId"
            label="Mağaza Seçiniz" density="compact" hide-details clearable variant="outlined" bg-color="white"
            class="customTextField client-select-inline rounded-lg" color="primary" placeholder="Tüm Mağazalar">
            <template v-slot:prepend-inner>
              <v-icon size="18" color="slate-400">mdi-store-outline</v-icon>
            </template>
          </v-select>
        </div>

        <div class="d-flex align-center ga-6">
          <v-switch v-model="autoRefresh" hide-details color="success" inset density="compact" class="premium-switch">
            <template v-slot:label>
              <span class="text-caption font-weight-black color-slate-500 mr-2">CANLI İZLEME</span>
            </template>
          </v-switch>

          <v-divider vertical class="mx-2" length="20"></v-divider>

          <v-btn @click="loadData()" size="40" elevation="0" color="white" class="premium-cube-btn cube-btn-bordered"
            :loading="loading" aria-label="Sistem verilerini yenile">
            <v-icon size="x-large" color="passiveColor">mdi-refresh</v-icon>
          </v-btn>
        </div>
      </v-card>

      <!-- Main Analysis Grid -->
      <v-row class="mb-8">
        <!-- Export Column -->
        <v-col cols="12" md="6">
          <div class="section-title mb-4" role="heading" aria-level="2">EXPORT OPERASYONLARI</div>
          <v-card flat class="rounded-xl pa-5 bg-slate-50 border-subtle mb-4">
            <div class="d-flex align-center justify-space-between mb-4">
              <div class="d-flex align-center ga-2">
                <span class="text-subtitle-2 font-weight-black color-slate-800 uppercase">Export Trafiği (Global)</span>
                <v-btn icon="mdi-information-outline" size="24" variant="text" color="indigo"
                  @click="openExportDetail()" title="Detaylı Analiz" aria-label="Export trafiği detaylı analizini aç"></v-btn>
              </div>
              <v-icon color="indigo" size="24">mdi-upload-network-outline</v-icon>
            </div>
            <div class="d-flex flex-wrap gap-2">
              <div v-for="exp in healthData.traffic.exports" :key="exp._id"
                class="metric-pill pa-2 px-4 rounded-lg border flex-grow-1 bg-white">
                <div class="d-flex align-center justify-space-between">
                  <span class="text-micro font-weight-black color-slate-500 uppercase">{{ formatStatus(exp._id)
                  }}</span>
                  <span class="text-h6 font-weight-black" :class="getStatusColorClass(exp._id)">{{ exp.count }}</span>
                </div>
              </div>
            </div>
          </v-card>

          <v-card flat border class="rounded-xl pa-5 border-subtle">
            <div class="d-flex align-center mb-4">
              <v-icon color="indigo" class="mr-2" size="20">mdi-chart-bar</v-icon>
              <span class="text-caption font-weight-black color-slate-700">EN AKTİF 5 MAĞAZA</span>
            </div>
            <v-chart v-if="isMounted" class="chart chart-min-350" :option="exportChartOption" autoresize role="img"
              aria-label="En aktif 5 mağaza için export durumu grafiği (başarılı, hatalı, bekleyen)" />
          </v-card>
        </v-col>

        <!-- Import Column -->
        <v-col cols="12" md="6">
          <div class="section-title mb-4" role="heading" aria-level="2">IMPORT OPERASYONLARI</div>
          <v-card flat class="rounded-xl pa-5 bg-slate-50 border-subtle mb-4">
            <div class="d-flex align-center justify-space-between mb-4">
              <span class="text-subtitle-2 font-weight-black color-slate-800 uppercase">Import Trafiği (Global)</span>
              <v-icon color="success" size="24">mdi-download-network-outline</v-icon>
            </div>
            <div class="d-flex flex-wrap gap-2">
              <div v-for="imp in healthData.traffic.imports" :key="imp._id"
                class="metric-pill pa-2 px-4 rounded-lg border flex-grow-1 bg-white">
                <div class="d-flex align-center justify-space-between">
                  <span class="text-micro font-weight-black color-slate-500 uppercase">{{ formatStatus(imp._id)
                  }}</span>
                  <span class="text-h6 font-weight-black" :class="getStatusColorClass(imp._id)">{{ imp.count }}</span>
                </div>
              </div>
            </div>
          </v-card>

          <v-card flat border class="rounded-xl pa-5 border-subtle">
            <div class="d-flex align-center mb-4">
              <v-icon color="success" class="mr-2" size="20">mdi-chart-bar</v-icon>
              <span class="text-caption font-weight-black color-slate-700">EN AKTİF 5 MAĞAZA</span>
            </div>
            <v-chart v-if="isMounted" class="chart chart-min-350" :option="importChartOption" autoresize role="img"
              aria-label="En aktif 5 mağaza için import durumu grafiği (tamamlanan, hatalı)" />
          </v-card>
        </v-col>
      </v-row>

      <!-- 3. Operasyonel Insight Bölümü -->
      <div class="section-title mb-4 uppercase" role="heading" aria-level="2">Operasyonel Insights & Performans</div>
      <v-card flat border class="rounded-xl pa-5 mb-8 border-subtle bg-slate-50">
        <v-row>
          <!-- Sol: Genel Skor Kartları -->
          <v-col cols="12" lg="4">
            <div class="text-caption font-weight-black color-slate-500 mb-4 uppercase">TEMEL VERİ METRİKLERİ</div>
            <div class="d-flex flex-column ga-3">
              <div class="metric-insight-card pa-4 rounded-xl bg-white border d-flex align-center justify-space-between">
                <div class="d-flex align-center ga-3">
                  <v-avatar color="blue-lighten-5" size="36"><v-icon color="blue" size="20">mdi-cloud-download</v-icon></v-avatar>
                  <div>
                    <div class="text-micro font-weight-black color-slate-400 uppercase">Çekilen Kayıt</div>
                    <div class="text-subtitle-1 font-weight-black color-slate-800">{{ healthData.operationInsights.metrics.totalFetched }}</div>
                  </div>
                </div>
                <div class="text-right">
                  <v-chip size="x-small" color="blue" variant="tonal" class="font-weight-black">PLATFORM</v-chip>
                </div>
              </div>

              <div class="metric-insight-card pa-4 rounded-xl bg-white border d-flex align-center justify-space-between">
                <div class="d-flex align-center ga-3">
                  <v-avatar color="success-lighten-5" size="36"><v-icon color="success" size="20">mdi-plus-circle-outline</v-icon></v-avatar>
                  <div>
                    <div class="text-micro font-weight-black color-slate-400 uppercase">Yeni Eklenen</div>
                    <div class="text-subtitle-1 font-weight-black color-slate-800">{{ healthData.operationInsights.metrics.totalInserted }}</div>
                  </div>
                </div>
                <div class="text-right">
                  <v-chip size="x-small" color="success" variant="tonal" class="font-weight-black">VERİTABANI</v-chip>
                </div>
              </div>

              <div class="metric-insight-card pa-4 rounded-xl bg-white border d-flex align-center justify-space-between">
                <div class="d-flex align-center ga-3">
                  <v-avatar color="amber-lighten-5" size="36"><v-icon color="amber-darken-2" size="20">mdi-cached</v-icon></v-avatar>
                  <div>
                    <div class="text-micro font-weight-black color-slate-400 uppercase">Güncellenen</div>
                    <div class="text-subtitle-1 font-weight-black color-slate-800">{{ healthData.operationInsights.metrics.totalUpdated }}</div>
                  </div>
                </div>
                <div class="text-right">
                  <v-chip size="x-small" color="amber-darken-2" variant="tonal" class="font-weight-black">SYNC</v-chip>
                </div>
              </div>

              <div class="metric-insight-card pa-4 rounded-xl bg-white border d-flex align-center justify-space-between">
                <div class="d-flex align-center ga-3">
                  <v-avatar color="red-lighten-5" size="36"><v-icon color="red" size="20">mdi-alert-circle-outline</v-icon></v-avatar>
                  <div>
                    <div class="text-micro font-weight-black color-slate-400 uppercase">Hatalı Kayıt</div>
                    <div class="text-subtitle-1 font-weight-black color-slate-800">{{ healthData.operationInsights.metrics.totalFailed }}</div>
                  </div>
                </div>
                <div class="text-right">
                  <v-chip size="x-small" color="red" variant="tonal" class="font-weight-black">KRİTİK</v-chip>
                </div>
              </div>
            </div>
          </v-col>

          <!-- Orta: Trend Çizelgesi -->
          <v-col cols="12" lg="5">
            <div class="text-caption font-weight-black color-slate-500 mb-4 uppercase">OPERASYONEL BAŞARI TRENDİ</div>
            <v-card flat border class="rounded-xl pa-4 bg-white border-subtle fill-height">
              <v-chart v-if="isMounted" class="chart chart-h-300" :option="insightTimelineChartOption" autoresize role="img"
                aria-label="Operasyonel başarı trendi grafiği (günlük başarılı ve hatalı işlemler)" />
            </v-card>
          </v-col>

          <!-- Sağ: Dağılım ve Hız -->
          <v-col cols="12" lg="3">
            <div class="text-caption font-weight-black color-slate-500 mb-4 uppercase">İŞLEM DAĞILIMI</div>
            <v-card flat border class="rounded-xl pa-4 bg-white border-subtle mb-4">
              <v-chart v-if="isMounted" class="chart chart-h-180" :option="insightTypePieChartOption" autoresize role="img"
                aria-label="İşlem türü dağılımı grafiği" />
            </v-card>
            <div class="text-caption font-weight-black color-slate-500 mb-2 uppercase">ORTALAMA SÜRE (MS)</div>
             <v-card flat border class="rounded-xl pa-4 bg-white border-subtle">
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
          <v-card flat border class="rounded-xl pa-5 h-100 border-subtle">
            <div class="d-flex align-center mb-6">
              <v-icon color="indigo" class="mr-2">mdi-server-network-outline</v-icon>
              <span class="text-subtitle-1 font-weight-black color-slate-800">Aktif İşleyiciler / Podlar</span>
            </div>

            <v-list v-if="healthData.infrastructure.activePods.length > 0" class="pa-0" role="list"
              aria-label="Aktif işleyiciler / podlar">
              <v-list-item v-for="pod in healthData.infrastructure.activePods" :key="pod" role="listitem"
                class="pa-2 mb-2 bg-slate-50 rounded-lg border">
                <template v-slot:prepend>
                  <v-avatar color="indigo-lighten-5" size="32">
                    <v-icon color="indigo" size="18">mdi-console</v-icon>
                  </v-avatar>
                </template>
                <v-list-item-title class="text-caption font-weight-black color-slate-900">{{ pod }}</v-list-item-title>
                <template v-slot:append>
                  <v-chip size="x-small" color="success" variant="flat" class="font-weight-black">ÇALIŞIYOR</v-chip>
                </template>
              </v-list-item>
            </v-list>
            <div v-else class="text-center py-10 opacity-30">
              <v-icon size="48" color="slate-200">mdi-sleep</v-icon>
              <p class="text-micro font-weight-bold color-slate-400">Aktif işlemci bulunamadı</p>
              <p class="text-micro color-slate-400 opacity-70 px-6">Son 15 dakika içerisinde herhangi bir işlem kaydı tespit edilemedi.</p>
            </div>
          </v-card>
        </v-col>

        <!-- Queue Depths -->
        <v-col cols="12" md="4">
          <v-card flat border class="rounded-xl pa-5 h-100 border-subtle">
            <div class="d-flex align-center mb-6">
              <v-icon color="amber-darken-2" class="mr-2">mdi-tray-full</v-icon>
              <span class="text-subtitle-1 font-weight-black color-slate-800">Kuyruk Analizi</span>
            </div>

            <div class="d-flex flex-column gap-4">
              <!-- Order Sync Queue -->
              <div class="bg-slate-50 pa-3 rounded-xl border border-dashed">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="text-micro font-weight-black color-slate-600 uppercase">Sipariş Senkronizasyonu</span>
                  <v-chip size="x-small" color="amber-darken-2" class="font-weight-black" variant="flat">BULLMQ</v-chip>
                </div>
                <div class="d-flex gap-3">
                  <div class="flex-grow-1 text-center pa-1 bg-white rounded-lg border">
                    <div class="text-subtitle-1 font-weight-black color-amber-darken-2">
                      {{ healthData.infrastructure.queues.orderSync.wait }}
                    </div>
                    <div class="text-micro font-weight-bold color-slate-400 uppercase">Bekleyen</div>
                  </div>
                  <div class="flex-grow-1 text-center pa-1 bg-white rounded-lg border">
                    <div class="text-subtitle-1 font-weight-black color-success">
                      {{ healthData.infrastructure.queues.orderSync.active }}
                    </div>
                    <div class="text-micro font-weight-bold color-slate-400 uppercase">Aktif</div>
                  </div>
                </div>
              </div>

              <!-- Export Queue -->
              <div class="bg-slate-50 pa-3 rounded-xl border border-dashed">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="text-micro font-weight-black color-slate-600 uppercase">Export İşlemleri</span>
                  <v-chip size="x-small" color="indigo" class="font-weight-black" variant="flat">INTERNAL</v-chip>
                </div>
                <div class="d-flex gap-3">
                  <div class="flex-grow-1 text-center pa-1 bg-white rounded-lg border">
                    <div class="text-subtitle-1 font-weight-black color-indigo">
                      {{ healthData.infrastructure.queues.export.wait }}
                    </div>
                    <div class="text-micro font-weight-bold color-slate-400 uppercase">Bekleyen</div>
                  </div>
                  <div class="flex-grow-1 text-center pa-1 bg-white rounded-lg border">
                    <div class="text-subtitle-1 font-weight-black color-success">
                      {{ healthData.infrastructure.queues.export.active }}
                    </div>
                    <div class="text-micro font-weight-bold color-slate-400 uppercase">Aktif</div>
                  </div>
                </div>
              </div>

              <!-- Import Queue -->
              <div class="bg-slate-50 pa-3 rounded-xl border border-dashed">
                <div class="d-flex align-center justify-space-between mb-2">
                  <span class="text-micro font-weight-black color-slate-600 uppercase">Import İşlemleri</span>
                  <v-chip size="x-small" color="success" class="font-weight-black" variant="flat">INTERNAL</v-chip>
                </div>
                <div class="d-flex gap-3">
                  <div class="flex-grow-1 text-center pa-1 bg-white rounded-lg border">
                    <div class="text-subtitle-1 font-weight-black color-success">
                      {{ healthData.infrastructure.queues.import.wait }}
                    </div>
                    <div class="text-micro font-weight-bold color-slate-400 uppercase">Bekleyen</div>
                  </div>
                  <div class="flex-grow-1 text-center pa-1 bg-white rounded-lg border">
                    <div class="text-subtitle-1 font-weight-black color-success">
                      {{ healthData.infrastructure.queues.import.active }}
                    </div>
                    <div class="text-micro font-weight-bold color-slate-400 uppercase">Aktif</div>
                  </div>
                </div>
              </div>
            </div>
          </v-card>
        </v-col>

        <!-- Memory Cache / NodeCache -->
        <v-col cols="12" md="4">
          <v-card flat border class="rounded-xl pa-5 h-100 border-subtle">
            <div class="d-flex align-center mb-6">
              <v-icon color="teal" class="mr-2">mdi-memory</v-icon>
              <span class="text-subtitle-1 font-weight-black color-slate-800">Uygulama Önbelleği</span>
            </div>

            <div class="d-flex flex-column gap-3">
              <div @click="openCacheDetail('hits')" @keydown.enter.prevent="openCacheDetail('hits')"
                @keydown.space.prevent="openCacheDetail('hits')" role="button" tabindex="0"
                class="d-flex align-center justify-space-between pa-3 bg-teal-lighten-5 rounded-lg border cursor-pointer hover-effect">
                <span class="text-caption font-weight-bold color-teal-darken-4">Başarılı Erişim (Hit)</span>
                <span class="text-subtitle-2 font-weight-black color-teal-darken-4">{{
                  healthData.infrastructure.memoryCache.hits }}</span>
              </div>
              <div @click="openCacheDetail('misses')" @keydown.enter.prevent="openCacheDetail('misses')"
                @keydown.space.prevent="openCacheDetail('misses')" role="button" tabindex="0"
                class="d-flex align-center justify-space-between pa-3 bg-red-lighten-5 rounded-lg border cursor-pointer hover-effect">
                <span class="text-caption font-weight-bold color-red-darken-4">Başarısız Erişim (Miss)</span>
                <span class="text-subtitle-2 font-weight-black color-red-darken-4">{{
                  healthData.infrastructure.memoryCache.misses }}</span>
              </div>
              <div @click="openCacheDetail('keys')" @keydown.enter.prevent="openCacheDetail('keys')"
                @keydown.space.prevent="openCacheDetail('keys')" role="button" tabindex="0"
                class="d-flex align-center justify-space-between pa-3 bg-slate-50 rounded-lg border cursor-pointer hover-effect">
                <span class="text-caption font-weight-bold color-slate-600">Toplam Anahtar</span>
                <span class="text-subtitle-2 font-weight-black color-slate-800">{{
                  healthData.infrastructure.memoryCache.keys
                }}</span>
              </div>
            </div>
          </v-card>
        </v-col>
      </v-row>


      <!-- 4. Redis Diagnostics -->
      <v-card flat border class="rounded-xl pa-5 border-subtle">
        <div class="d-flex align-center mb-6">
          <v-icon color="red" class="mr-2">mdi-database-eye-outline</v-icon>
          <div>
            <div class="text-subtitle-1 font-weight-black color-slate-800">Redis Veri Sağlığı İzleyici</div>
            <div class="text-micro color-slate-400 font-weight-bold">Gerçek zamanlı bellek ve bağlantı havuzu analitiği</div>
          </div>
        </div>

        <v-row>
          <v-col cols="12" sm="3" v-for="(val, label) in redisDisplayMetrics" :key="label">
            <div class="pa-4 rounded-xl bg-slate-50 border text-center">
              <div class="text-subtitle-2 font-weight-bold color-slate-500 uppercase mb-1">{{ label }}</div>
              <div class="text-h6 font-weight-black color-slate-900">{{ val }}</div>
              <div v-if="label === 'Aktif Bağlantı'" class="text-micro color-slate-400 mt-1">Sisteme bağlı toplam istemci sayısı</div>
            </div>
          </v-col>
        </v-row>
      </v-card>

      <!-- Cache Detail Dialog -->
      <ActionDialogComponent v-model="showCacheDialog" :title="cacheDialogTitle" icon="mdi-memory" color="teal"
        maxWidth="700px" :showFooter="false" attach=".adminSystemManagementView">
        <div class="pa-4 pt-0">
          <v-alert v-if="cacheDialogTitle.includes('Erişim')" type="info" variant="tonal" density="compact"
            class="mb-4 rounded-lg border">
            <div class="text-caption font-weight-bold">
              Hits/Misses istatistikleri NodeCache çalışma süresi boyunca birikmiş toplam verilerdir.
            </div>
          </v-alert>

          <div v-if="healthData.infrastructure.memoryCache.breakdown.length > 0"
            class="border rounded-xl bg-slate-50 overflow-hidden">
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
                  <td class="text-right font-weight-black color-teal-darken-3">{{ item.count }}</td>
                </tr>
              </tbody>
            </v-table>
          </div>
          <div v-else class="text-center pa-10 text-grey border rounded-xl dash-border">
            Henüz önbelleğe alınmış veri bulunmamaktadır.
          </div>
        </div>
      </ActionDialogComponent>

      <!-- Export Detail Dialog -->
      <ActionDialogComponent v-model="showExportDialog" title="Export Trafiği Detaylı Analiz"
        icon="mdi-upload-network-outline" color="indigo" maxWidth="1200px" :showFooter="false"
        attach=".adminSystemManagementView" @close="closeExportDetail">
        <div class="pa-4 pt-0">
          <!-- Filters & View Switcher Area -->
          <div class="d-flex align-center flex-wrap ga-3 mb-4 bg-slate-50 pa-3 rounded-xl border sticky-filters">
            <v-btn-toggle v-model="exportViewMode" mandatory density="compact" color="indigo" variant="flat"
              class="rounded-lg border overflow-hidden mr-2" aria-label="Görünüm seçimi">
              <v-btn value="table" icon="mdi-table" aria-label="Tablo görünümü"></v-btn>
              <v-btn value="charts" icon="mdi-chart-box-outline" aria-label="Grafik görünümü"></v-btn>
            </v-btn-toggle>

            <v-select v-model="exportFilters.timeFrame" :items="timeFrameOptions" label="Tarih" density="compact"
              hide-details variant="outlined" bg-color="white" class="customTextField select-max-140 rounded-lg"
              color="indigo"></v-select>

            <v-select v-model="exportFilters.status" :items="statusOptions" label="Durum" density="compact" hide-details
              clearable variant="outlined" bg-color="white" class="customTextField select-max-150 rounded-lg"
              color="indigo"></v-select>

            <v-select v-model="exportFilters.mode" :items="modeOptions" label="İşlem Tipi" density="compact"
              hide-details clearable variant="outlined" bg-color="white" class="customTextField select-max-150 rounded-lg"
              color="indigo"></v-select>

            <v-select v-model="exportFilters.integrationCode" :items="platformOptions" label="Platform"
              density="compact" hide-details clearable variant="outlined" bg-color="white"
              class="customTextField select-max-150 rounded-lg" color="indigo"></v-select>

            <v-spacer></v-spacer>

            <div class="d-flex align-center ga-4">
              <v-switch v-model="exportAutoRefresh" hide-details color="success" inset density="compact"
                class="premium-switch">
                <template v-slot:label>
                  <span class="text-caption font-weight-black color-slate-500 mr-2">CANLI İZLEME</span>
                </template>
              </v-switch>

              <v-divider vertical class="mx-2" length="20"></v-divider>

              <v-btn @click="loadExportDetails()" size="40" elevation="0" color="white" class="premium-cube-btn cube-btn-bordered"
                :loading="exportLoading" aria-label="Export detaylarını yenile">
                <v-icon size="24" color="indigo">mdi-magnify</v-icon>
              </v-btn>
            </div>
          </div>

          <!-- Content Area: Table View -->
          <template v-if="exportViewMode === 'table'">
            <div class="border rounded-xl bg-white overflow-hidden shadow-sm mb-4">
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
                      <div class="text-micro font-weight-bold color-slate-600">
                        {{ new Date(item.createdAt).toLocaleString('tr-TR') }}
                      </div>
                    </td>
                    <td>
                      <div class="text-micro font-weight-bold color-slate-600">
                        {{ new Date(item.updatedAt).toLocaleString('tr-TR') }}
                      </div>
                    </td>
                    <td class="text-center">
                      <v-chip size="small" variant="tonal" color="indigo" class="font-weight-black">
                        {{ item.itemCount || 0 }}
                      </v-chip>
                    </td>
                    <td class="text-center">
                      <div class="d-flex flex-column align-center ga-1">
                        <v-chip size="x-small" :color="getStatusColor(item.status)" variant="flat"
                          class="font-weight-black">
                          {{ formatStatus(item.status) }}
                        </v-chip>
                        <span v-if="item.status === 'WAITING' && item.nextRunAt"
                          class="text-micro font-weight-black color-warning">
                          Sıradaki: {{ new Date(item.nextRunAt).toLocaleTimeString('tr-TR', {
                            hour: '2-digit', minute:
                              '2-digit'
                          }) }}
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
              <PaginationComponent v-model="exportFilters.page"
                :totalNumberOfPages="Math.ceil(exportTotal / exportFilters.limit)" :pagination="exportPagination"
                :static="true" @setPage="loadExportDetails" />
            </div>
          </template>

          <!-- Content Area: Charts View -->
          <template v-else>
            <v-row class="pa-2">
              <v-col cols="12">
                <v-card flat border class="rounded-xl pa-4 border-subtle">
                  <div class="text-caption font-weight-black color-slate-700 mb-4 uppercase">GÜNLÜK İTEM TRAFİĞİ</div>
                  <v-chart v-if="isMounted" class="chart chart-h-400" :option="exportTimelineChartOption" autoresize role="img"
                    aria-label="Günlük export item trafiği grafiği" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card flat border class="rounded-xl pa-4 border-subtle h-100">
                  <div class="text-caption font-weight-black color-slate-700 mb-4 uppercase">İŞLEM TİPİ DAĞILIMI (Ürün
                    Bazlı)</div>
                  <v-chart v-if="isMounted" class="chart chart-h-350" :option="exportModePieChartOption" autoresize role="img"
                    aria-label="Export işlem tipi dağılımı grafiği" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card flat border class="rounded-xl pa-4 border-subtle h-100">
                  <div class="text-caption font-weight-black color-slate-700 mb-4 uppercase">DURUM DAĞILIMI (Ürün Bazlı)
                  </div>
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
import PaginationComponent from '@/components/PaginationComponent.vue';
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
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

// Grafiklerin "canlı iş-durumu" paleti (başarılı/hatalı/bekleyen/kuyruk) — Vuetify çekirdek
// success/error/warning değerleri ile TAM eşleşmez, tailwind emerald/red/amber/
// indigo tonlarıdır: ADR-0011 Açık Soru 4 gereği yakın-ama-farklı renk token'a ZORLANMADI; eskiden
// 13 yerde tekrarlanan literal artık TEK yerde (bu nesnede) duruyor. Uyumlaştırma Açık Soru 4'ün
// ayrı, bilinçli commit'ine bırakıldı.
const CHART_STATUS = {
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
  accent: '#6366f1',
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
const exportPagination = computed(() => ({
  page: exportFilters.page,
  limit: exportFilters.limit,
  totalNumberOfRecords: exportTotal.value
}));
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

function getStatusColor(status: string) {
  const s = status?.toUpperCase();
  if (['COMPLETED', 'SENT', 'SUCCESS'].includes(s)) return 'success';
  if (['FAILED', 'CANCELLED', 'ERROR'].includes(s)) return 'error';
  return 'warning';
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
  if (['COMPLETED', 'SENT', 'SUCCESS', 'SUCCESS_LOG'].includes(s)) return 'text-success';
  if (['FAILED', 'CANCELLED', 'ERROR', 'FAILED_LOG'].includes(s)) return 'text-error';
  if (['PENDING', 'QUEUED', 'PROCESSING', 'FETCHING', 'WAITING'].includes(s)) return 'text-warning';
  if (s === 'IN_QUEUE') return 'text-indigo';
  return 'text-slate-400';
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
  // Çalışma alanı zemini: token setinde TAM eşleşen değer yok (en yakın `surface-muted` slate-50,
  // farklı bir ton) — ADR-0011 Açık Soru 4 gereği yakın-ama-farklı renk ZORLANMADI, canlı değer
  // korundu (mandalda tek literal).
  background-color: #f5f7f9;
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

.metric-pill {
  min-width: 140px;
  box-shadow: var(--ek-shadow-sm);
}

.status-dot {
  width: var(--ek-space-2);
  height: var(--ek-space-2);
  border-radius: var(--ek-radius-full);
}

.premium-info-banner {
  background: linear-gradient(to right, var(--ek-color-surface), var(--ek-color-surface-sunken));
  border: 1px solid var(--ek-color-border-default) !important;
  box-shadow: var(--ek-shadow-sm);
}

// Bilgi ikonu kutusu: açık mavi zemin/kenarlık (indigo-50 ailesi) için semantik token yok
// (`info-subtle` = sky-100, farklı ton) — ADR-0011 Açık Soru 4 gereği zorlanmadı.
.info-icon-box {
  width: var(--ek-space-8);
  height: var(--ek-space-8);
  border-radius: var(--ek-radius-lg);
  background: #f0f7ff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e0e7ff;
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

// slate-800 / slate-600 için semantik token yok (content-strong=900, content-default=700,
// content-muted=500) — yakın-ama-farklı, ADR-0011 Açık Soru 4 gereği zorlanmadı.
.color-slate-800 {
  color: #1e293b;
}

.color-slate-700 {
  color: var(--ek-color-content-default);
}

.color-slate-600 {
  color: #475569;
}

.color-slate-500 {
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
