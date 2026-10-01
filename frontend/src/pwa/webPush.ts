/**
 * MOB-04 — web push istemcisi (ADR-0029 Karar 4 kanalı). Tek kaynak: cihaz desteği, izin, abonelik.
 *
 * Kurallar:
 *  - İzin YALNIZ kullanıcı eylemiyle istenir (`enablePush` bir düğme tıklamasından çağrılır; sayfa açılışında istem yok).
 *  - iOS/iPadOS: push yalnız ana ekrana eklenmiş PWA'da (16.4+). Safari sekmesinde dürüst açıklama gösterilir.
 *  - Masaüstü kabuğunda (Electron) push yok: sistem bildirimi kabuğun işi (DESK) — arayüz gizlenir.
 *  - Sunucu kanalı kapalıysa (`getPushConfig.enabled=false`, VAPID yok) arayüz gizlenir.
 *  - Android kabuğu (MOB-07, Capacitor): WebView'de Web Push yok → FCM cihaz belirteci (`@entegrasyonik/ui/native`). Kabuk FCM'siz
 *    derlendiyse ya da sunucuda FCM kapalıysa "desteklenmiyor" gösterilir. Bu cihazın belirteci yalnız bu cihazda tutulur (kapatmak için).
 * Backend: `NotificationService/{getPushConfig,subscribePush,unsubscribePush}`; ileti içeriği sunucuda hassas veri içermez.
 */
import useRestApi from '@/composables/restapi'
import logger from '@/composables/logger'
import { apiCode, isApiError } from '@/composables/apiErrors'
import { isDesktopShell, isStandalone } from '@/pwa/pwaState'
import { hasNativePush, isNativeShell, nativeDeviceLabel, registerNativePush } from '@entegrasyonik/ui/native'

export type PushSupport =
  | 'desktop-shell' // Electron: gizli
  | 'ios-install' // iOS Safari sekmesi: önce "Ana Ekrana Ekle"
  | 'ios-unsupported' // iOS kurulu ama 16.4 öncesi (PushManager yok)
  | 'unsupported' // tarayıcı push desteklemiyor / güvenli bağlam değil
  | 'supported'

export interface PushDevice {
  id: string
  deviceLabel: string | null
  createdAt: string
  lastSuccessAt: string | null
}

export interface PushConfig {
  enabled: boolean
  publicKey: string | null
  /** Sunucuda FCM (Android kabuğu yerel push) açık mı. */
  fcm: boolean
  devices: PushDevice[]
}

/** Bu cihazın FCM belirteci (yalnız Android kabuğunda; kişisel/oturum verisi değil — "bu cihazda kapat" için). */
export const NATIVE_TOKEN_KEY = 'ek-native-push-token'
function readNativeToken(): string | null {
  try {
    return localStorage.getItem(NATIVE_TOKEN_KEY)
  } catch {
    return null
  }
}
function writeNativeToken(v: string | null): void {
  try {
    if (v) localStorage.setItem(NATIVE_TOKEN_KEY, v)
    else localStorage.removeItem(NATIVE_TOKEN_KEY)
  } catch {
    // depolama kapalı: yalnız sunucu kaydı kalır (cihaz listesinden kaldırılabilir)
  }
}

type Win = Window & { entegrasyonikDesktop?: { isDesktop?: boolean } }

export function isIos(ua: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
}

/** Bu cihazda push mümkün mü (izin durumundan bağımsız). */
export function detectPushSupport(win: Win = window): PushSupport {
  if (isNativeShell(win)) return hasNativePush(win) ? 'supported' : 'unsupported'
  if (isDesktopShell(win)) return 'desktop-shell'
  const nav = win.navigator
  const hasApis = 'serviceWorker' in nav && 'PushManager' in win && 'Notification' in win
  if (isIos(nav.userAgent, nav.maxTouchPoints ?? 0)) {
    if (!isStandalone(win)) return 'ios-install'
    return hasApis ? 'supported' : 'ios-unsupported'
  }
  if (!hasApis || win.isSecureContext === false) return 'unsupported'
  return 'supported'
}

export type PermissionState = 'default' | 'granted' | 'denied'

export function currentPermission(win: Window = window): PermissionState {
  const n = (win as Window & { Notification?: { permission?: string } }).Notification
  const p = n?.permission
  return p === 'granted' || p === 'denied' ? p : 'default'
}

/** Kullanıcıya gösterilen kısa cihaz adı (PII değil): "Android · Chrome", "iPhone · Safari", "Windows · Edge". */
export function deviceLabelFrom(ua: string, maxTouchPoints = 0): string {
  const os = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPod/.test(ua)
      ? 'iPhone'
      : /iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
        ? 'iPad'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Macintosh|Mac OS X/.test(ua)
            ? 'Mac'
            : /Linux|CrOS/.test(ua)
              ? 'Linux'
              : 'Cihaz'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser/.test(ua)
      ? 'Samsung Internet'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Firefox\/|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Tarayıcı'
  return `${os} · ${browser}`
}

