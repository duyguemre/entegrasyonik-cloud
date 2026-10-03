<!--
  BoVerdictCard — "müdahale kutusu" kabuğu (genel bakış + tüm sayfa hükümleri; BO_UI_PATTERNS §11).
  KAPALI BAŞLAR: ince şerit (işaret · durum · tek cümle hüküm · kritik/uyarı rozetleri · dönen ok); basınca açılır, başlığa yeniden basınca kapanır.
  Açıkken tek kutuda büyükten küçüğe:
    1. Hüküm: durum işareti + üst etiket + tek cümle + kısa özet          (#meter yuvası sağda: sayaçlar)
    2. Önce bu: en büyük taş — hükmün alt satırı, aynı metin sütununda (başlıkla yarışmaz, ilk konu olduğu belli)
    3. Dallar (varsayılan yuva): kutunun ayraçlı satırları — BoAttentionBranch; kapalı başlar, açtıkça dallanır
    4. #footer: kutunun alt şeridi (ör. diğer eylemler)
  Ciddiyet tonu tek değişkende (`--ov-tone`); degrade yok. Uyarı sarımsı, kritik kırmızımsı (global uyarı tokenı açık
  temada turuncu olduğu için grafik dolgu `--ov-warn-fill`, metin `--ov-warn-ink`; dallar bu değişkenleri miras alır).
-->
<template>
  <section class="ov-board" :class="[`is-${loading ? 'loading' : health}`, { 'is-open': open }]" :aria-label="label">
    <slot v-if="$slots.error" name="error" />
    <template v-else>
      <!-- Başlık şeridi: her durumda görünür ve TÜMÜYLE tıklanır (aç ⇄ kapat). -->
      <button type="button" class="ov-strip" :aria-expanded="open" :aria-controls="bodyId" :title="open ? 'Daralt' : 'Ayrıntıyı aç'" data-testid="verdict-strip" @click="open = !open">
        <span class="ov-strip__mark" aria-hidden="true"><v-icon :icon="loading ? 'mdi-timer-sand' : badge.icon" /></span>
        <template v-if="loading">
          <span class="ov-skel ov-skel--strip" aria-hidden="true"></span>
          <span class="ek-sr-only">Durum denetleniyor…</span>
        </template>
        <template v-else>
          <span class="ov-strip__label" data-testid="health-badge">{{ badgeLabel ?? badge.label }}</span>
          <span class="ov-strip__verdict" role="status" aria-live="polite" data-testid="status-verdict">{{ verdict }}</span>
          <span v-if="pills?.length" class="ov-strip__pills">
            <span v-for="pl in pills" :key="pl.label" class="ov-strip__pill" :class="`is-${pl.tone}`"><i aria-hidden="true"></i>{{ pl.label }}</span>
          </span>
        </template>
        <span class="ov-strip__toggle">
          <span class="ov-strip__chev" aria-hidden="true"><v-icon icon="mdi-chevron-down" /></span>
        </span>
      </button>

      <!-- Gövde: yükseklik akarak açılır/kapanır (0fr ⇄ 1fr); kapalıyken erişilemez (inert). -->
      <div :id="bodyId" class="ov-board__body" :inert="!open" :aria-hidden="!open">
        <div class="ov-board__clip">
          <div v-if="!loading && (summary || first || $slots.meter)" class="ov-hero">
            <div class="ov-hero__text">
              <p v-if="summary" class="ov-hero__summary">{{ summary }}</p>
              <div v-if="first" class="ov-first" :class="`is-${first.severity}`" :title="first.detail" :data-testid="firstTestid">
                <span class="ov-first__k"><b class="ek-num" aria-hidden="true">1</b>Önce bu</span>
                <span class="ov-first__title">{{ first.title }}</span>
                <span v-if="first.since" class="ov-first__since"><EkRelativeTime :value="first.since" /></span>
                <RouterLink v-if="first.to" :to="first.to" class="ov-first__cta" data-testid="action-card-go">
                  {{ first.actionLabel }}<v-icon icon="mdi-arrow-right" aria-hidden="true" />
                </RouterLink>
                <button v-else type="button" class="ov-first__cta" data-testid="action-card-go" @click="$emit('first-act')">
                  <v-icon v-if="first.guarded" icon="mdi-shield-lock-outline" aria-hidden="true" />{{ first.actionLabel }}<span v-if="first.guarded" class="ek-sr-only"> (kimlik doğrulama ve gerekçe istenir)</span>
                </button>
              </div>
            </div>
            <slot name="meter" />
          </div>
          <div v-if="$slots.default" class="ov-board__scopes"><slot /></div>
          <div v-if="$slots.footer" class="ov-board__footer"><slot name="footer" /></div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { EkRelativeTime } from '@entegrasyonik/ui/components'
import { HEALTH_BADGE, type Health } from './triage'
import '@bo/styles/kit.css'

export interface VerdictFirst {
  severity: 'critical' | 'warning' | 'neutral'
  title: string
  /** Üzerine gelince tam açıklama. */
  detail?: string
  since?: string
  actionLabel: string
  /** Gezinme eylemi; yoksa `first-act` olayı (yerinde eylem — sayfa step-up + gerekçe açar). */
  to?: RouteLocationRaw
  guarded?: boolean
}

const props = withDefaults(
  defineProps<{
    health: Health
    verdict: string
    summary?: string
    badgeLabel?: string
    loading?: boolean
    first?: VerdictFirst
    firstTestid?: string
    label?: string
    /** Şeritteki özet rozetler (ör. "2 kritik", "3 uyarı"). */
    pills?: Array<{ tone: 'critical' | 'warning' | 'info'; label: string }>
    /** Açık başlasın (varsayılan: kapalı şerit). */
    defaultOpen?: boolean
  }>(),
  { label: 'Dikkat panosu', firstTestid: 'action-card' },
)
defineEmits<{ 'first-act': [] }>()

const badge = computed(() => HEALTH_BADGE[props.health])
const open = ref(props.defaultOpen ?? false)
const bodyId = `verdict-${Math.random().toString(36).slice(2, 8)}`
</script>

<style scoped>
/* Ciddiyet tonu tek değişkende: yıkama, işaret, nokta buradan beslenir. */
/* Uyarı kırmızıdan net ayrılsın: global `warning` açık temada yanık turuncu (#B45309, metin kontrastı için).
   Panoda grafik dolgular (işaret, nokta, çubuk, ikon karesi) gerçek sarı; metin/ikon altın-koyu (beyazda ≈ 4,9:1, AA).
   Koyu temada global uyarı zaten sarı (#FBBF24) → onu kullan. */
.ov-board {
  --ov-warn-fill: var(--bo-warn-fill);
  --ov-warn-ink: var(--bo-warn-ink);
  --ov-tone: var(--ek-color-success);
  --ov-tone-strong: var(--ek-color-success);
  --ov-pad: 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-raised);
}


