/**
 * OAuth açılır pencere (popup) mesajı doğrulaması (R7 / G-06, BR-34).
 *
 * `authPopup.html` yönlendirme parametrelerini `window.opener.postMessage(...)` ile yollar. Dinleyici
 * yalnızca `state` eşleşmesine bakarsa, açık herhangi bir başka pencere/çerçeve sahte bir
 * `redirectParams` mesajı gönderebilir. Mesaj ancak (a) uygulamanın KENDİ origin'inden ve (b) bizim
 * açtığımız popup penceresinden geliyorsa güvenilir sayılır.
 */
export interface PopupMessageLike {
  origin: string
  source: unknown
  data?: any
}

export function isTrustedPopupMessage(event: PopupMessageLike, expected: { origin: string; popup: unknown }): boolean {
  if (!event || event.origin !== expected.origin) return false
  if (!expected.popup || event.source !== expected.popup) return false
  return event.data?.type === 'redirectParams'
}
