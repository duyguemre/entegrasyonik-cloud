<!--
  packages/ui/src/components/EkNextStep.vue

  FR2-ORDERS 30/33 (fe-r2d) — kayıt detayında "Sıradaki adım" kartı: kaydın şu an nerede olduğunu ve
  kullanıcının ne yapması gerektiğini sade dille söyler; eylem varsa kartın içinde (başlıktaki eylemle aynı).
      [ikon]  SIRADAKİ ADIM
              Kargoya verin                                    [Kargoya ver]
              Fatura hazır; kargo barkodu alıp paketi teslime hazırlayın.
  Ton yalnız sol şerit + ikon kapsülünde (zemin nötr yüzey → uzun metin her temada okunur). Eylem yoksa
  (ör. kapanmış kayıt) kart bilgi kartı olarak kalır. Metin çağırandan gelir; bileşen metin üretmez.
-->
<template>
  <section class="ek-next-step" :class="`ek-next-step--${tone}`" :aria-labelledby="titleId">
    <EkIconTile :icon="icon" :tone="tone" size="lg" />
    <div class="ek-next-step__body">
      <span class="ek-next-step__eyebrow">{{ eyebrow }}</span>
      <h3 :id="titleId" class="ek-next-step__title">{{ title }}</h3>
      <p v-if="text" class="ek-next-step__text">{{ text }}</p>
      <slot />
    </div>
    <div v-if="$slots.actions" class="ek-next-step__actions"><slot name="actions" /></div>
  </section>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import EkIconTile, { type EkTone } from './EkIconTile.vue'

withDefaults(
  defineProps<{
    title: string
    text?: string
    icon?: string
    tone?: EkTone
    eyebrow?: string
  }>(),
  { icon: 'mdi-arrow-right-circle-outline', tone: 'action', eyebrow: 'Sıradaki adım' },
)
const titleId = `ek-next-step-${useId()}`
</script>

<style scoped>
.ek-next-step {
  --ek-ns-accent: var(--ek-color-action);
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-4);
  padding: var(--ek-space-4) var(--ek-space-5);
  border: 1px solid var(--ek-color-border-default);
  border-left: 3px solid var(--ek-ns-accent);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-next-step--success { --ek-ns-accent: var(--ek-color-success); }
.ek-next-step--warning { --ek-ns-accent: var(--ek-color-warning); }
.ek-next-step--error { --ek-ns-accent: var(--ek-color-error); }
.ek-next-step--info { --ek-ns-accent: var(--ek-color-info); }
.ek-next-step--neutral { --ek-ns-accent: var(--ek-color-border-strong); }
.ek-next-step--brand { --ek-ns-accent: var(--ek-color-action); }

.ek-next-step__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ek-next-step__eyebrow {
  font-size: var(--ek-type-micro-size, 11px);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ek-next-step__title {
  margin: 0;
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-next-step__text {
  margin: 0;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-default);
  max-width: 62ch;
}

.ek-next-step__actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  align-self: center;
}

@media (max-width: 599px) {
  .ek-next-step {
    flex-wrap: wrap;
    padding: var(--ek-space-4);
  }

  .ek-next-step__actions {
    flex-basis: 100%;
  }
}

/* ================= FE-LOCAL-1045 — sıradaki adım: ana sayfadaki "sıradaki iş" paneliyle aynı =================
   Soldaki şerit yerine tonun DÜZ açık zemini + ince çerçevesi (degrade yok); ikon kutusu düz yüzeyde, üst satır
   tonun vurgu renginde — yönlendirici ve tek bakışta seçilir. */
.ek-next-step {
  --ek-ns-bg: var(--ek-color-action-subtle);
  --ek-ns-line: var(--ek-color-action-border);
  --ek-ns-ink: var(--ek-color-action-emphasis);
  border: 1px solid var(--ek-ns-line);
  background: var(--ek-ns-bg);
}

.ek-next-step--success { --ek-ns-bg: var(--ek-color-success-subtle); --ek-ns-line: var(--ek-color-success-border); --ek-ns-ink: var(--ek-color-success-emphasis); }
.ek-next-step--warning { --ek-ns-bg: var(--ek-color-warning-subtle); --ek-ns-line: var(--ek-color-warning-border); --ek-ns-ink: var(--ek-color-warning-emphasis); }
.ek-next-step--error { --ek-ns-bg: var(--ek-color-error-subtle); --ek-ns-line: var(--ek-color-error-border); --ek-ns-ink: var(--ek-color-error-emphasis); }
.ek-next-step--info { --ek-ns-bg: var(--ek-color-info-subtle); --ek-ns-line: var(--ek-color-info-border); --ek-ns-ink: var(--ek-color-info-emphasis); }
.ek-next-step--neutral { --ek-ns-bg: var(--ek-color-surface-muted); --ek-ns-line: var(--ek-color-border-default); --ek-ns-ink: var(--ek-color-content-default); }

.ek-next-step :deep(.ek-icon-tile) {
  border-color: var(--ek-ns-line);
  background: var(--ek-color-surface);
}

.ek-next-step__eyebrow {
  color: var(--ek-ns-ink);
}
</style>
