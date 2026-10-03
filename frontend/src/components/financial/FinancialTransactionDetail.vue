<!--
  frontend/src/components/financial/FinancialTransactionDetail.vue

  FE-LOCAL-1048 — "Finansal işlem detayı" diyaloğunun gövdesi, ana sayfa / bölüm panolarıyla AYNI dilde (yalnız sunum;
  alanlar ve hesaplar `FinancialListView`'daki eski gövdeyle birebir — yeni veri / istek yok):
    kayıt özeti      kanal + işlem referansı + işlem türü · ince çizgiyle ayrılan bilgi hücreleri (sipariş, tarihler, oran)
    FİNANSAL AKIŞ    büyük rakam hücreleri — brüt (başarı) · komisyon / kesinti (hata) · net hakediş (eylem)
    AÇIKLAMA         not · varsa KDV kesintisi (meta) · pazaryeri ham verisi (katlanır)
  Etiket metinleri eskisiyle aynı (e2e metin iddiaları); büyük harf görünümü CSS'ten.
-->
<template>
  <div class="ek-fin-detail">
    <section class="ftd-record" aria-label="İşlem">
      <div class="ftd-record__main">
        <div class="ek-fin-detail__logo">
          <PlatformImageComponent :integrationCode="transaction.integrationCode" :width="100" :height="45" />
        </div>
        <div class="ftd-record__titles">
          <span class="ftd-eyebrow">İŞLEM REFERANSI</span>
          <span class="ek-fin-detail__ref ek-num">{{ transaction.externalId }}</span>
        </div>
        <v-tooltip :text="transaction.platformType" location="top">
          <template v-slot:activator="{ props: tip }">
            <span v-bind="tip" tabindex="0" class="ftd-record__type">
              <EkStatusChip :tone="typeTone" :label="typeLabel" />
            </span>
          </template>
        </v-tooltip>
      </div>

      <div class="ftd-facts">
        <div class="ftd-fact">
          <span class="ftd-label">SİPARİŞ NUMARASI</span>
          <span class="ftd-fact__value ek-num">{{ transaction.orderNumber || 'MANUEL İŞLEM' }}</span>
        </div>
        <div class="ftd-fact">
          <span class="ftd-label">İŞLEM TARİHİ</span>
          <span class="ftd-fact__value ek-num">{{ formatDate(transaction.transactionDate) }}</span>
        </div>
        <div v-if="transaction.payoutDate" class="ftd-fact">
          <span class="ftd-label">VADE (ÖDEME) TARİHİ</span>
          <span class="ftd-fact__value ek-num">{{ formatDate(transaction.payoutDate) }}</span>
        </div>
        <div class="ftd-fact">
          <span class="ftd-label">KOMİSYON ORANI</span>
          <span class="ftd-fact__value ek-num">{{ transaction.commissionRate ? '%' + transaction.commissionRate : '-' }}</span>
        </div>
      </div>
    </section>

    <ListDashSection label="Finansal akış">
      <ListSummaryStrip :cells="flowCells" label="Finansal akış" />
    </ListDashSection>

    <ListDashSection label="Açıklama">
      <div class="ftd-panel">
        <div class="ftd-note">
          <span class="ftd-label">AÇIKLAMA / NOTLAR</span>
          <p class="ek-fin-note">"{{ transaction.description || 'Bu işlem için ek açıklama bulunmuyor.' }}"</p>
        </div>

        <div v-if="vatFromMeta" class="ek-fin-vat">
          <EkIconTile icon="mdi-calculator-variant-outline" tone="error" size="sm" />
          <span class="ftd-label ek-fin-vat__label">KDV Kesintisi (Meta)</span>
          <span class="ek-fin-vat__value ek-num">-{{ formatCurrency(vatFromMeta) }}</span>
        </div>

        <v-expansion-panels flat class="ftd-raw">
          <v-expansion-panel>
            <v-expansion-panel-title class="ftd-raw__title">
              <v-icon size="16" class="mr-2" aria-hidden="true">mdi-xml</v-icon> PAZARYERİ HAM VERİSİ (JSON)
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div class="ek-fin-json">
                <pre>{{ JSON.stringify(transaction.meta || {}, null, 2) }}</pre>
              </div>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </div>
    </ListDashSection>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkIconTile, EkStatusChip } from '@entegrasyonik/ui/components'
import { formatDateTime, formatMoney } from '@entegrasyonik/ui/format'
import PlatformImageComponent from '@/components/platforms/PlatformImageComponent.vue'
import ListDashSection from '@/components/page/ListDashSection.vue'
import ListSummaryStrip, { type ListSummaryCell } from '@/components/page/ListSummaryStrip.vue'
import type { StatusTone } from '@/design/status-map'

const props = defineProps<{
  /** Liste satırındaki işlem kaydı (ayrı detay isteği yok). */
  transaction: Record<string, any>
  /** İşlem türü rozeti — ton ve çeviri ekranda (liste ile aynı kaynak). */
  typeTone: StatusTone
  typeLabel: string
}>()

