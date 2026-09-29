<!--
  frontend/src/components/ds/EkMetricCard.vue

  DS-v2 — KPI kartı. Hiyerarşi HER zaman aynı:
    [ikon kapsülü]  MİKRO ETİKET
                    Değer (metric 28/700, tabular-nums)   [trend]
                    Açıklama (caption, content-muted)
  Trend: ▲/▼ + metin; iyi yön `success`, kötü yön `error` METİN rengi, zemin
  yok. `loading` iskelet gösterir (düzen sıçramaz). Değer biçimlendirmesi
  çağıranın işidir (`composables/format.ts`).
-->
<template>
  <article class="ek-metric" :class="{ 'ek-metric--interactive': interactive }" :aria-busy="loading || undefined">
    <EkIconTile v-if="icon" :icon="icon" :tone="tone" size="md" />
    <div class="ek-metric__main">
      <p class="ek-metric__label">{{ label }}</p>
      <template v-if="loading">
        <span class="ek-metric__skeleton ek-metric__skeleton--value" aria-hidden="true"></span>
        <span class="ek-metric__skeleton ek-metric__skeleton--text" aria-hidden="true"></span>
        <span class="ek-sr-only">Yükleniyor</span>
      </template>
      <template v-else>
        <p class="ek-metric__value-row">
          <span class="ek-metric__value">{{ value }}</span>
          <span v-if="trend" class="ek-metric__trend" :class="`ek-metric__trend--${trendTone}`">
            <v-icon :icon="trend.direction === 'up' ? 'mdi-arrow-up' : 'mdi-arrow-down'" aria-hidden="true" />
            {{ trend.text }}
          </span>
        </p>
        <p v-if="description" class="ek-metric__desc">{{ description }}</p>
      </template>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkIconTile, { type EkTone } from './EkIconTile.vue'

const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    description?: string
    icon?: string
    tone?: EkTone
    trend?: { direction: 'up' | 'down'; text: string; positive?: boolean }
    loading?: boolean
    interactive?: boolean
  }>(),
  { tone: 'action', loading: false, interactive: false },
)

const trendTone = computed(() => {
  if (!props.trend) return 'neutral'
  const positive = props.trend.positive ?? props.trend.direction === 'up'
  return positive ? 'good' : 'bad'
})
</script>

<style scoped>
.ek-metric {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-4);
  min-width: 0;
  padding: var(--ek-space-5);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
  transition: var(--ek-transition-colors);
}

.ek-metric--interactive {
  cursor: pointer;
}

.ek-metric--interactive:hover {
  border-color: var(--ek-color-border-strong);
  box-shadow: var(--ek-shadow-raised);
}

.ek-metric__main {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.ek-metric__label {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-metric__value-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
}

.ek-metric__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  line-height: var(--ek-type-metric-line);
  font-weight: var(--ek-type-metric-weight);
  letter-spacing: var(--ek-type-metric-tracking);
  font-variant-numeric: tabular-nums;
}

.ek-metric__trend {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-metric__trend :deep(.v-icon) {
  font-size: var(--ek-icon-xs);
}

.ek-metric__trend--good {
  color: var(--ek-color-success);
}

.ek-metric__trend--bad {
  color: var(--ek-color-error);
}

.ek-metric__desc {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-metric__skeleton {
  display: block;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.ek-metric__skeleton--value {
  width: 96px;
  height: var(--ek-type-metric-line);
}

.ek-metric__skeleton--text {
  width: 140px;
  height: var(--ek-type-caption-line);
}

</style>
