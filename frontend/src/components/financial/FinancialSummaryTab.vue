<!--
  frontend/src/components/financial/FinancialSummaryTab.vue

  Finans › Özet (FE-LOCAL-1051: sayfa adı satırındaki Liste | Özet anahtarıyla LİSTELERİN YERİNE açılan bölüm panosu).
    filtre (kanal + tarih; kapalı başlar, çipler başlıkta)
    1) Dönem toplamı ........ Toplam alacak · Toplam borç · Net hakediş · İşlem sayısı (ListSummaryStrip)
    2) Hakediş akışı ........ Brüt alacak − Kesintiler = Net hakediş + kesinti oranı çubuğu (FinancialSummaryBar)
    3) Kanal kırılımı ....... her bağlı kanal için aynı dönemin sunucu toplamı (EkDataGrid)
       İşlem türleri ........ tür başına kayıt sayısı; satıra tıklayınca İşlemler listesi o türe süzülü açılır
  Veri: `FinancialService/getFinancialSummary` — dönem toplamı TEK istek; kırılım her bağlı kanal için aynı uca
  `integrationCodes:[kanal]` ile ayrı istek (sunucu toplamı; istemcide toplama/çıkarma YOK). Tür sayıları
  `FinancialService/getTransactionData` ucundan, her tür için `limit: 1` ile backend toplamı okunarak (bkz. `useStatusCounts`).
  Yalnız backend'in döndürdüğü alanlar gösterilir. Kayıt yoksa (transactionCount = 0) "0,00 ₺" DEĞİL boş durum;
  kanal satırında "Kayıt yok" + "—".
-->
<template>
  <div class="ek-fin-dash ek-fin-summary-tab">
    <EkFilterPanel
      class="ek-fin-dash__filter"
      :collapsed="collapsed"
      :active-count="chips.length"
      :columns="3"
      :loading="loading"
      :chips="chips"
      @update:collapsed="(v: boolean) => (collapsed = v)"
      @submit="load"
      @reset="reset"
      @remove-chip="removeChip"
      @clear="reset"
    >
      <EkSelect kind="channel"
        v-model="form.integrationCodes"
        :items="channelOptionsFrom(channelOptions)"
        :label="t('finance.filters.channels')"
        multiple
        clearable
      />
      <EkDateRange v-model:start="form.startDate" v-model:end="form.endDate" :label="t('finance.filters.dateRange')" :start-label="t('finance.filters.startDate')" :end-label="t('finance.filters.endDate')" value-format="date" />
    </EkFilterPanel>

    <ListDashSection label="Dönem toplamı">
      <section class="ek-fin-kpis" :aria-label="t('finance.summary.kpiLabel')" :aria-busy="loading || undefined">
        <ListSummaryStrip v-if="loading" :cells="kpiCells" :label="t('finance.summary.kpiLabel')" loading />
        <div v-else-if="errorStatus !== undefined" class="ek-fin-kpis__state">
          <EkErrorState size="inline" :message="errorMessage(errorStatus, t('finance.summary.errorSubject'))" @retry="load" />
        </div>
        <div v-else-if="!summary || !summary.transactionCount" class="ek-fin-kpis__state">
          <EkEmptyState variant="no-results" :title="t('finance.summary.emptyTitle')" :message="t('finance.summary.emptyText')" />
        </div>
        <template v-else>
          <ListSummaryStrip :cells="kpiCells" :label="t('finance.summary.kpiLabel')" />
          <p class="ek-fin-kpis__note">
            <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
            <span>{{ t('finance.summary.note') }}</span>
          </p>
        </template>
      </section>
    </ListDashSection>

    <div class="ek-fin-dash__grid">
      <ListDashSection v-if="loading || summary?.transactionCount" label="Hakediş akışı">
        <FinancialSummaryBar :summary="summary ?? EMPTY_SUMMARY" :loading="loading" :compact="compact" :format-currency="formatMoney" hide-cargo />
      </ListDashSection>

      <ListDashSection label="İşlem türleri">
        <ListDistributionCard title="İşlem türleri" subtitle="Seçili dönem ve kanallardaki kayıt sayısı" icon="mdi-swap-horizontal" unit="işlem"
          :rows="typeRows" :loading="typeCounts.loading.value" clickable empty-text="Bu dönemde finansal kayıt yok."
          @select="(type) => emit('open-type', { type, integrationCodes: [...applied.integrationCodes], startDate: applied.startDate, endDate: applied.endDate })" />
      </ListDashSection>
    </div>

    <ListDashSection :label="t('finance.summary.breakdownTitle')">
        <div class="ek-fin-dash__card">
          <p class="ek-fin-dash__card-hint">{{ t('finance.summary.breakdownHint') }}</p>
          <div class="ek-fin-breakdown-scroll" tabindex="0" role="region" :aria-label="t('finance.summary.breakdownTitle')">
            <EkDataGrid
              :columns="columns"
              :rows="breakdown"
              :label="t('finance.summary.breakdownTitle')"
              row-key="code"
              label-key="title"
              :loading="loading"
              :skeleton-rows="3"
              :empty-title="t('finance.summary.breakdownEmptyTitle')"
              :empty-text="t('finance.summary.breakdownEmptyText')"
              empty-icon="mdi-store-off-outline"
            >
              <template #cell-channel="{ row }"><EkChannelDot :code="row.code" :name="row.title" /></template>
              <template #cell-state="{ row }">
                <EkStatusChip :tone="stateOf(row).tone" :label="stateOf(row).label" />
              </template>
              <template #cell-count="{ row }"><span class="ek-num">{{ row.summary?.transactionCount ? formatNumber(row.summary.transactionCount) : '—' }}</span></template>
              <template #cell-credit="{ row }"><span class="ek-num">{{ amountOf(row, 'totalCredit') }}</span></template>
              <template #cell-debt="{ row }"><span class="ek-num">{{ amountOf(row, 'totalDebt') }}</span></template>
              <template #cell-net="{ row }">
                <span class="ek-num ek-fin-breakdown-net" :class="{ 'is-negative': row.summary?.transactionCount && row.summary.netAmount < 0 }">{{ amountOf(row, 'netAmount') }}</span>
              </template>
            </EkDataGrid>
          </div>
        </div>
      </ListDashSection>
  </div>
