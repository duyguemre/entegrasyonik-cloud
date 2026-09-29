<!--
  frontend/src/components/ds/EkFormGrid.vue

  DS-v2 — form/filtre alan ızgarası. Alanların İÇ İÇE GEÇMESİNİ/üst üste
  binmesini önleyen TEK yerleşim: eşit kolonlar, sabit boşluk
  (satır 16 · kolon 16), her alan kendi hücresinde `min-width: 0`.
  `columns` masaüstündeki kolon sayısıdır; tablette en fazla 2, mobilde 1.
  Bir alanı genişletmek için alan kökünde `class="ek-span-2"` (veya `ek-span-full`).
-->
<template>
  <div class="ek-form-grid" :class="`ek-form-grid--${columns}`">
    <slot />
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ columns?: 1 | 2 | 3 | 4 }>(), { columns: 2 })
</script>

<style scoped>
.ek-form-grid {
  display: grid;
  grid-template-columns: repeat(var(--ek-form-cols, 2), minmax(0, 1fr));
  gap: var(--ek-space-4);
  align-items: start;
}

.ek-form-grid > :deep(*) {
  min-width: 0;
}

.ek-form-grid--1 {
  --ek-form-cols: 1;
}

.ek-form-grid--2 {
  --ek-form-cols: 2;
}

.ek-form-grid--3 {
  --ek-form-cols: 3;
}

.ek-form-grid--4 {
  --ek-form-cols: 4;
}

.ek-form-grid > :deep(.ek-span-2) {
  grid-column: span 2;
}

.ek-form-grid > :deep(.ek-span-full) {
  grid-column: 1 / -1;
}

@media (max-width: 1023px) {
  .ek-form-grid--3,
  .ek-form-grid--4 {
    --ek-form-cols: 2;
  }
}

@media (max-width: 767px) {
  .ek-form-grid {
    --ek-form-cols: 1;
  }

  .ek-form-grid > :deep(.ek-span-2) {
    grid-column: 1 / -1;
  }
}
</style>
