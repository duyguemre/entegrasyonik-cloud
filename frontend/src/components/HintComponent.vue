<template>
  <div class="mt-2 align-center" style="font-size:.9em">
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
<style scoped></style>