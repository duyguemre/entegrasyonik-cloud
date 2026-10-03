<template>
  <svg class="bo-qr" :viewBox="`0 0 ${size} ${size}`" role="img" :aria-label="label" shape-rendering="crispEdges">
    <rect class="bo-qr__plate" :width="size" :height="size" />
    <path class="bo-qr__modules" :d="path" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { encode } from 'uqr'

const props = defineProps<{ value: string; label: string }>()

const qr = computed(() => encode(props.value, { ecc: 'M', border: 2 }))
const size = computed(() => qr.value.size)
const path = computed(() => {
  let d = ''
  qr.value.data.forEach((row, y) => row.forEach((on, x) => on && (d += `M${x} ${y}h1v1h-1z`)))
  return d
})
</script>

<style scoped>
/* Okuyucular için modüller her temada açık plaka üzerinde koyu kalır. */
.bo-qr {
  display: block;
  width: 184px;
  height: 184px;
  border-radius: var(--ek-radius-lg);
}
.bo-qr__plate {
  fill: var(--ek-color-surface);
}
.bo-qr__modules {
  fill: var(--ek-color-content-strong);
}
:global(.ek-dark) .bo-qr__plate {
  fill: var(--ek-color-content-strong);
}
:global(.ek-dark) .bo-qr__modules {
  fill: var(--ek-color-background);
}

/* BO-LOCAL-01 — QR plakası: kutu köşeli + ince çerçeve. */
.bo-qr {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
}
</style>
