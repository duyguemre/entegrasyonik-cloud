<template>
  <figure class="bo-bars">
    <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="summary">
      <line class="bo-bars__base" x1="0" :x2="W" :y1="H - 0.5" :y2="H - 0.5" />
      <g v-for="(p, i) in points" :key="p.t">
        <rect class="bo-bars__hit" :x="i * step" y="0" :width="step" :height="H" />
        <path class="bo-bars__bar" :d="barPath(i, p.count)" />
        <title>{{ formatTick(p.t) }} · {{ p.count }} olay</title>
      </g>
    </svg>
    <figcaption class="bo-bars__axis">
      <span>{{ points.length ? formatTick(points[0].t) : '' }}</span>
      <span>{{ points.length ? formatTick(points[points.length - 1].t) : '' }}</span>
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ points: Array<{ t: string; count: number }>; bucket: 'hour' | 'day'; label: string }>()
const W = 600
const H = 96
const step = computed(() => W / Math.max(1, props.points.length))
const max = computed(() => Math.max(1, ...props.points.map((p) => p.count)))
const total = computed(() => props.points.reduce((s, p) => s + p.count, 0))
const summary = computed(() => `${props.label}: toplam ${total.value} olay, en yüksek kova ${max.value}`)

/** Taban çizgisine oturan, üstü 2px yuvarlatılmış çubuk; kovalar arası 2px boşluk. */
function barPath(i: number, count: number) {
  if (!count) return ''
  const gap = 2
  const w = Math.max(1, step.value - gap)
  const x = i * step.value + gap / 2
  const h = Math.max(2, (count / max.value) * (H - 6))
  const r = Math.min(2, w / 2, h)
  const y = H - h
  return `M${x} ${H}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${H}Z`
}

function formatTick(t: string) {
  const d = new Date(t)
  return props.bucket === 'day'
    ? new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' }).format(d)
    : new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(d)
}
</script>

<style scoped>
.bo-bars {
  margin: 0;
}
.bo-bars svg {
  display: block;
  width: 100%;
  height: 96px;
}
.bo-bars__base {
  stroke: var(--ek-color-border-default);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}
.bo-bars__hit {
  fill: transparent;
}
.bo-bars__bar {
  fill: var(--ek-color-action);
}
g:hover .bo-bars__bar {
  fill: var(--ek-color-action-hover);
}
g:hover .bo-bars__hit {
  fill: var(--ek-color-surface-muted);
}
.bo-bars__axis {
  display: flex;
  justify-content: space-between;
  margin-top: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
</style>
