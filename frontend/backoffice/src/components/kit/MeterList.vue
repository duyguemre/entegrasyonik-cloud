<!--
  MeterList — yatay oran çubukları (dağılım/oran için sade, erişilebilir grafik). Her satır: etiket · çubuk · değer.
  Çubuk yalnız görseldir (aria-hidden); değer metin olarak okunur. Ton anlamsal (StatusTone), renk token'dan.
-->
<template>
  <ul class="bo-meter" :aria-label="label">
    <li v-for="row in rows" :key="row.key" class="bo-meter__row">
      <span class="bo-meter__label">
        <span v-if="row.dot" class="bo-meter__dot" :class="`is-${row.tone ?? 'info'}`" aria-hidden="true"></span>{{ row.label }}
      </span>
      <span class="bo-meter__track" aria-hidden="true">
        <span class="bo-meter__fill" :class="`is-${row.tone ?? 'info'}`" :style="{ width: `${pct(row.value)}%` }"></span>
      </span>
      <span class="bo-meter__value ek-num">{{ row.display ?? row.value }}</span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { StatusTone } from '@entegrasyonik/ui/components'

export interface MeterRow {
  key: string
  label: string
  value: number
  display?: string
  tone?: StatusTone
  dot?: boolean
}
const props = defineProps<{ rows: MeterRow[]; label: string; max?: number }>()
const top = computed(() => props.max ?? Math.max(1, ...props.rows.map((r) => r.value)))
const pct = (v: number) => (v <= 0 ? 0 : Math.max(2, Math.min(100, (v / top.value) * 100)))
</script>

<style scoped>
.bo-meter {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.bo-meter__row {
  display: grid;
  grid-template-columns: minmax(96px, 30%) 1fr auto;
  align-items: center;
  gap: var(--ek-space-3);
  font-size: var(--ek-type-label-size);
}
.bo-meter__label {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  overflow: hidden;
  color: var(--ek-color-content-default);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bo-meter__track {
  height: 8px;
  overflow: hidden;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-sunken);
}
.bo-meter__fill {
  display: block;
  height: 100%;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-info);
}
.bo-meter__dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-info);
}
.is-success {
  background: var(--ek-color-success);
}
.is-warning {
  background: var(--ek-color-warning);
}
.is-danger {
  background: var(--ek-color-error);
}
.is-neutral {
  background: var(--ek-color-content-subtle);
}
.bo-meter__value {
  min-width: 48px;
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
  text-align: right;
}
/* MOB-06: telefonda (kart görünümünde dar hücre) satır iki kata ayrılır — etiket + değer üstte, çubuk tam genişlik altta;
   değer kırpılmaz. */
@media (max-width: 599.98px) {
  .bo-meter__row {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: var(--ek-space-1);
  }
  .bo-meter__track {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
