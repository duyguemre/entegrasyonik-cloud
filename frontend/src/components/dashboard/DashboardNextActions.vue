<!--
  frontend/src/components/dashboard/DashboardNextActions.vue

  FR3 madde 16 — ana sayfanın EN ÜSTÜ: "ilk ne yapmalıyım". FE R4 C2 (K61) yeniden tasarım:
    · başlık: selamlama + ÖNCELİK SAYACI (Acil / Bugün / Fırsat buldukça — yalnız sıfırdan büyükler)
    · sol: SIRADAKİ İŞ — öncelik çipi, "1 / n" sırası, ikon kapsülü, sayılı başlık, neden cümlesi, tek birincil eylem
      (kutu satır yüksekliğini doldurur; eylem altta sabit)
    · sağ: SONRA — önceliğe göre gruplu liste (grup başlığında sayı), satırda eylem adı + ok; en fazla 5 satır, kalanı sayıyla
    · alt: "Bekleyen yok" — sıfır olan iş türleri onay işaretli çiplerle
    · boş: başarı kapsülü + açıklama; hata: EkErrorState + Tekrar dene; yükleme: düzeni koruyan iskelet
  Liste `nextActions.ts`'ten (saf, testli); rakamlar yalnız backend yanıtlarından. Menüde olmayan ekranın eylemi gösterilmez.
  e2e çapaları KORUNUR: `.dna`, `.dna-hero[data-next-action]`, `button[data-next-action]` (yalnız açılabilir), `.dna__foot`.
-->
<template>
  <section class="dna" :class="{ 'dna--clear': ready && !actions.length }" aria-labelledby="dna-title" :aria-busy="loading">
    <header class="dna__head">
      <div class="dna__heading">
        <p class="dna__eyebrow">Bugün sırada</p>
        <h2 id="dna-title" class="dna__title">{{ headline }}</h2>
      </div>
      <ul v-if="ready && actions.length" class="dna-tally" aria-label="Önceliğe göre bekleyen işler">
        <li v-for="g in tally" :key="g.level" class="dna-tally__item" :class="`is-${g.level}`">
          <span class="dna-tally__dot" aria-hidden="true"></span>
          <span class="dna-tally__count ek-num">{{ g.count }}</span>
          <span class="dna-tally__label">{{ LEVEL_LABEL[g.level] }}</span>
        </li>
      </ul>
    </header>

    <div v-if="loading" class="dna__body" aria-hidden="true">
      <div class="dna__skeleton dna__skeleton--hero"></div>
      <div class="dna__skeleton-list"><span v-for="n in 4" :key="n" class="dna__skeleton"></span></div>
    </div>

    <div v-else-if="error && !actions.length" class="dna__body dna__body--single">
      <EkErrorState size="inline" message="Bekleyen işler yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="emit('retry')" />
    </div>

    <div v-else-if="!actions.length" class="dna__body dna__body--single">
      <div class="dna__clear">
        <EkIconTile icon="mdi-check-circle-outline" tone="success" size="lg" />
        <div class="dna__clear-text-wrap">
          <p class="dna__clear-title">Bekleyen işiniz yok</p>
          <p class="dna__clear-text">Siparişler, iadeler, sorular ve stok uyarıları güncel. Yeni bir iş geldiğinde ilk burada görünür.</p>
        </div>
      </div>
    </div>

    <div v-else class="dna__body">
      <div class="dna-lead">
      <!-- Sıradaki iş: tek parlayan öğe, tek birincil eylem. -->
      <article class="dna-hero" :class="`is-${first.tone}`" :data-next-action="first.key" aria-labelledby="dna-hero-title">
        <div class="dna-hero__top">
          <p class="dna-hero__kicker">Sıradaki iş <span class="ek-num">· 1 / {{ actions.length }}</span></p>
          <EkStatusChip :tone="chipTone(first.level)" :label="LEVEL_LABEL[first.level]" dot />
        </div>
        <div class="dna-hero__main">
          <EkIconTile :icon="first.icon" :tone="tileTone(first.tone)" size="lg" />
          <div class="dna-hero__copy">
            <h3 id="dna-hero-title" class="dna-hero__title">{{ first.title }}</h3>
            <p class="dna-hero__text">{{ first.text }}</p>
          </div>
        </div>
        <div class="dna-hero__actions">
          <EkButton v-if="canOpen(first.screen)" tone="primary" icon="mdi-arrow-right" @click="go(first)">{{ first.actionLabel }}</EkButton>
          <p v-else class="dna-hero__noaccess">Bu işin ekranı menünüzde yok — yöneticinizden yetki isteyin.</p>
        </div>
      </article>

      <!-- Sipariş akışı sayacı: getOrderDashboardInsights.pending (backend) — iş akışı sırasıyla; sıfır = onay işareti. -->
      <dl v-if="flow.length" class="dna-flow" aria-label="Sipariş akışında bekleyenler">
        <div v-for="f in flow" :key="f.key" class="dna-flow__cell" :class="{ 'is-zero': !f.count }">
          <dt class="dna-flow__label">{{ f.label }}</dt>
          <dd class="dna-flow__value">
            <v-icon v-if="!f.count" icon="mdi-check" class="dna-flow__check" aria-hidden="true" />
            <span class="ek-num">{{ f.count.toLocaleString('tr-TR') }}</span>
          </dd>
        </div>
      </dl>
      </div>

      <div class="dna-next">
        <template v-if="restGroups.length">
          <div v-for="g in restGroups" :key="g.level" class="dna-group">
            <p class="dna-group__label" :class="`is-${g.level}`">
              <span>{{ LEVEL_LABEL[g.level] }}</span><span class="dna-group__count ek-num">{{ g.items.length }}</span>
            </p>
            <ul class="dna-next__list">
              <li v-for="a in g.items" :key="a.key">
                <component :is="canOpen(a.screen) ? 'button' : 'div'" :type="canOpen(a.screen) ? 'button' : undefined"
                  class="dna-row" :class="{ 'dna-row--link': canOpen(a.screen) }" :data-next-action="a.key"
                  :aria-label="canOpen(a.screen) ? `${a.title} — ${a.actionLabel}` : undefined" @click="canOpen(a.screen) && go(a)">
                  <EkIconTile :icon="a.icon" :tone="tileTone(a.tone)" size="sm" />
                  <span class="dna-row__text">
                    <span class="dna-row__title">{{ a.title }}</span>
                    <span class="dna-row__hint">{{ canOpen(a.screen) ? a.actionLabel : 'Yalnız bilgi' }}</span>
                  </span>
                  <v-icon v-if="canOpen(a.screen)" icon="mdi-chevron-right" class="dna-row__chevron" aria-hidden="true" />
                </component>
              </li>
            </ul>
          </div>
          <p v-if="hiddenCount" class="dna-next__more">
            <v-icon icon="mdi-dots-horizontal" aria-hidden="true" />
            <span><strong class="ek-num">{{ hiddenCount }}</strong> iş daha var — önce yukarıdakileri tamamlayın.</span>
          </p>
        </template>
        <div v-else class="dna-next__done">
          <v-icon icon="mdi-check-circle-outline" class="dna-next__done-icon" aria-hidden="true" />
          <p>Başka bekleyen iş yok. Sıradaki işi tamamladığınızda gün tamam.</p>
        </div>
      </div>
    </div>

    <footer v-if="ready && cleared.length" class="dna__foot">
      <strong class="dna__foot-label">Bekleyen yok:</strong>
      <span class="dna__foot-items">
        <template v-for="(c, i) in cleared" :key="c.key">
          <span v-if="i > 0" class="dna__foot-sep" aria-hidden="true"> · </span>
          <span class="dna__foot-item"><v-icon icon="mdi-check" class="dna__foot-icon" aria-hidden="true" />{{ c.label }}</span>
        </template>
      </span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkButton, EkErrorState, EkIconTile, EkStatusChip, type EkTone } from '@entegrasyonik/ui/components'
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
const LEVELS: NextActionLevel[] = ['critical', 'today', 'hygiene']
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

