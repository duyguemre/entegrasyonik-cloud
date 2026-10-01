<!--
  frontend/src/components/dashboard/DashboardNextActions.vue

  FR3 madde 16 — ana sayfanın EN ÜSTÜ: "ilk ne yapmalıyım". Kişiselleştirilmiş selamlama + sıradaki iş (öne çıkan kutu,
  tek birincil eylem) + sonra yapılacaklar listesi + "bekleyen yok" satırı. Liste `nextActions.ts`'ten (saf, testli);
  rakamlar yalnız backend yanıtlarından. Kullanıcının menüsünde olmayan ekranın eylemi gösterilmez (yalnız bilgi).
-->
<template>
  <section class="dna" :class="{ 'dna--clear': ready && !actions.length }" aria-labelledby="dna-title">
    <header class="dna__head">
      <div class="dna__heading">
        <p class="dna__eyebrow">Bugün sırada</p>
        <h2 id="dna-title" class="dna__title">{{ headline }}</h2>
      </div>
      <p v-if="ready && actions.length" class="dna__meta">
        <span v-if="criticalCount" class="dna__meta-critical">{{ criticalCount }} acil</span>
        <span>{{ actions.length }} iş</span>
      </p>
    </header>

    <div v-if="loading" class="dna__body" aria-hidden="true">
      <div class="dna__skeleton dna__skeleton--hero"></div>
      <div class="dna__skeleton-list"><span v-for="n in 3" :key="n" class="dna__skeleton"></span></div>
    </div>

    <div v-else-if="error && !actions.length" class="dna__body dna__body--single">
      <EkErrorState size="inline" message="Bekleyen işler yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="emit('retry')" />
    </div>

    <div v-else-if="!actions.length" class="dna__body dna__body--single">
      <div class="dna__clear">
        <EkIconTile icon="mdi-check-circle-outline" tone="success" size="lg" />
        <div>
          <p class="dna__clear-title">Bekleyen işiniz yok</p>
          <p class="dna__clear-text">Siparişler, iadeler, sorular ve stok uyarıları güncel. Yeni bir iş geldiğinde ilk burada görünür.</p>
        </div>
      </div>
    </div>

    <div v-else class="dna__body">
      <!-- Sıradaki iş: öne çıkan kutu, tek birincil eylem. -->
      <article class="dna-hero" :class="`is-${first.tone}`" :data-next-action="first.key" aria-labelledby="dna-hero-title">
        <div class="dna-hero__top">
          <EkIconTile :icon="first.icon" :tone="tileTone(first.tone)" size="lg" />
          <span class="dna-hero__level" :class="{ 'is-critical': first.level === 'critical' }">{{ LEVEL_LABEL[first.level] }}</span>
        </div>
        <h3 id="dna-hero-title" class="dna-hero__title">{{ first.title }}</h3>
        <p class="dna-hero__text">{{ first.text }}</p>
        <div v-if="canOpen(first.screen)" class="dna-hero__actions">
          <EkButton tone="primary" icon="mdi-arrow-right" @click="go(first)">{{ first.actionLabel }}</EkButton>
        </div>
      </article>

      <div class="dna-next">
        <p class="dna-next__label">{{ rest.length ? 'Sonra' : 'Başka bekleyen iş yok' }}</p>
        <ul v-if="rest.length" class="dna-next__list">
          <li v-for="a in visibleRest" :key="a.key">
            <component :is="canOpen(a.screen) ? 'button' : 'div'" :type="canOpen(a.screen) ? 'button' : undefined"
              class="dna-row" :class="{ 'dna-row--link': canOpen(a.screen) }" :data-next-action="a.key"
              :aria-label="canOpen(a.screen) ? `${a.title} — ${a.actionLabel}` : undefined" @click="canOpen(a.screen) && go(a)">
              <EkIconTile :icon="a.icon" :tone="tileTone(a.tone)" size="sm" />
              <span class="dna-row__text">
                <span class="dna-row__title">{{ a.title }}</span>
                <span class="dna-row__level" :class="{ 'is-critical': a.level === 'critical' }">{{ LEVEL_LABEL[a.level] }}</span>
              </span>
              <v-icon v-if="canOpen(a.screen)" icon="mdi-chevron-right" class="dna-row__chevron" aria-hidden="true" />
            </component>
          </li>
        </ul>
        <p v-if="hiddenCount" class="dna-next__more">ve {{ hiddenCount }} iş daha — önce yukarıdakileri tamamlayın.</p>
      </div>
    </div>

    <footer v-if="ready && cleared.length" class="dna__foot">
      <v-icon icon="mdi-check" class="dna__foot-icon" aria-hidden="true" />
      <span><strong>Bekleyen yok:</strong> {{ cleared.map((c) => c.label).join(' · ') }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkButton, EkErrorState, EkIconTile, type EkTone } from '@entegrasyonik/ui/components'
import { channelName } from '@entegrasyonik/ui/tokens'
import useUser from '@/composables/user'
import { useDashboardNavigation } from './useDashboardNavigation'
import { buildNextActions, greeting, type NextAction, type NextActionLevel } from './nextActions'
import type { IntegrationHealth, OrderInsights, StockOverview } from './dashboardTypes'

