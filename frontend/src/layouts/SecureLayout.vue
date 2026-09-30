<!--
  frontend/src/layouts/SecureLayout.vue

  DS-v2 Aşama 2 — uygulama kabuğu. Yerleşim (Vuetify layout sırası = şablon sırası):
    1. `ApplicationBar` (tam genişlik kimlik bandı; daraltılınca yukarı kayar)
    2. sol menü: `NavigationMenu` — kalıcı (masaüstü tam↔ray AYNI çekmecede, B4 geçişli; tablette ray) VEYA
       geçici (tablet üst katmanı / mobil çekmece); `.soft-nav`/`.soft-rail` aynı anda tek (Ek A kancası)
    3. `v-main`: şerit yığını — bakım + duyuru (FE-CFG-2) + abonelik durum bandı (C2.2); yalnız biri varsa — + `ShellTabStrip` (sekmeler) +
       çalışma alanı (etkin sekmenin ekranı). Bant yüksekliği `--ek-shell-banner-h` ile alttakilere eklenir.
  Görünüm durumları: üst bölüm daraltılmış (Ctrl+Shift+H, eski Alt+U) · odak modu (Ctrl+Shift+F: üst bar +
  sol menü gizlenir, tarayıcı destekliyorsa tam ekran). İkisinin düğmeleri üst barın alt kenarındaki yüzen
  tutamakta (`ShellChromeHandle`, Aşama 5) — sekme şeridinde değil. Tüm kısayollar `navigation/shortcuts.ts`
  kaydından; bu dosya yalnızca olayı eyleme bağlar.
  Sekme durumu `stores/workspace.ts`'te (ADR-0012 Karar 3); kenar menü sunum tercihi
  `stores/sidebar.ts`'te (ADR-0015 Karar 2.1/2.2).
-->
<template>
  <v-layout ref="shellRef" class="ek-shell" :class="{ 'ek-shell--focus': focusMode, 'ek-shell--rail': showRail }">
    <ApplicationBar
      ref="appBarRef"
      :visible="headerShown"
      :menu-expanded="menuExpanded"
      @toggle-menu="toggleSidebar"
      @open-shortcuts="shortcutHelpOpen = true"
      @search-dismiss="onSearchDismiss"
      @search-blur="searchPeek = false"
    />
    <template v-if="!focusMode">
      <NavigationMenu
        v-if="menuPermanent"
        key="nav-permanent"
        :temporary="false"
        :rail="showRail"
        @collapse-request="sidebar.toggleDesktopRail()"
        @expand-request="onRailExpandRequest"
      />
      <NavigationMenu v-else key="nav-temporary" v-model="menuTemporaryOpen" temporary />
    </template>
    <NotificationDrawerComponent />

    <v-main class="ek-shell__main">
      <div v-if="hasBanner" ref="bannerRef" class="ek-shell__banner">
        <!-- FE-CFG-2: backoffice şeritleri — bakım (kapatılamaz) en üstte, duyuru (kapatılabilir) altında. -->
        <ShellNoticeBanner v-if="maintenanceNoticeModel" :model="maintenanceNoticeModel" :compact="focusMode" />
        <ShellNoticeBanner
          v-if="announcementNoticeModel"
          :model="announcementNoticeModel"
          :compact="focusMode"
          @dismiss="publicConfig.dismissAnnouncement()"
        />
        <ShellSubscriptionBanner
          v-if="subscriptionBanner"
          :model="subscriptionBanner"
          :minimized="subscriptionStore.minimized"
          :force-compact="focusMode"
          :can-manage="!!subscriptionLink"
          @update:minimized="subscriptionStore.setMinimized"
          @manage="openSubscription"
        />
      </div>
      <ShellTabStrip
        v-if="tabs"
        id="tour-homepage-tabs"
        class="ek-shell__tabs"
      />
      <ShellChromeHandle
        class="ek-shell__handle"
        :collapsed="!headerShown"
        :focus-mode="focusMode"
        @toggle-header="toggleHeader"
        @toggle-focus="toggleFocusMode"
      />
      <v-sheet
        id="tour-homepage-workarea"
        ref="workAreaRef"
        tabindex="-1"
        role="tabpanel"
        :aria-labelledby="mySelectedTab ? `ek-tab-${mySelectedTab.id}` : undefined"
        class="workplace-area"
      >
        <WrapperComponentVue ref="wrapperRef" :tab="mySelectedTab" :parameters="mySelectedTabParameters"
          :list="menuStore.tabProcessedMenu" @clear="workspace.clearActiveParameters()" />
      </v-sheet>
    </v-main>

    <ShortcutHelpDialog v-model="shortcutHelpOpen" />
    <!-- faz3-fe-help: isteğe bağlı kısa tur (ilk girişte teklif; Yardım menüsünden yeniden başlatılır). -->
    <HelpTour :ready="tourReady" />
  </v-layout>
