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
        { label: 'Komisyon', value: fc(s.totalDebt), tone: 'danger' },
        { label: 'Net', value: fc(s.netAmount), tone: 'strong' },
        { label: 'İşlem', value: `${s.transactionCount}`, tone: '' },
      ]
    : [
        { label: 'Toplam Satış', value: fc(s.totalCredit), tone: 'success' },
        { label: 'Komisyon', value: fc(s.totalDebt), tone: 'danger' },
        { label: 'Net Hakediş', value: fc(s.netAmount), tone: 'strong' },
        { label: 'Kargo', value: fc(s.totalCargo), tone: '' },
        { label: 'İşlem', value: `${s.transactionCount} adet`, tone: '' },
      ]
})
</script>

<style scoped>
.ek-fin-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2) var(--ek-space-8);
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
}

.ek-fin-summary--compact {
  justify-content: space-between;
  gap: var(--ek-space-3);
}

.ek-fin-summary__loading {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
  width: 100%;
}

.ek-fin-summary__skeleton {
  width: 120px;
}

.ek-fin-summary__item {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  white-space: nowrap;
}

.ek-fin-summary__label {
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}

.ek-fin-summary__value {
  font-size: var(--ek-font-size-md);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-fin-summary__value--success { color: var(--ek-color-success); }
.ek-fin-summary__value--danger { color: var(--ek-color-danger); }
</style>