/** VAPID açık anahtarı (base64url) → `applicationServerKey`. */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false
  const x = new Uint8Array(a)
  return x.length === b.length && x.every((v, i) => v === b[i])
}

export function normalizePushConfig(res: any): PushConfig {
  const devices = Array.isArray(res?.devices) ? res.devices : []
  const publicKey = typeof res?.publicKey === 'string' && res.publicKey.length > 0 ? res.publicKey : null
  const fcm = res?.fcm === true
  return {
    enabled: res?.enabled === true && (publicKey !== null || fcm),
    publicKey,
    fcm,
    devices: devices
      .filter((d: any) => d && typeof d.id === 'string')
      .map((d: any) => ({
        id: d.id,
        deviceLabel: typeof d.deviceLabel === 'string' ? d.deviceLabel : null,
        createdAt: String(d.createdAt ?? ''),
        lastSuccessAt: d.lastSuccessAt ? String(d.lastSuccessAt) : null,
      })),
  }
}

/** Bu cihazda kullanılabilir mi: Android kabuğunda sunucu FCM'i, tarayıcıda VAPID açık anahtarı gerekir. */
export function pushUsableHere(cfg: PushConfig | null, win: Window = window): boolean {
  if (!cfg?.enabled) return false
  return isNativeShell(win) ? cfg.fcm : cfg.publicKey !== null
}

export type PushActionResult = { ok: true } | { ok: false; reason: 'denied' | 'dismissed' | 'unsupported' | 'server' | 'error'; message: string }

const SERVER_ERRORS: Record<string, string> = {
  PUSH_DISABLED: 'Anlık bildirimler şu an kullanılamıyor.',
  PUSH_ENDPOINT_NOT_ALLOWED: 'Bu tarayıcının bildirim servisi desteklenmiyor.',
  PUSH_KEYS_INVALID: 'Tarayıcı geçersiz bir abonelik üretti; sayfayı yenileyip tekrar deneyin.',
  PUSH_TOKEN_INVALID: 'Cihaz bildirim kaydı geçersiz; uygulamayı yeniden açıp tekrar deneyin.',
  IMPERSONATION_READ_ONLY: 'Destek görünümünde bildirim ayarı değiştirilemez.',
}

async function readyRegistration(win: Window): Promise<ServiceWorkerRegistration | null> {
  const sw = win.navigator.serviceWorker
  if (!sw) return null
  // Kayıt yoksa `ready` sonsuza dek bekler (geliştirme kipi): kısa süre sınırı.
  return await Promise.race([sw.ready, new Promise<null>((r) => setTimeout(() => r(null), 8000))])
}

