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

// MOB-04 — web push (ADR-0029 Karar 4). İçerik sunucuda hassas veri içermez (başlık + kısa metin + uygulama içi yol).
// Gösterim her zaman yapılır (`userVisibleOnly`); bozuk/bilinmeyen yükte genel metin. Yalnız uygulama içi göreli yol açılır.
const PUSH_FALLBACK = { title: 'Entegrasyonik', body: 'Yeni bir bildiriminiz var.', url: '/notifications', tag: 'ek-push' }

/** Uygulama içi göreli yol mu ('/' ile başlar; '//' , '\\' ve denetim karakteri yok). Değilse bildirim merkezi. */
function safePushPath(p) {
  if (typeof p !== 'string' || p.charAt(0) !== '/' || p.charAt(1) === '/' || p.indexOf('\\') !== -1 || p.length > 300) return PUSH_FALLBACK.url
  for (let i = 0; i < p.length; i++) if (p.charCodeAt(i) < 0x20) return PUSH_FALLBACK.url
  return p
}

function pushContent(data) {
  let d = null
  try {
    d = data ? data.json() : null
  } catch (e) {
    d = null
  }
  if (!d || d.v !== 1) return PUSH_FALLBACK
  const text = (v, max, dflt) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : dflt)
  return {
    title: text(d.title, 80, PUSH_FALLBACK.title),
    body: text(d.body, 160, PUSH_FALLBACK.body),
    url: safePushPath(d.url),
    tag: text(d.tag, 64, PUSH_FALLBACK.tag),
    urgent: d.severity === 'critical' || d.severity === 'error',
  }
}

self.addEventListener('push', (event) => {
  const c = pushContent(event.data)
  event.waitUntil(
    self.registration.showNotification(c.title, {
      body: c.body,
      tag: c.tag,
      renotify: !!c.urgent,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: c.url },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const path = safePushPath(event.notification.data && event.notification.data.url)
  const target = new URL(path, self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          return client.focus().then((c) => (c && 'navigate' in c ? c.navigate(target) : c))
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined
    })
  )
})
