<!-- İlk açılış: kısa tanıtım + öneri çipleri (info.suggestions, locale'e göre sunucudan). -->
<template>
  <div class="ek-chat-empty">
    <div class="ek-chat-empty__mark" aria-hidden="true"><v-icon :icon="CHAT_ICON" /></div>
    <p class="ek-chat-empty__title">{{ t('empty.title') }}</p>
    <p class="ek-chat-empty__body">{{ t('empty.body') }}</p>
    <div v-if="suggestions.length" class="ek-chat-empty__suggestions" role="group" :aria-label="t('empty.suggestions')">
      <button v-for="s in suggestions" :key="s.id" type="button" class="ek-chat-suggestion" :disabled="!chat.canCompose.value" @click="chat.send(s.text)">
        <v-icon icon="mdi-arrow-top-right" size="x-small" aria-hidden="true" />
        <span>{{ s.text }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useChat } from '../state/useChat'
import { CHAT_ICON } from './icons'

const chat = useChat()
const { t } = chat
const suggestions = computed(() => chat.info.value?.suggestions ?? [])
</script>
