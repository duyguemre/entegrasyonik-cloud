/**
 * frontend/src/stores/sidebar.ts
 *
 * ADR-0015 Karar 2.1 — kalıcı/daraltılabilir sol kenar menüsü. Bu store
 * yalnızca SUNUM tercihini tutar (PII yok, `plugins/i18n.ts`'in `localStorage`
 * deseniyle AYNI): masaüstünde kullanıcının "ray" (64px) mi "tam" (248px) mi
 * istediği (`ek.ui.v1.sidebar`) ve tablette geçici "üst katman" (temporary
 * tam-genişlik) açık mı.
 *
 * ADR-0012 `workspace.ts`'teki sekme durumuna KARIŞMAZ — bu store yalnızca
 * kenar menünün GENİŞLİĞİ/görünürlüğü ile ilgilidir, ekran/sekme açma
 * mantığı `eventBus 'openTab'` üzerinden AYNEN sürer.
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { registerStoreReset } from '@/stores/resetRegistry'

const STORAGE_KEY = 'ek.ui.v1.sidebar'

function readPersistedRail(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'rail'
  } catch {
    return false
  }
}

function writePersistedRail(rail: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, rail ? 'rail' : 'expanded')
  } catch {
    // localStorage kullanılamıyorsa (gizli sekme kotası vb.) sessizce yok say — yalnızca
    // tercih kalıcılığı kaybolur, işlevsellik etkilenmez.
  }
}

export const useSidebarStore = defineStore('sidebar', () => {
  /** Masaüstünde kullanıcı tercihi: true = ray (64px), false = tam (248px, varsayılan). */
  const desktopRail = ref(readPersistedRail())
  /** Tablette "üst katman" (temporary tam-genişlik NavigationMenu) açık mı — kalıcı DEĞİL. */
  const tabletOverlayOpen = ref(false)
  /** Mobilde çekmece açık mı (mevcut `menuStore.leftMenu` ile AYNI role, ayrı bir kopyası — kenar
   * menü artık `menuStore`'dan bağımsız kendi görünürlük durumunu yönetiyor). */
  const mobileDrawerOpen = ref(false)

  function toggleDesktopRail() {
    desktopRail.value = !desktopRail.value
    writePersistedRail(desktopRail.value)
  }

  function openTabletOverlay() {
    tabletOverlayOpen.value = true
  }
  function closeTabletOverlay() {
    tabletOverlayOpen.value = false
  }

  function openMobileDrawer() {
    mobileDrawerOpen.value = true
  }
  function closeMobileDrawer() {
    mobileDrawerOpen.value = false
  }

  // Oturum kapanışında yalnızca GEÇİCİ (temporary) görünürlük sıfırlanır — `desktopRail`
  // kullanıcı TERCİHİDİR (i18n `lang` gibi), oturumdan bağımsız kalıcıdır, oturum kapanışında
  // SIFIRLANMAZ.
  registerStoreReset('sidebar', () => {
    tabletOverlayOpen.value = false
    mobileDrawerOpen.value = false
  })

  return {
    desktopRail,
    tabletOverlayOpen,
    mobileDrawerOpen,
    toggleDesktopRail,
    openTabletOverlay,
    closeTabletOverlay,
    openMobileDrawer,
    closeMobileDrawer,
  }
})
