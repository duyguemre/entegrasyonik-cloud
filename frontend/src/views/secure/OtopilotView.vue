<!--
  frontend/src/views/secure/OtopilotView.vue — Otopilot tam sayfa sohbet görünümü (`screens.ts` key 'chat', slug
  CHAT_PRODUCT.slug). Yan paneldekiyle AYNI denetleyici → konuşma sürer. Okunur satır genişliği ≤ 760 px (ChatPanel
  `mode="page"`). Mobilde (< 768 px) tek yüzey budur: composer altta; ekran klavyesi açılınca `visualViewport`
  yüksekliğine göre küçülür, composer görünür kalır. DISABLED → ChatUnavailable (panel içinde).
  Sayfa başlığı: EkPageHeader KULLANILMAZ — ChatPanel kendi başlık bandını (h2 + Yeni sohbet / Yan panele al) çizer;
  ikinci bir başlık mobilde sohbet alanını daraltır (pageHeaderMissing mandalı için bilinçli, belgeli istisna).
-->
<template>
  <div ref="rootRef" class="ek-otopilot-page" :class="{ 'is-mobile': isMobile }">
    <ChatPanel
      :key="panelKey"
      :controller="controller"
      mode="page"
      appearance="refined"
      :show-close="false"
      :show-expand="!isMobile"
      @collapse="otopilot.collapseToSide()"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChatPanel } from '@entegrasyonik/chat'
import { useOtopilotStore } from '@/chat/otopilotStore'
import { useShellBreakpoints } from '@/composables/useShellBreakpoints'

defineProps<{ parameters?: Record<string, unknown> }>()
const otopilot = useOtopilotStore()
const { isMobile } = useShellBreakpoints()
const rootRef = ref<HTMLElement | null>(null)
const panelKey = ref(0)
const controller = computed(() => otopilot.getController())
watch(controller, () => panelKey.value++)

/** Ekran klavyesi: görünür alan yüksekliği → `--ek-otopilot-vvh` (satır içi stil bağlaması değil, özellik ataması). */
function syncViewport() {
  const el = rootRef.value
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (!el || !vv) return
  const top = el.getBoundingClientRect().top
  el.style.setProperty('--ek-otopilot-vvh', `${Math.max(0, Math.round(vv.height + vv.offsetTop - top))}px`)
}

onMounted(() => {
  void otopilot.getController().ensureLoaded()
  syncViewport()
  window.visualViewport?.addEventListener('resize', syncViewport)
  window.visualViewport?.addEventListener('scroll', syncViewport)
})
onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', syncViewport)
  window.visualViewport?.removeEventListener('scroll', syncViewport)
})

defineExpose({ initialize: () => undefined, activate: () => void otopilot.getController().ensureLoaded(), destroy: () => undefined })
</script>

<style scoped>
.ek-otopilot-page {
  height: 100%;
  min-height: 0;
  background: var(--ek-color-surface);
}

.ek-otopilot-page.is-mobile {
  height: var(--ek-otopilot-vvh, 100%);
  max-height: 100%;
}
</style>
