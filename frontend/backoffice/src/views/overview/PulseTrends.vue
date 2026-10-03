<!--
  PulseTrends — "Platform trafiği" kutusunun içeriği. Okuma sırası:
    1. Ana eğilim: API isteği (büyük değer + değişim + saatlik alan grafiği)
    2. Hacim: sipariş · API isteği · kanal çağrısı — her satırda "bu ne" açıklaması, değer, karşılaştırma, trend
    3. Hata oranları: değer + EŞİK ÇUBUĞU (eşiğe ne kadar yakın; aşınca sarımsı)
    4. Ölçülmeyenler tek dipnotta (boşluk "sorun yok" değildir — nedeniyle söylenir)
-->
<template>
  <div class="ov-pt" data-testid="pulse-trends">
    <div v-if="http" class="ov-pt__lead">
      <div class="ov-pt__lead-text">
        <span class="ov-pt__k">API isteği · 24 saat</span>
        <span class="ov-pt__lead-num ek-num">{{ http.value }}</span>
        <span class="ov-pt__lead-note"><v-icon v-if="http.trend && http.trend !== 'flat'" :icon="http.trend === 'up' ? 'mdi-arrow-top-right' : 'mdi-arrow-bottom-right'" aria-hidden="true" />{{ http.note }}</span>
      </div>
      <BoChart
        class="ov-pt__chart"
        kind="area"
        :height="120"
        :categories="hours"
        :series="[{ name: 'İstek', data: http.series!, tone: 'action' }]"
        summary="Saatlik API isteği, son 24 saat"
        category-label="Saat"
      />
    </div>

    <section v-if="volume.length" class="ov-pt__group" aria-label="Hacim">
      <h3 class="ov-pt__gk">Hacim</h3>
      <ul class="ov-pt__rows">
        <li v-for="t in volume" :key="t.key" class="ov-pt__row" :class="`is-${t.state}`">
          <span class="ov-pt__name">
            <span class="ov-pt__label">{{ t.label }}</span>
            <span class="ov-pt__help">{{ HELP[t.key] }}</span>
          </span>
          <span class="ov-pt__val">
            <span class="ov-pt__value ek-num">{{ t.value }}</span>
            <span class="ov-pt__note"><v-icon v-if="t.trend && t.trend !== 'flat'" :icon="t.trend === 'up' ? 'mdi-arrow-top-right' : 'mdi-arrow-bottom-right'" aria-hidden="true" />{{ t.note }}</span>
          </span>
          <Sparkline v-if="t.series && t.series.length > 1" class="ov-pt__spark" :values="t.series" :label="`${t.label} — son 24 saat, saatlik`" tone="neutral" />
          <span v-else class="ov-pt__spark" aria-hidden="true"></span>
        </li>
      </ul>
    </section>

    <section v-if="errors.length" class="ov-pt__group" aria-label="Hata oranları">
      <h3 class="ov-pt__gk">Hata oranları</h3>
      <ul class="ov-pt__rows">
        <li v-for="t in errors" :key="t.key" class="ov-pt__row is-rate" :class="[`is-${t.state}`, { 'is-over': t.over }]">
          <span class="ov-pt__name">
            <span class="ov-pt__label">{{ t.label }}</span>
            <span class="ov-pt__help">{{ HELP[t.key] }}</span>
          </span>
          <span class="ov-pt__val">
            <span class="ov-pt__value ek-num">{{ t.value }}</span>
            <span class="ov-pt__note">{{ t.note }}</span>
          </span>
          <span v-if="t.ratio !== undefined && t.threshold" class="ov-pt__gauge" role="img" :aria-label="`${t.label} ${t.value}; eşik ${pct(t.threshold)}`">
            <span class="ov-pt__gauge-fill" :style="{ width: `${gaugeWidth(t.ratio, t.threshold)}%` }"></span>
            <span class="ov-pt__gauge-mark" :style="{ left: `${(1 / GAUGE_SPAN) * 100}%` }"></span>
            <span class="ov-pt__gauge-cap" :style="{ left: `${(1 / GAUGE_SPAN) * 100}%` }">eşik {{ pct(t.threshold) }}</span>
          </span>
          <span v-else class="ov-pt__spark" aria-hidden="true"></span>
        </li>
      </ul>
    </section>

    <p v-if="unmeasured.length" class="ov-pt__foot">
      <v-icon icon="mdi-information-outline" aria-hidden="true" />
      <span><strong>Henüz ölçülmüyor:</strong> {{ unmeasured.map((r) => r.label).join(', ') }}. Değer gelince burada görünür.</span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Sparkline from '@bo/components/Sparkline.vue'
import BoChart from '@bo/components/charts/BoChart.vue'
import type { PulseModel, PulseRow } from '@bo/api/attention'

const props = defineProps<{ model: PulseModel }>()