</template>

<script lang="ts" setup>
import { provide, computed, watch, ref, nextTick, onMounted, onBeforeMount, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import NavigationMenu from '@/components/layout/NavigationMenu.vue'
import NotificationDrawerComponent from '@/components/user/NotificationDrawerComponent.vue'
import ApplicationBar from '@/components/layout/ApplicationBar.vue'
import ShellTabStrip from '@/components/layout/ShellTabStrip.vue'
import ShellChromeHandle from '@/components/layout/ShellChromeHandle.vue'
import ShortcutHelpDialog from '@/components/layout/ShortcutHelpDialog.vue'
import ShellSubscriptionBanner from '@/components/layout/ShellSubscriptionBanner.vue'
import HelpTour from '@/components/help/HelpTour.vue'
import { useSubscriptionBannerStore } from '@/stores/subscriptionBanner'
import ShellNoticeBanner from '@/components/layout/ShellNoticeBanner.vue'
import { announcementNotice, maintenanceNotice } from '@/components/layout/shellNotice'
import { usePublicConfigStore } from '@/stores/publicConfig'
import { useMenuStore } from '@/stores/site/menu'
import { useSidebarStore } from '@/stores/sidebar'
import mitt from 'mitt'
import useCommunication from '@/composables/site/communication'
import useThemeStore from '@/stores/theme'
import useContextStore from '@/stores/context'
import useMarketplaceStore from '@/stores/marketplace'
import useECommerceStore from '@/stores/ecommerce'
import WrapperComponentVue from '@/components/WrapperComponent.vue'
import { useShellBreakpoints } from '@/composables/useShellBreakpoints'
import { useTabStore } from '@/composables/opentab'
import { isPinnedLink, useWorkspaceStore } from '@/stores/workspace'
import { matchShortcut, type ShortcutMatch } from '@entegrasyonik/ui/shortcuts'
import { useRouter } from 'vue-router'

const router = useRouter()
const tabStore = useTabStore()
const workspace = useWorkspaceStore()
const eventBus = mitt()
const menuStore = useMenuStore()
const communication: any = useCommunication(eventBus)
provide('eventBus', eventBus)
provide('useMenuStore', menuStore)
provide('useThemeStore', useThemeStore())
provide('useContextStore', useContextStore(eventBus))
provide('useMarketplaceStore', useMarketplaceStore())
provide('useECommerceStore', useECommerceStore())

// ADR-0012 Karar 3 — `storeToRefs` ZORUNLU (tamamen yeniden atanan state'lerde reaktivite).
const { tabs, mySelectedTab, mySelectedTabParameters } = storeToRefs(workspace)

// ADR-0012 Karar 5 — kırılımlar ADR-0011 token sabitlerine (768/1024) bağlı.
const { isMobile, isTablet } = useShellBreakpoints()
const sidebar = useSidebarStore()

const appBarRef = ref<InstanceType<typeof ApplicationBar> | null>(null)
const wrapperRef: any = ref(null)
const workAreaRef: any = ref(null)
const shortcutHelpOpen = ref(false)
const tourReady = ref(false)
/** Sayfa başlığındaki "Sayfa hakkında" panelinin "Tüm kısayollar" bağlantısı (EkPageBar → `ek:shortcut-help`). */
const openShortcutHelp = () => (shortcutHelpOpen.value = true)

// ---- Sol menü sunumu (ADR-0015 Karar 2.1/2.2) ----

/** Ray (64px, yalnızca ikon) sunumu mu gösterilecek? */
const showRail = computed(() => {
  if (isMobile.value) return false // mobil: ray YOK, yalnızca hamburger ile açılan geçici çekmece.
  if (isTablet.value) return !sidebar.tabletOverlayOpen
  return sidebar.desktopRail
})

/** Kalıcı çekmece: masaüstü (tam↔ray) ve tablette ray; tablet üst katmanı / mobil = geçici. */
const menuPermanent = computed(() => !isMobile.value && !(isTablet.value && sidebar.tabletOverlayOpen))

/** `NavigationMenu` (tam, 248px) `temporary` modda mı (mobil çekmece / tablet üst katmanı)? */
const menuTemporary = computed(() => isMobile.value || isTablet.value)

const menuTemporaryOpen = computed({
  get: () => (isMobile.value ? sidebar.mobileDrawerOpen : sidebar.tabletOverlayOpen),
  set: (value: boolean) => {
    if (isMobile.value) {
      if (value) sidebar.openMobileDrawer(); else sidebar.closeMobileDrawer()
    } else {
      if (value) sidebar.openTabletOverlay(); else sidebar.closeTabletOverlay()
    }
  },
})

/** Menü düğmesinin `aria-expanded` değeri: tam menü ekranda mı. */
const menuExpanded = computed(() => {
  if (isMobile.value) return sidebar.mobileDrawerOpen
  if (isTablet.value) return sidebar.tabletOverlayOpen
  return !sidebar.desktopRail
})

/** Rayda bir GRUP öğesine / genişlet düğmesine tıklanınca tam menüyü aç. */
const onRailExpandRequest = () => {
  if (isTablet.value) sidebar.openTabletOverlay()
  else if (sidebar.desktopRail) sidebar.toggleDesktopRail()
}

/** Üst bardaki menü düğmesi ve Ctrl+B: sunuma göre ray↔tam / katmanı aç-kapa. */
function toggleSidebar() {
  if (focusMode.value) setFocusMode(false)
  if (isMobile.value) {
    if (sidebar.mobileDrawerOpen) sidebar.closeMobileDrawer(); else sidebar.openMobileDrawer()
  } else if (isTablet.value) {
    if (sidebar.tabletOverlayOpen) sidebar.closeTabletOverlay(); else sidebar.openTabletOverlay()
  } else {
    sidebar.toggleDesktopRail()
  }
}

// ---- Üst bölüm daraltma + odak modu ----

const headerCollapsed = ref(false)
const focusMode = ref(false)
/** Üst bar gizliyken Ctrl+K: arama için üst bar geçici olarak görünür (arama odaktan çıkınca geri gizlenir). */
const searchPeek = ref(false)
const headerShown = computed(() => searchPeek.value || (!headerCollapsed.value && !focusMode.value))
let enteredFullscreen = false

function toggleHeader() {
  if (focusMode.value) setFocusMode(false)
  else headerCollapsed.value = !headerCollapsed.value
}

async function setFocusMode(on: boolean) {
  focusMode.value = on
  const doc: any = typeof document !== 'undefined' ? document : undefined
  try {
    if (on && doc?.fullscreenEnabled && !doc.fullscreenElement) {
      await doc.documentElement.requestFullscreen()
      enteredFullscreen = true
    } else if (!on && enteredFullscreen && doc?.fullscreenElement) {
      enteredFullscreen = false
      await doc.exitFullscreen()
    }
  } catch {
    // Tam ekran reddedilirse (izin/iframe/başsız tarayıcı) odak modu yine de çalışır: yalnızca kabuk gizlenir.
    enteredFullscreen = false
  }
}
const toggleFocusMode = () => setFocusMode(!focusMode.value)

/** Kullanıcı tam ekrandan Esc ile çıkarsa odak modu da kapanır (iki durum ayrışmasın). */
function onFullscreenChange() {
  if (enteredFullscreen && !document.fullscreenElement) {
    enteredFullscreen = false
    focusMode.value = false
  }
}

// ---- Arama odağı (Ctrl+K) ----

let focusBeforeSearch: HTMLElement | null = null

function focusSearch() {
  const active = document.activeElement as HTMLElement | null
  if (active && !active.closest('.ek-search')) focusBeforeSearch = active
  if (!headerShown.value) searchPeek.value = true
  // Üst bar yukarıdan kayarak geliyorsa önce yerleşsin (v-app-bar geçişi).
  nextTick(() => setTimeout(() => appBarRef.value?.focusSearch(), searchPeek.value ? 60 : 0))
}

function onSearchDismiss() {
  searchPeek.value = false
  const target = focusBeforeSearch
  focusBeforeSearch = null
  if (target && document.contains(target)) target.focus({ preventScroll: true })
}

// ---- Global kısayollar ----

function runShortcut(match: ShortcutMatch) {
  switch (match.id) {
    case 'search':
      return focusSearch()
    case 'sidebarToggle':
      return toggleSidebar()
    case 'headerToggle':
      return toggleHeader()
    case 'focusMode':
      return toggleFocusMode()
    case 'tabNext':
      return workspace.activateRelative(1)
    case 'tabPrev':
      return workspace.activateRelative(-1)
    case 'tabGoto':
      return workspace.activateIndex(match.index ?? 0)
    case 'tabClose': {
      const tab = mySelectedTab.value
      if (tab && !isPinnedLink(tab.link)) workspace.closeTab(tab)
      return
    }
    case 'shortcutHelp':
      shortcutHelpOpen.value = true
      return
    case 'pageRefresh': {
      // Aşama 6b (Standart 9): etkin sekmenin TEK yenile düğmesi (EkRefreshButton, `data-page-refresh`) tetiklenir —
      // sayfa kendi yükleme mantığını kullanır; düğmesi olmayan sayfada kısayol sessizce etkisizdir.
      const host = document.querySelector<HTMLElement>('.ek-tab-host:not(.ek-tab-host--hidden)')
      host?.querySelector<HTMLButtonElement>('[data-page-refresh]:not([disabled])')?.click()
      return
    }
  }
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return
  // Açık bir UYGULAMA GENELİ diyalog/menü varken (Vuetify overlay) sekme/görünüm kısayolları arka planı değiştirmesin.
  // Aşama 6b (Standart 7): sekme kabına bağlı örtüler (`.ek-tab-host` içi) yalnız o sekmeyi örter — sekmeler arası
  // geçiş, üst bölüm ve arama kısayolları çalışmaya devam eder.
  const overlayOpen = Array.from(document.querySelectorAll('.v-overlay--active.v-dialog, .v-overlay--active.v-menu')).some((el) => !el.closest('.ek-tab-host'))
  const match = matchShortcut(event, event.target)
  if (!match) return
  if (overlayOpen && match.id !== 'search') return
  event.preventDefault()
  runShortcut(match)
}

// ---- Abonelik durum bandı (C2.2) ----

const SUBSCRIPTION_SCREEN_CODE = 'SubscriptionView'
const subscriptionStore = useSubscriptionBannerStore()
const shellRef = ref<any>(null)
const bannerRef = ref<HTMLElement | null>(null)
const onSubscriptionScreen = computed(() => mySelectedTab.value?.link?.code === SUBSCRIPTION_SCREEN_CODE)
/** Abonelik ekranı açıkken bant gizlenir: ekranın kendi durum bölümü aynı bilgiyi (daha ayrıntılı) verir. */
const subscriptionBanner = computed(() => (onSubscriptionScreen.value ? null : subscriptionStore.banner))
// FE-CFG-2 — platform duyurusu / bakım şeridi (`GET /api/public-config`, backoffice'ten yönetilir).
const publicConfig = usePublicConfigStore()
const maintenanceNoticeModel = computed(() => (publicConfig.maintenance ? maintenanceNotice(publicConfig.maintenance.message) : null))
const announcementNoticeModel = computed(() =>
  publicConfig.announcementVisible && publicConfig.announcement ? announcementNotice(publicConfig.announcement.level, publicConfig.announcement.text) : null,
)
const hasBanner = computed(() => !!(subscriptionBanner.value || maintenanceNoticeModel.value || announcementNoticeModel.value))
/** Menüde abonelik ekranı yoksa (yetki) "Aboneliği yönet" gösterilmez; bant yine görünür. */
const subscriptionLink = computed(() => menuStore.getMenuLinkWithCode(SUBSCRIPTION_SCREEN_CODE))

function openSubscription() {
  const link = subscriptionLink.value
  if (link) workspace.openTab(link)
}

// Abonelik ekranından çıkınca durum yeniden okunur (plan seçimi/ödeme sonrası bant hemen güncellensin).
watch(onSubscriptionScreen, (now, before) => {
  if (before && !now) void subscriptionStore.refresh()
})

// Bant yüksekliği (sarma/küçültme ile değişir) → `--ek-shell-banner-h`; sekme şeridi ve çalışma alanı
// bu kadar aşağı iner. Satır içi stil bağlama yerine özellik doğrudan kabuk kökünde ayarlanır.
let bannerObserver: ResizeObserver | undefined

function setBannerHeight(px: number) {
  const el: HTMLElement | undefined = shellRef.value?.$el
  el?.style.setProperty('--ek-shell-banner-h', `${Math.round(px)}px`)
}

watch(bannerRef, (el) => {
  bannerObserver?.disconnect()
  bannerObserver = undefined
  if (!el) return setBannerHeight(0)
  setBannerHeight(el.getBoundingClientRect().height)
  if (typeof ResizeObserver !== 'undefined') {
    bannerObserver = new ResizeObserver((entries) => setBannerHeight(entries[0]?.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height))
    bannerObserver.observe(el)
  }
}, { flush: 'post' })

// ---- Sekme geçişi: kısa fade + hafif kayma (DS hareket token'ları; reduced-motion'da yok) ----

function cssMs(name: string, fallback: number) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const value = parseFloat(raw)
  return Number.isFinite(value) ? value : fallback
}

