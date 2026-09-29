<!--
  frontend/src/components/financial/PayoutDetailSheet.vue

  Finans › Ödeme dökümü — ödeme emri detayı (yan sayfa). EkDetailSheet'in ÜSTÜNE kurulur; DS bileşenine
  ve mevcut diyalog gövdelerine dokunulmaz. Veri: `FinancialService/getPayoutDetails` ({ paymentOrderId }).
  HESAP YAPILMAZ: tutarlar yalnız backend alanlarıdır (liste satırındaki ödeme tutarı + kalemlerin kendi
  alacak/borç/net değerleri). Durumlar ayrı: yükleniyor (iskelet) · hata (sabit metin + Tekrar dene) ·
  boş (kanal desteklemiyorsa "desteklenmiyor", aksi hâlde "kalem yok").
-->
<template>
  <EkDetailSheet v-model="isOpen" :identity="t('finance.payoutDetail.identity', { id: paymentOrderId ?? '—' })">
    <template #status>
      <EkChannelDot v-if="channelCode" :code="channelCode" />
    </template>

    <EkSection v-if="payout" :title="t('finance.payoutDetail.overview')" :description="t('finance.payoutDetail.overviewHint')">
      <div class="ek-payout-overview">
        <div class="ek-payout-overview__amount">
          <span class="ek-payout-overview__label">{{ t('finance.payoutDetail.amount') }}</span>
          <span class="ek-payout-overview__value ek-num">{{ formatMoney(payout.netAmount) }}</span>
        </div>
        <EkDescriptionList :items="overviewItems" class="ek-payout-overview__list" />
      </div>
    </EkSection>

    <EkSection :title="t('finance.payoutDetail.items')" :description="t('finance.payoutDetail.itemsHint')">
      <EkErrorState v-if="errorStatus !== undefined" size="inline" :message="errorMessage(errorStatus, t('finance.payoutDetail.errorSubject'))" @retry="load" />
      <template v-else>
        <dl v-if="!loading && items.length" class="ek-payout-stats">
          <div v-for="stat in itemStats" :key="stat.label" class="ek-payout-stats__cell">
            <dt class="ek-payout-stats__label">{{ stat.label }}</dt>
            <dd class="ek-payout-stats__value ek-num">{{ stat.value }}</dd>
          </div>
        </dl>
        <div class="ek-payout-items" tabindex="0" role="region" :aria-label="t('finance.payoutDetail.items')">
          <EkDataGrid
            :columns="columns"
            :rows="items"
            :label="t('finance.payoutDetail.items')"
            row-key="_id"
            label-key="externalId"
            :loading="loading"
            :skeleton-rows="4"
            :empty-title="emptyTitle"
            :empty-text="emptyText"
            :empty-icon="unsupported ? 'mdi-link-variant-off' : 'mdi-receipt-text-outline'"
          >
            <template #cell-externalId="{ row }">
              <span class="ek-payout-ref">
                <span class="ek-num">{{ row.externalId }}</span>
                <span v-if="row.platformType" class="ek-payout-ref__sub">{{ row.platformType }}</span>
              </span>
            </template>
            <template #cell-transactionType="{ row }">
              <EkStatusChip :tone="transactionType(row.transactionType).tone" :label="transactionType(row.transactionType).label" />
            </template>
            <template #cell-orderNumber="{ row }"><span class="ek-num">{{ row.orderNumber || '—' }}</span></template>
            <template #cell-transactionDate="{ row }"><span class="ek-num">{{ formatDate(row.transactionDate) }}</span></template>
            <template #cell-credit="{ row }"><span class="ek-num">{{ formatMoney(row.credit) }}</span></template>
            <template #cell-debt="{ row }"><span class="ek-num">{{ formatMoney(row.debt) }}</span></template>
            <template #cell-netAmount="{ row }">
              <span class="ek-num ek-payout-net" :class="{ 'is-negative': Number(row.netAmount) < 0 }">{{ formatMoney(row.netAmount) }}</span>
            </template>
          </EkDataGrid>
        </div>
      </template>
    </EkSection>
  </EkDetailSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EkDetailSheet from '@/components/ds/EkDetailSheet.vue'
import EkSection from '@/components/ds/EkSection.vue'
import EkDescriptionList, { type EkDescriptionListItem } from '@/components/ds/EkDescriptionList.vue'
import EkDataGrid, { type EkGridColumn } from '@/components/ds/EkDataGrid.vue'
import EkErrorState from '@/components/ds/EkErrorState.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import EkChannelDot from '@/components/ds/EkChannelDot.vue'
import { formatDate, formatMoney, formatNumber } from '@/composables/format'
import { useFinanceApi, type FinancialTransactionRow } from '@/composables/useFinanceApi'
import { channelName, errorMessage, isUnsupported, transactionType } from './financeSupport'

