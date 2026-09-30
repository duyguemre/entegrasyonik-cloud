<template>
  <div class="mt-2 align-center ek-hint">
    <div class="d-flex align-center font-italic">
      <v-icon class="mr-2 " color="info">mdi-lightbulb-outline</v-icon>
      {{ hintText }}
      <slot/>
    </div>
  </div>
</template>
<script lang="ts" setup>
import { watch, ref } from 'vue'
const props = defineProps<{
  hintText?: string
}>()
</script>
<style scoped>
.ek-hint {
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}
</style>