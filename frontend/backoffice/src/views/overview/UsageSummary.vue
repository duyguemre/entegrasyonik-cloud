<!--
  UsageSummary — "Genel kullanım nasıl?" (genel bakış 4. soru). BO2-P1: aktif müşteri ve MRR üstteki metrik şeridinde;
  burada dağılım (müşteri durumları halka grafiği, ECharts) ve abonelik sayıları — her biri ilgili listeye bağlı.
  Sakin: renk yalnız anlamlı dilimde (Aktif = yeşil, başarısız = kırmızı, bekleyen = sarı).
-->
<template>
  <div class="bo-us" data-testid="usage-summary">
    <div class="bo-us__dist">
      <template v-if="dist">
        <div class="bo-us__donut">
          <BoChart kind="donut" :height="132" :categories="dist.labels" :category-tones="dist.tones" :series="[{ name: 'Müşteri', data: dist.values }]" summary="Müşterilerin durum dağılımı" :table="false" />
          <span class="bo-us__donut-center" aria-hidden="true"><strong class="ek-num">{{ dist.totalText }}</strong>müşteri</span>
        </div>
        <ul class="bo-us__legend" aria-label="Müşteri durumları">
          <li v-for="(l, i) in dist.labels" :key="l">
            <span class="bo-us__dot" :class="`is-${dist.tones[i]}`" aria-hidden="true"></span>{{ l }}<strong class="ek-num">{{ nf.format(dist.values[i]) }}</strong>
          </li>
        </ul>
      </template>
      <p v-else class="bo-us__na">Müşteri sayıları okunamadı.</p>
    </div>

    <dl class="bo-us__stats">
      <div v-for="s in stats" :key="s.key" class="bo-us__stat">
        <dt>{{ s.label }}</dt>
        <dd>
          <RouterLink v-if="s.value !== null" :to="s.to" class="bo-us__num ek-num" :aria-label="`${s.label}: ${s.value} — listeyi aç`">{{ s.value }}</RouterLink>
          <span v-else class="bo-us__na">Okunamadı</span>
          <span v-if="s.hint" class="bo-us__hint">{{ s.hint }}</span>
        </dd>
      </div>
    </dl>
    <RouterLink :to="{ name: 'subscriptions', query: { sekme: 'gelir' } }" class="bo-us__link">Gelir metrikleri<v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import BoChart from '@bo/components/charts/BoChart.vue'
import type { ChartTone } from '@bo/components/charts/chartTheme'
import type { PulseModel } from '@bo/api/attention'
import type { TenantStatus } from '@bo/api/contract'
import { TENANT_STATUS } from '@bo/utils/labels'

const props = defineProps<{ model: PulseModel }>()
const nf = new Intl.NumberFormat('tr-TR')
const TONE: Record<string, ChartTone> = { success: 'success', danger: 'error', warning: 'warning', info: 'info', neutral: 'neutral' }

const dist = computed(() => {
  const t = props.model.usage.tenants
  if (t.state !== 'ok') return null
  const entries = Object.entries(t.byStatus).filter(([, n]) => n > 0)
  entries.sort((a, b) => (a[0] === 'ACTIVE' ? -1 : b[0] === 'ACTIVE' ? 1 : b[1] - a[1]))
  return {
    labels: entries.map(([k]) => TENANT_STATUS[k as TenantStatus]?.label ?? k),
    values: entries.map(([, n]) => n),
    tones: entries.map(([k]) => TONE[TENANT_STATUS[k as TenantStatus]?.tone ?? 'neutral']),
    totalText: nf.format(t.total),
  }
})

const stats = computed(() => {
  const m = props.model.usage.mrr
  const subs: RouteLocationRaw = { name: 'subscriptions' }
  return [
    { key: 'subs', label: 'Ücretli abonelik', value: m.state === 'ok' ? nf.format(m.activeSubscriptions) : null, hint: '', to: subs },
    { key: 'trialing', label: 'Denemede', value: m.state === 'ok' ? nf.format(m.trialing) : null, hint: '', to: { name: 'subscriptions', query: { durum: 'trialing' } } },
    { key: 'lost', label: 'Kayıp (30 gün)', value: m.state === 'ok' ? nf.format(m.lostLast30d) : null, hint: 'iptal / süre dolumu', to: subs },
  ]
})
</script>

<style scoped>
.bo-us {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  grid-template-areas: 'dist stats' 'dist link';
  grid-template-rows: 1fr auto;
  gap: var(--ek-space-3) var(--ek-space-5);
  align-items: start;
}

.bo-us__dist {
  grid-area: dist;
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
  min-width: 0;
}

.bo-us__donut {
  position: relative;
  flex: none;
  width: 132px;
}

.bo-us__donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  pointer-events: none;
}

.bo-us__donut-center strong {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.bo-us__legend {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

.bo-us__legend li {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.bo-us__legend strong {
  margin-left: auto;
  padding-left: var(--ek-space-2);
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-us__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-neutral);
}

.bo-us__dot.is-success {
  background: var(--ek-color-success);
}

.bo-us__dot.is-error {
  background: var(--ek-color-error);
}

.bo-us__dot.is-warning {
  background: var(--ek-color-warning);
}

.bo-us__dot.is-info {
  background: var(--ek-color-info);
}

.bo-us__stats {
  grid-area: stats;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  margin: 0;
}

.bo-us__stat {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--ek-space-3);
  padding-bottom: var(--ek-space-2);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.bo-us__stat dt {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
}

.bo-us__stat dd {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  margin: 0;
}

.bo-us__num {
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
  text-decoration: none;
}

.bo-us__num:hover {
  text-decoration: underline;
}

.bo-us__num:focus-visible,
.bo-us__link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-us__na,
.bo-us__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-us__link {
  grid-area: link;
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  justify-self: start;
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
  text-decoration: none;
}

.bo-us__link .v-icon {
  font-size: var(--ek-icon-sm);
}

@media (max-width: 1279px) {
  .bo-us {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'dist' 'stats' 'link';
    grid-template-rows: none;
  }
}
</style>
