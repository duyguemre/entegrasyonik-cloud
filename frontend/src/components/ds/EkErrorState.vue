<!--
  frontend/src/components/ds/EkErrorState.vue

  ADR-0015 Karar 3.2/6.1 — hata durumu. Aşama 6b (Standart 1): görünüm TEK hata deseni `EkProblemState`'ten gelir
  (ne oldu · neden · ne yapmalı · Tekrar dene · katlanır teknik ayrıntı). Eski API korunur: `message` = "<ne oldu> —
  <ne yapılmalı>" tek cümlesi (tire varsa başlık/eylem olarak bölünür); `cause`/`action`/`details` isteğe bağlı.
  Ham hata, HTTP kodu ve stack gövdede GÖSTERİLMEZ (yalnız teknik ayrıntıda).

    <EkErrorState message="Siparişler yüklenemedi — bağlantınızı kontrol edip tekrar deneyin." @retry="refetch" />
    <EkErrorState size="inline" message="Kayıtlar yüklenemedi." @retry="refetch" />
-->
<template>
  <EkProblemState
    class="ek-error-state"
    :class="`ek-error-state--${size}`"
    :title="parts.title"
    :cause="cause"
    :action="action ?? parts.action"
    :details="details"
    :retrying="retrying"
    :size="size === 'page' ? 'page' : 'inline'"
    @retry="emit('retry')"
  >
    <template v-if="$slots.actions" #actions><slot name="actions" /></template>
  </EkProblemState>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EkProblemState from './EkProblemState.vue'

const props = withDefaults(
  defineProps<{
    /** "<ne oldu> — <ne yapılmalı>" biçiminde, ham hata/HTTP kodu/stack YOK. */
    message: string
    size?: 'page' | 'inline'
    cause?: string
    action?: string
    details?: Array<{ label: string; value: string }>
    retrying?: boolean
  }>(),
  { size: 'page', retrying: false },
)

const emit = defineEmits<{ retry: [] }>()

/** "Başlık — ne yapmalı" tek cümlesini iki satıra böler (tire yoksa tümü başlık). */
const parts = computed(() => {
  const m = props.message.split(/\s+[—–-]\s+/)
  return m.length > 1 ? { title: m[0], action: m.slice(1).join(' — ').replace(/^./, (c) => c.toLocaleUpperCase('tr-TR')) } : { title: props.message, action: undefined }
})
</script>
