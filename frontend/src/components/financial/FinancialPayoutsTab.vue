<!--
  frontend/src/components/financial/FinancialPayoutsTab.vue

  Finans › Ödeme dökümü. Liste standardı (EkListScreen → EkListFrame), başlıksız.
  Ödeme emri listesi için YENİ uç yok: mevcut `FinancialService/getTransactionData` yalnız `PAYOUT`
  türüyle çağrılır (sunucu sayfalama + sıralama). Satır → PayoutDetailSheet (`getPayoutDetails`,
  `paymentOrderId` yalnız string/sayı). Numarası bilinen bir ödeme emri, listede görünmese de başlıktaki
  "Ödeme emri no" alanıyla doğrudan açılabilir. Ödeme dökümü sağlamayan kanal(lar) seçiliyken boş yanıt
  "desteklenmiyor" durumudur (0 DEĞİL) — bkz. financeSupport.ts.
-->
<template>
  <div class="ek-fin-payouts">
    <EkListScreen channel-key="integrationCode"
      class="ek-fin-payouts__screen"
      :label="t('finance.payouts.label')"
      :noun="t('finance.payouts.noun')"
      row-key="_id"
      label-key="paymentOrderId"
      :columns="columns"
      :rows="rows"
      :loading="loading"
      :error="errorStatus !== undefined"
      :error-title="t('finance.payouts.errorTitle')"
      :error-text="errorHint(errorStatus ?? null)"
      :chips="chips"
      :filter-columns="3"
      :sort="sort"
      :page="page"
      :page-size="pageSize"
      :total="total"

      :empty-title="t('finance.payouts.emptyTitle')"
      :empty-text="t('finance.payouts.emptyText')"
      empty-icon="mdi-bank-transfer"
      :filtered-empty-title="unsupported ? t('finance.payouts.unsupportedTitle') : t('finance.payouts.filteredEmptyTitle')"
      :filtered-empty-text="unsupported ? t('finance.payouts.unsupportedText', { channel: applied.integrationCodes.map(channelName).join(', ') }) : t('finance.payouts.filteredEmptyText')"
      @update:sort="onSort"
      @update:page="(p: number) => { page = p; load() }"
      @update:page-size="(s: number) => { pageSize = s; load(true) }"
      @filter-submit="load(true)"
      @filter-reset="reset"
      @remove-chip="removeChip"
      @clear-filters="reset"
      @refresh="load()"
      @row-click="(r: Record<string, any>) => open(r as FinancialTransactionRow)"
    >
      <template #header-actions>
        <form class="ek-fin-payouts__lookup" @submit.prevent="openById">
          <v-text-field
            v-model="lookupId"
            :label="t('finance.payouts.lookupLabel')"
            prepend-inner-icon="mdi-pound"
            hide-details
            density="compact"
            clearable
            class="ek-fin-payouts__lookup-field"
          />
          <EkButton
            type="submit"
            tone="secondary"
            icon="mdi-file-document-outline"
            :icon-only="compact"
            :aria-label="t('finance.payouts.lookupAction')"
            :disabled="!lookupId || !lookupId.trim()"
          >
            {{ t('finance.payouts.lookupAction') }}
          </EkButton>
        </form>
      </template>

      <template #filters>
        <EkSelect kind="channel"
          v-model="form.integrationCodes"
          :items="channelOptionsFrom(channelOptions)"
          :label="t('finance.filters.channels')"
          multiple
          clearable
        />
        <EkDateRange v-model:start="form.startDate" v-model:end="form.endDate" :label="t('finance.filters.dateRange')" :start-label="t('finance.filters.startDate')" :end-label="t('finance.filters.endDate')" value-format="date" />
      </template>

      <template #toolbar-start>
        <span class="ek-fin-payouts__note">
          <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
          {{ t('finance.payouts.support', { channels: unsupportedNames('payouts') }) }}
        </span>
      </template>

      <template #cell-paymentOrderId="{ row }">
        <span class="ek-fin-payouts__id">
          <span class="ek-num">{{ row.paymentOrderId || '—' }}</span>
          <span class="ek-fin-payouts__sub ek-num">{{ row.externalId }}</span>
        </span>
      </template>
      <template #cell-integrationCode="{ row }"><EkChannelDot :code="row.integrationCode" /></template>
      <template #cell-transactionDate="{ row }">
        <span class="ek-fin-payouts__id">
          <span class="ek-num">{{ formatDate(row.transactionDate) }}</span>
          <span v-if="row.payoutDate && formatDate(row.payoutDate) !== formatDate(row.transactionDate)" class="ek-fin-payouts__sub ek-num">{{ t('finance.payouts.dueDate', { date: formatDate(row.payoutDate) }) }}</span>
        </span>
      </template>
      <template #cell-netAmount="{ row }"><span class="ek-num ek-fin-payouts__amount">{{ formatMoney(row.netAmount) }}</span></template>
      <template #cell-description="{ row }"><span class="ek-fin-payouts__desc">{{ row.description || row.platformType || '—' }}</span></template>
      <template #cell-actions="{ row }">
        <EkTooltip v-if="!row.paymentOrderId" :text="t('finance.payouts.noOrderId')">
          <span tabindex="0" class="ek-fin-payouts__na" :aria-label="t('finance.payouts.noOrderId')">—</span>
        </EkTooltip>
        <EkButton
          v-else-if="compact"
          tone="ghost"
          size="sm"
          icon="mdi-chevron-right"
          icon-only
          :aria-label="t('finance.payouts.open')"
          @click.stop="open(row)"
        />
        <EkButton v-else tone="ghost" size="sm" trailing-icon="mdi-chevron-right" @click.stop="open(row)">
          {{ t('finance.payouts.open') }}
        </EkButton>
      </template>
    </EkListScreen>

    <PayoutDetailSheet v-model="sheetOpen" :payment-order-id="sheetId" :payout="sheetPayout" />
  </div>
