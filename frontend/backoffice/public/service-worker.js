// MOB-06 — backoffice (admin.entegrasyonik.com) minimal service worker: YALNIZ yönetim kabuğu + statik varlık önbelleği.
// Desen: uygulamanın MOB-01 SW'si (frontend/public/service-worker.js); bu dosya backoffice'e özgü ve AYRI kökende çalışır
// (kendi origin'i, kendi kapsamı `/`, kendi önbellek önekleri `bo-*`) — uygulama PWA'sıyla çakışmaz.
// Kural: /admin-api ve /api yanıtları ÖNBELLEĞE ALINMAZ (müşteri/platform verisi cihazda kalmaz). Sınanan:
// `backoffice/tests/pwa-sw.test.ts` (birim, gerçek betik VM'de) + `backoffice/e2e/preview/pwa.spec.ts` (üretim derlemesi).
//  - Gezinme (HTML): ağdan; ağ yoksa dürüst çevrimdışı ekranı (`/offline.html`). Eski HTML sunulmaz.
//  - `/assets/*` (Vite'ın içerik karmalı, değişmez dosyaları): önbellek önce, yoksa ağ + önbelleğe yaz.
//  - Kabuk dosyaları (ikon, manifest, çevrimdışı ekranı, tema betiği): kurulumda önbelleğe.
//  - Diğer her istek (API, /health, başka origin, GET dışı, sorgulu): SW KARIŞMAZ — tarayıcı doğrudan ağa gider.
// Sürüm: derlemede `__BO_SW_VERSION__` değiştirilir (backoffice/vite.config.mts `swVersionPlugin`) → güncelleme bildirimi.
'use strict'

const VERSION = '__BO_SW_VERSION__'
const SHELL_CACHE = `bo-shell-${VERSION}`
const ASSET_CACHE = `bo-assets-${VERSION}`
const OFFLINE_URL = '/offline.html'
const SHELL_FILES = [
  OFFLINE_URL,
  '/offline.js',
  '/manifest.json',
  '/favicon.svg',
  '/theme-boot.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
]

/** Önbelleğe alınabilir mi? Yalnız aynı origin + GET + statik yol. API ve sorgu dizgili istekler ASLA. */
function isCacheableAsset(request, scopeOrigin) {
  if (request.method !== 'GET') return false
  const url = new URL(request.url)
  if (url.origin !== scopeOrigin) return false
  if (url.pathname.startsWith('/admin-api/') || url.pathname.startsWith('/api/') || url.search) return false
  return url.pathname.startsWith('/assets/') || SHELL_FILES.includes(url.pathname)
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)))
  // skipWaiting YOK: yeni sürüm, yönetici "Yenile" deyince etkinleşir (yarım kalmış gerekçe/diyalog kaybolmasın).
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Yalnız kendi eski sürümlerimizi siler (`bo-` öneki); başka önbelleğe dokunmaz.
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bo-') && k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))))
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
