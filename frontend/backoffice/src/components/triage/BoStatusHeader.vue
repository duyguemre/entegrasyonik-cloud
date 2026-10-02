<!--
  BoStatusHeader — DURUM (BO_UI_PATTERNS §11.1). Sayfanın ilk satırı: "Mevcut durumdan ne anlamalıyım?"
  Tek cümlelik hüküm + sağlık rozeti + (isteğe bağlı) bağlantılı özet maddeleri; varsayılan slot "önerilen ilk adım"
  (BoActionCard) içindir. "Her şey yolunda" (`health="ok"`) sakin yüzeyde, yeşil yalnız ikon ve rozette.

    <BoStatusHeader :health="health" verdict="2 konu şimdi müdahale istiyor" summary="…"
      :facts="[{ label: 'Sistem', value: '1 kritik', href: '#sistem', tone: 'critical' }]">
      <BoActionCard … />
    </BoStatusHeader>
-->
<template>
  <section class="bo-sh" :class="`is-${loading ? 'loading' : health}`" :aria-busy="loading || undefined" :aria-label="label" data-testid="status-header">
    <div class="bo-sh__main">
      <span class="bo-sh__icon" aria-hidden="true">
        <v-icon :icon="loading ? 'mdi-timer-sand' : badge.icon" />
      </span>
      <div class="bo-sh__text" role="status" aria-live="polite">
        <template v-if="loading">
          <span class="bo-sh__skeleton bo-sh__skeleton--title" aria-hidden="true"></span>
          <span class="bo-sh__skeleton" aria-hidden="true"></span>
          <span class="ek-sr-only">Durum denetleniyor…</span>
        </template>
        <template v-else>
          <p class="bo-sh__verdict" data-testid="status-verdict">{{ verdict }}</p>
          <p v-if="summary" class="bo-sh__summary">{{ summary }}</p>
        </template>
      </div>
      <EkStatusChip v-if="!loading" class="bo-sh__badge" :tone="badge.tone" :label="badgeLabel ?? badge.label" :icon="badge.icon" data-testid="health-badge" />
    </div>
    <ul v-if="!loading && facts?.length" class="bo-sh__facts" aria-label="Özet">
      <li v-for="f in facts" :key="f.label">
        <!-- bo-wdg: `href` yalnız <a>'ya, `to` yalnız RouterLink'e bağlanır (RouterLink'e `href=undefined` geçmesi href'siz <a> üretiyordu). -->
        <component :is="f.href ? 'a' : f.to ? RouterLink : 'span'" v-bind="factLink(f)" class="bo-sh__fact" :class="[`is-${f.tone ?? 'ok'}`, { 'is-link': f.href || f.to }]">
          <span class="bo-sh__fact-dot" aria-hidden="true"></span>
          <span class="bo-sh__fact-label">{{ f.label }}</span>
          <span class="bo-sh__fact-value">{{ f.value }}</span>
        </component>
      </li>
    </ul>
    <div v-if="!loading && $slots.default" class="bo-sh__next"><slot /></div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import { EkStatusChip } from '@entegrasyonik/ui/components'
import { HEALTH_BADGE, type Health } from './triage'

export interface StatusFact {
  label: string
  value: string
  tone?: Health
  /** Sayfa içi bölüm (`#sistem`) ya da başka ekran. */
  href?: string
  to?: RouteLocationRaw
}

const props = withDefaults(
  defineProps<{
    health: Health
    /** Tek cümle hüküm: "Her şey yolunda" / "2 konu şimdi müdahale istiyor". */
    verdict: string
    /** İsteğe bağlı ikinci cümle: neye bakıldı, ne kadar sürdü. */
    summary?: string
    facts?: StatusFact[]
    /** Rozet metnini ezmek için (ör. "Kısmi bozulma"). */
    badgeLabel?: string
    loading?: boolean
    label?: string
  }>(),
  { label: 'Genel durum' },
)