.ov-board.is-warning {
  --ov-tone: var(--ov-warn-fill);
  --ov-tone-strong: var(--ov-warn-ink);
}

.ov-board.is-critical {
  --ov-tone: var(--ek-color-error);
  --ov-tone-strong: var(--ek-color-error-emphasis);
}

.ov-board.is-loading,
.ov-board.is-unknown {
  --ov-tone: var(--ek-color-border-strong);
  --ov-tone-strong: var(--ek-color-content-muted);
}

/* ---------- 0 · kapalı şerit ---------- */
.ov-strip {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 56px;
  padding: var(--ek-space-2) var(--ov-pad);
  border: 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--ov-tone) var(--ov-wash, 5%), var(--ek-color-surface));
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ov-strip:hover {
  background: color-mix(in srgb, var(--ov-tone) calc(var(--ov-wash, 5%) + 4%), var(--ek-color-surface));
}

.ov-strip:focus-visible {
  outline: none;
  box-shadow: inset var(--ek-focus-ring);
}

.ov-strip__mark {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--ov-tone) 14%, var(--ek-color-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ov-tone) 22%, transparent);
  color: var(--ov-tone-strong);
  font-size: var(--ek-icon-md);
}

.ov-strip__label {
  flex: none;
  color: var(--ov-tone-strong);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ov-strip__verdict {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ov-strip__pills {
  display: inline-flex;
  flex: none;
  gap: var(--ek-space-1);
}

.ov-strip__pill {
  --pill: var(--ek-color-info);
  --pill-ink: var(--ek-color-info-emphasis, var(--ek-color-content-default));
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 var(--ek-space-2);
  border: 1px solid color-mix(in srgb, var(--pill) 38%, var(--ek-color-border-subtle));
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface);
  color: var(--pill-ink);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
}

.ov-strip__pill.is-critical {
  --pill: var(--ek-color-error);
  --pill-ink: var(--ek-color-error-emphasis);
}

.ov-strip__pill.is-warning {
  --pill: var(--ov-warn-fill);
  --pill-ink: var(--ov-warn-ink);
  background: color-mix(in srgb, var(--ov-warn-fill) 24%, var(--ek-color-surface));
}

.ov-strip__pill.is-critical {
  background: color-mix(in srgb, var(--ek-color-error) 9%, var(--ek-color-surface));
}

.ov-strip__pill i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--pill);
}

