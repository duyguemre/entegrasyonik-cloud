<!--
  packages/ui/src/components/EkDetailPanel.vue

  FR3 madde 12–13 — kayıt detayı BÖLÜM KARTI (`EkRecordSheet` gövdesinin yapı taşı; `EkSection`'ın kartlı karşılığı).
      ┌ [ikon] Başlık            açıklama / sayaç ……………… #aside ┐
      ├───────────────────────────────────────────────────────────┤
      │ içerik (slot) — ya da `rows` (mikro etiketli satırlar)      │
      ├ #actions (isteğe bağlı alt şerit) ───────────────────────────┤
  Başlık motifi `EkInfoCard` ile aynı (küçük ikon karosu + alt başlık), böylece bilgi kartı ile bölüm kartı yan yana tek
  dil konuşur. `flush`: içerik kenara dayanır (liste/zaman çizgisi kendi iç boşluğunu taşır). Renk yalnız `tone`
  (ikon karosu) ile — bölüm kartının kendisi nötr kalır (sakin, K49). Değer yoksa "—" (uydurma yok) ya da `emptyText`.
-->
<template>
  <section class="ek-detail-panel" :class="{ 'ek-detail-panel--flush': flush }" :aria-labelledby="titleId">
    <header class="ek-detail-panel__head">
      <EkIconTile v-if="icon" :icon="icon" :tone="tone" size="sm" />
      <div class="ek-detail-panel__heading">
        <h3 :id="titleId" class="ek-detail-panel__title">{{ title }}</h3>
        <p v-if="description" class="ek-detail-panel__description">{{ description }}</p>
      </div>
      <div v-if="$slots.aside" class="ek-detail-panel__aside"><slot name="aside" /></div>
    </header>
    <div class="ek-detail-panel__body">
      <slot>
        <p v-if="!rows?.length && emptyText" class="ek-detail-panel__empty">{{ emptyText }}</p>
        <dl v-else-if="rows?.length" class="ek-detail-panel__rows">
          <div v-for="r in rows" :key="r.label" class="ek-detail-panel__row">
            <dt>{{ r.label }}</dt>
            <dd :class="{ 'ek-num': r.numeric }">{{ r.value || '—' }}</dd>
          </div>
        </dl>
      </slot>
    </div>
    <footer v-if="$slots.actions" class="ek-detail-panel__actions"><slot name="actions" /></footer>
  </section>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import EkIconTile, { type EkTone } from './EkIconTile.vue'

withDefaults(
  defineProps<{
    title: string
    description?: string
    icon?: string
    tone?: EkTone
    rows?: Array<{ label: string; value?: string | number | null; numeric?: boolean }>
    emptyText?: string
    flush?: boolean
  }>(),
  { tone: 'neutral', flush: false },
)
const titleId = `ek-detail-panel-${useId()}`
</script>

<style scoped>
.ek-detail-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  box-shadow: var(--ek-shadow-card);
}

.ek-detail-panel__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 52px;
  padding: var(--ek-space-3) var(--ek-space-4);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ek-detail-panel__heading {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: var(--ek-space-2);
  min-width: 0;
}

.ek-detail-panel__title {
  margin: 0;
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-detail-panel__description {
  margin: 0;
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  color: var(--ek-color-content-muted);
}

.ek-detail-panel__aside {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-detail-panel__body {
  flex: 1 1 auto;
  min-width: 0;
  padding: var(--ek-space-4);
}

.ek-detail-panel--flush .ek-detail-panel__body {
  padding: 0;
}

.ek-detail-panel__empty {
  margin: 0;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-muted);
}

.ek-detail-panel__rows {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  margin: 0;
}

.ek-detail-panel__row {
  display: grid;
  grid-template-columns: minmax(96px, 40%) minmax(0, 1fr);
  gap: var(--ek-space-3);
  align-items: baseline;
}

.ek-detail-panel__row dt {
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
  color: var(--ek-color-content-muted);
}

.ek-detail-panel__row dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  color: var(--ek-color-content-strong);
}

.ek-detail-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-4);
  border-top: 1px solid var(--ek-color-border-subtle);
}

@media (max-width: 599px) {
  .ek-detail-panel__head,
  .ek-detail-panel:not(.ek-detail-panel--flush) .ek-detail-panel__body {
    padding-inline: var(--ek-space-3);
  }
}
</style>