</template>

<script setup lang="ts">
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import ListDistributionCard, { type ListDistributionRow } from '@/components/page/ListDistributionCard.vue'
import { totalOf, useStatusCounts } from '@/components/page/useStatusCounts'
import { EkSelect, EkFilterPanel, EkDateRange, EkEmptyState, EkErrorState, EkDataGrid, type EkGridColumn, EkChannelDot, EkStatusChip, type EkTone } from '@entegrasyonik/ui/components'
import type { EkActiveFilterChip } from '@entegrasyonik/ui/components'
import { channelOptionsFrom } from '@entegrasyonik/ui/components/selectOptions'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import useRestApi from '@/composables/restapi'
import { useIntegrationStore } from '@/stores/integrationStore'
import { formatDate, formatMoney, formatNumber } from '@entegrasyonik/ui/format'
import { useFinanceApi, type FinancialSummary } from '@/composables/useFinanceApi'
import type { StatusTone } from '@/design/status-map'
import FinancialSummaryBar from './FinancialSummaryBar.vue'
import { channelName, errorMessage } from './financeSupport'

interface BreakdownRow {
  code: string
  title: string
  summary: FinancialSummary | null
  failed: boolean
}

export interface FinanceTypeSelection {
  type: string
  integrationCodes: string[]
  startDate: Date | null
  endDate: Date | null
}

const emit = defineEmits<{ 'open-type': [selection: FinanceTypeSelection] }>()

const { t } = useI18n()
const { smAndDown: compact } = useDisplay()
const api = useFinanceApi()
const restApi = useRestApi()
const integrationStore = useIntegrationStore()

