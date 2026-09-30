<!--
  frontend/src/components/layout/ShellChromeHandle.vue

  DS-v2 Aşama 5 — üst barın ALT KENARINA yapışık yüzen tutamak (kullanıcı geri bildirimi madde 9).
  "Üst bölümü daralt" ve "tam ekran (odak modu)" düğmeleri sekme şeridinden kalktı (şeridi daraltıyordu);
  ikisi burada ve kısayollarda (kayıt: `navigation/shortcuts.ts` → Ctrl+Shift+H / Ctrl+Shift+F).

  Görünüm: dinlenirken üst barın altından sarkan 12px'lik lacivert bir dil (tutamak; kimlik rengi). Fareyle
  üzerine gelince / klavye odağında (focus-within) / dokunmatikte kayarak iki düğmeli tam boyuna iner.
  Üst bar daraltılınca tutamak görünüm alanının tepesine yapışır — üst barı geri getirmenin görünür yolu.
  Yer: sekme şeridinin SAĞ üst köşesi; şeritteki "açık sekmeler" düğmesi alta yaslıdır → tutamakla çakışmaz,
  sekmelerden alan almaz. Hareket yalnız `transform` (DS süre token'ı; reduced-motion'da anında).
-->
<template>
  <div class="ek-chrome-handle" :class="{ 'is-open': forceOpen }">
    <div class="ek-chrome-handle__pill" role="group" aria-label="Görünüm">
      <v-tooltip :eager="false" transition="fade-transition" location="bottom" :open-delay="300">
        <template #activator="{ props: tip }">
          <button
            v-bind="tip"
            type="button"
            class="ek-chrome-handle__btn"
            data-shell-action="header-toggle"
            :aria-pressed="collapsed"
            :aria-label="withShortcut(collapseLabel, 'headerToggle')"
            @click="emit('toggle-header')"
          >
            <v-icon :icon="collapsed ? 'mdi-chevron-down' : 'mdi-chevron-up'" aria-hidden="true" />
          </button>
        </template>
        <span class="ek-chrome-handle__tip">{{ collapseLabel }} <EkKbd :keys="shortcutKeys('headerToggle')" tone="inverse" /></span>
      </v-tooltip>
      <v-tooltip :eager="false" transition="fade-transition" location="bottom" :open-delay="300">
        <template #activator="{ props: tip }">
          <button
            v-bind="tip"
            type="button"
            class="ek-chrome-handle__btn"
            data-shell-action="focus-mode"
            :aria-pressed="focusMode"
            :aria-label="withShortcut(focusLabel, 'focusMode')"
            @click="emit('toggle-focus')"
          >
            <v-icon :icon="focusMode ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'" aria-hidden="true" />
          </button>
        </template>
        <span class="ek-chrome-handle__tip">{{ focusLabel }} <EkKbd :keys="shortcutKeys('focusMode')" tone="inverse" /></span>
      </v-tooltip>
      <span class="ek-chrome-handle__grip" aria-hidden="true"></span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { EkKbd } from '@entegrasyonik/ui/components'
import { shortcutKeys, withShortcut } from '@entegrasyonik/ui/shortcuts'

const props = withDefaults(defineProps<{ collapsed?: boolean; focusMode?: boolean; forceOpen?: boolean }>(), {
  collapsed: false,
  focusMode: false,
  forceOpen: false,
})
const emit = defineEmits<{ 'toggle-header': []; 'toggle-focus': [] }>()

// Odak modunda üst bar zaten gizli: tutamağın ilk düğmesi "göster" der (SecureLayout odak modundan çıkarır).
const collapseLabel = computed(() => (props.collapsed || props.focusMode ? 'Üst bölümü göster' : 'Üst bölümü daralt'))
const focusLabel = computed(() => (props.focusMode ? 'Odak modundan çık' : 'Tam ekran (odak modu)'))
</script>

<style scoped>
.ek-chrome-handle {
  /* Konum kabuktan (SecureLayout) gelir; burada yalnız görünüm. Görünür dil = 12px, açık = 28px. */
  --ek-handle-rest: 12px;
  --ek-handle-open: 28px;
  display: flex;
  justify-content: flex-end;
  height: var(--ek-handle-open);
  overflow: hidden;
  pointer-events: none;
}

.ek-chrome-handle__pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: var(--ek-handle-open);
  padding: 0 1px;
  border-radius: 0 0 var(--ek-radius-control) var(--ek-radius-control);
  background: var(--ek-gradient-chrome);
  box-shadow: var(--ek-shadow-chrome);
  color: var(--ek-color-chrome-text);
  pointer-events: auto;
  /* Dinlenirken yalnız alttaki 12px görünür (üstü kabın dışında kalır → kırpılır). */
  transform: translateY(calc(var(--ek-handle-rest) - var(--ek-handle-open)));
  transition: transform var(--ek-duration-base) var(--ek-easing-standard);
}

.ek-chrome-handle:hover .ek-chrome-handle__pill,
.ek-chrome-handle:focus-within .ek-chrome-handle__pill,
.ek-chrome-handle.is-open .ek-chrome-handle__pill {
  transform: none;
}

.ek-chrome-handle__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: var(--ek-radius-sm);
  background: transparent;
  color: inherit;
  font-size: var(--ek-icon-sm);
  cursor: pointer;
  opacity: 0;
  transition: var(--ek-transition-colors);
}

.ek-chrome-handle:hover .ek-chrome-handle__btn,
.ek-chrome-handle:focus-within .ek-chrome-handle__btn,
.ek-chrome-handle.is-open .ek-chrome-handle__btn {
  opacity: 1;
}

.ek-chrome-handle__btn:hover {
  background: var(--ek-color-chrome-raised);
}

.ek-chrome-handle__btn:focus-visible {
  outline: 2px solid var(--ek-color-chrome-text);
  outline-offset: -2px;
}

/* Dinlenirken görünen tek işaret: ortada ince tutma çizgisi (açılınca söner). */
.ek-chrome-handle__grip {
  position: absolute;
  left: 50%;
  bottom: 4px;
  width: 16px;
  height: 2px;
  border-radius: var(--ek-radius-chip);
  background: var(--ek-color-chrome-text-muted);
  transform: translateX(-50%);
  transition: opacity var(--ek-duration-fast) var(--ek-easing-standard);
  pointer-events: none;
}

.ek-chrome-handle:hover .ek-chrome-handle__grip,
.ek-chrome-handle:focus-within .ek-chrome-handle__grip,
.ek-chrome-handle.is-open .ek-chrome-handle__grip {
  opacity: 0;
}

.ek-chrome-handle__tip {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

/* Dokunmatik: üzerine gelme yok → tutamak hep açık. */
@media (hover: none) {
  .ek-chrome-handle__pill {
    transform: none;
  }

  .ek-chrome-handle__btn {
    opacity: 1;
  }

  .ek-chrome-handle__grip {
    opacity: 0;
  }
}
</style>
