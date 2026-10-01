<!--
  BoActionCard — EYLEM (BO_UI_PATTERNS §11.3). "Nasıl müdahale ederim?" sorusunun tek, somut cevabı: neden + ne olacak +
  tek düğme. Gezinme eylemi `to` ile (hedef ekran, süzgeç uygulanmış); yerinde güvenli eylem `@act` ile ve `guarded`
  işaretlenir (sayfa `useGuardedAction` + `GuardedDialog` açar; step-up + gerekçe — kart kendisi yazma yapmaz).

    <BoActionCard eyebrow="Önerilen ilk adım" title="Ölü mektuptaki 1 işi inceleyin"
      text="Kalıcı hata; kendiliğinden yeniden denenmez." action-label="Ölü mektupları aç" :to="{ name: 'engine', query: { … } }" />
    <BoActionCard title="Denemeyi 14 gün uzatın" action-label="Uzat…" guarded @act="extend.open(tid)" />
-->
<template>
  <article class="bo-ac" :class="`is-${tone}`" data-testid="action-card">
    <v-icon class="bo-ac__icon" :icon="icon" aria-hidden="true" />
    <div class="bo-ac__body">
      <p v-if="eyebrow" class="bo-ac__eyebrow">{{ eyebrow }}</p>
      <component :is="`h${headingLevel}`" class="bo-ac__title">{{ title }}</component>
      <p v-if="text" class="bo-ac__text">{{ text }}</p>
      <p v-if="guarded" class="bo-ac__guard"><v-icon icon="mdi-shield-lock-outline" aria-hidden="true" />Kimlik doğrulama ve gerekçe istenir; işlem denetime yazılır.</p>
    </div>
    <div class="bo-ac__cta">
      <RouterLink v-if="to" :to="to" class="bo-act-link" :class="{ 'is-primary': tone !== 'neutral' }" data-testid="action-card-go">
        {{ actionLabel }}<v-icon icon="mdi-arrow-right" aria-hidden="true" />
      </RouterLink>
      <EkButton v-else :tone="tone === 'critical' ? 'primary' : 'secondary'" :icon="guarded ? 'mdi-shield-lock-outline' : undefined" :loading="busy" @click="$emit('act')">{{ actionLabel }}</EkButton>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { EkButton } from '@entegrasyonik/ui/components'
import '@bo/styles/kit.css'

withDefaults(
  defineProps<{
    title: string
    text?: string
    actionLabel: string
    to?: RouteLocationRaw
    eyebrow?: string
    icon?: string
    tone?: 'critical' | 'warning' | 'neutral'
    /** Yerinde yazma eylemi step-up + gerekçe ister (görsel not; akış sayfadadır). */
    guarded?: boolean
    busy?: boolean
    headingLevel?: 2 | 3 | 4
  }>(),
  { icon: 'mdi-lightbulb-on-outline', tone: 'neutral', headingLevel: 3 },
)
defineEmits<{ act: [] }>()
</script>

<style scoped>
.bo-ac {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
}

.bo-ac__icon {
  align-self: start;
  margin-top: 2px;
  color: var(--ek-color-action);
  font-size: var(--ek-icon-md);
}

.bo-ac.is-critical .bo-ac__icon {
  color: var(--ek-color-error-emphasis);
}

.bo-ac.is-warning .bo-ac__icon {
  color: var(--ek-color-warning-emphasis);
}

.bo-ac__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.bo-ac__eyebrow {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-ac__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-ac__text {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-label-size);
}

.bo-ac__guard {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 2px 0 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-ac__guard .v-icon {
  font-size: var(--ek-icon-sm);
}

@media (max-width: 600px) {
  .bo-ac {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .bo-ac__cta {
    grid-column: 1 / -1;
  }
}
</style>
