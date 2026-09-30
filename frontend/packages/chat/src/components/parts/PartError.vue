<!--
  Hata parçası: kullanıcıya güvenli, eyleme dönük ileti (ham hata/yığın YOK) + destek kodu + eylem
  (yeniden dene / kurulumu aç / ekrana git). "Yeniden dene" yalnız son mesajdaki hata için ve makine `error`'dayken.
-->
<template>
  <div class="ek-chat-error" :class="`is-${tone}`" role="group" :aria-label="t('error.title')">
    <v-icon class="ek-chat-error__icon" :icon="tone === 'warning' ? 'mdi-alert-outline' : 'mdi-alert-circle-outline'" size="small" aria-hidden="true" />
    <div class="ek-chat-error__body">
      <p class="ek-chat-error__message">{{ part.message }}</p>
      <p v-if="part.supportCode" class="ek-chat-error__support">{{ t('error.supportCode', { code: part.supportCode }) }}</p>
      <div v-if="showRetry || showSetup || openTarget" class="ek-chat-error__actions">
        <EkButton v-if="showRetry" size="sm" tone="secondary" icon="mdi-refresh" @click="chat.retry()">{{ t('error.retry') }}</EkButton>
        <EkButton v-if="showSetup" size="sm" tone="secondary" icon="mdi-key-outline" @click="chat.openSetup()">{{ t('error.openSetup') }}</EkButton>
        <EkButton v-if="openTarget" size="sm" tone="ghost" trailing-icon="mdi-arrow-right" @click="openLink">{{ openLabel }}</EkButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'
import type { ErrorPart } from '../../protocol/v1'
import { useChat } from '../../state/useChat'

const props = defineProps<{ part: ErrorPart; messageId?: string }>()
const chat = useChat()
const { t } = chat

const WARNING = new Set(['LIVE_READONLY', 'RATE_LIMITED', 'LLM_RATE_LIMITED', 'MAINTENANCE', 'QUOTA_EXCEEDED', 'LLM_QUOTA', 'OFFLINE'])
const tone = computed(() => (WARNING.has(props.part.code) ? 'warning' : 'error'))

const isLast = computed(() => {
  const list = chat.messages.value
  return !!props.messageId && list[list.length - 1]?.id === props.messageId
})
const showRetry = computed(() => props.part.retryable && isLast.value && chat.status.value === 'error')
const showSetup = computed(() => props.part.action?.kind === 'setup' && chat.status.value !== 'setup-required')
const openTarget = computed(() => (props.part.action?.kind === 'open' ? chat.host.resolveLink(props.part.action.link) : null))
const openLabel = computed(() => (props.part.action?.kind === 'open' ? props.part.action.label : ''))

function openLink() {
  chat.host.track?.({ name: 'chat.link', entity: 'screen' })
  openTarget.value?.open()
}
</script>
