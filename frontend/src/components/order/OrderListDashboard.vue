<!--
  frontend/src/components/order/OrderListDashboard.vue

  FE-LOCAL-1043 — Siparişler sayfasının "Özet" görünümü: sayfa adı satırındaki Liste | Özet anahtarıyla LİSTENİN
  YERİNE açılan bölüm panosu (ana sayfayla aynı tasarım dili, aynı kartlar).
    1) Duruma göre siparişler — beş hücre; TIKLAYINCA listeye dönülür ve liste o duruma süzülür
    2) Performans — bugünkü sipariş/ciro (düne göre), son 7 gün, açık sipariş
    3) Genel toplamlar — toplam sipariş, toplam ciro, ortalama sepet, toplam iade, iade tutarı
    4) Son 7 gün grafiği + durum dağılımı
    5) Bekleyen işler — kargo / fatura / iade / müşteri sorusu
    6) Stok ve eşleşme uyarıları (dikkat gerektiren siparişler)
  Veri: `OrderService/getOrderDashboardInsights` + `StockService/getStockOverview` (yalnız backend sayıları; türetilen
  tek şey toplam ve oranlar: ortalama sepet = ciro / sipariş). Yetki yoksa (403) ilgili bölüm çizilmez.
-->
<template>
  <div class="old">
    <ListDashSection label="Duruma göre siparişler">
      <ListSummaryStrip :cells="statusCells" :loading="loading" label="Duruma göre siparişler" @select="onStatus" />
    </ListDashSection>

    <ListDashSection label="Performans">
      <EkErrorState v-if="insights.state.value === 'error'" size="inline" class="old__error"
        message="Sipariş göstergeleri yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="insights.load" />
      <DashboardKpiRow v-else :data="insights.data.value" :loading="loading" />
    </ListDashSection>

    <ListDashSection label="Genel toplamlar">
      <ListSummaryStrip :cells="totalCells" :loading="loading" label="Genel toplamlar" />
    </ListDashSection>

    <ListDashSection label="Sipariş akışı">
      <div class="old__row">
        <OrderTrendCard v-bind="view" @retry="insights.load" />
        <OrderStatusCard v-bind="view" @retry="insights.load" />
      </div>
    </ListDashSection>

    <ListDashSection label="Bekleyen işler">
      <ListSummaryStrip :cells="pendingCells" :loading="loading" label="Bekleyen işler" @select="onPending" />
    </ListDashSection>

    <ListDashSection v-if="stock.state.value !== 'forbidden'" label="Stok ve eşleşme">
      <StockAttentionCard :data="stock.data.value" :loading="stock.state.value === 'loading'" :error="stock.state.value === 'error'" @retry="stock.load" />
    </ListDashSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { EkErrorState, type EkTone } from '@entegrasyonik/ui/components'
import { formatMoney, formatNumber } from '@entegrasyonik/ui/format'
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import DashboardKpiRow from '@/components/dashboard/DashboardKpiRow.vue'
import OrderTrendCard from '@/components/dashboard/OrderTrendCard.vue'
import OrderStatusCard from '@/components/dashboard/OrderStatusCard.vue'
import StockAttentionCard from '@/components/dashboard/StockAttentionCard.vue'
import { useDashboardResource } from '@/components/dashboard/useDashboardResource'
import { isOrderInsights, isStockOverview, type OrderInsights, type StockOverview } from '@/components/dashboard/dashboardTypes'

const props = defineProps<{
  /** Listede uygulanmış durum filtresi (etkin hücreyi belirler). */
  active: string[]
}>()
const emit = defineEmits<{ select: [statuses: string[]] }>()

const insights = useDashboardResource<OrderInsights>('OrderService/getOrderDashboardInsights', () => ({}), isOrderInsights)
const stock = useDashboardResource<StockOverview>('StockService/getStockOverview', () => ({ limit: 5 }), isStockOverview)
const loading = computed(() => insights.state.value === 'loading')
const view = computed(() => ({ data: insights.data.value, loading: loading.value, error: insights.state.value === 'error' }))
const fmt = (v: number) => formatNumber(v ?? 0)

