<!--
  frontend/src/components/page/ListDistributionCard.vue

  FE-LOCAL-1046 — bölüm panolarında ("Özet" görünümü) ortak DAĞILIM kartı: toplam + tek yatay dağılım çubuğu + satır
  listesi (etiket · sayı · yüzde). Ana sayfadaki "Sipariş durumları" kartıyla aynı dil. `clickable` ise satır
  düğmedir (`select` → ör. listeyi o duruma süz). Sayılar çağırandan gelir (sunum bileşeni).
-->
<template>
  <EkCard :title="title" :subtitle="subtitle" :icon="icon" icon-tone="info" :heading-level="3" class="ldc">
    <div v-if="loading" class="ldc__layout" aria-hidden="true">
      <span class="ldc__skeleton ldc__skeleton--total"></span>
      <span class="ldc__skeleton ldc__skeleton--bar"></span>
      <span v-for="n in 4" :key="n" class="ldc__skeleton"></span>
    </div>
    <p v-else-if="total === 0" class="ldc__empty">{{ emptyText }}</p>
    <div v-else class="ldc__layout">
      <p class="ldc__summary">
        <span class="ldc__total ek-num">{{ fmt(total) }}</span>
        <span class="ldc__unit">{{ unit }}</span>
      </p>
      <div class="ldc__bar" aria-hidden="true">
        <span v-for="r in rows.filter((x) => x.count > 0)" :key="r.key" class="ldc__seg" :class="`is-${r.tone}`"
          :style="{ flexGrow: r.count }" :title="`${r.label}: ${fmt(r.count)} (${pct(r.count)})`"></span>
      </div>
      <ul class="ldc__list" :aria-label="title">
        <li v-for="r in rows" :key="r.key">
          <component :is="clickable ? 'button' : 'div'" :type="clickable ? 'button' : undefined" class="ldc__row"
            :class="{ 'is-link': clickable, 'is-zero': r.count === 0 }"
            :aria-label="clickable ? `${r.label}: ${fmt(r.count)} ${unit} — listede göster` : undefined"
            @click="clickable && emit('select', r.key)">
            <span class="ldc__swatch" :class="`is-${r.tone}`" aria-hidden="true"></span>
            <span class="ldc__label">{{ r.label }}</span>
            <span class="ldc__count ek-num">{{ fmt(r.count) }}</span>
            <span class="ldc__pct ek-num">{{ pct(r.count) }}</span>
          </component>
        </li>
      </ul>
    </div>
  </EkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkCard, type EkTone } from '@entegrasyonik/ui/components'
import { formatNumber, formatPercent } from '@entegrasyonik/ui/format'

export interface ListDistributionRow {
  key: string
  label: string
  count: number
  tone: EkTone
}

const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    icon?: string
    /** Toplamın birimi ("fatura", "mesaj" …). */
    unit: string
    rows: ListDistributionRow[]
    loading?: boolean
    clickable?: boolean
    emptyText?: string
  }>(),
  { subtitle: undefined, icon: 'mdi-chart-donut', loading: false, clickable: false, emptyText: 'Henüz kayıt yok.' },
)
const emit = defineEmits<{ select: [key: string] }>()

const fmt = (v: number) => formatNumber(v ?? 0)
const total = computed(() => props.rows.reduce((a, r) => a + (r.count ?? 0), 0))
const pct = (v: number) => (total.value ? formatPercent(v / total.value) : '')
</script>

<style scoped>
.ldc__layout {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ldc__summary {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-2);
  margin: 0;
}

.ldc__total {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-display-size);
  line-height: 1.15;
  font-weight: var(--ek-type-metric-weight);
  letter-spacing: -0.025em;
}

.ldc__unit {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
}

.ldc__bar {
  display: flex;
  gap: 2px;
  height: 10px;
  overflow: hidden;
  border-radius: var(--ek-radius-full);
}

.ldc__seg {
  flex-basis: 0;
  min-width: 4px;
}

.ldc__seg,
.ldc__swatch {
  background: var(--ek-color-neutral);
}

.ldc__seg.is-success, .ldc__swatch.is-success { background: var(--ek-color-success); }
.ldc__seg.is-warning, .ldc__swatch.is-warning { background: var(--ek-color-warning); }
.ldc__seg.is-error, .ldc__swatch.is-error { background: var(--ek-color-error); }
.ldc__seg.is-info, .ldc__swatch.is-info { background: var(--ek-color-info); }
.ldc__seg.is-action, .ldc__swatch.is-action { background: var(--ek-color-action); }

.ldc__list {
  display: flex;
  flex-direction: column;
  margin: 0 calc(-1 * var(--ek-space-2));
  padding: 0;
  list-style: none;
}

.ldc__row {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto 48px;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 34px;
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-table-size);
  text-align: left;
}

.ldc__row.is-link {
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ldc__row.is-link:hover {
  background: var(--ek-color-surface-muted);
}

.ldc__row.is-link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ldc__swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.ldc__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ldc__count {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ldc__row.is-zero .ldc__count {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.ldc__pct {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  text-align: right;
}

.ldc__empty {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
}

.ldc__skeleton {
  display: block;
  height: 16px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.ldc__skeleton--total { width: 96px; height: 36px; }
.ldc__skeleton--bar { height: 10px; border-radius: var(--ek-radius-full); }
</style>
