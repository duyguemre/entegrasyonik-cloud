<!--
  frontend/src/components/logListView/ImportLogDashboard.vue

  FE-LOCAL-1047 — İşlem kayıtları › Ürün çekim işlemleri "Özet" görünümü (Liste | Özet anahtarıyla listenin yerine açılır).
  Çekim işlemleri için durum süzmeli bir uç yok; özet SON 100 çekim işleminin kendi sayaçlarından hesaplanır
  (`IntegrationService/getImportJobs`, en yeni önce) — başlıkta açıkça "Son N işlem" yazar; tahmin / uydurma yok.
    1) İşlemler — toplam kayıt, süren, tamamlanan, hata alan
    2) Çekilen ürünler — toplam / aktarılan / aday / formatı hatalı / zaten mevcut / hata alan
    3) Durum dağılımı
-->
<template>
  <div class="imd">
    <ListDashSection :label="`Çekim işlemleri — son ${formatNumber(jobs.length)} işlem`">
      <ListSummaryStrip :cells="jobCells" :loading="loading" label="Çekim işlemleri" />
    </ListDashSection>
    <ListDashSection label="Çekilen ürünler">
      <ListSummaryStrip :cells="productCells" :loading="loading" label="Çekilen ürünler" />
    </ListDashSection>
    <ListDashSection label="Dağılım">
      <ListDistributionCard title="İşlem durumları" :subtitle="`Son ${formatNumber(jobs.length)} çekim işlemi`" icon="mdi-download-outline" unit="işlem"
        :rows="distribution" :loading="loading" empty-text="Henüz çekim işlemi yok." />
    </ListDashSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { EkTone } from '@entegrasyonik/ui/components'
import { formatNumber } from '@entegrasyonik/ui/format'
import { isRequestError } from '@entegrasyonik/ui/components/listStandard'
import useRestApi from '@/composables/restapi'
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import ListDistributionCard, { type ListDistributionRow } from '@/components/page/ListDistributionCard.vue'

const SAMPLE = 100
const restApi = useRestApi()
const jobs = ref<any[]>([])
const total = ref<number | null>(null)
const loading = ref(true)

const STATUS: Array<{ key: string; label: string; tone: EkTone }> = [
  { key: 'WAITING_FOR_FETCH', label: 'Sırada', tone: 'neutral' },
  { key: 'FETCHING', label: 'Ürünler çekiliyor', tone: 'warning' },
  { key: 'READY_TO_SYNC', label: 'Analiz ediliyor', tone: 'info' },
  { key: 'PROCESSING', label: 'Ürünler aktarılıyor', tone: 'action' },
  { key: 'COMPLETED', label: 'Tamamlandı', tone: 'success' },
  { key: 'FAILED', label: 'Hata', tone: 'error' },
  { key: 'CANCELLED', label: 'İptal edildi', tone: 'neutral' },
]
const RUNNING = new Set(['WAITING_FOR_FETCH', 'FETCHING', 'READY_TO_SYNC', 'PROCESSING'])

const statusOf = (j: any) => String(j?.status ?? '').toUpperCase()
const countBy = (pred: (j: any) => boolean) => jobs.value.filter(pred).length
const sum = (field: string) => jobs.value.reduce((a, j) => a + (Number(j?.[field]) || 0), 0)
const cell = (key: string, label: string, n: number | null, icon: string, tone: EkTone, hint?: string): ListSummaryCell => ({
  key, label, hint, icon, tone, value: n === null ? '—' : formatNumber(n), zero: !n,
})

const jobCells = computed<ListSummaryCell[]>(() => [
  cell('total', 'Toplam işlem', total.value, 'mdi-download-outline', 'action', 'Tüm kayıtlar'),
  cell('running', 'Süren', countBy((j) => RUNNING.has(statusOf(j))), 'mdi-progress-clock', 'info', 'Çekim veya aktarım sürüyor'),
  cell('done', 'Tamamlanan', countBy((j) => statusOf(j) === 'COMPLETED'), 'mdi-check-circle-outline', 'success'),
  cell('failed', 'Hata alan', countBy((j) => statusOf(j) === 'FAILED'), 'mdi-alert-circle-outline', 'error'),
])

const productCells = computed<ListSummaryCell[]>(() => [
  cell('totalCount', 'Çekilen ürün', sum('totalCount'), 'mdi-package-variant-closed', 'action'),
  cell('processedCount', 'Aktarılan', sum('processedCount'), 'mdi-check-all', 'success'),
  cell('validCount', 'Aktarılmaya aday', sum('validCount'), 'mdi-check-circle-outline', 'info'),
  cell('invalidCount', 'Formatı hatalı', sum('invalidCount'), 'mdi-alert-outline', 'warning'),
  cell('duplicateCount', 'Zaten mevcut', sum('duplicateCount'), 'mdi-content-copy', 'neutral'),
  cell('failedCount', 'Hata alan', sum('failedCount'), 'mdi-close-circle-outline', 'error'),
])

const distribution = computed<ListDistributionRow[]>(() =>
  STATUS.map((s) => ({ key: s.key, label: s.label, tone: s.tone, count: countBy((j) => statusOf(j) === s.key) })),
)

const refresh = async () => {
  loading.value = true
  try {
    const res = await restApi.post('IntegrationService/getImportJobs', { page: 1, limit: SAMPLE, sortBy: 'startedAt', sortOrder: 'desc' })
    if (!isRequestError(res) && res?.success) {
      jobs.value = Array.isArray(res.data) ? res.data : []
      total.value = res.pagination?.totalNumberOfRecords ?? jobs.value.length
    } else {
      jobs.value = []
      total.value = null
    }
  } finally {
    loading.value = false
  }
}
onMounted(refresh)
defineExpose({ refresh })
</script>

<style scoped>
.imd {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
}
</style>
