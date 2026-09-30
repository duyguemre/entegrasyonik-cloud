<!--
  frontend/src/components/common/QuickCreateRow.vue

  FR2-PFORM madde 23 — seçim listesinin en altındaki "yeni ekle" satırı (marka/kategori combobox'ları).
  Menüde metin kutusu YOK (Vuetify menüde yazılanı arama kutusuna yönlendirir); yazılan arama metni satırda
  önerilir: “Deri Çanta” adıyla yeni kategori ekle. Tıklama/Enter → çağıran QuickCreateDialog'u açar.
-->
<template>
  <div class="qcr" :class="{ 'qcr--first': !hasResults }">
    <button type="button" class="qcr__btn" data-qc-row @mousedown.prevent @click="emit('create')">
      <span class="qcr__icon" aria-hidden="true"><v-icon icon="mdi-plus" /></span>
      <span class="qcr__text">
        <span v-if="query" class="qcr__title">“<strong>{{ query }}</strong>” adıyla yeni {{ noun }} ekle</span>
        <span v-else class="qcr__title">Yeni {{ noun }} ekle</span>
        <span class="qcr__sub">{{ hasResults ? `Aradığınız ${noun} listede yoksa` : `Listede bu adla bir ${noun} yok` }}</span>
      </span>
      <v-icon class="qcr__end" icon="mdi-arrow-right" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ noun: string; query?: string; hasResults?: boolean }>()
const emit = defineEmits<{ create: [] }>()
</script>

<style scoped>
.qcr {
  position: sticky;
  bottom: 0;
  padding: var(--ek-space-2);
  border-top: 1px solid var(--ek-color-border-subtle);
  background: var(--ek-color-surface);
}

.qcr--first {
  border-top: 0;
}

.qcr__btn {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  width: 100%;
  min-height: 48px;
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px dashed var(--ek-color-action-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-action-subtle);
  color: var(--ek-color-content-default);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.qcr__btn:hover {
  border-style: solid;
  background: var(--ek-color-surface-muted);
}

.qcr__btn:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.qcr__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-action);
  color: var(--ek-color-action-contrast);
}

.qcr__icon :deep(.v-icon) {
  font-size: 18px;
}

.qcr__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.qcr__title {
  overflow: hidden;
  color: var(--ek-color-action-emphasis);
  font-size: var(--ek-type-label-size);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qcr__sub {
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
}

.qcr__end {
  flex: none;
  color: var(--ek-color-action-emphasis);
  font-size: 18px;
}
</style>