const formatCurrency = (val: any) => formatMoney(Number(val || 0))
const formatDate = (d: any) => (d ? formatDateTime(d) : '—')

/** Pazaryeri ham verisinde KDV olabilecek anahtarlar (eski davranış aynen). */
const vatFromMeta = computed(() => {
  const meta = props.transaction?.meta
  if (!meta) return 0
  for (const key of ['vatAmount', 'vat', 'kdv', 'KdvAmount', 'VatAmount']) {
    if (meta[key] && !isNaN(parseFloat(meta[key]))) return parseFloat(meta[key])
  }
  return 0
})

/** Büyük rakam hücreleri: brüt (başarı) → komisyon / diğer kesinti (hata) → net hakediş (eylem). */
const flowCells = computed<ListSummaryCell[]>(() => {
  const t = props.transaction
  const commission = Number(t.commissionAmount || 0)
  const other = Number(t.debt || 0) - commission
  const cells: ListSummaryCell[] = [
    { key: 'gross', label: 'BRÜT TUTAR', icon: 'mdi-plus-circle-outline', tone: 'success', value: formatCurrency(t.credit), zero: !Number(t.credit || 0), hint: 'Kesinti öncesi alacak' },
  ]
  if (t.commissionAmount) {
    cells.push({
      key: 'commission', label: 'PAZARYERİ KOMİSYONU', icon: 'mdi-percent-outline', tone: 'error', value: `-${formatCurrency(commission)}`,
      hint: t.commissionRate ? `Oran %${t.commissionRate}` : 'Pazaryeri kesintisi',
    })
  }
  cells.push(
    { key: 'other', label: 'DİĞER KESİNTİLER / BORÇ', icon: 'mdi-minus-circle-outline', tone: 'error', value: formatCurrency(other), zero: !other, hint: 'Komisyon dışı kesintiler' },
    { key: 'net', label: 'NET HAKEDİŞ', icon: 'mdi-scale-balance', tone: Number(t.netAmount || 0) < 0 ? 'error' : 'action', value: formatCurrency(t.netAmount), zero: !Number(t.netAmount || 0), hint: 'KDV ve tüm kesintiler sonrası' },
  )
  return cells
})
</script>

<style scoped>
.ek-fin-detail {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}

/* Kayıt özeti: düz yüzey + ince çerçeve; bilgi hücreleri ince çizgiyle ayrılır. */
.ftd-record,
.ftd-panel {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  overflow: hidden;
}

.ftd-record__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4) var(--ek-space-5);
}

.ek-fin-detail__logo {
  display: inline-flex;
}

.ftd-record__titles {
  display: flex;
  flex: 1 1 200px;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ftd-label,
.ftd-eyebrow {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ftd-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ftd-eyebrow::before {
  content: '';
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.ek-fin-detail__ref {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-semibold);
  overflow-wrap: anywhere;
}

.ftd-record__type {
  display: inline-flex;
  border-radius: var(--ek-radius-chip);
}

.ftd-record__type:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ftd-facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3) 0;
  padding: var(--ek-space-3) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
}

.ftd-fact {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 0 var(--ek-space-5);
}

.ftd-fact:first-child {
  padding-left: 0;
}

.ftd-fact + .ftd-fact {
  border-left: 1px solid var(--ek-color-border-default);
}

.ftd-fact__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
  overflow-wrap: anywhere;
}

/* Açıklama + KDV + ham veri: tek düz kart, satırlar ince çizgiyle ayrılır. */
.ftd-note {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  padding: var(--ek-space-4) var(--ek-space-5);
}

.ek-fin-note {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-line-height-normal);
  overflow-wrap: anywhere;
}

.ek-fin-vat {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-error-border);
  border-bottom: 1px solid var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
}

.ek-fin-vat :deep(.ek-icon-tile) {
  background: var(--ek-color-surface);
}

.ek-fin-vat__label {
  flex: 1;
  color: var(--ek-color-error-emphasis);
}

.ek-fin-vat__value {
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ftd-raw {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-fin-vat + .ftd-raw {
  border-top: 0;
}

.ftd-raw :deep(.v-expansion-panel) {
  background: transparent;
}

.ftd-raw__title {
  min-height: 44px;
  padding: 0 var(--ek-space-5);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
}

.ftd-raw :deep(.v-expansion-panel-text__wrapper) {
  padding: 0 var(--ek-space-5) var(--ek-space-4);
}

.ek-fin-json {
  max-height: 300px;
  overflow: auto;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}

.ek-fin-json pre {
  margin: 0;
  color: var(--ek-color-content-default);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-line-height-normal);
}

@media (max-width: 600px) {
  .ftd-fact,
  .ftd-fact:first-child {
    flex: 1 1 100%;
    padding: 0;
  }

  .ftd-fact + .ftd-fact {
    border-left: 0;
  }
}
</style>
