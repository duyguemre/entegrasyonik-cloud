// MOB-07 — Capacitor köprüsü: kabuk tespiti (UA + isNativePlatform), kamera/paylaş/push eklentileri, açık yönlendirme koruması.
import { describe, expect, it, vi } from 'vitest'
import {
  hasNativeCamera, hasNativePush, isNativeShell, nativeDeviceLabel, onNativePushOpen, parseShellUserAgent, registerNativePush, safeInternalPath, shareContent,
  shellInfo, takeNativePhoto,
} from '../src/native/shell'

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36'

function win(opts: { shell?: string | null; native?: boolean; plugins?: Record<string, unknown>; share?: unknown } = {}) {
  const ua = opts.shell === null ? UA : `${UA} ${opts.shell ?? 'EntegrasyonikShell/0.1.0 (app; fcm=1)'}`
  return {
    navigator: { userAgent: ua, ...(opts.share ? { share: opts.share } : {}) },
    Capacitor: opts.native === false ? undefined : { isNativePlatform: () => true, Plugins: opts.plugins ?? {} },
  } as unknown as Window
}

describe('kabuk tespiti', () => {
  it('UA işareti ayrıştırılır; bozuk/eksik işaret null', () => {
    expect(parseShellUserAgent(`${UA} EntegrasyonikShell/1.2.3 (backoffice; fcm=0)`)).toEqual({ version: '1.2.3', flavor: 'backoffice', fcm: false })
    expect(parseShellUserAgent(UA)).toBeNull()
    expect(parseShellUserAgent(`${UA} EntegrasyonikShell/1 (diger; fcm=1)`)).toBeNull()
  })
  it('kabuk = UA işareti VE Capacitor.isNativePlatform(); biri yoksa web yolu', () => {
    expect(isNativeShell(win())).toBe(true)
    expect(isNativeShell(win({ shell: null }))).toBe(false) // sıradan tarayıcıda Capacitor sahte global olsa da
    expect(isNativeShell(win({ native: false }))).toBe(false) // UA taklidi tek başına yetmez
    expect(shellInfo(win({ native: false }))).toBeNull()
    expect(nativeDeviceLabel(win({ shell: 'EntegrasyonikShell/0.1.0 (backoffice; fcm=1)' }))).toBe('Android · Yönetim')
  })
})

describe('kamera', () => {
  it('eklenti yoksa yok; vazgeçme null; base64 → JPEG File', async () => {
    expect(hasNativeCamera(win())).toBe(false)
    const getPhoto = vi.fn(async () => ({ base64String: btoa('\xff\xd8\xff'), format: 'jpeg' }))
    const w = win({ plugins: { Camera: { getPhoto } } })
    expect(hasNativeCamera(w)).toBe(true)
    const f = await takeNativePhoto(w)
    expect(f).toBeInstanceOf(File)
    expect(f!.type).toBe('image/jpeg')
    expect(f!.size).toBe(3)
    expect(getPhoto).toHaveBeenCalledWith(expect.objectContaining({ source: 'CAMERA', resultType: 'base64', saveToGallery: false }))
    const cancelled = win({ plugins: { Camera: { getPhoto: async () => { throw new Error('User cancelled photos app') } } } })
    expect(await takeNativePhoto(cancelled)).toBeNull()
    await expect(takeNativePhoto(win({ plugins: { Camera: { getPhoto: async () => { throw new Error('camera busy') } } } }))).rejects.toThrow('camera busy')
  })
})

describe('paylaş', () => {
  it('kabukta yerel Share, tarayıcıda Web Share, ikisi de yoksa false', async () => {
    const share = vi.fn(async () => ({}))
    expect(await shareContent({ title: 'T', url: 'https://app.entegrasyonik.com/x' }, win({ plugins: { Share: { share } } }))).toBe(true)
    expect(share).toHaveBeenCalledWith({ title: 'T', url: 'https://app.entegrasyonik.com/x', dialogTitle: 'T' })
    const webShare = vi.fn(async () => undefined)
    expect(await shareContent({ text: 'x' }, win({ shell: null, native: false, share: webShare }))).toBe(true)
    expect(await shareContent({ text: 'x' }, win({ shell: null, native: false }))).toBe(false)
  })
})

describe('push (FCM)', () => {
  function pushPlugin(opts: { perm?: string; token?: string | null } = {}) {
    const listeners: Record<string, (e: any) => void> = {}
    const remove = vi.fn(async () => undefined)
    return {
      listeners,
      remove,
      plugin: {
        requestPermissions: vi.fn(async () => ({ receive: opts.perm ?? 'granted' })),
        checkPermissions: vi.fn(async () => ({ receive: 'prompt' })),
        addListener: vi.fn(async (ev: string, fn: (e: any) => void) => { listeners[ev] = fn; return { remove } }),
        register: vi.fn(async () => {
          await Promise.resolve()
          if (opts.token === null) listeners.registrationError?.({ error: 'x' })
          else listeners.registration?.({ value: opts.token ?? 'fcm-token-1' })
        }),
      },
    }
  }
  it('FCM\'siz derlemede (fcm=0) yerel push YOK → web yoluna düşülür', async () => {
    const p = pushPlugin()
    const w = win({ shell: 'EntegrasyonikShell/0.1.0 (app; fcm=0)', plugins: { PushNotifications: p.plugin } })
    expect(hasNativePush(w)).toBe(false)
    expect(await registerNativePush(w)).toEqual({ ok: false, reason: 'unsupported' })
    expect(p.plugin.requestPermissions).not.toHaveBeenCalled()
  })
  it('izin → kayıt → belirteç; dinleyiciler temizlenir', async () => {
    const p = pushPlugin()
    const w = win({ plugins: { PushNotifications: p.plugin } })
    expect(await registerNativePush(w)).toEqual({ ok: true, token: 'fcm-token-1' })
    expect(p.remove).toHaveBeenCalled()
  })
  it('izin reddi ve kayıt hatası', async () => {
    expect(await registerNativePush(win({ plugins: { PushNotifications: pushPlugin({ perm: 'denied' }).plugin } }))).toEqual({ ok: false, reason: 'denied' })
    expect(await registerNativePush(win({ plugins: { PushNotifications: pushPlugin({ token: null }).plugin } }))).toEqual({ ok: false, reason: 'error' })
  })
  it('bildirime dokunma: yalnız uygulama içi göreli yol', async () => {
    const p = pushPlugin()
    const nav = vi.fn()
    onNativePushOpen(nav, win({ plugins: { PushNotifications: p.plugin } }))
    await Promise.resolve()
    p.listeners.pushNotificationActionPerformed({ notification: { data: { url: '/orders/5' } } })
    p.listeners.pushNotificationActionPerformed({ notification: { data: { url: 'https://kotu.example' } } })
    p.listeners.pushNotificationActionPerformed({ notification: { data: { url: '//kotu.example' } } })
    expect(nav.mock.calls).toEqual([['/orders/5']])
    expect(safeInternalPath('/a\u0001')).toBeUndefined()
  })
})