const props = defineProps<{
  insights: OrderInsights | null
  stock: StockOverview | null
  health: IntegrationHealth | null
  /** Sipariş göstergeleri (ana kaynak) yükleniyor / hatalı. */
  loading: boolean
  error: boolean
}>()
const emit = defineEmits<{ retry: [] }>()

const LEVEL_LABEL: Record<NextActionLevel, string> = { critical: 'Acil', today: 'Bugün', hygiene: 'Fırsat buldukça' }
const MAX_REST = 5

const { canOpen, open } = useDashboardNavigation()
const userApi = useUser()

const built = computed(() => buildNextActions({ insights: props.insights, stock: props.stock, health: props.health, channelName: (c) => channelName(c) }))
const actions = computed(() => built.value.actions)
const cleared = computed(() => built.value.cleared)
const ready = computed(() => !props.loading && !!props.insights)
const first = computed(() => actions.value[0] as NextAction)
const rest = computed(() => actions.value.slice(1))
const visibleRest = computed(() => rest.value.slice(0, MAX_REST))
const hiddenCount = computed(() => Math.max(0, rest.value.length - MAX_REST))
const criticalCount = computed(() => actions.value.filter((a) => a.level === 'critical').length)

const headline = computed(() => {
  const name = userApi.getFirstName?.value
  const hello = `${greeting(new Date().getHours())}${name ? `, ${name}` : ''}`
  if (props.loading) return `${hello}.`
  if (!actions.value.length) return props.error ? `${hello}.` : `${hello}. Her şey yolunda.`
  return actions.value.length === 1 ? `${hello}. Sizi bekleyen bir iş var.` : `${hello}. Sizi bekleyen ${actions.value.length} iş var.`
})

const tileTone = (t: NextAction['tone']): EkTone => (t === 'danger' ? 'error' : t) as EkTone
const go = (a: NextAction) => open(a.screen, a.params)
</script>

<style scoped>
.dna {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.dna__head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ek-space-4);
  padding: var(--ek-space-5) var(--ek-space-6) var(--ek-space-4);
}

.dna__heading {
  min-width: 0;
}

.dna__eyebrow {
  margin: 0 0 var(--ek-space-1);
  color: var(--ek-color-action);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dna__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
}

.dna__meta {
  display: flex;
  flex: none;
  gap: var(--ek-space-3);
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-semibold);
}

.dna__meta-critical {
  color: var(--ek-color-error-emphasis);
}

.dna__body {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
  align-items: start;
  gap: var(--ek-space-5);
  padding: 0 var(--ek-space-6) var(--ek-space-5);
}

.dna__body--single {
  display: block;
}

/* Sıradaki iş — öne çıkan kutu: hafif farklı zemin + sol tonlu şerit (tek parlayan öğe). */
.dna-hero {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-left: 4px solid var(--ek-color-action);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
}

.dna-hero.is-danger { border-left-color: var(--ek-color-error); }
.dna-hero.is-warning { border-left-color: var(--ek-color-warning); }
.dna-hero.is-info { border-left-color: var(--ek-color-info); }
.dna-hero.is-neutral { border-left-color: var(--ek-color-border-strong); }

.dna-hero__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-3);
  margin-bottom: var(--ek-space-1);
}

.dna-hero__level {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dna-hero__level.is-critical {
  color: var(--ek-color-error-emphasis);
}

.dna-hero__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.dna-hero__text {
  margin: 0;
  max-width: 60ch;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.dna-hero__actions {
  display: flex;
  gap: var(--ek-space-2);
  margin-top: var(--ek-space-2);
}

.dna-next {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
}

.dna-next__label {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dna-next__list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dna-next__list li + li {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.dna-row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 56px;
  padding: var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-tile);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
}

.dna-row--link {
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.dna-row--link:hover {
  background: var(--ek-color-surface-muted);
}

.dna-row--link:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.dna-row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.dna-row__title {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  font-weight: var(--ek-font-weight-medium);
}

.dna-row__level {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dna-row__level.is-critical {
  color: var(--ek-color-error-emphasis);
  font-weight: var(--ek-font-weight-semibold);
}

.dna-row__chevron {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
}

.dna-next__more {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.dna__clear {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4) var(--ek-space-5);
  border: 1px solid var(--ek-color-success-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-success-subtle);
}

.dna__clear-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
}

.dna__clear-text {
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.dna__foot {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-6);
  border-top: 1px solid var(--ek-color-border-subtle);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dna__foot strong {
  color: var(--ek-color-content-default);
  font-weight: var(--ek-font-weight-semibold);
}

.dna__foot-icon {
  flex: none;
  color: var(--ek-color-success-emphasis);
  font-size: var(--ek-icon-sm);
}

.dna__skeleton,
.dna__skeleton--hero {
  display: block;
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
}

.dna__skeleton--hero {
  min-height: 168px;
}

.dna__skeleton-list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.dna__skeleton-list .dna__skeleton {
  height: 48px;
}

@media (max-width: 1099px) {
  .dna__body {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 599px) {
  .dna__head {
    flex-direction: column;
    align-items: flex-start;
    padding: var(--ek-space-4) var(--ek-space-4) var(--ek-space-3);
  }

  .dna__body {
    padding: 0 var(--ek-space-4) var(--ek-space-4);
  }

  .dna-hero {
    padding: var(--ek-space-4);
  }

  .dna__foot {
    padding: var(--ek-space-3) var(--ek-space-4);
  }
}
</style>