/* Geçiş göstergesi: metin + dönen ok kapsülü. */
.ov-strip__toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
  margin-left: auto;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  transition: color var(--ek-motion-feedback);
}

.ov-strip__chev {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--ek-color-surface);
  box-shadow: inset 0 0 0 1px var(--ek-color-border-subtle), var(--ek-shadow-sm);
  color: var(--ek-color-content-default);
  transition: transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow var(--ek-motion-feedback);
}

.ov-strip__chev .v-icon {
  font-size: var(--ek-icon-md);
}

.ov-strip:hover .ov-strip__toggle {
  color: var(--ek-color-content-strong);
}

.ov-strip:hover .ov-strip__chev {
  box-shadow: inset 0 0 0 1px var(--ek-color-border-strong), var(--ek-shadow-sm);
}

.ov-board.is-open .ov-strip__chev {
  transform: rotate(180deg);
}

/* Açıkken şerit başlık olur: altında ince ayraç. */
.ov-board.is-open .ov-strip {
  border-radius: var(--ek-radius-card) var(--ek-radius-card) 0 0;
  box-shadow: inset 0 -1px 0 var(--ek-color-border-subtle);
}

.ov-skel--strip {
  width: 280px;
  height: 14px;
}

/* Gövde: yükseklik akışı (grid 0fr ⇄ 1fr) + içerik hafif kayarak belirir. */
.ov-board__body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ov-board.is-open .ov-board__body {
  grid-template-rows: 1fr;
}

.ov-board__clip {
  min-height: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateY(-6px);
  transition: opacity 200ms ease, transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ov-board.is-open .ov-board__clip {
  opacity: 1;
  transform: none;
  transition-delay: 60ms;
}

@media (prefers-reduced-motion: reduce) {
  .ov-board__body,
  .ov-board__clip,
  .ov-strip__chev {
    transition: none;
  }
}

/* ---------- 1 · hero ---------- */
.ov-hero {
  display: flex;
  align-items: center;
  gap: var(--ov-pad);
  padding: var(--ek-space-4) var(--ov-pad) var(--ek-space-5) calc(var(--ov-pad) + 32px + var(--ek-space-3));
  /* Düz, hafif zemin tonu (degrade yok): kritik pembemsi, uyarı sarımsı — ilk bakışta ayırt edilir. */
  background: color-mix(in srgb, var(--ov-tone) var(--ov-wash, 5%), var(--ek-color-surface));
}

.ov-board.is-critical {
  --ov-wash: 6%;
}

.ov-board.is-warning {
  --ov-wash: 18%;
}

.ov-board.is-ok,
.ov-board.is-loading,
.ov-board.is-unknown {
  --ov-wash: 0%;
}

/* Kritikte halka yavaşça nabız atar — dikkat çeker, rahatsız etmez; hareket azaltmada durur. */
.ov-board.is-critical .ov-strip__mark::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 14px;
  animation: ov-pulse 2.4s ease-out infinite;
}

@keyframes ov-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--ov-tone) 30%, transparent);
  }
  70%,
  100% {
    box-shadow: 0 0 0 12px transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ov-board.is-critical .ov-strip__mark::after {
    animation: none;
  }
}

.ov-hero__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding-top: 2px;
}

