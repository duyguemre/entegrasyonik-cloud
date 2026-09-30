<!--
  frontend/src/chat/OtopilotDock.vue — Otopilot yan paneli; kabuktaki TEK bağlama noktası (SecureLayout, v-layout içinde).
  Yerleşim kararı: packages/chat/docs/PLACEMENT.md.
    ≥ 1280 px  push    — kalıcı sağ çekmece; Vuetify düzen katmanına katılır → `--v-layout-right` sekme şeridini ve
                         çalışma alanını daraltır (kabuk kodu değişmeden).
    768–1279   overlay — üstüne binen çekmece, scrim YOK (içerik tıklanabilir kalır), Esc kapatır.
    < 768      —       — panel yok; giriş noktaları tam sayfa sekmesini açar.
  Genişlik 360–560 px: sol kenardaki ayırıcı sürüklenir ya da klavyeyle (←/→ 16 px, Home/End) ayarlanır; tercih
  kullanıcı+tenant anahtarıyla yerelde. Tam sayfa sekmesi etkinken panel gizlenir (aynı konuşma iki yerde çizilmez).
-->
<template>
  <v-navigation-drawer
    v-if="visible"
    :model-value="true"
    location="right"
    :width="otopilot.width"
    :permanent="!overlay"
    :temporary="overlay"
    :scrim="false"
    :touchless="true"
    class="ek-otopilot-dock"
    :class="{ 'is-overlay': overlay, 'is-resizing': resizing }"
    tag="aside"
    :aria-label="otopilot.getController().t('panel.region')"
    @keydown.esc.stop="onEsc"
  >
    <div
      class="ek-otopilot-dock__resize"
      role="separator"
      aria-orientation="vertical"
      tabindex="0"
      :aria-label="otopilot.getController().t('panel.resize')"
      :aria-valuemin="OTOPILOT_WIDTH.min"
      :aria-valuemax="OTOPILOT_WIDTH.max"
      :aria-valuenow="otopilot.width"
      @pointerdown="startResize"
      @keydown="onResizeKey"
    />
    <ChatPanel
      ref="panelRef"
      :key="panelKey"
      :controller="controller"
      mode="side"
      @close="otopilot.close()"
      @expand="otopilot.openPage()"
    />
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue'
import { useDisplay } from 'vuetify'
import { isEditableTarget } from '@entegrasyonik/ui/shortcuts'

/** Sohbet arayüzü (markdown-it, parçalar) kabuk paketine girmesin: panel ilk açılışta yüklenir. */
const ChatPanel = defineAsyncComponent(() => import('@entegrasyonik/chat').then((m) => m.ChatPanel))
import { useOtopilotStore } from './otopilotStore'
import { OTOPILOT_PUSH_MIN, OTOPILOT_WIDTH } from './placement'

const otopilot = useOtopilotStore()
const { width: viewport } = useDisplay()
const panelRef = ref<{ focusComposer: () => void } | null>(null)
const resizing = ref(false)

const mobile = computed(() => viewport.value < 768)
const overlay = computed(() => viewport.value < OTOPILOT_PUSH_MIN)
const visible = computed(() => otopilot.panelOpen && otopilot.available && !mobile.value && !otopilot.onPage)
/** Denetleyici yenilenince (tenant/oturum değişimi) panel sıfırdan kurulur. */
const panelKey = ref(0)
const controller = computed(() => otopilot.getController())
watch(controller, () => panelKey.value++)

function onEsc(event: KeyboardEvent) {
  // Composer kendi Esc'ini (durdur / boşken kapat) yönetir. Form alanında (seçim listesi, onay ifadesi) Esc o alanındır;
  // açık diyalog/menü varsa da panel kapanmaz.
  if (event.defaultPrevented || isEditableTarget(event.target)) return
  const el = event.target as HTMLElement | null
  if (el?.closest?.('[role="combobox"], .v-field, .v-overlay')) return
  if (document.querySelector('.v-overlay--active.v-dialog, .v-overlay--active.v-menu')) return
  otopilot.close()
}

let startX = 0
let startWidth = 0
function onMove(event: PointerEvent) {
  // Panel sağda: sol kenar sola çekildikçe genişler.
  otopilot.setWidth(startWidth + (startX - event.clientX))
}
function stopResize() {
  resizing.value = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', stopResize)
}
function startResize(event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  startX = event.clientX
  startWidth = otopilot.width
  resizing.value = true
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', stopResize)
}
function onResizeKey(event: KeyboardEvent) {
  const step = OTOPILOT_WIDTH.step
  const map: Record<string, number> = { ArrowLeft: otopilot.width + step, ArrowRight: otopilot.width - step, Home: OTOPILOT_WIDTH.max, End: OTOPILOT_WIDTH.min }
  if (!(event.key in map)) return
  event.preventDefault()
  otopilot.setWidth(map[event.key])
}

watch(visible, (now) => {
  if (now) requestAnimationFrame(() => panelRef.value?.focusComposer())
})

/** Sabit konumlu kabuk öğeleri (yardım turu teklif kartı) paneli örtmesin: panel genişliği kök değişkene yazılır. */
watch(
  [visible, () => otopilot.width],
  ([shown, w]) => document.documentElement.style.setProperty('--ek-otopilot-offset', shown ? `${w}px` : '0px'),
  { immediate: true },
)

onBeforeUnmount(() => {
  stopResize()
  document.documentElement.style.setProperty('--ek-otopilot-offset', '0px')
})
</script>

<style scoped>
.ek-otopilot-dock {
  border-left: 1px solid var(--ek-color-border-default);
  background: var(--ek-color-surface);
  overflow: visible;
}

.ek-otopilot-dock.is-overlay {
  box-shadow: var(--ek-shadow-lg);
}

.ek-otopilot-dock :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ek-otopilot-dock__resize {
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--ek-space-1) * -1);
  z-index: 1;
  width: var(--ek-space-2);
  cursor: col-resize;
  touch-action: none;
}

.ek-otopilot-dock__resize::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--ek-space-1) - 1px);
  width: 2px;
  background: transparent;
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard);
}

.ek-otopilot-dock__resize:hover::after,
.ek-otopilot-dock.is-resizing .ek-otopilot-dock__resize::after {
  background: var(--ek-color-action);
}

.ek-otopilot-dock__resize:focus-visible {
  outline: none;
}

.ek-otopilot-dock__resize:focus-visible::after {
  background: var(--ek-color-border-focus);
}

/* Sürüklerken çekmece genişlik geçişi kapalı (imleci gecikmesiz izler). */
.ek-otopilot-dock.is-resizing {
  transition: none;
  user-select: none;
}
</style>
