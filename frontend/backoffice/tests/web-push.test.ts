// MOB-06 — backoffice web push istemcisi: destek tespiti, izin YALNIZ eylemle, abone ol/çık, sunucu reddinde tarayıcı aboneliği geri alınır.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: Array<{ op: string; body: unknown }> = []
let failOp: string | null = null
vi.mock('../src/api', async () => {
  const { AdminApiError } = await import('../src/api/client')
  return {
    api: {
      call: vi.fn(async (op: string, body: unknown) => {
        calls.push({ op, body })
        if (op === failOp) throw new AdminApiError(400, { error: 'x', code: 'PUSH_ENDPOINT_NOT_ALLOWED' })
        if (op === 'BackofficePrefsService/getPushConfig') return { enabled: true, publicKey: 'BFuTE875nh45zRaU0GNt1_kAw1TxLLDoCZtKauNzbRvRE_6s-mMjm-P0t2lVmXKeg5Oe-bqoRQLLqQPOY26WGTM', devices: [] }
        return { ok: true, removed: 1 }
      }),
    },
  }
})

import { currentPermission, detectPushSupport, deviceLabelFrom, urlBase64ToUint8Array, useBoWebPush } from '../src/pwa/webPush'

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

function fakeWin(opts: { ua?: string; permission?: string; ask?: string; standalone?: boolean; apis?: boolean } = {}) {
  const unsub = vi.fn(async () => true)
  let current: any = null
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => {
      current = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', options: {}, unsubscribe: unsub, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } }) }
      return current
    }),
  }
  const reg = { pushManager }
  const Notification: any = { permission: opts.permission ?? 'default', requestPermission: vi.fn(async () => opts.ask ?? 'granted') }
  const win: any = {
    navigator: { userAgent: opts.ua ?? ANDROID, maxTouchPoints: 5, ...(opts.apis === false ? {} : { serviceWorker: { ready: Promise.resolve(reg), getRegistration: async () => reg } }) },
    isSecureContext: true,
    matchMedia: () => ({ matches: !!opts.standalone }),
    ...(opts.apis === false ? {} : { PushManager: function () {}, Notification }),
  }
  return { win: win as Window, Notification, pushManager, unsub }
}

beforeEach(() => {
  calls.length = 0
  failOp = null
})

describe('destek ve yardımcılar', () => {
  it('Android destekli; iOS sekmesi kurulum ister; API yoksa desteklenmez', () => {
    expect(detectPushSupport(fakeWin().win)).toBe('supported')
    expect(detectPushSupport(fakeWin({ ua: IPHONE }).win)).toBe('ios-install')
    expect(detectPushSupport(fakeWin({ ua: IPHONE, standalone: true }).win)).toBe('supported')
    expect(detectPushSupport(fakeWin({ apis: false }).win)).toBe('unsupported')
    expect(currentPermission(fakeWin({ permission: 'denied' }).win)).toBe('denied')
  })
  it('cihaz adı ve VAPID anahtarı (65 bayt)', () => {
    expect(deviceLabelFrom(ANDROID)).toBe('Android · Chrome')
    expect(deviceLabelFrom(IPHONE)).toBe('iPhone · Safari')
    expect(urlBase64ToUint8Array('BFuTE875nh45zRaU0GNt1_kAw1TxLLDoCZtKauNzbRvRE_6s-mMjm-P0t2lVmXKeg5Oe-bqoRQLLqQPOY26WGTM')).toHaveLength(65)
  })
})

