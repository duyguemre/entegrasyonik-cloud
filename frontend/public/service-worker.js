const CACHE_NAME = 'premium-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html',
  '/icons/icon-192.jpg',
  '/icons/icon-512.png',
  // CSS ve JS dosyalarını da buraya eklemeni öneririm
];

// INSTALL: Dosyaları önbelleğe al
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching Assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // SW'nin hemen aktif olmasını sağlar
});

// ACTIVATE: Eski cache'leri temizle (Versiyon değiştiğinde işe yarar)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing Old Cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  return self.clients.claim(); // Hemen sayfayı kontrol etmeye başla
});

// FETCH: Bağlantı koptuğunda offline.html'i göster
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => {
      // Sadece sayfa (navigation) isteklerinde offline.html döndür
      if (e.request.mode === 'navigate') {
        return caches.match('/offline.html');
      }
      // Diğer istekler için cache'e bak (Görsel vb.)
      return caches.match(e.request);
    })
  );
});