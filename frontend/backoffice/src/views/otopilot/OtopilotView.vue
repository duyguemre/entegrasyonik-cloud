<!-- Otopilot tam sayfa (backoffice). Yan panelle AYNI denetleyici: geçişte konuşma sürer. Okunur genişlik ≤ 760 px. -->
<template>
  <div class="bo-page bo-otopilot-page">
    <BoPageHeader>
      <template #meta>
        <span><v-icon icon="mdi-eye-outline" size="small" aria-hidden="true" /> Yönetim uygulamasında {{ CHAT_PRODUCT.name }} yalnız okur; işlem önermez. Sohbetler kaydedilmez.</span>
        <span v-if="verdict" class="bo-otopilot-page__status" :class="`is-${verdict.tone}`" data-testid="otopilot-status">
          <span class="bo-otopilot-page__dot" aria-hidden="true"></span>
          <span class="ek-sr-only">Durum: </span>{{ verdict.tone === 'success' ? 'Anahtar yapılandırılmış' : verdict.summary }}
          <RouterLink v-if="link" :to="link" class="bo-otopilot-page__link">Otopilot ayarı</RouterLink>
        </span>
      </template>
    </BoPageHeader>
    <div class="bo-otopilot-page__panel">
      <ChatPanel :controller="otopilot.controllerRef.value" mode="page" :show-close="false" @collapse="otopilot.collapseToSide()" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
import BoPageHeader from '@bo/components/shell/BoPageHeader.vue'
import { otopilot } from '@bo/chat/otopilot'
import { otopilotVerdict } from './otopilotVerdict'

const ChatPanel = defineAsyncComponent(() => import('@entegrasyonik/chat').then((m) => m.ChatPanel))
const verdict = computed(() => {
  const m = otopilot.controllerRef.value.machine.value
  return otopilotVerdict({ status: m.status, unavailableReason: m.unavailableReason, errorCode: m.error?.code, retry: () => void otopilot.controller().ensureLoaded(true) })
})
/** Yalnız anahtar sorunlarında ayara bağlantı (hükmün ilk maddesinin hedefi). */
const link = computed(() => verdict.value?.attention.find((a) => a.to)?.to ?? null)
onMounted(() => void otopilot.controller().ensureLoaded())
</script>

<style scoped>
.bo-otopilot-page__status {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-2);
}
.bo-otopilot-page__dot {
  width: 8px;
  height: 8px;
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-info);
}
.is-success .bo-otopilot-page__dot { background: var(--ek-color-success); }
.is-warning .bo-otopilot-page__dot { background: var(--ek-color-warning); }
.is-error .bo-otopilot-page__dot { background: var(--ek-color-error); }
.bo-otopilot-page__link {
  color: var(--ek-color-content-strong);
  text-decoration: underline;
}
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
