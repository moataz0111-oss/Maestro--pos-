// Service Worker for Offline Support
// يدعم العمل بدون إنترنت

const CACHE_NAME = 'maestro-offline-v2';
const STATIC_CACHE = 'maestro-static-v2';

// الملفات الأساسية التي يجب تخزينها
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/admin-icon-192.png',
  '/icons/admin-icon-512.png'
];

// تثبيت Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW-Offline] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW-Offline] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// تفعيل Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW-Offline] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== STATIC_CACHE)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// استراتيجية الجلب: Network First، ثم Cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // تجاهل الطلبات غير HTTP/HTTPS
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // تجاهل طلبات API - نتركها للتطبيق للتعامل معها
  if (url.pathname.startsWith('/api')) {
    return;
  }
  
  // تجاهل طلبات WebSocket
  if (request.headers.get('Upgrade') === 'websocket') {
    return;
  }
  
  // للملفات الثابتة (JS, CSS, Images) - Cache First
  if (request.destination === 'script' || 
      request.destination === 'style' || 
      request.destination === 'image' ||
      request.destination === 'font') {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // تحديث الكاش في الخلفية
          fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }
        
        return fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {
          // إذا فشل الجلب ولا يوجد cache
          return new Response('', { status: 503 });
        });
      })
    );
    return;
  }
  
  // للصفحات HTML - Network First
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // إذا فشل الشبكة، استخدم الكاش
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // إرجاع الصفحة الرئيسية للتطبيق SPA
            return caches.match('/index.html').then((indexResponse) => {
              if (indexResponse) {
                return indexResponse;
              }
              // صفحة offline بسيطة
              return new Response(`
                <!DOCTYPE html>
                <html lang="ar" dir="rtl">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Maestro - غير متصل</title>
                  <style>
                    body {
                      font-family: 'Segoe UI', Tahoma, sans-serif;
                      background: #1a1a2e;
                      color: white;
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      justify-content: center;
                      min-height: 100vh;
                      margin: 0;
                      text-align: center;
                      padding: 20px;
                    }
                    .icon {
                      width: 100px;
                      height: 100px;
                      background: white;
                      border-radius: 20px;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      margin-bottom: 24px;
                    }
                    .icon img {
                      width: 80px;
                      height: 80px;
                    }
                    h1 { margin: 0 0 16px; font-size: 24px; }
                    p { color: #888; margin: 0 0 24px; }
                    button {
                      background: #3b82f6;
                      color: white;
                      border: none;
                      padding: 12px 32px;
                      border-radius: 8px;
                      font-size: 16px;
                      cursor: pointer;
                    }
                    button:hover { background: #2563eb; }
                  </style>
                </head>
                <body>
                  <div class="icon">
                    <img src="/icons/admin-icon-192.png" alt="Maestro" onerror="this.style.display='none'">
                  </div>
                  <h1>غير متصل بالإنترنت</h1>
                  <p>يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى</p>
                  <button onclick="location.reload()">إعادة المحاولة</button>
                </body>
                </html>
              `, {
                headers: { 'Content-Type': 'text/html; charset=utf-8' }
              });
            });
          });
        })
    );
    return;
  }
});

// استقبال رسائل من التطبيق
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
});