const props = defineProps<{
  modelValue: boolean
  paymentOrderId: string | number | null
  /** Listeden açıldıysa ödeme kaydının kendisi (tutar/tarih/kanal); elle numarayla açıldıysa yok. */
  payout?: FinancialTransactionRow | null
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const { t } = useI18n()
const api = useFinanceApi()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const items = ref<FinancialTransactionRow[]>([])
const loading = ref(false)
/** undefined = hata yok; null = durum kodu bilinmiyor (ağ vb.). */
const errorStatus = ref<number | null | undefined>(undefined)

const channelCode = computed(() => props.payout?.integrationCode ?? items.value[0]?.integrationCode ?? '')
const unsupported = computed(() => !loading.value && items.value.length === 0 && isUnsupported('payouts', channelCode.value))

const emptyTitle = computed(() => (unsupported.value ? t('finance.payouts.unsupportedTitle') : t('finance.payoutDetail.emptyTitle')))
const emptyText = computed(() =>
  unsupported.value ? t('finance.payouts.unsupportedText', { channel: channelName(channelCode.value) }) : t('finance.payoutDetail.emptyText'),
)

const overviewItems = computed<EkDescriptionListItem[]>(() => {
  const p = props.payout
  if (!p) return []
  return [
    { label: t('finance.payoutDetail.channel'), value: channelName(p.integrationCode) },
    { label: t('finance.payoutDetail.payoutDate'), value: formatDate(p.payoutDate || p.transactionDate) },
  ]
})

// Sayım/uç tarihler yalnız GÖSTERİM özetidir (tutar hesabı DEĞİL). Backend kalemleri tarihe göre artan döner.
const itemStats = computed<EkDescriptionListItem[]>(() => [
  { label: t('finance.payoutDetail.itemCount'), value: formatNumber(items.value.length) },
  { label: t('finance.payoutDetail.firstDate'), value: formatDate(items.value[0]?.transactionDate) },
  { label: t('finance.payoutDetail.lastDate'), value: formatDate(items.value[items.value.length - 1]?.transactionDate) },
])

const columns = computed<EkGridColumn[]>(() => [
  { key: 'externalId', label: t('finance.payoutDetail.colRef'), type: 'id' },
  { key: 'transactionType', label: t('finance.payoutDetail.colType') },
  { key: 'orderNumber', label: t('finance.payoutDetail.colOrder') },
  { key: 'transactionDate', label: t('finance.payoutDetail.colDate') },
  { key: 'credit', label: t('finance.payoutDetail.colCredit'), align: 'end' },
  { key: 'debt', label: t('finance.payoutDetail.colDebt'), align: 'end' },
  { key: 'netAmount', label: t('finance.payoutDetail.colNet'), align: 'end' },
])

let requestSeq = 0
async function load() {
  if (props.paymentOrderId === null || props.paymentOrderId === '') return
  const seq = ++requestSeq
  loading.value = true
  errorStatus.value = undefined
  items.value = []
  const res = await api.getPayoutDetails(props.paymentOrderId)
  if (seq !== requestSeq) return
  loading.value = false
  if (res.ok) items.value = res.data
  else errorStatus.value = res.status
}

watch(
  () => [props.modelValue, props.paymentOrderId] as const,
  ([open]) => {
    if (open) load()
  },
  { immediate: true },
)
</script>

<style scoped>
.ek-payout-overview {
  display: grid;
  grid-template-columns: minmax(180px, auto) 1fr;
  gap: var(--ek-space-6);
  align-items: start;
  padding: var(--ek-space-5);
  background: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.ek-payout-overview__amount {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.ek-payout-overview__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-medium);
}

.ek-payout-overview__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-3xl);
  font-weight: var(--ek-font-weight-semibold);
  line-height: var(--ek-line-height-tight);
}

.ek-payout-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 0 0 var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.ek-payout-stats__cell {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  padding: var(--ek-space-3) var(--ek-space-4);
}

.ek-payout-stats__cell + .ek-payout-stats__cell {
  border-left: 1px solid var(--ek-color-border-subtle);
}

.ek-payout-stats__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-payout-stats__value {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-payout-items {
  overflow-x: auto;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

/* Kaydırma bu sarmalayıcıda (odaklanabilir bölge, klavyeyle yatay kaydırılabilir); ızgara kendi içinde kaydırmaz. */
.ek-payout-items :deep(.ek-grid) {
  overflow: visible;
}

.ek-payout-items:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-payout-ref {
  display: flex;
  flex-direction: column;
}

.ek-payout-ref__sub {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-payout-net {
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-payout-net.is-negative {
  color: var(--ek-color-danger);
}

@media (max-width: 767px) {
  .ek-payout-overview {
    grid-template-columns: 1fr;
    gap: var(--ek-space-4);
  }
}
</style>
