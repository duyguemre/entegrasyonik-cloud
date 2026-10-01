/**
 * MOB-07 — Android kabuğu (Capacitor) köprüsü: müşteri uygulaması ve backoffice'in TEK kaynağı. Web derlemesi Capacitor'a
 * npm bağımlılığı TAŞIMAZ: kabuk WebView'e `window.Capacitor` (çekirdek + kayıtlı eklentiler) enjekte eder ve User-Agent'a
 * `EntegrasyonikShell/<sürüm> (<app|backoffice>; fcm=0|1)` ekler (frontend/mobile/android-shell/shell.flavors.mjs).
 * Tarayıcıda/PWA'da/Electron'da her işlev "yok" döner ve çağıran mevcut web yolunu kullanır.
 *
 * Eklentiler YALNIZ Camera, PushNotifications, Share. Yeni ekran yok: bu işlevler mevcut kamera/paylaş/push soyutlamalarının
 * arkasında çağrılır. İzin istemleri yalnız kullanıcı eylemiyle çağrılan işlevlerde (takePhoto/registerPush).
 */

export interface ShellInfo {
  version: string
  flavor: 'app' | 'backoffice'
  /** google-services.json ile derlendi mi (yerelde). Yoksa yerel push yok → web push yoluna düşülür. */
  fcm: boolean
}

interface PluginListenerHandle {
  remove: () => Promise<void>
}
interface CameraPlugin {
  getPhoto(o: Record<string, unknown>): Promise<{ base64String?: string; format?: string }>
}
interface SharePlugin {
  share(o: { title?: string; text?: string; url?: string; dialogTitle?: string }): Promise<unknown>
}
interface PushPlugin {
  requestPermissions(): Promise<{ receive: string }>
  checkPermissions(): Promise<{ receive: string }>
  register(): Promise<void>
  unregister?(): Promise<void>
  addListener(event: string, fn: (e: any) => void): Promise<PluginListenerHandle>
}
export interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: { Camera?: CameraPlugin; Share?: SharePlugin; PushNotifications?: PushPlugin }
}
type ShellWindow = Window & { Capacitor?: CapacitorGlobal }

const UA_RE = /\bEntegrasyonikShell\/([0-9A-Za-z.+-]{1,32}) \((app|backoffice); fcm=([01])\)/

/** Kabuk işareti (yalnız UA): sürüm, flavor, FCM. Kabuk dışında null. */
export function parseShellUserAgent(ua: string): ShellInfo | null {
  const m = UA_RE.exec(ua)
  return m ? { version: m[1], flavor: m[2] as ShellInfo['flavor'], fcm: m[3] === '1' } : null
}

/** Capacitor yerel platformunda mı (Android kabuğu)? UA işareti VE `Capacitor.isNativePlatform()` birlikte gerekir. */
export function isNativeShell(win: Window = window): boolean {
  const cap = (win as ShellWindow).Capacitor
  return parseShellUserAgent(win.navigator?.userAgent ?? '') !== null && cap?.isNativePlatform?.() === true
}

export function shellInfo(win: Window = window): ShellInfo | null {
  return isNativeShell(win) ? parseShellUserAgent(win.navigator.userAgent) : null
}

function plugins(win: Window): CapacitorGlobal['Plugins'] {
  return isNativeShell(win) ? (win as ShellWindow).Capacitor?.Plugins : undefined
}

// ---------------------------------------------------------------- Kamera
export function hasNativeCamera(win: Window = window): boolean {
  return typeof plugins(win)?.Camera?.getPhoto === 'function'
}

const isCancel = (e: unknown) => /cancel/i.test(String((e as { message?: unknown })?.message ?? e))

/**
 * Yerel kamerayla tek fotoğraf → `File` (JPEG). Kullanıcı vazgeçerse `null`. Çıktı mevcut hazırlama hattına (küçültme +
 * EXIF/konum temizliği) aynen girer; burada yalnız uzun kenar üst sınırı verilir (bellek).
 */
