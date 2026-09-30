<!--
  frontend/src/components/financial/FinancialSummaryBar.vue

  FR2-FIN 38 (fe-r2d) — "para nereye gitti" tek bakışta: Brüt alacak − Kesintiler = Net hakediş (+ Kargo, İşlem sayısı).
  Değerler YALNIZ backend özetinden (`FinancialService/getTransactionData` → summary: totalCredit, totalDebt, netAmount,
  totalCargo, transactionCount). Tek türetilmiş değer kesinti oranıdır (totalDebt / totalCredit) — ikisi de backend verisi;
  brüt 0 ise oran gösterilmez. Eski "Komisyon" etiketi düzeltildi: totalDebt tüm borç kalemlerinin toplamıdır (komisyon +
  diğer kesintiler), yalnız komisyon değildir. Renk: gider kırmızı değil (hata değildir); net vurgu yalnız tipografiyle.
-->
<template>
  <section class="ek-fin-sum" :class="{ 'ek-fin-sum--compact': compact }" role="group" aria-label="Finansal özet">
    <div v-if="loading" class="ek-fin-sum__loading" aria-busy="true">
      <v-skeleton-loader v-for="n in (compact ? 2 : 4)" :key="n" type="text" class="ek-fin-sum__skeleton" />
    </div>
    <template v-else>
      <div class="ek-fin-sum__main">
        <div class="ek-fin-sum__item">
          <span class="ek-fin-sum__label">Brüt alacak</span>
          <span class="ek-fin-sum__value ek-num">{{ money(summary.totalCredit) }}</span>
          <span v-if="!compact" class="ek-fin-sum__hint">Satış ve diğer alacaklar</span>
        </div>
        <span class="ek-fin-sum__op" aria-hidden="true">−</span>
        <div class="ek-fin-sum__item">
          <span class="ek-fin-sum__label">Kesintiler</span>
          <span class="ek-fin-sum__value ek-num">{{ money(summary.totalDebt) }}</span>
          <span v-if="!compact" class="ek-fin-sum__hint">Komisyon ve diğer kesintiler</span>
        </div>
        <span class="ek-fin-sum__op" aria-hidden="true">=</span>
        <div class="ek-fin-sum__item ek-fin-sum__item--net">
          <span class="ek-fin-sum__label">Net hakediş</span>
          <span class="ek-fin-sum__value ek-fin-sum__value--net ek-num">{{ money(summary.netAmount) }}</span>
          <span v-if="!compact" class="ek-fin-sum__hint">Hesabınıza geçecek tutar</span>
        </div>
      </div>

      <svg v-if="deductionShare !== null" class="ek-fin-sum__bar" role="img" preserveAspectRatio="none" viewBox="0 0 100 1"
        :aria-label="`Brüt alacağın ${shareText} kadarı kesinti, kalanı net hakediş`">
        <rect class="ek-fin-sum__bar-net" x="0" y="0" :width="100 - deductionShare" height="1" />
        <rect class="ek-fin-sum__bar-cut" :x="100 - deductionShare" y="0" :width="deductionShare" height="1" />
      </svg>

      <dl class="ek-fin-sum__meta">
        <div v-if="deductionShare !== null"><dt>Kesinti oranı</dt><dd class="ek-num">{{ shareText }}</dd></div>
        <div v-if="!compact"><dt>Kargo</dt><dd class="ek-num">{{ money(summary.totalCargo) }}</dd></div>
        <div><dt>İşlem</dt><dd class="ek-num">{{ summary.transactionCount ?? 0 }} adet</dd></div>
      </dl>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { formatPercent } from '@entegrasyonik/ui/format'

const props = defineProps<{
  summary: { totalCredit: any; totalDebt: any; netAmount: any; totalCargo: any; transactionCount: any }
  loading: boolean
  compact: boolean
  formatCurrency: (v: any) => string
}>()

const money = (v: any) => `${props.formatCurrency(v)} ₺`

/** Kesintinin brüt alacağa oranı (0–100); brüt yok/0 ise null (oran uydurulmaz). */
const deductionShare = computed<number | null>(() => {
  const credit = Number(props.summary?.totalCredit)
  const debt = Number(props.summary?.totalDebt)
  if (!Number.isFinite(credit) || !Number.isFinite(debt) || credit <= 0 || debt < 0) return null
  return Math.min(100, (debt / credit) * 100)
})
const shareText = computed(() => (deductionShare.value === null ? '' : formatPercent(deductionShare.value / 100)))
</script>

<style scoped>
.ek-fin-sum {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-5);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
}

.ek-fin-sum__loading {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
}

.ek-fin-sum__skeleton {
  width: 140px;
}

.ek-fin-sum__main {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: var(--ek-space-2) var(--ek-space-5);
}

.ek-fin-sum__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ek-fin-sum__item--net {
  margin-left: auto;
  align-items: flex-end;
  text-align: right;
}

.ek-fin-sum__label,
.ek-fin-sum__meta dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  white-space: nowrap;
}

.ek-fin-sum__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
}

.ek-fin-sum__value--net {
  font-size: var(--ek-type-metric-size);
  line-height: var(--ek-type-metric-line);
  font-weight: var(--ek-font-weight-bold);
}

.ek-fin-sum__hint {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-fin-sum__op {
  align-self: center;
  font-size: var(--ek-type-heading-size);
  color: var(--ek-color-content-subtle);
}

/* Oran çubuğu: net (koyu nötr) + kesinti (açık nötr); anlam metinde de var (WCAG 1.4.1). */
.ek-fin-sum__bar {
  display: block;
  width: 100%;
  height: var(--ek-space-2);
  overflow: hidden;
  border-radius: var(--ek-radius-chip);
}

.ek-fin-sum__bar-net {
  fill: var(--ek-color-action);
}

.ek-fin-sum__bar-cut {
  fill: var(--ek-color-border-strong);
}

.ek-fin-sum__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2) var(--ek-space-6);
  margin: 0;
}

.ek-fin-sum__meta > div {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-2);
}

.ek-fin-sum__meta dd {
  margin: 0;
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-fin-sum--compact {
  padding: var(--ek-space-3) var(--ek-space-4);
}

.ek-fin-sum--compact .ek-fin-sum__op {
  display: none;
}

.ek-fin-sum--compact .ek-fin-sum__main {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.ek-fin-sum--compact .ek-fin-sum__item--net {
  grid-column: 1 / -1;
  margin-left: 0;
  align-items: flex-start;
  text-align: left;
  padding-top: var(--ek-space-2);
  border-top: 1px dashed var(--ek-color-border-default);
}
</style>
