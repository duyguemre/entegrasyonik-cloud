// MOB-04 — web push istemcisi: cihaz desteği (Electron gizli, iOS yalnız kurulu PWA), izin yalnız eylemle, abone ol/çık,
// sunucu hatasında tarayıcıda yetim abonelik bırakmama, VAPID anahtarı değişince yeniden abonelik. Sahte tarayıcı API'leri.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const post = vi.fn()
vi.mock('@/composables/restapi', () => ({ default: () => ({ post }) }))
vi.mock('@/composables/logger', () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import {
  detectPushSupport,
  deviceLabelFrom,
  normalizePushConfig,
  urlBase64ToUint8Array,
  useWebPush,
} from '../../src/pwa/webPush'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const WIN_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0'
const KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' // 65 bayt (RFC 8292 örneği)

function fakeWindow(o: { ua?: string; standalone?: boolean; apis?: boolean; desktop?: boolean; permission?: string; request?: string; existing?: any; secure?: boolean } = {}) {
  const calls: { subscribe: any[]; unsub: number; request: number } = { subscribe: [], unsub: 0, request: 0 }
  let current: any = o.existing ?? null
  const makeSub = (key: Uint8Array) => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1',
    options: { applicationServerKey: key.buffer },
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1', expirationTime: null, keys: { p256dh: 'BP256', auth: 'AUTH' } }),
    unsubscribe: async () => { calls.unsub++; current = null; return true },
  })
  const pushManager = {
    getSubscription: async () => current,
    subscribe: async (opts: any) => { calls.subscribe.push(opts); current = makeSub(opts.applicationServerKey); return current },
  }
  const reg = { pushManager }
  const N: any = { permission: o.permission ?? 'default', requestPermission: async () => { calls.request++; N.permission = o.request ?? 'granted'; return N.permission } }
  const apis = o.apis ?? true
  const win: any = {
    navigator: { userAgent: o.ua ?? ANDROID, maxTouchPoints: 5, standalone: o.standalone, ...(apis ? { serviceWorker: { ready: Promise.resolve(reg), getRegistration: async () => reg } } : {}) },
    matchMedia: () => ({ matches: o.standalone === true }),
    isSecureContext: o.secure ?? true,
    ...(apis ? { PushManager: function () {}, Notification: N } : {}),
    ...(o.desktop ? { entegrasyonikDesktop: { isDesktop: true } } : {}),
  }
  return { win, calls, makeSub, get current() { return current } }
}

beforeEach(() => post.mockReset())

describe('detectPushSupport', () => {
  it('Electron → desktop-shell (gizli); Android Chrome → supported; API yok / güvensiz bağlam → unsupported', () => {
    expect(detectPushSupport(fakeWindow({ desktop: true }).win)).toBe('desktop-shell')
    expect(detectPushSupport(fakeWindow().win)).toBe('supported')
    expect(detectPushSupport(fakeWindow({ apis: false }).win)).toBe('unsupported')
    expect(detectPushSupport(fakeWindow({ secure: false }).win)).toBe('unsupported')
  })
  it('iOS: Safari sekmesinde → ios-install; ana ekrandan (standalone) 16.4+ → supported; eski iOS → ios-unsupported', () => {
    expect(detectPushSupport(fakeWindow({ ua: IPHONE }).win)).toBe('ios-install')
    expect(detectPushSupport(fakeWindow({ ua: IPHONE, standalone: true }).win)).toBe('supported')
    expect(detectPushSupport(fakeWindow({ ua: IPHONE, standalone: true, apis: false }).win)).toBe('ios-unsupported')
  })
})

describe('yardımcılar', () => {
  it('deviceLabelFrom: kısa, PII olmayan cihaz adı', () => {
    expect(deviceLabelFrom(ANDROID)).toBe('Android · Chrome')
    expect(deviceLabelFrom(IPHONE)).toBe('iPhone · Safari')
    expect(deviceLabelFrom(WIN_EDGE)).toBe('Windows · Edge')
  })
  it('urlBase64ToUint8Array: VAPID açık anahtarı 65 bayt, 0x04 ile başlar', () => {
    const k = urlBase64ToUint8Array(KEY)
    expect(k.length).toBe(65)
    expect(k[0]).toBe(4)
  })
  it('normalizePushConfig: anahtar yoksa kapalı; bozuk cihaz satırları elenir', () => {
    expect(normalizePushConfig({ result: true, enabled: true, publicKey: null }).enabled).toBe(false)
    const c = normalizePushConfig({ enabled: true, publicKey: KEY, devices: [{ id: 'd1', deviceLabel: 'Android · Chrome', createdAt: '2026-10-01T10:00:00Z' }, null, { x: 1 }] })
    expect(c).toEqual({ enabled: true, publicKey: KEY, devices: [{ id: 'd1', deviceLabel: 'Android · Chrome', createdAt: '2026-10-01T10:00:00Z', lastSuccessAt: null }] })
  })
})

