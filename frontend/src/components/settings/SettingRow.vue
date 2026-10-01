<!--
  frontend/src/components/settings/SettingRow.vue

  FE R4 C1 (K61) — ayar ALANI: etiket (alanın erişilebilir adı, `<label for>`) + "Değişti" rozeti üstte, denetim ortada,
  bir cümlelik açıklama altta (yardım metni). Bölüm ızgarasında (`.sl-fields`, 2 kolon) yan yana dizilir; `wide`
  (eski adı `stacked`) tam genişlik — renk paleti, logo, gün seçimi, adres. `error`: Vuetify alanı OLMAYAN denetimler
  (gün kutuları) için hata metni; metin alanlarının hatası alanın kendi `error-messages`'ıyla gösterilir.
  Önceki sürüm (FR3-14): solda etiket + açıklama, sağda denetim — tek kolon satırlar.
-->
<template>
  <div class="srow" :class="{ 'srow--wide': wide || stacked, 'srow--changed': changed, 'srow--error': !!error }" :data-setting="name">
    <div class="srow__label-row">
      <component :is="forId ? 'label' : 'span'" :for="forId" :id="labelId" class="srow__label">{{ label }}</component>
      <span v-if="changed" class="srow__changed">Değişti</span>
    </div>
    <div class="srow__control">
      <slot />
    </div>
    <p v-if="error" :id="`${name}-error`" class="srow__error" role="alert">
      <v-icon icon="mdi-alert-circle-outline" aria-hidden="true" />{{ error }}
    </p>
    <p v-if="description || $slots.description" class="srow__description">
      <slot name="description">{{ description }}</slot>
    </p>
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
  /** Tam genişlik (ızgarada iki kolonu kaplar). */
  wide?: boolean
  /** Eski ad — `wide` ile aynı. */
  stacked?: boolean
  changed?: boolean
  /** Vuetify alanı olmayan denetimin hata metni. */
  error?: string
}>()
</script>

<style scoped>
.srow {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  min-width: 0;
}

.srow--wide {
  grid-column: 1 / -1;
}

.srow__label-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
  min-height: 20px;
}

.srow__label {
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-label-size);
  line-height: var(--ek-type-label-line);
  font-weight: var(--ek-font-weight-semibold);
}

.srow__changed {
  padding: 0 6px;
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-micro-size);
  line-height: 16px;
  font-weight: var(--ek-font-weight-semibold);
}

.srow__control {
  min-width: 0;
}

.srow__description {
  margin: 0;
  max-width: 64ch;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.srow__error {
  display: flex;
  align-items: center;
  gap: var(--ek-space-1);
  margin: 0;
  color: var(--ek-color-error-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.srow__error .v-icon {
  font-size: var(--ek-icon-xs);
}
</style>
