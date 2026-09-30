/**
 * frontend/src/composables/useNotificationStream.ts
 *
 * C2b (ADR-0029 Karar 6, NOTIFICATION_PLAN F-N3) — bildirim zili için SSE istemcisi.
 * Sözleşme: docs/cloud-contracts/README.md "NB6 — gerçekleşen SSE sözleşmesi" (plandan farkları O geçerli):
 *
 *   GET /api/notifications/stream (çerez oturumu, `withCredentials`) · açılışta `retry: 5000` + `: connected`,
 *   25 sn'de `: ping` (yorum satırı; olay üretmez).
 *   event: notification   data {id, category, severity, unreadCount}  — başlık/metin YOK; unreadCount null olabilir
 *   event: resync         data {}                                     — tam tazele
 *   event: shutdown | reconnect                                       — tarayıcı kendisi yeniden bağlanır (normal)
 *   event: unauthorized                                               — kapat, yeniden BAĞLANMA; oturum akışına bırak
 *   HTTP 401/403/503 (+Retry-After)                                   — EventSource CLOSED → polling'e düş
 *
 * Katmanlar:
 *   - `handleStreamEvent` / `modeAfterError` / `retryDelay` — SAF (vitest: tests/notification-stream.test.ts).
 *   - `createNotificationStream` — EventSource + zamanlayıcı + görünürlük yaşam döngüsü (enjekte edilebilir).
 *   - `useNotificationStream` — etkin bir kapsamda (bileşen `setup` ya da Pinia setup store) çağrılırsa kapsam
 *     kapanınca (onUnmounted / store dispose) bağlantıyı ve tüm zamanlayıcıları temizler.
 *
 * Kullanıcı başına 5 bağlantı tavanı (çok sekme) — seçilen yol: GİZLİ SEKMEDE KAPAT.
 *   Sekme `HIDDEN_CLOSE_MS` (60 sn) gizli kalırsa bağlantı kapanır, görünür olunca yeniden açılır ve sayım tazelenir.
 *   Gerekçe: tek sekme lideri (BroadcastChannel/Web Locks) seçimi daha çok parça (lider devri, Electron penceresi,
 *   Safari desteği, liderin gizli olması) getirir; kullanıcının aynı anda GÖRÜNÜR sekme sayısı pratikte 1-2'dir,
 *   gizli sekmeler zaten rozet göstermez. 60 sn eşiği hızlı sekme geçişlerinde bağlantı çalkantısını önler.
 *   Tavan yine aşılırsa sunucu 503 döner → o sekme polling'e düşer (işlev kaybı yok, yalnız gecikme).
 *
 * Polling YALNIZ SSE yokken çalışır (mod `polling`); bağlıyken (`live`) yoklama yapılmaz.
 */
import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'
import { apiBaseUrl } from '@/config/env'

/** Bağlantı durumu. `polling` = SSE yok, rozet yoklaması çalışmalı. */
export type StreamMode = 'idle' | 'connecting' | 'live' | 'reconnecting' | 'polling' | 'paused' | 'stopped'

/** Sunucu olayı (EventSource `MessageEvent`'inin ihtiyaç duyulan kısmı). */
export interface StreamEventInput {
  type: string
  data?: string
  lastEventId?: string
}

/** Olay işleyicisinin ürettiği yan etkiler — store bunları uygular. */
export type StreamEffect =
  | { kind: 'setUnread'; count: number }
  | { kind: 'countUnread' }
  | { kind: 'fetchNew'; id?: string; category?: string; severity?: string }
  | { kind: 'critical'; id?: string; category?: string }
  | { kind: 'resync' }
  | { kind: 'expectReconnect' }
  | { kind: 'unauthorized' }

/** Sözleşmedeki adlandırılmış olaylar (dinleyici kaydı buradan). */
export const STREAM_EVENTS = ['notification', 'resync', 'shutdown', 'reconnect', 'unauthorized'] as const

/** Sunucu `retry: 5000` ile aynı taban; üstel geri çekilme tavanı 60 sn (503/Retry-After ile uyumlu). */
export const RETRY_BASE_MS = 5_000
export const RETRY_MAX_MS = 60_000
/** Tarayıcının kendi yeniden bağlanması bu süre içinde açılmazsa polling'e düşülür. */
export const RECONNECT_GRACE_MS = 15_000
/** Sekme bu kadar gizli kalırsa bağlantı kapanır (kullanıcı başına 5 bağlantı tavanı). */
export const HIDDEN_CLOSE_MS = 60_000

const EVENTSOURCE_CONNECTING = 0
const EVENTSOURCE_CLOSED = 2

/** `apiBaseUrl` (…/api/) ile AYNI kaynak — restapi.ts ile tek taban. */
export function streamUrl(base: string = apiBaseUrl): string {
  return `${base.replace(/\/+$/, '')}/notifications/stream`
}

