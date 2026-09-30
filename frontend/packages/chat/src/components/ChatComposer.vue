<!--
  Composer: etiketli çok satırlı giriş. Enter gönderir, Shift+Enter yeni satır, IME birleştirmesinde Enter göndermez.
  Tur sürerken düğme "Durdur" olur (Esc de durdurur); metin boşken Esc paneli kapatır (`close`). Sayaç aria-describedby.
  `awaiting-confirm`'de devre dışı ("Devam etmek için işlemi onaylayın ya da reddedin.").
-->
<template>
  <form class="ek-chat-composer" :class="{ 'is-disabled': !enabled, 'is-busy': busy }" @submit.prevent="submit">
    <label :for="inputId" class="ek-chat-sr-only">{{ t('composer.label') }}</label>
    <textarea
      :id="inputId"
      ref="inputRef"
      v-model="text"
      class="ek-chat-composer__input"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="!enabled"
      :aria-label="t('composer.label')"
      :aria-describedby="`${inputId}-hint ${inputId}-count`"
      :aria-invalid="tooLong ? 'true' : undefined"
      :maxlength="max + 200"
      autocomplete="off"
      @keydown="onKeydown"
    />
    <div class="ek-chat-composer__bar">
      <span :id="`${inputId}-hint`" class="ek-chat-composer__hint">{{ tooLong ? t('composer.tooLong', { max }) : t('composer.hint') }}</span>
      <span class="ek-chat-composer__count" :class="{ 'is-over': tooLong, 'is-near': near }" aria-hidden="true">{{ text.length }}/{{ max }}</span>
      <span :id="`${inputId}-count`" class="ek-chat-sr-only">{{ t('composer.counter', { count: text.length, max }) }}</span>
      <EkButton
        v-if="busy"
        class="ek-chat-composer__action"
        tone="secondary"
        size="sm"
        icon="mdi-stop"
        type="button"
        @click="chat.stop()"
      >
        {{ t('composer.stop') }}
      </EkButton>
      <EkButton
        v-else
        class="ek-chat-composer__action"
        tone="primary"
        size="sm"
        icon="mdi-arrow-up"
        icon-only
        type="submit"
        :aria-label="t('composer.send')"
        :title="t('composer.send')"
        :disabled="!canSend"
      />
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, ref, useId, watch, nextTick } from 'vue'
import { EkButton } from '@entegrasyonik/ui/components'
import { useChat } from '../state/useChat'

const emit = defineEmits<{ close: [] }>()
const chat = useChat()
const { t } = chat
const inputId = `ek-chat-composer-${useId()}`
const inputRef = ref<HTMLTextAreaElement | null>(null)
const text = ref('')

const max = computed(() => chat.maxInputChars.value)
const busy = computed(() => chat.status.value === 'sending' || chat.status.value === 'streaming')
const enabled = computed(() => chat.canCompose.value || busy.value)
const tooLong = computed(() => text.value.length > max.value)
const near = computed(() => text.value.length > max.value * 0.9)
const canSend = computed(() => chat.canCompose.value && text.value.trim().length > 0 && !tooLong.value)
const rows = computed(() => Math.min(6, Math.max(1, text.value.split('\n').length)))
const placeholder = computed(() => {
  if (chat.status.value === 'awaiting-confirm') return t('composer.placeholderConfirm')
  if (!enabled.value) return t('composer.placeholderUnavailable')
  return t('composer.placeholder')
})

function submit() {
  if (!canSend.value) return
  if (chat.send(text.value)) text.value = ''
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault()
    submit()
    return
  }
  if (event.key === 'Escape') {
    if (busy.value) {
      event.preventDefault()
      chat.stop()
    } else if (!text.value) {
      event.preventDefault()
      emit('close')
    }
  }
}

function focus() {
  inputRef.value?.focus({ preventScroll: true })
}

/** Dışarıdan (palet "sor", öneri çipi) metin koyma. */
function setText(value: string) {
  text.value = value
}

watch(
  () => chat.focusRequest.value,
  async (req) => {
    if (req?.target !== 'composer') return
    await nextTick()
    if (inputRef.value && !inputRef.value.disabled) focus()
  },
)

defineExpose({ focus, setText })
</script>
