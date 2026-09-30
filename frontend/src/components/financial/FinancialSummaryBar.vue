<!--
  frontend/src/components/financial/FinancialSummaryBar.vue

  ADR-0015 B5-3 — FinancialListView özet şeridi (yalnızca GÖRSEL katman; değerler ekrandan gelir).
  Masaüstü etiketleri (Toplam Satış/Komisyon/Net Hakediş/Kargo/İşlem) ile mobil kısa etiketler
  (Satış/Komisyon/Net/İşlem; Kargo GÖSTERİLMEZ) orijinal ekranla birebir korunur (bkz. financial.spec.ts).
  Tüm renk/boşluk/tipografi `var(--ek-...)` token'larından gelir.
-->
<template>
  <div class="ek-fin-summary" :class="{ 'ek-fin-summary--compact': compact }" role="group" aria-label="Finansal özet">
    <div v-if="loading" class="ek-fin-summary__loading" aria-busy="true">
      <v-skeleton-loader v-for="n in (compact ? 1 : 5)" :key="n" type="text" class="ek-fin-summary__skeleton" />
    </div>
    <template v-else>
      <div v-for="item in items" :key="item.label" class="ek-fin-summary__item">
        <span class="ek-fin-summary__label">{{ item.label }}</span>
        <span class="ek-fin-summary__value ek-num" :class="item.tone ? `ek-fin-summary__value--${item.tone}` : ''">{{ item.value }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  summary: { totalCredit: any; totalDebt: any; netAmount: any; totalCargo: any; transactionCount: any }
  loading: boolean
  compact: boolean
  formatCurrency: (v: any) => string
}>()

const items = computed(() => {
  const s = props.summary
  const fc = (v: any) => `${props.formatCurrency(v)} ₺`
  return props.compact
    ? [
        { label: 'Satış', value: fc(s.totalCredit), tone: 'success' },
        { label: 'Komisyon', value: fc(s.totalDebt), tone: '' },
        { label: 'Net', value: fc(s.netAmount), tone: 'strong' },
        { label: 'İşlem', value: `${s.transactionCount}`, tone: '' },
      ]
    : [
        { label: 'Toplam Satış', value: fc(s.totalCredit), tone: 'success' },
        { label: 'Komisyon', value: fc(s.totalDebt), tone: '' },
        { label: 'Net Hakediş', value: fc(s.netAmount), tone: 'strong' },
        { label: 'Kargo', value: fc(s.totalCargo), tone: '' },
        { label: 'İşlem', value: `${s.transactionCount} adet`, tone: '' },
      ]
})
</script>

<style scoped>
/* Aşama 3: KPI dili — mikro etiket (BÜYÜK HARF) üstte, değer altta kalın ve tabular; hücreler ince ayraçlı
   ızgara (dar ekranda satıra sarılır, yatay taşma yok). Komisyon kırmızı DEĞİL: gider bir hata değildir
   (renk anlamı: error = hata/tehlike); gelir yeşil, net vurgu, diğerleri nötr. */
.ek-fin-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
  overflow: hidden;
}

.ek-fin-summary__loading {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
  width: 100%;
  padding: var(--ek-space-3) var(--ek-space-4);
}

.ek-fin-summary__skeleton {
  width: 120px;
}

.ek-fin-summary__item {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  box-shadow: inset -1px 0 0 var(--ek-color-border-subtle), inset 0 -1px 0 var(--ek-color-border-subtle);
}

.ek-fin-summary__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  white-space: nowrap;
}

.ek-fin-summary__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ek-fin-summary__value--success { color: var(--ek-color-success-emphasis); }
.ek-fin-summary__value--strong { color: var(--ek-color-action-emphasis); }
</style>
