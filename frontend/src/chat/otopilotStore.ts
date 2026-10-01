/**
 * frontend/src/chat/otopilotStore.ts — Otopilot'un uygulama düzeyindeki TEK örneği (CHAT_UI_CONTRACT §7.1).
 *
 *  - Konuşma durumu (`@entegrasyonik/chat` denetleyicisi) tek örnek: sekme/sayfa değişiminde korunur; çıkış
 *    (`resetAllStores`), tenant değişimi ve impersonation başlangıç/bitişi (oturum kapsamı `userId:tenantId` değişir)
 *    denetleyiciyi atıp YENİSİNİ kurar (sunucudaki 60 dk belleği de `reset` ile bırakılır).
 *  - Yan panel sunum tercihleri (açık/kapalı, genişlik) `localStorage`'da kullanıcı+tenant anahtarıyla (`ek:chat:<u>:<t>`);
 *    YALNIZ bu iki değer — konuşma metni/anahtar ASLA yazılmaz (K38: konuşma kaydı saklanmaz).
 *  - Giriş noktalarının görünürlüğü `AgentInfo`'dan: DISABLED → gizli; SETUP_REQUIRED/MAINTENANCE → görünür (§3.3).
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { createChatController, type ChatController } from '@entegrasyonik/chat/controller'
import type { ChatTelemetryEvent } from '@entegrasyonik/chat'
import router from '@/router'
import setupI18n from '@/plugins/i18n'
import useUser from '@/composables/user'
import { useMenuStore } from '@/stores/site/menu'
import { useWorkspaceStore } from '@/stores/workspace'
import { registerStoreReset } from '@/stores/resetRegistry'
import { resolveMenuTitle } from '@/navigation/menuTitle'
import { createAppChatTransport } from './transport'
import { createWebChatHost } from './webChatHost'
import { pageContextFor } from './pageContext'
import { CHAT_SCREEN_KEY, chatPageLink, chatSettingsLink } from './chatLinks'
import { clampWidth, OTOPILOT_WIDTH, prefsKey } from './placement'

export { OTOPILOT_PUSH_MIN, OTOPILOT_WIDTH } from './placement'

interface Prefs {
  open: boolean
  width: number
}

function readPrefs(key: string | null): Prefs {
  const fallback = { open: false, width: OTOPILOT_WIDTH.default }
  if (!key) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<Prefs>
    return { open: parsed.open === true, width: clampWidth(parsed.width) }
  } catch {
    return fallback
  }
}

function writePrefs(key: string | null, prefs: Prefs) {
  if (!key) return
  try {
    window.localStorage.setItem(key, JSON.stringify({ open: prefs.open, width: prefs.width }))
  } catch {
    /* gizli pencere / kapalı depolama: tercih yalnız bu oturumda */
  }
}

