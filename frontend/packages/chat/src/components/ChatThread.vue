<!--
  Mesaj listesi: role="log" + aria-live="polite" + aria-relevant="additions". Otomatik kaydırma yalnız kullanıcı
  alttayken (yukarı kaydırdıysa içerik gelse de konumu korunur; "En alta in" düğmesi belirir). Reduced-motion'da anında.
-->
<template>
  <div class="ek-chat-thread">
    <div
      ref="scrollRef"
      class="ek-chat-thread__scroll"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      :aria-label="t('thread.label')"
      tabindex="0"
      @scroll.passive="onScroll"
    >
      <div class="ek-chat-thread__inner">
        <slot name="before" />
        <TransitionGroup name="ek-chat-msg" tag="div" class="ek-chat-thread__list">
          <ChatMessageView v-for="m in chat.messages.value" :key="m.id" :message="m" />
        </TransitionGroup>
      </div>
    </div>
    <EkButton v-if="!atBottom" class="ek-chat-thread__jump" size="sm" tone="secondary" icon="mdi-arrow-down" icon-only :aria-label="jumpLabel" :title="jumpLabel" @click="scrollToBottom(true)" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'
import { useChat } from '../state/useChat'
import ChatMessageView from './ChatMessage.vue'

const chat = useChat()
const { t } = chat
const scrollRef = ref<HTMLElement | null>(null)
const atBottom = ref(true)
const THRESHOLD = 48
const jumpLabel = computed(() => t('thread.jump'))

function reducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function onScroll() {
  const el = scrollRef.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight <= THRESHOLD
}

function scrollToBottom(smooth = false) {
  const el = scrollRef.value
  if (!el) return
  const top = el.scrollHeight
  if (typeof el.scrollTo === 'function') el.scrollTo({ top, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' })
  else el.scrollTop = top
  atBottom.value = true
}

watch(
  () => chat.messages.value,
  async () => {
    const stick = atBottom.value
    await nextTick()
    if (stick) scrollToBottom(false)
    else onScroll()
  },
)

onMounted(() => scrollToBottom(false))
defineExpose({ scrollToBottom })
</script>
