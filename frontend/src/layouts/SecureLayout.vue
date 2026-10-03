<template>
  <v-layout class="rounded rounded-md ma-0 pa-0">
    <!-- ADR-0015 Karar 2.1/2.2 — kalıcı/daraltılabilir kenar menüsü: masaüstü/tablette DAİMA bir
         `v-navigation-drawer` görünür (ray VEYA tam); mobilde yalnızca hamburger ile açılan geçici
         çekmece. Aynı anda TEK biri render edilir (`.v-navigation-drawer.soft-nav` seçicisinin tekil
         kalması için — Ek A kancası). -->
    <NavigationRail v-if="showRail" @expand-request="onRailExpandRequest" />
    <NavigationMenu v-else :temporary="menuTemporary" v-model="menuTemporaryOpen"
      @collapse-request="sidebar.toggleDesktopRail()" />
    <NotificationDrawerComponent />

    <ApplicationBar class="transitionClass ma-0 pa-0" :style="expanded == true ? { top: '-300px', opacity: .1 } : {}"
      @open-menu="onOpenMenuRequest" @open-command-palette="commandPaletteRef?.open()" />
    <EkCommandPalette ref="commandPaletteRef" />
    <v-main>
      <v-card flat class="mt-1 mr-0 ml-0 workplace-tabs transitionClass" v-if="tabs"
        :class="{ 'workplace-tabs--tablet': isTablet, 'workplace-tabs--mobile': isMobile }"
        :style="expanded == true ? { top: '0px' } : {}">

        <!-- Masaüstü (>=1024) / tablet (768-1023): yatay sekme çubuğu (ADR-0012 Karar 5). -->
        <v-tabs v-if="!isMobile" show-arrows center-active hide-slider v-model="mySelectedTab" density="compact"
          id="tour-homepage-tabs" role="tablist" aria-label="Açık sekmeler"
          style="margin-left:13px; max-width: calc(100% - 90px);">
          <v-tab v-for="(element, index) of tabSelectors" :key="element.id" :data-id="element.id" variant="plain"
            :ripple="false" role="tab" :aria-selected="isSelectorActive(element)" color="black"
            selected-class="selected-workplace-tab"
            :class="index == tabSelectors.length - 1 ? 'mr-6' : ''"
            class="workplace-tab" :value="element.list ? element.selectedTabSelector : element">
            <div class="d-flex workplace-tab-content align-center mb-2">
              <div style="position:relative" class="d-flex align-center" v-if="element.list">
                <v-menu v-model="element.selectedTabSelector.menu">
                  <template v-slot:activator="{ props }">
                    <div class="d-flex align-center" v-bind="props"
                      @click="element.selectedTabSelector.id == mySelectedTab.id ? element.selectedTabSelector.menu = true : element.selectedTabSelector.menu = false; mySelectedTab = element.selectedTabSelector">
                      <v-icon size="20" :color="element.selectedTabSelector.id == mySelectedTab.id ? 'processButtonColor' : 'unset'">
                        {{ element.selectedTabSelector.link.icon }}</v-icon>
                      {{ $t(element.selectedTabSelector.link.title) }}
                      <v-icon v-if="element.selectedTabSelector.id != 0" @click.stop=""
                        :color="element.selectedTabSelector.id == mySelectedTab.id ? 'processButtonColor' : 'var(--ek-color-content-subtle)'"
                        class="mb-0" size="30" style="opacity:.8;">mdi-menu-down</v-icon>
                      <v-spacer />
                    </div>
                  </template>

                  <v-card variant="outlined" elevation="1" class="pt-0"
                    style="margin-left:-8px;border:1px solid var(--ek-color-border-color);border-radius:var(--ek-radius-xl);border-top-right-radius:0;border-top-left-radius:0;">
                    <v-list density="compact" class="pt-0 pb-0" style="background-color:var(--ek-color-login-form)">
                      <v-list-item style="border:1px solid rgba(var(--v-theme-borderColor),.4)"
                        v-for="listTab of element.list" :key="listTab.id"
                        @click="element.selectedTabSelector = listTab; mySelectedTab = listTab">
                        <template v-slot:title>
                          <span style="font-weight:450;font-size:.9em!important">{{ listTab.link.title }}</span>
                        </template>
                      </v-list-item>
                    </v-list>
                  </v-card>
                </v-menu>

                <v-icon v-if="element.selectedTabSelector.id != 0" tabindex="0" role="button"
                  :aria-label="`Sekmeyi kapat: ${listTitle(element.selectedTabSelector.link)}`"
                  @click.stop="closeTab(element.selectedTabSelector)"
                  @keydown.enter.stop="closeTab(element.selectedTabSelector)"
                  @keydown.space.stop.prevent="closeTab(element.selectedTabSelector)"
                  :color="element.selectedTabSelector.id == mySelectedTab.id ? 'processButtonColor' : 'var(--ek-color-content-subtle)'"
                  class="mb-0 close-tab-icon" size="20" style="opacity:.8;">mdi-close-circle</v-icon>
              </div>
              <template v-else>
                <v-icon size="20" :color="element.id == mySelectedTab.id ? 'processButtonColor' : 'unset'">{{ element.link.icon }}</v-icon>
                <span class="workplace-tab-title" :class="isTablet ? 'text-truncate' : ''">
                  {{ element.link.singleton == false ? element.link.title : $t(element.link.fullPath) }}
                </span>
                <v-spacer />
                <v-icon v-if="element.id != 0" tabindex="0" role="button"
                  :aria-label="`Sekmeyi kapat: ${listTitle(element.link)}`"
                  @click.stop="closeTab(element)"
                  @keydown.enter.stop="closeTab(element)"
                  @keydown.space.stop.prevent="closeTab(element)"
                  :color="element.id == mySelectedTab.id ? 'processButtonColor' : 'var(--ek-color-content-subtle)'" class="mb-0 close-tab-icon"
                  size="20" style="opacity:.8;">mdi-close-circle</v-icon>
              </template>
            </div>
          </v-tab>
        </v-tabs>

        <!-- ADR-0012 Karar 5: masaüstü/tablette de "tüm sekmeler" taşma menüsü (show-arrows'un ek desteği). -->
        <v-menu v-if="!isMobile" v-model="switcherOpen" location="bottom end" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon size="small" variant="text" class="all-tabs-btn"
              :aria-label="`Tüm sekmeler (${tabSelectors.length})`">
              <v-icon size="18">mdi-view-list-outline</v-icon>
            </v-btn>
          </template>
          <WorkplaceTabSwitcher :tab-selectors="tabSelectors" :active-code="activeLinkCode" @select="selectFromSwitcher"
            @close="closeFromSwitcher" @close-all="closeAllClosable" />
        </v-menu>

        <!-- Mobil (<768): tek-görünür sekme başlığı + değiştirici (ADR-0012 Karar 5). -->
        <div v-if="isMobile" class="mobile-tab-bar d-flex align-center px-4" role="tablist" aria-label="Açık sekmeler">
          <v-icon size="18" class="mr-2" v-if="activeTabIcon">{{ activeTabIcon }}</v-icon>
          <span class="mobile-tab-title text-truncate" role="tab" aria-selected="true">{{ activeTabTitle }}</span>
          <v-spacer />
          <v-btn variant="text" density="comfortable" class="switcher-btn"
            :aria-label="`Açık sekmeler (${tabSelectors.length})`" @click="switcherOpen = true">
            <v-badge :content="tabSelectors.length" color="error" :model-value="tabSelectors.length > 1" offset-x="-2"
              offset-y="-2">
              <v-icon size="20">mdi-view-carousel-outline</v-icon>
            </v-badge>
          </v-btn>
        </div>
        <v-bottom-sheet v-if="isMobile" v-model="switcherOpen">
          <WorkplaceTabSwitcher :tab-selectors="tabSelectors" :active-code="activeLinkCode" @select="selectFromSwitcher"
            @close="closeFromSwitcher" @close-all="closeAllClosable" />
        </v-bottom-sheet>
      </v-card>

      <!-- ADR-0015 Karar 2.1 — "Odak modu ⤢" (mevcut `expanded` davranışı: üst çubuğu gizler).
           Bugünkü sağ üstteki başıboş "□" düğmesi buraya, sekme şeridinin sağ ucuna taşındı. -->
      <div style="position:absolute;right:8px;top:calc(var(--ek-app-topbar-height) + (var(--ek-app-tabstrip-height) - 28px) / 2);height:28px;z-index:3000"
        class="transitionClass" :style="expanded == true ? { top: '4px', right: '4px' } : {}" @click="expanded = !expanded">
        <v-tooltip open-delay=1000 :text="expanded ? 'Odak modundan çık' : 'Odak modu'">
          <template v-slot:activator="{ props }">
            <v-btn :size="22" v-bind="props" density="comfortable" class="nav-action-btn" elevation="0"
              :aria-label="expanded ? 'Çalışma alanını daralt' : 'Çalışma alanını genişlet'">
              <v-icon size="16">{{ !expanded ? 'mdi-arrow-expand' : 'mdi-arrow-collapse' }} </v-icon>
            </v-btn>
          </template>
        </v-tooltip>
      </div>
      <v-sheet ref="workAreaRef" tabindex="-1"
        class="workplace-area transitionClass" :style="expanded ? { top: 'var(--ek-app-tabstrip-height)' } : {}" id="tour-homepage-workarea">

        <Transition name="fade" mode="out-in">
          <KeepAlive>
            <WrapperComponentVue :key="1" ref="wrapperRef" :tab="mySelectedTab" :parameters="mySelectedTabParameters"
              @clear="workspace.clearActiveParameters()" :list="menuStore.tabProcessedMenu" />
          </KeepAlive>
        </Transition>

      </v-sheet>
    </v-main>
  </v-layout>
</template>


<script lang="ts" setup>
import { provide, computed, watch, ref, onMounted, onBeforeMount, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import NavigationMenu from '@/components/layout/NavigationMenu.vue'
import NavigationRail from '@/components/layout/NavigationRail.vue'
import NotificationDrawerComponent from '@/components/user/NotificationDrawerComponent.vue'
import ApplicationBar from '@/components/layout/ApplicationBar.vue'
import EkCommandPalette from '@/components/layout/EkCommandPalette.vue'
import WorkplaceTabSwitcher from '@/components/layout/WorkplaceTabSwitcher.vue'
import { useMenuStore } from '@/stores/site/menu'
import { useSidebarStore } from '@/stores/sidebar'
import mitt from 'mitt';
import useCommunication from '@/composables/site/communication';
import useThemeStore from '@/stores/theme';
import useContextStore from '@/stores/context';
import useMarketplaceStore from '@/stores/marketplace'
import useECommerceStore from '@/stores/ecommerce'
import WrapperComponentVue from '@/components/WrapperComponent.vue';
import useRestApi from '@/composables/restapi'
import { useLoadingStore } from '@/stores/loadingStore'
import { useShellBreakpoints } from '@/composables/useShellBreakpoints'

import { useTabStore } from '@/composables/opentab'
import { useWorkspaceStore } from '@/stores/workspace'

import { useRouter } from 'vue-router'
const router = useRouter()

const tabStore = useTabStore()
const workspace = useWorkspaceStore()

const restApi = useRestApi()
const loadingStore = useLoadingStore()
const eventBus = mitt();
const menuStore = useMenuStore()
var communication: any = useCommunication(eventBus)
const expanded = ref(false)
provide('eventBus', eventBus);
provide('useMenuStore', menuStore);
provide('useThemeStore', useThemeStore());
provide('useContextStore', useContextStore(eventBus));
provide('useMarketplaceStore', useMarketplaceStore());
provide('useECommerceStore', useECommerceStore());

// ADR-0012 Karar 3 — sekme durumu artık `stores/workspace.ts`'te yaşıyor; bu bileşen yalnızca
// görünümdür. `storeToRefs` ZORUNLU: düz destructuring `mySelectedTab`/`mySelectedTabParameters`
// gibi TAMAMEN yeniden atanan (`.value = x`) state'lerde reaktiviteyi KIRAR (`tabs`/`tabSelectors`
// yalnızca push/splice ile mutasyona uğradığı için düz destructuring'de de çalışırdı, ama tutarlılık
// için hepsi `storeToRefs` ile alınıyor).
const { tabs, tabSelectors, mySelectedTab, mySelectedTabParameters } = storeToRefs(workspace)

// ADR-0012 Karar 5 — kırılımlar Vuetify `display.thresholds`'a DEĞİL, ADR-0011 token sabitlerine (768/1024) bağlanır.
const { isMobile, isTablet } = useShellBreakpoints()

// ADR-0015 Karar 2.1/2.2 — kenar menü orkestrasyonu (`stores/sidebar.ts`). Menü ÖĞE mantığı
// (`NavigationMenu.vue`) DEĞİŞMEDİ; bu yalnızca HANGİ sunumun (ray/tam/geçici) gösterileceğine
// karar verir.
const sidebar = useSidebarStore()

/** Ray (64px, yalnızca ikon) sunumu mu gösterilecek? */
const showRail = computed(() => {
  if (isMobile.value) return false // mobil: ray YOK, yalnızca hamburger ile açılan geçici çekmece.
  if (isTablet.value) return !sidebar.tabletOverlayOpen
  return sidebar.desktopRail
})

/** `NavigationMenu` (tam, 248px) `temporary` modda mı render edilecek (mobil çekmece / tablet üst katmanı)? */
const menuTemporary = computed(() => isMobile.value || isTablet.value)

/** `temporary` modda görünürlük — kalıcı (masaüstü tam) modda anlamsız (`NavigationMenu` yok sayar). */
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

/** Rayda bir GRUP öğesine tıklanınca tam menüyü aç (yaprak öğeler `NavigationRail` içinde doğrudan gezinir). */
const onRailExpandRequest = () => {
  if (isTablet.value) sidebar.openTabletOverlay()
  else if (sidebar.desktopRail) sidebar.toggleDesktopRail()
}

/** `ApplicationBar`'daki hamburger/marka simgesi (mobil/tablet) — geçici menüyü açar. */
const onOpenMenuRequest = () => {
  if (isMobile.value) sidebar.openMobileDrawer()
  else if (isTablet.value) sidebar.openTabletOverlay()
}

const wrapperRef: any = ref(null)
const workAreaRef: any = ref(null)
const switcherOpen = ref(false)
const commandPaletteRef: any = ref(null)

const activeLinkCode = computed(() => mySelectedTab.value?.link?.code)
const activeTabTitle = computed(() => {
  const link = mySelectedTab.value?.link
  if (!link) return ''
  return link.singleton == false ? link.title : listTitle(link)
})
const activeTabIcon = computed(() => mySelectedTab.value?.link?.icon)

// ADR-0015 Karar 2.3 "Başlığın sekme başlığıyla aynı olması zorunludur" — `$t` DAHA ÖNCE
// yalnızca template'te globalInjection ile mevcuttu, script bağlamında YOKTU; bu yüzden mobil
// sekme başlığı (`activeTabTitle` → `listTitle`) ham i18n anahtarını ("menu.dashboard") METİN
// olarak gösteriyordu (görsel bulgu, A3 ekran görüntüsü incelemesinde yakalandı). `useI18n`
// eklenip singleton bağlantılarda `t(fullPath)` çağrılarak düzeltildi; kapatma düğmesi
// aria-label'ı da aynı çeviriyi kullanır (davranış/spec kancası DEĞİŞMEDİ — bu bir metin DEĞERİ
// düzeltmesi, `getByRole`/sınıf/rol iddialarını etkilemez).
const { t } = useI18n({ useScope: 'global' })
const listTitle = (link: any) => {
  return link?.singleton == false ? link?.title : t(link?.fullPath)
}

const isSelectorActive = (element: any) => {
  const id = element.list ? element.selectedTabSelector.id : element.id
  return id == mySelectedTab.value?.id
}

const selectFromSwitcher = (element: any) => {
  mySelectedTab.value = element.list ? element.selectedTabSelector : element
  switcherOpen.value = false
}
const closeFromSwitcher = (element: any) => {
  closeTab(element.list ? element.selectedTabSelector : element)
}
const closeAllClosable = () => {
  const closable = tabSelectors.value.filter((el: any) => (el.list ? el.selectedTabSelector.id : el.id) !== 0)
  for (const el of closable) closeTab(el.list ? el.selectedTabSelector : el)
  switcherOpen.value = false
}

const closeTab = (tab: any) => workspace.closeTab(tab)

onMounted(async () => {
  tabStore.setOpenTabMethod(workspace.openTab)
  workspace.setDestroyHook((link: any) => {
    if (wrapperRef?.value?.destroyTab) wrapperRef.value.destroyTab(link)
  })
  workspace.attachRouter(router)
  await workspace.init()
})

// ADR-0012 Karar 5 "etkin sekme değişiminde odak çalışma alanı başlığına taşınır" — basit,
// güvenilir bir yorum: aktif sekme değiştiğinde çalışma alanı gövdesine odak taşınır
// (ekran içi başlık elemanları ekrana özgü olduğundan, T4a bu ortak kabuk noktasını taşır).
watch(mySelectedTab, () => {
  requestAnimationFrame(() => workAreaRef.value?.$el?.focus?.({ preventScroll: true }))
})

onBeforeMount(() => {
  communication.onKeydown(closeTemporaryMenu)
  eventBus.on('openTab', workspace.openTab)
})

onBeforeUnmount(() => {
  eventBus.off('openTab', workspace.openTab)
})

// ADR-0015 Karar 2.1 — kalıcı (permanent) kenar menüde "kenar-hover ile açma" KALDIRILDI (Karar
// 2.1 "mouseover/kenar-hover ile açma kaldırılır"); Escape yalnızca GEÇİCİ (temporary) sunumları
// (mobil çekmece / tablet üst katmanı) kapatır — kalıcı masaüstü/ray moduna dokunmaz.
var closeTemporaryMenu = () => {
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
/* ADR-0015 Karar 2.1 — çalışma alanı: `background` zemin, çerçeve/gölge YOK (derinlik
   kenarlıkla verilir, karta özgü gölge yalnızca gerçekten yükselen katmanlar içindir).
   ÖNEMLİ (mühendislik notu — kalıcı kenar menü hatası): `v-main` kalıcı `v-navigation-drawer`
   için `padding-left: var(--v-layout-left)` KULLANIR (Vuetify layout sistemi, margin DEĞİL).
   `position:absolute` alt öğeler bu padding'i YOK SAYAR (konumlama referansı padding KUTUSUdur,
   içerik kutusu değil) — `left:0` yazmak, öğeyi kenar menünün ÜZERİNE bindirir (tıklamaları
   yer değiştirir — Playwright "subtree intercepts pointer events"). `var(--v-layout-left)`
   CSS özel özelliği miras yoluyla buraya kadar iner; SIFIRDAN hesaplamak yerine AYNI değişkeni
   okumak kenar menü ray/tam/gizli her durumda doğru offset'i otomatik verir. */
.workplace-area {
  position: absolute;
  border: none;
  bottom: 1px;

  top: calc(var(--ek-app-topbar-height) + var(--ek-app-tabstrip-height));
  left: var(--v-layout-left, 0px);
  right: 0;
  bottom: 0;
  background-color: var(--ek-color-background);
}

.workplace-area:focus-visible {
  outline: 2px solid var(--ek-color-primary);
  outline-offset: -2px;
}

/* ADR-0015 Karar 2.1 — ince sekme şeridi: 36px, `surface-muted` zemin + alt kenarlık (klasör
   şekli/gölge/kalın kenarlık YOK — Bağlam bulgu 2). */
.workplace-tabs {
  position: absolute;
  overflow: visible;
  top: var(--ek-app-topbar-height);
  height: var(--ek-app-tabstrip-height);
  z-index: 100;
  background-color: var(--ek-color-surface-muted) !important;
  border-bottom: 1px solid var(--ek-color-border-default);
  border-radius: 0 !important;
  left: var(--v-layout-left, 0px);
  right: 0;
  display: flex;
  align-items: center;
}

.all-tabs-btn {
  color: var(--ek-color-content-muted) !important;
  margin-right: var(--ek-space-2);
}

.all-tabs-btn:hover {
  color: var(--ek-color-content-strong) !important;
}

.mobile-tab-bar {
  width: 100%;
  height: var(--ek-app-tabstrip-height);
  color: var(--ek-color-content-strong);
}

.mobile-tab-title {
  font-weight: var(--ek-font-weight-semibold);
  font-size: var(--ek-font-size-sm);
  max-width: 60vw;
}

.switcher-btn {
  color: var(--ek-color-content-muted) !important;
  min-width: 44px !important;
  min-height: 44px !important;
}

.workplace-tab-content {
  min-width: 170px;
}

.workplace-tab-title {
  font-weight: var(--ek-font-weight-medium);
  font-size: var(--ek-font-size-sm);
}

/* ADR-0012 Karar 5 — tablet "sıkı mod": kısaltılmış başlık, kapatma düğmesi hover'a bağlı DEĞİL, min. 44x44 dokunma hedefi. */
.workplace-tabs--tablet .workplace-tab-content {
  min-width: 96px;
}

.workplace-tabs--tablet .workplace-tab-title {
  max-width: 64px;
  display: inline-block;
}

.workplace-tabs--tablet .close-tab-icon {
  opacity: 1 !important;
}

.workplace-tabs--tablet :deep(.v-tab) {
  min-width: 44px !important;
  min-height: 44px !important;
}

@media (max-width: 600px) {
  .workplace-tab-content {
    min-width: 120px;
  }
}

.close-tab-icon {
  border-radius: var(--ek-radius-full);
}

.close-tab-icon:focus-visible {
  outline: 2px solid white;
  outline-offset: 1px;
}

.hide-tab-component {
  display: none !important
}


.selected-workplace-tab:hover {
  opacity: 1;
}

/* ADR-0015 Karar 2.1 — etkin sekme: `surface` zemin + üst 2px `primary` çizgi + `content-strong`
   metin. Klasör şekli/köşe yuvarlaması/gölge YOK (Bağlam bulgu 2 — bilinçli olarak kaldırıldı). */
.workplace-tab.selected-workplace-tab {
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard);
  margin-top: 0 !important;
  height: var(--ek-app-tabstrip-height) !important;
  opacity: 1 !important;
  border-radius: 0 !important;
  background-color: var(--ek-color-surface) !important;
  border-top: 2px solid var(--ek-color-primary);
  border-right: 1px solid var(--ek-color-border-default);
}

.workplace-tab {
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard);
  border-bottom: 0px;
  height: var(--ek-app-tabstrip-height) !important;
  margin-top: 0 !important;

  color: var(--ek-color-content-default);
  opacity: 1;
  border-radius: 0 !important;
  border-right: 1px solid var(--ek-color-border-default);
  padding: 0 8px;
}

.workplace-tab:hover {
  background-color: var(--ek-color-surface);
}

.transitionClass {
  transition: all var(--ek-duration-fast) ease-in;
}



.nav-action-btn {
  color: var(--ek-color-content-muted) !important;
  width: 28px !important;
  height: 28px !important;
  margin: 0 2px;
  transition: background-color var(--ek-duration-base) var(--ek-easing-standard), color var(--ek-duration-base) var(--ek-easing-standard) !important;
  text-transform: none !important;
  letter-spacing: normal !important;
}

.nav-action-btn:hover {
  color: var(--ek-color-content-strong) !important;
  background-color: var(--ek-color-surface-sunken) !important;
}

/* Premium V-Tabs Navigation Style */
:deep(.v-slide-group__prev),
:deep(.v-slide-group__next) {
  min-width: 32px;
  background: transparent;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.v-slide-group__prev--disabled),
:deep(.v-slide-group__next--disabled) {
  opacity: 0 !important;
  pointer-events: none;
}

:deep(.v-slide-group__prev .v-btn),
:deep(.v-slide-group__next .v-btn) {
  color: var(--ek-color-content-muted) !important;
  background: var(--ek-color-surface) !important;
  border-radius: var(--ek-radius-full) !important;
  width: 24px !important;
  height: 24px !important;
  font-size: 10px !important;
  border: 1px solid var(--ek-color-border-default) !important;
}

:deep(.v-slide-group__content) {
  transition: transform var(--ek-duration-slow) var(--ek-easing-standard) !important;
}
</style>
