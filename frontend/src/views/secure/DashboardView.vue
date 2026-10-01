<!--
  Genel bakış (dashboard) — DS-v2 Aşama 2.

  FR3-16 hiyerarşisi: (1) "Bugün sırada" — sıradaki iş + sonra yapılacaklar (DashboardNextActions, nextActions.ts;
  sipariş bekleyenleri + stok uyarıları + entegrasyon sağlığından), (2) işletme performansı (KPI), (3) sipariş ve kanal
  durumu, (4) stok ve katalog. Eski "Bekleyen aksiyonlar" kartı (1)'in içine taşındı.

  Kart ↔ veri kaynağı (YALNIZCA gerçek backend uçları; uydurma sayı/trend yok):
    Bugün sırada, KPI satırı, Son 7 gün, Sipariş durumları → OrderService/getOrderDashboardInsights (member, tek istek)
    Stok ve eşleşme uyarıları (+ Bugün sırada)                  → StockService/getStockOverview (member)
    Entegrasyon sağlığı (+ Bugün sırada)                         → IntegrationService/getIntegrationHealth (admin; 403 → kart gizli)
    Katalog ve kanal aktarımı                                     → ProductService/getProductStatistics (member)
    Son işlemler                                                  → IntegrationService/getExportJobs (member)
  Kart başlığındaki ok ve satır bağlantıları yalnızca kullanıcının menüsünde olan ekranlar için görünür.

  "İŞLETME PERFORMANSI" mikro etiketi e2e kabuk-hazır çapasıdır (e2e/fixtures/nav.ts `waitForShellReady`).
-->
<template>
  <div class="dashboard">
    <div class="dash-scroll">
      <div class="dash-page">
        <EkPageHeader
          title="Genel bakış"
          :meta="headerDescription"
          description="İşletmenizin sipariş, ciro, stok ve entegrasyon durumunun özeti. Kartlardaki oklarla ilgili listeye geçersiniz."
          :tips="['Kartlardaki sayılar son yüklemeye aittir; Yenile ile tüm kartlar yeniden okunur.', 'Bekleyen aksiyonlar kartı, işlem bekleyen kayıtların listesini doğrudan açar.']"
          refreshable
          :refreshing="anyLoading"
          :last-updated="insights.loadedAt.value"
          @refresh="refreshAll"
        />

        <!-- FR3-16: aksiyon önce — "ilk ne yapmalıyım" en üstte; sonra bugünün performansı, durum ve katalog bölümleri. -->
        <DashboardNextActions
          :insights="insights.data.value"
          :stock="stock.data.value"
          :health="health.data.value"
          :loading="insights.state.value === 'loading'"
          :error="insights.state.value === 'error'"
          @retry="refreshAll"
        />

        <section class="dash-section" aria-labelledby="dash-performance">
          <h2 id="dash-performance" class="dash-section__label">İŞLETME PERFORMANSI</h2>
          <EkErrorState
            v-if="insights.state.value === 'error'"
            size="inline"
            class="dash-kpi-error"
            message="Sipariş göstergeleri yüklenemedi — bağlantınızı kontrol edip tekrar deneyin."
            @retry="insights.load"
          />
          <DashboardKpiRow v-else :data="insights.data.value" :loading="insights.state.value === 'loading'" />
        </section>

        <section class="dash-section" aria-labelledby="dash-status">
          <h2 id="dash-status" class="dash-section__label">SİPARİŞ VE KANAL DURUMU</h2>
          <div class="dash-grid">
            <OrderTrendCard class="dash-o-trend" v-bind="view(insights)" @retry="insights.load" />
            <div class="dash-col">
              <OrderStatusCard class="dash-o-status" v-bind="view(insights)" @retry="insights.load" />
              <IntegrationHealthCard v-if="healthVisible" class="dash-o-health" v-bind="view(health)" @retry="health.load" />
            </div>
          </div>
        </section>

        <section class="dash-section" aria-labelledby="dash-catalog">
          <h2 id="dash-catalog" class="dash-section__label">STOK VE KATALOG</h2>
          <div class="dash-grid">
            <div class="dash-col">
              <StockAttentionCard v-if="visible(stock)" class="dash-o-stock" v-bind="view(stock)" @retry="stock.load" />
              <RecentJobsCard v-if="visible(jobs)" class="dash-o-jobs" v-bind="view(jobs)" @retry="jobs.load" />
            </div>
            <CatalogSummaryCard class="dash-o-catalog" v-bind="view(catalog)" @retry="catalog.load" />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted } from 'vue'