function parseData(raw: string | undefined): Record<string, unknown> | null {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * SAF olay işleyicisi: sunucu olayı → yan etkiler.
 * - `notification`: `unreadCount` geçerli sayıysa rozete yaz, null/eksik/bozuksa RPC ile say; liste açıksa yenileri çek
 *   (`fetchNew` — store yalnız çekmece/merkez açıkken uygular); `critical` önemde ayrıca `critical`.
 * - `resync`: tam tazele. `shutdown`/`reconnect`: hata sayılmaz, tarayıcı yeniden bağlanır.
 * - `unauthorized`: kapat + yeniden bağlanma. Bilinmeyen olay: yok sayılır (ileri uyumluluk).
 */
export function handleStreamEvent(event: StreamEventInput): StreamEffect[] {
  switch (event.type) {
    case 'notification': {
      const data = parseData(event.data)
      if (!data) return [{ kind: 'countUnread' }, { kind: 'fetchNew' }]
      const count = data.unreadCount
      const effects: StreamEffect[] = [
        typeof count === 'number' && Number.isFinite(count) && count >= 0
          ? { kind: 'setUnread', count: Math.floor(count) }
          : { kind: 'countUnread' },
      ]
      const id = typeof data.id === 'string' || typeof data.id === 'number' ? String(data.id) : event.lastEventId || undefined
      const category = typeof data.category === 'string' ? data.category : undefined
      const severity = typeof data.severity === 'string' ? data.severity : undefined
      effects.push({ kind: 'fetchNew', id, category, severity })
      if (severity === 'critical') effects.push({ kind: 'critical', id, category })
      return effects
    }
    case 'resync':
      return [{ kind: 'resync' }]
    case 'shutdown':
    case 'reconnect':
      return [{ kind: 'expectReconnect' }]
    case 'unauthorized':
      return [{ kind: 'unauthorized' }]
    default:
      return []
  }
}

/**
 * SAF: `error` olayından sonra mod. EventSource HTTP durumunu vermez; ayrım `readyState` ile yapılır:
 * - CLOSED → tarayıcı vazgeçti (401/403/503, yanlış içerik türü) → `polling` + kendi geri çekilmeli yeniden denemesi.
 * - CONNECTING → tarayıcı `retry` ile yeniden bağlanıyor (30 dk kapanış, ağ kopması) → `reconnecting` (süre dolarsa polling).
 */
export function modeAfterError(readyState: number): 'polling' | 'reconnecting' {
  return readyState === EVENTSOURCE_CLOSED ? 'polling' : 'reconnecting'
}

/** SAF: n. başarısız denemeden sonra bekleme (5 → 10 → 20 → 40 → 60 sn tavan). */
export function retryDelay(attempt: number): number {
  const n = Math.max(0, Math.floor(attempt))
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** n)
}

/** Enjekte edilebilir EventSource (test ve eski ortam). */
export interface EventSourceLike {
  readyState: number
  onopen: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
  addEventListener(type: string, listener: (ev: any) => void): void
  close(): void
}

export interface VisibilitySource {
  readonly hidden: boolean
  addEventListener(type: 'visibilitychange', listener: () => void): void
  removeEventListener(type: 'visibilitychange', listener: () => void): void
}

export interface NotificationStreamOptions {
  onEffect: (effect: StreamEffect) => void
  onModeChange?: (mode: StreamMode, previous: StreamMode) => void
  url?: string
  /** Verilmezse global `EventSource`; o da yoksa yalnız polling. */
  createEventSource?: ((url: string) => EventSourceLike) | null
  visibility?: VisibilitySource | null
}

export interface NotificationStreamHandle {
  mode: Ref<StreamMode>
  start: () => void
  stop: () => void
}

function defaultFactory(): ((url: string) => EventSourceLike) | null {
  if (typeof EventSource === 'undefined') return null
  return (url: string) => new EventSource(url, { withCredentials: true }) as unknown as EventSourceLike
}

function defaultVisibility(): VisibilitySource | null {
  return typeof document === 'undefined' ? null : document
}

