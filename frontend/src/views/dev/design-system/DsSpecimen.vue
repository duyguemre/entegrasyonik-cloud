<!-- Vitrin örnek kutusu: başlık (H3) + not + gövde. `canvas` gövdeyi çalışma alanı zemininde çizer. -->
<template>
  <div class="ds-spec" :class="{ 'ds-spec--canvas': canvas, 'ds-spec--flush': flush }">
    <div class="ds-spec__head">
      <h3 class="ds-spec__title">{{ title }}</h3>
      <p v-if="note" class="ds-spec__note">{{ note }}</p>
    </div>
    <div class="ds-spec__body"><slot /></div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; note?: string; canvas?: boolean; flush?: boolean }>()
</script>

<style scoped>
.ds-spec {
  min-width: 0;
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  box-shadow: var(--ek-shadow-card);
}

.ds-spec__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--ek-space-1) var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-5);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ds-spec__title {
  margin: 0;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.ds-spec__note {
  margin: 0;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ds-spec__body {
  padding: var(--ek-space-5);
  overflow-x: auto;
}

.ds-spec--canvas .ds-spec__body {
  background: var(--ek-color-app-bg);
  border-radius: 0 0 var(--ek-radius-card) var(--ek-radius-card);
}

.ds-spec--flush .ds-spec__body {
  padding: 0;
}
</style>
