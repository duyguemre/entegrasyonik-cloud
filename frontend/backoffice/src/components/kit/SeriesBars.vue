<!--
  SeriesBars — zaman serisi için sade yığılmış sütun grafiği (ör. saatlik işlenen + başarısız). SVG `role=img` +
  özet etiketi; "Tablo olarak göster" ile aynı veri erişilebilir tabloda. Boş kova çizilmez; ölçek 0 tabanlı.
-->
<template>
  <figure class="bo-series">
    <figcaption class="bo-series__head">
      <span class="bo-series__legend">
        <span v-for="s in series" :key="s.key" class="bo-series__key"><span class="bo-series__swatch" :class="`is-${s.tone}`" aria-hidden="true"></span>{{ s.label }}</span>
      </span>
      <button type="button" class="bo-series__toggle" :aria-expanded="showTable" @click="showTable = !showTable">
        {{ showTable ? 'Grafiği göster' : 'Tablo olarak göster' }}
      </button>
    </figcaption>
    <template v-if="!showTable">
      <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" role="img" :aria-label="summary">
        <line class="bo-series__base" x1="0" :x2="W" :y1="H - 0.5" :y2="H - 0.5" />
        <g v-for="(p, i) in points" :key="p.t">
          <rect class="bo-series__hit" :x="i * step" y="0" :width="step" :height="H" />
          <rect v-for="seg in stack(p)" :key="seg.key" class="bo-series__bar" :class="`is-${seg.tone}`" :x="i * step + gap / 2" :y="seg.y" :width="barW" :height="seg.h" rx="1.5" />
          <title>{{ tick(p.t, true) }} · {{ series.map((s) => `${s.label}: ${p.values[s.key] ?? 0}`).join(' · ') }}</title>
        </g>
      </svg>
      <div class="bo-series__axis" aria-hidden="true">
        <span>{{ points.length ? tick(points[0].t) : '' }}</span>
        <span>{{ points.length ? tick(points[points.length - 1].t) : '' }}</span>
      </div>
    </template>
    <div v-else class="bo-series__table">
      <table>
        <caption class="ek-sr-only">{{ label }}</caption>
        <thead>
          <tr><th scope="col">Zaman</th><th v-for="s in series" :key="s.key" scope="col">{{ s.label }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in points" :key="p.t"><th scope="row">{{ tick(p.t, true) }}</th><td v-for="s in series" :key="s.key" class="ek-num">{{ p.values[s.key] ?? 0 }}</td></tr>
        </tbody>
      </table>
    </div>
  </figure>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

export interface SeriesDef {
  key: string
  label: string
  tone: 'action' | 'error' | 'warning' | 'neutral'
}
export interface SeriesPoint {
  t: string
  values: Record<string, number>
}
const props = withDefaults(defineProps<{ points: SeriesPoint[]; series: SeriesDef[]; label: string; bucket?: 'hour' | 'day'; height?: number }>(), { bucket: 'hour', height: 120 })
const W = 600
const H = computed(() => props.height)
const gap = 2
const showTable = ref(false)
const step = computed(() => W / Math.max(1, props.points.length))
const barW = computed(() => Math.max(1, step.value - gap))
const total = (p: SeriesPoint) => props.series.reduce((s, d) => s + (p.values[d.key] ?? 0), 0)
const max = computed(() => Math.max(1, ...props.points.map(total)))
const summary = computed(() => {
  const sums = props.series.map((s) => `${s.label} toplam ${props.points.reduce((a, p) => a + (p.values[s.key] ?? 0), 0)}`).join(', ')
  return `${props.label}: ${props.points.length} kova; ${sums}`
})
function stack(p: SeriesPoint) {
  let y = H.value
  return props.series
    .map((s) => {
      const v = p.values[s.key] ?? 0
      if (!v) return null
      const h = Math.max(2, (v / max.value) * (H.value - 6))
      y -= h
      return { key: s.key, tone: s.tone, y, h }
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
}
function tick(t: string, full = false) {
  const d = new Date(t)
  if (props.bucket === 'day') return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' }).format(d)
  return new Intl.DateTimeFormat('tr-TR', full ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' }).format(d)
}
</script>

<style scoped>
.bo-series {
  margin: 0;
}
.bo-series__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
  margin-bottom: var(--ek-space-2);
}
.bo-series__legend {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-series__key {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.bo-series__swatch {
  width: 10px;
  height: 10px;
  border-radius: var(--ek-radius-sm);
}
.bo-series__toggle {
  padding: 2px var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-action);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  cursor: pointer;
}
.bo-series__toggle:hover {
  text-decoration: underline;
}
.bo-series__toggle:focus-visible {
  outline: 2px solid var(--ek-color-border-focus);
  outline-offset: 1px;
}
svg {
  display: block;
  width: 100%;
  height: v-bind('`${H}px`');
}
.bo-series__base {
  stroke: var(--ek-color-border-default);
  stroke-width: 1px;
  vector-effect: non-scaling-stroke;
}
.bo-series__hit {
  fill: transparent;
}
g:hover .bo-series__hit {
  fill: var(--ek-color-surface-muted);
}
.is-action {
  fill: var(--ek-color-action);
  background: var(--ek-color-action);
}
.is-error {
  fill: var(--ek-color-error);
  background: var(--ek-color-error);
}
.is-warning {
  fill: var(--ek-color-warning);
  background: var(--ek-color-warning);
}
.is-neutral {
  fill: var(--ek-color-content-subtle);
  background: var(--ek-color-content-subtle);
}
.bo-series__axis {
  display: flex;
  justify-content: space-between;
  margin-top: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}
.bo-series__table {
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
}
.bo-series__table table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ek-type-label-size);
}
.bo-series__table th,
.bo-series__table td {
  padding: 4px var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  text-align: left;
}
.bo-series__table thead th {
  position: sticky;
  top: 0;
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-medium);
}
.bo-series__table td {
  text-align: right;
}
</style>
