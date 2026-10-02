<!--
  frontend/src/components/productDefinitions/crud/ProductFormStepFooter.vue

  Ürün sihirbazı adım altbilgisi: "Geri" / "Devam". Eskiden adımdan adıma yalnızca üstteki adım
  başlıklarına tıklanarak geçiliyordu; klavye ve mobil kullanıcı için ardışık gezinti eklendi.
  Sonraki adım kilitliyse "Devam" kapalıdır ve nedeni yanında yazılır (aria-describedby).
  Not: metinler bilerek adım adlarını (Ürün Tanımı vb.) içermez — adım adları yalnız şeritte geçer.
  FE R4 B: ortada konum göstergesi (4 nokta + "n / 4", dekoratif — adım bilgisi şeritte `aria-current` ile okunur);
  altbilgi sihirbaz sütununda ince bir ayraçla içerikten ayrılır.
  FE R5 B: içerik sütununun sonunda sakin bir çubuk (soluk zemin, ince kenarlık) — bölüm kartlarından ayrışır.
-->
<template>
  <div class="pfs" role="group" aria-label="Adım gezintisi">
    <EkButton v-if="current > 0" tone="secondary" icon="mdi-arrow-left" @click="go(current - 1)">Geri</EkButton>
    <span v-else class="pfs__spacer" aria-hidden="true"></span>
    <span class="pfs__pos ek-num" aria-hidden="true">
      <span v-for="i in 4" :key="i" class="pfs__dot" :class="{ 'is-on': i - 1 === current, 'is-past': i - 1 < current }"></span>
      <span class="pfs__pos-text">{{ current + 1 }} / 4</span>
    </span>
    <span class="pfs__end">
      <template v-if="current < 3">
        <span v-if="nextLockedReason" :id="`${uid}-why`" class="pfs__why">{{ nextLockedReason }}</span>
        <EkButton tone="secondary" trailing-icon="mdi-arrow-right" :disabled="!!nextLockedReason" :aria-describedby="nextLockedReason ? `${uid}-why` : undefined" @click="go(current + 1)">Devam</EkButton>
      </template>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'
import { evaluateProductForm, type StepIndex } from '@/composables/useProductFormProgress'

const props = defineProps<{ form: any; current: number }>()
const emit = defineEmits<{ navigate: [payload: { step: StepIndex }] }>()
const uid = useId()

const nextLockedReason = computed(() => {
  const next = evaluateProductForm(props.form).steps[props.current + 1]
  return next?.locked ? next.lockedReason : undefined
})

function go(step: number) {
  emit('navigate', { step: step as StepIndex })
}
</script>

<style scoped>
.pfs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: var(--ek-space-3);
  margin-top: var(--ek-space-5);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
}

.pfs > :first-child {
  justify-self: start;
}

.pfs__end {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-3);
  min-width: 0;
}

.pfs__pos {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.pfs__dot {
  width: 6px;
  height: 6px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-border-strong);
  transition: background-color var(--ek-motion-feedback), transform var(--ek-motion-feedback);
}

.pfs__dot.is-past {
  background: var(--ek-color-success);
  opacity: 0.55;
}

.pfs__dot.is-on {
  background: var(--ek-color-action);
  transform: scale(1.5);
}

.pfs__pos-text {
  margin-left: var(--ek-space-2);
}

.pfs__why {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  text-align: right;
}

@media (max-width: 599px) {
  .pfs {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .pfs__pos {
    grid-column: 1 / -1;
    grid-row: 1;
    justify-content: center;
  }

  .pfs__end {
    flex-wrap: wrap;
  }

  .pfs__why {
    order: 2;
    width: 100%;
    text-align: right;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pfs__dot {
    transition: none;
  }
}
</style>
