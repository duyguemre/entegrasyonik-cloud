// MOB-08 / K55: istemci platform sınıfı -- önyüzün TEK kaynağı (müşteri uygulaması + backoffice).
// Backend eşi: backend/src/platform/core/context/clientPlatform.ts (değer listesi AYNI; iki tarafın testi sabit listeyi korur).
// İstemci sınıfı `X-Client-Platform` başlığıyla gönderir; sunucu izinli listeyle doğrular (yoksa UA'dan kaba sınıf).
// Ham UA/cihaz bilgisi GÖNDERİLMEZ ve saklanmaz; yalnız aşağıdaki sınıf değeri.
// Android kabuğu tanıma kuralı MOB-07 köprüsüyle AYNI (`./native/shell` isNativeShell: UA işareti + Capacitor.isNativePlatform()).
import { parseShellUserAgent } from './native/shell'

export const CLIENT_PLATFORM_HEADER = 'X-Client-Platform'

export const CLIENT_PLATFORMS = ['desktop_web', 'electron', 'mobile_web', 'pwa', 'android_app', 'unknown'] as const
export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number]
export type PlatformClass = 'desktop' | 'mobile' | 'unknown'
/** Sorgu/ekran süzgeci: ana sınıf ya da tek alt tür. */
export type PlatformFilter = Exclude<PlatformClass, 'unknown'> | ClientPlatform

export function platformClassOf(p: ClientPlatform): PlatformClass {
  if (p === 'desktop_web' || p === 'electron') return 'desktop'
  if (p === 'mobile_web' || p === 'pwa' || p === 'android_app') return 'mobile'
  return 'unknown'
}

/** Algılama girdileri (testte sahte ortam verilir). Hepsi isteğe bağlı: eksik sinyal = o yol atlanır. */
export interface PlatformEnv {
  /** Capacitor çalışma zamanı (yerel kabukta WebView'a enjekte edilir): `isNativePlatform()`. */
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string }
  /** Electron yerel köprüsü (DESK-00 preload; varsa). Yoksa UA'daki `Electron/` işareti yedektir. */
  ekDesktop?: unknown
  matchMedia?: (q: string) => { matches: boolean }
  navigator?: { userAgent?: string; standalone?: boolean; maxTouchPoints?: number; userAgentData?: { mobile?: boolean } }
}

function mq(env: PlatformEnv, q: string): boolean {
  try { return !!env.matchMedia?.(q).matches } catch { return false }
}

/** Dokunmatik/mobil cihaz mı? Öncelik: UA-CH `mobile` → kaba işaretçi + hover yok → UA işareti. Dar pencereli masaüstü mobil SAYILMAZ. */
function isMobileDevice(env: PlatformEnv): boolean {
  const nav = env.navigator
  if (typeof nav?.userAgentData?.mobile === 'boolean' && nav.userAgentData.mobile) return true
  if (mq(env, '(pointer: coarse)') && mq(env, '(hover: none)')) return true
  return /Android|iPhone|iPad|iPod|Mobile/i.test(nav?.userAgent ?? '')
}

/**
 * Platformu belirler (öncelik sırası):
 * 1. Android Capacitor kabuğu (UA `EntegrasyonikShell/…` işareti VE `Capacitor.isNativePlatform()`) → `android_app`
 * 2. Electron (köprü ya da UA) → `electron`
 * 3. Kurulu uygulama (display-mode standalone/fullscreen/minimal-ui ya da iOS `navigator.standalone`) + mobil cihaz → `pwa`
 *    (masaüstüne kurulu PWA → `desktop_web`; masaüstü/mobil ana kırılımı korunur)
 * 4. Mobil cihaz → `mobile_web`, değilse `desktop_web`
 */
export function detectClientPlatform(env: PlatformEnv | undefined = defaultEnv()): ClientPlatform {
  if (!env) return 'unknown'
  try {
    if (env.Capacitor?.isNativePlatform?.() === true && parseShellUserAgent(env.navigator?.userAgent ?? '') !== null) return 'android_app'
    if (env.ekDesktop || /\bElectron\//i.test(env.navigator?.userAgent ?? '')) return 'electron'
    const mobile = isMobileDevice(env)
    const installed = mq(env, '(display-mode: standalone)') || mq(env, '(display-mode: fullscreen)') || mq(env, '(display-mode: minimal-ui)') || env.navigator?.standalone === true
    if (installed && mobile) return 'pwa'
    return mobile ? 'mobile_web' : 'desktop_web'
  } catch {
    return 'unknown'
  }
}

function defaultEnv(): PlatformEnv | undefined {
  if (typeof window === 'undefined') return undefined
  const w = window as unknown as PlatformEnv & { matchMedia?: Window['matchMedia'] }
  return {
    Capacitor: w.Capacitor, ekDesktop: w.ekDesktop,
    matchMedia: typeof w.matchMedia === 'function' ? (q: string) => w.matchMedia!(q) : undefined,
    navigator: typeof navigator !== 'undefined' ? (navigator as PlatformEnv['navigator']) : undefined,
  }
}

let cached: ClientPlatform | undefined

/** Oturum boyunca sabit kabul edilen platform (ilk çağrıda hesaplanır). İstek başlığı için bunu kullanın. */
export function clientPlatform(): ClientPlatform {
  if (cached === undefined) cached = detectClientPlatform()
  return cached
}

/** Yalnız testler: önbelleği sıfırlar. */
export function resetClientPlatformCache(): void { cached = undefined }

/** RPC isteklerine eklenecek başlık nesnesi. */
export function clientPlatformHeaders(): Record<string, string> {
  return { [CLIENT_PLATFORM_HEADER]: clientPlatform() }
}
