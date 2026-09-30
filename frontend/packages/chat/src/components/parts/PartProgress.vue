<!-- Araç çağrısı durumu: çalışıyor / tamamlandı / başarısız / iptal. Durum metinle de verilir (renk tek başına değil). -->
<template>
  <div class="ek-chat-progress" :class="`is-${part.state}`">
    <span class="ek-chat-progress__icon" aria-hidden="true">
      <ChatSpinner v-if="part.state === 'running'" />
      <v-icon v-else :icon="icon" size="small" />
    </span>
    <span class="ek-chat-progress__label">{{ part.label }}</span>
    <span class="ek-chat-progress__state">{{ stateLabel }}<template v-if="part.detail"> · {{ part.detail }}</template></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ProgressPart } from '../../protocol/v1'
import { useChat } from '../../state/useChat'
import ChatSpinner from '../ChatSpinner.vue'

const props = defineProps<{ part: ProgressPart; messageId?: string }>()
const { t } = useChat()
const ICONS = { done: 'mdi-check-circle-outline', failed: 'mdi-alert-circle-outline', cancelled: 'mdi-minus-circle-outline', running: 'mdi-timer-sand' } as const
const icon = computed(() => ICONS[props.part.state])
const stateLabel = computed(() => t(`progress.${props.part.state}`))
</script>