const STATUS: Array<{ key: string; label: string; hint: string; icon: string; tone: EkTone; statuses: string[] }> = [
  { key: 'waiting', label: 'Onay bekleyen', hint: 'Kanal ve satıcı onayı', icon: 'mdi-clock-outline', tone: 'warning', statuses: ['UNAPPROVED', 'PRE_APPROVAL', 'AWAITING_APPROVAL'] },
  { key: 'approved', label: 'Kargoya hazır', hint: 'Kargolanmayı bekliyor', icon: 'mdi-package-variant-closed', tone: 'info', statuses: ['APPROVED'] },
  { key: 'shipped', label: 'Kargoda', hint: 'Teslimat yolunda', icon: 'mdi-truck-fast-outline', tone: 'action', statuses: ['SHIPPED'] },
  { key: 'delivered', label: 'Teslim edildi', hint: 'Tamamlanan siparişler', icon: 'mdi-check-circle-outline', tone: 'success', statuses: ['DELIVERED'] },
  { key: 'closed', label: 'İptal / iade', hint: 'İptal ve iade edilenler', icon: 'mdi-undo-variant', tone: 'error', statuses: ['CANCELLED', 'RETURNED', 'SPLIT'] },
]

const count = (statuses: string[]) => statuses.reduce((a, s) => a + (insights.data.value?.statusDistribution?.[s] ?? 0), 0)
const isActive = (statuses: string[]) => props.active.length === statuses.length && statuses.every((s) => props.active.includes(s))

const statusCells = computed<ListSummaryCell[]>(() =>
  STATUS.map((d) => {
    const n = count(d.statuses)
    return { key: d.key, label: d.label, hint: d.hint, icon: d.icon, tone: d.tone, value: fmt(n), zero: n === 0, clickable: true, active: isActive(d.statuses) }
  }),
)

const totalCells = computed<ListSummaryCell[]>(() => {
  const t = insights.data.value?.totals
  const orders = t?.orderCount ?? 0
  const revenue = t?.revenue ?? 0
  return [
    { key: 'orders', label: 'Toplam sipariş', hint: 'Tüm zamanlar', icon: 'mdi-cart-outline', tone: 'action', value: fmt(orders), zero: orders === 0 },
    { key: 'revenue', label: 'Toplam ciro', hint: 'Tüm siparişlerin tutarı', icon: 'mdi-cash-multiple', tone: 'success', value: formatMoney(revenue), zero: revenue === 0 },
    { key: 'basket', label: 'Ortalama sepet', hint: 'Ciro / sipariş', icon: 'mdi-basket-outline', tone: 'info', value: orders > 0 ? formatMoney(revenue / orders) : '—', zero: orders === 0 },
    { key: 'returns', label: 'Toplam iade', hint: 'İade edilen sipariş', icon: 'mdi-undo-variant', tone: 'warning', value: fmt(t?.returnCount ?? 0), zero: !t?.returnCount },
    { key: 'returnAmount', label: 'İade tutarı', hint: 'İade edilen toplam', icon: 'mdi-cash-refund', tone: 'error', value: formatMoney(t?.returnAmount ?? 0), zero: !t?.returnAmount },
  ]
})

/** Bekleyen işler: kargo ve fatura onaylı siparişlerdedir → tıklayınca liste "onaylandı" durumuna süzülür. */
const pendingCells = computed<ListSummaryCell[]>(() => {
  const p = insights.data.value?.pending
  return [
    { key: 'shipping', label: 'Kargo bekleyen', hint: 'Onaylı, kargolanmamış', icon: 'mdi-truck-fast-outline', tone: 'warning', value: fmt(p?.shippingCount ?? 0), zero: !p?.shippingCount, clickable: true },
    { key: 'invoice', label: 'Fatura bekleyen', hint: 'Faturası kesilmemiş', icon: 'mdi-receipt-text-outline', tone: 'info', value: fmt(p?.invoiceCount ?? 0), zero: !p?.invoiceCount, clickable: true },
    { key: 'claim', label: 'İade talebi', hint: 'İşlem bekleyen', icon: 'mdi-undo-variant', tone: 'error', value: fmt(p?.claimCount ?? 0), zero: !p?.claimCount },
    { key: 'message', label: 'Müşteri sorusu', hint: 'Yanıt bekleyen', icon: 'mdi-message-question-outline', tone: 'action', value: fmt(p?.messageCount ?? 0), zero: !p?.messageCount },
  ]
})

function onStatus(key: string) {
  const def = STATUS.find((d) => d.key === key)
  if (def) emit('select', isActive(def.statuses) ? [] : def.statuses)
}

function onPending(key: string) {
  if (key === 'shipping' || key === 'invoice') emit('select', ['APPROVED'])
}

const refresh = () => {
  insights.load()
  stock.load()
}
onMounted(refresh)
defineExpose({ refresh })
</script>

<style scoped>
.old {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}

/* Ana sayfadaki satır düzeni: grafik 2/3, durum dağılımı 1/3; aynı satırdaki kartlar eşit yükseklikte. */
.old__row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  align-items: stretch;
  gap: var(--ek-space-5);
}

.old__error {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

@media (max-width: 1099px) {
  .old__row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