const badge = computed(() => HEALTH_BADGE[props.health])
/** Özet maddesinin bağlantı öznitelikleri: sayfa içi çapa `href`, ekran `to`; ikisi de yoksa düz metin. */
function factLink(f: StatusFact): Record<string, unknown> {
  if (f.href) return { href: f.href }
  if (f.to) return { to: f.to }
  return {}
}
</script>

<style scoped>
.bo-sh {
  --bo-sh-accent: var(--ek-color-success);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  padding: var(--ek-space-4) var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-left: 4px solid var(--bo-sh-accent);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

/* Sorun varken de yüzey sakin kalır: ton sol çizgi, ikon ve rozette (kırmızı az olursa görülür). */
.bo-sh.is-warning {
  --bo-sh-accent: var(--ek-color-warning);
  border-color: var(--ek-color-warning-border);
  border-left-color: var(--bo-sh-accent);
}

.bo-sh.is-critical {
  --bo-sh-accent: var(--ek-color-error);
  border-color: var(--ek-color-error-border);
  border-left-color: var(--bo-sh-accent);
}

.bo-sh.is-unknown,
.bo-sh.is-loading {
  --bo-sh-accent: var(--ek-color-border-strong);
}

.bo-sh__main {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}

.bo-sh__icon {
  display: inline-flex;
  flex: none;
  color: var(--bo-sh-accent);
  font-size: var(--ek-icon-lg);
}

.bo-sh.is-warning .bo-sh__icon {
  color: var(--ek-color-warning-emphasis);
}

.bo-sh.is-critical .bo-sh__icon {
  color: var(--ek-color-error-emphasis);
}

.bo-sh.is-unknown .bo-sh__icon,
.bo-sh.is-loading .bo-sh__icon {
  color: var(--ek-color-content-muted);
}

.bo-sh__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bo-sh__verdict {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  font-weight: var(--ek-font-weight-semibold);
  line-height: 1.35;
}

.bo-sh__summary {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.bo-sh__badge {
  flex: none;
}

.bo-sh__skeleton {
  display: block;
  width: 60%;
  height: 12px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.bo-sh__skeleton--title {
  width: 40%;
  height: 18px;
  margin-bottom: var(--ek-space-1);
}

.bo-sh__facts {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0 0 0 calc(var(--ek-icon-lg) + var(--ek-space-3));
  list-style: none;
}

.bo-sh__fact {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 32px;
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
  text-decoration: none;
  transition: var(--ek-transition-colors);
}

.bo-sh__fact.is-link:hover {
  border-color: var(--ek-color-border-strong);
}

.bo-sh__fact:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-sh__fact-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-success);
}

.bo-sh__fact.is-warning .bo-sh__fact-dot {
  background: var(--ek-color-warning);
}

.bo-sh__fact.is-critical .bo-sh__fact-dot {
  background: var(--ek-color-error);
}

.bo-sh__fact.is-unknown .bo-sh__fact-dot {
  background: var(--ek-color-content-subtle);
}

.bo-sh__fact-label {
  color: var(--ek-color-content-muted);
}

.bo-sh__fact-value {
  color: var(--ek-color-content-strong);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-sh__next {
  padding-left: calc(var(--ek-icon-lg) + var(--ek-space-3));
}

@media (max-width: 600px) {
  .bo-sh {
    padding: var(--ek-space-3) var(--ek-space-4);
  }

  .bo-sh__main {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .bo-sh__text {
    flex: 1 1 calc(100% - var(--ek-icon-lg) - var(--ek-space-3));
  }

  .bo-sh__verdict {
    font-size: var(--ek-type-body-size);
  }

  .bo-sh__badge {
    margin-left: calc(var(--ek-icon-lg) + var(--ek-space-3));
  }

  .bo-sh__facts,
  .bo-sh__next {
    padding-left: 0;
  }
}
</style>
