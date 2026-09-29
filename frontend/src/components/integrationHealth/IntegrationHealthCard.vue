<!--
  frontend/src/components/integrationHealth/IntegrationHealthCard.vue

  ADR-0015 B4-P1c — N7 entegrasyon başına sağlık kartı (DS-v2 `EkCard` motifi: ikon kapsülü + başlık/alt başlık +
  durum çipi + yuvarlak ok → ilgili ayar sekmesi). Veri: `docs/API_TENANT_SURFACE.md` §3 (`IntegrationHealthDto`).
  Gösterim kuralları:
    - `credentialsConfigured !== true` → senkron tarihi "son başarılı senkron" olarak GÖSTERİLMEZ (§3 uyarı a).
    - `circuit.stale` → "eski gözlem" rozeti; `down` sayılmaz (backend zaten türetmiş).
    - `lastError`: kod (okunur ad + ham kod) + HTTP durumu + işlem. Ham hata mesajı yok (DTO'da da yok).
    - 24 sa dağılımı: başarılı/hatalı oranı çubuğu + hata kodu dağılımı (en fazla 4 + "diğer").
-->
<template>
  <EkCard
    class="ek-health-card"
    :class="`ek-health-card--${item.health}`"
    :title="name"
    :subtitle="typeLabel"
    :icon="presentation.icon"
    :icon-tone="presentation.iconTone"
    :heading-level="3"
    :to-label="canOpenSettings ? settingsLabel : undefined"
    @open="emit('open-settings', item)"
  >
    <template #actions>
      <EkStatusChip v-if="!item.enabled" tone="neutral" :label="t('integrationHealth.card.disabled')" />
      <EkStatusChip :tone="presentation.tone" :label="t(presentation.labelKey)" dot />
    </template>

    <dl class="ek-health-card__facts">
      <div class="ek-health-card__fact">
        <dt>{{ t('integrationHealth.card.credentials') }}</dt>
        <dd>
          <v-icon :icon="credIcon" size="16" :class="`ek-health-card__ic--${credTone}`" aria-hidden="true" />
          <span class="ek-health-card__val">{{ t(`integrationHealth.credentials.${cred}`) }}</span>
        </dd>
      </div>
      <div class="ek-health-card__fact">
        <dt>{{ t('integrationHealth.card.lastSync') }}</dt>
        <dd v-if="sync === 'synced'" :title="formatDateTime(item.lastSuccessfulSyncAt)">
          <v-icon icon="mdi-sync" size="16" class="ek-health-card__ic--muted" aria-hidden="true" />
          <span class="ek-health-card__val">
            {{ formatRelative(item.lastSuccessfulSyncAt, now) }}
            <span class="ek-sr-only">({{ formatDateTime(item.lastSuccessfulSyncAt) }})</span>
          </span>
        </dd>
        <dd v-else>
          <v-icon icon="mdi-sync-off" size="16" class="ek-health-card__ic--muted" aria-hidden="true" />
          <span class="ek-health-card__val">{{ t(sync === 'never' ? 'integrationHealth.card.neverConnected' : 'integrationHealth.card.noSync') }}</span>
        </dd>
      </div>
      <div class="ek-health-card__fact">
        <dt>{{ t('integrationHealth.card.webhook') }}</dt>
        <dd>
          <v-icon :icon="webhookIcon" size="16" :class="`ek-health-card__ic--${webhookTone}`" aria-hidden="true" />
          <span class="ek-health-card__val">{{ webhookText }}</span>
        </dd>
      </div>
      <div class="ek-health-card__fact">
        <dt>{{ t('integrationHealth.card.circuit') }}</dt>
        <dd>
          <v-icon :icon="circuitIcon" size="16" :class="`ek-health-card__ic--${circuitTone}`" aria-hidden="true" />
          <span class="ek-health-card__val">
            {{ circuitText }}
            <span v-if="circuitHint" class="ek-health-card__hint">{{ circuitHint }}</span>
            <EkBadge v-if="item.circuit?.stale" tone="neutral" :text="t('integrationHealth.circuit.stale')" class="ek-health-card__stale" />
          </span>
        </dd>
      </div>
    </dl>

    <section class="ek-health-card__window" :aria-label="t('integrationHealth.card.windowAria', { hours: windowHours })">
      <div class="ek-health-card__window-head">
        <span class="ek-health-card__micro">{{ t('integrationHealth.card.window', { hours: windowHours }) }}</span>
        <span class="ek-health-card__counts ek-num">
          <template v-if="item.last24h.total">
            {{ t('integrationHealth.card.calls', { total: formatNumber(item.last24h.total) }) }}
            <span v-if="ratio !== null" class="ek-health-card__ratio">· {{ t('integrationHealth.card.successRate', { rate: formatPercent(ratio) }) }}</span>
          </template>
          <template v-else>{{ t('integrationHealth.card.noCalls') }}</template>
        </span>
      </div>
      <svg v-if="item.last24h.total" class="ek-health-card__bar" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <rect class="ek-health-card__bar-track" x="0" y="0" width="100" height="8" />
        <rect v-if="okPct > 0" class="ek-health-card__bar-ok" x="0" y="0" :width="okPct" height="8" />
        <rect v-if="okPct < 100" class="ek-health-card__bar-err" :x="okPct" y="0" :width="100 - okPct" height="8" />
      </svg>
      <p v-if="item.last24h.total" class="ek-health-card__legend ek-num">
        <span><span class="ek-health-card__dot ek-health-card__dot--ok" aria-hidden="true"></span>{{ t('integrationHealth.card.success', { n: formatNumber(item.last24h.success) }) }}</span>
        <span><span class="ek-health-card__dot ek-health-card__dot--err" aria-hidden="true"></span>{{ t('integrationHealth.card.errors', { n: formatNumber(item.last24h.error) }) }}</span>
      </p>
      <ul v-if="distribution.length" class="ek-health-card__codes" :aria-label="t('integrationHealth.card.byCode')">
        <li v-for="d in distribution" :key="d.code" class="ek-health-card__code">
          <span class="ek-health-card__code-name">{{ errorName(d.code) }}</span>
          <svg class="ek-health-card__code-track" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <rect class="ek-health-card__code-bg" x="0" y="0" width="100" height="6" />
            <rect class="ek-health-card__code-fill" x="0" y="0" :width="Math.max(4, Math.round(d.ratio * 100))" height="6" />
          </svg>
          <span class="ek-health-card__code-count ek-num">{{ formatNumber(d.count) }}</span>
        </li>
      </ul>
    </section>

    <div v-if="item.lastError" class="ek-health-card__error">
      <div class="ek-health-card__error-head">
        <span class="ek-health-card__micro">{{ t('integrationHealth.card.lastError') }}</span>
        <time class="ek-health-card__error-time" :datetime="item.lastError.at" :title="formatDateTime(item.lastError.at)">{{ formatRelative(item.lastError.at, now) }}</time>
      </div>
      <p class="ek-health-card__error-main">
        <strong>{{ errorName(item.lastError.code) }}</strong>
        <code class="ek-health-card__code-raw">{{ item.lastError.code }}</code>
        <span v-if="item.lastError.httpStatus !== null" class="ek-health-card__http ek-num">HTTP {{ item.lastError.httpStatus }}</span>
      </p>
      <p v-if="item.lastError.operation" class="ek-health-card__op">
        <span class="ek-sr-only">{{ t('integrationHealth.card.operation') }}: </span>
        <code>{{ item.lastError.operation }}</code>
      </p>
    </div>
  </EkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import EkCard from '@/components/ds/EkCard.vue'
import EkBadge from '@/components/ds/EkBadge.vue'
import EkStatusChip from '@/components/ds/EkStatusChip.vue'
import { formatDateTime, formatNumber, formatPercent, formatRelative } from '@/composables/format'
import {
  KNOWN_ERROR_CODES, credentialState, errorCodeDistribution, healthPresentation, integrationDisplayName, successRatio, syncInterpretation,
  type IntegrationHealthItem,
} from '@/composables/useIntegrationHealthApi'

const props = withDefaults(defineProps<{ item: IntegrationHealthItem; windowHours?: number; now?: Date; canOpenSettings?: boolean }>(), {
  windowHours: 24,
  canOpenSettings: true,
  now: () => new Date(),
})
const emit = defineEmits<{ 'open-settings': [item: IntegrationHealthItem] }>()
const { t, te } = useI18n()

const name = computed(() => integrationDisplayName(props.item.integrationCode))
const presentation = computed(() => healthPresentation(props.item.health))
const typeLabel = computed(() => {
  const key = `integrationHealth.type.${props.item.type ?? 'unknown'}`
  return te(key) ? t(key) : t('integrationHealth.type.unknown')
})
const settingsLabel = computed(() => t('integrationHealth.card.openSettings', { name: name.value }))

const cred = computed(() => credentialState(props.item))
const credTone = computed(() => (cred.value === 'configured' ? 'success' : 'muted'))
const credIcon = computed(() => (cred.value === 'configured' ? 'mdi-key-variant' : 'mdi-key-remove'))
const sync = computed(() => syncInterpretation(props.item))
const ratio = computed(() => successRatio(props.item))
const distribution = computed(() => errorCodeDistribution(props.item))
/** Başarılı çağrıların yüzdesi (çubuk genişliği); hata payı en az 2 birim görünür kalır. */
const okPct = computed(() => {
  const { total, success, error } = props.item.last24h
  if (!total) return 0
  const pct = Math.round((success / total) * 100)
  return error > 0 ? Math.min(pct, 98) : pct
})

const webhookTone = computed(() => {
  const w = props.item.webhook
  if (!w || w.healthy === null) return 'muted'
  return w.healthy ? 'success' : 'warning'
})
const webhookIcon = computed(() => (webhookTone.value === 'warning' ? 'mdi-webhook' : webhookTone.value === 'success' ? 'mdi-webhook' : 'mdi-minus-circle-outline'))
const webhookText = computed(() => {
  const w = props.item.webhook
  if (!w) return t('integrationHealth.webhook.none')
  const state = w.healthy === null ? t('integrationHealth.webhook.unknown') : w.healthy ? t('integrationHealth.webhook.healthy') : t('integrationHealth.webhook.unhealthy')
  return w.lastReceivedAt ? `${state} · ${formatRelative(w.lastReceivedAt, props.now)}` : state
})

const circuitTone = computed(() => {
  const c = props.item.circuit
  if (!c || c.stale) return 'muted'
  return c.state === 'closed' ? 'success' : c.state === 'open' ? 'error' : 'warning'
})
const circuitIcon = computed(() => {
  const c = props.item.circuit
  if (!c) return 'mdi-minus-circle-outline'
  return c.state === 'closed' ? 'mdi-check-circle-outline' : c.state === 'open' ? 'mdi-close-octagon-outline' : 'mdi-progress-alert'
})
const circuitText = computed(() => {
  const c = props.item.circuit
  if (!c) return t('integrationHealth.circuit.none')
  return t(`integrationHealth.circuit.${c.state}`)
})
/** Açık/yarı açık kesicinin ne anlama geldiği kısa ikinci satırda (eski gözlemde gösterilmez). */
const circuitHint = computed(() => {
  const c = props.item.circuit
  if (!c || c.stale || c.state === 'closed') return ''
  return t(`integrationHealth.circuit.${c.state}Hint`)
})

function errorName(code: string): string {
  return (KNOWN_ERROR_CODES as readonly string[]).includes(code) ? t(`integrationHealth.errorCode.${code}`) : code
}
</script>

<style scoped>
.ek-health-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ek-health-card :deep(.ek-card__body) {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.ek-health-card--down {
  border-color: var(--ek-color-error-border);
}

.ek-health-card--degraded {
  border-color: var(--ek-color-warning-border);
}

.ek-health-card__facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-3) var(--ek-space-4);
  margin: 0;
}

