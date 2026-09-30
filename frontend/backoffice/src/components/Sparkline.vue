<template>
  <svg class="bo-spark" :class="`is-${tone}`" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="label">
    <path v-if="area" class="bo-spark__area" :d="area" />
    <path v-if="line" class="bo-spark__line" :d="line" vector-effect="non-scaling-stroke" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ values: number[]; label: string; tone?: 'action' | 'error' | 'warning' | 'neutral' }>(), { tone: 'action' })
const W = 100
const H = 28

const pts = computed(() => {
  const v = props.values
  if (v.length < 2) return []
  const max = Math.max(1, ...v)
  return v.map((y, i) => [(i / (v.length - 1)) * W, H - 2 - (y / max) * (H - 4)] as const)
})
const line = computed(() => pts.value.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(''))
const area = computed(() => (pts.value.length ? `${line.value}L${W} ${H}L0 ${H}Z` : ''))
</script>

<style scoped>
.bo-spark {
  display: block;
  width: 100%;
  height: 28px;
  overflow: visible;
  --bo-spark: var(--ek-color-action);
}
.bo-spark.is-error {
  --bo-spark: var(--ek-color-error);
}
.bo-spark.is-warning {
  --bo-spark: var(--ek-color-warning);
}
.bo-spark.is-neutral {
  --bo-spark: var(--ek-color-content-subtle);
}
.bo-spark__line {
  fill: none;
  stroke: var(--bo-spark);
  stroke-width: 2px;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.bo-spark__area {
  fill: color-mix(in srgb, var(--bo-spark) 14%, transparent);
}
</style>
