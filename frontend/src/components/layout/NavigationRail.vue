<!--
  frontend/src/components/layout/NavigationRail.vue

  DS-v2 Aşama 2 — sol menünün DARALTILMIŞ ("ray", 64px) sunumu: aynı
  `EkSidebarNav` modeli `collapsed` modda (yalnızca ikon; ad `aria-label` +
  sağa açılan tooltip). Masaüstünde kullanıcı tercihi (Ctrl+B / "Daralt"),
  tablette varsayılan (ADR-0015 Karar 2.2).
  Yaprak öğe doğrudan ekranı açar; alt menülü (grup) öğe tam menüyü açar
  (`expand-request`) ki alt öğe seçilebilsin.
  Spec çapaları: `.v-navigation-drawer.soft-rail`, genişlet düğmesi `.rail-logo-btn`.
-->
<template>
  <v-navigation-drawer id="tour-homepage-menu" :model-value="true" permanent :width="64" class="soft-rail ek-shell-rail" aria-label="Daraltılmış gezinme menüsü">
    <div class="ek-shell-rail__wrap">
      <v-tooltip :eager="false" transition="fade-transition" location="end" :open-delay="300">
        <template #activator="{ props: tip }">
          <button
            v-bind="tip"
            type="button"
            class="rail-logo-btn"
            :aria-label="withShortcut('Gezinme menüsünü genişlet', 'sidebarToggle')"
            @click="$emit('expand-request')"
          >
            <v-icon icon="mdi-chevron-double-right" aria-hidden="true" />
          </button>
        </template>
        <span class="ek-shell-rail__tip">Menüyü genişlet <EkKbd :keys="shortcutKeys('sidebarToggle')" tone="inverse" /></span>
      </v-tooltip>
      <div class="ek-shell-rail__scroll">
        <EkSidebarNav
          :sections="model.sections"
          :active-key="activeKey"
          label="Ekranlar"
          collapsed
          @select="onSelect"
          @expand-request="$emit('expand-request')"
        />
      </div>
    </div>
  </v-navigation-drawer>
</template>

<script lang="ts" setup>
import EkSidebarNav from '@/components/ds/EkSidebarNav.vue'
import EkKbd from '@/components/ds/EkKbd.vue'
import useUser from '@/composables/user'
import { shortcutKeys, withShortcut } from '@/navigation/shortcuts'
import { useShellMenu } from './useShellMenu'

defineEmits<{ 'expand-request': [] }>()

const userApi = useUser()
const { model, activeKey, linkFor, openKey } = useShellMenu()

function onSelect(key: string) {
  const link = linkFor(key)
  if (link?.code === 'ExitView' && !link.parent) {
    userApi.logout()
    return
  }
  openKey(key)
}
</script>

<style scoped>
.ek-shell-rail {
  background: var(--ek-color-sidebar-bg) !important;
  border-right: 1px solid var(--ek-color-sidebar-border) !important;
}

.ek-shell-rail__wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  padding-top: var(--ek-space-3);
}

.ek-shell-rail__scroll {
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.ek-shell-rail__tip {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
}

.rail-logo-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--ek-control-h-lg);
  height: var(--ek-control-h-md);
  border: 1px solid var(--ek-color-sidebar-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-icon-md);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.rail-logo-btn:hover {
  border-color: var(--ek-color-border-strong);
  color: var(--ek-color-content-strong);
}

.rail-logo-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--ek-color-border-focus);
}
</style>
