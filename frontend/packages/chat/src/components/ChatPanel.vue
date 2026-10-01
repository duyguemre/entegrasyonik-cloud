<!--
  Sohbet paneli: başlık + gövde (durum makinesine göre) + composer. `mode="side"` (yan panel) ve `mode="page"` (tam sayfa;
  okunur satır genişliği ≤ 760 px ortalanmış) AYNI bileşen; uygulama yerleşimi (itme/üstüne binme, genişlik) host'tadır.
  Durumlar: loading · setup-required (kurulum formu, sohbet listesi yerine) · unavailable · sohbet (idle/sending/streaming/
  awaiting-confirm/error). Canlı bölgeler: thread `role=log`; tur sonu özeti + durum için ayrı görünmez `role=status`.
-->
<template>
  <section class="ek-chat" :class="[`is-${mode}`, `is-${chat.status.value}`, { 'is-wide': wide }]" :aria-labelledby="titleId">
    <header class="ek-chat__head">
      <span class="ek-chat__mark" aria-hidden="true"><v-icon :icon="CHAT_ICON" size="small" /></span>
      <h2 :id="titleId" class="ek-chat__title">{{ CHAT_PRODUCT.name }}</h2>
      <EkStatusChip v-if="chat.readOnly.value" class="ek-chat__badge" tone="neutral" icon="mdi-eye-outline" :label="t('panel.readOnly')" :title="t('panel.readOnlyHint')" />
      <div class="ek-chat__actions">
        <EkButton
          v-if="chatReady"
          tone="ghost"
          size="sm"
          icon="mdi-square-edit-outline"
          icon-only
          :aria-label="t('panel.newChat')"
          :title="t('panel.newChat')"
          :disabled="!chat.messages.value.length"
          @click="newChat"
        />
        <EkButton v-if="settingsTarget" tone="ghost" size="sm" icon="mdi-cog-outline" icon-only :aria-label="t('panel.settings')" :title="t('panel.settings')" @click="openSettings" />
        <EkButton
          v-if="showExpand"
          tone="ghost"
          size="sm"
          :icon="mode === 'side' ? 'mdi-arrow-expand' : 'mdi-dock-right'"
          icon-only
          :aria-label="mode === 'side' ? t('panel.expand') : t('panel.collapse')"
          :title="mode === 'side' ? t('panel.expand') : t('panel.collapse')"
          @click="mode === 'side' ? emit('expand') : emit('collapse')"
        />
        <EkButton v-if="showClose" tone="ghost" size="sm" icon="mdi-close" icon-only :aria-label="t('panel.close')" :title="t('panel.close')" @click="emit('close')" />
      </div>
    </header>

    <div class="ek-chat__body">
      <div v-if="chat.status.value === 'loading'" class="ek-chat-state" role="status">
        <ChatSpinner :size="20" />
        <p class="ek-chat-state__body">{{ t('panel.loading') }}</p>
      </div>
      <div v-else-if="chat.status.value === 'setup-required'" class="ek-chat__scroll">
        <ChatProviderSetup :api="chat.transport.setup" variant="panel" @ready="chat.setupSaved()" />
      </div>
      <div v-else-if="chat.status.value === 'unavailable'" class="ek-chat__scroll">
        <ChatUnavailable />
      </div>
      <ChatThread v-else ref="threadRef">
        <template v-slot:before>
          <ChatEmptyState v-if="!chat.messages.value.length" />
        </template>
      </ChatThread>
    </div>

    <footer v-if="chatReady" class="ek-chat__foot">
      <EkAlert v-if="offline" tone="warning" :text="t('turnError.OFFLINE')" dense />
      <ChatContextChip @removed="announce(t('context.removed'))" />
      <ChatComposer ref="composerRef" @close="emit('close')" />
      <p class="ek-chat__privacy">
        <v-icon icon="mdi-shield-lock-outline" size="x-small" aria-hidden="true" />
        {{ t('panel.privacy') }}
      </p>
    </footer>

    <p class="ek-chat-sr-only" role="status" aria-live="polite" aria-atomic="true">{{ chat.liveMessage.value }}</p>
    <p class="ek-chat-sr-only" aria-live="polite" aria-atomic="true">{{ politeNote }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { EkAlert, EkButton, EkStatusChip } from '@entegrasyonik/ui/components'
import { CHAT_PRODUCT } from '../brand'
import { provideChat, type ChatController } from '../state/useChat'
import ChatComposer from './ChatComposer.vue'
import ChatContextChip from './ChatContextChip.vue'
import ChatEmptyState from './ChatEmptyState.vue'
import ChatProviderSetup from './ChatProviderSetup.vue'
import ChatSpinner from './ChatSpinner.vue'
import ChatThread from './ChatThread.vue'
import ChatUnavailable from './ChatUnavailable.vue'
import { CHAT_ICON } from './icons'
import '../styles/chat.css'

const props = withDefaults(
  defineProps<{
    controller: ChatController
    mode?: 'side' | 'page'
    showClose?: boolean
    showExpand?: boolean
    autofocus?: boolean
    /**
     * Geniş yerleşim (isteğe bağlı; varsayılan KAPALI → web uygulaması değişmez): tam sayfada okunur sınır 760 → 1180 px
     * (metin yine ≤ 80ch), dar kapta (< 560 px) tablolar yatay kaydırma yerine etiketli kart satırlara iner.
     */
    wide?: boolean
  }>(),
  {
  mode: 'side',
  showClose: true,
  showExpand: true,
  autofocus: true,
  wide: false,
  },
)
const emit = defineEmits<{ close: []; expand: []; collapse: [] }>()

const chat = provideChat(props.controller)
const { t } = chat
const titleId = `ek-chat-title-${useId()}`
const composerRef = ref<InstanceType<typeof ChatComposer> | null>(null)
const threadRef = ref<InstanceType<typeof ChatThread> | null>(null)
const politeNote = ref('')

const CHAT_STATES = new Set(['idle', 'sending', 'streaming', 'awaiting-confirm', 'error'])
const chatReady = computed(() => CHAT_STATES.has(chat.status.value))
const offline = computed(() => chat.status.value === 'error' && chat.machine.value.error?.code === 'OFFLINE')
const settingsTarget = computed(() => {
  const link = chat.host.settingsLink?.()
  return link ? chat.host.resolveLink(link) : null
})

function announce(text: string) {
  politeNote.value = ''
  queueMicrotask(() => (politeNote.value = text))
}

async function newChat() {
  await chat.reset()
}

function openSettings() {
  chat.host.track?.({ name: 'chat.link', entity: 'screen' })
  settingsTarget.value?.open()
}

const onOnline = () => chat.setOnline(true)
const onOffline = () => chat.setOnline(false)

onMounted(() => {
  void chat.ensureLoaded()
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  if (props.autofocus) requestAnimationFrame(() => composerRef.value?.focus())
})

onBeforeUnmount(() => {
  window.removeEventListener('online', onOnline)
  window.removeEventListener('offline', onOffline)
})

defineExpose({
  focusComposer: () => composerRef.value?.focus(),
  setComposerText: (text: string) => composerRef.value?.setText(text),
  scrollToBottom: () => threadRef.value?.scrollToBottom(false),
})
</script>
