<!--
  frontend/src/components/help/HelpMarks.vue — arama eşleşme vurgusu (`help/search.ts` `highlight` parçaları → `<mark>`).
-->
<template>
  <template v-for="(part, i) in parts" :key="i"><mark v-if="part.match" class="ek-help-mark">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template>
</template>

<script setup lang="ts">
import type { HighlightPart } from '@/help/search'

defineProps<{ parts: HighlightPart[] }>()
</script>

<style>
.ek-help-mark {
  padding: 0 1px;
  border-radius: 2px;
  background: var(--ek-color-warning-subtle);
  box-shadow: inset 0 -1px 0 var(--ek-color-warning-border);
  color: var(--ek-color-content-strong);
}
</style>