</template>

<script setup lang="ts">
import { defaultListPageSize } from '@/stores/publicConfig'
import { EkSelect, EkButton, EkDateRange, EkChannelDot, EkTooltip } from '@entegrasyonik/ui/components'
import type { EkGridColumn, EkGridSort, EkActiveFilterChip } from '@entegrasyonik/ui/components'
import { channelOptionsFrom } from '@entegrasyonik/ui/components/selectOptions'
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDisplay } from 'vuetify'
import EkListScreen from '@/components/page/templates/EkListScreen.vue'
import { useIntegrationStore } from '@/stores/integrationStore'
import { formatDate, formatMoney } from '@entegrasyonik/ui/format'
import { useFinanceApi, type FinancialTransactionRow } from '@/composables/useFinanceApi'
import PayoutDetailSheet from './PayoutDetailSheet.vue'
import { channelName, errorHint, isUnsupported, unsupportedNames } from './financeSupport'

const { t } = useI18n()
const { smAndDown: compact } = useDisplay()
const api = useFinanceApi()
const integrationStore = useIntegrationStore()

type PayoutForm = { integrationCodes: string[]; startDate: Date | null; endDate: Date | null }
const form = reactive<PayoutForm>({ integrationCodes: [], startDate: null, endDate: null })
const applied = ref<PayoutForm>({ integrationCodes: [], startDate: null, endDate: null })

