<!--
  PageVerdict — sayfanın üstündeki "Durum → Karar → Eylem" bloğu (K51; BO_FEEDBACK_R1 madde 6). Ayrıntılar (tablolar,
  paneller) bu bloğun ALTINDA, "Ayrıntılar" etiketinden sonra gelir.

    <PageVerdict :verdict="verdict" />      // verdict: PageVerdict | null (null → okunuyor)

  bo-r1b UYARLAYICISI: sayfalar yalnız bu bileşeni ve `utils/verdict.ts` modelini kullanır. bo-r1a'nın ortak bileşenleri
  (durum başlığı, dikkat listesi, önerilen eylem kartı) geldiğinde YALNIZ bu dosyanın içi onlara geçirilir; sayfalar değişmez.
  Güvenli eylem: `guarded` eylem sayfanın `GuardedDialog`'unu açar (step-up + gerekçe); burada yalnız bunu söyleyen not var.
-->
<template>
  <section
    class="bo-verdict"
    :class="verdict ? `is-${verdict.tone}` : 'is-loading'"
    :aria-busy="verdict ? undefined : 'true'"
    :aria-labelledby="`${uid}-summary`"
    data-testid="page-verdict"
    :data-tone="verdict?.tone ?? 'loading'"
  >
    <div class="bo-verdict__head">
      <v-icon class="bo-verdict__icon" :icon="icon" aria-hidden="true" />
      <p :id="`${uid}-summary`" class="bo-verdict__summary" data-testid="verdict-summary">
        <span class="ek-sr-only">Durum: </span>{{ verdict?.summary ?? 'Durum okunuyor…' }}
      </p>
      <EkStatusChip v-if="verdict" class="bo-verdict__badge" :tone="CHIP[verdict.tone]" :label="verdict.badge" dot data-testid="verdict-badge" />
    </div>

    <div v-if="verdict && (verdict.attention.length || verdict.actions.length)" class="bo-verdict__body" :class="{ 'has-both': verdict.attention.length && verdict.actions.length }">
      <div v-if="verdict.attention.length" class="bo-verdict__col">
        <h2 class="bo-verdict__label">Dikkat gerektirenler</h2>
        <ol class="bo-verdict__list" data-testid="verdict-attention">
          <li v-for="item in verdict.attention" :key="item.id" class="bo-verdict__item" :class="`is-${item.tone}`" :data-id="item.id">
            <span class="bo-verdict__dot" aria-hidden="true"></span>
            <span class="ek-sr-only">{{ TONE_SR[item.tone] }}: </span>
            <span class="bo-verdict__text">
              <span class="bo-verdict__title">{{ item.title }}</span>
              <span v-if="item.detail" class="bo-verdict__detail">{{ item.detail }}</span>
            </span>
            <RouterLink v-if="item.to" :to="item.to" class="bo-verdict__go">
              {{ item.cta ?? 'Göster' }}<span class="ek-sr-only"> — {{ item.title }}</span>
              <v-icon icon="mdi-arrow-right" aria-hidden="true" />
            </RouterLink>
            <button v-else-if="item.onSelect" type="button" class="bo-verdict__go" @click="item.onSelect()">
              {{ item.cta ?? 'Göster' }}<span class="ek-sr-only"> — {{ item.title }}</span>
              <v-icon :icon="item.cta === 'Tekrar dene' ? 'mdi-refresh' : 'mdi-arrow-right'" aria-hidden="true" />
            </button>
          </li>
        </ol>
      </div>

      <div v-if="verdict.actions.length" class="bo-verdict__col">
        <h2 class="bo-verdict__label">Önerilen eylemler</h2>
        <ul class="bo-verdict__actions" data-testid="verdict-actions">
          <li v-for="a in verdict.actions" :key="a.id" :data-id="a.id">
            <component
              :is="a.to ? RouterLink : 'button'"
              v-bind="a.to ? { to: a.to } : { type: 'button' }"
              class="bo-verdict__action"
              :class="{ 'is-danger': a.danger }"
              @click="a.to ? undefined : a.onSelect?.()"
            >
              <v-icon class="bo-verdict__action-icon" :icon="a.icon ?? (a.to ? 'mdi-arrow-right' : 'mdi-play-circle-outline')" aria-hidden="true" />
              <span class="bo-verdict__text">
                <span class="bo-verdict__title">{{ a.label }}</span>
                <span v-if="a.detail" class="bo-verdict__detail">{{ a.detail }}</span>
                <span v-if="a.guarded" class="bo-verdict__guard"><v-icon icon="mdi-shield-key-outline" aria-hidden="true" />Gerekçe ve kimlik doğrulaması ister</span>
              </span>
            </component>
          </li>
        </ul>
      </div>
    </div>
  </section>
  <h2 v-if="detailsLabel" class="bo-verdict-details" data-testid="details-label">{{ detailsLabel }}</h2>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import { RouterLink } from 'vue-router'
import { EkStatusChip, type StatusTone } from '@entegrasyonik/ui/components'
import type { AttentionTone, PageVerdict, VerdictTone } from '@bo/utils/verdict'

const props = withDefaults(defineProps<{ verdict: PageVerdict | null; detailsLabel?: string | false }>(), { detailsLabel: 'Ayrıntılar' })