const EMPTY_SUMMARY: FinancialSummary = { totalCredit: 0, totalDebt: 0, totalCargo: 0, netAmount: 0, transactionCount: 0 }

const form = reactive({ integrationCodes: [] as string[], startDate: null as Date | null, endDate: null as Date | null })
const applied = ref({ integrationCodes: [] as string[], startDate: null as Date | null, endDate: null as Date | null })
const collapsed = ref(true) // FE-LOCAL-1047: filtreler kapalı başlar

const loading = ref(false)
const summary = ref<FinancialSummary | null>(null)
// FE-LOCAL-1046: dönem toplamı hücreleri (yalnız backend alanları; biçimlendirme burada).
const kpiCells = computed<ListSummaryCell[]>(() => {
  const v = summary.value
  const net = v?.netAmount ?? 0
  return [
    { key: 'credit', label: t('finance.summary.totalCredit'), hint: t('finance.summary.totalCreditHint'), icon: 'mdi-arrow-down-bold-circle-outline', tone: 'success', value: formatMoney(v?.totalCredit ?? 0), zero: !v?.totalCredit },
    { key: 'debt', label: t('finance.summary.totalDebt'), hint: t('finance.summary.totalDebtHint'), icon: 'mdi-arrow-up-bold-circle-outline', tone: 'error', value: formatMoney(v?.totalDebt ?? 0), zero: !v?.totalDebt },
    { key: 'net', label: t('finance.summary.netAmount'), hint: t('finance.summary.netAmountHint'), icon: 'mdi-scale-balance', tone: net < 0 ? 'warning' : 'action', value: formatMoney(net), zero: !net },
    { key: 'count', label: t('finance.summary.transactionCount'), hint: t('finance.summary.transactionCountHint'), icon: 'mdi-swap-horizontal', tone: 'info', value: formatNumber(v?.transactionCount ?? 0), zero: !v?.transactionCount },
  ]
})
const errorStatus = ref<number | null | undefined>(undefined)
const breakdown = ref<BreakdownRow[]>([])

// FE-LOCAL-1051: işlem türü dağılımı — liste ucundan, tür başına `limit: 1` ile backend toplamı (aynı dönem + kanal süzmesi).
const TYPES: Array<{ key: string; label: string; tone: EkTone }> = [
  { key: 'SALE', label: 'Satış', tone: 'success' },
  { key: 'RETURN', label: 'İade', tone: 'warning' },
  { key: 'PAYOUT', label: 'Ödeme', tone: 'info' },
  { key: 'COMMISSION', label: 'Komisyon', tone: 'action' },
  { key: 'DEDUCTION', label: 'Kesinti', tone: 'error' },
  { key: 'CARGO', label: 'Kargo', tone: 'neutral' },
]
const typeCounts = useStatusCounts(TYPES.map((x) => x.key), async (type) => {
  const { integrationCodes, startDate, endDate } = applied.value
  return totalOf(
    await restApi.post('FinancialService/getTransactionData', {
      externalIdSearch: '', integrationCodes, startDate, endDate, transactionTypes: [type], page: 1, limit: 1, sortBy: [],
    }),
  )
})
const typeRows = computed<ListDistributionRow[]>(() => TYPES.map((x) => ({ key: x.key, label: x.label, tone: x.tone, count: typeCounts.counts.value[x.key] ?? 0 })))

const channelOptions = computed<Array<{ code: string; title: string }>>(() => {
  try {
    return (integrationStore.getClientPlatforms() || []).filter(Boolean).map((p: any) => ({ code: p.code, title: p.title || channelName(p.code) }))
  } catch {
    return []
  }
})

const chips = computed<EkActiveFilterChip[]>(() => {
  const a = applied.value
  const out: EkActiveFilterChip[] = []
  if (a.integrationCodes.length) out.push({ key: 'integrationCodes', label: t('finance.filters.channels'), value: a.integrationCodes.map(channelName).join(', ') })
  if (a.startDate) out.push({ key: 'startDate', label: t('finance.filters.startDate'), value: formatDate(a.startDate) })
  if (a.endDate) out.push({ key: 'endDate', label: t('finance.filters.endDate'), value: formatDate(a.endDate) })
  return out
})