/** Sipariş akışı (kargo → fatura → iade → soru) — yalnız backend `pending` sayıları. */
const flow = computed(() => {
  const p = props.insights?.pending
  if (!p) return []
  return [
    { key: 'shipping', label: 'Kargo', count: p.shippingCount ?? 0 },
    { key: 'invoice', label: 'Fatura', count: p.invoiceCount ?? 0 },
    { key: 'claim', label: 'İade', count: p.claimCount ?? 0 },
    { key: 'message', label: 'Soru', count: p.messageCount ?? 0 },
  ]
})

/** Öncelik sayacı: tüm işler (sıradaki dahil), yalnız sıfırdan büyük seviyeler. */
const tally = computed(() =>
  LEVELS.map((level) => ({ level, count: actions.value.filter((a) => a.level === level).length })).filter((g) => g.count > 0),
)
/** "Sonra" listesi önceliğe göre gruplu (liste zaten seviye sırasında). */
const restGroups = computed(() =>
  LEVELS.map((level) => ({ level, items: visibleRest.value.filter((a) => a.level === level) })).filter((g) => g.items.length > 0),
)

const headline = computed(() => {
  const name = userApi.getFirstName?.value
  const hello = `${greeting(new Date().getHours())}${name ? `, ${name}` : ''}`
  if (props.loading) return `${hello}.`
  if (!actions.value.length) return props.error ? `${hello}.` : `${hello}. Her şey yolunda.`
  return actions.value.length === 1 ? `${hello}. Sizi bekleyen bir iş var.` : `${hello}. Sizi bekleyen ${actions.value.length} iş var.`
})

const tileTone = (t: NextAction['tone']): EkTone => (t === 'danger' ? 'error' : t) as EkTone
const chipTone = (l: NextActionLevel) => (l === 'critical' ? 'danger' : l === 'today' ? 'warning' : 'neutral') as 'danger' | 'warning' | 'neutral'
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
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ek-space-3) var(--ek-space-4);
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
  text-wrap: balance;
}

/* Öncelik sayacı — bölümlü tek kapsül: nokta + sayı + etiket. */
.dna-tally {
  display: inline-flex;
  flex: none;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
  overflow: hidden;
}

