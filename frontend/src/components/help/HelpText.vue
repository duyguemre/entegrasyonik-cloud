<!--
  frontend/src/components/help/HelpText.vue — yardım içeriğindeki düz metni çizer; yalnız `**kalın**` işaretini
  `<strong>`'a çevirir (v-html YOK → içerik HTML enjekte edemez).
-->
<template>
  <template v-for="(part, i) in parts" :key="i"><strong v-if="part.strong">{{ part.text }}</strong><template v-else>{{ part.text }}</template></template>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ text: string }>()

const parts = computed(() =>
  String(props.text ?? '')
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((chunk) => (/^\*\*[^*]+\*\*$/.test(chunk) ? { text: chunk.slice(2, -2), strong: true } : { text: chunk, strong: false })),
)
</script>
