<!--
  HealthKpi — genel bakış KPI kartı: mikro etiket + sağlık rozeti → metrik değer → tek satır bağlam → (isteğe bağlı)
  terim açıklaması. Bölüm getHealth'te düşmüşse (degraded) değer yerine "Okunamadı" + neden + Yeniden dene.
  `to` verilirse kartın tamamı ayrıntı ekranına gider (BO-ELEV: her gösterge bir sonraki adıma bağlı); klavyede tek sekme
  durağı etiketteki bağlantıdır, "Yeniden dene" bağlantının üstünde kalır.
-->
<template>
  <article class="bo-kpi" :class="[`is-${state}`, { 'is-link': to }]" :aria-busy="state === 'loading' || undefined">
    <header class="bo-kpi__head">
      <v-icon class="bo-kpi__icon" :icon="icon" aria-hidden="true" />
      <h3 class="bo-kpi__label">
        <RouterLink v-if="to" :to="to" class="bo-kpi__link">{{ label }}<span class="ek-sr-only"> — ayrıntı</span></RouterLink>
        <template v-else>{{ label }}</template>
      </h3>
      <v-icon v-if="to" class="bo-kpi__go" icon="mdi-arrow-right" aria-hidden="true" />
    </header>
    <template v-if="state === 'loading'">
      <span class="bo-kpi__skeleton bo-kpi__skeleton--value" aria-hidden="true"></span>
      <span class="bo-kpi__skeleton" aria-hidden="true"></span>
      <span class="ek-sr-only">Yükleniyor</span>
    </template>
    <template v-else-if="state === 'section-degraded'">
      <p class="bo-kpi__value bo-kpi__value--muted">Okunamadı</p>
      <p class="bo-kpi__detail">
        {{ degradedReason === 'timeout' ? 'Kaynak 2 sn içinde yanıt vermedi.' : 'Kaynak hata döndürdü.' }}
        <button type="button" class="bo-kpi__retry" @click="$emit('retry')">Yeniden dene</button>
      </p>
    </template>
    <template v-else>
      <div class="bo-kpi__value-row">
        <p class="bo-kpi__value">
          <span class="ek-num">{{ value }}</span><span v-if="unit" class="bo-kpi__unit">{{ unit }}</span>
        </p>
        <EkStatusChip class="bo-kpi__chip" :tone="HEALTH[chipState].tone" :label="chipLabel ?? HEALTH[chipState].label" dot />
      </div>
      <p class="bo-kpi__detail">{{ detail }}</p>
    </template>
    <p v-if="help" class="bo-kpi__help">{{ help }}</p>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { EkStatusChip } from '@entegrasyonik/ui/components'
import { HEALTH, type HealthState } from '@bo/utils/labels'

export type KpiState = HealthState | 'loading' | 'section-degraded'

const props = defineProps<{
  label: string
  icon: string
  state: KpiState
  value?: string
  unit?: string
  detail?: string
  /** Rozet metnini özelleştir (ör. "Eşik üstü"). */
  chipLabel?: string
  /** Teknik terimin kısa açıklaması (ör. p95). */
  help?: string
  degradedReason?: string
  /** Ayrıntı ekranı (kartın tamamı tıklanır). */
  to?: RouteLocationRaw
}>()
defineEmits<{ retry: [] }>()

const chipState = computed<HealthState>(() => (props.state === 'section-degraded' ? 'unknown' : props.state === 'loading' ? 'unknown' : props.state))
</script>

<style scoped>
.bo-kpi {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
  padding: var(--ek-space-4) var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.bo-kpi.is-degraded {
  border-color: var(--ek-color-warning-border);
}

.bo-kpi.is-fail {
  border-color: var(--ek-color-error-border);
  box-shadow: inset 3px 0 0 var(--ek-color-error), var(--ek-shadow-card);
}

.bo-kpi.is-section-degraded {
  border-style: dashed;
  border-color: var(--ek-color-warning-border);
}

.bo-kpi__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 24px;
  margin-bottom: var(--ek-space-1);
}

.bo-kpi__icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.bo-kpi__label {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.bo-kpi__value-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-1) var(--ek-space-2);
}

.bo-kpi__value {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-1);
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  line-height: var(--ek-type-metric-line);
  font-weight: var(--ek-type-metric-weight);
  letter-spacing: var(--ek-type-metric-tracking);
}

.bo-kpi__value--muted {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
}

.bo-kpi__unit {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  letter-spacing: 0;
}

.bo-kpi__detail {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-kpi__help {
  margin: var(--ek-space-2) 0 0;
  padding-top: var(--ek-space-2);
  border-top: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-kpi__retry {
  margin-left: var(--ek-space-1);
  padding: 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: none;
  color: var(--ek-color-action-emphasis);
  font: inherit;
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
}

.bo-kpi__retry:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-kpi.is-link {
  transition: var(--ek-transition-colors);
}

.bo-kpi.is-link:hover {
  border-color: var(--ek-color-border-strong);
}

.bo-kpi.is-link:has(.bo-kpi__link:focus-visible) {
  box-shadow: var(--ek-focus-ring);
}

.bo-kpi__link {
  color: inherit;
  text-decoration: none;
}

.bo-kpi__link:focus-visible {
  outline: none;
}

/* Kartın tamamı tıklanır (bağlantı tek sekme durağı). */
.bo-kpi__link::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  content: '';
}

.bo-kpi__go {
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-sm);
  opacity: 0;
  transition: opacity var(--ek-duration-fast) var(--ek-easing-standard);
}

.bo-kpi.is-link:hover .bo-kpi__go,
.bo-kpi.is-link:has(.bo-kpi__link:focus-visible) .bo-kpi__go {
  opacity: 1;
}

.bo-kpi__retry {
  position: relative;
  z-index: 1;
}

@media (max-width: 600px) {
  .bo-kpi {
    padding: var(--ek-space-3);
  }

  .bo-kpi__value {
    font-size: var(--ek-type-heading-size);
    line-height: var(--ek-type-heading-line);
  }

  /* Terim açıklaması masaüstünde; dar ekranda önce sayılar. */
  .bo-kpi__help {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bo-kpi__go {
    transition: none;
  }
}

.bo-kpi__skeleton {
  display: block;
  width: 70%;
  height: 12px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.bo-kpi__skeleton--value {
  width: 45%;
  height: 28px;
  margin: var(--ek-space-1) 0;
}
</style>
