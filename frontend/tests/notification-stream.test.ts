// C2b (ADR-0029 Karar 6) — SSE zili istemcisi: saf olay işleyicisi + bağlantı yaşam döngüsü (sahte EventSource,
// sahte saat). Sözleşme: docs/cloud-contracts/README.md "NB6 — gerçekleşen SSE sözleşmesi".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { effectScope } from 'vue'
import {
  HIDDEN_CLOSE_MS,
  RECONNECT_GRACE_MS,
  RETRY_MAX_MS,
  STREAM_EVENTS,
  createNotificationStream,
  handleStreamEvent,
  modeAfterError,
  retryDelay,
  streamUrl,
  useNotificationStream,
  type EventSourceLike,
  type StreamEffect,
  type StreamMode,
  type VisibilitySource,
} from '@/composables/useNotificationStream'

describe('handleStreamEvent (saf)', () => {
  it('notification: geçerli unreadCount → setUnread + fetchNew (liste açıksa store uygular)', () => {
    const fx = handleStreamEvent({ type: 'notification', data: JSON.stringify({ id: 'n9', category: 'stock', severity: 'warning', unreadCount: 7 }) })
    expect(fx).toEqual([
      { kind: 'setUnread', count: 7 },
      { kind: 'fetchNew', id: 'n9', category: 'stock', severity: 'warning' },
    ])
  })

  it('notification: unreadCount null/eksik/negatif → RPC ile say (countUnread)', () => {
    for (const unreadCount of [null, undefined, -1, 'x']) {
      const fx = handleStreamEvent({ type: 'notification', data: JSON.stringify({ id: 'a', unreadCount }) })
      expect(fx[0]).toEqual({ kind: 'countUnread' })
      expect(fx[1]).toMatchObject({ kind: 'fetchNew', id: 'a' })
    }
  })

  it('notification: bozuk JSON → güvenli yol (say + yenileri çek), fırlatmaz', () => {
    expect(handleStreamEvent({ type: 'notification', data: '{bozuk' })).toEqual([{ kind: 'countUnread' }, { kind: 'fetchNew' }])
  })

  it('notification: id yoksa SSE lastEventId kullanılır', () => {
    const fx = handleStreamEvent({ type: 'notification', data: '{"unreadCount":1}', lastEventId: '42' })
    expect(fx[1]).toEqual({ kind: 'fetchNew', id: '42', category: undefined, severity: undefined })
  })

  it('notification: critical önem → ayrıca critical etkisi (toast); diğerlerinde yok', () => {
    const fx = handleStreamEvent({ type: 'notification', data: JSON.stringify({ id: 'c', category: 'stock', severity: 'critical', unreadCount: 1 }) })
    expect(fx.map((x) => x.kind)).toEqual(['setUnread', 'fetchNew', 'critical'])
    const plain = handleStreamEvent({ type: 'notification', data: JSON.stringify({ severity: 'error', unreadCount: 1 }) })
    expect(plain.some((x) => x.kind === 'critical')).toBe(false)
  })

  it('resync → tam tazele; shutdown/reconnect → normal yeniden bağlanma; unauthorized → kapat', () => {
    expect(handleStreamEvent({ type: 'resync', data: '{}' })).toEqual([{ kind: 'resync' }])
    expect(handleStreamEvent({ type: 'shutdown' })).toEqual([{ kind: 'expectReconnect' }])
    expect(handleStreamEvent({ type: 'reconnect' })).toEqual([{ kind: 'expectReconnect' }])
    expect(handleStreamEvent({ type: 'unauthorized' })).toEqual([{ kind: 'unauthorized' }])
  })

  it('bilinmeyen olay (ileri uyumluluk) ve plan adı `sync` yok sayılır', () => {
    expect(handleStreamEvent({ type: 'announcement', data: '{}' })).toEqual([])
    expect(handleStreamEvent({ type: 'sync', data: '{}' })).toEqual([])
  })

  it('dinlenen olay adları sözleşmedeki gerçek adlardır', () => {
    expect([...STREAM_EVENTS]).toEqual(['notification', 'resync', 'shutdown', 'reconnect', 'unauthorized'])
  })
})

