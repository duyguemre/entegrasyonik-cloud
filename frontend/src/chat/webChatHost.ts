/**
 * frontend/src/chat/webChatHost.ts — web uygulamasının `ChatHost`'u (CHAT_UI_CONTRACT §2). Uygulama farkları yalnız burada:
 * bağlantı çözümü (`screens.ts` + menü erişimi), dil, durum çipi eşlemesi (`design/status-map.ts`), telemetri (logger,
 * ADR-0017 — metin/PII YOK), oturum akışı. Paket `@/`'yi hiç görmez.
 */
import type { Router } from 'vue-router'
import type { ChatHost } from '@entegrasyonik/chat'
import type { AppLink } from '@entegrasyonik/chat/protocol'
import { buildScreenPath, pickUrlParams, resolveScreenByKey, screenKeyForLink } from '@/navigation/screens'
import { CLAIM_STATUS_TONE, ORDER_STATUS_TONE } from '@/design/status-map'
import logger from '@/composables/logger'
import { CHAT_SETTINGS_SCREEN_KEY, isChatClientScreen } from './chatLinks'
import { HELP_SCREEN_KEY } from '@/help/helpLink'

export interface WebChatHostDeps {
  router: Router
  locale: () => string
  translate: (key: string) => string
  /** Menü ağacı (erişim ipucu): kayıtlı ama menüde olmayan ekran bağlantısı çizilmez. */
  menu: () => unknown
  canManageSettings: () => boolean
}

function menuHasKey(menu: unknown, key: string): boolean {
  if (!Array.isArray(menu)) return false
  const walk = (links: any[] | undefined): boolean => (links ?? []).some((l) => (l && screenKeyForLink(l) === key) || walk(l?.children))
  return menu.some((group: any) => walk(group?.links))
}

const STATUS_DOMAINS: Record<string, Record<string, { tone: any; labelKey: string }>> = {
  order: ORDER_STATUS_TONE,
  claim: CLAIM_STATUS_TONE,
}

export function createWebChatHost(deps: WebChatHostDeps): ChatHost {
  return {
    surface: 'app',
    locale: () => (deps.locale() === 'en' ? 'en' : 'tr'),
    formatDefaults: () => ({ currency: 'TRY', timeZone: 'Europe/Istanbul' }),
    resolveLink(link: AppLink) {
      const screen = resolveScreenByKey(link.screen)
      if (!screen) return null
      const clientScreen = isChatClientScreen(link.screen) || link.screen === HELP_SCREEN_KEY
      if (!clientScreen && !menuHasKey(deps.menu(), link.screen)) return null
      if (link.screen === CHAT_SETTINGS_SCREEN_KEY && !deps.canManageSettings()) return null
      const instanceId = screen.instanceParam ? link.params?.[screen.instanceParam] : undefined
      const path = buildScreenPath(screen, instanceId)
      const query = pickUrlParams(screen, link.params)
      const href = deps.router.resolve({ path, query }).href
      return { href, open: () => void deps.router.push({ path, query }).catch(() => undefined) }
    },
    status(domain, value) {
      const entry = STATUS_DOMAINS[domain]?.[value]
      if (!entry) return null
      const label = deps.translate(entry.labelKey)
      return { tone: entry.tone, label: label && label !== entry.labelKey ? label : value }
    },
    settingsLink: () => (deps.canManageSettings() ? { screen: CHAT_SETTINGS_SCREEN_KEY } : null),
    track(event) {
      // Yalnız olay adı + sayısal/kapalı alanlar (ChatTelemetryEvent tipinde metin alanı yoktur).
      logger.debug(`[otopilot] ${event.name}`, { ...event })
    },
    onUnauthenticated() {
      const current = deps.router.currentRoute.value.fullPath
      void deps.router.replace({ path: '/login', query: { redirect: current } }).catch(() => undefined)
    },
  }
}
