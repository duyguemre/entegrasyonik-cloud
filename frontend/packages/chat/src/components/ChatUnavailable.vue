<!-- `enabled:false` (DISABLED/MAINTENANCE) ve `info()` alınamadı durumları. Ham hata gösterilmez. -->
<template>
  <div class="ek-chat-state" role="status">
    <EkIconTile :icon="icon" tone="neutral" />
    <p class="ek-chat-state__title">{{ title }}</p>
    <p class="ek-chat-state__body">{{ body }}</p>
    <EkButton v-if="reason === 'LOAD_FAILED'" size="sm" tone="secondary" icon="mdi-refresh" @click="chat.ensureLoaded(true)">{{ t('panel.retryLoad') }}</EkButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkButton, EkIconTile } from '@entegrasyonik/ui/components'
import { useChat } from '../state/useChat'

const chat = useChat()
const { t } = chat
const reason = computed(() => chat.machine.value.unavailableReason ?? 'DISABLED')
const icon = computed(() => (reason.value === 'MAINTENANCE' ? 'mdi-wrench-clock' : reason.value === 'LOAD_FAILED' ? 'mdi-cloud-off-outline' : 'mdi-power-plug-off-outline'))
const title = computed(() =>
  reason.value === 'MAINTENANCE' ? t('unavailable.maintenance.title') : reason.value === 'LOAD_FAILED' ? t('error.title') : t('unavailable.disabled.title'),
)
const body = computed(() =>
  reason.value === 'MAINTENANCE' ? t('unavailable.maintenance.body') : reason.value === 'LOAD_FAILED' ? t('panel.loadFailed') : t('unavailable.disabled.body'),
)
</script>
