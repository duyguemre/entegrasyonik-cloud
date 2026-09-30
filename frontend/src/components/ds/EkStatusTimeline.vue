<!--
  frontend/src/components/ds/EkStatusTimeline.vue

  DS-v2 Aşama 6b — Standart 6: DURUM ZAMAN ÇİZGİSİ (sipariş yaşam döngüsü, iade süreci). Adımlar geniş kapta YATAY,
  dar kapta (< 560px, kap sorgusu) DİKEY. Her adım: işaret (tamamlandı ✓ / şu an / bekliyor / başarısız ✕) + ad + tarih
  (yalnız veride varsa — uydurma tarih yok) + isteğe bağlı açıklama. Renk tek başına anlam taşımaz: ikon + metin.
  Erişilebilirlik: `<ol>`; şu anki adım `aria-current="step"`; durum metni ekran okuyucuya ayrıca yazılır.
-->
<template>
  <div class="ek-tl-wrap">
    <ol class="ek-tl" :aria-label="label">
      <li
        v-for="step in steps"
        :key="step.key"
        class="ek-tl__step"
        :class="`is-${step.state}`"
        :aria-current="step.state === 'current' ? 'step' : undefined"
      >
        <span class="ek-tl__marker" aria-hidden="true">
          <v-icon v-if="step.state === 'done'" icon="mdi-check" />
          <v-icon v-else-if="step.state === 'failed'" icon="mdi-close" />
          <span v-else class="ek-tl__pip"></span>
        </span>
        <span class="ek-tl__text">
          <span class="ek-tl__label">{{ step.label }}<span class="ek-sr-only"> — {{ STATE_TEXT[step.state] }}</span></span>
          <span v-if="step.date" class="ek-tl__date ek-num">{{ step.date }}</span>
          <span v-if="step.description" class="ek-tl__desc">{{ step.description }}</span>
        </span>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
export type EkTimelineState = 'done' | 'current' | 'upcoming' | 'failed'

export interface EkTimelineStep {
  key: string
  label: string
  state: EkTimelineState
  /** Biçimlenmiş tarih (verisi yoksa verilmez). */
  date?: string
  description?: string
}

withDefaults(defineProps<{ steps: EkTimelineStep[]; label?: string }>(), { label: 'Durum zaman çizgisi' })

const STATE_TEXT: Record<EkTimelineState, string> = { done: 'tamamlandı', current: 'şu anki adım', upcoming: 'bekliyor', failed: 'gerçekleşmedi' }
</script>

<style scoped>
.ek-tl-wrap {
  container-type: inline-size;
}

.ek-tl {
  display: flex;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ek-tl__step {
  --ek-tl-color: var(--ek-color-border-strong);
  position: relative;
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--ek-space-2);
  min-width: 0;
  text-align: center;
}

/* Bağlantı çizgisi: adımın işaretinden bir sonraki adıma. */
.ek-tl__step:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 13px;
  left: calc(50% + 16px);
  right: calc(-50% + 16px);
  height: 2px;
  border-radius: 2px;
  background: var(--ek-color-border-default);
}

.ek-tl__step.is-done:not(:last-child)::after {
  background: var(--ek-color-success);
}

.ek-tl__step.is-done { --ek-tl-color: var(--ek-color-success); }
.ek-tl__step.is-current { --ek-tl-color: var(--ek-color-action); }
.ek-tl__step.is-failed { --ek-tl-color: var(--ek-color-error); }

.ek-tl__marker {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-chip);
  border: 2px solid var(--ek-tl-color);
  background: var(--ek-color-surface);
  color: var(--ek-tl-color);
  font-size: var(--ek-icon-sm);
}

.ek-tl__step.is-done .ek-tl__marker {
  background: var(--ek-color-success-subtle);
}

.ek-tl__step.is-failed .ek-tl__marker {
  background: var(--ek-color-error-subtle);
}

.ek-tl__step.is-current .ek-tl__marker {
  background: var(--ek-color-action-subtle);
  box-shadow: 0 0 0 4px var(--ek-color-action-subtle);
}

.ek-tl__pip {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-tl-color);
}

.ek-tl__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ek-tl__label {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  font-weight: var(--ek-font-weight-medium);
  color: var(--ek-color-content-muted);
}

.ek-tl__step.is-done .ek-tl__label,
.ek-tl__step.is-current .ek-tl__label,
.ek-tl__step.is-failed .ek-tl__label {
  color: var(--ek-color-content-strong);
}

.ek-tl__step.is-current .ek-tl__label {
  font-weight: var(--ek-font-weight-semibold);
}

.ek-tl__date,
.ek-tl__desc {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

@container (max-width: 559.98px) {
  .ek-tl {
    flex-direction: column;
    gap: var(--ek-space-3);
  }

  .ek-tl__step {
    flex-direction: row;
    align-items: flex-start;
    text-align: left;
    gap: var(--ek-space-3);
  }

  .ek-tl__step:not(:last-child)::after {
    top: 30px;
    bottom: calc(-1 * var(--ek-space-3) + 2px);
    left: 13px;
    right: auto;
    width: 2px;
    height: auto;
  }

  .ek-tl__text {
    padding-top: 4px;
  }
}
</style>
