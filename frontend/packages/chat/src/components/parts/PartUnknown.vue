<!-- İleri uyum: bu sürümün tanımadığı parça türü (ör. 'chart'). İçerik ÇİZİLMEZ; yalnız güvenli yedek görünüm. -->
<template>
  <div class="ek-chat-unknown" role="note">
    <v-icon icon="mdi-puzzle-outline" size="small" aria-hidden="true" />
    <div>
      <p class="ek-chat-unknown__title">{{ t('unknown.title') }}</p>
      <p class="ek-chat-unknown__body">{{ t('unknown.body') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UnknownPart } from '../../protocol/v1'
import { useChat } from '../../state/useChat'

defineProps<{ part: UnknownPart; messageId?: string }>()
const { t } = useChat()
</script>