import EkPageHeader from '@/components/page/EkPageHeader.vue'
import { EkErrorState } from '@entegrasyonik/ui/components'
import useUser from '@/composables/user'
import { formatDateTime } from '@entegrasyonik/ui/format'
import DashboardKpiRow from '@/components/dashboard/DashboardKpiRow.vue'
import OrderTrendCard from '@/components/dashboard/OrderTrendCard.vue'
import OrderStatusCard from '@/components/dashboard/OrderStatusCard.vue'
import DashboardNextActions from '@/components/dashboard/DashboardNextActions.vue'
import StockAttentionCard from '@/components/dashboard/StockAttentionCard.vue'
import IntegrationHealthCard from '@/components/dashboard/IntegrationHealthCard.vue'
import CatalogSummaryCard, { type ProductStatistics } from '@/components/dashboard/CatalogSummaryCard.vue'
import RecentJobsCard from '@/components/dashboard/RecentJobsCard.vue'
import { useDashboardResource, type DashboardResource } from '@/components/dashboard/useDashboardResource'
import {
  isExportJobPage,
  isIntegrationHealth,
  isOrderInsights,
  isStockOverview,
  type ExportJobPage,
  type IntegrationHealth,
  type OrderInsights,
  type StockOverview,
} from '@/components/dashboard/dashboardTypes'

const userApi = useUser()

const isPlainObject = (res: any) => Boolean(res && typeof res === 'object' && !Array.isArray(res))

const insights = useDashboardResource<OrderInsights>('OrderService/getOrderDashboardInsights', () => ({}), isOrderInsights)
const stock = useDashboardResource<StockOverview>('StockService/getStockOverview', () => ({ limit: 5 }), isStockOverview)
const health = useDashboardResource<IntegrationHealth>('IntegrationService/getIntegrationHealth', () => ({}), isIntegrationHealth)
const catalog = useDashboardResource<ProductStatistics>('ProductService/getProductStatistics', () => ({}), isPlainObject)
const jobs = useDashboardResource<ExportJobPage>('IntegrationService/getExportJobs', () => ({ page: 1, limit: 5 }), isExportJobPage)

const resources = [insights, stock, health, catalog, jobs]

const view = <T,>(r: DashboardResource<T>) => ({
  data: r.data.value,
  loading: r.state.value === 'loading',
  error: r.state.value === 'error',
})

// 403 → kullanıcının kademesi yetmiyor: kart hiç gösterilmez.
const visible = <T,>(r: DashboardResource<T>) => r.state.value !== 'forbidden'

// Entegrasyon sağlığı admin kademesidir. Kademesi bilinen (sahip / platform yöneticisi) kullanıcıda
// iskelet hemen gösterilir; diğerlerinde kart yalnızca yanıt geldikten sonra görünür (üye → 403 → hiç).
const likelyAdmin = computed(() => Boolean(userApi.isOwner?.() || userApi.isPlatformAdmin?.()))
const healthVisible = computed(() => {
  const s = health.state.value
  if (s === 'forbidden') return false
  if (s === 'loading') return likelyAdmin.value
  return true
})

const headerDescription = computed(() => {
  const store = userApi.getStoreName?.()
  const at = insights.loadedAt.value
  const parts = [store || 'Mağazanızın özeti']
  if (at) parts.push(`Son güncelleme ${formatDateTime(at)}`)
  return parts.join(' · ')
})

const anyLoading = computed(() => resources.some((r) => r.state.value === 'loading'))

const refreshAll = () => {
  resources.forEach((r) => r.load())
}

onMounted(refreshAll)
</script>

<style scoped>
.dashboard {
  height: 100%;
}

.dash-scroll {
  position: absolute;
  inset: 0;
  overflow-y: auto;
  background: var(--ek-color-app-bg);
}

.dash-page {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  max-width: 1600px;
  margin: 0 auto;
  padding: var(--ek-space-6);
}

.dash-section {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin-top: var(--ek-space-2);
}

.dash-section__label {
  margin: 0;
  color: var(--ek-color-sidebar-section);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
}

.dash-kpi-error {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.dash-grid {
  display: grid;
  grid-template-columns: minmax(0, 8fr) minmax(0, 4fr);
  align-items: start;
  gap: var(--ek-space-5);
}

.dash-col {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  min-width: 0;
}

/* Tek kolon (tablet/mobil): kolon kapları kaybolur, kartlar bölüm içi sırayla dizilir. */
@media (max-width: 1099px) {
  .dash-grid {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }

  .dash-col {
    display: contents;
  }

}

@media (max-width: 599px) {
  .dash-page {
    gap: var(--ek-space-4);
    padding: var(--ek-space-4);
  }

  .dash-grid {
    gap: var(--ek-space-4);
  }
}
</style>