describe('yardımcılar (saf)', () => {
  it('modeAfterError: CLOSED → polling, CONNECTING → reconnecting', () => {
    expect(modeAfterError(2)).toBe('polling')
    expect(modeAfterError(0)).toBe('reconnecting')
  })

  it('retryDelay: 5 → 10 → 20 → 40 → 60 sn tavan', () => {
    expect([0, 1, 2, 3, 4, 9].map(retryDelay)).toEqual([5000, 10000, 20000, 40000, RETRY_MAX_MS, RETRY_MAX_MS])
  })

  it('streamUrl: restapi ile aynı taban (sondaki / fark etmez)', () => {
    expect(streamUrl('http://127.0.0.1:5001/api/')).toBe('http://127.0.0.1:5001/api/notifications/stream')
    expect(streamUrl('https://app.example/api')).toBe('https://app.example/api/notifications/stream')
  })
})

// ---------------------------------------------------------------------------------------------------------------

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = []
  readyState = 0
  onopen: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  closed = false
  listeners = new Map<string, Array<(ev: any) => void>>()
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, listener: (ev: any) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  close() {
    this.closed = true
    this.readyState = 2
  }
  open() {
    this.readyState = 1
    this.onopen?.({})
  }
  fail(readyState: number) {
    this.readyState = readyState
    this.onerror?.({})
  }
  emit(type: string, data?: string, lastEventId?: string) {
    for (const l of this.listeners.get(type) ?? []) l({ data, lastEventId })
  }
}

class FakeVisibility implements VisibilitySource {
  hidden = false
  private ls = new Set<() => void>()
  addEventListener(_: 'visibilitychange', l: () => void) {
    this.ls.add(l)
  }
  removeEventListener(_: 'visibilitychange', l: () => void) {
    this.ls.delete(l)
  }
  set(hidden: boolean) {
    this.hidden = hidden
    for (const l of this.ls) l()
  }
  get count() {
    return this.ls.size
  }
}

function setup() {
  const effects: StreamEffect[] = []
  const modes: StreamMode[] = []
  const visibility = new FakeVisibility()
  const handle = createNotificationStream({
    url: 'http://x/api/notifications/stream',
    onEffect: (fx) => effects.push(fx),
    onModeChange: (m) => modes.push(m),
    createEventSource: (url) => new FakeEventSource(url),
    visibility,
  })
  const last = () => FakeEventSource.instances[FakeEventSource.instances.length - 1]
  return { effects, modes, visibility, handle, last }
}

