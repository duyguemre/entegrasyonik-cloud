<!--
  frontend/src/components/dashboard/DashboardNextActions.vue

  FR3 madde 16 — ana sayfanın EN ÜSTÜ: "ilk ne yapmalıyım". FE-LOCAL-1026 (kullanıcı: "çok yazı var, daha yönlendirici
  olmalı") — az metin, emir kipi:
    1) başlık: selamlama + öncelik özeti (Acil / Bugün / Fırsat buldukça — yalnız sıfırdan büyükler; halka renklerinin anahtarı)
    2) gövde, iki sütun (iç içe kutu yok, ince çizgi):
       · sol  SIRADAKİ İŞ — öncelik çipi, "Sıradaki iş · 1 / n", büyük rakam + başlık, TEK kısa yönerge, TEK birincil eylem
       · sağ  SONRA — yapılacaklar listesi: boş halka (öncelik renginde) + kısa görev cümlesi ("2 siparişi kargoya verin")
              + ok. Satırda eylem adı / açıklama yazısı yok; yetki yoksa yalnız kilit. En fazla 4 satır, kalanı açılır.
  Sipariş akışı şeridi kaldırıldı (aynı sayılar listede zaten görev olarak duruyor; yalnız bilgi veriyordu).
  Boş: sakin başarı satırı; hata: EkErrorState + Tekrar dene; yükleme: düzeni koruyan iskelet.
  Liste `nextActions.ts`'ten (saf, testli); rakamlar yalnız backend yanıtlarından. Menüde olmayan ekranın eylemi gösterilmez.
  e2e çapaları: `.dna`, `.dna-hero[data-next-action]`, `button[data-next-action]` (yalnız açılabilir).