.dna-tally__item {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-1) var(--ek-space-3);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-label-line);
}

.dna-tally__item + .dna-tally__item {
  border-left: 1px solid var(--ek-color-border-default);
}

.dna-tally__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-neutral);
}

.dna-tally__item.is-critical .dna-tally__dot { background: var(--ek-color-error); }
.dna-tally__item.is-today .dna-tally__dot { background: var(--ek-color-warning); }

.dna-tally__count {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}

.dna-tally__item.is-critical .dna-tally__count { color: var(--ek-color-error-emphasis); }

.dna__body {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  align-items: stretch;
  gap: var(--ek-space-6);
  padding: 0 var(--ek-space-6) var(--ek-space-5);
}

.dna__body--single {
  display: block;
}

.dna-lead {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  min-width: 0;
}

.dna-lead > .dna-hero {
  flex: 1 1 auto;
}

/* Sipariş akışı — 4 hücreli yatay sayaç; bekleyen varsa sayı güçlü, sıfırsa başarı onayı. */
.dna-flow {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  overflow: hidden;
}

.dna-flow__cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--ek-space-2) var(--ek-space-3);
}

.dna-flow__cell + .dna-flow__cell {
  border-left: 1px solid var(--ek-color-border-subtle);
}

.dna-flow__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dna-flow__value {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-semibold);
}

.dna-flow__cell.is-zero .dna-flow__value {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-medium);
}

.dna-flow__check {
  color: var(--ek-color-success-emphasis);
  font-size: var(--ek-icon-sm);
}

/* Sıradaki iş — çukur zemin + sol tonlu şerit; satır yüksekliğini doldurur, eylem altta. */
.dna-hero {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-left: 4px solid var(--ek-color-action);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-sunken);
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
}

.dna-hero__kicker {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dna-hero__main {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-4);
}

.dna-hero__copy {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
  min-width: 0;
}

.dna-hero__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
  text-wrap: balance;
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
  margin-top: auto;
  padding-top: var(--ek-space-1);
}

.dna-hero__noaccess {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dna-next {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
}

.dna-group {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-1);
}

.dna-group__label {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0 var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dna-group__label.is-critical { color: var(--ek-color-error-emphasis); }

.dna-group__count {
  min-width: 18px;
  padding: 0 5px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
  text-align: center;
  letter-spacing: 0;
}

.dna-group__label.is-critical .dna-group__count {
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
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
  min-height: 48px;
  padding: var(--ek-space-1) var(--ek-space-2);
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

.dna-row__hint {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dna-row--link .dna-row__hint {
  color: var(--ek-color-action-emphasis);
}

.dna-row__chevron {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
  transition: var(--ek-transition-colors);
}

.dna-row--link:hover .dna-row__chevron {
  color: var(--ek-color-action);
}

.dna-next__more {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0 var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dna-next__more strong {
  color: var(--ek-color-content-strong);
}

.dna-next__done {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  height: 100%;
  min-height: 96px;
  padding: var(--ek-space-4);
  border: 1px dashed var(--ek-color-border-strong);
  border-radius: var(--ek-radius-card);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.dna-next__done p {
  margin: 0;
}

.dna-next__done-icon {
  flex: none;
  color: var(--ek-color-success-emphasis);
  font-size: var(--ek-icon-lg);
}

.dna__clear {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
  padding: var(--ek-space-5);
  border: 1px solid var(--ek-color-success-border);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-success-subtle);
}

.dna__clear-text-wrap {
  min-width: 0;
}

.dna__clear-title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
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
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2) var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-6);
  border-top: 1px solid var(--ek-color-border-subtle);
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dna__foot-label {
  color: var(--ek-color-content-default);
  font-weight: var(--ek-font-weight-semibold);
}

.dna__foot-items {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}

/* Ayraç metni (" · ") ekran okuyucuya ve metin içeriğine kalır; görselde çipler arasında yalnız boşluk. */
.dna__foot-sep {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: pre;
}

.dna__foot-item {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  padding: 0 var(--ek-space-2);
  border: 1px solid var(--ek-color-success-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-success-subtle);
  color: var(--ek-color-success-emphasis);
  font-weight: var(--ek-font-weight-medium);
  line-height: 22px;
}

.dna__foot-icon {
  flex: none;
  font-size: var(--ek-icon-xs);
}

.dna__skeleton,
.dna__skeleton--hero {
  display: block;
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface-muted);
}

.dna__skeleton--hero {
  min-height: 196px;
}

.dna__skeleton-list {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
}

.dna__skeleton-list .dna__skeleton {
  height: 44px;
}

@media (max-width: 1099px) {
  .dna__body {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ek-space-5);
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

  .dna-hero__main {
    flex-direction: column;
    gap: var(--ek-space-3);
  }

  .dna-tally {
    max-width: 100%;
  }

  .dna-tally__item {
    padding: var(--ek-space-1) var(--ek-space-2);
  }

  .dna__foot {
    padding: var(--ek-space-3) var(--ek-space-4);
  }
}
</style>