.ov-hero__summary {
  margin: 0;
  max-width: 60ch;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ov-skel {
  display: block;
  width: 320px;
  max-width: 100%;
  height: 12px;
  border-radius: var(--ek-radius-sm);
  background: var(--ek-color-surface-sunken);
}

.ov-skel--sm {
  width: 96px;
  height: 10px;
}

.ov-skel--title {
  width: 260px;
  height: 24px;
}

/* ---------- 2 · önce bu ---------- */
/* Hükmün alt satırı: hero zemininde beyaz hap; metin sütununa doğal hizalı. */
.ov-first {
  --ov-first: var(--ov-warn-fill);
  --ov-first-strong: var(--ov-warn-ink);
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  max-width: 100%;
  margin-top: var(--ek-space-2);
  padding: 5px 5px 5px var(--ek-space-2);
  border: 1px solid color-mix(in srgb, var(--ov-first) 30%, var(--ek-color-border-subtle));
  border-radius: var(--ek-radius-lg);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-sm);
}

.ov-first.is-critical {
  --ov-first: var(--ek-color-error);
  --ov-first-strong: var(--ek-color-error-emphasis);
}

.ov-first__k {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  color: var(--ov-first-strong);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-font-weight-bold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.ov-first__k b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ov-first);
  color: var(--ek-color-surface);
  font-size: 11px;
  letter-spacing: 0;
}

.ov-first.is-warning .ov-first__k b {
  color: var(--ek-color-chrome);
}

.ov-first__title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-semibold);
}

.ov-first__since {
  flex: none;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  white-space: nowrap;
}

.ov-first__cta {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-1);
  height: 28px;
  margin-left: var(--ek-space-1);
  padding: 0 var(--ek-space-3);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  white-space: nowrap;
  text-decoration: none;
  transition: var(--ek-transition-colors);
}

.ov-first__cta .v-icon {
  font-size: var(--ek-icon-xs);
  transition: transform var(--ek-motion-feedback);
}

.ov-first__cta:hover {
  background: var(--ek-color-surface-sunken);
}

.ov-first__cta:hover .v-icon {
  transform: translateX(2px);
}

.ov-first__cta:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

/* ---------- 3 · kapsamlar: gömme tepsi ---------- */
/* Dallar kutunun ayraçlı satırları (ayrı kart/tepsi yok). */
.ov-board__scopes {
  display: flex;
  flex-direction: column;
}

