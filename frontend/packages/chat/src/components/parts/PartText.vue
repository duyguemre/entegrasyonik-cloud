<!-- Metin parçası: güvenli markdown alt kümesi ya da düz metin; akış sırasında yazma imleci (reduced-motion'da sabit). -->
<template>
  <div class="ek-chat-text" :class="{ 'is-streaming': part.streaming }">
    <MarkdownView :source="part.text" :format="part.format" />
    <span v-if="part.streaming" class="ek-chat-caret" aria-hidden="true" />
  </div>
</template>

<script setup lang="ts">
import type { TextPart } from '../../protocol/v1'
import MarkdownView from '../MarkdownView'

defineProps<{ part: TextPart; messageId?: string }>()
</script>