export const useOtopilotStore = defineStore('otopilot', () => {
  const i18n = setupI18n()
  const user = useUser()
  const menuStore = useMenuStore()
  const workspace = useWorkspaceStore()
  const locale = () => String(i18n.global.locale.value ?? 'tr')

  const host = createWebChatHost({
    router,
    locale,
    translate: (key) => String(i18n.global.t(key)),
    menu: () => menuStore.getMenu?.(),
    canManageSettings: () => !!user.isTenantAdmin?.(),
  })

  function build(): ChatController {
    return createChatController({ transport: createAppChatTransport(() => (locale() === 'en' ? 'en' : 'tr')), host })
  }

  const controller = shallowRef<ChatController>(build())
  const scope = computed(() => user.getSessionScope.value)
  const storageKey = computed(() => prefsKey(scope.value))
  const initial = readPrefs(storageKey.value)
  const panelOpen = ref(initial.open)
  const width = ref(initial.width)
  /** Paneli açan öğe: kapanınca odak ona döner (§8). */
  let returnFocus: HTMLElement | null = null

  const info = computed(() => controller.value.info.value)
  /** Giriş noktaları: info gelmeden ve DISABLED'da gizli. */
  const available = computed(() => {
    const value = info.value
    if (!value) return false
    return value.enabled || value.reason !== 'DISABLED'
  })
  const onPage = computed(() => workspace.mySelectedTab?.link?.code === CHAT_SCREEN_KEY)

  function persist() {
    writePrefs(storageKey.value, { open: panelOpen.value, width: width.value })
  }

  function replaceController() {
    controller.value.dispose()
    controller.value = build()
    void controller.value.ensureLoaded()
  }

  // Tenant değişimi / impersonation / farklı kullanıcı: konuşma sıfırlanır, tercihler yeni kapsamdan okunur.
  watch(storageKey, (next, prev) => {
    if (next === prev) return
    void controller.value.reset()
    replaceController()
    const prefs = readPrefs(next)
    panelOpen.value = prefs.open
    width.value = prefs.width
  })

  // Sayfa bağlamı çipi: etkin sekme değişince güncellenir (kullanıcı kaldırdıysa yeni sayfada yeniden gelir).
  watch(
    () => workspace.mySelectedTab?.link,
    (link) => {
      if (!link || link.code === CHAT_SCREEN_KEY) return
      // Sekme başlığıyla AYNI çözüm (kabuk `resolveMenuTitle`): ham anahtar gösterilmez.
      const title = resolveMenuTitle(link, (k: string) => String(i18n.global.t(k)), (k: string) => !!i18n.global.te(k))
      const ctx = pageContextFor(link, title)
      controller.value.setContext(ctx?.value ?? null, ctx?.label)
    },
    { immediate: true },
  )

  function track(via: Extract<ChatTelemetryEvent, { name: 'chat.open' }>['via']) {
    host.track?.({ name: 'chat.open', via })
  }

  function rememberFocus() {
    const active = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
    if (active && !active.closest('.ek-otopilot-dock') && active !== document.body) returnFocus = active
  }

  function isMobile() {
    return typeof window !== 'undefined' && window.innerWidth < 768
  }

  /** Paneli açar (mobilde tam sayfa). `text` verilirse gönderilir (palet "sor"). */
  function open(options: { via?: Extract<ChatTelemetryEvent, { name: 'chat.open' }>['via']; text?: string } = {}) {
    track(options.via ?? 'button')
    void controller.value.ensureLoaded()
    if (isMobile() || onPage.value) openPage()
    else {
      rememberFocus()
      panelOpen.value = true
      persist()
    }
    if (options.text) sendWhenReady(options.text)
  }

  function sendWhenReady(text: string) {
    const c = controller.value
    if (c.send(text)) return
    // info henüz gelmediyse (loading) hazır olunca bir kez dene.
    const stop = watch(
      () => c.status.value,
      (status) => {
        if (status === 'idle' || status === 'error') {
          c.send(text)
          stop()
        } else if (status !== 'loading') stop()
      },
    )
  }

  function close() {
    panelOpen.value = false
    persist()
    const target = returnFocus
    returnFocus = null
    if (target && document.contains(target)) requestAnimationFrame(() => target.focus({ preventScroll: true }))
  }

  function toggle(via: 'button' | 'shortcut' = 'button') {
    if (onPage.value) return
    if (panelOpen.value && !isMobile()) close()
    else open({ via })
  }

  /** Tam sayfa: aynı denetleyici → aynı konuşma sürer; yan panel kapanır. */
  function openPage() {
    panelOpen.value = false
    persist()
    workspace.openTab(chatPageLink(menuStore))
  }

  /** Tam sayfadan yan panele: sayfa sekmesi kapanır, panel açılır. */
  function collapseToSide() {
    const tab = workspace.tabs.find((t: any) => t.link?.code === CHAT_SCREEN_KEY)
    if (tab) workspace.closeTab(tab)
    panelOpen.value = true
    persist()
  }

  function openSettings() {
    workspace.openTab(chatSettingsLink(menuStore, controller.value.t('entry.settingsTitle')))
  }

  function setWidth(value: number) {
    width.value = clampWidth(value)
    persist()
  }

  function init() {
    void controller.value.ensureLoaded()
  }

  registerStoreReset('otopilot', () => {
    void controller.value.reset()
    replaceController()
    panelOpen.value = false
  })

  /** Ham denetleyici (Pinia'nın ref açma tipinden bağımsız; şablonlar bunu kullanır). Reaktif: shallowRef okunur. */
  const getController = (): ChatController => controller.value

  return { controller, getController, host, info, available, panelOpen, width, onPage, init, open, close, toggle, openPage, collapseToSide, openSettings, setWidth }
})