-->
<template>
  <section class="dna" aria-labelledby="dna-title" :aria-busy="loading">
    <header class="dna__head">
      <div class="dna__heading">
        <p class="dna__eyebrow">Bugün sırada</p>
        <!-- FE-LOCAL-1051 (kullanıcı kararı): selamlama cümlesi ekranda gösterilmez; bölümün erişilebilir adı olarak kalır. -->
        <h2 id="dna-title" class="dna__title ek-sr-only">{{ headline }}</h2>
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
      <div class="dna-hero">
        <span class="dna__skeleton dna__skeleton--chip"></span>
        <span class="dna__skeleton dna__skeleton--title"></span>
        <span class="dna__skeleton dna__skeleton--line"></span>
        <span class="dna__skeleton dna__skeleton--button"></span>
      </div>
      <div class="dna-next">
        <span v-for="n in 4" :key="n" class="dna__skeleton dna__skeleton--row"></span>
      </div>
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
      <!-- Sıradaki iş: tek parlayan öğe, tek birincil eylem. -->
      <article class="dna-hero" :class="`is-${first.tone}`" :data-next-action="first.key" aria-labelledby="dna-hero-title">
        <div class="dna-hero__top">
          <!-- Öncelik etiketi ("Acil" vb.) anlamı taşır; yanındaki ikon kutusu tekrar olduğu için kaldırıldı (kullanıcı kararı). -->
          <EkStatusChip :tone="chipTone(first.level)" :label="LEVEL_LABEL[first.level]" dot />
          <span class="dna-hero__kicker">Sıradaki iş · <span class="ek-num">1 / {{ actions.length }}</span></span>
        </div>
        <div class="dna-hero__copy">
          <!-- Sayıyla başlayan başlıkta sayı büyük rakam olur; sayı yoksa yerinde işin ikonu durur. -->
          <h3 id="dna-hero-title" class="dna-hero__title" :class="{ 'has-figure': heroTitle.figure }">
            <span v-if="heroTitle.figure" class="dna-hero__figure ek-num">{{ heroTitle.figure }}</span>{{ heroTitle.figure ? ' ' : '' }}<span class="dna-hero__label">{{ heroTitle.rest }}</span>
          </h3>
          <p class="dna-hero__text">{{ first.text }}</p>
        </div>
        <div class="dna-hero__actions">
          <EkButton v-if="canOpen(first.screen)" tone="primary" icon="mdi-arrow-right" @click="go(first)">{{ first.actionLabel }}</EkButton>
          <p v-else class="dna-hero__noaccess">
            <v-icon icon="mdi-lock-outline" aria-hidden="true" />
            <span>Bu ekran için yöneticinizden yetki isteyin.</span>
          </p>
        </div>
      </article>

      <div class="dna-next">
        <template v-if="rest.length">
          <p id="dna-next-title" class="dna-next__title">Sonra</p>
          <ol class="dna-next__list" aria-labelledby="dna-next-title">
            <li v-for="a in visibleRest" :key="a.key">
              <component :is="canOpen(a.screen) ? 'button' : 'div'" :type="canOpen(a.screen) ? 'button' : undefined"
                class="dna-row" :class="[`is-${a.level}`, { 'dna-row--link': canOpen(a.screen) }]" :data-next-action="a.key"
                :aria-label="canOpen(a.screen) ? `${LEVEL_LABEL[a.level]}: ${a.task} — ${a.actionLabel}` : undefined" @click="canOpen(a.screen) && go(a)">
                <!-- İşin ikonu kendi tonunda (kargo turuncu, fatura mavi…); soldaki ince şerit önceliği taşır. -->
                <EkIconTile :icon="a.icon" :tone="tileTone(a.tone)" size="sm" />
                <span class="dna-row__title"><template v-if="splitFigure(a.task).figure"><strong class="dna-row__figure ek-num">{{ splitFigure(a.task).figure }}</strong>{{ ' ' }}</template>{{ splitFigure(a.task).rest }}</span>
                <span v-if="canOpen(a.screen)" class="dna-row__go" aria-hidden="true"><v-icon icon="mdi-arrow-right" /></span>
                <span v-else class="dna-row__lock" title="Bu ekran için yöneticinizden yetki isteyin.">
                  <v-icon icon="mdi-lock-outline" aria-hidden="true" /><span class="ek-sr-only">Yetki gerekli</span>
                </span>
              </component>
            </li>
          </ol>
          <button v-if="rest.length > MAX_REST" type="button" class="dna-next__more" :aria-expanded="expanded" @click="expanded = !expanded">
            <v-icon :icon="expanded ? 'mdi-chevron-up' : 'mdi-chevron-down'" aria-hidden="true" />
            <span v-if="expanded">Daha az göster</span>
            <span v-else><span class="ek-num">{{ rest.length - MAX_REST }}</span> iş daha göster</span>
          </button>
        </template>
        <div v-else class="dna-next__done">
          <v-icon icon="mdi-check-circle-outline" class="dna-next__done-icon" aria-hidden="true" />
          <p>Başka bekleyen iş yok. Sıradaki işi tamamladığınızda gün tamam.</p>
        </div>
      </div>
    </div>

  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
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
/** Kapalıyken görünen "sonraki iş" sayısı; kalanı "daha göster" ile açılır. */
const MAX_REST = 4

const { canOpen, open } = useDashboardNavigation()
const userApi = useUser()

const built = computed(() => buildNextActions({ insights: props.insights, stock: props.stock, health: props.health, channelName: (c) => channelName(c) }))
const actions = computed(() => built.value.actions)
const ready = computed(() => !props.loading && !!props.insights)
const first = computed(() => actions.value[0] as NextAction)
const rest = computed(() => actions.value.slice(1))
/** "2 sipariş kaleminde aşırı satış" → { figure: '2', rest: 'sipariş kaleminde aşırı satış' }; sayıyla başlamıyorsa figure boş. */
function splitFigure(title: string): { figure: string; rest: string } {
  const m = /^(\d[\d.,]*)\s+(.+)$/.exec(title)
  return m ? { figure: m[1], rest: m[2] } : { figure: '', rest: title }
}
const heroTitle = computed(() => splitFigure(first.value?.title ?? ''))
const expanded = ref(false)
const visibleRest = computed(() => (expanded.value ? rest.value : rest.value.slice(0, MAX_REST)))

/** Öncelik özeti: tüm işler (sıradaki dahil), yalnız sıfırdan büyük seviyeler. */
const tally = computed(() =>
  LEVELS.map((level) => ({ level, count: actions.value.filter((a) => a.level === level).length })).filter((g) => g.count > 0),
)

const headline = computed(() => {
  const name = userApi.getFirstName?.value
  const hello = `${greeting(new Date().getHours())}${name ? `, ${name}` : ''}`
  if (props.loading) return `${hello}.`
  if (!actions.value.length) return props.error ? `${hello}.` : `${hello}. Her şey yolunda.`
  return actions.value.length === 1 ? `${hello}. Bir iş sizi bekliyor.` : `${hello}. ${actions.value.length} iş sizi bekliyor.`
})

