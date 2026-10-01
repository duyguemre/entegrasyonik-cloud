// DESK-00 — Electron kabuğu güvenlik politikası (saf fonksiyonlar; `main.js` kullanır, `tests/security/electron-hardening.test.ts` sınar).
// K36: masaüstü = aynı web derlemesi; kabuk yalnız TEK izinli origin'i gösterir. Yerel köprü (DESK-01..04) burada YOK.
'use strict'

/** Üretimde kabuğun açtığı tek origin. */
const PROD_APP_ORIGIN = 'https://app.entegrasyonik.com'
/** Geliştirmede Vite dev sunucusu (3000 kullanıcının başka projesine ayrılmış). */
const DEV_APP_ORIGIN = 'http://localhost:3020'
/** Geliştirmede backend (frontend `.env.example` → VITE_API_BASE_URL). */
const DEV_API_ORIGINS = ['http://127.0.0.1:5001', 'http://localhost:5001']

/** Tüm pencerelerde aynı, sertleştirilmiş webPreferences (Electron güvenlik kontrol listesi 2-4, 6, 8-9). */
const SECURE_WEB_PREFERENCES = Object.freeze({
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  nodeIntegrationInSubFrames: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  experimentalFeatures: false,
  webviewTag: false,
  spellcheck: false,
})

function appOrigin(isDev) {
  return isDev ? DEV_APP_ORIGIN : PROD_APP_ORIGIN
}

function parse(url) {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** Ana pencere yalnız bu origin'e gidebilir. */
function isAllowedOrigin(url, isDev) {
  const u = parse(url)
  return !!u && u.origin === appOrigin(isDev)
}

/** Sistem tarayıcısında açılabilecek dış bağlantı (yalnız https; geliştirmede http de). */
function isExternalOpenable(url, isDev) {
  const u = parse(url)
  if (!u) return false
  if (u.protocol === 'https:') return true
  if (u.protocol === 'mailto:') return true
  return isDev && u.protocol === 'http:'
}

/**
 * `window.open` / `target=_blank` kararı.
 *  - 'popup'    : uygulama içi açılır pencere (OAuth açılır penceresi `features` ile açılır → disposition 'new-window';
 *                 barkod yazdırma `about:blank`). Aynı sertleştirilmiş tercihlerle, preload'suz.
 *  - 'external' : düz bağlantı (fatura PDF'i, kargo takip) → sistem tarayıcısı.
 *  - 'deny'     : diğer her şey (file:, javascript:, data:, özel protokoller).
 */
function classifyWindowOpen({ url, disposition }, isDev) {
  if (url === 'about:blank') return 'popup'
  const u = parse(url)
  if (!u) return 'deny'
  const web = u.protocol === 'https:' || (isDev && u.protocol === 'http:')
  if (disposition === 'new-window' && web) return 'popup'
  if (isExternalOpenable(url, isDev)) return 'external'
  return 'deny'
}

/**
 * Kabuğun ana belgeye eklediği ZORUNLU CSP. Sunucunun Report-Only CSP'si (nginx-security-headers.conf) ile aynı aile;
 * tarayıcı birden çok CSP'yi kesişim olarak uygular. `unsafe-eval` YOK (vue-i18n JIT derleme — vite.config.mts).
 */
function buildCsp(isDev) {
  const connect = isDev
    ? ["'self'", ...DEV_API_ORIGINS, 'ws://localhost:3020']
    : ["'self'", 'https://*.entegrasyonik.com']
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

/** İzin istekleri: yalnız uygulama origin'inden ve yalnız bu küçük listeden. Kamera/mikrofon/konum vb. reddedilir. */
const ALLOWED_PERMISSIONS = Object.freeze(['clipboard-sanitized-write', 'fullscreen'])

function isPermissionAllowed(permission, requestingUrl, isDev) {
  return ALLOWED_PERMISSIONS.includes(permission) && isAllowedOrigin(requestingUrl, isDev)
}

module.exports = {
  PROD_APP_ORIGIN,
  DEV_APP_ORIGIN,
  SECURE_WEB_PREFERENCES,
  ALLOWED_PERMISSIONS,
  appOrigin,
  isAllowedOrigin,
  isExternalOpenable,
  classifyWindowOpen,
  buildCsp,
  isPermissionAllowed,
}
