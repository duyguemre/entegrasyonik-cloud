/**
 * Backoffice Otopilot yan panel tercihi (CHAT_UI_CONTRACT §7.2): YALNIZ `{ open, width }`, `bo:` önekli anahtarda
 * (`bo:chat:<yönetici sub>`). Müşteri uygulamasıyla depolama PAYLAŞILMAZ (web `ek:chat:<u>:<t>`; test korur).
 * Konuşma metni, sağlayıcı anahtarı, oturum/token ASLA yazılmaz (K38). Backoffice'te depoya yazan TEK dosya budur
 * (static.test.ts istisnası).
 */
export const BO_CHAT_PREFIX = 'bo:chat:'
export const BO_CHAT_WIDTH = { min: 360, max: 560, default: 400, step: 16 } as const
/** ≥ 1280 px itme, altında üstüne binme (scrim yok), < 768 px yalnız tam sayfa — web yerleşimiyle aynı eşikler. */
export const BO_CHAT_PUSH_MIN = 1280

export interface ChatPrefs {
  open: boolean
  width: number
}

export function clampWidth(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return BO_CHAT_WIDTH.default
  return Math.min(BO_CHAT_WIDTH.max, Math.max(BO_CHAT_WIDTH.min, Math.round(n)))
}

export function prefsKey(sub: string | null | undefined): string | null {
  return sub ? `${BO_CHAT_PREFIX}${sub}` : null
}

export function readPrefs(key: string | null, storage: Pick<Storage, 'getItem'> | null = safeStorage()): ChatPrefs {
  const fallback = { open: false, width: BO_CHAT_WIDTH.default }
  if (!key || !storage) return fallback
  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<ChatPrefs>
    return { open: p.open === true, width: clampWidth(p.width) }
  } catch {
    return fallback
  }
}

export function writePrefs(key: string | null, prefs: ChatPrefs, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  if (!key || !storage) return
  try {
    storage.setItem(key, JSON.stringify({ open: prefs.open === true, width: clampWidth(prefs.width) }))
  } catch {
    /* gizli pencere / kapalı depolama: tercih yalnız bu oturumda */
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}
