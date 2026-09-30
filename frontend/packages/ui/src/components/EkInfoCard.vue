<!--
  frontend/src/components/ds/EkInfoCard.vue

  DS-v2 Aşama 6b — Standart 6: kayıt detayında BİLGİ KARTI (Alıcı · Teslimat · Kargo · Fatura · İade nedeni …).
  Başlık motifi EkCard ile aynı (küçük ikon kapsülü + başlık), gövde mikro etiketli satırlar (`rows`) ya da slot,
  alt eylem şeridi `#actions`. Değer yoksa "—" (uydurma yok) ya da `emptyText`.
-->
<template>
  <section class="ek-info-card" :aria-labelledby="titleId">
    <header class="ek-info-card__head">
      <EkIconTile :icon="icon" :tone="tone" size="sm" />
      <h3 :id="titleId" class="ek-info-card__title">{{ title }}</h3>
      <div v-if="$slots.aside" class="ek-info-card__aside"><slot name="aside" /></div>
    </header>
    <div class="ek-info-card__body">
      <slot>
        <p v-if="!rows?.length && emptyText" class="ek-info-card__empty">{{ emptyText }}</p>
        <dl v-else class="ek-info-card__rows">
          <div v-for="r in rows" :key="r.label" class="ek-info-card__row">
            <dt>{{ r.label }}</dt>
            <dd :class="{ 'ek-num': r.numeric }">{{ r.value || '—' }}</dd>
          </div>
        </dl>
      </slot>
    </div>
    <footer v-if="$slots.actions" class="ek-info-card__actions"><slot name="actions" /></footer>
  </section>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import EkIconTile, { type EkTone } from './EkIconTile.vue'

withDefaults(
  defineProps<{
    title: string
    icon: string
    tone?: EkTone
    rows?: Array<{ label: string; value?: string | number | null; numeric?: boolean }>
    emptyText?: string
  }>(),
  { tone: 'neutral' },
)
const titleId = `ek-info-card-${useId()}`
</script>

<style scoped>
.ek-info-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-info-card__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ek-info-card__title {
  flex: 1 1 auto;
  margin: 0;
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-info-card__body {
  flex: 1 1 auto;
  padding: var(--ek-space-3) var(--ek-space-4);
}

.ek-info-card__rows {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
}

.ek-info-card__row {
  display: grid;
  grid-template-columns: minmax(96px, 38%) minmax(0, 1fr);
  gap: var(--ek-space-3);
  align-items: baseline;
}

.ek-info-card__row dt {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ek-info-card__row dd {
  margin: 0;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-strong);
  overflow-wrap: anywhere;
}

.ek-info-card__empty {
  margin: 0;
  font-size: var(--ek-type-body-size);
  color: var(--ek-color-content-muted);
}

.ek-info-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
}
</style>
