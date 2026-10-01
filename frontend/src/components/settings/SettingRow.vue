<!--
  frontend/src/components/settings/SettingRow.vue

  FR3 madde 14 — ayar satırı: solda etiket (alanın erişilebilir adı, `<label for>`) + bir cümlelik açıklama, sağda denetim.
  `stacked`: geniş denetimler (renk paleti, gün seçimi, adres) etiketin altında tam genişlikte. Satırlar bölüm kartı (`EkDetailPanel flush`) içinde ince ayraçlarla dizilir.
-->
<template>
  <div class="srow" :class="{ 'srow--stacked': stacked, 'srow--changed': changed }" :data-setting="name">
    <div class="srow__meta">
      <div class="srow__label-row">
        <component :is="forId ? 'label' : 'span'" :for="forId" :id="labelId" class="srow__label">{{ label }}</component>
        <span v-if="changed" class="srow__changed">Değişti</span>
      </div>
      <p v-if="description || $slots.description" class="srow__description">
        <slot name="description">{{ description }}</slot>
      </p>
    </div>
    <div class="srow__control">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  /** Kayıt anahtarı (arama/değişiklik eşleşmesi, e2e). */
  name: string
  label: string
  description?: string
  /** Denetimin `id`'si — etiket `<label for>` olur (alan adı etiketten gelir). */
  forId?: string
  labelId?: string
  stacked?: boolean
  changed?: boolean
}>()
</script>

<style scoped>
.srow {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  gap: var(--ek-space-3) var(--ek-space-6);
  align-items: start;
  padding: var(--ek-space-4) var(--ek-space-5);
  transition: var(--ek-transition-colors);
}

.srow + .srow {
  border-top: 1px solid var(--ek-color-border-subtle);
}

.srow--stacked {
  grid-template-columns: minmax(0, 1fr);
}

.srow__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-top: var(--ek-space-2);
}

.srow--stacked .srow__meta {
  padding-top: 0;
}

.srow__label-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}

.srow__label {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  font-weight: var(--ek-font-weight-semibold);
}

.srow__changed {
  padding: 0 6px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action);
  font-size: var(--ek-type-micro-size);
  line-height: 18px;
  font-weight: var(--ek-font-weight-semibold);
}

.srow__description {
  margin: 0;
  max-width: 52ch;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.srow__control {
  min-width: 0;
}

@media (max-width: 767px) {
  .srow {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--ek-space-4);
  }

  .srow__meta {
    padding-top: 0;
  }
}
</style>
