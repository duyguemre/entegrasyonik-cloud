/**
 * MOB-06 — backoffice PWA durumu (tek kaynak): güncelleme hazır mı, kurulum istemi var mı, iOS yönergesi gerekli mi.
 * Desen: uygulamanın MOB-01 `src/pwa/pwaState.ts`'i (backoffice uygulama kaynağını içe aktarmaz — static.test).
 * `registerServiceWorker.ts` yazar, `PwaPrompts.vue` okur. Saf yardımcılar `tests/pwa-state.test.ts`'te sınanır.
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

/** Yalnız "kurulum kartı kapatıldı" bayrağı ('1'); kişisel/oturum verisi yok. Uygulamanın anahtarından ayrı (`bo-` öneki). */
export const INSTALL_DISMISS_KEY = 'bo-pwa-install-dismissed'

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

/** Hangi kurulum ipucu gösterilir? Kuruluysa, kapatıldıysa, geniş ekranda ya da oturum yokken hiçbiri. */
export function installHint(opts: {
  standalone: boolean
  dismissed: boolean
  mobile: boolean
  signedIn: boolean
  hasPromptEvent: boolean
  iosSafari: boolean
}): InstallHint {
  if (opts.standalone || opts.dismissed || !opts.mobile || !opts.signedIn) return 'none'
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
