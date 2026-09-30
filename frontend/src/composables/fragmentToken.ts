/**
 * frontend/src/composables/fragmentToken.ts
 *
 * Faz 3 / C2a — e-posta bağlantısındaki `#t=<token>` parçası (davet `/invite`, sahiplik devri `/accept-ownership`;
 * API_ACCOUNT_LIFECYCLE.md §6, §9). Parça sunucu günlüğüne ve Referer'a hiç gitmez; FE okur okumaz
 * `history.replaceState` ile adresten SİLER (tarayıcı geçmişi / ekran paylaşımı / kopyalanan adres). Token yalnız
 * bellekte tutulur: router'a, sorgu parametresine, loga, analitiğe, yerel depoya YAZILMAZ.
 */

/** Token alfabesi: base64url / hex (256 bit → 43-64 karakter); tavan savunma amaçlı. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,256}$/

export interface LocationLike {
  hash: string
  pathname: string
  search: string
}

export interface HistoryLike {
  state: unknown
  replaceState(data: unknown, unused: string, url?: string | URL | null): void
}

/** `#t=...` (başka parça parametreleriyle birlikte de) içinden token; geçersizse boş dize. */
export function parseFragmentToken(hash: string): string {
  const raw = (hash || '').replace(/^#/, '')
  if (!raw) return ''
  let value = ''
  try {
    value = new URLSearchParams(raw).get('t') ?? ''
  } catch {
    value = ''
  }
  return TOKEN_PATTERN.test(value) ? value : ''
}

/**
 * Token'ı okur ve parçayı adresten siler (yol + sorgu korunur). Parça yoksa geçmişe dokunmaz.
 * Varsayılanlar tarayıcı `window.location` / `window.history`'dir; testler sahte nesne geçer.
 */
export function consumeFragmentToken(
  loc: LocationLike | undefined = typeof window !== 'undefined' ? window.location : undefined,
  hist: HistoryLike | undefined = typeof window !== 'undefined' ? window.history : undefined,
): string {
  if (!loc) return ''
  const token = parseFragmentToken(loc.hash)
  if (loc.hash && hist) hist.replaceState(hist.state, '', loc.pathname + loc.search)
  return token
}

// Sahiplik devri kabulü oturum ister: oturumu olmayan hedef önce giriş yapar ve SPA içinde geri döner. Token o arada
// yalnız modül belleğinde bekler (sayfa yenilenirse kaybolur → kullanıcı e-postadaki bağlantıyı yeniden açar).
let heldToken = ''

export function holdToken(token: string) {
  heldToken = TOKEN_PATTERN.test(token) ? token : ''
}

export function takeHeldToken(): string {
  const t = heldToken
  heldToken = ''
  return t
}
