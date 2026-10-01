/**
 * MOB-06 — backoffice web push istemcisi (MOB-04 kanalı; desen: uygulamanın `src/pwa/webPush.ts`'i — backoffice uygulama kaynağını
 * içe aktarmaz). Yalnız KRİTİK dikkat maddeleri gelir (sunucu `notifications.platform-attention-push`).
 *
 * Kurallar:
 *  - İzin YALNIZ kullanıcı eylemiyle istenir (`enable` bir düğme tıklamasından çağrılır; sayfa açılışında istem yok).
 *  - iOS/iPadOS: push yalnız ana ekrana eklenmiş PWA'da (16.4+).
 *  - Sunucu kanalı kapalıysa (`getPushConfig.enabled=false`) arayüz gizlenir.
 * Backend: `BackofficePrefsService/{getPushConfig,subscribePush,unsubscribePush}`.
 */
import { api } from '../api'
import { AdminApiError } from '../api/client'
import type { BoPushConfig } from '../api/contract'
import { isStandalone } from './pwaState'

export type PushSupport = 'ios-install' | 'ios-unsupported' | 'unsupported' | 'supported'
export type PermissionState = 'default' | 'granted' | 'denied'
export type PushActionResult = { ok: true } | { ok: false; reason: 'denied' | 'dismissed' | 'unsupported' | 'server' | 'error'; message: string }

export function isIos(ua: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
}

/** Bu cihazda push mümkün mü (izin durumundan bağımsız). */
export function detectPushSupport(win: Window = window): PushSupport {
  const nav = win.navigator
  const hasApis = 'serviceWorker' in nav && 'PushManager' in win && 'Notification' in win
  if (isIos(nav.userAgent, nav.maxTouchPoints ?? 0)) {
    if (!isStandalone(win)) return 'ios-install'
    return hasApis ? 'supported' : 'ios-unsupported'
  }
  if (!hasApis || win.isSecureContext === false) return 'unsupported'
  return 'supported'
}

export function currentPermission(win: Window = window): PermissionState {
  const p = (win as Window & { Notification?: { permission?: string } }).Notification?.permission
  return p === 'granted' || p === 'denied' ? p : 'default'
}

/** Kısa cihaz adı (PII değil): "Android · Chrome", "iPhone · Safari". */
export function deviceLabelFrom(ua: string, maxTouchPoints = 0): string {
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPod/.test(ua) ? 'iPhone' : isIos(ua, maxTouchPoints) ? 'iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Linux|CrOS/.test(ua) ? 'Linux' : 'Cihaz'
  const browser = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Tarayıcı'
  return `${os} · ${browser}`
}

/** VAPID açık anahtarı (base64url) → `applicationServerKey`. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const raw = atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

const SERVER_ERRORS: Record<string, string> = {
  PUSH_DISABLED: 'Anlık bildirimler şu an kullanılamıyor.',
  PUSH_ENDPOINT_NOT_ALLOWED: 'Bu tarayıcının bildirim servisi desteklenmiyor.',
  PUSH_KEYS_INVALID: 'Tarayıcı geçersiz bir abonelik üretti; sayfayı yenileyip tekrar deneyin.',
}
const serverMessage = (e: unknown, dflt: string) => (e instanceof AdminApiError && SERVER_ERRORS[e.code]) || dflt

async function readyRegistration(win: Window): Promise<ServiceWorkerRegistration | null> {
  const sw = win.navigator.serviceWorker
  if (!sw) return null
  // Kayıt yoksa (geliştirme kipi: SW kaydedilmez) `ready` sonsuza dek bekler: kısa süre sınırı.
  return await Promise.race([sw.ready, new Promise<null>((r) => setTimeout(() => r(null), 8000))])
}

export function useBoWebPush(win: Window = window) {
  async function loadConfig(): Promise<BoPushConfig | null> {
    try {
      const r = await api.call('BackofficePrefsService/getPushConfig', {})
      return { enabled: r.enabled === true && !!r.publicKey, publicKey: r.publicKey ?? null, devices: Array.isArray(r.devices) ? r.devices : [] }
    } catch {
      return null
    }
  }

  async function currentSubscription(): Promise<PushSubscription | null> {
    try {
      const reg = await win.navigator.serviceWorker?.getRegistration()
      return (await reg?.pushManager?.getSubscription()) ?? null
    } catch {
      return null
    }
  }

  /** YALNIZ kullanıcı eylemiyle: izin → abonelik → sunucuya kayıt. Sunucu reddederse tarayıcı aboneliği geri alınır. */
  async function enable(publicKey: string): Promise<PushActionResult> {
    if (detectPushSupport(win) !== 'supported') return { ok: false, reason: 'unsupported', message: 'Bu cihazda anlık bildirim desteklenmiyor.' }
    let sub: PushSubscription | null = null
    try {
      const N = (win as Window & { Notification: typeof Notification }).Notification
      const permission = N.permission === 'granted' ? 'granted' : await N.requestPermission()
      if (permission === 'denied') return { ok: false, reason: 'denied', message: 'Bildirim izni reddedildi. Tarayıcı ayarlarından bu site için bildirimlere izin verin.' }
      if (permission !== 'granted') return { ok: false, reason: 'dismissed', message: 'Bildirim izni verilmedi.' }
      const reg = await readyRegistration(win)
      if (!reg?.pushManager) return { ok: false, reason: 'unsupported', message: 'Arka plan hizmeti hazır değil; sayfayı yenileyip tekrar deneyin.' }
      const key = urlBase64ToUint8Array(publicKey)
      sub = await reg.pushManager.getSubscription()
      if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
        await sub.unsubscribe() // sunucu anahtarı değişmiş
        sub = null
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource })
      const json = sub.toJSON()
      await api.call('BackofficePrefsService/subscribePush', {
        subscription: { endpoint: json.endpoint ?? '', expirationTime: json.expirationTime ?? null, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } },
        deviceLabel: deviceLabelFrom(win.navigator.userAgent, win.navigator.maxTouchPoints ?? 0),
      })
      return { ok: true }
    } catch (e) {
      if (sub) await sub.unsubscribe().catch(() => undefined) // yetim abonelik bırakma
      return e instanceof AdminApiError
        ? { ok: false, reason: 'server', message: serverMessage(e, 'Anlık bildirimler açılamadı — tekrar deneyin.') }
        : { ok: false, reason: 'error', message: 'Anlık bildirimler açılamadı — tekrar deneyin.' }
    }
  }

  /** Bu cihazda kapat: sunucudan sil + tarayıcı aboneliğini bırak. */
  async function disable(): Promise<PushActionResult> {
    try {
      const sub = await currentSubscription()
      if (!sub) return { ok: true }
      await api.call('BackofficePrefsService/unsubscribePush', { endpoint: sub.endpoint })
      await sub.unsubscribe().catch(() => undefined)
      return { ok: true }
    } catch (e) {
      return { ok: false, reason: 'server', message: serverMessage(e, 'Anlık bildirimler kapatılamadı — tekrar deneyin.') }
    }
  }

  /** Başka bir cihazı listeden kaldır (yalnız kendi cihazlarım). */
  async function removeDevice(id: string): Promise<boolean> {
    try {
      await api.call('BackofficePrefsService/unsubscribePush', { id })
      return true
    } catch {
      return false
    }
  }

  return { loadConfig, currentSubscription, enable, disable, removeDevice }
}