const loading = ref(false)
const errorStatus = ref<number | null | undefined>(undefined)
const rows = ref<FinancialTransactionRow[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(defaultListPageSize())
const sort = ref<EkGridSort>({ key: 'transactionDate', dir: 'desc' })

const lookupId = ref('')
const sheetOpen = ref(false)
const sheetId = ref<string | null>(null)
const sheetPayout = ref<FinancialTransactionRow | null>(null)

const channelOptions = computed<Array<{ code: string; title: string }>>(() => {
  try {
    return (integrationStore.getClientMarketplaces() || []).map((p: any) => ({ code: p.code, title: p.title || channelName(p.code) }))
  } catch {
    return []
  }
})

// Sıralama SUNUCUDA (`sortBy` anahtarı = model alanı: paymentOrderId, transactionDate, netAmount).
// PAYOUT kaydının işlem tarihi ödeme tarihidir; ayrı bir `payoutDate` (vade) varsa alt satırda gösterilir.
const columns = computed<EkGridColumn[]>(() => [
  { key: 'paymentOrderId', label: t('finance.payouts.colOrder'), type: 'id', sortable: true },
  { key: 'transactionDate', label: t('finance.payouts.colDate'), sortable: true },
  { key: 'netAmount', label: t('finance.payouts.colAmount'), type: 'num', align: 'end', sortable: true },
  { key: 'integrationCode', label: t('finance.payouts.colChannel') },
  { key: 'description', label: t('finance.payouts.colDescription'), wrap: true },
  { key: 'actions', label: t('finance.payouts.colAction'), align: 'end', hideLabel: true, pin: 'end' },
])

const unsupported = computed(
  () => !rows.value.length && applied.value.integrationCodes.length > 0 && applied.value.integrationCodes.every((c) => isUnsupported('payouts', c)),
)

const chips = computed<EkActiveFilterChip[]>(() => {
  const a = applied.value
  const out: EkActiveFilterChip[] = []
  if (a.integrationCodes.length) out.push({ key: 'integrationCodes', label: t('finance.filters.channels'), value: a.integrationCodes.map(channelName).join(', ') })
  if (a.startDate) out.push({ key: 'startDate', label: t('finance.filters.startDate'), value: formatDate(a.startDate) })
  if (a.endDate) out.push({ key: 'endDate', label: t('finance.filters.endDate'), value: formatDate(a.endDate) })
  return out
})

let requestSeq = 0
async function load(resetPage = false) {
  if (resetPage) page.value = 1
  const seq = ++requestSeq
  applied.value = { integrationCodes: [...form.integrationCodes], startDate: form.startDate, endDate: form.endDate }
  loading.value = true
  errorStatus.value = undefined
  const s = sort.value
  const res = await api.listPayouts({
    ...applied.value,
    page: page.value,
    limit: pageSize.value,
    sortBy: s ? [{ key: s.key, order: s.dir }] : [],
  })
  if (seq !== requestSeq) return
  loading.value = false
  if (res.ok) {
    rows.value = res.data.transactions
    total.value = res.data.totalNumberOfRecords
  } else {
    rows.value = []
    total.value = 0
    errorStatus.value = res.status
  }
}

function onSort(s: EkGridSort) {
  sort.value = s
  load(true)
}

function reset() {
  form.integrationCodes = []
  form.startDate = null
  form.endDate = null
  load(true)
}

function removeChip(key: string) {
  if (key === 'integrationCodes') form.integrationCodes = []
  if (key === 'startDate') form.startDate = null
  if (key === 'endDate') form.endDate = null
  load(true)
}

function open(row: FinancialTransactionRow) {
  if (!row?.paymentOrderId) return
  sheetPayout.value = row
  sheetId.value = String(row.paymentOrderId)
  sheetOpen.value = true
}

function openById() {
  const id = (lookupId.value || '').trim()
  if (!id) return
  sheetPayout.value = rows.value.find((r) => String(r.paymentOrderId) === id) ?? null
  sheetId.value = id
  sheetOpen.value = true
}

onMounted(() => load())
</script>

<style scoped>
.ek-fin-payouts {
  height: 100%;
  min-height: 0;
}

.ek-fin-payouts__screen {
  height: 100%;
}

.ek-fin-payouts__lookup {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-fin-payouts__lookup-field {
  width: 220px;
}

.ek-fin-payouts__note {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-fin-payouts__id {
  display: flex;
  flex-direction: column;
}

.ek-fin-payouts__id > .ek-num:first-child {
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-strong);
}

.ek-fin-payouts__sub {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-fin-payouts__amount {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-fin-payouts__desc {
  color: var(--ek-color-content-default);
}

.ek-fin-payouts__na {
  color: var(--ek-color-content-muted);
}

@media (max-width: 767px) {
  .ek-fin-payouts {
    height: auto;
  }

  .ek-fin-payouts__lookup {
    flex: 1 1 0;
    min-width: 0;
  }

  .ek-fin-payouts__lookup-field {
    flex: 1;
    width: auto;
  }
}
</style>
