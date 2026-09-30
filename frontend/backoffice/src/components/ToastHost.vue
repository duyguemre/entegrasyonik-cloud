<template>
  <div class="bo-toasts" role="status" aria-live="polite">
    <EkAlert v-for="t in toasts" :key="t.id" :tone="t.tone" :text="t.text" dense dismissible class="bo-toasts__item" @dismiss="dismiss(t.id)" />
  </div>
</template>

<script setup lang="ts">
import { EkAlert } from '@entegrasyonik/ui/components'
import { dismiss, toasts } from '@bo/utils/toast'
</script>

<style scoped>
.bo-toasts {
  position: fixed;
  right: var(--ek-space-4);
  bottom: var(--ek-space-4);
  z-index: 3000;
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-2);
  width: min(420px, calc(100vw - 2 * var(--ek-space-4)));
}

.bo-toasts__item {
  box-shadow: var(--ek-shadow-popover);
}
</style>