/** Her göstergenin tek cümlelik anlamı — sayının neyi ölçtüğünü söyler. */
const HELP: Record<string, string> = {
  orders: 'Pazaryerlerinden alınıp işlenen siparişler',
  http: 'Panel ve entegrasyonların platforma yaptığı istekler',
  integration: 'Pazaryeri, ERP ve kargo tarafına yapılan dış çağrılar',
  http5xx: 'Platformun hatayla yanıtladığı isteklerin payı',
  intErr: 'Başarısız dış kanal çağrılarının payı',
}
const ERROR_KEYS = new Set(['http5xx', 'intErr'])
/** Eşik çubuğu ölçeği: eşik, çubuğun 2/3'ünde durur (aşım da görünür). */
const GAUGE_SPAN = 1.5

const measured = computed(() => props.model.rows.filter((r) => r.state !== 'na'))
const volume = computed<PulseRow[]>(() => measured.value.filter((r) => !ERROR_KEYS.has(r.key)))
const errors = computed<PulseRow[]>(() => measured.value.filter((r) => ERROR_KEYS.has(r.key)))
const unmeasured = computed(() => props.model.rows.filter((r) => r.state === 'na'))
const http = computed(() => props.model.rows.find((r) => r.key === 'http' && r.series && r.series.length > 1))

const pf = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 1 })
const pct = (n: number) => pf.format(n)
const gaugeWidth = (ratio: number, threshold: number) => Math.min(100, (ratio / (threshold * GAUGE_SPAN)) * 100)

const hours = computed(() => {
  const n = http.value?.series?.length ?? 0
  const end = new Date(props.model.generatedAt).getTime()
  const f = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' })
  return Array.from({ length: n }, (_, i) => f.format(new Date(end - (n - 1 - i) * 3_600_000)))
})
</script>

<style scoped>
.ov-pt {
  --ov-warn-fill: var(--bo-warn-fill);
  --ov-warn-ink: var(--bo-warn-ink);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}


/* 1 · ana eğilim */
.ov-pt__lead {
  display: grid;
  grid-template-columns: minmax(150px, auto) minmax(0, 1fr);
  align-items: end;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface-muted);
}

.ov-pt__lead-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: var(--ek-space-2);
}

.ov-pt__k,
.ov-pt__gk {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ov-pt__lead-num {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-display-size);
  line-height: 1.1;
  font-weight: var(--ek-type-display-weight);
  letter-spacing: var(--ek-type-display-tracking);
}

.ov-pt__lead-note,
.ov-pt__note {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ov-pt__lead-note .v-icon,
.ov-pt__note .v-icon {
  font-size: var(--ek-icon-xs);
}

.ov-pt__chart {
  min-width: 0;
}

/* 2–3 · gruplar */
.ov-pt__group {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.ov-pt__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.ov-pt__row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) 112px;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-3) 0;
}

.ov-pt__row + .ov-pt__row {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ov-pt__name,
.ov-pt__val {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ov-pt__val {
  align-items: flex-end;
  text-align: right;
}

.ov-pt__label {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ov-pt__help {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ov-pt__value {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: 22px;
  font-weight: var(--ek-font-weight-semibold);
}

.ov-pt__row.is-degraded .ov-pt__value {
  color: var(--ek-color-content-muted);
}

.ov-pt__row.is-over .ov-pt__value {
  color: var(--ov-warn-ink);
}

.ov-pt__spark {
  min-width: 0;
  height: 28px;
}

/* eşik çubuğu: dolgu = değer, çizgi = eşik (çubuğun 2/3'ü) */
.ov-pt__gauge {
  position: relative;
  align-self: center;
  height: 8px;
  margin-bottom: 14px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-sunken);
}

.ov-pt__gauge-fill {
  position: absolute;
  inset: 0 auto 0 0;
  min-width: 4px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-success);
}

.ov-pt__row.is-over .ov-pt__gauge-fill {
  background: var(--ov-warn-fill);
}

.ov-pt__gauge-mark {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--ek-color-content-default);
}

.ov-pt__gauge-cap {
  position: absolute;
  top: 12px;
  transform: translateX(-50%);
  color: var(--ek-color-content-muted);
  font-size: 10px;
  white-space: nowrap;
}

/* 4 · ölçülmeyenler */
.ov-pt__foot {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ov-pt__foot .v-icon {
  flex: none;
  font-size: var(--ek-icon-sm);
}

.ov-pt__foot strong {
  color: var(--ek-color-content-default);
  font-weight: var(--ek-font-weight-semibold);
}

@media (max-width: 600px) {
  .ov-pt__lead {
    grid-template-columns: minmax(0, 1fr);
  }

  .ov-pt__row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .ov-pt__help {
    white-space: normal;
  }

  .ov-pt__spark,
  .ov-pt__gauge {
    grid-column: 1 / -1;
  }
}

/* ================= BO-LOCAL-01 — trafik özeti: uygulamanın tasarım diliyle =================
   Ana eğilim kutusu ince çerçeveli, kutu köşeli sakin panel; grup etiketleri kısa eylem çizgili mikro etiket. */
.ov-pt__lead {
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-tile);
}

.ov-pt__gk {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ov-pt__gk::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}
</style>
