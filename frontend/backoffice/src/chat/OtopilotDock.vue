<!--
  Backoffice Otopilot yan paneli — kabukta TEK bağlama noktası (ShellLayout). Web yerleşimiyle aynı kurallar
  (packages/chat/docs/PLACEMENT.md): ≥ 1280 px itme (kalıcı sağ çekmece, v-main daralır), 768–1279 px üstüne binme
  (scrim yok, Esc kapatır), < 768 px panel yok (tam sayfa). Genişlik 360–560 px; sürükle ya da ←/→/Home/End.
  Tam sayfa (/otopilot) açıkken panel gizlenir: aynı konuşma iki yerde çizilmez.
-->
<template>
  <v-navigation-drawer
    v-if="visible"
    :model-value="true"
    location="right"
    :width="otopilot.width.value"
    :permanent="!overlay"
    :temporary="overlay"
    :scrim="false"
    touchless
    class="bo-otopilot-dock"
    :class="{ 'is-overlay': overlay, 'is-resizing': resizing }"
    tag="aside"
    :aria-label="`${CHAT_PRODUCT.name} paneli`"
    data-testid="otopilot-dock"
    @keydown.esc.stop="onEsc"
  >
    <div
      class="bo-otopilot-dock__resize"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      aria-label="Panel genişliği"
      :aria-valuemin="BO_CHAT_WIDTH.min"
      :aria-valuemax="BO_CHAT_WIDTH.max"
      :aria-valuenow="otopilot.width.value"
      @pointerdown="startResize"
      @keydown="onResizeKey"
    />
    <ChatPanel ref="panelRef" :key="panelKey" :controller="otopilot.controllerRef.value" mode="side" @close="otopilot.close()" @expand="otopilot.openPage()" />
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
import { otopilot } from './otopilot'
import { BO_CHAT_PUSH_MIN, BO_CHAT_WIDTH } from './prefs'

/** Sohbet arayüzü (markdown-it, parçalar) kabuk paketine girmesin: panel ilk açılışta yüklenir. */
const ChatPanel = defineAsyncComponent(() => import('@entegrasyonik/chat').then((m) => m.ChatPanel))

const { width: viewport } = useDisplay()
const panelRef = ref<{ focusComposer: () => void } | null>(null)
const resizing = ref(false)
const overlay = computed(() => viewport.value < BO_CHAT_PUSH_MIN)
const visible = computed(() => otopilot.panelOpen.value && otopilot.available.value && viewport.value >= 768 && !otopilot.onPage.value)
const panelKey = ref(0)
watch(otopilot.controllerRef, () => panelKey.value++)

function onEsc(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  const el = event.target as HTMLElement | null
  if (el?.closest?.('textarea, input, [role="combobox"], .v-field, .v-overlay')) return
  if (document.querySelector('.v-overlay--active.v-dialog, .v-overlay--active.v-menu')) return
  otopilot.close()
}

let startX = 0
let startWidth = 0
function onMove(e: PointerEvent) {
  otopilot.setWidth(startWidth + (startX - e.clientX))
}
function stopResize() {
  resizing.value = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', stopResize)
}
function startResize(e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  startX = e.clientX
  startWidth = otopilot.width.value
  resizing.value = true
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', stopResize)
}
function onResizeKey(e: KeyboardEvent) {
  const w = otopilot.width.value
  const step = BO_CHAT_WIDTH.step
  const map: Record<string, number> = { ArrowLeft: w + step, ArrowRight: w - step, Home: BO_CHAT_WIDTH.max, End: BO_CHAT_WIDTH.min }
  if (!(e.key in map)) return
  e.preventDefault()
  otopilot.setWidth(map[e.key])
}

watch(visible, (now) => {
  if (now) requestAnimationFrame(() => panelRef.value?.focusComposer())
})
onBeforeUnmount(stopResize)
</script>

<style scoped>
.bo-otopilot-dock {
  top: var(--ek-app-topbar-height) !important;
  height: calc(100% - var(--ek-app-topbar-height)) !important;
  border-left: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
  overflow: visible;
}
.bo-otopilot-dock.is-overlay {
  box-shadow: var(--ek-shadow-lg);
}
.bo-otopilot-dock :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.bo-otopilot-dock__resize {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--ek-space-1) * -1);
  z-index: 1;
  width: var(--ek-space-2);
  cursor: col-resize;
  touch-action: none;
}
.bo-otopilot-dock__resize::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--ek-space-1) - 1px);
  width: 2px;
  background: transparent;
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard);
}
.bo-otopilot-dock__resize:hover::after,
.bo-otopilot-dock.is-resizing .bo-otopilot-dock__resize::after {
  background: var(--ek-color-action);
}
.bo-otopilot-dock__resize:focus-visible {
  outline: none;
}
.bo-otopilot-dock__resize:focus-visible::after {
  background: var(--ek-color-border-focus);
}
.bo-otopilot-dock.is-resizing {
  transition: none;
  user-select: none;
}
</style>