const columns = computed<EkGridColumn[]>(() => [
  { key: 'channel', label: t('finance.summary.colChannel') },
  { key: 'state', label: t('finance.summary.colState') },
  { key: 'count', label: t('finance.summary.colCount'), align: 'end' },
  { key: 'credit', label: t('finance.summary.colCredit'), align: 'end' },
  { key: 'debt', label: t('finance.summary.colDebt'), align: 'end' },
  { key: 'net', label: t('finance.summary.colNet'), align: 'end' },
])

function stateOf(row: Record<string, any>): { tone: StatusTone; label: string } {
  if (row.failed) return { tone: 'danger', label: t('finance.summary.stateError') }
  if (!row.summary?.transactionCount) return { tone: 'neutral', label: t('finance.summary.stateEmpty') }
  return { tone: 'success', label: t('finance.summary.stateOk') }
}

/** Kayıt yoksa "—" (0,00 ₺ gösterilmez). */
function amountOf(row: Record<string, any>, key: 'totalCredit' | 'totalDebt' | 'netAmount'): string {
  if (!row.summary?.transactionCount) return '—'
  return formatMoney(row.summary[key])
}

let requestSeq = 0
async function load() {
  const seq = ++requestSeq
  applied.value = { integrationCodes: [...form.integrationCodes], startDate: form.startDate, endDate: form.endDate }
  const { integrationCodes, startDate, endDate } = applied.value
  const channels = integrationCodes.length
    ? integrationCodes.map((code) => channelOptions.value.find((c) => c.code === code) ?? { code, title: channelName(code) })
    : channelOptions.value

  loading.value = true
  errorStatus.value = undefined
  typeCounts.load()
  const [total, ...perChannel] = await Promise.all([
    api.getSummary({ integrationCodes, startDate, endDate }),
    ...channels.map((c) => api.getSummary({ integrationCodes: [c.code], startDate, endDate })),
  ])
  if (seq !== requestSeq) return
  loading.value = false
  if (total.ok) summary.value = total.data
  else {
    summary.value = null
    errorStatus.value = total.status
  }
  breakdown.value = channels.map((c, i) => {
    const r = perChannel[i]
    return { code: c.code, title: c.title, summary: r.ok ? r.data : null, failed: !r.ok }
  })
}

function reset() {
  form.integrationCodes = []
  form.startDate = null
  form.endDate = null
  load()
}

function removeChip(key: string) {
  if (key === 'integrationCodes') form.integrationCodes = []
  if (key === 'startDate') form.startDate = null
  if (key === 'endDate') form.endDate = null
  load()
}

onMounted(load)
defineExpose({ load, loading })
</script>

<style scoped>
/* Bölüm panosu: sayfa akışında kayar; bölümler kart dışı mikro başlıkla ayrılır (ana sayfa diliyle aynı). */
.ek-fin-dash {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-6);
  padding-bottom: var(--ek-space-6);
}

.ek-fin-dash__filter {
  margin-bottom: calc(-1 * var(--ek-space-3));
}

.ek-fin-dash__grid {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--ek-space-6);
  align-items: start;
}

.ek-fin-dash__card {
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-fin-dash__card-hint {
  margin: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-fin-breakdown-scroll {
  overflow-x: auto;
}

/* Kaydırma sarmalayıcıda (odaklanabilir bölge); ızgara kendi içinde kaydırmaz. */
.ek-fin-breakdown-scroll :deep(.ek-grid) {
  overflow: visible;
}

.ek-fin-breakdown-scroll:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-fin-kpis {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.ek-fin-kpis__state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 132px;
  background: var(--ek-color-surface);
  border: 1px dashed var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
}

.ek-fin-kpis__note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-fin-breakdown-net {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-fin-breakdown-net.is-negative {
  color: var(--ek-color-danger);
}

@media (max-width: 1023px) {
  .ek-fin-dash__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
