<!--
  frontend/src/components/ds/EkBadge.vue

  DS-v2 — küçük rozet. Durum çipi DEĞİLDİR (durum için `EkStatusChip`).
    variant="count" — dolgu sayaç (yeni/okunmamış adedi): 18px, ton dolgu + contrast metin.
    variant="label" — BÜYÜK HARF mikro etiket ("YENİ", "BETA", tür rozeti): subtle zemin + emphasis metin.
  Renk tek başına anlam taşımaz; metin her zaman görünür.
-->
<template>
  <span class="ek-badge" :class="[`ek-badge--${variant}`, `ek-badge--${tone}`]">
    <slot>{{ text }}</slot>
  </span>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    text?: string | number
    variant?: 'count' | 'label'
    tone?: 'action' | 'success' | 'warning' | 'error' | 'info' | 'neutral'
  }>(),
  { variant: 'label', tone: 'action' },
)
</script>

<style scoped>
.ek-badge {
  --ek-badge-fill: var(--ek-color-action);
  --ek-badge-on-fill: var(--ek-color-action-contrast);
  --ek-badge-subtle: var(--ek-color-action-subtle);
  --ek-badge-emphasis: var(--ek-color-action-emphasis);
  --ek-badge-border: var(--ek-color-action-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  white-space: nowrap;
  font-weight: var(--ek-font-weight-bold);
}

.ek-badge--count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-badge-fill);
  color: var(--ek-badge-on-fill);
  font-size: var(--ek-type-micro-size);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.ek-badge--label {
  height: 18px;
  padding: 0 var(--ek-space-2);
  border-radius: var(--ek-radius-sm);
  background: var(--ek-badge-subtle);
  color: var(--ek-badge-emphasis);
  box-shadow: inset 0 0 0 1px var(--ek-badge-border);
  font-size: var(--ek-type-micro-size);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  line-height: 1;
}

.ek-badge--success {
  --ek-badge-fill: var(--ek-color-success);
  --ek-badge-on-fill: var(--ek-color-success-contrast);
  --ek-badge-subtle: var(--ek-color-success-subtle);
  --ek-badge-emphasis: var(--ek-color-success-emphasis);
  --ek-badge-border: var(--ek-color-success-border);
}

.ek-badge--warning {
  --ek-badge-fill: var(--ek-color-warning);
  --ek-badge-on-fill: var(--ek-color-warning-contrast);
  --ek-badge-subtle: var(--ek-color-warning-subtle);
  --ek-badge-emphasis: var(--ek-color-warning-emphasis);
  --ek-badge-border: var(--ek-color-warning-border);
}

.ek-badge--error {
  --ek-badge-fill: var(--ek-color-error);
  --ek-badge-on-fill: var(--ek-color-error-contrast);
  --ek-badge-subtle: var(--ek-color-error-subtle);
  --ek-badge-emphasis: var(--ek-color-error-emphasis);
  --ek-badge-border: var(--ek-color-error-border);
}

.ek-badge--info {
  --ek-badge-fill: var(--ek-color-info);
  --ek-badge-on-fill: var(--ek-color-info-contrast);
  --ek-badge-subtle: var(--ek-color-info-subtle);
  --ek-badge-emphasis: var(--ek-color-info-emphasis);
  --ek-badge-border: var(--ek-color-info-border);
}

.ek-badge--neutral {
  --ek-badge-fill: var(--ek-color-neutral);
  --ek-badge-on-fill: var(--ek-color-neutral-contrast);
  --ek-badge-subtle: var(--ek-color-neutral-subtle);
  --ek-badge-emphasis: var(--ek-color-neutral-emphasis);
  --ek-badge-border: var(--ek-color-neutral-border);
}
</style>
