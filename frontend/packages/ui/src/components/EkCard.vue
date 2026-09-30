<!--
  frontend/src/components/ds/EkCard.vue

  DS-v2 — kart (tekrarlayan motif). Başlık satırı HER kartta aynı:
    [ikon kapsülü] Başlık / alt başlık ............ [#actions] [yuvarlak ok]
  Gövde `surface`; başlık bandı ile gövde arasında `border-subtle` ayraç.
  Kart zeminden bir kademe açık + ince kenarlık + yumuşak gölge.
  `to-label` verilirse sağda yuvarlak aksiyon oku görünür (`@open` yayar) —
  ok düğmesinin erişilebilir adı `to-label`'dır.
  `headingLevel` sayfanın başlık hiyerarşisine göre verilir (axe heading-order).
-->
<template>
  <section class="ek-card" :class="{ 'ek-card--flush': flush, 'ek-card--interactive': interactive }" :aria-labelledby="titleId">
    <header v-if="title" class="ek-card__header">
      <EkIconTile v-if="icon" :icon="icon" :tone="iconTone" size="sm" />
      <div class="ek-card__titles">
        <component :is="`h${headingLevel}`" :id="titleId" class="ek-card__title">{{ title }}</component>
        <p v-if="subtitle" class="ek-card__subtitle">{{ subtitle }}</p>
      </div>
      <div class="ek-card__actions">
        <slot name="actions" />
        <button v-if="toLabel" type="button" class="ek-card__open" :aria-label="toLabel" @click="emit('open')">
          <v-icon icon="mdi-arrow-right" aria-hidden="true" />
        </button>
      </div>
    </header>
    <div class="ek-card__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="ek-card__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { useId } from 'vue'
import EkIconTile, { type EkTone } from './EkIconTile.vue'

withDefaults(
  defineProps<{
    title?: string
    subtitle?: string
    icon?: string
    iconTone?: EkTone
    toLabel?: string
    headingLevel?: 2 | 3 | 4
    flush?: boolean
    interactive?: boolean
  }>(),
  { iconTone: 'action', headingLevel: 3, flush: false, interactive: false },
)

const emit = defineEmits<{ open: [] }>()
const titleId = `ek-card-${useId()}`
</script>

<style scoped>
.ek-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
  transition: var(--ek-transition-colors);
}

.ek-card--interactive:hover {
  border-color: var(--ek-color-border-strong);
  box-shadow: var(--ek-shadow-raised);
}

.ek-card__header {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  min-height: 56px;
  padding: var(--ek-space-3) var(--ek-space-4) var(--ek-space-3) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ek-card__titles {
  flex: 1;
  min-width: 0;
}

.ek-card__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-heading-size);
  line-height: var(--ek-type-heading-line);
  font-weight: var(--ek-type-heading-weight);
}

.ek-card__subtitle {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-card__actions {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.ek-card__open {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ek-control-h-sm);
  height: var(--ek-control-h-sm);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-sm);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-card__open:hover {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
}

.ek-card__open:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-card__body {
  flex: 1;
  padding: var(--ek-space-5);
  color: var(--ek-color-content-default);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
}

.ek-card--flush .ek-card__body {
  padding: 0;
}

.ek-card__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ek-space-2);
  padding: var(--ek-space-3) var(--ek-space-5);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface-muted);
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
}
</style>