describe('useBoWebPush', () => {
  it('yapılandırma okumak izin İSTEMEZ', async () => {
    const f = fakeWin()
    const cfg = await useBoWebPush(f.win).loadConfig()
    expect(cfg?.enabled).toBe(true)
    expect(f.Notification.requestPermission).not.toHaveBeenCalled()
  })
  it('aç: izin → abonelik → sunucuya kayıt (uç + anahtarlar + cihaz adı)', async () => {
    const f = fakeWin()
    const r = await useBoWebPush(f.win).enable('BFuTE875nh45zRaU0GNt1_kAw1TxLLDoCZtKauNzbRvRE_6s-mMjm-P0t2lVmXKeg5Oe-bqoRQLLqQPOY26WGTM')
    expect(r).toEqual({ ok: true })
    expect(f.Notification.requestPermission).toHaveBeenCalledTimes(1)
    expect(calls.at(-1)).toEqual({
      op: 'BackofficePrefsService/subscribePush',
      body: { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/x', expirationTime: null, keys: { p256dh: 'p', auth: 'a' } }, deviceLabel: 'Android · Chrome' },
    })
  })
  it('izin reddi: abonelik yok, sunucu çağrısı yok', async () => {
    const f = fakeWin({ ask: 'denied' })
    const r = await useBoWebPush(f.win).enable('AQAB')
    expect(r).toMatchObject({ ok: false, reason: 'denied' })
    expect(f.pushManager.subscribe).not.toHaveBeenCalled()
    expect(calls).toHaveLength(0)
  })
  it('sunucu reddi: tarayıcı aboneliği geri alınır, hata kullanıcı diline çevrilir', async () => {
    failOp = 'BackofficePrefsService/subscribePush'
    const f = fakeWin({ permission: 'granted' })
    const r = await useBoWebPush(f.win).enable('AQAB')
    expect(r).toEqual({ ok: false, reason: 'server', message: 'Bu tarayıcının bildirim servisi desteklenmiyor.' })
    expect(f.unsub).toHaveBeenCalled()
  })
  it('kapat: sunucudan uçla silinir, sonra tarayıcı aboneliği bırakılır; cihaz kaldırma kimlikle', async () => {
    const f = fakeWin({ permission: 'granted' })
    const p = useBoWebPush(f.win)
    await p.enable('AQAB')
    expect(await p.disable()).toEqual({ ok: true })
    expect(calls.at(-1)).toEqual({ op: 'BackofficePrefsService/unsubscribePush', body: { endpoint: 'https://fcm.googleapis.com/fcm/send/x' } })
    expect(f.unsub).toHaveBeenCalled()
    expect(await p.removeDevice('abc')).toBe(true)
    expect(calls.at(-1)).toEqual({ op: 'BackofficePrefsService/unsubscribePush', body: { id: 'abc' } })
  })
})

describe('MOB-07 Android kabuğu (FCM)', () => {
  function shellWin(fcm: '0' | '1', perm = 'granted', token: string | null = 'f'.repeat(40)) {
    const listeners: Record<string, (e: any) => void> = {}
    const plugin = {
      requestPermissions: vi.fn(async () => ({ receive: perm })),
      checkPermissions: vi.fn(async () => ({ receive: perm })),
      addListener: vi.fn(async (ev: string, fn: (e: any) => void) => { listeners[ev] = fn; return { remove: async () => undefined } }),
      register: vi.fn(async () => { await Promise.resolve(); token ? listeners.registration?.({ value: token }) : listeners.registrationError?.({}) }),
    }
    const win = {
      navigator: { userAgent: `${ANDROID}; wv EntegrasyonikShell/0.1.0 (backoffice; fcm=${fcm})`, maxTouchPoints: 5 },
      matchMedia: () => ({ matches: false }),
      Capacitor: { isNativePlatform: () => true, Plugins: { PushNotifications: plugin } },
    } as unknown as Window
    return { win, plugin }
  }
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) })
  })

  it('FCM ile derlenmiş kabuk: destekli; aç → FCM belirteci sunucuya; kapat → belirteçle silinir', async () => {
    const { win, plugin } = shellWin('1')
    expect(detectPushSupport(win)).toBe('supported')
    const p = useBoWebPush(win)
    expect(await p.enable(null)).toEqual({ ok: true })
    expect(plugin.requestPermissions).toHaveBeenCalledTimes(1)
    expect(calls.at(-1)).toEqual({ op: 'BackofficePrefsService/subscribePush', body: { fcmToken: 'f'.repeat(40), deviceLabel: 'Android · Yönetim' } })
    expect(await p.isSubscribedHere()).toBe(true)
    expect(await p.disable()).toEqual({ ok: true })
    expect(calls.at(-1)).toEqual({ op: 'BackofficePrefsService/unsubscribePush', body: { fcmToken: 'f'.repeat(40) } })
    expect(await p.isSubscribedHere()).toBe(false)
  })
  it('FCM\'siz kabuk desteklenmez; izin reddi sunucuya gitmez', async () => {
    expect(detectPushSupport(shellWin('0').win)).toBe('unsupported')
    const { win } = shellWin('1', 'denied')
    expect(await useBoWebPush(win).enable(null)).toMatchObject({ ok: false, reason: 'denied' })
    expect(calls).toHaveLength(0)
  })
})