const tileTone = (t: NextAction['tone']): EkTone => (t === 'danger' ? 'error' : t) as EkTone
const chipTone = (l: NextActionLevel) => (l === 'critical' ? 'danger' : l === 'today' ? 'warning' : 'neutral') as 'danger' | 'warning' | 'neutral'
const go = (a: NextAction) => open(a.screen, a.params)
</script>

<style scoped>
/* Tek kart, üç bant (başlık / gövde / sipariş akışı); bantlar ve sütunlar yalnız ince çizgiyle ayrılır. */
.dna {
  /* Genel bakışta yarım genişlikte durur (yanında Favoriler): kendi genişliğine göre tek sütuna iner. */
  container: dna-card / inline-size;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

/* ---- 1) Başlık ---- */
.dna__head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ek-space-3) var(--ek-space-6);
  padding: var(--ek-space-6) var(--ek-space-6) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.dna__heading {
  min-width: 0;
}

.dna__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-2);
  color: var(--ek-color-action);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dna__eyebrow::before {
  content: '';
  width: 14px;
  height: 1.5px;
  border-radius: 1px;
  background: currentColor;
}

.dna__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-title-size);
  line-height: var(--ek-type-title-line);
  font-weight: var(--ek-type-title-weight);
  letter-spacing: -0.015em;
  text-wrap: balance;
}

/* Öncelik özeti: kutusuz lejant — sıra numaralarındaki halka renklerinin anahtarı. */
.dna-tally {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Öncelik özeti: düz tonlu haplar (Acil kırmızı, Bugün turuncu, Fırsat buldukça nötr). */
.dna-tally__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-medium);
}

.dna-tally__item.is-critical {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-error-subtle);
  color: var(--ek-color-error-emphasis);
}

.dna-tally__item.is-today {
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-warning-subtle);
  color: var(--ek-color-warning-emphasis);
}

.dna-tally__dot {
  width: 7px;
  height: 7px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-content-subtle);
}

.dna-tally__item.is-critical .dna-tally__dot { background: var(--ek-color-error); }
.dna-tally__item.is-today .dna-tally__dot { background: var(--ek-color-warning); }

.dna-tally__count {
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-bold);
}

/* ---- 2) Gövde ---- */
.dna__body {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  align-items: stretch;
}

.dna__body--single {
  display: block;
  padding: var(--ek-space-6);
}

/* Sıradaki iş — önceliğin DÜZ tonunda panel (degrade yok): zemin `-subtle`, çerçeve `-border`, rakam `-emphasis`.
   Kutunun en renkli öğesi; göz önce buraya gider. */
.dna-hero {
  --dna-tone: var(--ek-color-action-emphasis);
  --dna-bg: var(--ek-color-action-subtle);
  --dna-line: var(--ek-color-action-border);
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-5);
  min-width: 0;
  margin: var(--ek-space-5);
  padding: var(--ek-space-5) var(--ek-space-6) var(--ek-space-6);
  border: 1px solid var(--dna-line);
  border-radius: var(--ek-radius-card);
  background: var(--dna-bg);
}

.dna-hero.is-danger { --dna-tone: var(--ek-color-error-emphasis); --dna-bg: var(--ek-color-error-subtle); --dna-line: var(--ek-color-error-border); }
.dna-hero.is-warning { --dna-tone: var(--ek-color-warning-emphasis); --dna-bg: var(--ek-color-warning-subtle); --dna-line: var(--ek-color-warning-border); }
.dna-hero.is-info { --dna-tone: var(--ek-color-info-emphasis); --dna-bg: var(--ek-color-info-subtle); --dna-line: var(--ek-color-info-border); }
.dna-hero.is-neutral { --dna-tone: var(--ek-color-content-strong); --dna-bg: var(--ek-color-surface-muted); --dna-line: var(--ek-color-border-default); }

.dna-hero__top {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
}

/* Öncelik çipi tonlu panelin üstünde kaybolmasın: düz yüzey zemini + tonun çerçevesi. */
.dna-hero__top :deep(.ek-status-chip),
.dna-hero__top :deep(.ek-icon-tile) {
  border-color: var(--dna-line);
  background: var(--ek-color-surface);
}