const uid = useId()
const CHIP: Record<VerdictTone, StatusTone> = { success: 'success', warning: 'warning', error: 'danger', info: 'info', neutral: 'neutral' }
const ICON: Record<VerdictTone, string> = {
  success: 'mdi-check-circle',
  warning: 'mdi-alert',
  error: 'mdi-alert-octagon',
  info: 'mdi-information',
  neutral: 'mdi-help-circle-outline',
}
const TONE_SR: Record<AttentionTone, string> = { error: 'Şimdi müdahale', warning: 'İzlenmeli', info: 'Bilgi' }
const icon = computed(() => (props.verdict ? ICON[props.verdict.tone] : 'mdi-timer-sand'))
</script>

<style scoped>
/* Sakin kap: yüzey zemini + tonlu sol kenar; yalnız hüküm bandı tonlanır (kırmızı az görülürse görülür — ilke 2). */
.bo-verdict {
  --bo-verdict-accent: var(--ek-color-success);
  --bo-verdict-band: var(--ek-color-surface);
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-left: 3px solid var(--bo-verdict-accent);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.bo-verdict.is-warning {
  --bo-verdict-accent: var(--ek-color-warning);
  --bo-verdict-band: var(--ek-color-warning-subtle);
}

.bo-verdict.is-error {
  --bo-verdict-accent: var(--ek-color-error);
  --bo-verdict-band: var(--ek-color-error-subtle);
  border-color: var(--ek-color-error-border);
  border-left-color: var(--bo-verdict-accent);
}

.bo-verdict.is-info {
  --bo-verdict-accent: var(--ek-color-info);
}

.bo-verdict.is-neutral,
.bo-verdict.is-loading {
  --bo-verdict-accent: var(--ek-color-border-strong);
}

.bo-verdict__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-width: 0;
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--bo-verdict-band);
}

.bo-verdict__icon {
  flex: none;
  color: var(--ek-color-success-emphasis);
  font-size: var(--ek-icon-lg);
}

.bo-verdict.is-warning .bo-verdict__icon {
  color: var(--ek-color-warning-emphasis);
}

.bo-verdict.is-error .bo-verdict__icon {
  color: var(--ek-color-error-emphasis);
}

.bo-verdict.is-info .bo-verdict__icon {
  color: var(--ek-color-info-emphasis);
}

.bo-verdict.is-neutral .bo-verdict__icon,
.bo-verdict.is-loading .bo-verdict__icon {
  color: var(--ek-color-content-subtle);
}

.bo-verdict__summary {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  font-weight: var(--ek-font-weight-semibold);
}

.bo-verdict.is-loading .bo-verdict__summary {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-regular);
}

.bo-verdict__badge {
  flex: none;
}

.bo-verdict__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--ek-space-3) var(--ek-space-6);
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-4) calc(var(--ek-space-4) + var(--ek-icon-lg) + var(--ek-space-3));
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-verdict__body.has-both {
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
}

.bo-verdict__col {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.bo-verdict__label,
.bo-verdict-details {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.bo-verdict-details {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  margin-top: var(--ek-space-1);
}

.bo-verdict-details::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--ek-color-border-subtle);
}

.bo-verdict__list,
.bo-verdict__actions {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bo-verdict__actions {
  gap: var(--ek-space-1);
}

.bo-verdict__item {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  padding: var(--ek-space-2) 0;
}

.bo-verdict__item + .bo-verdict__item {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.bo-verdict__dot {
  width: 8px;
  height: 8px;
  flex: none;
  margin-top: calc((var(--ek-type-label-line) - 8px) / 2 + 2px);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-info);
}

.bo-verdict__item.is-warning .bo-verdict__dot {
  background: var(--ek-color-warning);
}

.bo-verdict__item.is-error .bo-verdict__dot {
  background: var(--ek-color-error);
}

.bo-verdict__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  padding-top: 2px;
}

.bo-verdict__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-medium);
}

.bo-verdict__detail {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.bo-verdict__go {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-1);
  min-height: 28px;
  margin: 0;
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: var(--ek-color-action-emphasis);
  font: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bo-verdict__go:hover {
  background: var(--ek-color-surface-muted);
}

.bo-verdict__go:focus-visible,
.bo-verdict__action:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-verdict__go .v-icon {
  font-size: var(--ek-icon-sm);
}

.bo-verdict__action {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  width: 100%;
  min-height: 36px;
  margin: 0;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bo-verdict__action:hover {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-muted);
}

.bo-verdict__action-icon {
  flex: none;
  margin-top: 2px;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-icon-sm);
}

.bo-verdict__action.is-danger .bo-verdict__action-icon {
  color: var(--ek-color-error-emphasis);
}

.bo-verdict__guard {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin-top: 2px;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.bo-verdict__guard .v-icon {
  font-size: var(--ek-icon-xs);
}

@media (max-width: 959px) {
  .bo-verdict__body.has-both {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 599px) {
  .bo-verdict__head {
    flex-wrap: wrap;
    padding: var(--ek-space-3);
  }

  .bo-verdict__summary {
    flex-basis: calc(100% - var(--ek-icon-lg) - var(--ek-space-3));
  }

  .bo-verdict__badge {
    margin-left: calc(var(--ek-icon-lg) + var(--ek-space-3));
  }

  .bo-verdict__body {
    padding: var(--ek-space-2) var(--ek-space-3) var(--ek-space-3);
  }

  .bo-verdict__item {
    flex-wrap: wrap;
  }

  /* Mobilde önce hüküm ve sayılar (CONSOLE_IDENTITY): açıklama satırları hedef ekranda okunur. */
  .bo-verdict__detail {
    display: none;
  }

  .bo-verdict__go {
    margin-left: calc(8px + var(--ek-space-2));
    padding-left: 0;
  }
}
</style>
