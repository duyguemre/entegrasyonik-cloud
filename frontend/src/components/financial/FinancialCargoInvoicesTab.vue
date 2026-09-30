<!--
  frontend/src/components/financial/FinancialCargoInvoicesTab.vue

  Finans › Kargo faturaları. Liste standardı (EkListScreen → EkListFrame), başlıksız (sayfa başlığı
  FinancialListView'de). Veri: `FinancialService/getCargoInvoices` — backend SAYFASIZ, en yeni önce,
  en fazla 5000 satır döner; filtreler TEK kanal (`integrationCode`) ve TAM eşleşme (fatura/sipariş no).
  Bu yüzden sıralama ve sayfalama YALNIZ yüklenen satırlar üzerinde istemcide yapılır; 5000 satıra
  ulaşıldıysa "ilk 5000 satır" notu gösterilir. Kargo faturası sağlamayan kanal seçiliyken boş yanıt
  "desteklenmiyor" durumudur (0 DEĞİL) — bkz. financeSupport.ts.
-->
<template>
  <EkListScreen channel-key="integrationCode"
    class="ek-fin-cargo"
    :label="t('finance.cargo.label')"
    :noun="t('finance.cargo.noun')"
    row-key="_id"
    label-key="invoiceNumber"
    :columns="columns"
    :rows="pageRows"
    :loading="loading"
    :error="errorStatus !== undefined"
    :error-title="t('finance.cargo.errorTitle')"
    :error-text="errorHint(errorStatus ?? null)"
    :search="form.invoiceNumber"
    :search-placeholder="t('finance.filters.invoiceNumber')"
    :chips="chips"
    :filter-count="chips.filter((c) => c.key !== 'invoiceNumber').length"
    :sort="sort"
    :page="page"
    :page-size="pageSize"
    :total="rows.length"
    :empty-title="t('finance.cargo.emptyTitle')"
    :empty-text="t('finance.cargo.emptyText')"
    empty-icon="mdi-truck-outline"
    :filtered-empty-title="unsupported ? t('finance.cargo.unsupportedTitle') : t('finance.cargo.filteredEmptyTitle')"
    :filtered-empty-text="unsupported ? t('finance.cargo.unsupportedText', { channel: channelName(applied.integrationCode) }) : t('finance.cargo.filteredEmptyText')"
    @update:search="(v: string) => (form.invoiceNumber = v)"
    @search-submit="load"
    @update:sort="(s: EkGridSort) => { sort = s; page = 1 }"
    @update:page="(p: number) => (page = p)"
    @update:page-size="(s: number) => { pageSize = s; page = 1 }"
    @filter-submit="load"
    @filter-reset="resetPanel"
    @remove-chip="removeChip"
    @clear-filters="clearAll"
    @refresh="load"
  >
    <template #filters>
      <EkSelect kind="channel"
        v-model="form.integrationCode"
        :items="channelOptionsFrom(channelOptions)"
        :label="t('finance.filters.channel')"
        clearable
      />
      <v-text-field v-model="form.orderNumber" :label="t('finance.filters.orderNumber')" clearable />
      <EkDateField v-model="form.startDate" :label="t('finance.filters.startDate')" :max="form.endDate" />
      <EkDateField v-model="form.endDate" :label="t('finance.filters.endDate')" :min="form.startDate" />
    </template>

    <template #toolbar-start>
      <span class="ek-fin-cargo__note">
        <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
        {{ t('finance.cargo.support', { channels: unsupportedNames('cargoInvoices') }) }}
      </span>
    </template>
    <template v-if="capped" #toolbar-end>
      <span class="ek-fin-cargo__cap" role="status">
        <v-icon icon="mdi-alert-outline" size="16" aria-hidden="true" />
        {{ t('finance.cargo.capped', { max: formatNumber(CARGO_INVOICES_MAX_ROWS) }) }}
      </span>
    </template>

    <template #cell-invoiceNumber="{ row }"><span class="ek-num ek-fin-cargo__id">{{ row.invoiceNumber }}</span></template>
    <template #cell-integrationCode="{ row }"><EkChannelDot :code="row.integrationCode" /></template>
    <template #cell-orderNumber="{ row }"><span class="ek-num">{{ row.orderNumber || '—' }}</span></template>
    <template #cell-packageId="{ row }"><span class="ek-num ek-fin-cargo__muted">{{ row.packageId || '—' }}</span></template>
    <template #cell-shipmentType="{ row }">
      <EkStatusChip :tone="shipment(row.shipmentType).tone" :label="shipment(row.shipmentType).label" />
    </template>
    <template #cell-desi="{ row }"><span class="ek-num">{{ formatNumber(row.desi) }}</span></template>
    <template #cell-amount="{ row }"><span class="ek-num ek-fin-cargo__amount">{{ formatMoney(row.amount) }}</span></template>
    <template #cell-transactionDate="{ row }"><span class="ek-num">{{ formatDate(row.transactionDate) }}</span></template>
  </EkListScreen>
</template>

<script setup lang="ts">
import { EkSelect, EkDateField, EkChannelDot, EkStatusChip } from '@entegrasyonik/ui/components'
import type { EkGridColumn, EkGridSort, EkActiveFilterChip } from '@entegrasyonik/ui/components'
import { channelOptionsFrom } from '@entegrasyonik/ui/components/selectOptions'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import EkListScreen from '@/components/page/templates/EkListScreen.vue'
import { sortRows } from '@entegrasyonik/ui/components/listStandard'
import { useIntegrationStore } from '@/stores/integrationStore'
import { formatDate, formatMoney, formatNumber } from '@entegrasyonik/ui/format'
import { CARGO_INVOICES_MAX_ROWS, useFinanceApi, type CargoInvoice } from '@/composables/useFinanceApi'
import { SHIPMENT_TYPES, channelName, errorHint, isUnsupported, unsupportedNames } from './financeSupport'

const { t } = useI18n()
const api = useFinanceApi()
const integrationStore = useIntegrationStore()

type CargoForm = { integrationCode: string | null; invoiceNumber: string; orderNumber: string; startDate: Date | null; endDate: Date | null }
const emptyForm = (): CargoForm => ({ integrationCode: null, invoiceNumber: '', orderNumber: '', startDate: null, endDate: null })

const form = reactive<CargoForm>(emptyForm())
const applied = ref<CargoForm>(emptyForm())

const loading = ref(false)
const errorStatus = ref<number | null | undefined>(undefined)
const rows = ref<CargoInvoice[]>([])
const sort = ref<EkGridSort>({ key: 'transactionDate', dir: 'desc' })
const page = ref(1)
const pageSize = ref(25)

const channelOptions = computed<Array<{ code: string; title: string }>>(() => {
  try {
    return (integrationStore.getClientMarketplaces() || []).map((p: any) => ({ code: p.code, title: p.title || channelName(p.code) }))
  } catch {
    return []
  }
})

const columns = computed<EkGridColumn[]>(() => [
  { key: 'invoiceNumber', label: t('finance.cargo.colInvoice'), type: 'id', sortable: true },
  { key: 'integrationCode', label: t('finance.cargo.colChannel') },
  { key: 'orderNumber', label: t('finance.cargo.colOrder'), sortable: true },
  { key: 'packageId', label: t('finance.cargo.colPackage') },
  { key: 'shipmentType', label: t('finance.cargo.colType') },
  { key: 'desi', label: t('finance.cargo.colDesi'), type: 'num', align: 'end', sortable: true },
  { key: 'amount', label: t('finance.cargo.colAmount'), type: 'num', align: 'end', sortable: true },
  { key: 'transactionDate', label: t('finance.cargo.colDate'), sortable: true },
])

const sorted = computed(() => sortRows(rows.value, sort.value))
const pageRows = computed(() => sorted.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const capped = computed(() => rows.value.length >= CARGO_INVOICES_MAX_ROWS)
const unsupported = computed(() => !rows.value.length && isUnsupported('cargoInvoices', applied.value.integrationCode))

const chips = computed<EkActiveFilterChip[]>(() => {
  const a = applied.value
  const out: EkActiveFilterChip[] = []
  if (a.invoiceNumber) out.push({ key: 'invoiceNumber', label: t('finance.cargo.colInvoice'), value: a.invoiceNumber })
  if (a.integrationCode) out.push({ key: 'integrationCode', label: t('finance.filters.channel'), value: channelName(a.integrationCode) })
  if (a.orderNumber) out.push({ key: 'orderNumber', label: t('finance.filters.orderNumber'), value: a.orderNumber })
  if (a.startDate) out.push({ key: 'startDate', label: t('finance.filters.startDate'), value: formatDate(a.startDate) })
  if (a.endDate) out.push({ key: 'endDate', label: t('finance.filters.endDate'), value: formatDate(a.endDate) })
  return out
})

function shipment(type: string) {
  return SHIPMENT_TYPES[type] ?? { label: type || '—', tone: 'neutral' as const }
}

let requestSeq = 0
async function load() {
  const seq = ++requestSeq
  applied.value = { ...form, invoiceNumber: form.invoiceNumber.trim(), orderNumber: (form.orderNumber || '').trim() }
  page.value = 1
  loading.value = true
  errorStatus.value = undefined
  const a = applied.value
  const res = await api.getCargoInvoices({
    integrationCode: a.integrationCode,
    invoiceNumber: a.invoiceNumber,
    orderNumber: a.orderNumber,
    startDate: a.startDate,
    endDate: a.endDate,
  })
  if (seq !== requestSeq) return
  loading.value = false
  if (res.ok) rows.value = res.data
  else {
    rows.value = []
    errorStatus.value = res.status
  }
}

function resetPanel() {
  form.integrationCode = null
  form.orderNumber = ''
  form.startDate = null
  form.endDate = null
  load()
}

function clearAll() {
  form.invoiceNumber = ''
  resetPanel()
}

function removeChip(key: string) {
  const f = form as Record<string, unknown>
  f[key] = key === 'invoiceNumber' || key === 'orderNumber' ? '' : null
  load()
}

onMounted(load)
</script>

<style scoped>
.ek-fin-cargo__note,
.ek-fin-cargo__cap {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  font-size: var(--ek-type-caption-size);
}

.ek-fin-cargo__note {
  color: var(--ek-color-content-muted);
}

.ek-fin-cargo__cap {
  color: var(--ek-color-warning-emphasis);
  font-weight: var(--ek-font-weight-medium);
}

.ek-fin-cargo__id {
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}

.ek-fin-cargo__muted {
  color: var(--ek-color-content-muted);
}

.ek-fin-cargo__amount {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}
</style>
