<template>
  <div class="bo-shell">
    <a class="bo-skip" href="#bo-main">İçeriğe geç</a>
    <TopBar class="bo-shell__top" :menu-open="drawerOpen" :compact="mobile" @toggle-menu="drawerOpen = !drawerOpen" @logout="logout" @open-palette="paletteOpen = true" />
    <CommandPalette v-model="paletteOpen" @logout="logout" />
    <v-navigation-drawer
      v-model="drawerOpen"
      :permanent="!mobile"
      :temporary="mobile"
      :width="264"
      class="bo-shell__nav"
      aria-label="Yönetim menüsü"
    >
      <EkSidebarNav :sections="sections" :active-key="activeKey" label="Yönetim ekranları" @select="onSelect" />
      <template #append>
        <button type="button" class="bo-shell__hint" @click="paletteOpen = true">
          <v-icon icon="mdi-lightning-bolt-outline" aria-hidden="true" />
          <span>Hızlı geçiş</span>
          <EkKbd :keys="['Ctrl', 'K']" />
        </button>
      </template>
    </v-navigation-drawer>
    <v-main class="bo-shell__main">
      <main id="bo-main" tabindex="-1">
        <RouterView :key="route.path" />
      </main>
    </v-main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { EkKbd, EkSidebarNav, type EkSideItem, type EkSideSection } from '@entegrasyonik/ui/components'
import TopBar from '@bo/components/TopBar.vue'
import CommandPalette from '@bo/components/shell/CommandPalette.vue'
import { session } from '@bo/auth/session'
import { GROUPS, SCREENS, SECTIONS, STATUS_BADGE, screenByKey, screensOf, type BoScreen } from '@bo/navigation/screens'
import { notify } from '@bo/utils/toast'

const route = useRoute()
const router = useRouter()
// Uygulamayla aynı eşik: < 960px çekmece (geçici), üstü kalıcı menü.
const { smAndDown } = useDisplay()
const mobile = computed(() => smAndDown.value)
const drawerOpen = ref(!mobile.value)
const paletteOpen = ref(false)
watch(mobile, (m) => (drawerOpen.value = !m))

const leaf = (s: BoScreen, label = s.label): EkSideItem => {
  const badge = STATUS_BADGE[s.status]
  return { key: s.key, label, icon: s.icon, muted: s.status === 'planned', ...(badge ? { badge: badge.text, badgeTone: badge.tone, badgeVariant: 'label' as const } : {}) }
}

// Menü YALNIZ ekran kaydından: bölüm → grup (tek ekranlı grup yaprak, çok ekranlı grup açılır) → ekran.
const sections = computed<EkSideSection[]>(() =>
  SECTIONS.map((section) => ({
    label: section.label,
    items: GROUPS.filter((g) => g.section === section.key).map((g) => {
      const screens = screensOf(g.key)
      if (screens.length === 1) return leaf(screens[0], g.label)
      const ready = screens.filter((s) => s.status !== 'planned').length
      return { key: `group:${g.key}`, label: g.label, icon: g.icon, muted: !ready, children: screens.map((s) => leaf(s)) }
    }),
  })),
)

const activeKey = computed(() => screenByKey(String(route.meta.screen ?? ''))?.key)

function onSelect(key: string) {
  const screen = SCREENS.find((s) => s.key === key)
  if (screen) router.push(screen.path)
  if (screen && mobile.value) drawerOpen.value = false
}

async function logout() {
  await session.logout().catch(() => undefined)
  notify('info', 'Çıkış yapıldı.')
}
</script>

<style scoped>
.bo-shell__top {
  position: fixed;
  inset: 0 0 auto;
  z-index: 1010;
}

.bo-shell__nav {
  top: var(--ek-app-topbar-height) !important;
  height: calc(100% - var(--ek-app-topbar-height)) !important;
  background: var(--ek-color-sidebar-bg) !important;
  border-right: 1px solid var(--ek-color-sidebar-border) !important;
}

.bo-shell__nav :deep(.ek-side) {
  padding-top: var(--ek-space-4);
}

.bo-shell__hint {
  display: flex;
  align-items: center;
  gap: var(--ek-space-2);
  width: calc(100% - 2 * var(--ek-space-3));
  margin: var(--ek-space-3);
  padding: var(--ek-space-2) var(--ek-space-3);
  border: 1px dashed var(--ek-color-sidebar-border);
  border-radius: var(--ek-radius-control);
  background: transparent;
  color: var(--ek-color-content-muted);
  font: inherit;
  font-size: var(--ek-type-caption-size);
  cursor: pointer;
  transition: var(--ek-transition-colors);
}

.bo-shell__hint:hover {
  color: var(--ek-color-content-strong);
  background: var(--ek-color-sidebar-hover);
}

.bo-shell__hint:focus-visible {
  outline: none;
  box-shadow: var(--ek-focus-ring);
}

.bo-shell__hint .ek-kbd {
  margin-left: auto;
}

.bo-shell__main {
  min-height: 100vh;
  padding-top: var(--ek-app-topbar-height) !important;
  background: var(--ek-color-app-bg);
}

#bo-main:focus {
  outline: none;
}

.bo-skip {
  position: absolute;
  top: -100px;
  left: var(--ek-space-3);
  z-index: 2000;
  padding: var(--ek-space-2) var(--ek-space-3);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-surface);
  color: var(--ek-color-content-strong);
}

.bo-skip:focus {
  top: var(--ek-space-2);
}
</style>
