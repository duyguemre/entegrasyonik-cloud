<!--
  frontend/src/components/ds/EkButton.vue

  DS-v2 — düğme. Dört ton, tek yükseklik ölçeği (`--ek-control-h-*`):
    primary   — ekranın TEK ana işi (Sorgula, Kaydet, Güncelle). Aksiyon rengi dolgu.
    secondary — ikincil iş (Temizle, Vazgeç). Nötr yüzey + çerçeve.
    ghost     — üçüncül/araç çubuğu işi. Zeminsiz; hover'da hafif zemin.
    danger    — yıkıcı iş. YALNIZCA onay diyaloğunun son adımında dolgu.
  Durumlar: hover / active / focus-visible (odak halkası) / disabled / loading.
  `forceState` yalnızca geliştirme vitrini içindir (durumları statik göstermek).

  Kullanım:
    <EkButton tone="primary" icon="mdi-magnify" @click="query">Sorgula</EkButton>
    <EkButton tone="secondary" icon="mdi-filter-remove-outline">Temizle</EkButton>
    <EkButton tone="ghost" icon="mdi-dots-horizontal" icon-only aria-label="Diğer işlemler" />
-->
<template>
  <button
    :type="type"
    class="ek-btn"
    :class="[
      `ek-btn--${tone}`,
      `ek-btn--${size}`,
      {
        'ek-btn--icon-only': iconOnly,
        'ek-btn--block': block,
        'is-loading': loading,
        [`is-${forceState}`]: !!forceState,
      },
    ]"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="ek-btn__spinner" aria-hidden="true">
      <v-progress-circular indeterminate :size="spinnerSize" :width="2" />
    </span>
    <v-icon v-else-if="icon" class="ek-btn__icon" :icon="icon" aria-hidden="true" />
    <span v-if="!iconOnly" class="ek-btn__label"><slot /></span>
    <v-icon v-if="trailingIcon && !iconOnly" class="ek-btn__icon" :icon="trailingIcon" aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    tone?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'sm' | 'md'
    icon?: string
    trailingIcon?: string
    iconOnly?: boolean
    loading?: boolean
    disabled?: boolean
    block?: boolean
    type?: 'button' | 'submit' | 'reset'
    forceState?: 'hover' | 'active' | 'focus'
  }>(),
  { tone: 'secondary', size: 'md', type: 'button' },
)

const spinnerSize = computed(() => (props.size === 'sm' ? 14 : 16))
</script>

<style scoped>
.ek-btn {
  --ek-btn-bg: var(--ek-color-surface);
  --ek-btn-fg: var(--ek-color-content-strong);
  --ek-btn-border: var(--ek-color-border-strong);
  --ek-btn-bg-hover: var(--ek-color-surface-muted);
  --ek-btn-bg-active: var(--ek-color-surface-sunken);
  --ek-btn-border-hover: var(--ek-color-border-input);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-2);
  height: var(--ek-control-h-md);
  padding: 0 var(--ek-space-4);
  border: 1px solid var(--ek-btn-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-btn-bg);
  color: var(--ek-btn-fg);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition: var(--ek-transition-colors);
}

.ek-btn__icon {
  font-size: var(--ek-icon-md);
}

.ek-btn--sm {
  height: var(--ek-control-h-sm);
  padding: 0 var(--ek-space-3);
  gap: var(--ek-space-1);
  font-size: var(--ek-type-caption-size);
}

.ek-btn--sm .ek-btn__icon {
  font-size: var(--ek-icon-sm);
}

.ek-btn--icon-only {
  width: var(--ek-control-h-md);
  padding: 0;
}

.ek-btn--icon-only.ek-btn--sm {
  width: var(--ek-control-h-sm);
}

.ek-btn--block {
  width: 100%;
}

.ek-btn--primary {
  --ek-btn-bg: var(--ek-color-action);
  --ek-btn-fg: var(--ek-color-action-contrast);
  --ek-btn-border: var(--ek-color-action);
  --ek-btn-bg-hover: var(--ek-color-action-hover);
  --ek-btn-bg-active: var(--ek-color-action-active);
  --ek-btn-border-hover: var(--ek-color-action-hover);
  box-shadow: var(--ek-shadow-card);
}

.ek-btn--ghost {
  --ek-btn-bg: transparent;
  --ek-btn-fg: var(--ek-color-content-default);
  --ek-btn-border: transparent;
  --ek-btn-bg-hover: var(--ek-color-surface-sunken);
  --ek-btn-bg-active: var(--ek-color-border-subtle);
  --ek-btn-border-hover: transparent;
}

.ek-btn--danger {
  --ek-btn-bg: var(--ek-color-error);
  --ek-btn-fg: var(--ek-color-error-contrast);
  --ek-btn-border: var(--ek-color-error);
  --ek-btn-bg-hover: var(--ek-color-error-emphasis);
  --ek-btn-bg-active: var(--ek-color-error-emphasis);
  --ek-btn-border-hover: var(--ek-color-error-emphasis);
}

.ek-btn:hover:not(:disabled),
.ek-btn.is-hover {
  background: var(--ek-btn-bg-hover);
  border-color: var(--ek-btn-border-hover);
}

.ek-btn:active:not(:disabled),
.ek-btn.is-active {
  background: var(--ek-btn-bg-active);
  border-color: var(--ek-btn-border-hover);
}

.ek-btn:focus-visible,
.ek-btn.is-focus {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-btn:disabled {
  cursor: not-allowed;
}

.ek-btn:disabled:not(.is-loading) {
  --ek-btn-bg: var(--ek-color-surface-sunken);
  --ek-btn-fg: var(--ek-color-content-subtle);
  --ek-btn-border: var(--ek-color-border-subtle);
  box-shadow: none;
}

.ek-btn--ghost:disabled:not(.is-loading) {
  --ek-btn-bg: transparent;
  --ek-btn-border: transparent;
}

.ek-btn.is-loading {
  cursor: progress;
}

.ek-btn__spinner {
  display: inline-flex;
}
</style>
