<!-- Otopilot tam sayfa (backoffice). Yan panelle AYNI denetleyici: geçişte konuşma sürer. Okunur genişlik ≤ 760 px. -->
<template>
  <div class="bo-page bo-otopilot-page">
    <BoPageHeader>
      <template #meta>
        <span><v-icon icon="mdi-eye-outline" size="small" aria-hidden="true" /> Yönetim uygulamasında {{ CHAT_PRODUCT.name }} yalnız okur; işlem önermez. Sohbetler kaydedilmez.</span>
      </template>
    </BoPageHeader>
    <div class="bo-otopilot-page__panel">
      <ChatPanel :controller="otopilot.controllerRef.value" mode="page" :show-close="false" @collapse="otopilot.collapseToSide()" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, onMounted } from 'vue'
import { CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import { otopilot } from '@bo/chat/otopilot'

const ChatPanel = defineAsyncComponent(() => import('@entegrasyonik/chat').then((m) => m.ChatPanel))
onMounted(() => void otopilot.controller().ensureLoaded())
</script>

<style scoped>
.bo-otopilot-page__panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 760px;
  min-height: 60vh;
  height: calc(100dvh - 240px);
  margin: 0 auto;
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
  overflow: hidden;
}
@media (max-width: 767px) {
  .bo-otopilot-page__panel {
    height: calc(100dvh - 200px);
    border: 0;
    border-radius: 0;
  }
}
</style>