export function createNotificationStream(options: NotificationStreamOptions): NotificationStreamHandle {
  const mode = ref<StreamMode>('idle')
  const url = options.url ?? streamUrl()
  const factory = options.createEventSource === undefined ? defaultFactory() : options.createEventSource
  const visibility = options.visibility === undefined ? defaultVisibility() : options.visibility

  let source: EventSourceLike | null = null
  let attempt = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let graceTimer: ReturnType<typeof setTimeout> | undefined
  let hiddenTimer: ReturnType<typeof setTimeout> | undefined
  let visibilityBound = false
  let running = false

  function setMode(next: StreamMode) {
    const previous = mode.value
    if (previous === next) return
    mode.value = next
    options.onModeChange?.(next, previous)
  }

  function clear(timer: ReturnType<typeof setTimeout> | undefined) {
    if (timer !== undefined) clearTimeout(timer)
    return undefined
  }

  function closeSource() {
    if (!source) return
    source.onopen = null
    source.onerror = null
    source.close()
    source = null
  }

  function scheduleRetry() {
    retryTimer = clear(retryTimer)
    const delay = retryDelay(attempt)
    attempt += 1
    retryTimer = setTimeout(() => {
      retryTimer = undefined
      if (running && mode.value === 'polling') connect()
    }, delay)
  }

  function dispatch(event: StreamEventInput) {
    for (const effect of handleStreamEvent(event)) {
      if (effect.kind === 'unauthorized') {
        // Yeniden bağlanma YOK: akış kapanır, oturumun ne olacağına restapi 401 akışı karar verir.
        teardown()
        setMode('stopped')
      } else if (effect.kind === 'expectReconnect') {
        setMode('reconnecting')
        armGrace()
      }
      options.onEffect(effect)
    }
  }

  function armGrace() {
    graceTimer = clear(graceTimer)
    graceTimer = setTimeout(() => {
      graceTimer = undefined
      if (running && (mode.value === 'reconnecting' || mode.value === 'connecting')) {
        // Tarayıcı hâlâ bağlanamadı: kendi kaynağımızı kapatıp geri çekilmeli denemeye geçeriz.
        closeSource()
        setMode('polling')
        scheduleRetry()
      }
    }, RECONNECT_GRACE_MS)
  }

  function connect() {
    closeSource()
    if (!factory) {
      setMode('polling')
      return
    }
    let es: EventSourceLike
    try {
      es = factory(url)
    } catch {
      setMode('polling')
      scheduleRetry()
      return
    }
    source = es
    setMode(mode.value === 'polling' || mode.value === 'paused' ? mode.value : 'connecting')
    armGrace()
    es.onopen = () => {
      if (source !== es) return
      attempt = 0
      graceTimer = clear(graceTimer)
      retryTimer = clear(retryTimer)
      setMode('live')
    }
    es.onerror = () => {
      if (source !== es) return
      const next = modeAfterError(es.readyState)
      if (next === 'polling') {
        graceTimer = clear(graceTimer)
        closeSource()
        setMode('polling')
        scheduleRetry()
      } else if (mode.value === 'live') {
        setMode('reconnecting')
        armGrace()
      }
    }
    for (const type of STREAM_EVENTS) {
      es.addEventListener(type, (ev: { data?: string; lastEventId?: string }) => {
        if (source !== es) return
        dispatch({ type, data: ev?.data, lastEventId: ev?.lastEventId })
      })
    }
  }

  function teardown() {
    retryTimer = clear(retryTimer)
    graceTimer = clear(graceTimer)
    hiddenTimer = clear(hiddenTimer)
    closeSource()
  }

  function onVisibilityChange() {
    if (!running || !visibility) return
    if (visibility.hidden) {
      hiddenTimer = clear(hiddenTimer)
      hiddenTimer = setTimeout(() => {
        hiddenTimer = undefined
        if (!running || !visibility.hidden || mode.value === 'stopped') return
        retryTimer = clear(retryTimer)
        graceTimer = clear(graceTimer)
        closeSource()
        setMode('paused')
      }, HIDDEN_CLOSE_MS)
    } else {
      hiddenTimer = clear(hiddenTimer)
      if (mode.value === 'paused') {
        attempt = 0
        setMode('connecting')
        connect()
        // Gizliyken kaçan olaylar: rozet hemen tazelenir (sunucu `resync` göndermeyebilir).
        options.onEffect({ kind: 'countUnread' })
      }
    }
  }

  function start() {
    if (running) return
    running = true
    attempt = 0
    if (visibility && !visibilityBound) {
      visibility.addEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = true
    }
    if (!factory) {
      setMode('polling')
      return
    }
    setMode('connecting')
    connect()
  }

  function stop() {
    running = false
    teardown()
    if (visibility && visibilityBound) {
      visibility.removeEventListener('visibilitychange', onVisibilityChange)
      visibilityBound = false
    }
    setMode('idle')
  }

  return { mode, start, stop }
}

/**
 * Etkin kapsamda (bileşen `setup`, Pinia setup store) kapsam kapanınca `stop()` otomatik (onUnmounted eşdeğeri).
 * Kapsam dışında çağrılırsa temizlik çağıranın sorumluluğundadır.
 */
export function useNotificationStream(options: NotificationStreamOptions): NotificationStreamHandle {
  const handle = createNotificationStream(options)
  if (getCurrentScope()) onScopeDispose(handle.stop)
  return handle
}

export { EVENTSOURCE_CONNECTING, EVENTSOURCE_CLOSED }
