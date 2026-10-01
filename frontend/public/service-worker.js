// MOB-01 — minimal service worker: YALNIZ uygulama kabuğu + statik varlık önbelleği.
// Kural (BACKLOG MOB-01): API yanıtları ÖNBELLEĞE ALINMAZ (kiracı verisi cihazda kalmaz). Sınanan:
// `tests/pwa/service-worker.test.ts` (birim) + `e2e/preview/pwa.spec.ts` (üretim derlemesi).
//  - Gezinme (HTML): ağdan; ağ yoksa dürüst çevrimdışı ekranı (`/offline.html`). Eski HTML sunulmaz.
//  - `/assets/*` (Vite'ın içerik karmalı, değişmez dosyaları): önbellek önce, yoksa ağ + önbelleğe yaz.
//  - Kabuk dosyaları (ikon, manifest, çevrimdışı ekranı, tema betiği): kurulumda önbelleğe.
//  - Diğer her istek (API, başka origin, GET dışı, `/api/`): SW KARIŞMAZ — tarayıcı doğrudan ağa gider.
// Sürüm: derlemede `__EK_SW_VERSION__` değiştirilir (vite.config.mts `swVersionPlugin`) → dosya değişir → güncelleme bildirimi.
'use strict'

const VERSION = '__EK_SW_VERSION__'
const SHELL_CACHE = `ek-shell-${VERSION}`
const ASSET_CACHE = `ek-assets-${VERSION}`
const OFFLINE_URL = '/offline.html'
const SHELL_FILES = [
  OFFLINE_URL,
  '/manifest.json',
  '/favicon.svg',
  '/theme-boot.js',
  '/offline.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
]

/** Önbelleğe alınabilir mi? Yalnız aynı origin + GET + statik yol. API ve sorgu dizgili istekler ASLA. */
function isCacheableAsset(request, scopeOrigin) {
  if (request.method !== 'GET') return false
  const url = new URL(request.url)
  if (url.origin !== scopeOrigin) return false
  if (url.pathname.startsWith('/api/') || url.search) return false
  return url.pathname.startsWith('/assets/') || SHELL_FILES.includes(url.pathname)
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)))
  // skipWaiting YOK: yeni sürüm, kullanıcı "Yenile" deyince etkinleşir (açık formdaki veri kaybolmasın).
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const scopeOrigin = self.location.origin

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)))
    return
  }

  if (!isCacheableAsset(request, scopeOrigin)) return // API ve diğerleri: dokunma

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic' && new URL(request.url).pathname.startsWith('/assets/')) {
            const copy = response.clone()
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
    )
  )
})
