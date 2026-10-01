/**
 * MOB-01 — PWA durumu (tek kaynak): güncelleme hazır mı, kurulum istemi var mı, iOS yönergesi gerekli mi.
 * `registerServiceWorker.ts` yazar, `PwaPrompts.vue` okur. Saf yardımcılar `tests/pwa/pwa-state.test.ts`'te sınanır.
 * Masaüstü kabuğunda (Electron, preload `entegrasyonikDesktop`) service worker ve kurulum istemi YOKTUR.
 */
import { reactive } from 'vue'

/** Chromium `beforeinstallprompt` olayının kullandığımız kısmı. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const pwaState = reactive({
  /** Yeni SW kuruldu, bekliyor → "Yeni sürüm hazır". */
  waitingWorker: null as ServiceWorker | null,
  /** Android/Chromium kurulum istemi (ertelenmiş). */
  installEvent: null as InstallPromptEvent | null,
})

export const INSTALL_DISMISS_KEY = 'ek-pwa-install-dismissed'

export function isDesktopShell(win: Window & { entegrasyonikDesktop?: { isDesktop?: boolean } } = window): boolean {
  return !!win.entegrasyonikDesktop?.isDesktop
}

/** Ana ekrandan açılmış mı (zaten kurulu)? */
export function isStandalone(win: Window = window): boolean {
  const nav = win.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || !!win.matchMedia?.('(display-mode: standalone)').matches
}

/** iOS/iPadOS Safari (kurulum istemi yok; "Paylaş → Ana Ekrana Ekle" yönergesi gösterilir). */
export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return ios && /Safari/.test(ua) && !otherBrowser
}

export type InstallHint = 'none' | 'android' | 'ios'

/** Hangi kurulum ipucu gösterilir? Masaüstü kabuğunda, kuruluysa, kapatıldıysa veya geniş ekranda hiçbiri. */
export function installHint(opts: {
  desktopShell: boolean
  standalone: boolean
  dismissed: boolean
  mobile: boolean
  hasPromptEvent: boolean
  iosSafari: boolean
}): InstallHint {
  if (opts.desktopShell || opts.standalone || opts.dismissed || !opts.mobile) return 'none'
  if (opts.hasPromptEvent) return 'android'
  if (opts.iosSafari) return 'ios'
  return 'none'
}

export function readDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function writeDismissed(): void {
  try {
    localStorage.setItem(INSTALL_DISMISS_KEY, '1')
  } catch {
    // depolama kapalı: yalnız bu oturumda gizlenir
  }
}

/** "Yenile": bekleyen SW'yi etkinleştir; `controllerchange` sayfayı bir kez yeniler (registerServiceWorker.ts). */
export function applyUpdate(): void {
  pwaState.waitingWorker?.postMessage({ type: 'SKIP_WAITING' })
}
