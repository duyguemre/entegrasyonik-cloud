<!--
  frontend/src/components/layout/ApplicationBar.vue

  DS-v2 Aşama 2 — kabuğun üst barı: Vuetify düzen katmanı (`v-app-bar`, sol
  menü/sekmelerin ofsetini verir, `visible=false` ile yukarı kayarak daralır)
  + görünüm `EkAppHeader` (marka degradesi, çalışma alanı anahtarı, birleşik
  akıllı arama, bildirim, yardım, hesap).
  Menüler `EkMenuPanel` ile (ikonlu, gruplu, kısayollu; tehlikeli öğe en sonda).
  Çalışma alanı anahtarı: Genel ↔ seçili kayıt (en son açılan çok örnekli
  sekme, ör. ürün düzenleme) — `workspace.recordTab`.
-->
<template>
  <v-app-bar tag="div" :model-value="visible" height="56" flat class="ek-shell-bar" color="transparent">
    <LoadingComponent ref="loadingComponentRef" attach=".AppView" />
    <EkAppHeader
      id="tour-homepage-topmenu"
      class="ek-shell-bar__header"
      :workspace="workspaceMode"
      :record-label="recordLabel"
      :user-name="identityName"
      :store-name="identityMeta"
      :notification-count="notificationDrawer.unreadCount"
      :compact="isMobile"
      :menu-shortcut="shortcutKeys('sidebarToggle')"
      :menu-expanded="menuExpanded"
      @toggle-menu="$emit('toggle-menu')"
      @update:workspace="onWorkspace"
      @notifications="notificationDrawer.toggleDrawer()"
    >
      <template #search>
        <ShellSearch id="tour-homepage-smartsearch" ref="searchRef" @dismiss="$emit('search-dismiss')" @focusout="$emit('search-blur')" />
      </template>
    </EkAppHeader>

    <v-menu v-model="helpOpen" activator="[data-header-action=help]" location="bottom end" :offset="8">
      <EkMenuPanel autofocus ref="helpPanelRef" :groups="helpGroups" label="Yardım" @select="onHelpSelect" @close="helpOpen = false" />
    </v-menu>

    <v-menu v-model="accountOpen" activator="[data-header-action=account]" location="bottom end" :offset="8">
      <div class="ek-shell-account">
        <div class="ek-shell-account__head">
          <StoreLogoAvatar :size="36" :store-name="storeName" :logo="userApi.getStoreLogo()" />
          <div class="ek-shell-account__who">
            <span class="ek-shell-account__name">{{ identityName }}</span>
            <span class="ek-shell-account__meta">{{ userApi.getUsername.value }}</span>
          </div>
        </div>
        <EkMenuPanel autofocus ref="accountPanelRef" class="ek-shell-account__menu" :groups="accountGroups" label="Hesap" @select="onAccountSelect" @close="accountOpen = false" />
      </div>
    </v-menu>
  </v-app-bar>
</template>

