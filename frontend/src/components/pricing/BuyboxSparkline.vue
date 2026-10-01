<!--
  PRC-R1 — 30 günlük mini grafik: buybox fiyatı (kesikli) ve fiyatım (düz) iki çizgi. Hafif SVG; grafik kütüphanesi YOK.
  Çizgiler renk + çizgi stiliyle ayrışır (renge yalnız bağlı değil), özet metni ekran okuyucuya verilir. Boş veri: boş durum.
-->
<template>
  <figure class="bsp" :aria-label="t('pricing.chart.title', { days })">
    <p v-if="loading" class="bsp__state" role="status">{{ t('pricing.chart.loading') }}</p>
    <p v-else-if="error" class="bsp__state" role="alert">
      {{ t('pricing.chart.error') }} <button type="button" class="bsp__retry" @click="emit('retry')">{{ t('pricing.retry') }}</button>
    </p>
    <p v-else-if="!model.hasData" class="bsp__state" data-testid="chart-empty">{{ t('pricing.chart.empty') }}</p>
    <template v-else>
      <svg :viewBox="`0 0 ${W} ${H}`" class="bsp__svg" role="img" :aria-label="summary">
        <path v-if="model.buybox.d" :d="model.buybox.d" class="bsp__line bsp__line--buybox" />
        <path v-if="model.own.d" :d="model.own.d" class="bsp__line bsp__line--own" />
        <circle v-if="model.buybox.last" :cx="model.buybox.last.x" :cy="model.buybox.last.y" r="2.5" class="bsp__dot bsp__dot--buybox" />
        <circle v-if="model.own.last" :cx="model.own.last.x" :cy="model.own.last.y" r="2.5" class="bsp__dot bsp__dot--own" />
      </svg>
      <figcaption class="bsp__legend">
        <span class="bsp__key"><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" class="bsp__line bsp__line--buybox" /></svg>{{ t('pricing.chart.buybox') }}</span>
        <span class="bsp__key"><svg width="22" height="8" aria-hidden="true"><line x1="0" y1="4" x2="22" y2="4" class="bsp__line bsp__line--own" /></svg>{{ t('pricing.chart.own') }}</span>
        <span class="bsp__range ek-num">{{ formatMoney(model.min) }} – {{ formatMoney(model.max) }}</span>
      </figcaption>
    </template>
  </figure>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMoney } from '@entegrasyonik/ui/format'
import { sparkModel, type HistoryPoint } from '@/composables/usePricingApi'

const props = withDefaults(defineProps<{ points: HistoryPoint[]; loading?: boolean; error?: boolean; days?: number }>(), { days: 30 })
const emit = defineEmits<{ retry: [] }>()
const { t } = useI18n()
const W = 320
const H = 64
const model = computed(() => sparkModel(props.points, W, H))
const summary = computed(() => t('pricing.chart.summary', { days: props.days, min: formatMoney(model.value.min), max: formatMoney(model.value.max), count: model.value.points }))
</script>

<style scoped>
.bsp { margin: 0; display: flex; flex-direction: column; gap: var(--ek-space-2); max-width: 560px; }
.bsp__svg { width: 100%; height: auto; display: block; }
.bsp__line { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.bsp__line--buybox { stroke: var(--ek-color-warning-emphasis); stroke-dasharray: 5 3; }
.bsp__line--own { stroke: var(--ek-color-action); }
.bsp__dot--buybox { fill: var(--ek-color-warning-emphasis); }
.bsp__dot--own { fill: var(--ek-color-action); }
.bsp__legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--ek-space-1) var(--ek-space-4); color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }
.bsp__key { display: inline-flex; align-items: center; gap: var(--ek-space-2); }
.bsp__range { margin-left: auto; }
.bsp__state { margin: 0; color: var(--ek-color-content-muted); font-size: var(--ek-type-caption-size); line-height: var(--ek-type-caption-line); }
.bsp__retry { color: var(--ek-color-action); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; border-radius: var(--ek-radius-control); }
.bsp__retry:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
</style>
