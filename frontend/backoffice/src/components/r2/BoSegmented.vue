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

<style scoped>
/* ================= BO-LOCAL-01 — segment seçici: uygulamanın tasarım diliyle =================
   Müşteri uygulamasındaki Liste | Özet anahtarıyla AYNI görünüm: beyaz yüzey + ince çerçeve, etkin seçenek eylem
   renginin açık tonu + eylem metni (yükseltilmiş beyaz hap ve gölge yok). Sayaç köşeli küçük rozet. */
.bo-seg {
  gap: 2px;
  padding: 2px;
  border-color: var(--ek-color-border-input);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
}

.bo-seg__opt {
  height: 28px;
  padding: 0 var(--ek-space-3);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-default);
}

.bo-seg__opt .v-icon {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
}

.bo-seg__opt:hover:not(:disabled) {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.bo-seg__opt[aria-checked='true'],
.bo-seg__opt[aria-checked='true']:hover {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-weight: var(--ek-font-weight-semibold);
  box-shadow: none;
}

.bo-seg__opt[aria-checked='true'] .v-icon,
.bo-seg__opt[aria-checked='true'] .bo-seg__count {
  color: var(--ek-color-action-emphasis);
}

.bo-seg__opt:focus-visible {
  box-shadow: var(--ek-focus-ring);
}

.bo-seg__count {
  font-weight: var(--ek-font-weight-semibold);
}
</style>
