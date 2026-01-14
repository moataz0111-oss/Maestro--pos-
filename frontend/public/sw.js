const CACHE_NAME = 'maestro-app-v3';
const STATIC_CACHE = 'maestro-static-v3';
const DYNAMIC_CACHE = 'maestro-dynamic-v3';

// الملفات الأساسية للتخزين المؤقت
const STATIC_FILES = [
  '/',
  '/driver',
  '/login',
  '/manifest.json',
  '/manifest-admin.json',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-152.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png'
];

// الملفات التي يجب تحديثها دائماً
const NETWORK_ONLY = [
  '/api/',
  '/socket'
];

// Install - تخزين الملفات الأساسية
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v3...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static files');
        // تخزين كل ملف على حدة لتجنب الفشل الكامل
        return Promise.allSettled(
          STATIC_FILES.map(file => 
            cache.add(file).catch(err => console.log(`[SW] Failed to cache ${file}:`, err))
          )
        );
      })
      .then(() => {
        console.log('[SW] Static files cached successfully');
        return self.skipWaiting();
      })
      .catch((err) => {
        console.log('[SW] Cache failed:', err);
      })
  );
});

// Activate - تنظيف الكاش القديم
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v3...');
  const currentCaches = [CACHE_NAME, STATIC_CACHE, DYNAMIC_CACHE];
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => !currentCaches.includes(name))
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim();
      })
  );
});

// Fetch - استراتيجيات مختلفة حسب نوع الطلب
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // تجاهل الطلبات غير HTTP/HTTPS
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // تجاهل طلبات chrome-extension وغيرها
  if (url.origin !== location.origin) {
    return;
  }
  
  // للـ API - Network Only (لا نخزنها مؤقتاً)
  if (NETWORK_ONLY.some(path => url.pathname.includes(path))) {
    event.respondWith(fetch(request));
    return;
  }
  
  // للملفات الثابتة (icons, manifest) - Cache First
  if (url.pathname.includes('/icons/') || url.pathname.includes('manifest')) {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) {
            return cached;
          }
          return fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          });
        })
    );
    return;
  }
  
  // للصفحات الرئيسية - Stale While Revalidate
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          const fetchPromise = fetch(request)
            .then((response) => {
              if (response.ok) {
                const clone = response.clone();
                caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
              }
              return response;
            })
            .catch(() => cached);
          
          return cached || fetchPromise;
        })
    );
    return;
  }
  
  // لبقية الطلبات - Network First with Cache Fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Push Notifications (للمستقبل)
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      vibrate: [200, 100, 200],
      tag: data.tag || 'maestro-notification',
      renotify: true,
      data: data.data
    };
    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Notification Click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/driver')
  );
});

console.log('[SW] Service Worker loaded');
