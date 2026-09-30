<!--
  frontend/src/components/financial/FinancialSummaryTab.vue

  Finans › Özet. Liste standardı çerçevesi (EkListFrame): filtre paneli (kanal + tarih) → aktif filtre
  çipleri → EkKpiCard satırı (dönem toplamı) → kart: kanal kırılımı (EkDataGrid).
  Veri: `FinancialService/getFinancialSummary` — dönem toplamı TEK istek; kırılım her bağlı kanal için
  aynı uca `integrationCodes:[kanal]` ile ayrı istek (sunucu toplamı; istemcide toplama/çıkarma YOK).
  Yalnız backend'in döndürdüğü alanlar gösterilir (totalCredit, totalDebt, netAmount, transactionCount).
  `totalCargo` gösterilmez: backend `$cargoAmount` toplar ama FinancialTransactions şemasında bu alan yok.
  Kayıt yoksa (transactionCount = 0) KPI'lar "0,00 ₺" DEĞİL boş durum; kanal satırında "Kayıt yok" + "—".
-->
<template>
  <EkListFrame class="ek-fin-summary-tab" :label="t('finance.summary.breakdownTitle')">
    <template #filters>
      <EkFilterPanel
        :collapsed="collapsed"
        :active-count="chips.length"
        :columns="3"
        :loading="loading"
        @update:collapsed="(v: boolean) => (collapsed = v)"
        @submit="load"
        @reset="reset"
        :chips="chips"
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
        <EkDateField v-model="form.startDate" :label="t('finance.filters.startDate')" :max="form.endDate" />
        <EkDateField v-model="form.endDate" :label="t('finance.filters.endDate')" :min="form.startDate" />
      </EkFilterPanel>

      <section class="ek-fin-kpis" :aria-label="t('finance.summary.kpiLabel')" :aria-busy="loading || undefined">
        <EkKpiRow v-if="loading">
          <div v-for="n in 4" :key="n" class="ek-fin-kpis__bone" aria-hidden="true">
            <span class="ek-fin-kpis__bone-line"></span>
            <span class="ek-fin-kpis__bone-line ek-fin-kpis__bone-line--value"></span>
          </div>
        </EkKpiRow>
        <div v-else-if="errorStatus !== undefined" class="ek-fin-kpis__state">
          <EkErrorState size="inline" :message="errorMessage(errorStatus, t('finance.summary.errorSubject'))" @retry="load" />
        </div>
        <div v-else-if="!summary || !summary.transactionCount" class="ek-fin-kpis__state">
          <EkEmptyState variant="no-results" :title="t('finance.summary.emptyTitle')" :message="t('finance.summary.emptyText')" />
        </div>
        <template v-else>
          <EkKpiRow>
            <EkKpiCard :label="t('finance.summary.totalCredit')" :value="formatMoney(summary.totalCredit)" :secondary-value="t('finance.summary.totalCreditHint')" />
            <EkKpiCard :label="t('finance.summary.totalDebt')" :value="formatMoney(summary.totalDebt)" :secondary-value="t('finance.summary.totalDebtHint')" />
            <EkKpiCard :label="t('finance.summary.netAmount')" :value="formatMoney(summary.netAmount)" :secondary-value="t('finance.summary.netAmountHint')" />
            <EkKpiCard :label="t('finance.summary.transactionCount')" :value="formatNumber(summary.transactionCount)" :secondary-value="t('finance.summary.transactionCountHint')" />
          </EkKpiRow>
          <p class="ek-fin-kpis__note">
            <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
            <span>{{ t('finance.summary.note') }}</span>
          </p>
        </template>
      </section>
    </template>

    <template #toolbar>
      <div class="ek-fin-breakdown-head">
        <h2 class="ek-fin-breakdown-head__title">{{ t('finance.summary.breakdownTitle') }}</h2>
        <span class="ek-fin-breakdown-head__hint">{{ t('finance.summary.breakdownHint') }}</span>
      </div>
    </template>

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
  </EkListFrame>
</template>

<script setup lang="ts">
import { EkSelect, EkListFrame, EkFilterPanel, EkDateField, EkKpiRow, EkKpiCard, EkEmptyState, EkErrorState, EkDataGrid, type EkGridColumn, EkChannelDot, EkStatusChip } from '@entegrasyonik/ui/components'
import type { EkActiveFilterChip } from '@entegrasyonik/ui/components'
import { channelOptionsFrom } from '@entegrasyonik/ui/components/selectOptions'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIntegrationStore } from '@/stores/integrationStore'
import { formatDate, formatMoney, formatNumber } from '@entegrasyonik/ui/format'
import { useFinanceApi, type FinancialSummary } from '@/composables/useFinanceApi'
import type { StatusTone } from '@/design/status-map'
import { channelName, errorMessage } from './financeSupport'

interface BreakdownRow {
  code: string
  title: string
  summary: FinancialSummary | null
  failed: boolean
}

const { t } = useI18n()
const api = useFinanceApi()
const integrationStore = useIntegrationStore()

const form = reactive({ integrationCodes: [] as string[], startDate: null as Date | null, endDate: null as Date | null })
const applied = ref({ integrationCodes: [] as string[], startDate: null as Date | null, endDate: null as Date | null })
const collapsed = ref(typeof window !== 'undefined' && window.innerWidth < 768)

const loading = ref(false)
const summary = ref<FinancialSummary | null>(null)
const errorStatus = ref<number | null | undefined>(undefined)
const breakdown = ref<BreakdownRow[]>([])

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
</script>

<style scoped>
/* Özet sayfa akışında kayar (kanal kırılımı kısa bir tablodur): kart kendi içinde kaydırılmaz, böylece
 * KPI satırı + kırılım dar yükseklikte de kesilmez ve tablo odaklanamayan bir kaydırma bölgesi olmaz. */
.ek-fin-summary-tab {
  height: auto;
}

.ek-fin-summary-tab :deep(.ek-list-frame__card) {
  flex: none;
  height: auto;
  min-height: 0;
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
  border-radius: var(--ek-radius-lg);
}

.ek-fin-kpis__bone {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-5);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.ek-fin-kpis__bone-line {
  display: block;
  width: 45%;
  height: 12px;
  background: var(--ek-color-surface-muted);
  border-radius: var(--ek-radius-sm);
}

.ek-fin-kpis__bone-line--value {
  width: 70%;
  height: 24px;
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

.ek-fin-breakdown-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
}

.ek-fin-breakdown-head__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-fin-breakdown-head__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-fin-breakdown-net {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-fin-breakdown-net.is-negative {
  color: var(--ek-color-danger);
}

/* Dar ekranda KPI'lar 2 kolon ve daha küçük değerle: dört kart ilk ekrana sığar (kırılım altta kalır). */
@media (max-width: 767px) {
  .ek-fin-kpis :deep(.ek-kpi-row) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ek-space-3);
  }

  .ek-fin-kpis :deep(.ek-kpi-card) {
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  .ek-fin-kpis :deep(.ek-kpi-card__value) {
    font-size: var(--ek-font-size-lg);
  }

  .ek-fin-kpis :deep(.ek-kpi-card__secondary) {
    font-size: var(--ek-type-caption-size);
    color: var(--ek-color-content-muted);
  }
}
</style>
