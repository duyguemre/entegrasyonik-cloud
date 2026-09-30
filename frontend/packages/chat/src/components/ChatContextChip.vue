<!-- Sayfa bağlamı çipi: gönderilecek bağlamı gösterir; kaldırılınca istek bağlamsız gider (§4 `context` gönderilmez). -->
<template>
  <div v-if="chat.context.value" class="ek-chat-context">
    <v-icon icon="mdi-map-marker-outline" size="x-small" aria-hidden="true" />
    <span class="ek-chat-context__label">{{ t('context.label', { label: chat.context.value.label }) }}</span>
    <button type="button" class="ek-chat-context__remove" :aria-label="t('context.remove')" :title="t('context.remove')" @click="remove">
      <v-icon icon="mdi-close" size="x-small" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { useChat } from '../state/useChat'

const emit = defineEmits<{ removed: [] }>()
const chat = useChat()
const { t } = chat

function remove() {
  chat.clearContext()
  emit('removed')
}
</script>
