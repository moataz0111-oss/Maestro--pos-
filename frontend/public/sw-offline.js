// Service Worker for Offline Support - V5 (Auto-Update)
// يدعم العمل بدون إنترنت لجميع الصفحات مع تحديث تلقائي

const CACHE_VERSION = 'v7';
const CACHE_NAME = `maestro-offline-${CACHE_VERSION}`;
const STATIC_CACHE = `maestro-static-${CACHE_VERSION}`;
const DATA_CACHE = `maestro-data-${CACHE_VERSION}`;

// الملفات الأساسية التي يجب تخزينها عند التثبيت
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/admin-icon-192.png',
  '/icons/admin-icon-512.png'
];

// جميع مسارات التطبيق (SPA routes)
const APP_ROUTES = [
  '/dashboard',
  '/pos',
  '/orders',
  '/tables',
  '/kitchen',
  '/inventory',
  '/hr',
  '/expenses',
  '/reports',
  '/settings',
  '/customers',
  '/drivers',
  '/reservations',
  '/purchases',
  '/coupons',
  '/loyalty',
  '/call-center',
  '/call-logs',
  '/branch-orders',
  '/delivery',
  '/inventory-reports',
  '/ratings',
  '/owner-wallet',
  '/external-branches',
  '/login'
];

// تثبيت Service Worker - تخزين جميع الملفات الأساسية
self.addEventListener('install', (event) => {
  console.log(`[SW-Offline] Installing ${CACHE_VERSION}...`);
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(async (cache) => {
        console.log('[SW-Offline] Caching static assets');
        
        // تخزين الملفات الأساسية
        await cache.addAll(STATIC_ASSETS);
        
        // محاولة تخزين index.html لجميع المسارات
        try {
          const indexResponse = await fetch('/index.html');
          if (indexResponse.ok) {
            for (const route of APP_ROUTES) {
              await cache.put(new Request(route), indexResponse.clone());
            }
          }
        } catch (e) {
          console.log('[SW-Offline] Could not cache routes:', e);
        }
        
        console.log('[SW-Offline] All routes cached');
      })
      .then(() => {
        console.log('[SW-Offline] Installed - waiting for activation');
        // لا نستخدم skipWaiting لتجنب إعادة التحميل المستمر على Android
      })
      .catch((error) => {
        console.error('[SW-Offline] Install failed:', error);
      })
  );
});

// تفعيل Service Worker - حذف الكاش القديم
self.addEventListener('activate', (event) => {
  console.log(`[SW-Offline] Activating ${CACHE_VERSION}...`);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.includes(CACHE_VERSION))
          .map((name) => {
            console.log('[SW-Offline] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW-Offline] Activated and claimed');
      return self.clients.claim();
    })
  );
});

// السماح بالتحديث اليدوي من التطبيق
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// استراتيجية الجلب
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // تجاهل الطلبات غير HTTP/HTTPS
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // تجاهل طلبات الوسيط المحلي (Print Agent) - يجب ألا يتدخل SW
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
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
  
  // تجاهل طلبات socket.io
  if (url.pathname.includes('socket.io')) {
    return;
  }
  
  // تجاهل hot reload في التطوير
  if (url.pathname.includes('hot-update') || url.pathname.includes('sockjs-node')) {
    return;
  }
  
  // للملفات الثابتة (JS, CSS, Images, Fonts) - Cache First ثم Network
  if (request.destination === 'script' || 
      request.destination === 'style' || 
      request.destination === 'image' ||
      request.destination === 'font' ||
      url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot)$/)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        // إذا موجود في الكاش، أرجعه
        if (cachedResponse) {
          // تحديث الكاش في الخلفية (Stale-While-Revalidate)
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse);
              });
            }
          }).catch(() => {});
          return cachedResponse;
        }
        
        // إذا غير موجود، جلب من الشبكة وتخزين
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => {
          // إذا فشل ولا يوجد cache
          console.log('[SW-Offline] Failed to fetch:', request.url);
          return new Response('', { status: 503, statusText: 'Service Unavailable' });
        });
      })
    );
    return;
  }
  
  // للصفحات HTML / Navigation - إرجاع index.html دائماً (SPA)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
              // أيضاً خزّن كـ index.html
              cache.put(new Request('/index.html'), responseClone.clone());
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
            // إرجاع index.html للتطبيق SPA
            return caches.match('/index.html').then((indexResponse) => {
              if (indexResponse) {
                return indexResponse;
              }
              // إرجاع صفحة offline مخصصة
              return offlinePage();
            });
          });
        })
    );
    return;
  }
  
  // أي طلبات أخرى - Network First
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

// صفحة offline مخصصة
function offlinePage() {
  return new Response(`
    <!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Maestro - غير متصل</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', Tahoma, sans-serif;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
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
        .container {
          max-width: 400px;
          padding: 40px;
          background: rgba(255,255,255,0.05);
          border-radius: 20px;
          backdrop-filter: blur(10px);
        }
        .icon {
          width: 100px;
          height: 100px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 25px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
        }
        .icon svg {
          width: 50px;
          height: 50px;
          fill: white;
        }
        h1 { 
          margin: 0 0 12px; 
          font-size: 24px;
          font-weight: 600;
        }
        p { 
          color: rgba(255,255,255,0.7); 
          margin: 0 0 24px;
          line-height: 1.6;
        }
        button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 14px 40px;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        button:hover { 
          transform: translateY(-2px);
          box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        .tip {
          margin-top: 24px;
          padding: 16px;
          background: rgba(255,193,7,0.1);
          border-radius: 12px;
          border: 1px solid rgba(255,193,7,0.3);
        }
        .tip p {
          color: #ffc107;
          margin: 0;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
        </div>
        <h1>غير متصل بالإنترنت</h1>
        <p>يبدو أنك غير متصل بالإنترنت حالياً. يرجى التحقق من اتصالك والمحاولة مرة أخرى.</p>
        <button onclick="location.reload()">إعادة المحاولة</button>
        <div class="tip">
          <p>💡 نصيحة: افتح التطبيق مرة واحدة وأنت متصل لتخزين جميع الصفحات للعمل بدون إنترنت</p>
        </div>
      </div>
    </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

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
  
  // رسالة لتخزين ملفات إضافية
  if (event.data && event.data.type === 'CACHE_ASSETS') {
    const assets = event.data.assets || [];
    caches.open(CACHE_NAME).then((cache) => {
      assets.forEach((url) => {
        fetch(url).then((response) => {
          if (response.ok) {
            cache.put(url, response);
          }
        }).catch(() => {});
      });
    });
  }
});

// Background Sync - مزامنة في الخلفية عند عودة الاتصال
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-orders') {
    console.log('[SW-Offline] Background sync triggered');
    // إرسال رسالة للتطبيق لبدء المزامنة
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({ type: 'SYNC_REQUESTED' });
      });
    });
  }
});
