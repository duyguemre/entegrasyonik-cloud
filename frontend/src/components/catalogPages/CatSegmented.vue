<!--
  frontend/src/components/catalogPages/CatSegmented.vue

  B7 — küçük iki/üç seçenekli anahtar (Tümü | Eşlemesi eksik; Izgara | Liste). `role="radiogroup"` + ok tuşlarıyla
  gezinme (seçim odağı izler), tek sekme durağı. Seçili = yüzey + ince gölge (sekme şeridinin sakin dili).
-->
<template>
  <div class="cat-seg" role="radiogroup" :aria-label="label" @keydown="onKey">
    <button
      v-for="(o, i) in options"
      :key="o.value"
      ref="btns"
      type="button"
      role="radio"
      class="cat-seg__opt"
      :class="{ 'is-on': o.value === modelValue, 'is-icon': !!o.icon && o.iconOnly }"
      :aria-checked="o.value === modelValue"
      :aria-label="o.iconOnly ? o.label : undefined"
      :title="o.iconOnly ? o.label : undefined"
      :tabindex="o.value === modelValue ? 0 : -1"
      @click="pick(i)"
    >
      <v-icon v-if="o.icon" :icon="o.icon" size="16" aria-hidden="true" />
      <span v-if="!o.iconOnly">{{ o.label }}</span>
      <span v-if="o.count != null && !o.iconOnly" class="cat-seg__count ek-num">{{ o.count }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'

export interface CatSegOption {
  value: string
  label: string
  icon?: string
  iconOnly?: boolean
  count?: number | null
}

const props = defineProps<{ modelValue: string; options: CatSegOption[]; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const btns = ref<HTMLButtonElement[]>([])

function pick(i: number) {
  emit('update:modelValue', props.options[i].value)
}

function onKey(e: KeyboardEvent) {
  const cur = props.options.findIndex((o) => o.value === props.modelValue)
  const n = props.options.length
  let next = -1
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (cur + 1) % n
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (cur - 1 + n) % n
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = n - 1
  if (next < 0) return
  e.preventDefault()
  pick(next)
  nextTick(() => btns.value[next]?.focus())
}
</script>

<style scoped>
.cat-seg {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-sunken);
}

.cat-seg__opt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-1);
  height: 28px;
  padding: 0 var(--ek-space-3);
  border: 0;
  border-radius: calc(var(--ek-radius-control) - 2px);
  background: transparent;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  line-height: var(--ek-type-label-line);
  white-space: nowrap;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.cat-seg__opt.is-icon {
  width: 32px;
  padding: 0;
}

.cat-seg__opt:hover:not(.is-on) {
  color: var(--ek-color-content-strong);
}

.cat-seg__opt.is-on {
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  color: var(--ek-color-content-strong);
}

.cat-seg__opt:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.cat-seg__count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: 18px;
}

.cat-seg__opt.is-on .cat-seg__count {
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}
</style>
