<!--
  MOB-08 / K51 — kullanım bölümünün üst kısmı: Durum (hüküm + tek cümle) → Karar (müdahale gerekir mi?) → Eylem (en çok 3
  bağlantı). Ayrıntı bu bloğun ALTINDA, çağıran ekrandadır. Renk tek başına anlam taşımaz: her kararın başlığı metinle söyler.
-->
<template>
  <section class="bo-uv" :class="`is-${verdict.tone}`" :aria-labelledby="`${idBase}-title`" data-testid="usage-verdict">
    <div class="bo-uv__status" role="status">
      <v-icon :icon="ICON[verdict.tone]" aria-hidden="true" class="bo-uv__icon" />
      <div>
        <h2 :id="`${idBase}-title`" class="bo-uv__title">{{ verdict.title }}</h2>
        <p class="bo-uv__sentence">{{ verdict.sentence }}</p>
      </div>
    </div>
    <div class="bo-uv__body">
      <div class="bo-uv__col">
        <h3 class="bo-uv__label">Müdahale gerekir mi?</h3>
        <ul class="bo-uv__decisions" data-testid="usage-decisions">
          <li v-for="d in verdict.decisions" :key="d.key" class="bo-uv__decision" :class="`is-${d.tone}`">
            <span class="bo-uv__dot" aria-hidden="true"></span>
            <div>
              <strong>{{ d.title }}</strong>
              <span class="bo-uv__why">{{ d.why }}</span>
            </div>
          </li>
        </ul>
      </div>
      <div v-if="verdict.actions.length" class="bo-uv__col">
        <h3 class="bo-uv__label">Ne yapılabilir?</h3>
        <ul class="bo-uv__actions" data-testid="usage-actions">
          <li v-for="a in verdict.actions" :key="a.key">
            <RouterLink :to="a.to" class="bo-uv__action">
              <v-icon :icon="a.icon" aria-hidden="true" />
              <span>{{ a.label }}</span>
              <v-icon icon="mdi-arrow-right" aria-hidden="true" class="bo-uv__go" />
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { UsageVerdict, VerdictTone } from './usageVerdict'

defineProps<{ verdict: UsageVerdict; idBase: string }>()
const ICON: Record<VerdictTone, string> = {
  success: 'mdi-check-circle-outline',
  info: 'mdi-information-outline',
  warning: 'mdi-alert-outline',
  error: 'mdi-alert-octagon-outline',
  neutral: 'mdi-timer-sand',
}
</script>

<style scoped>
.bo-uv {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-left-width: 3px;
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}
.bo-uv.is-success { border-left-color: var(--ek-color-success); }
.bo-uv.is-warning { border-left-color: var(--ek-color-warning); }
.bo-uv.is-error { border-left-color: var(--ek-color-error); }
.bo-uv.is-neutral,
.bo-uv.is-info { border-left-color: var(--ek-color-border-strong); }
.bo-uv__status {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-3);
}
.bo-uv__icon { flex: none; color: var(--ek-color-content-muted); }
.bo-uv.is-success .bo-uv__icon { color: var(--ek-color-success-emphasis); }
.bo-uv.is-warning .bo-uv__icon { color: var(--ek-color-warning-emphasis); }
.bo-uv.is-error .bo-uv__icon { color: var(--ek-color-error-emphasis); }
.bo-uv__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-semibold);
}
.bo-uv__sentence {
  margin: var(--ek-space-1) 0 0;
  color: var(--ek-color-content-muted);
}
.bo-uv__body {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--ek-space-4);
}
@media (max-width: 767px) {
  .bo-uv__body { grid-template-columns: minmax(0, 1fr); }
}
.bo-uv__label {
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}
.bo-uv__decisions,
.bo-uv__actions {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}
.bo-uv__decision {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  font-size: var(--ek-type-label-size);
}
.bo-uv__decision strong { display: block; color: var(--ek-color-content-strong); }
.bo-uv__why { display: block; color: var(--ek-color-content-muted); }
.bo-uv__dot {
  width: 8px;
  height: 8px;
  flex: none;
  margin-top: 6px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-border-strong);
}
.bo-uv__decision.is-success .bo-uv__dot { background: var(--ek-color-success); }
.bo-uv__decision.is-warning .bo-uv__dot { background: var(--ek-color-warning); }
.bo-uv__decision.is-error .bo-uv__dot { background: var(--ek-color-error); }
.bo-uv__decision.is-info .bo-uv__dot { background: var(--ek-color-action); }
.bo-uv__action {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 40px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  text-decoration: none;
  transition: var(--ek-transition-colors);
}
.bo-uv__action:hover { border-color: var(--ek-color-border-strong); }
.bo-uv__action:focus-visible { outline: none; box-shadow: var(--ek-focus-ring); }
.bo-uv__go { margin-left: auto; color: var(--ek-color-content-muted); }
</style>
