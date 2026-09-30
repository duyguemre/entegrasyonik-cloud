<!--
  frontend/src/components/ds/EkActiveFilters.vue

  DS-v2 — aktif filtre çipleri. Her çip "Etiket: değer ×"; tek tıkla kaldırılır.
  Sonda "Tümünü temizle". Filtre yoksa hiçbir şey çizilmez (yer kaplamaz).
  Çip kaldırma düğmesinin erişilebilir adı "<Etiket> filtresini kaldır".
-->
<template>
  <div v-if="filters.length" class="ek-active-filters" role="group" aria-label="Aktif filtreler">
    <span class="ek-active-filters__label">Aktif filtreler</span>
    <span v-for="f in filters" :key="f.key" class="ek-active-filters__chip">
      <span class="ek-active-filters__chip-label">{{ f.label }}:</span>
      <span class="ek-active-filters__chip-value">{{ f.value }}</span>
      <button type="button" class="ek-active-filters__remove" :aria-label="`${f.label} filtresini kaldır`" @click="emit('remove', f.key)">
        <v-icon icon="mdi-close" aria-hidden="true" />
      </button>
    </span>
    <button type="button" class="ek-active-filters__clear" @click="emit('clear')">Tümünü temizle</button>
  </div>
</template>

<script setup lang="ts">
export interface EkActiveFilterChip {
  key: string
  label: string
  value: string
}

defineProps<{ filters: EkActiveFilterChip[] }>()
const emit = defineEmits<{ remove: [key: string]; clear: [] }>()
</script>

<style scoped>
.ek-active-filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.ek-active-filters__label {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-active-filters__chip {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-1);
  max-width: 100%;
  height: var(--ek-app-chip-h-md);
  padding: 0 3px 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-action-border);
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
  transition: var(--ek-transition-colors);
}

/* Aşama 5: çip bütünü hover'da belirginleşir (kaldırılabilir olduğu hissi); kaldırma düğmesi dairesel, çipe ortalı. */
.ek-active-filters__chip:hover,
.ek-active-filters__chip:focus-within {
  border-color: var(--ek-color-action);
}

.ek-active-filters__chip-label {
  color: var(--ek-color-content-muted);
  font-weight: var(--ek-font-weight-medium);
}

.ek-active-filters__chip-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--ek-font-weight-semibold);
}

.ek-active-filters__remove {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 2px;
  border: 0;
  border-radius: var(--ek-radius-chip);
  background: transparent;
  color: inherit;
  font-size: var(--ek-icon-xs);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-active-filters__remove:hover {
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
}

.ek-active-filters__remove:focus-visible,
.ek-active-filters__clear:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-active-filters__clear {
  height: var(--ek-app-chip-h-md);
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-action);
  font-family: inherit;
  font-size: var(--ek-type-caption-size);
  font-weight: var(--ek-font-weight-semibold);
  cursor: pointer;
}

.ek-active-filters__clear:hover {
  background: var(--ek-color-action-subtle);
  text-decoration: underline;
}
</style>
