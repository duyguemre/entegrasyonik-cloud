<template>
  <div class="bo-shell">
    <a class="bo-skip" href="#bo-main">İçeriğe geç</a>
    <TopBar class="bo-shell__top" :menu-open="drawerOpen" :compact="mobile" @toggle-menu="drawerOpen = !drawerOpen" @logout="logout" />
    <v-navigation-drawer
      v-model="drawerOpen"
      :permanent="!mobile"
      :temporary="mobile"
      :width="248"
      class="bo-shell__nav"
      aria-label="Yönetim menüsü"
    >
      <EkSidebarNav :sections="sections" :active-key="activeKey" label="Yönetim ekranları" @select="onSelect" />
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
import { EkSidebarNav, type EkSideSection } from '@entegrasyonik/ui/components'
import TopBar from '@bo/components/TopBar.vue'
import { session } from '@bo/auth/session'
import { SCREENS, SECTION_ORDER, screenByPath } from '@bo/navigation/screens'
import { notify } from '@bo/utils/toast'

const route = useRoute()
const router = useRouter()
// Uygulamayla aynı eşik: < 960px çekmece (geçici), üstü kalıcı menü.
const { smAndDown } = useDisplay()
const mobile = computed(() => smAndDown.value)
const drawerOpen = ref(!mobile.value)
watch(mobile, (m) => (drawerOpen.value = !m))

const sections = computed<EkSideSection[]>(() =>
  SECTION_ORDER.map((label) => ({
    label,
    items: SCREENS.filter((s) => s.section === label).map((s) => ({
      key: s.key,
      label: s.label,
      icon: s.icon,
      ...(s.status === 'draft' ? { badge: 'Taslak', badgeTone: 'info' as const } : {}),
    })),
  })),
)

const activeKey = computed(() => {
  if (route.name === 'planned') return String(route.params.key)
  return screenByPath(route.path)?.key
})

function onSelect(key: string) {
  const screen = SCREENS.find((s) => s.key === key)
  if (screen) router.push(screen.path)
  if (mobile.value) drawerOpen.value = false
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