.ov-board__scopes > * {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.ov-first.is-neutral {
  --ov-first: var(--ek-color-action);
  --ov-first-strong: var(--ek-color-action-emphasis);
}

button.ov-first__cta {
  border: 0;
  font-family: inherit;
  cursor: pointer;
}

/* Kutunun alt şeridi (ör. diğer eylemler): dallarla aynı ayraç dili. */
.ov-board__footer {
  padding: var(--ek-space-3) var(--ov-pad);
  border-top: 1px solid var(--ek-color-border-subtle);
}

@media (max-width: 1100px) {
  .ov-hero {
    flex-direction: column;
    align-items: stretch;
  }
}

@media (max-width: 600px) {
  .ov-board {
    --ov-pad: 16px;
  }

  .ov-strip {
    flex-wrap: wrap;
    row-gap: var(--ek-space-1);
  }

  .ov-strip__verdict {
    flex: 1 1 100%;
    order: 3;
    white-space: normal;
  }

  .ov-strip__pills {
    order: 4;
  }

  .ov-hero {
    gap: var(--ek-space-4);
    padding-left: var(--ov-pad);
  }



  .ov-first {
    flex-wrap: wrap;
    gap: var(--ek-space-1) var(--ek-space-2);
  }

  .ov-first__title {
    flex-basis: 100%;
    white-space: normal;
  }

  .ov-first__cta {
    margin-left: 0;
  }
}

/* ================= BO-LOCAL-01 — hüküm panosu: uygulamanın tasarım diliyle =================
   Gölge, parıltı ve nabız halkası YOK. Pano düz kart; önem tonunda TONUN düz açık zemini + ince ton çerçevesi (ana
   sayfadaki "sıradaki iş" paneliyle aynı). İşaret beyaz zeminde çerçeveli köşeli kutu; rozetler köşeli; aç/kapa oku
   çerçeveli köşeli kutu. Aç/kapa geçişleri uygulamanın tek hız rolüne bağlı (sabit süre / eğri yok). */
.ov-board {
  --ov-line: var(--ek-color-border-default);
  --ov-bg: var(--ek-color-surface);
  --ov-warn-ink: var(--ek-color-warning-emphasis);
  border-color: var(--ov-line);
  box-shadow: none;
}

.ov-board.is-warning {
  --ov-line: var(--ek-color-warning-border);
  --ov-bg: var(--ek-color-warning-subtle);
  --ov-tone-strong: var(--ek-color-warning-emphasis);
}

.ov-board.is-critical {
  --ov-line: var(--ek-color-error-border);
  --ov-bg: var(--ek-color-error-subtle);
}

.ov-board.is-ok {
  --ov-tone-strong: var(--ek-color-success-emphasis);
}

.ov-strip,
.ov-strip:hover,
.ov-hero {
  background: var(--ov-bg);
}

.ov-board.is-ok .ov-strip:hover,
.ov-board.is-loading .ov-strip:hover,
.ov-board.is-unknown .ov-strip:hover {
  background: var(--ek-color-surface-muted);
}

.ov-strip__mark {
  width: 36px;
  height: 36px;
  border: 1px solid var(--ov-line);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
  box-shadow: none;
}

.ov-board.is-ok .ov-strip__mark {
  border-color: var(--ek-color-success-border);
  background: var(--ek-color-success-subtle);
}

.ov-board.is-critical .ov-strip__mark::after {
  content: none;
  animation: none;
}

.ov-strip__label {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
}

.ov-strip__label::before {
  content: '';
  flex: none;
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
}

.ov-strip__pill {
  border-color: var(--ek-color-info-border);
  border-radius: var(--ek-radius-md);
  background: var(--ek-color-surface);
}

.ov-strip__pill.is-critical {
  border-color: var(--ek-color-error-border);
  background: var(--ek-color-surface);
}

.ov-strip__pill.is-warning {
  --pill-ink: var(--ek-color-warning-emphasis);
  border-color: var(--ek-color-warning-border);
  background: var(--ek-color-surface);
}

.ov-strip__pill i {
  border-radius: 2px;
}

.ov-strip__chev {
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
  box-shadow: none;
  transition: transform var(--ek-motion-reveal), var(--ek-transition-colors);
}

.ov-strip:hover .ov-strip__chev {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  box-shadow: none;
  color: var(--ek-color-action-emphasis);
}

.ov-board.is-open .ov-strip {
  border-bottom: 1px solid var(--ov-line);
  box-shadow: none;
}

.ov-board.is-open .ov-strip:focus-visible {
  box-shadow: inset var(--ek-focus-ring);
}

.ov-board__body {
  transition: grid-template-rows var(--ek-motion-reveal);
}

.ov-board__clip {
  transition: opacity var(--ek-motion-reveal), transform var(--ek-motion-reveal);
}

.ov-board.is-open .ov-board__clip {
  transition-delay: 0s;
}

.ov-hero {
  padding-left: calc(var(--ov-pad) + 36px + var(--ek-space-3));
  border-bottom: 1px solid var(--ov-line);
}

/* "Önce bu": beyaz zeminde ince ton çerçeveli kutu; sıra numarası köşeli; eylem çerçeveli düz düğme. */
.ov-first {
  border-color: var(--ov-line);
  border-radius: var(--ek-radius-tile);
  box-shadow: none;
}

.ov-first.is-warning {
  --ov-first-strong: var(--ek-color-warning-emphasis);
}

.ov-first__k {
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
}

.ov-first__k b {
  border-radius: 4px;
}

.ov-first__cta {
  border: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
}

button.ov-first__cta {
  border: 1px solid var(--ek-color-border-default);
}

.ov-first__cta:hover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ov-board__footer {
  background: var(--ek-color-surface-muted);
}

@media (max-width: 600px) {
  .ov-hero {
    padding-left: var(--ov-pad);
  }
}

@media (prefers-reduced-motion: reduce) {
  .ov-board__body,
  .ov-board__clip,
  .ov-strip__chev {
    transition: none;
  }
}
</style>
