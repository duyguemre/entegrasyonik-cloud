<!--
  BoChart — ORTAK GRAFİK SARMALAYICI (BO2-60). Vue ECharts (tree-shaken, SVG çizici) + token'dan türeyen açık/koyu tema.
  Her grafik aynı dört durumu ve aynı erişilebilirlik katmanını taşır:
    - `state`: loading (iskelet, yükseklik sabit) · empty (sakin metin + neden) · error (Tekrar dene) · ready
    - `summary`: grafik alanının erişilebilir adı (`role="img"`); serilerden toplam / en yüksek / son eklenir
    - "Tablo olarak göster": aynı veri erişilebilir tabloda (sparkline hariç)
    - Renk yalnız anlam taşır: `tone` durum serileri için (error = başarısız), yoksa kategorik sıra.
    - `prefers-reduced-motion` → animasyon yok.

    <BoChart kind="stacked-bar" :categories="hours" :series="[{ name: 'Başarılı', data: ok, tone: 'action' }, { name: 'Başarısız', data: bad, tone: 'error' }]"
      summary="Sipariş kuyruğu saatlik iş sayısı" :height="160" />
-->
<template>
  <figure class="bo-chart" :class="`is-${kind}`" data-bo-chart>
    <figcaption v-if="showHead" class="bo-chart__head">
      <span v-if="title" class="bo-chart__title">{{ title }}</span>
      <span v-if="legend" class="bo-chart__legend" aria-hidden="true">
        <span v-for="(s, i) in series" :key="s.name" class="bo-chart__key"><span class="bo-chart__swatch" :style="{ background: colorOf(s, i) }"></span>{{ s.name }}</span>
      </span>
      <button v-if="tableToggle" type="button" class="bo-chart__toggle" :aria-expanded="asTable" @click="asTable = !asTable">
        {{ asTable ? 'Grafiği göster' : 'Tablo olarak göster' }}
      </button>
    </figcaption>

    <div v-if="state === 'loading'" class="bo-chart__skel" :style="{ height: `${height}px` }" role="status" aria-busy="true">
      <span class="ek-sr-only">Grafik yükleniyor…</span>
    </div>
    <div v-else-if="state === 'error'" class="bo-chart__msg is-error" :style="{ minHeight: `${height}px` }" role="alert">
      <v-icon icon="mdi-alert-circle-outline" aria-hidden="true" />
      <span>{{ errorText }}</span>
      <button type="button" class="bo-chart__retry" @click="emit('retry')">Tekrar dene</button>
    </div>
    <div v-else-if="state === 'empty' || !hasData" class="bo-chart__msg" :style="{ minHeight: `${Math.min(height, 96)}px` }">
      <v-icon icon="mdi-chart-line-variant" aria-hidden="true" />
      <span>{{ emptyText }}</span>
    </div>
    <template v-else>
      <!-- Grafik alanı tek bir görsel: ad = özet (ne gösterildiği + toplam/en yüksek/son). İç SVG sunumsal. -->
      <div v-show="!asTable" class="bo-chart__canvas" :style="{ height: `${height}px` }" role="img" :aria-label="summaryText" data-testid="chart-summary">
        <VChart :option="option" :theme="themeName" autoresize :init-options="{ renderer: 'svg' }" />
      </div>
      <div v-if="asTable" class="bo-chart__table" tabindex="0" role="region" :aria-label="`${summary ?? title ?? 'Grafik'} tablosu`">
        <table>
          <caption class="ek-sr-only">{{ summary ?? title }}</caption>
          <thead>
            <tr><th scope="col">{{ categoryLabel }}</th><th v-for="s in series" :key="s.name" scope="col" class="is-num">{{ s.name }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(c, i) in rowsFor" :key="`${c}-${i}`"><th scope="row">{{ c }}</th><td v-for="s in series" :key="s.name" class="is-num ek-num">{{ fmt(s.data[i] ?? 0) }}</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </figure>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import VChart from 'vue-echarts'
import { themeMode } from '@bo/theme'
import { registerCharts } from './register'
import { CHART_THEME_NAME, type ChartMode, type ChartTone } from './chartTheme'
import { buildOption, describeSeries, seriesColor, type ChartKind, type ChartSeries } from './options'

registerCharts()

const props = withDefaults(
  defineProps<{
    kind: ChartKind
    series: ChartSeries[]
    categories?: string[]
    /** Ekran okuyucu özeti (ne gösterildiği). Verilmezse serilerden türetilir. */
    summary?: string
    title?: string
    height?: number
    state?: 'loading' | 'ready' | 'empty' | 'error'
    emptyText?: string
    errorText?: string
    format?: (v: number) => string
    threshold?: { value: number; label: string }
    categoryTones?: ChartTone[]
    /** Lejant (HTML, erişilebilir metin) — çok serili grafiklerde varsayılan açık. */
    legend?: boolean
    /** "Tablo olarak göster" — sparkline dışında varsayılan açık. */
    table?: boolean
    categoryLabel?: string
  }>(),
  {
    height: 160,
    state: 'ready',
    emptyText: 'Bu aralıkta ölçüm yok.',
    errorText: 'Grafik verisi okunamadı — birazdan yeniden deneyin.',
    legend: undefined,
    table: undefined,
    categoryLabel: 'Zaman',
  },
)
const emit = defineEmits<{ retry: [] }>()

const nf = new Intl.NumberFormat('tr-TR')
const fmt = (v: number) => (props.format ?? ((n: number) => nf.format(n)))(v)
const mode = computed<ChartMode>(() => (themeMode.value === 'dark' ? 'dark' : 'light'))
const themeName = computed(() => CHART_THEME_NAME[mode.value])

const reduced = ref(false)
let mq: MediaQueryList | undefined
const onMq = () => (reduced.value = !!mq?.matches)
onMounted(() => {
  if (typeof window.matchMedia !== 'function') return
  mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  onMq()
  mq.addEventListener?.('change', onMq)
})
onBeforeUnmount(() => mq?.removeEventListener?.('change', onMq))

// bo-wdg: "0 hata" gerçek bir ölçümdür → tümü 0 olan seri çizilir. Boş = seri/nokta yok ya da hepsi null/NaN.
// İstisna halka (donut): toplam 0 iken dilim çizilemez → boş metni.
const hasData = computed(() => {
  const finite = props.series.flatMap((s) => s.data).filter((v) => typeof v === 'number' && Number.isFinite(v))
  return props.kind === 'donut' ? finite.some((v) => v !== 0) : finite.length > 0
})
const option = computed(() =>
  buildOption({ kind: props.kind, series: props.series, categories: props.categories, format: props.format, threshold: props.threshold, categoryTones: props.categoryTones, mode: mode.value, animate: !reduced.value }),
)
const summaryText = computed(() => {
  const detail = describeSeries(props.series, props.categories, fmt)
  return props.summary ? `${props.summary}. ${detail}` : detail
})

const legend = computed(() => props.legend ?? (props.series.length > 1 && props.kind !== 'sparkline'))
const tableToggle = computed(() => (props.table ?? props.kind !== 'sparkline') && props.state === 'ready' && hasData.value)
const showHead = computed(() => !!props.title || legend.value || tableToggle.value)
const asTable = ref(false)
const rowsFor = computed(() => props.categories ?? props.series[0]?.data.map((_, i) => String(i + 1)) ?? [])
const colorOf = (s: ChartSeries, i: number) => seriesColor(s, i, mode.value)
</script>

<style scoped>
.bo-chart {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
  margin: 0;
}

.bo-chart__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-4);
}