.dna-hero__kicker {
  margin-left: auto;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.dna-hero__copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--ek-space-3);
  min-width: 0;
}

.dna-hero__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: 1.25rem;
  line-height: 1.3;
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: -0.015em;
  text-wrap: balance;
}

/* Büyük rakam + etiket aynı taban çizgisinde: rakam kutunun tek "parlayan" öğesi. */
.dna-hero__title.has-figure {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px var(--ek-space-3);
}

.dna-hero__figure {
  color: var(--dna-tone);
  font-size: calc(var(--ek-type-display-size) * 1.75);
  line-height: 1;
  font-weight: var(--ek-type-display-weight);
  letter-spacing: -0.035em;
}

.dna-hero__text {
  margin: 0;
  max-width: 52ch;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: 1.6;
}

.dna-hero__actions {
  display: flex;
  gap: var(--ek-space-2);
  margin-top: auto;
}

.dna-hero__noaccess {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.dna-hero__noaccess .v-icon {
  flex: none;
  margin-top: 1px;
  font-size: var(--ek-icon-sm);
}

/* Sonraki işler — numaralı sıra; soldan ince dikey çizgiyle ayrılır. */
.dna-next {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
  padding: var(--ek-space-5) var(--ek-space-6) var(--ek-space-5) var(--ek-space-2);
}

.dna-next__title {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-1);
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
  margin: 0 calc(-1 * var(--ek-space-2));
  padding: 0;
  list-style: none;
}

.dna-row {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 48px;
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

/* Öncelik şeridi: satırın solunda ince düz çizgi (Acil kırmızı, Bugün turuncu, Fırsat buldukça nötr). */
.dna-row {
  position: relative;
  padding-left: var(--ek-space-4);
}

.dna-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 2px;
  background: var(--ek-color-border-strong);
}

.dna-row.is-critical::before { background: var(--ek-color-error); }
.dna-row.is-today::before { background: var(--ek-color-warning); }

.dna-row__title {
  flex: 1;
  min-width: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  line-height: 1.4;
  font-weight: var(--ek-font-weight-medium);
}

.dna-row__figure {
  font-weight: var(--ek-font-weight-bold);
}

.dna-row:not(.dna-row--link) .dna-row__title {
  color: var(--ek-color-content-default);
}

.dna-row__lock {
  flex: none;
  display: inline-flex;
  color: var(--ek-color-content-muted);
}

.dna-row__lock .v-icon {
  font-size: var(--ek-icon-sm);
}

/* Git düğmesi: eylem renginde düz daire; üzerine gelince dolar ve ilerler. */
.dna-row__go {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
  transition: var(--ek-transition-colors), transform var(--ek-motion-feedback);
}

.dna-row__go .v-icon {
  font-size: var(--ek-icon-sm);
}

.dna-row--link:hover .dna-row__go,
.dna-row--link:focus-visible .dna-row__go {
  background: var(--ek-color-action);
  color: var(--ek-color-surface);
  transform: translateX(2px);
}

.dna-next__more {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: var(--ek-space-2);
  min-height: 32px;
  margin-left: calc(-1 * var(--ek-space-2));
  padding: 0 var(--ek-space-3) 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-default);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.dna-next__more .v-icon {
  width: 24px;
  font-size: var(--ek-icon-md);
  color: var(--ek-color-content-muted);
}

