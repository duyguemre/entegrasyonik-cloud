<!--
  frontend/src/components/productDefinitions/crud/ProductFormStepFooter.vue

  Ürün sihirbazı adım altbilgisi: "Geri" / "Devam". Eskiden adımdan adıma yalnızca üstteki adım
  başlıklarına tıklanarak geçiliyordu; klavye ve mobil kullanıcı için ardışık gezinti eklendi.
  Sonraki adım kilitliyse "Devam" kapalıdır ve nedeni yanında yazılır (aria-describedby).
  Not: metinler bilerek adım adlarını (Ürün Tanımı vb.) içermez — adım adları yalnız şeritte geçer.
-->
<template>
  <div class="pfs" role="group" aria-label="Adım gezintisi">
    <EkButton v-if="current > 0" tone="secondary" icon="mdi-arrow-left" @click="go(current - 1)">Geri</EkButton>
    <span v-else class="pfs__spacer" aria-hidden="true"></span>
    <template v-if="current < 3">
      <span v-if="nextLockedReason" :id="`${uid}-why`" class="pfs__why">{{ nextLockedReason }}</span>
      <EkButton tone="secondary" trailing-icon="mdi-arrow-right" :disabled="!!nextLockedReason" :aria-describedby="nextLockedReason ? `${uid}-why` : undefined" @click="go(current + 1)">Devam</EkButton>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import EkButton from '@/components/ds/EkButton.vue'
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  max-width: 1200px;
  margin: var(--ek-space-6) auto 0;
}

.pfs__why {
  margin-left: auto;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  text-align: right;
}

@media (max-width: 599px) {
  .pfs {
    flex-wrap: wrap;
  }

  .pfs__why {
    order: 3;
    width: 100%;
    margin-left: 0;
    text-align: left;
  }
}
</style>
