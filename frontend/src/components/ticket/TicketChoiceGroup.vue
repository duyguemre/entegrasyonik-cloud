<!--
  frontend/src/components/ticket/TicketChoiceGroup.vue

  A6a — kart/segment seçici (talep tipi + öncelik). Semantik: `role="radiogroup"` + `role="radio"` kartlar,
  yuvarlanan tabindex (yalnız seçili kart Tab durağı), ok tuşları / Home / End ile gezinme (seçimi de taşır —
  yerel radyo davranışı), Boşluk/Enter seçer. Seçim YALNIZ renkle belli edilmez: onay işareti + kalın çerçeve +
  `aria-checked`. İkon kapsülü (EkIconTile) dekoratiftir; anlamı etiket + açıklama taşır.
  `layout="cards"`: tip kartları (3 → 2 → 1 sütun); `layout="segments"`: öncelik (4 → 2 sütun).
-->
<template>
  <div
    class="tk-choice"
    :class="`tk-choice--${layout}`"
    role="radiogroup"
    :aria-labelledby="labelledby"
    :aria-disabled="disabled || undefined"
  >
    <button
      v-for="(opt, i) in options"
      :key="opt.value"
      :ref="(el) => setRef(el, i)"
      type="button"
      role="radio"
      class="tk-choice__item"
      :class="{ 'is-selected': opt.value === modelValue }"
      :aria-checked="opt.value === modelValue"
      :tabindex="i === tabIndexFor ? 0 : -1"
      :disabled="disabled"
      @click="select(opt.value)"
      @keydown="onKey($event, i)"
    >
      <EkIconTile :icon="opt.icon" :tone="opt.tone ?? 'neutral'" size="sm" class="tk-choice__tile" />
      <span class="tk-choice__text">
        <span class="tk-choice__label">{{ opt.label }}</span>
        <span class="tk-choice__desc">{{ opt.description }}</span>
      </span>
      <v-icon v-if="opt.value === modelValue" icon="mdi-check-circle-outline" class="tk-choice__check" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick } from 'vue'
import { EkIconTile, type EkTone } from '@entegrasyonik/ui/components'
import { nextRadioIndex } from './composables/ticketRules'

export interface ChoiceOption {
  value: string
  label: string
  description: string
  icon: string
  tone?: EkTone
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    options: ChoiceOption[]
    /** Grup adını veren başlık öğesinin kimliği. */
    labelledby: string
    layout?: 'cards' | 'segments'
    disabled?: boolean
  }>(),
  { layout: 'cards', disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const refs: Array<HTMLElement | null> = []
function setRef(el: unknown, i: number) {
  refs[i] = (el as HTMLElement | null) ?? null
}

const tabIndexFor = computed(() => {
  const i = props.options.findIndex((o) => o.value === props.modelValue)
  return i >= 0 ? i : 0
})

function select(value: string) {
  if (!props.disabled && value !== props.modelValue) emit('update:modelValue', value)
}

async function onKey(e: KeyboardEvent, index: number) {
  const next = nextRadioIndex(e.key, index, props.options.length)
  if (next === null) return
  e.preventDefault()
  select(props.options[next].value)
  await nextTick()
  refs[next]?.focus()
}
</script>

<style scoped>
.tk-choice {
  display: grid;
  gap: var(--ek-space-3);
}

.tk-choice--cards {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.tk-choice--segments {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.tk-choice__item {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
  min-width: 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.tk-choice__item:hover:not(:disabled) {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-muted);
}

.tk-choice__item:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.tk-choice__item.is-selected {
  border-color: var(--ek-color-action);
  background: var(--ek-color-action-subtle);
  box-shadow: inset 0 0 0 1px var(--ek-color-action);
}

.tk-choice__item.is-selected:focus-visible {
  box-shadow: inset 0 0 0 1px var(--ek-color-action), var(--ek-focus-ring);
}

.tk-choice__item:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.tk-choice__text {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
  flex: 1;
  padding-right: var(--ek-space-5);
}

.tk-choice__label {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-type-subheading-weight);
  overflow-wrap: anywhere;
}

.tk-choice__desc {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  overflow-wrap: anywhere;
}

.tk-choice__check {
  position: absolute;
  top: var(--ek-space-2);
  right: var(--ek-space-2);
  color: var(--ek-color-action);
  font-size: var(--ek-icon-md);
}

@media (max-width: 720px) {
  .tk-choice--cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .tk-choice--segments {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .tk-choice--cards {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tk-choice__item {
    transition: none;
  }
}
</style>
