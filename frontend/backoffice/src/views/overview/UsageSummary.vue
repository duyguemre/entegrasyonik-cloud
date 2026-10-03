<!--
  UsageSummary — "Müşteri tabanı ve abonelik" kutusunun içeriği. Okuma sırası:
    1. Müşteriler: aktif sayı (büyük) + toplam içindeki payı → durum dağılımı tek yatay çubukta + yüzdeli lejant
    2. Abonelik akışı: Denemede → Ücretli, yanında Kayıp (30 gün) — her adım ilgili listeye bağlı
  Renk yalnız anlamlı dilimde (Aktif yeşil, başarısız kırmızı, bekleyen sarımsı). Okunamayan blok nedeniyle söylenir.
-->
<template>
  <div class="ov-us" data-testid="usage-summary">
    <section class="ov-us__block" aria-label="Müşteriler">
      <h3 class="ov-us__k">Müşteriler</h3>
      <template v-if="dist">
        <p class="ov-us__lead">
          <span class="ov-us__num ek-num">{{ dist.activeText }}</span>
          <span class="ov-us__lead-text">aktif müşteri<span class="ov-us__lead-sub"> · toplam {{ dist.totalText }} içinde %{{ dist.activePct }}</span></span>
        </p>
        <div class="ov-us__bar" role="img" :aria-label="dist.aria">
          <span v-for="sg in dist.segments" :key="sg.key" class="ov-us__seg" :class="`is-${sg.tone}`" :style="{ flexGrow: sg.value }" :title="`${sg.label}: ${sg.valueText}`"></span>
        </div>
        <ul class="ov-us__legend" aria-hidden="true">
          <li v-for="sg in dist.segments" :key="sg.key">
            <i class="ov-us__dot" :class="`is-${sg.tone}`"></i>
            <span class="ov-us__legend-label">{{ sg.label }}</span>
            <b class="ek-num">{{ sg.valueText }}</b>
            <span class="ov-us__legend-pct ek-num">%{{ sg.pct }}</span>
          </li>
        </ul>
      </template>
      <p v-else class="ov-us__na">
        Müşteri sayıları okunamadı.
        <button type="button" class="bo-link-btn" @click="emit('retry')">Yeniden dene</button>
      </p>
    </section>

    <section class="ov-us__block" aria-label="Abonelik akışı">
      <h3 class="ov-us__k">Abonelik akışı</h3>
      <div v-if="subs" class="ov-us__flow">
        <RouterLink :to="{ name: 'subscriptions', query: { durum: 'trialing' } }" class="ov-us__step" :aria-label="`Denemede: ${subs.trialing} — listeyi aç`">
          <span class="ov-us__step-k">Denemede</span>
          <span class="ov-us__step-num ek-num">{{ subs.trialing }}</span>
          <span class="ov-us__step-help">Ücretliye dönüşmeyi bekliyor</span>
        </RouterLink>
        <v-icon class="ov-us__arrow" icon="mdi-arrow-right" aria-hidden="true" />
        <RouterLink :to="{ name: 'subscriptions' }" class="ov-us__step is-paid" :aria-label="`Ücretli abonelik: ${subs.paid} — listeyi aç`">
          <span class="ov-us__step-k">Ücretli</span>
          <span class="ov-us__step-num ek-num">{{ subs.paid }}</span>
          <span class="ov-us__step-help">Gelir getiren abonelik</span>
        </RouterLink>
        <RouterLink :to="{ name: 'subscriptions' }" class="ov-us__step is-lost" :class="{ 'has-loss': subs.lostRaw > 0 }" :aria-label="`Kayıp, son 30 gün: ${subs.lost} — listeyi aç`">
          <span class="ov-us__step-k">Kayıp · 30 gün</span>
          <span class="ov-us__step-num ek-num">{{ subs.lost }}</span>
          <span class="ov-us__step-help">İptal ya da süre dolumu</span>
        </RouterLink>
      </div>
      <p v-else class="ov-us__na">
        {{ mrrNote }}
        <button v-if="model.usage.mrr.state === 'degraded'" type="button" class="bo-link-btn" @click="emit('retry')">Yeniden dene</button>
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PulseModel } from '@bo/api/attention'
import type { TenantStatus } from '@bo/api/contract'
import { TENANT_STATUS } from '@bo/utils/labels'

const props = defineProps<{ model: PulseModel }>()
// Okunamayan blokta "Yeniden dene": sayfa özeti yeniden yüklenir (genel bakış `load`).
const emit = defineEmits<{ retry: [] }>()
const nf = new Intl.NumberFormat('tr-TR')
const TONE: Record<string, string> = { success: 'ok', danger: 'critical', warning: 'warning', info: 'info', neutral: 'neutral' }

