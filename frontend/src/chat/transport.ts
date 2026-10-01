/**
 * frontend/src/chat/transport.ts — taşıyıcı seçimi (CHAT_UI_CONTRACT §3.1–3.2).
 *  - Varsayılan: `sse` → `<VITE_API_BASE_URL>/agent` (çerezle; Electron aynı derlemeyi yüklediği için aynı taşıyıcı, K36).
 *  - `VITE_CHAT_TRANSPORT=mock` ya da `VITE_CHAT_MOCK=1` → senaryolu mock (yalnız AÇIK bayrakla; dev/demo/testler).
 *  - YALNIZ geliştirmede (`import.meta.env.DEV`): `window.__EK_CHAT_MOCK__ = { config, speed }` (Playwright init script)
 *    ya da `localStorage['ek-chat-mock'] = '<config>'` (elle inceleme) mock'u yapılandırır. Üretim derlemesinde bu dal elenir.
 */
import { createSseTransport } from '@entegrasyonik/chat/transports/sse'
import { clientPlatformHeaders } from '@entegrasyonik/ui/platform'
import type { MockConfigId } from '@entegrasyonik/chat/transports/mock'
import type { ChatTransport } from '@entegrasyonik/chat'
import { apiBaseUrl } from '@/config/env'

const MOCK_CONFIGS: readonly string[] = ['enabled', 'unavailable', 'maintenance', 'setup-required', 'setup-no-permission', 'consent-pending-owner', 'consent-pending-admin', 'read-only']

/**
 * Mock taşıyıcı (senaryolar + sentetik veri) üretim paketine girmesin diye TEMBEL yüklenir: ilk çağrıda modül gelir,
 * arayüz aynıdır. (sse taşıyıcısı küçük ve her ortamda gerekli olduğundan doğrudan içe aktarılır.)
 */
function lazyMockTransport(flag: ChatMockFlag): ChatTransport {
  let loaded: Promise<ChatTransport> | null = null
  const get = () =>
    (loaded ??= import('@entegrasyonik/chat/transports/mock').then((m) => m.createMockTransport({ config: flag.config ?? 'enabled', speed: flag.speed ?? 1 })))
  const stream = <A extends unknown[]>(pick: (t: ChatTransport) => (...args: A) => AsyncIterable<any>) =>
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

export interface ChatMockFlag {
  config?: MockConfigId
  speed?: number
}

function devMockFlag(): ChatMockFlag | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null
  const flag = (window as unknown as { __EK_CHAT_MOCK__?: ChatMockFlag }).__EK_CHAT_MOCK__
  if (flag) return flag
  try {
    const stored = window.localStorage.getItem('ek-chat-mock')
    if (stored && MOCK_CONFIGS.includes(stored)) return { config: stored as MockConfigId }
  } catch {
    /* depolama kapalı */
  }
  return null
}

export function createAppChatTransport(locale: () => 'tr' | 'en'): ChatTransport {
  const flag = devMockFlag()
  if (flag || import.meta.env.VITE_CHAT_TRANSPORT === 'mock' || import.meta.env.VITE_CHAT_MOCK === '1') return lazyMockTransport(flag ?? {})
  return createSseTransport({ baseUrl: `${apiBaseUrl.replace(/\/+$/, '')}/agent`, locale, headers: clientPlatformHeaders() })   // MOB-08
}
