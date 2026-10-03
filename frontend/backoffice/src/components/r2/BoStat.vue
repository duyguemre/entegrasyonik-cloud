<!--
  BoStat — ÖNEMLİ METRİK KUTUSU (BO2-P1, BO2-12). Tek sayı + etiket + kısa bağlam; isteğe bağlı küçük trend çizgisi
  (BoChart sparkline) ve ayrıntı bağlantısı. Renk yalnız durum taşır (`tone`: sol şerit + değer rengi; nötr varsayılan).
  Uzun açıklama kutuya YAZILMAZ: `hint` tek satır, ayrıntı `info`da (ⓘ işareti + üzerine gelince ipucu + ekran okuyucu
  metni; kutu bağlantıysa iç içe etkileşimli öğe olmaz) ya da `to` bağlantısında.

    <BoTileGrid :min="180" dense>
      <BoStat label="Kritik konu" :value="2" tone="critical" hint="Sistem 1 · müşteri 1" to="#sistem" />
      <BoStat label="API isteği (24 sa)" value="67.109" :delta="{ text: '%6', dir: 'up' }" :series="[…]" />
    </BoTileGrid>
-->
<template>
  <component
    :is="to ? (isHash ? 'a' : RouterLink) : 'div'"
    class="bo-stat"
    :class="[`is-${tone}`, { 'is-link': !!to }]"
    v-bind="to ? (isHash ? { href: to } : { to }) : {}"
    :aria-label="to ? linkLabel : undefined"
    :title="info"
    data-bo-stat
  >
    <span class="bo-stat__label">
      <span class="bo-stat__label-text">{{ label }}</span>
      <v-icon v-if="info" class="bo-stat__info" icon="mdi-information-outline" aria-hidden="true" />
      <v-icon v-if="to" class="bo-stat__go" icon="mdi-arrow-top-right" aria-hidden="true" />
    </span>
    <span class="bo-stat__value-row">
      <span v-if="loading" class="bo-stat__skel" aria-hidden="true"></span>
      <span v-else class="bo-stat__value ek-num">{{ value }}</span>
      <span v-if="delta && !loading" class="bo-stat__delta" :class="`is-${delta.dir}`">
        <v-icon v-if="delta.dir !== 'flat'" :icon="delta.dir === 'up' ? 'mdi-arrow-top-right' : 'mdi-arrow-bottom-right'" aria-hidden="true" /><span v-if="deltaWord" class="ek-sr-only">{{ deltaWord }} </span>{{ delta.text }}
      </span>
    </span>
    <span v-if="hint" class="bo-stat__hint">{{ hint }}</span>
    <span v-if="info" class="ek-sr-only">{{ info }}</span>
    <BoChart
      v-if="series && series.length > 1"
      class="bo-stat__spark"
      kind="sparkline"
      :height="32"
      :series="[{ name: label, data: series, tone: sparkTone }]"
      :summary="`${label} — son ${series.length} ölçüm`"
    />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import BoChart from '../charts/BoChart.vue'

const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    hint?: string
    info?: string
    tone?: 'neutral' | 'critical' | 'warning' | 'success' | 'info'
    delta?: { text: string; dir: 'up' | 'down' | 'flat' }
    series?: number[]
    to?: string | Record<string, unknown>
    loading?: boolean
  }>(),
  { tone: 'neutral' },
)
const isHash = computed(() => typeof props.to === 'string' && props.to.startsWith('#'))
// bo-wdg: değişim yönü yalnız ikon/renk değil, metin olarak da (ekran okuyucu); bağlantılı kutuda ad değişimi ve ⓘ bilgisini içerir.
const DELTA_WORD = { up: 'artış', down: 'azalış', flat: '' } as const
const deltaWord = computed(() => (props.delta ? DELTA_WORD[props.delta.dir] : ''))
const linkLabel = computed(() => {
  const delta = props.delta ? `, ${[deltaWord.value, props.delta.text].filter(Boolean).join(' ')}` : ''
  const hint = props.hint ? ` — ${props.hint}` : ''
  const info = props.info ? `. ${props.info}` : ''
  return `${props.label}: ${props.value}${delta}${hint}${info}`
})
const sparkTone = computed(() => (props.tone === 'critical' ? 'error' : props.tone === 'warning' ? 'warning' : 'action'))
</script>

<style scoped>
/* Metrik hücresi — genel bakışın metrik şeridiyle AYNI dil. Tek başına kart; BoTileGrid içinde yalnız BoStat'lar varsa
   ızgara tek karta birleşir (backoffice.css "STAT ŞERİDİ"). Renk yalnız durum taşır: düz hafif zemin + değer rengi. */
.bo-stat {
  --st-ink: var(--ek-color-content-strong);
  --st-warn-fill: var(--bo-warn-fill);
  --st-warn-ink: var(--bo-warn-ink);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: var(--ek-space-5) var(--ek-space-5) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
  color: inherit;
  text-decoration: none;
  transition: var(--ek-transition-colors);
}


.bo-stat.is-warning {
  --st-ink: var(--st-warn-ink);
  background: var(--bo-warn-wash);
}

.bo-stat.is-critical {
  --st-ink: var(--ek-color-error-emphasis);
  background: color-mix(in srgb, var(--ek-color-error) 5%, var(--ek-color-surface));
}

.bo-stat.is-success {
  --st-ink: var(--ek-color-content-strong);
}

.bo-stat.is-link:hover {
  background: var(--ek-color-surface-muted);
}

.bo-stat.is-link:focus-visible {
  outline: none;
  box-shadow: inset var(--ek-focus-ring);
}

.bo-stat__label {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-stat__label-text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.bo-stat__info {
  flex: none;
  /* bo-wdg: anlam taşıyan ikon → okunur kontrast (subtle ≈ 2,4:1). */
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-xs);
}

.bo-stat__go {
  flex: none;
  margin-left: auto;
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-sm);
  opacity: 0;
  transition: opacity var(--ek-motion-feedback);
}

.bo-stat.is-link:hover .bo-stat__go,
.bo-stat.is-link:focus-visible .bo-stat__go {
  opacity: 1;
}

.bo-stat__value-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--ek-space-1) var(--ek-space-2);
}

.bo-stat__value {
  color: var(--st-ink);
  font-size: var(--ek-type-display-size);
  line-height: 1.1;
  font-weight: var(--ek-type-display-weight);
  letter-spacing: var(--ek-type-display-tracking);
}

.bo-stat__skel {
  display: inline-block;
  width: 96px;
  height: 34px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.bo-stat__delta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-stat__delta .v-icon {
  font-size: var(--ek-icon-xs);
}

.bo-stat__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-stat__spark {
  margin-top: auto;
  padding-top: var(--ek-space-2);
}

@media (max-width: 600px) {
  .bo-stat {
    padding: var(--ek-space-4);
  }

  .bo-stat__value {
    font-size: var(--ek-type-metric-size);
  }
}

/* ================= BO-LOCAL-01 — metrik hücresi: uygulamanın tasarım diliyle =================
   Gölge yok. Durum tonu düz açık zemin + tonun ince çerçevesi (uydurma karışım yok). Etiket kısa eylem çizgili mikro
   etiket; değişim rozeti köşeli, çerçeveli. */
.bo-stat {
  padding: var(--ek-space-4);
  box-shadow: none;
}

.bo-stat.is-warning {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  --st-ink: var(--ek-color-warning-emphasis);
}

.bo-stat.is-critical {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
}

.bo-stat.is-link:hover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.bo-stat__delta {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
}

.bo-stat__value {
  letter-spacing: -0.025em;
}
</style>
