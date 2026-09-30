<!-- Tek mesaj: rol + parçalar. Akış sırasında aria-busy="true" (delta'lar tek tek duyurulmaz; tur sonu özeti ayrı bölgede). -->
<template>
  <article
    class="ek-chat-msg"
    :class="[`is-${message.role}`, `is-${message.status}`]"
    :aria-busy="message.status === 'streaming' ? 'true' : 'false'"
    :aria-label="roleLabel"
  >
    <div v-if="message.role === 'assistant'" class="ek-chat-msg__avatar" aria-hidden="true">
      <v-icon :icon="CHAT_ICON" size="small" />
    </div>
    <div class="ek-chat-msg__body">
      <template v-if="message.role === 'notice'">
        <p class="ek-chat-msg__notice">{{ noticeText }}</p>
      </template>
      <template v-else>
        <PartRenderer v-for="part in message.parts" :key="part.id" :part="part" :message-id="message.id" />
        <p v-if="message.role === 'assistant' && message.status === 'streaming' && !message.parts.length" class="ek-chat-msg__typing">
          <span class="ek-chat-dots" aria-hidden="true"><span /><span /><span /></span>
          <span>{{ t('message.streaming') }}</span>
        </p>
        <p v-if="message.status === 'cancelled'" class="ek-chat-msg__meta">
          <v-icon icon="mdi-stop-circle-outline" size="x-small" aria-hidden="true" /> {{ t('message.cancelled') }}
        </p>
      </template>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '../protocol/v1'
import { useChat } from '../state/useChat'
import { CHAT_ICON } from './icons'
import PartRenderer from './parts/PartRenderer.vue'

const props = defineProps<{ message: ChatMessage }>()
const { t } = useChat()
const roleLabel = computed(() => (props.message.role === 'user' ? t('message.user') : props.message.role === 'assistant' ? t('message.assistant') : undefined))
const noticeText = computed(() => {
  const first = props.message.parts[0]
  return first && first.type === 'text' ? (first as { text: string }).text : ''
})
</script>
