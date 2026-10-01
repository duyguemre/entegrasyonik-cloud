/**
 * Backoffice sohbet taşıyıcısı (CHAT_UI_CONTRACT §3.1): `sse` → `<ADMIN_API_BASE>/agent` (çerez `EK_ADMIN`; müşteri
 * `/api/agent` ile karışmaz). Sahte /admin-api açıkken (yalnız DEV) ya da `VITE_CHAT_TRANSPORT=mock` iken senaryolu mock;
 * Playwright `window.__BO_CHAT_MOCK__ = { config, speed }` ile yapılandırır (bayraksız otomasyonda kapalı) (web'in `__EK_CHAT_MOCK__` bayrağından AYRI).
 * Gerçek uçta kurulum yazmaları gerekçe (`setupReason`) + step-up (`requestReauth`) ister (BR-4).
 * Mock tembel yüklenir: üretim paketine girmez.
 */
import { createSseTransport } from '@entegrasyonik/chat/transports/sse'
import { clientPlatformHeaders } from '@entegrasyonik/ui/platform'
import type { MockConfigId } from '@entegrasyonik/chat/transports/mock'
import type { ChatTransport } from '@entegrasyonik/chat'
import type { AgentInfo } from '@entegrasyonik/chat/protocol'
import { ADMIN_API_BASE, USE_MOCK } from '@bo/api'
import { requestReauth } from '@bo/auth/reauth'
import { takeReasonForSetup } from './setupReason'

export interface BoChatMockFlag {
  config?: MockConfigId
  speed?: number
}

export function agentBaseUrl(base = ADMIN_API_BASE): string {
  return `${base.replace(/\/+$/, '')}/agent`
}

/**
 * v1: backoffice sohbetinde yazma aracı YOK (ADR-0034 "sonra" sepeti) → `readOnly` her zaman true (rozet). Sunucu
 * yanıtı ne derse desin istemci yazma önermez; güvenlik kararı yine sunucudadır.
 */
export function withReadOnly(t: ChatTransport): ChatTransport {
  return { ...t, kind: t.kind, info: async (signal?: AbortSignal): Promise<AgentInfo> => ({ ...(await t.info(signal)), readOnly: true }) }
}

function lazyMock(flag: BoChatMockFlag): ChatTransport {
  let loaded: Promise<ChatTransport> | null = null
  const get = () => (loaded ??= import('@entegrasyonik/chat/transports/mock').then((m) => m.createMockTransport({ config: flag.config ?? 'enabled', speed: flag.speed ?? 1 })))
  const stream =
    <A extends unknown[]>(pick: (t: ChatTransport) => (...args: A) => AsyncIterable<any>) =>
    (...args: A) => ({
      async *[Symbol.asyncIterator]() {
        yield* pick(await get())(...args)
      },
    })
  return {
    kind: 'mock',
    info: async (signal) => (await get()).info(signal),
    sendTurn: stream((t) => t.sendTurn.bind(t)),
    confirm: stream((t) => t.confirm.bind(t)),
    more: async (req, signal) => (await get()).more(req, signal),
    reset: async (id) => (await get()).reset(id),
    setup: {
      status: async (signal) => (await get()).setup.status(signal),
      save: async (req) => (await get()).setup.save(req),
      test: async (req) => (await get()).setup.test(req),
      remove: async () => (await get()).setup.remove(),
      consent: async (req) => (await get()).setup.consent(req),
    },
  }
}

function devFlag(): BoChatMockFlag | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  const flag = (window as unknown as { __BO_CHAT_MOCK__?: BoChatMockFlag }).__BO_CHAT_MOCK__
  if (flag) return flag
  // Otomasyon altında (Playwright) bayrak yoksa sohbet KAPALI: mevcut ekran specleri ve görsel tabanlar değişmez;
  // sohbet specleri `__BO_CHAT_MOCK__` ile açar (web e2e varsayılanıyla aynı: agent/info = DISABLED).
  if (navigator.webdriver) return { config: 'unavailable' }
  return null
}

export function createBoChatTransport(locale: () => 'tr' | 'en'): ChatTransport {
  const flag = devFlag()
  if (flag || USE_MOCK || import.meta.env.VITE_CHAT_TRANSPORT === 'mock' || import.meta.env.VITE_CHAT_MOCK === '1') return withReadOnly(lazyMock(flag ?? {}))
  return withReadOnly(createSseTransport({ baseUrl: agentBaseUrl(), locale, headers: clientPlatformHeaders(), setupWriteExtras: takeReasonForSetup, reauth: requestReauth }))
}