.dna-next__more:hover {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.dna-next__more:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.dna-next__done {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  height: 100%;
  color: var(--ek-color-content-default);
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

/* Boş durum: sakin, kutusuz. */
.dna__clear {
  display: flex;
  align-items: center;
  gap: var(--ek-space-4);
}

.dna__clear-text-wrap {
  min-width: 0;
}

.dna__clear-title {
  margin: 0 0 2px;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-semibold);
}

.dna__clear-text {
  margin: 0;
  max-width: 70ch;
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

/* ---- Yükleme iskeleti (düzeni korur) ---- */
.dna__skeleton {
  display: block;
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface-muted);
}

.dna__skeleton--chip { width: 96px; height: 22px; }
.dna__skeleton--title { width: 70%; height: 44px; }
.dna__skeleton--line { width: 90%; height: 18px; }
.dna__skeleton--button { width: 160px; height: 36px; margin-top: auto; }
.dna__skeleton--row { height: 40px; }

/* ---- Dar düzen: tek sütun; dikey ayraç yatay olur ---- */
@media (max-width: 1099px) {
  .dna__body:not(.dna__body--single) {
    grid-template-columns: minmax(0, 1fr);
  }

  .dna-next {
    padding: 0 var(--ek-space-6) var(--ek-space-5);
  }
}

/* FE-R4-INT (ek): iş alanı dar (Otopilot paneli açık) → aynı tek kolon (DashboardView `ek-dash` kabı). */
@container ek-dash (max-width: 850px) {
  .dna__body:not(.dna__body--single) {
    grid-template-columns: minmax(0, 1fr);
  }

  .dna-next {
    padding: 0 var(--ek-space-6) var(--ek-space-5);
  }
}

@media (max-width: 599px) {
  .dna__head {
    flex-direction: column;
    align-items: flex-start;
    padding: var(--ek-space-4);
  }

  .dna-hero {
    margin: var(--ek-space-3);
    padding: var(--ek-space-4);
  }

  .dna-next {
    padding: 0 var(--ek-space-4) var(--ek-space-4);
  }

  .dna__body--single {
    padding: var(--ek-space-4);
  }

}

/* ================= FE-LOCAL-1044 — kompakt düzen (kullanıcı) =================
   Aynı içerik, daha az dikey yer: başlık bandı, sıradaki iş paneli ve satırlar sıkılaştırıldı. */
.dna__head {
  padding: var(--ek-space-4) var(--ek-space-5) var(--ek-space-3);
}

.dna__eyebrow {
  margin-bottom: 2px;
}

.dna__title {
  font-size: 1.125rem;
  line-height: 1.35;
}

.dna-hero {
  gap: var(--ek-space-3);
  margin: var(--ek-space-4);
  padding: var(--ek-space-4) var(--ek-space-5);
}

.dna-hero__copy {
  gap: var(--ek-space-2);
}

.dna-hero__title {
  font-size: 1.0625rem;
}

.dna-hero__figure {
  font-size: calc(var(--ek-type-display-size) * 1.25);
}

.dna-next {
  gap: 2px;
  padding: var(--ek-space-4) var(--ek-space-5) var(--ek-space-3) var(--ek-space-1);
}

.dna-next__title {
  margin: 0;
}

.dna-row {
  min-height: 40px;
  padding-top: var(--ek-space-1);
  padding-bottom: var(--ek-space-1);
}

.dna-row::before {
  top: 8px;
  bottom: 8px;
}

.dna-next__more {
  min-height: 28px;
}

@media (max-width: 1099px) {
  .dna-next {
    padding: 0 var(--ek-space-5) var(--ek-space-3);
  }
}

@media (max-width: 599px) {
  .dna-hero {
    margin: var(--ek-space-3);
  }

  .dna-next {
    padding: 0 var(--ek-space-4) var(--ek-space-3);
  }
}

/* Kart dar (≤ 720px; genel bakışta Favorilerle yan yana): sıradaki iş üstte, sonrası altında. */
@container dna-card (max-width: 720px) {
  .dna__body:not(.dna__body--single) {
    grid-template-columns: minmax(0, 1fr);
  }

  .dna-next {
    padding: 0 var(--ek-space-5) var(--ek-space-3);
  }

  /* Dar sütunda uzun metinler taşmaz: görev satırı ve sıradaki işin başlığı/yönergesi en çok 2 satır. */
  .dna-row__title,
  .dna-hero__label,
  .dna-hero__text {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .dna-hero__label {
    display: -webkit-inline-box;
  }
}

/* Çok dar (≤ 480px): öncelik özeti başlığın altına iner, sıradaki işin üst satırı sarılır, düğme tam genişlik. */
@container dna-card (max-width: 480px) {
  .dna__head {
    flex-direction: column;
    align-items: flex-start;
  }

  .dna-hero__top {
    flex-wrap: wrap;
  }

  .dna-hero__actions :deep(.ek-btn) {
    width: 100%;
  }
}

/* Tasarım dili §35.6 E1: kalın sol şerit yok — öncelik zaten renkli ikon kutusu ve etiketle anlatılıyor. */
.dna-row::before {
  display: none;
}
.dna-row {
  padding-left: 0;
}
</style>
