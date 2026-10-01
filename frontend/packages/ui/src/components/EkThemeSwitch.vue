<!--
  EkThemeSwitch — tema tercihi segment kontrolü (FR2-DARK, ADR-0026 Karar 3.5): Açık / Koyu / Sistem.
  ARIA radio grubu: ok tuşları seçimi değiştirir (odak seçiliyle birlikte gezer), Tab grubu tek durak olarak geçer.
  Yalnız token; durum bilgisi `v-model` ile uygulamadan gelir (paket tercih deposuna bağlanmaz).
-->
<template>
  <div class="ek-theme-switch" data-testid="theme-switch">
    <span :id="labelId" class="ek-theme-switch__label">{{ label }}</span>
    <div class="ek-theme-switch__group" role="radiogroup" :aria-labelledby="labelId" @keydown="onKeydown">
      <button
        v-for="(opt, i) in OPTIONS"
        :key="opt.value"
        :ref="(el) => (buttons[i] = el as HTMLButtonElement | null)"
        type="button"
        role="radio"
        class="ek-theme-switch__opt"
        :class="{ 'is-active': modelValue === opt.value }"
        :aria-checked="modelValue === opt.value"
        :tabindex="modelValue === opt.value ? 0 : -1"
        :data-theme-option="opt.value"
        @click="select(opt.value)"
      >
        <v-icon :icon="opt.icon" size="16" aria-hidden="true" />
        <span>{{ opt.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue'
import type { ThemePreference } from '../theme/themePreference'

const props = withDefaults(defineProps<{ modelValue: ThemePreference; label?: string }>(), { label: 'Görünüm' })
const emit = defineEmits<{ 'update:modelValue': [value: ThemePreference] }>()

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: string }> = [
  { value: 'light', label: 'Açık', icon: 'mdi-white-balance-sunny' },
  { value: 'dark', label: 'Koyu', icon: 'mdi-weather-night' },
  { value: 'system', label: 'Sistem', icon: 'mdi-monitor' },
]

const labelId = `ek-theme-switch-${useId()}`
const buttons = ref<Array<HTMLButtonElement | null>>([])

function select(value: ThemePreference) {
  if (value !== props.modelValue) emit('update:modelValue', value)
}

function onKeydown(e: KeyboardEvent) {
  const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
  if (!delta) return
  e.preventDefault()
  const current = OPTIONS.findIndex((o) => o.value === props.modelValue)
  const next = (current + delta + OPTIONS.length) % OPTIONS.length
  select(OPTIONS[next].value)
  buttons.value[next]?.focus()
}
</script>

<style scoped>
.ek-theme-switch {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
}

.ek-theme-switch__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-type-label-weight);
}

.ek-theme-switch__group {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ek-space-1);
  padding: var(--ek-space-1);
  background: var(--ek-color-surface-sunken);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-control);
}

.ek-theme-switch__opt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-1);
  min-height: 32px;
  padding: 0 var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: 500;
  background: transparent;
  border: 1px solid transparent;
  border-radius: calc(var(--ek-radius-control) - 2px);
  cursor: pointer;
  transition:
    background-color var(--ek-motion-feedback),
    color var(--ek-motion-feedback);
}

.ek-theme-switch__opt:hover {
  color: var(--ek-color-content-strong);
}

.ek-theme-switch__opt.is-active {
  color: var(--ek-color-content-strong);
  background: var(--ek-color-surface-raised);
  border-color: var(--ek-color-border-default);
  box-shadow: var(--ek-shadow-card);
}

.ek-theme-switch__opt:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}
</style>