describe('enablePush / disablePush', () => {
  it('izin isteği YALNIZ enablePush içinde; yükleme (loadConfig) izin istemez', async () => {
    const f = fakeWindow()
    post.mockResolvedValueOnce({ result: true, enabled: true, publicKey: KEY, devices: [] })
    await useWebPush(f.win).loadConfig()
    expect(f.calls.request).toBe(0)
  })
  it('izin → abonelik (userVisibleOnly + VAPID anahtarı) → subscribePush gövdesi', async () => {
    const f = fakeWindow()
    post.mockResolvedValueOnce({ result: true })
    const r = await useWebPush(f.win).enablePush(KEY)
    expect(r).toEqual({ ok: true })
    expect(f.calls.request).toBe(1)
    expect(f.calls.subscribe[0].userVisibleOnly).toBe(true)
    expect(Array.from(f.calls.subscribe[0].applicationServerKey)).toEqual(Array.from(urlBase64ToUint8Array(KEY)))
    expect(post).toHaveBeenCalledWith('NotificationService/subscribePush', {
      subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1', expirationTime: null, keys: { p256dh: 'BP256', auth: 'AUTH' } },
      deviceLabel: 'Android · Chrome',
    })
  })
  it('izin reddi → abonelik ve istek YOK', async () => {
    const f = fakeWindow({ request: 'denied' })
    const r = await useWebPush(f.win).enablePush(KEY)
    expect(r).toMatchObject({ ok: false, reason: 'denied' })
    expect(f.calls.subscribe).toHaveLength(0)
    expect(post).not.toHaveBeenCalled()
  })
  it('sunucu reddederse tarayıcı aboneliği geri alınır; hata kodu kullanıcı diline çevrilir', async () => {
    const f = fakeWindow({ permission: 'granted' })
    post.mockResolvedValueOnce({ isAxiosError: true, response: { status: 409, data: { code: 'PUSH_DISABLED' } } })
    const r = await useWebPush(f.win).enablePush(KEY)
    expect(r).toEqual({ ok: false, reason: 'server', message: 'Anlık bildirimler şu an kullanılamıyor.' })
    expect(f.calls.unsub).toBe(1)
    expect(f.current).toBeNull()
  })
  it('VAPID anahtarı değişmişse eski abonelik bırakılıp yeniden abone olunur', async () => {
    const f = fakeWindow({ permission: 'granted' })
    const stale = f.makeSub(new Uint8Array([1, 2, 3]))
    const g = fakeWindow({ permission: 'granted', existing: stale })
    post.mockResolvedValueOnce({ result: true })
    expect(await useWebPush(g.win).enablePush(KEY)).toEqual({ ok: true })
    expect(g.calls.subscribe).toHaveLength(1)
  })
  it('iOS Safari sekmesinde enablePush izin istemez (unsupported)', async () => {
    const f = fakeWindow({ ua: IPHONE })
    expect(await useWebPush(f.win).enablePush(KEY)).toMatchObject({ ok: false, reason: 'unsupported' })
    expect(f.calls.request).toBe(0)
  })
  it('disablePush: sunucudan uçla silinir, sonra tarayıcı aboneliği bırakılır', async () => {
    const f = fakeWindow({ permission: 'granted' })
    post.mockResolvedValueOnce({ result: true })
    await useWebPush(f.win).enablePush(KEY)
    post.mockResolvedValueOnce({ result: true, removed: 1 })
    expect(await useWebPush(f.win).disablePush()).toEqual({ ok: true })
    expect(post).toHaveBeenLastCalledWith('NotificationService/unsubscribePush', { endpoint: 'https://fcm.googleapis.com/fcm/send/dev-1' })
    expect(f.current).toBeNull()
  })
})