.ek-health-card__fact {
  min-width: 0;
}

.ek-health-card__fact dt,
.ek-health-card__micro {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  line-height: var(--ek-type-micro-line);
  text-transform: uppercase;
}

.ek-health-card__fact dd {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-type-label-weight);
  line-height: var(--ek-type-label-line);
}

.ek-health-card__fact dd > .v-icon {
  flex: none;
  margin-top: 1px;
}

.ek-health-card__val {
  flex: 1;
  min-width: 0;
}

.ek-health-card__hint {
  display: block;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-regular);
  line-height: var(--ek-type-caption-line);
}

.ek-health-card__ic--success { color: var(--ek-color-success); }
.ek-health-card__ic--warning { color: var(--ek-color-warning); }
.ek-health-card__ic--error { color: var(--ek-color-error); }
.ek-health-card__ic--muted { color: var(--ek-color-content-muted); }

.ek-health-card__stale {
  display: inline-flex;
  margin-top: var(--ek-space-1);
}

.ek-health-card__window {
  padding-top: var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ek-health-card__window-head,
.ek-health-card__error-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ek-space-2);
}

.ek-health-card__counts {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  text-align: right;
}

.ek-health-card__ratio {
  color: var(--ek-color-content-muted);
}

.ek-health-card__bar {
  display: block;
  width: 100%;
  height: 8px;
  margin-top: var(--ek-space-2);
  overflow: hidden;
  border-radius: var(--ek-radius-full);
}

