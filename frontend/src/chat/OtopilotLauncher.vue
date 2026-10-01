<!--
  frontend/src/chat/OtopilotLauncher.vue — üst bardaki giriş (ikon + ürün adı; dar ekranda yalnız ikon).
  `EkAppHeader` `#end-start` yuvasına oturur (ui paketine değişiklik yok). DISABLED iken hiç çizilmez (§3.3).
-->
<template>
  <v-tooltip v-if="otopilot.available" location="bottom" :open-delay="400" transition="fade-transition">
    <template #activator="{ props: tip }">
      <button
        v-bind="tip"
        type="button"
        class="ek-otopilot-launcher"
        :class="{ 'is-active': otopilot.panelOpen || otopilot.onPage, 'is-compact': compact }"
        data-header-action="otopilot"
        :aria-label="label"
        :aria-keyshortcuts="keys.join('+')"
        :aria-pressed="otopilot.panelOpen || otopilot.onPage ? 'true' : 'false'"
        @click="otopilot.toggle('button')"
      >
        <v-icon :icon="CHAT_ICON" aria-hidden="true" />
        <span v-if="!compact" class="ek-otopilot-launcher__text">{{ CHAT_PRODUCT.name }}</span>
      </button>
    </template>
    <span>{{ hint }} <EkKbd :keys="keys" tone="inverse" /></span>
  </v-tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { EkKbd } from '@entegrasyonik/ui/components'
import { CHAT_ICON, CHAT_PRODUCT } from '@entegrasyonik/chat/brand'
import { appShortcutKeys } from '@/navigation/shortcutCatalog'
import { useOtopilotStore } from './otopilotStore'

defineProps<{ compact?: boolean }>()
const otopilot = useOtopilotStore()
const keys = appShortcutKeys('otopilotToggle')
const hint = computed(() => otopilot.getController().t(otopilot.panelOpen ? 'entry.closeHint' : 'entry.openHint'))
const label = computed(() => `${hint.value} (${keys.join('+')})`)
</script>

<style scoped>
.ek-otopilot-launcher {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  height: var(--ek-control-h-md);
  padding: 0 var(--ek-space-3);
  border: 1px solid var(--ek-color-chrome-border);
  border-radius: var(--ek-radius-full);
  background: var(--ek-color-chrome-raised);
  color: var(--ek-color-chrome-text);
  font: inherit;
  font-size: var(--ek-type-label-size);
  font-weight: var(--ek-font-weight-medium);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.ek-otopilot-launcher.is-compact {
  width: var(--ek-control-h-md);
  padding: 0;
  justify-content: center;
}

.ek-otopilot-launcher:hover,
.ek-otopilot-launcher.is-active {
  border-color: var(--ek-color-chrome-text-muted);
}

.ek-otopilot-launcher:focus-visible {
  outline: 2px solid var(--ek-color-chrome-text);
  outline-offset: 2px;
}

/* MOB-00: dokunmatikte hedef en az 44×44 (--ek-control-h-touch). */
@media (pointer: coarse) {
  .ek-otopilot-launcher {
    min-width: var(--ek-control-h-touch);
    min-height: var(--ek-control-h-touch);
  }
}
</style>