function playTabEnter() {
  const el: HTMLElement | undefined = workAreaRef.value?.$el
  if (!el?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const duration = cssMs('--ek-duration-base', 200)
  if (!duration) return
  const distance = cssMs('--ek-motion-distance-sm', 4)
  const easing = getComputedStyle(document.documentElement).getPropertyValue('--ek-easing-enter').trim() || 'ease-out'
  el.animate([{ opacity: 0, transform: `translateY(${distance}px)` }, { opacity: 1, transform: 'none' }], { duration, easing })
}

onMounted(async () => {
  tabStore.setOpenTabMethod(workspace.openTab)
  workspace.setDestroyHook((link: any) => {
    if (wrapperRef?.value?.destroyTab) wrapperRef.value.destroyTab(link)
  })
  workspace.attachRouter(router)
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('ek:shortcut-help', openShortcutHelp)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  subscriptionStore.start()
  await workspace.init()
  const menu = menuStore.getMenu?.()
  tourReady.value = Array.isArray(menu) && menu.length > 0
})

// ADR-0012 Karar 5 "etkin sekme değişiminde odak çalışma alanına taşınır" + DS-v2 giriş hareketi.
watch(mySelectedTab, (tab, previous) => {
  if (previous && tab && tab !== previous) playTabEnter()
  requestAnimationFrame(() => {
    // Sekme şeridinde klavyeyle geziniliyorsa odak orada kalır (roving tabindex bozulmasın).
    if (document.activeElement?.closest?.('[role="tablist"]')) return
    workAreaRef.value?.$el?.focus?.({ preventScroll: true })
  })
})

onBeforeMount(() => {
  communication.onKeydown(closeTemporaryMenu)
  eventBus.on('openTab', workspace.openTab)
})

onBeforeUnmount(() => {
  eventBus.off('openTab', workspace.openTab)
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('ek:shortcut-help', openShortcutHelp)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  subscriptionStore.stop()
  bannerObserver?.disconnect()
})

// ADR-0015 Karar 2.1 — Escape yalnızca GEÇİCİ sunumları (mobil çekmece / tablet üst katmanı) kapatır.
const closeTemporaryMenu = () => {
  if (isMobile.value && sidebar.mobileDrawerOpen) {
    sidebar.closeMobileDrawer()
    return true
  }
  if (isTablet.value && sidebar.tabletOverlayOpen) {
    sidebar.closeTabletOverlay()
    return true
  }
  return false
}
</script>

<style scoped>
.ek-shell {
  /* B4: içerik sol menüyle AYNI süre/eğri/gecikmeyle kayar (app.css --ek-app-nav-*): ray'a giderken menü içeriği
     solduktan sonra, genişlerken hemen. */
  --ek-shell-left: left var(--ek-app-nav-move) var(--ek-easing-enter) 0ms;
  background: var(--ek-color-background);
}

.ek-shell--rail {
  --ek-shell-left: left var(--ek-app-nav-move) var(--ek-easing-enter) var(--ek-app-nav-lag);
}

/* ÖNEMLİ (mühendislik notu — kalıcı kenar menü): `v-main` kalıcı drawer/app-bar için
   `--v-layout-left/top` değişkenlerini kendi üzerinde tanımlar; `position:absolute` alt
   öğeler padding'i YOK SAYDIĞI için ofset AYNI değişkenlerden okunur — ray/tam/gizli menü,
   görünür/daraltılmış üst bar her durumda doğru konum otomatik gelir. */
.ek-shell__tabs,
.workplace-area {
  position: absolute;
  left: var(--v-layout-left, 0px);
  right: var(--v-layout-right, 0px);
  transition:
    top var(--ek-duration-base) var(--ek-easing-standard),
    var(--ek-shell-left);
}

.ek-shell__banner {
  position: absolute;
  top: var(--v-layout-top, 0px);
  left: var(--v-layout-left, 0px);
  right: var(--v-layout-right, 0px);
  z-index: var(--ek-z-sticky);
  transition:
    top var(--ek-duration-base) var(--ek-easing-standard),
    var(--ek-shell-left);
}

.ek-shell__tabs {
  top: calc(var(--v-layout-top, 0px) + var(--ek-shell-banner-h, 0px));
  z-index: var(--ek-z-sticky);
}

/* Yüzen tutamak: üst barın (varsa bandın) alt kenarına yapışık, sekme şeridinin sağ üst köşesinde; sekmelerin üstünde. */
.ek-shell__handle {
  position: absolute;
  top: calc(var(--v-layout-top, 0px) + var(--ek-shell-banner-h, 0px));
  right: calc(var(--v-layout-right, 0px) + var(--ek-space-2));
  z-index: calc(var(--ek-z-sticky) + 1);
  transition: top var(--ek-duration-base) var(--ek-easing-standard);
}

.workplace-area {
  top: calc(var(--v-layout-top, 0px) + var(--ek-shell-banner-h, 0px) + var(--ek-app-tabstrip-height));
  bottom: 0;
  border: none;
  border-radius: 0;
  background-color: var(--ek-color-background);
}

/* Çalışma alanı yalnızca programatik odak hedefidir (tabindex=-1, sekme sırasında değil): sekme
   değişiminde ekran okuyucu bağlamı buraya taşınır; tüm içeriği çevreleyen bir halka görsel gürültüdür. */
.workplace-area:focus {
  outline: none;
}
</style>
