<!--
  DS-v2 Aşama 2 — diyalog/form içinde platform SEÇİMİ için düğme (tekli veya çoklu).
  `EkPlatformMark` (monogram + ad) + seçiliyse aksiyon çerçevesi ve onay ikonu.
  Erişilebilirlik: gerçek `<button>`, `aria-pressed`; renk tek başına anlam taşımaz.
  (Liste hücrelerindeki `PlatformImageComponent` durum rozeti yerine GEÇMEZ.)
-->
<template>
  <button type="button" class="ek-platform-choice" :class="{ 'is-active': active }" :aria-pressed="active"
    @click="emit('select', code)">
    <EkPlatformMark :name="name" :code="code" size="sm" />
    <v-icon class="ek-platform-choice__check" :icon="active ? 'mdi-check-circle-outline' : 'mdi-circle-outline'"
      aria-hidden="true" />
  </button>
</template>

<script setup lang="ts">
import { EkPlatformMark } from '@entegrasyonik/ui/components'

defineProps<{ code: string; name: string; active: boolean }>()
const emit = defineEmits<{ select: [code: string] }>()
</script>

<style scoped>
.ek-platform-choice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ek-space-2);
  min-height: var(--ek-control-h-lg);
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-default);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-platform-choice:hover {
  border-color: var(--ek-color-border-strong);
  background: var(--ek-color-surface-muted);
}

.ek-platform-choice:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.ek-platform-choice.is-active {
  border-color: var(--ek-color-action-border);
  background: var(--ek-color-action-subtle);
}

.ek-platform-choice__check {
  flex: none;
  color: var(--ek-color-content-subtle);
  font-size: var(--ek-icon-md);
}

.ek-platform-choice.is-active .ek-platform-choice__check {
  color: var(--ek-color-action);
}
</style>