.bo-chart__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.bo-chart__legend {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-chart__key {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.bo-chart__swatch {
  width: 10px;
  height: 10px;
  border-radius: var(--ek-radius-sm);
}

.bo-chart__toggle,
.bo-chart__retry {
  margin-left: auto;
  padding: 0;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-action-emphasis);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
}

.bo-chart__toggle:hover,
.bo-chart__retry:hover {
  text-decoration: underline;
}

.bo-chart__toggle:focus-visible,
.bo-chart__retry:focus-visible,
.bo-chart__table:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-chart__canvas {
  width: 100%;
  min-width: 0;
}

.bo-chart.is-sparkline .bo-chart__canvas :deep(svg) {
  overflow: visible;
}

.bo-chart__skel {
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-muted);
}

.bo-chart__msg {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3);
  border: 1px dashed var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-align: center;
}

.bo-chart__msg .v-icon {
  font-size: var(--ek-icon-sm);
}

.bo-chart__msg.is-error {
  border-color: var(--ek-color-error-border);
  color: var(--ek-color-error-emphasis);
}

.bo-chart__msg .bo-chart__retry {
  margin-left: 0;
}

.bo-chart__table {
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-md);
}

.bo-chart__table table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--ek-type-table-size);
  line-height: var(--ek-type-table-line);
}

.bo-chart__table th,
.bo-chart__table td {
  padding: var(--ek-space-1) var(--ek-space-3);
  border-bottom: 1px solid var(--ek-color-border-subtle);
  text-align: left;
  font-weight: var(--ek-font-weight-regular);
}

.bo-chart__table thead th {
  position: sticky;
  top: 0;
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-chart__table .is-num {
  text-align: right;
}

/* BO-LOCAL-01 — grafik: boş/hata kutusu ve tablo görünümü kutu köşeli + ince çerçeve; "tablo olarak göster" geçişi
   çerçeveli küçük düğme (çıplak bağlantı yerine). */
.bo-chart__skel,
.bo-chart__msg,
.bo-chart__table {
  border-radius: var(--ek-radius-tile);
}

.bo-chart__table {
  border-color: var(--ek-color-border-default);
}

.bo-chart__toggle {
  height: 26px;
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  transition: var(--ek-transition-colors);
}

.bo-chart__toggle:hover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  text-decoration: none;
}

.bo-chart__swatch {
  border-radius: 3px;
}
</style>
