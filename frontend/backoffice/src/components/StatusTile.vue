<template>
  <article class="bo-status" :class="`is-${state}`" :aria-busy="state === 'loading' || undefined">
    <header class="bo-status__head">
      <EkIconTile :icon="icon" :tone="tileTone" size="sm" />
      <h3 class="bo-status__label">{{ label }}</h3>
      <span class="bo-status__state">
        <v-icon :icon="STATE[state].icon" aria-hidden="true" />{{ STATE[state].text }}
      </span>
    </header>
    <p class="bo-status__value">
      <span v-if="state === 'loading'" class="bo-status__skeleton" aria-hidden="true"></span>
      <template v-else>{{ value }}</template>
    </p>
    <p class="bo-status__detail">{{ state === 'loading' ? 'Kontrol ediliyor…' : detail }}</p>
    <p v-if="source" class="bo-status__source">{{ source }}</p>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkIconTile, type EkTone } from '@entegrasyonik/ui/components'

export type TileState = 'ok' | 'degraded' | 'fail' | 'unknown' | 'loading'
const props = defineProps<{ label: string; icon: string; state: TileState; value: string; detail: string; source?: string }>()

const STATE: Record<TileState, { text: string; icon: string }> = {
  ok: { text: 'Sağlıklı', icon: 'mdi-check-circle' },
  degraded: { text: 'Yavaşladı', icon: 'mdi-alert' },
  fail: { text: 'Erişilemiyor', icon: 'mdi-close-circle' },
  unknown: { text: 'Bilinmiyor', icon: 'mdi-help-circle-outline' },
  loading: { text: 'Kontrol', icon: 'mdi-dots-horizontal' },
}
const tileTone = computed<EkTone>(() => ({ ok: 'success', degraded: 'warning', fail: 'error', unknown: 'neutral', loading: 'neutral' } as const)[props.state] as EkTone)
</script>

<style scoped>
.bo-status {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}
.bo-status.is-fail {
  border-color: var(--ek-color-error-border);
  box-shadow: inset 3px 0 0 var(--ek-color-error), var(--ek-shadow-card);
}
.bo-status.is-degraded {
  border-color: var(--ek-color-warning-border);
  box-shadow: inset 3px 0 0 var(--ek-color-warning), var(--ek-shadow-card);
}
.bo-status__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}
.bo-status__label {
  flex: 1;
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  font-weight: var(--ek-type-subheading-weight);
}
.bo-status__state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: var(--ek-app-chip-h-sm);
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-neutral-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-neutral-subtle);
  color: var(--ek-color-neutral-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-status__state :deep(.v-icon) {
  font-size: var(--ek-icon-xs);
}
.is-ok .bo-status__state {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
}
.is-degraded .bo-status__state {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}
.is-fail .bo-status__state {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}
.bo-status__value {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  font-weight: var(--ek-font-weight-semibold);
  font-variant-numeric: tabular-nums;
}
.bo-status__skeleton {
  display: inline-block;
  width: 96px;
  height: 18px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}
.bo-status__detail,
.bo-status__source {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}
.bo-status__source {
  margin-top: auto;
  padding-top: var(--ek-space-2);
  border-top: 1px solid var(--ek-color-border-subtle);
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
}
</style>
