<!--
  frontend/src/components/productDefinitions/ProductListDashboard.vue

  FE-LOCAL-1043 — Ürünler sayfasının "Özet" görünümü (Liste | Özet anahtarıyla listenin yerine açılır).
    1) Katalog — ürün / varyant / toplam stok / kullanılabilir / rezerve
    2) Stok sağlığı — stoğu aşan rezerv / yayın bekleyen / aşırı satış / eşleşmemiş kalem
    3) Kanal aktarımı (kanal bazında aktarım tablosu; sayılar ürün listesini o süzmeyle açar) + son işlemler
    4) Stok ve eşleşme uyarıları
  Veri: `ProductService/getProductStatistics`, `StockService/getStockOverview`, `IntegrationService/getExportJobs`
  (ana sayfadaki kartlarla aynı kaynaklar — uydurma sayı yok). Yetki yoksa (403) ilgili bölüm çizilmez.
-->
<template>
  <div class="pld">
    <ListDashSection label="Katalog">
      <ListSummaryStrip :cells="catalogCells" :loading="catalog.state.value === 'loading'" label="Katalog" />
    </ListDashSection>

    <ListDashSection v-if="stock.state.value !== 'forbidden'" label="Stok sağlığı">
      <ListSummaryStrip :cells="stockCells" :loading="stock.state.value === 'loading'" label="Stok sağlığı" />
    </ListDashSection>

    <ListDashSection label="Kanal aktarımı ve son işlemler">
      <div class="pld__row">
        <CatalogSummaryCard :data="catalog.data.value" :loading="catalog.state.value === 'loading'" :error="catalog.state.value === 'error'" @retry="catalog.load" />
        <RecentJobsCard v-if="jobs.state.value !== 'forbidden'" :data="jobs.data.value" :loading="jobs.state.value === 'loading'" :error="jobs.state.value === 'error'" @retry="jobs.load" />
      </div>
    </ListDashSection>

    <ListDashSection v-if="stock.state.value !== 'forbidden'" label="Stok ve eşleşme">
      <StockAttentionCard :data="stock.data.value" :loading="stock.state.value === 'loading'" :error="stock.state.value === 'error'" @retry="stock.load" />
    </ListDashSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { formatNumber } from '@entegrasyonik/ui/format'
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import CatalogSummaryCard, { type ProductStatistics } from '@/components/dashboard/CatalogSummaryCard.vue'
import RecentJobsCard from '@/components/dashboard/RecentJobsCard.vue'
import StockAttentionCard from '@/components/dashboard/StockAttentionCard.vue'
import { useDashboardResource } from '@/components/dashboard/useDashboardResource'
import { isExportJobPage, isStockOverview, type ExportJobPage, type StockOverview } from '@/components/dashboard/dashboardTypes'

const isPlainObject = (res: any) => Boolean(res && typeof res === 'object' && !Array.isArray(res) && !res.isAxiosError && !res.response)
const catalog = useDashboardResource<ProductStatistics>('ProductService/getProductStatistics', () => ({}), isPlainObject)
const stock = useDashboardResource<StockOverview>('StockService/getStockOverview', () => ({ limit: 5 }), isStockOverview)
const jobs = useDashboardResource<ExportJobPage>('IntegrationService/getExportJobs', () => ({ page: 1, limit: 5 }), isExportJobPage)
const fmt = (v: number | undefined) => formatNumber(v ?? 0)

const catalogCells = computed<ListSummaryCell[]>(() => {
  const d = catalog.data.value
  const t = d?.variantPlatformTransferStatistics
  const v = stock.data.value?.variants
  return [
    { key: 'products', label: 'Ürün', hint: 'Katalogdaki ürünler', icon: 'mdi-package-variant-closed', tone: 'action', value: fmt(d?.totalProducts), zero: !d?.totalProducts },
    { key: 'variants', label: 'Varyant', hint: 'Satılabilir seçenekler', icon: 'mdi-shape-outline', tone: 'info', value: fmt(t?.totalVariants), zero: !t?.totalVariants },
    { key: 'stock', label: 'Toplam stok', hint: 'Tüm varyantlarda', icon: 'mdi-warehouse', tone: 'success', value: fmt(t?.totalStock), zero: !t?.totalStock },
    { key: 'available', label: 'Kullanılabilir', hint: 'Satışa açık adet', icon: 'mdi-package-variant-closed-check', tone: 'success', value: fmt(v?.availableUnits), zero: !v?.availableUnits },
    { key: 'reserved', label: 'Rezerve', hint: 'Siparişe ayrılmış adet', icon: 'mdi-lock-clock', tone: 'info', value: fmt(v?.reservedUnits), zero: !v?.reservedUnits },
  ]
})

const stockCells = computed<ListSummaryCell[]>(() => {
  const s = stock.data.value
  const over = s?.variants.overReserved ?? 0
  const pending = s?.variants.publishPending ?? 0
  const oversold = s?.attention.oversold.lines ?? 0
  const unmapped = s?.attention.unmapped.lines ?? 0
  return [
    { key: 'over', label: 'Stoğu aşan rezerv', hint: 'Varyant', icon: 'mdi-alert-outline', tone: over > 0 ? 'warning' : 'neutral', value: fmt(over), zero: over === 0 },
    { key: 'publish', label: 'Yayın bekleyen', hint: 'Kanallara iletilecek varyant', icon: 'mdi-upload-outline', tone: pending > 0 ? 'action' : 'neutral', value: fmt(pending), zero: pending === 0 },
    { key: 'oversold', label: 'Aşırı satış', hint: 'Açık sipariş kalemi', icon: 'mdi-alert-octagon-outline', tone: oversold > 0 ? 'error' : 'neutral', value: fmt(oversold), zero: oversold === 0 },
    { key: 'unmapped', label: 'Eşleşmemiş kalem', hint: 'Ürünle eşleşmeyen', icon: 'mdi-link-variant-off', tone: unmapped > 0 ? 'warning' : 'neutral', value: fmt(unmapped), zero: unmapped === 0 },
  ]
})

const refresh = () => {
  catalog.load()
  stock.load()
  jobs.load()
}
onMounted(refresh)
defineExpose({ refresh })
</script>

<style scoped>
.pld {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}

.pld__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
  align-items: stretch;
  gap: var(--ek-space-5);
}
</style>
