// sw.js - Service Worker Dosyası

const CACHE_NAME = 'ssport-pusula-v1';
const urlsToCache = [
  './',
  './index.html'
];

// Yükleme İşlemi
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Önbellek açıldı');
        return cache.addAll(urlsToCache);
      })
  );
});

// İstekleri Yakalama (Offline çalışma mantığı)
self.addEventListener('fetch', function(event) {
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Önbellekte varsa onu döndür, yoksa internetten çek
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
