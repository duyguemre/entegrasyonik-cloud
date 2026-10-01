<!--
  BoStat — ÖNEMLİ METRİK KUTUSU (BO2-P1, BO2-12). Tek sayı + etiket + kısa bağlam; isteğe bağlı küçük trend çizgisi
  (BoChart sparkline) ve ayrıntı bağlantısı. Renk yalnız durum taşır (`tone`: sol şerit + değer rengi; nötr varsayılan).
  Uzun açıklama kutuya YAZILMAZ: `hint` tek satır, ayrıntı `info`da (ⓘ işareti + üzerine gelince ipucu + ekran okuyucu
  metni; kutu bağlantıysa iç içe etkileşimli öğe olmaz) ya da `to` bağlantısında.

    <BoTileGrid :min="180" dense>
      <BoStat label="Kritik konu" :value="2" tone="critical" hint="Sistem 1 · müşteri 1" to="#sistem" />
      <BoStat label="API isteği (24 sa)" value="67.109" :delta="{ text: '%6', dir: 'up' }" :series="[…]" />
    </BoTileGrid>
-->
<template>
  <component
    :is="to ? (isHash ? 'a' : RouterLink) : 'div'"
    class="bo-stat"
    :class="[`is-${tone}`, { 'is-link': !!to }]"
    v-bind="to ? (isHash ? { href: to } : { to }) : {}"
    :aria-label="to ? `${label}: ${value}${hint ? ` — ${hint}` : ''}` : undefined"
    :title="info"
    data-bo-stat
  >
    <span class="bo-stat__label">
      <span class="bo-stat__label-text">{{ label }}</span>
      <v-icon v-if="info" class="bo-stat__info" icon="mdi-information-outline" aria-hidden="true" />
    </span>
    <span class="bo-stat__value-row">
      <span v-if="loading" class="bo-stat__skel" aria-hidden="true"></span>
      <span v-else class="bo-stat__value ek-num">{{ value }}</span>
      <span v-if="delta && !loading" class="bo-stat__delta" :class="`is-${delta.dir}`">
        <v-icon v-if="delta.dir !== 'flat'" :icon="delta.dir === 'up' ? 'mdi-arrow-top-right' : 'mdi-arrow-bottom-right'" aria-hidden="true" />{{ delta.text }}
      </span>
    </span>
    <span v-if="hint" class="bo-stat__hint">{{ hint }}</span>
    <span v-if="info" class="ek-sr-only">{{ info }}</span>
    <BoChart
      v-if="series && series.length > 1"
      class="bo-stat__spark"
      kind="sparkline"
      :height="32"
      :series="[{ name: label, data: series, tone: sparkTone }]"
      :summary="`${label} — son ${series.length} ölçüm`"
    />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import BoChart from '../charts/BoChart.vue'

const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    hint?: string
    info?: string
    tone?: 'neutral' | 'critical' | 'warning' | 'success' | 'info'
    delta?: { text: string; dir: 'up' | 'down' | 'flat' }
    series?: number[]
    to?: string | Record<string, unknown>
    loading?: boolean
  }>(),
  { tone: 'neutral' },
)
const isHash = computed(() => typeof props.to === 'string' && props.to.startsWith('#'))
const sparkTone = computed(() => (props.tone === 'critical' ? 'error' : props.tone === 'warning' ? 'warning' : 'action'))
</script>

<style scoped>
.bo-stat {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  color: inherit;
  text-decoration: none;
  transition: var(--ek-transition-colors);
}

.bo-stat::before {
  content: '';
  position: absolute;
  inset: var(--ek-space-3) auto var(--ek-space-3) 0;
  width: 3px;
  border-radius: 0 var(--ek-radius-sm) var(--ek-radius-sm) 0;
  background: transparent;
}

.bo-stat.is-critical::before {
  background: var(--ek-color-error);
}

.bo-stat.is-warning::before {
  background: var(--ek-color-warning);
}

.bo-stat.is-success::before {
  background: var(--ek-color-success);
}

.bo-stat.is-info::before {
  background: var(--ek-color-info);
}

.bo-stat.is-link:hover {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-muted);
}

.bo-stat.is-link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-stat__label {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  overflow: hidden;
  white-space: nowrap;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-stat__label-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.bo-stat__info {
  flex: none;
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-xs);
}

.bo-stat__value-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-2);
}

.bo-stat__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  line-height: var(--ek-type-metric-line);
  font-weight: var(--ek-type-metric-weight);
  letter-spacing: var(--ek-type-metric-tracking);
}

.bo-stat.is-critical .bo-stat__value {
  color: var(--ek-color-error-emphasis);
}

.bo-stat.is-warning .bo-stat__value {
  color: var(--ek-color-warning-emphasis);
}

.bo-stat__skel {
  display: inline-block;
  width: 72px;
  height: var(--ek-type-metric-line);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-muted);
}

.bo-stat__delta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-stat__delta .v-icon {
  font-size: var(--ek-icon-xs);
}

.bo-stat__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-stat__spark {
  margin-top: auto;
  padding-top: var(--ek-space-2);
}

@media (max-width: 600px) {
  .bo-stat {
    padding: var(--ek-space-3);
  }
}
</style>