const dist = computed(() => {
  const t = props.model.usage.tenants
  if (t.state !== 'ok') return null
  const entries = Object.entries(t.byStatus).filter(([, n]) => n > 0)
  entries.sort((a, b) => (a[0] === 'ACTIVE' ? -1 : b[0] === 'ACTIVE' ? 1 : b[1] - a[1]))
  const total = t.total || entries.reduce((s, [, n]) => s + n, 0) || 1
  const segments = entries.map(([k, n]) => ({
    key: k,
    label: TENANT_STATUS[k as TenantStatus]?.label ?? k,
    tone: TONE[TENANT_STATUS[k as TenantStatus]?.tone ?? 'neutral'],
    value: n,
    valueText: nf.format(n),
    pct: Math.round((n / total) * 100),
  }))
  return {
    segments,
    activeText: nf.format(t.active),
    totalText: nf.format(t.total),
    activePct: Math.round((t.active / total) * 100),
    aria: `Müşteri durumları: ${segments.map((s) => `${s.label} ${s.valueText}`).join(', ')}`,
  }
})

const subs = computed(() => {
  const m = props.model.usage.mrr
  if (m.state !== 'ok') return null
  return { trialing: nf.format(m.trialing), paid: nf.format(m.activeSubscriptions), lost: nf.format(m.lostLast30d), lostRaw: m.lostLast30d }
})
const mrrNote = computed(() => {
  const m = props.model.usage.mrr
  return m.state === 'na' ? `Abonelik sayıları hesaplanamadı: ${m.note}.` : 'Abonelik sayıları okunamadı.'
})
</script>

<style scoped>
.ov-us {
  --ov-warn-fill: var(--bo-warn-fill);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
}


.ov-us__block {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
}

.ov-us__k {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

/* 1 · müşteriler */
.ov-us__lead {
  display: flex;
  align-items: baseline;
  gap: var(--ek-space-2);
  margin: 0;
}

.ov-us__num {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-display-size);
  line-height: 1.1;
  font-weight: var(--ek-type-display-weight);
  letter-spacing: var(--ek-type-display-tracking);
}

.ov-us__lead-text {
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-medium);
}

.ov-us__lead-sub {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.ov-us__bar {
  display: flex;
  gap: 2px;
  height: 10px;
  overflow: hidden;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-surface-sunken);
}

.ov-us__seg {
  flex-basis: 0;
  min-width: 4px;
}

.ov-us__seg.is-ok,
.ov-us__dot.is-ok {
  background: var(--ek-color-success);
}

.ov-us__seg.is-critical,
.ov-us__dot.is-critical {
  background: var(--ek-color-error);
}

.ov-us__seg.is-warning,
.ov-us__dot.is-warning {
  background: var(--ov-warn-fill);
}

.ov-us__seg.is-info,
.ov-us__dot.is-info {
  background: var(--ek-color-info);
}

.ov-us__seg.is-neutral,
.ov-us__dot.is-neutral {
  background: var(--ek-color-content-subtle);
}

.ov-us__legend {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: var(--ek-space-1) var(--ek-space-4);
  margin: var(--ek-space-1) 0 0;
  padding: 0;
  list-style: none;
}

.ov-us__legend li {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
  font-size: var(--ek-type-label-size);
}

.ov-us__dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.ov-us__legend-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-default);
}

.ov-us__legend b {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.ov-us__legend-pct {
  width: 40px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  text-align: right;
}

/* 2 · abonelik akışı */
.ov-us__flow {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) minmax(0, 1fr);
  align-items: stretch;
  gap: var(--ek-space-2);
}

.ov-us__arrow {
  align-self: center;
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-md);
}

.ov-us__step {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
  color: inherit;
  text-decoration: none;
  transition: var(--ek-transition-colors);
}

.ov-us__step:hover {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-muted);
}

.ov-us__step:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ov-us__step.is-paid {
  border-color: color-mix(in srgb, var(--ek-color-success) 35%, var(--ek-color-border-subtle));
  background: color-mix(in srgb, var(--ek-color-success) 6%, var(--ek-color-surface));
}

.ov-us__step.is-lost {
  margin-left: var(--ek-space-2);
}

.ov-us__step.is-lost.has-loss .ov-us__step-num {
  color: var(--ek-color-error-emphasis);
}

.ov-us__step-k {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ov-us__step-num {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-metric-size);
  line-height: var(--ek-type-metric-line);
  font-weight: var(--ek-type-metric-weight);
}

.ov-us__step-help {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.ov-us__na {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
}

@media (max-width: 600px) {
  .ov-us__flow {
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  }

  .ov-us__step.is-lost {
    grid-column: 1 / -1;
    margin-left: 0;
  }

  .ov-us__step-help {
    white-space: normal;
  }
}

/* ================= BO-LOCAL-01 — müşteri tabanı: uygulamanın tasarım diliyle =================
   Alt başlıklar kısa eylem çizgili mikro etiket. Abonelik adımları düz yüzey + ince çerçeve + kutu köşesi; ücretli adım
   başarı tonunun düz açık zemini + ince ton çerçevesi; üzerine gelince yalnız eylem çerçevesi (gölge yok). */
.ov-us__k {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ov-us__k::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.ov-us__step {
  border-color: var(--ek-color-border-default);
  border-radius: var(--ek-radius-tile);
}

.ov-us__step:hover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.ov-us__step.is-paid {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
}

.ov-us__step.is-paid:hover {
  border-color: var(--ek-color-success);
  background: var(--ek-color-success-subtle);
}

.ov-us__step-k {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}
</style>