.ek-health-card__bar-track { fill: var(--ek-color-surface-sunken); }
.ek-health-card__bar-ok { fill: var(--ek-color-success); }
.ek-health-card__bar-err { fill: var(--ek-color-error); }

.ek-health-card__legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-4);
  margin: var(--ek-space-2) 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-health-card__dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: var(--ek-space-1);
  border-radius: var(--ek-radius-full);
}

.ek-health-card__dot--ok { background: var(--ek-color-success); }
.ek-health-card__dot--err { background: var(--ek-color-error); }

.ek-health-card__codes {
  display: grid;
  gap: var(--ek-space-1);
  margin: var(--ek-space-3) 0 0;
  padding: 0;
  list-style: none;
}

.ek-health-card__code {
  display: grid;
  grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ek-space-2);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-health-card__code-name {
  overflow: hidden;
  color: var(--ek-color-content-default);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ek-health-card__code-track {
  display: block;
  width: 100%;
  height: 6px;
  overflow: hidden;
  border-radius: var(--ek-radius-full);
}

.ek-health-card__code-bg { fill: var(--ek-color-surface-sunken); }
.ek-health-card__code-fill { fill: var(--ek-color-error-border); }

.ek-health-card__code-count {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-health-card__error {
  margin-top: auto;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-left: 3px solid var(--ek-color-error);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface-sunken);
}

.ek-health-card__error-time {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ek-health-card__error-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
}

.ek-health-card__code-raw,
.ek-health-card__op code {
  font-family: var(--ek-font-mono);
  font-size: var(--ek-type-caption-size);
}

.ek-health-card__code-raw {
  color: var(--ek-color-content-muted);
}

.ek-health-card__http {
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-error-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
}

.ek-health-card__op {
  margin: var(--ek-space-1) 0 0;
  overflow-wrap: anywhere;
  color: var(--ek-color-content-default);
}

@media (max-width: 479px) {
  /* Dar kartta durum çipleri başlığın altına iner (başlık kesilmez, çipler üst üste binmez). */
  .ek-health-card :deep(.ek-card__header) {
    flex-wrap: wrap;
  }

  .ek-health-card :deep(.ek-card__titles) {
    flex: 1 1 calc(100% - 96px);
  }
}

@media (max-width: 359px) {
  .ek-health-card__facts {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
