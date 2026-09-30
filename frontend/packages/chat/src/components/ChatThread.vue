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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'
import { useChat } from '../state/useChat'
import ChatMessageView from './ChatMessage.vue'

const chat = useChat()
const { t } = chat
const scrollRef = ref<HTMLElement | null>(null)
/** Kullanıcı en alttaysa (ya da hiç kaydırmadıysa) yeni içerik görünür tutulur; yukarı kaydırınca bırakılır. */
const atBottom = ref(true)
const THRESHOLD = 48
const jumpLabel = computed(() => t('thread.jump'))
/** Kendi kaydırmamızın ürettiği `scroll` olayı kullanıcı niyeti sayılmaz. */
let programmaticUntil = 0
let resizeObserver: ResizeObserver | null = null

function reducedMotion() {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function distance(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight
}

function onScroll() {
  const el = scrollRef.value
  if (!el || Date.now() < programmaticUntil) return
  atBottom.value = distance(el) <= THRESHOLD
}

function scrollToBottom(smooth = false) {
  const el = scrollRef.value
  if (!el) return
  const useSmooth = smooth && !reducedMotion()
  programmaticUntil = Date.now() + (useSmooth ? 400 : 60)
  if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight, behavior: useSmooth ? 'smooth' : 'auto' })
  else el.scrollTop = el.scrollHeight
  atBottom.value = true
}

watch(
  () => chat.messages.value,
  async () => {
    await nextTick()
    if (atBottom.value) scrollToBottom(false)
  },
)

onMounted(() => {
  scrollToBottom(false)
  // Parçalar geç boyut alır (tablo, yazı tipi, tembel bileşen): içerik büyüdükçe alttaysak altta kal.
  const inner = scrollRef.value?.firstElementChild
  if (inner && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (atBottom.value) scrollToBottom(false)
    })
    resizeObserver.observe(inner)
  }
})
onBeforeUnmount(() => resizeObserver?.disconnect())
defineExpose({ scrollToBottom })
</script>