export async function takeNativePhoto(win: Window = window, maxLongEdge = 2400): Promise<File | null> {
  const cam = plugins(win)?.Camera
  if (!cam) return null
  try {
    const p = await cam.getPhoto({ source: 'CAMERA', resultType: 'base64', quality: 90, width: maxLongEdge, height: maxLongEdge, correctOrientation: true, saveToGallery: false })
    if (!p.base64String) return null
    const bin = atob(p.base64String)
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const ext = p.format === 'png' ? 'png' : 'jpeg'
    return new File([bytes], `kamera.${ext === 'png' ? 'png' : 'jpg'}`, { type: `image/${ext}` })
  } catch (e) {
    if (isCancel(e)) return null
    throw e
  }
}

// ---------------------------------------------------------------- Paylaş
/** Paylaşım sayfası: kabukta yerel Share, tarayıcıda Web Share API. İkisi de yoksa ya da kullanıcı vazgeçerse false. */
export async function shareContent(data: { title?: string; text?: string; url?: string }, win: Window = window): Promise<boolean> {
  try {
    const share = plugins(win)?.Share
    if (share) {
      await share.share({ ...data, dialogTitle: data.title })
      return true
    }
    const nav = win.navigator as Navigator & { share?: (d: ShareData) => Promise<void> }
    if (typeof nav.share === 'function') {
      await nav.share(data)
      return true
    }
  } catch {
    // vazgeçildi ya da desteklenmiyor
  }
  return false
}

// ---------------------------------------------------------------- Push (FCM)
/** Yerel push mümkün mü: kabuk + FCM ile derlenmiş + eklenti kayıtlı. Değilse çağıran web push yoluna düşer. */
export function hasNativePush(win: Window = window): boolean {
  return shellInfo(win)?.fcm === true && typeof plugins(win)?.PushNotifications?.register === 'function'
}

export type NativePushResult = { ok: true; token: string } | { ok: false; reason: 'unsupported' | 'denied' | 'error' }

/** YALNIZ kullanıcı eylemiyle: izin → FCM kaydı → cihaz belirteci. Belirteç sunucuya çağıran tarafından gönderilir. */
export async function registerNativePush(win: Window = window, timeoutMs = 15000): Promise<NativePushResult> {
  const push = hasNativePush(win) ? plugins(win)?.PushNotifications : undefined
  if (!push) return { ok: false, reason: 'unsupported' }
  try {
    const perm = await push.requestPermissions()
    if (perm.receive !== 'granted') return { ok: false, reason: 'denied' }
    const handles: PluginListenerHandle[] = []
    const token = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs)
      const done = (v: string | null) => { clearTimeout(timer); resolve(v) }
      void push.addListener('registration', (t: { value?: string }) => done(typeof t?.value === 'string' ? t.value : null)).then((h) => handles.push(h))
      void push.addListener('registrationError', () => done(null)).then((h) => handles.push(h))
      push.register().catch(() => done(null))
    })
    await Promise.all(handles.map((h) => h.remove().catch(() => undefined)))
    return token ? { ok: true, token } : { ok: false, reason: 'error' }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

/**
 * Bildirime dokunulunca (uygulama kapalı/arka plandayken) yalnız UYGULAMA İÇİ göreli yola gidilir (`data.url`; açık yönlendirme yok).
 * Kabuk dışında no-op. Dönen işlev dinleyiciyi kaldırır.
 */
export function onNativePushOpen(navigate: (path: string) => void, win: Window = window): () => void {
  const push = hasNativePush(win) ? plugins(win)?.PushNotifications : undefined
  if (!push) return () => undefined
  let handle: PluginListenerHandle | undefined
  void push
    .addListener('pushNotificationActionPerformed', (a: { notification?: { data?: { url?: unknown } } }) => {
      const p = safeInternalPath(a?.notification?.data?.url)
      if (p) navigate(p)
    })
    .then((h) => (handle = h))
  return () => void handle?.remove()
}

/** '/' ile başlayan, '//', '\\' ve denetim karakteri içermeyen yol; değilse undefined. */
export function safeInternalPath(p: unknown): string | undefined {
  if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//') || p.includes('\\') || p.length > 300) return undefined
  for (let i = 0; i < p.length; i++) if (p.charCodeAt(i) < 0x20) return undefined
  return p
}

/** Kısa cihaz adı (PII değil): kabukta "Android · Uygulama" / "Android · Yönetim". */
export function nativeDeviceLabel(win: Window = window): string | undefined {
  const s = shellInfo(win)
  return s ? `Android · ${s.flavor === 'backoffice' ? 'Yönetim' : 'Uygulama'}` : undefined
}
