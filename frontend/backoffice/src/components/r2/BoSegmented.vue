<!--
  BoSegmented — TEK SEÇİMLİ FİLTRE / GÖRÜNÜM SEGMENTİ (BO2-41). `.bo-seg` işaretlemesinin tek bileşeni: radiogroup,
  ←/→ ile gezinme, sayaç rozeti, aynı yükseklik (38 px, compact alanlarla aynı göz hizası; dokunmatikte 44 px).

    <BoSegmented v-model="level" :options="[{ value: 'all', label: 'Tümü', count: 40 }, …]" label="Seviye" />
-->
<template>
  <div ref="root" class="bo-seg" role="radiogroup" :aria-label="label" data-bo-segmented>
    <button
      v-for="(o, i) in options"
      :key="String(o.value)"
      type="button"
      role="radio"
      class="bo-seg__opt"
      :aria-checked="o.value === modelValue"
      :tabindex="o.value === modelValue || (activeIndex < 0 && i === 0) ? 0 : -1"
      :disabled="o.disabled"
      :data-value="o.value"
      @click="select(o.value)"
      @keydown="onKey($event, i)"
    >
      <v-icon v-if="o.icon" :icon="o.icon" aria-hidden="true" />{{ o.label }}<span v-if="o.count !== undefined && o.count !== null" class="bo-seg__count ek-num">{{ o.count }}</span>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number | null">
import { computed, nextTick, ref } from 'vue'

export interface BoSegmentOption<V> {
  value: V
  label: string
  icon?: string
  count?: number | string | null
  disabled?: boolean
}

const props = defineProps<{ modelValue: T; options: Array<BoSegmentOption<T>>; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [v: T] }>()
const root = ref<HTMLElement>()
const activeIndex = computed(() => props.options.findIndex((o) => o.value === props.modelValue))

function select(v: T) {
  if (v !== props.modelValue) emit('update:modelValue', v)
}

function onKey(e: KeyboardEvent, i: number) {
  const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
  if (!step) return
  e.preventDefault()
  const n = props.options.length
  let j = i
  for (let k = 0; k < n; k++) {
    j = (j + step + n) % n
    if (!props.options[j].disabled) break
  }
  select(props.options[j].value)
  void nextTick(() => root.value?.querySelectorAll<HTMLButtonElement>('.bo-seg__opt')[j]?.focus())
}
</script>
