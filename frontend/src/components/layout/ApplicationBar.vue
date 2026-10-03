<!--
  frontend/src/components/layout/ApplicationBar.vue

  DS-v2 Aşama 2 — kabuğun üst barı: Vuetify düzen katmanı (`v-app-bar`, sol
  menü/sekmelerin ofsetini verir, `visible=false` ile yukarı kayarak daralır)
  + görünüm `EkAppHeader` (marka degradesi, birleşik akıllı arama, bildirim,
  yardım, hesap).
  Menüler `EkMenuPanel` ile (ikonlu, gruplu, kısayollu; tehlikeli öğe en sonda).
  Aşama 5: "Genel | Seçili kayıt" anahtarı kaldırıldı — kayıt sekmeleri şeritte.
  FE-R4 A1/A2: üst bar bir ton açık (`tone="soft"`, `chrome-soft*` token'ları); profil koyu blok taşımaz.
-->
<template>
  <v-app-bar tag="div" :model-value="visible" height="56" flat class="ek-shell-bar" color="transparent">
    <LoadingComponent ref="loadingComponentRef" attach=".AppView" />
    <EkAppHeader
      id="tour-homepage-topmenu"
      class="ek-shell-bar__header"
      tone="soft"
      :user-name="identityName"
      :store-name="identityMeta"
      :notification-count="notificationDrawer.unreadCount"
      :compact="!isDesktop"
      :menu-shortcut="shortcutKeys('sidebarToggle')"
      :menu-expanded="menuExpanded"
      @toggle-menu="$emit('toggle-menu')"
      @notifications="notificationDrawer.toggleDrawer()"
    >
      <template #search>
        <ShellSearch ref="searchRef" @dismiss="$emit('search-dismiss')" @focusout="$emit('search-blur')" />
      </template>
      <!-- ADR-0034: Otopilot girişi (DISABLED iken çizilmez). -->
      <template #end-start>
        <OtopilotLauncher :compact="!isDesktop" />
      </template>
    </EkAppHeader>

    <v-menu v-model="helpOpen" activator="[data-header-action=help]" location="bottom end" :offset="8">
      <EkMenuPanel autofocus ref="helpPanelRef" :groups="helpGroups" label="Yardım" @select="onHelpSelect" @close="helpOpen = false" />
    </v-menu>

    <!-- FR2-DARK: içerik tıklaması menüyü kapatmaz (tema seçimi yerinde görülür); öğeler onAccountSelect ile kapatır. -->
    <v-menu v-model="accountOpen" activator="[data-header-action=account]" location="bottom end" :offset="8" :close-on-content-click="false">
      <div class="ek-shell-account">
        <div class="ek-shell-account__head">
          <StoreLogoAvatar :size="36" :store-name="storeName" :logo="userApi.getStoreLogo()" />
          <div class="ek-shell-account__who">
            <span class="ek-shell-account__eyebrow" aria-hidden="true">Hesap</span>
            <span class="ek-shell-account__name">{{ identityName }}</span>
            <span class="ek-shell-account__meta">{{ userApi.getUsername.value }}</span>
          </div>
        </div>
        <!-- FR2-DARK: tema tercihi (Açık / Koyu / Sistem) — kalıcı, ilk karede theme-boot.js uygular. -->
        <EkThemeSwitch class="ek-shell-account__theme" :model-value="themePreference" @update:model-value="appTheme.setPreference" />
        <EkMenuPanel autofocus ref="accountPanelRef" class="ek-shell-account__menu" :groups="accountGroups" label="Hesap" @select="onAccountSelect" @close="accountOpen = false" />
      </div>
    </v-menu>
  </v-app-bar>
</template>

<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { setI18nLanguage } from '@/plugins/i18n'
import { useNotificationDrawerStore } from '@/stores/notificationDrawer'
import useUser from '@/composables/user'
import LoadingComponent from '../LoadingComponent.vue'
import StoreLogoAvatar from './StoreLogoAvatar.vue'
import ShellSearch from './ShellSearch.vue'
import OtopilotLauncher from '@/chat/OtopilotLauncher.vue'
import { EkAppHeader, EkMenuPanel, EkThemeSwitch, type EkMenuGroup, type EkMenuItem } from '@entegrasyonik/ui/components'
import { appTheme } from '@/stores/theme'
import { useWorkspaceStore } from '@/stores/workspace'
import { useShellBreakpoints } from '@/composables/useShellBreakpoints'
import { shortcutKeys } from '@entegrasyonik/ui/shortcuts'
import { useHelpNavigation } from '@/help/useHelpNavigation'
import { usePageAbout } from '@/composables/usePageAbout'
import { usePublicConfigStore } from '@/stores/publicConfig'
import { supportContactGroups, supportContactHref } from './supportContact'
import { isNativeShell } from '@entegrasyonik/ui/native'
import { SITE_MOBILE_APP_PATH, siteUrl } from '@/config/siteLinks'

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
const helpNav = useHelpNavigation()
const pageAbout = usePageAbout()
const { locale } = useI18n({ useScope: 'global' })
const { isDesktop, isMobile } = useShellBreakpoints()

const storeName = computed(() => userApi.getStoreName() || '')
// Kimlik: birincil satır mağaza (tenant) adı, ikincil satır oturumdaki kullanıcı.
const identityName = computed(() => storeName.value || userApi.getUsername.value || 'Mağaza paneli')
const identityMeta = computed(() => (storeName.value ? userApi.getUsername.value ?? '' : 'Mağaza paneli'))

// Yardım menüsü (faz3-fe-help): yardım merkezi + bağlamsal yardım girişleri. "Bu sayfa hakkında" etkin sekmenin
// (i) panelini açar (tercih ortak, `usePageAbout`); tur kabuktaki `HelpTour`'u başlatır (`ek:help-tour`).
// FE-CFG-2: destek iletişimi backoffice ayarından (`support.email` / `support.phone`); boş olan gösterilmez.
const publicConfig = usePublicConfigStore()
const helpGroups = computed<EkMenuGroup[]>(() => [
  {
    label: 'Yardım',
    items: [
      { key: 'helpCenter', label: 'Yardım merkezi', description: 'Rehberler, sorun giderme ve SSS', icon: 'mdi-book-open-page-variant-outline' },
      { key: 'pageAbout', label: 'Bu sayfa hakkında', description: 'Amaç, ipuçları ve kısayollar', icon: 'mdi-information-outline' },
      { key: 'tour', label: 'Uygulama turunu başlat', description: 'Kabuğu 1 dakikada tanıyın', icon: 'mdi-map-marker-path' },
      { key: 'shortcuts', label: 'Klavye kısayolları', icon: 'mdi-keyboard-outline', shortcut: shortcutKeys('shortcutHelp') },
    ],
  },
  {
    label: 'Destek',
    items: [
      { key: 'tickets', label: 'Destek talepleri', description: 'Talep oluşturun, yanıtları izleyin', icon: 'mdi-lifebuoy' },
    ],
  },
  ...supportContactGroups(publicConfig.supportEmail, publicConfig.supportPhone),
])

// Dar ekranda (< 768) üst barın yardım düğmesi gizlidir; destek iletişimi hesap menüsünde, çıkıştan önce görünür.
const themePreference = appTheme.preference
const inNativeShell = isNativeShell()

const accountGroups = computed<EkMenuGroup[]>(() => [
  {
    items: [
      // FR2-SHELL madde 8: menü ağacındaki Uygulama Ayarları'nı (kod ile; iç içe kayıt da bulunur) açar. Kullanıcının
      // menüsünde ekran yoksa (yetki) giriş gösterilmez — önce ölü "Ayarlar" girişi boş sekme/beyaz ekran açıyordu.
      ...(settingsLink.value ? [{ key: 'settings', label: 'Uygulama ayarları', description: 'Mağaza, fatura, lojistik ve iletişim', icon: 'mdi-cog-outline' }] : []),
      { key: 'shortcuts', label: 'Klavye kısayolları', icon: 'mdi-keyboard-outline', shortcut: shortcutKeys('shortcutHelp') },
      // APK-DL: Android uygulaması indirme sayfası (sitede). Android kabuğunun içinde zaten uygulamadasınız → gizli.
      ...(inNativeShell ? [] : [{ key: 'mobileApp', label: 'Mobil uygulama', description: 'Android uygulamasını indirin', icon: 'mdi-android' }]),
    ],
  },
  // Dar ekranda üst bardaki (?) düğmesi gizlidir → yardım girişleri hesap menüsünde de bulunur.
  {
    label: 'Yardım',
    items: [
      { key: 'helpCenter', label: 'Yardım merkezi', icon: 'mdi-book-open-page-variant-outline' },
      { key: 'tour', label: 'Uygulama turunu başlat', icon: 'mdi-map-marker-path' },
    ],
  },
  ...(isMobile.value ? supportContactGroups(publicConfig.supportEmail, publicConfig.supportPhone) : []),
  { items: [{ key: 'logout', label: 'Çıkış', icon: 'mdi-logout', danger: true }] },
])


const openByTitle = (title: string) => eventBus.emit('openTab', menuStore.getMenuLinkWithTitle(title))
const settingsLink = computed(() => (menuStore.getMenu?.() ? menuStore.getMenuLinkWithCode?.('SettingListView') : undefined))
const openSettings = () => {
  if (settingsLink.value) eventBus.emit('openTab', settingsLink.value)
}

function onHelpSelect(item: EkMenuItem) {
  helpOpen.value = false
  if (item.key === 'shortcuts') emit('open-shortcuts')
  else if (item.key === 'tickets') openByTitle('ticketList')
  else if (item.key === 'helpCenter') helpNav.openHelp()
  else if (item.key === 'pageAbout') pageAbout.setOpen(true)
  else if (item.key === 'tour') window.dispatchEvent(new CustomEvent('ek:help-tour'))
  else openSupportContact(item.key)
}

function openSupportContact(key: string) {
  const href = supportContactHref(key, publicConfig.supportEmail, publicConfig.supportPhone)
  if (href) window.location.href = href
}

// Site sayfası yeni sekmede; düz bağlantı tıklaması → Electron kabuğu bunu sistem tarayıcısında açar (electron/policy.js
// 'external'; `window.open` özellik dizesi açılır pencere sayılabilirdi).
function openSitePage(path: string) {
  const a = document.createElement('a')
  a.href = siteUrl(path)
  a.target = '_blank'
  a.rel = 'noopener'
  a.click()
}

function onAccountSelect(item: EkMenuItem) {
  accountOpen.value = false
  if (item.key === 'settings') openSettings()
  else if (item.key === 'shortcuts') emit('open-shortcuts')
  else if (item.key === 'helpCenter') helpNav.openHelp()
  else if (item.key === 'tour') window.dispatchEvent(new CustomEvent('ek:help-tour'))
  else if (item.key === 'mobileApp') openSitePage(SITE_MOBILE_APP_PATH)
  else if (item.key === 'logout') logout()
  else openSupportContact(item.key)
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

// C1.5: üst bar rozeti — yalnız okunmamış SAYISI yoklanır (tam liste çekmece/merkez açılınca gelir).
onMounted(() => notificationDrawer.startPolling())
onBeforeUnmount(() => notificationDrawer.stopPolling())

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

.ek-shell-account__theme {
  border-bottom: 1px solid var(--ek-color-border-subtle);
}

.ek-shell-account__menu {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

/* ================= FE-LOCAL-1058 — hesap menüsü: uygulamanın tasarım diliyle =================
   Kart köşesi + ince çerçeve; başlık bandı sakin zeminde — kısa eylem çizgili mikro etiket + mağaza adı + kullanıcı;
   tema seçimi kendi ince çizgili bölümünde; menü öğeleri ortak panel (çerçeveli ikon kutuları). */
.ek-shell-account {
  min-width: 300px;
  border-color: var(--ek-color-border-default);
  border-radius: var(--ek-radius-card);
  background: var(--ek-color-surface);
}

.ek-shell-account__head {
  padding: var(--ek-space-4);
  border-bottom-color: var(--ek-color-border-default);
}

.ek-shell-account__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--ek-space-2);
  color: var(--ek-color-content-muted);
  font-size: var(--ek-type-micro-size);
  line-height: var(--ek-type-micro-line);
  font-weight: var(--ek-type-micro-weight);
  letter-spacing: var(--ek-type-micro-tracking);
  text-transform: uppercase;
}

.ek-shell-account__eyebrow::before {
  content: '';
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--ek-color-action);
}

.ek-shell-account__name {
  font-size: var(--ek-type-body-size);
  line-height: var(--ek-type-body-line);
  font-weight: var(--ek-font-weight-semibold);
}

.ek-shell-account__theme {
  border-bottom-color: var(--ek-color-border-default);
}

/* Mağaza işareti: yuvarlak değil, kutu köşeli (üst bardaki avatar ve ikon kapsülleriyle aynı aile). */
.ek-shell-account__head > :first-child {
  border-radius: var(--ek-radius-tile);
}
</style>
