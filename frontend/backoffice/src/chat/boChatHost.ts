/**
 * Backoffice `ChatHost` (CHAT_UI_CONTRACT §2, §7.2): bağlantılar YALNIZ backoffice ekran kaydından (screens.ts) çözülür —
 * müşteri uygulaması rotası üretilmez. Varlıklar: tenant → müşteri detayı, platformJob → başarısız işler, logEvent → log
 * merkezi (istek kimliği). Telemetri: yalnız olay adı + sayısal alan (metin/PII yok; backoffice'te konsola yazılmaz).
 */
import type { Router } from 'vue-router'
import type { ChatHost } from '@entegrasyonik/chat'
import type { AppLink, EntityRef } from '@entegrasyonik/chat/protocol'
import { SCREENS, screenByKey } from '@bo/navigation/screens'
import { SUB_STATUS, TENANT_STATUS } from '@bo/utils/labels'

export const BO_CHAT_SCREEN = 'otopilot'
export const BO_CHAT_SETTINGS_SCREEN = 'otopilot-settings'
/** Sanal ekran anahtarı: müşteri detayı (DETAIL_ROUTES; menüde yok). */
const TENANT_DETAIL = 'tenant'
const SAFE_PARAM = /^[A-Za-z0-9:_.-]{1,128}$/

export function resolveBoLink(link: AppLink): { path: string; query: Record<string, string> } | null {
  const params = Object.fromEntries(Object.entries(link.params ?? {}).filter(([, v]) => SAFE_PARAM.test(v)))
  if (link.screen === TENANT_DETAIL) {
    const tid = Number(params.tid)
    return Number.isInteger(tid) && tid > 0 ? { path: `/musteriler/${tid}`, query: {} } : null
  }
  const screen = screenByKey(link.screen)
  if (!screen || screen.status === 'planned') return null
  return { path: screen.path, query: params }
}

export function boLinkForEntity(entity: EntityRef): AppLink | null {
  if (entity.type === 'tenant' && /^\d{1,10}$/.test(entity.id)) return { screen: TENANT_DETAIL, params: { tid: entity.id } }
  if (entity.type === 'platformJob') return { screen: 'engine', params: { sekme: 'basarisiz' } }
  if (entity.type === 'logEvent' && SAFE_PARAM.test(entity.id)) return { screen: 'logs', params: { reqId: entity.id } }
  return null
}

export function createBoChatHost(router: Router): ChatHost {
  return {
    surface: 'backoffice',
    locale: () => 'tr',
    formatDefaults: () => ({ currency: 'TRY', timeZone: 'Europe/Istanbul' }),
    resolveLink(link) {
      const target = resolveBoLink(link)
      if (!target) return null
      const href = router.resolve(target).href
      return { href, open: () => void router.push(target).catch(() => undefined) }
    },
    linkForEntity: boLinkForEntity,
    status(domain, value) {
      if (domain === 'subscription' && value in SUB_STATUS) return SUB_STATUS[value as keyof typeof SUB_STATUS]
      if (domain === 'tenant' && value in TENANT_STATUS) return TENANT_STATUS[value as keyof typeof TENANT_STATUS]
      return null
    },
    settingsLink: () => (SCREENS.some((s) => s.key === BO_CHAT_SETTINGS_SCREEN) ? { screen: BO_CHAT_SETTINGS_SCREEN } : null),
    onUnauthenticated() {
      void router.replace({ path: '/giris' }).catch(() => undefined)
    },
  }
}