export function useWebPush(win: Window = window) {
  const restApi = useRestApi()

  async function loadConfig(): Promise<PushConfig | null> {
    try {
      const res: any = await restApi.post('NotificationService/getPushConfig', {})
      if (isApiError(res) || !res?.result) return null
      return normalizePushConfig(res)
    } catch (error) {
      logger.error('Anlık bildirim durumu alınamadı', { module: 'webPush', op: 'loadConfig', error })
      return null
    }
  }

  /** Bu tarayıcının mevcut aboneliği (yoksa null). İzin istemez. */
  async function currentSubscription(): Promise<PushSubscription | null> {
    try {
      const reg = await win.navigator.serviceWorker?.getRegistration()
      return (await reg?.pushManager?.getSubscription()) ?? null
    } catch {
      return null
    }
  }

  /** Bu cihaz abone mi (tarayıcı aboneliği ya da kabukta saklı FCM belirteci). İzin istemez. */
  async function isSubscribedHere(): Promise<boolean> {
    if (isNativeShell(win)) return readNativeToken() !== null
    return (await currentSubscription()) !== null
  }

  /** MOB-07: Android kabuğu — izin → FCM belirteci → sunucuya kayıt. */
  async function enableNative(): Promise<PushActionResult> {
    const r = await registerNativePush(win)
    if (!r.ok) {
      if (r.reason === 'denied') return { ok: false, reason: 'denied', message: 'Bildirim izni reddedildi. Telefonun Ayarlar > Uygulamalar > Entegrasyonik > Bildirimler bölümünden izin verin.' }
      return { ok: false, reason: r.reason === 'unsupported' ? 'unsupported' : 'error', message: 'Anlık bildirimler açılamadı — tekrar deneyin.' }
    }
    const res: any = await restApi.post('NotificationService/subscribePush', { fcmToken: r.token, deviceLabel: nativeDeviceLabel(win) })
    if (!isApiError(res) && res?.result) {
      writeNativeToken(r.token)
      return { ok: true }
    }
    const code = apiCode(res)
    return { ok: false, reason: 'server', message: (code && SERVER_ERRORS[code]) || 'Anlık bildirimler açılamadı — tekrar deneyin.' }
  }

  /** YALNIZ kullanıcı eylemiyle çağrılır: izin → abonelik → sunucuya kayıt. Kabukta `publicKey` kullanılmaz (FCM). */
  async function enablePush(publicKey: string | null): Promise<PushActionResult> {
    if (detectPushSupport(win as Win) !== 'supported') return { ok: false, reason: 'unsupported', message: 'Bu cihazda anlık bildirim desteklenmiyor.' }
    if (isNativeShell(win)) {
      try {
        return await enableNative()
      } catch (error) {
        logger.error('Anlık bildirim açılamadı', { module: 'webPush', op: 'enableNative', error })
        return { ok: false, reason: 'error', message: 'Anlık bildirimler açılamadı — tekrar deneyin.' }
      }
    }
    if (!publicKey) return { ok: false, reason: 'unsupported', message: 'Bu cihazda anlık bildirim desteklenmiyor.' }
    try {
      const N = (win as Window & { Notification: typeof Notification }).Notification
      const permission = N.permission === 'granted' ? 'granted' : await N.requestPermission()
      if (permission === 'denied') return { ok: false, reason: 'denied', message: 'Bildirim izni reddedildi. Tarayıcı ayarlarından bu site için bildirimlere izin verin.' }
      if (permission !== 'granted') return { ok: false, reason: 'dismissed', message: 'Bildirim izni verilmedi.' }
      const reg = await readyRegistration(win)
      if (!reg?.pushManager) return { ok: false, reason: 'unsupported', message: 'Uygulama arka plan hizmeti hazır değil; sayfayı yenileyip tekrar deneyin.' }
      const key = urlBase64ToUint8Array(publicKey)
      let sub = await reg.pushManager.getSubscription()
      if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
        await sub.unsubscribe() // sunucu anahtarı değişmiş: eski abonelik geçersiz
        sub = null
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource })
      const json = sub.toJSON()
      const res: any = await restApi.post('NotificationService/subscribePush', {
        subscription: { endpoint: json.endpoint, expirationTime: json.expirationTime ?? null, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } },
        deviceLabel: deviceLabelFrom(win.navigator.userAgent, win.navigator.maxTouchPoints ?? 0),
      })
      if (!isApiError(res) && res?.result) return { ok: true }
      await sub.unsubscribe().catch(() => undefined) // sunucu kaydetmediyse tarayıcıda yetim abonelik bırakma
      const code = apiCode(res)
      return { ok: false, reason: 'server', message: (code && SERVER_ERRORS[code]) || 'Anlık bildirimler açılamadı — tekrar deneyin.' }
    } catch (error) {
      logger.error('Anlık bildirim açılamadı', { module: 'webPush', op: 'enable', error })
      return { ok: false, reason: 'error', message: 'Anlık bildirimler açılamadı — tekrar deneyin.' }
    }
  }

  /** Bu cihazda kapat: sunucudan sil + tarayıcı aboneliğini (kabukta saklı belirteci) bırak. */
  async function disablePush(): Promise<PushActionResult> {
    try {
      if (isNativeShell(win)) {
        const token = readNativeToken()
        if (!token) return { ok: true }
        const res: any = await restApi.post('NotificationService/unsubscribePush', { fcmToken: token })
        if (isApiError(res) || !res?.result) {
          const code = apiCode(res)
          return { ok: false, reason: 'server', message: (code && SERVER_ERRORS[code]) || 'Anlık bildirimler kapatılamadı — tekrar deneyin.' }
        }
        writeNativeToken(null)
        return { ok: true }
      }
      const sub = await currentSubscription()
      if (!sub) return { ok: true }
      const res: any = await restApi.post('NotificationService/unsubscribePush', { endpoint: sub.endpoint })
      if (isApiError(res) || !res?.result) {
        const code = apiCode(res)
        return { ok: false, reason: 'server', message: (code && SERVER_ERRORS[code]) || 'Anlık bildirimler kapatılamadı — tekrar deneyin.' }
      }
      await sub.unsubscribe().catch(() => undefined)
      return { ok: true }
    } catch (error) {
      logger.error('Anlık bildirim kapatılamadı', { module: 'webPush', op: 'disable', error })
      return { ok: false, reason: 'error', message: 'Anlık bildirimler kapatılamadı — tekrar deneyin.' }
    }
  }

  /** Başka bir cihazı listeden kaldır (kimlikle; yalnız kendi cihazlarım). */
  async function removeDevice(id: string): Promise<boolean> {
    try {
      const res: any = await restApi.post('NotificationService/unsubscribePush', { id })
      return !isApiError(res) && res?.result === true
    } catch (error) {
      logger.error('Cihaz kaldırılamadı', { module: 'webPush', op: 'removeDevice', error })
      return false
    }
  }

  return { loadConfig, currentSubscription, isSubscribedHere, enablePush, disablePush, removeDevice }
}
