<!--
  frontend/src/components/invoice/InvoiceListDashboard.vue

  FE-LOCAL-1046 — Faturalar sayfasının "Özet" görünümü (Liste | Özet anahtarıyla listenin yerine açılır).
    1) Duruma göre faturalar — altı durum; TIKLAYINCA listeye dönülür ve liste o duruma süzülür
    2) Belge tipine göre — satış / iade / gider (tıklanabilir) + faturası kesilmemiş sipariş sayısı
    3) Durum dağılımı — toplam + oran çubuğu + yüzdeler
  Fatura için özel istatistik ucu yok: sayılar `InvoiceService/getInvoices` ucundan, her süzme için `limit: 1` ile
  istenip backend'in toplam kayıt sayısı okunarak alınır (bkz. `useStatusCounts`). Faturası kesilmemiş sipariş:
  `OrderService/getOrderDashboardInsights.pending.invoiceCount`. Sayı gelmezse hücre "—" gösterir.
-->
<template>
  <div class="ild">
    <ListDashSection label="Duruma göre faturalar">
      <ListSummaryStrip :cells="statusCells" :loading="statusCounts.loading.value" label="Duruma göre faturalar" @select="(k) => emit('select', { status: [k], type: null })" />
    </ListDashSection>

    <ListDashSection label="Belge tipine göre">
      <ListSummaryStrip :cells="typeCells" :loading="typeCounts.loading.value" label="Belge tipine göre" @select="(k) => emit('select', { status: [], type: k })" />
    </ListDashSection>

    <ListDashSection label="Dağılım">
      <ListDistributionCard title="Fatura durumları" subtitle="Tüm faturaların durum dağılımı" icon="mdi-receipt-text-outline" unit="fatura"
        :rows="distribution" :loading="statusCounts.loading.value" clickable empty-text="Henüz fatura yok."
        @select="(k) => emit('select', { status: [k], type: null })" />
    </ListDashSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import type { EkTone } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import useRestApi from '@/composables/restapi'
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import ListDistributionCard, { type ListDistributionRow } from '@/components/page/ListDistributionCard.vue'
import { totalOf, useStatusCounts } from '@/components/page/useStatusCounts'
import { useDashboardResource } from '@/components/dashboard/useDashboardResource'
import { isOrderInsights, type OrderInsights } from '@/components/dashboard/dashboardTypes'
import { InvoiceStatusEnum, INVOICE_STATUS_LABELS, InvoiceTypeEnum, INVOICE_TYPE_LABELS } from '@/types/InvoiceTypes'

const props = defineProps<{
  /** Listede uygulanmış süzme (etkin hücreler). */
  activeStatus: string[]
  activeType: string | null
}>()
const emit = defineEmits<{ select: [filter: { status: string[]; type: string | null }] }>()

const restApi = useRestApi()
const countFor = async (filters: Record<string, unknown>) =>
  totalOf(await restApi.post('InvoiceService/getInvoices', { pagination: { page: 1, limit: 1 }, search: '', filters: { status: [], type: null, ...filters } }))

const STATUSES = Object.values(InvoiceStatusEnum)
const TYPES = Object.values(InvoiceTypeEnum)
const statusCounts = useStatusCounts(STATUSES, (s) => countFor({ status: [s] }))
const typeCounts = useStatusCounts(TYPES, (t) => countFor({ type: t }))
const insights = useDashboardResource<OrderInsights>('OrderService/getOrderDashboardInsights', () => ({}), isOrderInsights)

const STATUS_STYLE: Record<InvoiceStatusEnum, { icon: string; tone: EkTone }> = {
  [InvoiceStatusEnum.DRAFT]: { icon: 'mdi-file-outline', tone: 'neutral' },
  [InvoiceStatusEnum.QUEUED]: { icon: 'mdi-tray-full', tone: 'action' },
  [InvoiceStatusEnum.PROCESSING]: { icon: 'mdi-progress-clock', tone: 'info' },
  [InvoiceStatusEnum.APPROVED]: { icon: 'mdi-check-circle-outline', tone: 'success' },
  [InvoiceStatusEnum.FAILED]: { icon: 'mdi-alert-circle-outline', tone: 'error' },
  [InvoiceStatusEnum.CANCELLED]: { icon: 'mdi-cancel', tone: 'warning' },
}
const TYPE_STYLE: Record<InvoiceTypeEnum, { icon: string; tone: EkTone }> = {
  [InvoiceTypeEnum.SALES]: { icon: 'mdi-receipt-text-outline', tone: 'action' },
  [InvoiceTypeEnum.RETURN]: { icon: 'mdi-undo-variant', tone: 'warning' },
  [InvoiceTypeEnum.EXPENSE]: { icon: 'mdi-truck-outline', tone: 'info' },
}

const show = (n: number | null) => (n === null ? '—' : formatNumber(n))

const statusCells = computed<ListSummaryCell[]>(() =>
  STATUSES.map((s) => {
    const n = statusCounts.counts.value[s]
    return {
      key: s, label: INVOICE_STATUS_LABELS[s], icon: STATUS_STYLE[s].icon, tone: STATUS_STYLE[s].tone, value: show(n), zero: !n,
      clickable: true, active: props.activeStatus.length === 1 && props.activeStatus[0] === s,
    }
  }),
)

const typeCells = computed<ListSummaryCell[]>(() => {
  const pending = insights.data.value?.pending.invoiceCount
  return [
    ...TYPES.map((t) => {
      const n = typeCounts.counts.value[t]
      return { key: t, label: INVOICE_TYPE_LABELS[t], icon: TYPE_STYLE[t].icon, tone: TYPE_STYLE[t].tone, value: show(n), zero: !n, clickable: true, active: props.activeType === t } as ListSummaryCell
    }),
    ...(insights.state.value === 'ready'
      ? [{ key: 'pending', label: 'Fatura bekleyen sipariş', hint: 'Onaylı, faturası kesilmemiş', icon: 'mdi-clock-outline', tone: 'warning' as EkTone, value: formatNumber(pending ?? 0), zero: !pending }]
      : []),
  ]
})

const distribution = computed<ListDistributionRow[]>(() =>
  STATUSES.map((s) => ({ key: s, label: INVOICE_STATUS_LABELS[s], count: statusCounts.counts.value[s] ?? 0, tone: STATUS_STYLE[s].tone })),
)

const refresh = () => {
  statusCounts.load()
  typeCounts.load()
  insights.load()
}
onMounted(refresh)
defineExpose({ refresh })
</script>

<style scoped>
.ild {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}
</style>