describe('createNotificationStream (yaşam döngüsü)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeEventSource.instances = []
  })
  afterEach(() => vi.useRealTimers())

  it('start → connecting, open → live; olaylar etkiye dönüşür', () => {
    const { handle, last, effects, modes } = setup()
    handle.start()
    expect(handle.mode.value).toBe('connecting')
    expect(last().url).toBe('http://x/api/notifications/stream')
    last().open()
    expect(handle.mode.value).toBe('live')
    last().emit('notification', JSON.stringify({ id: '1', unreadCount: 3 }))
    expect(effects[0]).toEqual({ kind: 'setUnread', count: 3 })
    expect(modes).toEqual(['connecting', 'live'])
  })

  it('HTTP hatası (503/401: CLOSED) → polling + geri çekilmeli yeniden deneme; açılınca live', () => {
    const { handle, last } = setup()
    handle.start()
    last().fail(2)
    expect(handle.mode.value).toBe('polling')
    expect(last().closed).toBe(true)
    expect(FakeEventSource.instances).toHaveLength(1)
    vi.advanceTimersByTime(5000)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(handle.mode.value).toBe('polling') // açılana dek yoklama sürer
    last().fail(2)
    vi.advanceTimersByTime(9999)
    expect(FakeEventSource.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeEventSource.instances).toHaveLength(3)
    last().open()
    expect(handle.mode.value).toBe('live')
  })

  it('bağlıyken kopma (CONNECTING) → reconnecting; tarayıcı süre içinde bağlanırsa polling YOK', () => {
    const { handle, last, modes } = setup()
    handle.start()
    last().open()
    last().fail(0)
    expect(handle.mode.value).toBe('reconnecting')
    vi.advanceTimersByTime(RECONNECT_GRACE_MS - 1)
    last().open()
    vi.advanceTimersByTime(RECONNECT_GRACE_MS)
    expect(handle.mode.value).toBe('live')
    expect(modes).not.toContain('polling')
  })

  it('yeniden bağlanma süresi dolarsa → polling (bağlantı hatası yedeği)', () => {
    const { handle, last } = setup()
    handle.start()
    last().open()
    last().fail(0)
    vi.advanceTimersByTime(RECONNECT_GRACE_MS)
    expect(handle.mode.value).toBe('polling')
    expect(last().closed).toBe(true)
  })

  it('shutdown/reconnect olayı hata sayılmaz → reconnecting (etkisi iletilir)', () => {
    const { handle, last, effects } = setup()
    handle.start()
    last().open()
    last().emit('shutdown', '{}')
    expect(handle.mode.value).toBe('reconnecting')
    expect(effects).toContainEqual({ kind: 'expectReconnect' })
  })

  it('unauthorized → akış kapanır, stopped; zamanlayıcı yeniden BAĞLANMAZ', () => {
    const { handle, last, effects } = setup()
    handle.start()
    last().open()
    last().emit('unauthorized', '{}')
    expect(handle.mode.value).toBe('stopped')
    expect(last().closed).toBe(true)
    expect(effects).toContainEqual({ kind: 'unauthorized' })
    vi.advanceTimersByTime(10 * RETRY_MAX_MS)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('gizli sekme: 60 sn sonra bağlantı kapanır (paused); görünür olunca yeniden açılır + sayım', () => {
    const { handle, last, visibility, effects } = setup()
    handle.start()
    last().open()
    visibility.set(true)
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS - 1)
    expect(handle.mode.value).toBe('live')
    vi.advanceTimersByTime(1)
    expect(handle.mode.value).toBe('paused')
    expect(last().closed).toBe(true)
    visibility.set(false)
    expect(FakeEventSource.instances).toHaveLength(2)
    expect(effects).toContainEqual({ kind: 'countUnread' })
    last().open()
    expect(handle.mode.value).toBe('live')
  })

  it('kısa gizlenme (< 60 sn) bağlantıyı kapatmaz', () => {
    const { handle, last, visibility } = setup()
    handle.start()
    last().open()
    visibility.set(true)
    vi.advanceTimersByTime(30_000)
    visibility.set(false)
    vi.advanceTimersByTime(HIDDEN_CLOSE_MS)
    expect(handle.mode.value).toBe('live')
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('EventSource yoksa (eski ortam) yalnız polling', () => {
    const handle = createNotificationStream({ onEffect: () => {}, createEventSource: null, visibility: null })
    handle.start()
    expect(handle.mode.value).toBe('polling')
  })

  it('stop: kaynak kapanır, zamanlayıcılar ve görünürlük dinleyicisi temizlenir', () => {
    const { handle, last, visibility } = setup()
    handle.start()
    last().fail(2)
    expect(visibility.count).toBe(1)
    handle.stop()
    expect(handle.mode.value).toBe('idle')
    expect(visibility.count).toBe(0)
    vi.advanceTimersByTime(10 * RETRY_MAX_MS)
    expect(FakeEventSource.instances).toHaveLength(1)
  })

  it('eski kaynağın geç gelen olayları yok sayılır (yeniden bağlanma sonrası çift işlem yok)', () => {
    const { handle, last, effects } = setup()
    handle.start()
    const first = last()
    first.fail(2)
    vi.advanceTimersByTime(5000)
    first.emit('notification', '{"unreadCount":9}')
    expect(effects).toHaveLength(0)
  })

  it('useNotificationStream: kapsam kapanınca (onUnmounted eşdeğeri) bağlantı kapanır', () => {
    FakeEventSource.instances = []
    const visibility = new FakeVisibility()
    const scope = effectScope()
    const handle = scope.run(() =>
      useNotificationStream({ onEffect: () => {}, createEventSource: (u) => new FakeEventSource(u), visibility }),
    )!
    handle.start()
    FakeEventSource.instances[0].open()
    scope.stop()
    expect(FakeEventSource.instances[0].closed).toBe(true)
    expect(handle.mode.value).toBe('idle')
    expect(visibility.count).toBe(0)
  })
})

describe('statik: bağlantı kurulumu', () => {
  const src = readFileSync(path.resolve(__dirname, '../src/composables/useNotificationStream.ts'), 'utf8')
  it('EventSource withCredentials ile açılır, taban adres config/env (restapi ile aynı)', () => {
    expect(src).toContain('new EventSource(url, { withCredentials: true })')
    expect(src).toContain("import { apiBaseUrl } from '@/config/env'")
  })
})
