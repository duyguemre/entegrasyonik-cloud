<!--
  UsageSummary — "Genel kullanım nasıl?" (genel bakış 4. soru). Müşteri ve abonelik sayıları (her biri ilgili listeye
  bağlı) + aylık yinelenen gelir. Sakin: renk yalnız sorunlu durum (kurulum/silme başarısız) noktasında.
-->
<template>
  <div class="bo-us" data-testid="usage-summary">
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

    <ul v-if="otherStatuses.length" class="bo-us__statuses" aria-label="Aktif olmayan müşteriler">
      <li v-for="o in otherStatuses" :key="o.key">
        <span class="bo-us__dot" :class="`is-${o.tone}`" aria-hidden="true"></span>{{ o.label }} <strong class="ek-num">{{ o.count }}</strong>
      </li>
    </ul>

    <section class="bo-us__block" aria-labelledby="bo-us-mrr">
      <h3 id="bo-us-mrr" class="bo-us__k">Aylık yinelenen gelir (MRR)</h3>
      <template v-if="mrr.state === 'ok'">
        <p class="bo-us__mrr ek-num">{{ formatMinor(mrr.minor, mrr.currency) }}</p>
        <p class="bo-us__note">Plan liste fiyatından tahmini; muaf ve özel teklif hariç.</p>
      </template>
      <p v-else class="bo-us__note">{{ mrr.state === 'na' ? 'Hesaplanamadı.' : 'Okunamadı — birazdan yeniden denenir.' }}</p>
      <RouterLink :to="{ name: 'subscriptions', query: { sekme: 'gelir' } }" class="bo-us__link">Gelir metrikleri<v-icon icon="mdi-arrow-right" aria-hidden="true" /></RouterLink>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { PulseModel } from '@bo/api/attention'
import type { TenantStatus } from '@bo/api/contract'
import { TENANT_STATUS } from '@bo/utils/labels'
import { formatMinor } from '@bo/utils/units'

const props = defineProps<{ model: PulseModel }>()
const nf = new Intl.NumberFormat('tr-TR')

const mrr = computed(() => props.model.usage.mrr)

const stats = computed(() => {
  const t = props.model.usage.tenants
  const m = props.model.usage.mrr
  const tenants: RouteLocationRaw = { name: 'tenants' }
  const subs: RouteLocationRaw = { name: 'subscriptions' }
  return [
    { key: 'active', label: 'Aktif müşteri', value: t.state === 'ok' ? nf.format(t.active) : null, hint: t.state === 'ok' ? `toplam ${nf.format(t.total)}` : '', to: tenants },
    { key: 'subs', label: 'Ücretli abonelik', value: m.state === 'ok' ? nf.format(m.activeSubscriptions) : null, hint: '', to: subs },
    { key: 'trialing', label: 'Denemede', value: m.state === 'ok' ? nf.format(m.trialing) : null, hint: '', to: subs },
    { key: 'lost', label: 'Kaybedilen (30 gün)', value: m.state === 'ok' ? nf.format(m.lostLast30d) : null, hint: 'iptal ya da süresi dolan', to: subs },
  ]
})

const otherStatuses = computed(() => {
  const t = props.model.usage.tenants
  if (t.state !== 'ok') return []
  return Object.entries(t.byStatus)
    .filter(([k, n]) => k !== 'ACTIVE' && n > 0)
    .map(([k, n]) => {
      const meta = TENANT_STATUS[k as TenantStatus]
      return { key: k, label: meta?.label ?? k, count: nf.format(n), tone: meta?.tone === 'danger' ? 'danger' : 'neutral' }
    })
})
</script>

<style scoped>
.bo-us {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
}

.bo-us__stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--ek-space-3);
  margin: 0;
}

.bo-us__stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bo-us__stat dt {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-us__stat dd {
  margin: 0;
}

.bo-us__num {
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  font-weight: var(--ek-font-weight-semibold);
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

.bo-us__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-content-subtle);
}

.bo-us__dot.is-danger {
  background: var(--ek-color-error);
}

.bo-us__na,
.bo-us__hint {
  display: block;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-us__statuses {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-4);
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.bo-us__statuses li {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
}

.bo-us__block {
  padding-top: var(--ek-space-3);
  border-top: 1px solid var(--ek-color-border-subtle);
}


.bo-us__block {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.bo-us__k {
  margin: 0 0 var(--ek-space-1);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-us__mrr {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-us__note {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-us__link {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  align-self: flex-start;
  margin-top: var(--ek-space-1);
  border-radius: var(--ek-radius-sm);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
  text-decoration: none;
}

.bo-us__link .v-icon {
  font-size: var(--ek-icon-sm);
}

@media (max-width: 600px) {
  .bo-us__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
