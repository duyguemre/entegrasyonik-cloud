<!--
  A13 — müşteri özet metrikleri: Toplam sipariş · Toplam tutar · Son sipariş · İade oranı.
  YALNIZ backend alanları (updateOrderMetrics / updateClaimMetrics + backend `returnRate`); değer yoksa "—" (uydurma 0 yok).
  Hiç sipariş yoksa tek satır zarif boş durum. Değerler nötr (KPI dili, A4); iade oranı eşik üstündeyse durum çipi (renk + metin).
  Kap sorgusu: ≥ 560px dört kolon, altında 2×2.
-->
<template>
  <div class="ek-cust-metrics" :aria-label="label" role="group">
    <div v-if="summary.empty" class="ek-cust-metrics__empty">
      <EkIconTile icon="mdi-cart-off" tone="neutral" size="sm" />
      <div>
        <p class="ek-cust-metrics__empty-title">Henüz sipariş yok</p>
        <p class="ek-cust-metrics__empty-text">İlk sipariş eşitlendiğinde toplam tutar, son sipariş ve iade oranı burada görünür.</p>
      </div>
    </div>
    <dl v-else class="ek-cust-metrics__grid">
      <div v-for="m in summary.items" :key="m.key" class="ek-cust-metrics__item" :data-metric="m.key">
        <dt class="ek-cust-metrics__label"><v-icon :icon="m.icon" aria-hidden="true" />{{ m.label }}</dt>
        <dd class="ek-cust-metrics__value ek-num">
          <template v-if="m.value">{{ m.value }}</template>
          <span v-else class="ek-cust-metrics__none">—<span class="ek-sr-only">veri yok</span></span>
        </dd>
        <dd v-if="m.hint || (m.key === 'returnRate' && alertTone)" class="ek-cust-metrics__hint">
          <span v-if="m.hint">{{ m.hint }}</span>
          <EkStatusChip v-if="m.key === 'returnRate' && alertTone" :tone="alertTone" :label="alertTone === 'danger' ? 'Yüksek' : 'Dikkat'" />
        </dd>
      </div>
    </dl>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkIconTile, EkStatusChip } from '@entegrasyonik/ui/components'
import type { MetricSummary } from '../customerCard'

const props = withDefaults(defineProps<{ summary: MetricSummary; label?: string }>(), { label: 'Müşteri özet metrikleri' })
const alertTone = computed(() => (props.summary.returnTone === 'danger' || props.summary.returnTone === 'warning' ? props.summary.returnTone : null))
</script>

<style scoped>
.ek-cust-metrics { container-type: inline-size; }
.ek-cust-metrics__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
}
@container (min-width: 560px) {
  .ek-cust-metrics__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .ek-cust-metrics__item + .ek-cust-metrics__item { border-left: 1px solid var(--ek-color-border-subtle); }
  .ek-cust-metrics__item:nth-child(n) { border-top: 0; }
}
.ek-cust-metrics__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
}
@container (max-width: 559px) {
  .ek-cust-metrics__item:nth-child(even) { border-left: 1px solid var(--ek-color-border-subtle); }
  .ek-cust-metrics__item:nth-child(n + 3) { border-top: 1px solid var(--ek-color-border-subtle); }
  .ek-cust-metrics__item { padding: var(--ek-space-3); }
}
.ek-cust-metrics__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}
.ek-cust-metrics__label :deep(.v-icon) { font-size: var(--ek-icon-xs); }
.ek-cust-metrics__value {
  margin: 0;
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ek-cust-metrics__none { color: var(--ek-color-content-muted); font-weight: var(--ek-font-weight-regular); }
.ek-cust-metrics__hint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}
.ek-cust-metrics__empty {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
}
.ek-cust-metrics__empty-title {
  margin: 0;
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}
.ek-cust-metrics__empty-text {
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}
</style>
