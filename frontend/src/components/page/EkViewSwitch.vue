<!--
  frontend/src/components/page/EkViewSwitch.vue

  FE-LOCAL-1048 — sayfa adı satırındaki Liste | Özet anahtarı (EkListScreen'deki ile AYNI görünüm ve çapalar), liste
  şablonu kullanmayan ekranlar için (ör. entegrasyon sayfaları). "Özet" sayfa içeriğinin YERİNE bölüm panosunu açar.
    <EkViewSwitch v-model="view" />            view: 'list' | 'summary'
-->
<template>
  <div class="ek-view-switch" role="group" aria-label="Görünüm">
    <button type="button" class="ek-view-switch__btn" :class="{ 'is-on': modelValue === 'list' }" :aria-pressed="modelValue === 'list'" data-view="list"
      @click="emit('update:modelValue', 'list')">
      <v-icon :icon="listIcon" aria-hidden="true" /><span>{{ listLabel }}</span>
    </button>
    <button type="button" class="ek-view-switch__btn" :class="{ 'is-on': modelValue === 'summary' }" :aria-pressed="modelValue === 'summary'" data-view="summary"
      data-summary-toggle @click="emit('update:modelValue', 'summary')">
      <v-icon icon="mdi-chart-box-outline" aria-hidden="true" /><span>Özet</span>
    </button>
  </div>
</template>

<script setup lang="ts">
export type EkViewMode = 'list' | 'summary'

withDefaults(defineProps<{ modelValue: EkViewMode; listLabel?: string; listIcon?: string }>(), { listLabel: 'Liste', listIcon: 'mdi-format-list-bulleted' })
const emit = defineEmits<{ 'update:modelValue': [value: EkViewMode] }>()
</script>

<style scoped>
.ek-view-switch {
  display: inline-flex;
  flex: none;
  padding: 2px;
  gap: 2px;
  border: 1px solid var(--ek-color-border-input);
  border-radius: var(--ek-radius-tile);
  background: var(--ek-color-surface);
}

.ek-view-switch__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: calc(var(--ek-control-h-sm) - 6px);
  padding: 0 var(--ek-space-2);
  border: 0;
  border-radius: var(--ek-radius-md);
  background: transparent;
  color: var(--ek-color-content-default);
  font-family: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-view-switch__btn .v-icon {
  font-size: var(--ek-icon-sm);
  color: var(--ek-color-content-muted);
}

.ek-view-switch__btn:hover {
  background: var(--ek-color-surface-muted);
  color: var(--ek-color-content-strong);
}

.ek-view-switch__btn.is-on {
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-action-emphasis);
}

.ek-view-switch__btn.is-on .v-icon {
  color: var(--ek-color-action);
}

.ek-view-switch__btn:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}
</style>
