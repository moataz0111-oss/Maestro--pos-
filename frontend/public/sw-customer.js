// Service Worker for Customer Menu PWA
// v3: network-first للمستندات والمانيفست (يضمن وصول التحديثات فوراً بدل الكاش القديم)
const CACHE_NAME = 'customer-menu-v15';
const urlsToCache = [
  '/menu.html',
  '/icons/customer-icon-192.png',
  '/icons/customer-icon-512.png'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // API: شبكة فقط (لا كاش إطلاقاً)
  if (url.pathname.startsWith('/api/')) return;

  // المستندات (التنقّل) والمانيفست: شبكة أولاً، ثم الكاش عند انقطاع الإنترنت
  if (req.mode === 'navigate' || req.destination === 'document' || url.pathname.includes('manifest')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('/menu.html')))
    );
    return;
  }

  // الأصول الثابتة (أيقونات/صور): كاش أولاً ثم شبكة
  event.respondWith(
    caches.match(req).then((response) => {
      if (response) return response;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && (req.destination === 'image' || req.destination === 'font')) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});

// Activate event: حذف الكاشات القديمة والسيطرة فوراً
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});