<script lang="ts" setup>
import { computed, inject, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { setI18nLanguage } from '@/plugins/i18n'
import { useNotificationDrawerStore } from '@/stores/notificationDrawer'
import useUser from '@/composables/user'
import LoadingComponent from '../LoadingComponent.vue'
import StoreLogoAvatar from './StoreLogoAvatar.vue'
import ShellSearch from './ShellSearch.vue'
import EkAppHeader from '@/components/ds/EkAppHeader.vue'
import EkMenuPanel, { type EkMenuGroup, type EkMenuItem } from '@/components/ds/EkMenuPanel.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useShellBreakpoints } from '@/composables/useShellBreakpoints'
import { shortcutKeys } from '@/navigation/shortcuts'

withDefaults(defineProps<{ visible?: boolean; menuExpanded?: boolean }>(), { visible: true, menuExpanded: undefined })
const emit = defineEmits<{ 'toggle-menu': []; 'open-shortcuts': []; 'search-dismiss': []; 'search-blur': [] }>()

const eventBus: any = inject('eventBus')
const menuStore: any = inject('useMenuStore')
const loadingComponentRef: any = ref(null)
const searchRef = ref<InstanceType<typeof ShellSearch> | null>(null)
const helpPanelRef = ref<InstanceType<typeof EkMenuPanel> | null>(null)
const accountPanelRef = ref<InstanceType<typeof EkMenuPanel> | null>(null)
const helpOpen = ref(false)
const accountOpen = ref(false)

const router = useRouter()
const userApi = useUser()
const workspace = useWorkspaceStore()
const notificationDrawer = useNotificationDrawerStore()
const { locale } = useI18n({ useScope: 'global' })
const { isMobile } = useShellBreakpoints()

const storeName = computed(() => userApi.getStoreName() || '')
// Kimlik: birincil satır mağaza (tenant) adı, ikincil satır oturumdaki kullanıcı.
const identityName = computed(() => storeName.value || userApi.getUsername.value || 'Mağaza paneli')
const identityMeta = computed(() => (storeName.value ? userApi.getUsername.value ?? '' : 'Mağaza paneli'))

const workspaceMode = computed<'general' | 'record'>(() =>
  workspace.recordTab && workspace.mySelectedTab === workspace.recordTab ? 'record' : 'general',
)
const recordLabel = computed(() => {
  const link = workspace.recordTab?.link
  return link ? String(link.title ?? '') || undefined : undefined
})

function onWorkspace(mode: 'general' | 'record') {
  if (mode === 'record' && workspace.recordTab) workspace.activateTab(workspace.recordTab)
  else if (mode === 'general') workspace.activateGeneral()
}

const helpGroups: EkMenuGroup[] = [
  {
    label: 'Yardım',
    items: [
      { key: 'shortcuts', label: 'Klavye kısayolları', icon: 'mdi-keyboard-outline', shortcut: shortcutKeys('shortcutHelp') },
      { key: 'tickets', label: 'Destek kayıtları', description: 'Talep oluşturun, yanıtları izleyin', icon: 'mdi-lifebuoy' },
    ],
  },
]

const accountGroups: EkMenuGroup[] = [
  {
    items: [
      { key: 'settings', label: 'Ayarlar', icon: 'mdi-cog-outline' },
      { key: 'shortcuts', label: 'Klavye kısayolları', icon: 'mdi-keyboard-outline', shortcut: shortcutKeys('shortcutHelp') },
    ],
  },
  { items: [{ key: 'logout', label: 'Çıkış', icon: 'mdi-logout', danger: true }] },
]


const openByTitle = (title: string) => eventBus.emit('openTab', menuStore.getMenuLinkWithTitle(title))

function onHelpSelect(item: EkMenuItem) {
  helpOpen.value = false
  if (item.key === 'shortcuts') emit('open-shortcuts')
  else if (item.key === 'tickets') openByTitle('ticketList')
}

function onAccountSelect(item: EkMenuItem) {
  accountOpen.value = false
  if (item.key === 'settings') openByTitle('settingList')
  else if (item.key === 'shortcuts') emit('open-shortcuts')
  else if (item.key === 'logout') logout()
}

const logout = async () => {
  const guid = loadingComponentRef.value?.info('')
  await userApi.logout()
  // ADR-0012 Karar 3: açık çıkışta çalışma alanı persist anahtarı silinir (oturum süresi
  // dolması bunu SİLMEZ — yalnızca kullanıcının kendi isteğiyle çıkışı).
  workspace.clearPersist()
  router.push('/login')
  loadingComponentRef.value?.remove(guid)
}

watch(locale, (val) => setI18nLanguage(val))

defineExpose({ focusSearch: () => searchRef.value?.focus() })
</script>

<style scoped>
.ek-shell-bar {
  overflow: visible !important;
  background: transparent !important;
}

.ek-shell-bar :deep(.v-toolbar__content) {
  padding: 0 !important;
  overflow: visible;
}

.ek-shell-bar__header {
  flex: 1;
  min-width: 0;
}

.ek-shell-account {
  min-width: 260px;
  overflow: hidden;
  background: var(--ek-color-surface-raised);
  border: 1px solid var(--ek-color-border-subtle);
  border-radius: var(--ek-radius-popover);
  box-shadow: var(--ek-shadow-popover);
}

.ek-shell-account__head {
  display: flex;
  align-items: center;
  gap: var(--ek-space-3);
  padding: var(--ek-space-3) var(--ek-space-4);
  background: var(--ek-color-surface-muted);
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ek-shell-account__who {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ek-shell-account__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-strong);
  font-size: var(--ek-type-subheading-size);
  line-height: var(--ek-type-subheading-line);
  font-weight: var(--ek-type-subheading-weight);
}

.ek-shell-account__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.ek-shell-account__menu {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
</style>
