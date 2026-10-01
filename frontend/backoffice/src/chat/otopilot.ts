/**
 * Backoffice Otopilot'un TEK örneği (CHAT_UI_CONTRACT §7.2). Müşteri uygulamasından tamamen ayrı: ayrı taşıyıcı
 * (`/admin-api/agent`), ayrı host (backoffice rotaları), ayrı depolama öneki (`bo:`), ayrı mock bayrağı.
 * Konuşma sayfa değişiminde sürer; çıkışta ya da farklı yönetici oturumunda denetleyici atılıp yenisi kurulur.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { createChatController, type ChatController } from '@entegrasyonik/chat/controller'
import type { ChatTelemetryEvent } from '@entegrasyonik/chat'
import { router } from '@bo/router'
import { session } from '@bo/auth/session'
import { screenByPath } from '@bo/navigation/screens'
import { BO_CHAT_SCREEN, createBoChatHost } from './boChatHost'
import { createBoChatTransport } from './transport'
import { clampWidth, prefsKey, readPrefs, writePrefs } from './prefs'

type Via = Extract<ChatTelemetryEvent, { name: 'chat.open' }>['via']

const host = createBoChatHost(router)
const build = () => createChatController({ transport: createBoChatTransport(() => 'tr'), host })

const controller = shallowRef<ChatController>(build())
const key = computed(() => prefsKey(session.state.user?.sub))
const initial = readPrefs(key.value)
const panelOpen = ref(initial.open)
const width = ref(initial.width)
let returnFocus: HTMLElement | null = null

const info = computed(() => controller.value.info.value)
/** Giriş noktaları: info gelmeden ve DISABLED'da gizli; SETUP_REQUIRED/MAINTENANCE görünür (§3.3). */
const available = computed(() => !!info.value && (info.value.enabled || info.value.reason !== 'DISABLED'))
const onPage = computed(() => router.currentRoute.value.path === `/${BO_CHAT_SCREEN}`)

function persist() {
  writePrefs(key.value, { open: panelOpen.value, width: width.value })
}

// Oturum kapsamı değişti (çıkış / başka yönetici): konuşma sıfırlanır, tercih yeni anahtardan okunur.
watch(key, (next, prev) => {
  if (next === prev) return
  void controller.value.reset()
  controller.value.dispose()
  controller.value = build()
  const p = readPrefs(next)
  panelOpen.value = next ? p.open : false
  width.value = p.width
})

// Sayfa bağlamı çipi: yalnız kayıtlı ekran anahtarı (+ müşteri detayında tid). Serbest metin/PII yok.
watch(
  () => router.currentRoute.value.path,
  (path) => {
    if (path === `/${BO_CHAT_SCREEN}`) return
    const screen = screenByPath(path)
    const tid = /^\/musteriler\/(\d+)/.exec(path)?.[1]
    if (!screen) return controller.value.setContext(null)
    controller.value.setContext(
      tid ? { screen: 'tenant', entity: { type: 'tenant', id: tid } } : { screen: screen.key },
      tid ? `Müşteri #${tid}` : screen.label,
    )
  },
  { immediate: true },
)

const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768

function rememberFocus() {
  const el = document.activeElement as HTMLElement | null
  if (el && el !== document.body && !el.closest('.bo-otopilot-dock')) returnFocus = el
}

function openPage() {
  panelOpen.value = false
  persist()
  void router.push(`/${BO_CHAT_SCREEN}`)
}

function sendWhenReady(text: string) {
  const c = controller.value
  if (c.send(text)) return
  const stop = watch(
    () => c.status.value,
    (s) => {
      if (s === 'idle' || s === 'error') {
        c.send(text)
        stop()
      } else if (s !== 'loading') stop()
    },
  )
}

function open(options: { via?: Via; text?: string } = {}) {
  host.track?.({ name: 'chat.open', via: options.via ?? 'button' })
  void controller.value.ensureLoaded()
  if (isMobile() || onPage.value) openPage()
  else {
    rememberFocus()
    panelOpen.value = true
    persist()
  }
  if (options.text) sendWhenReady(options.text)
}

function close() {
  panelOpen.value = false
  persist()
  const target = returnFocus
  returnFocus = null
  if (target && document.contains(target)) requestAnimationFrame(() => target.focus({ preventScroll: true }))
}

function toggle(via: Via = 'button') {
  if (onPage.value) return
  if (panelOpen.value && !isMobile()) close()
  else open({ via })
}

function collapseToSide() {
  panelOpen.value = true
  persist()
  router.back()
}

export const otopilot = {
  controller: () => controller.value,
  controllerRef: controller,
  info,
  available,
  panelOpen,
  width,
  onPage,
  init: () => void controller.value.ensureLoaded(),
  open,
  close,
  toggle,
  openPage,
  collapseToSide,
  setWidth(value: number) {
    width.value = clampWidth(value)
    persist()
  },
}
