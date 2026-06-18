// Service Worker لتطبيق السائق — يجعل التطبيق قابلاً للتثبيت (installable) ويعمل بأساسيات عند ضعف الشبكة
const DRIVER_CACHE = 'driver-app-v5';
const PRECACHE = ['/driver-app', '/manifest-driver.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(DRIVER_CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {}))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== DRIVER_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// شبكة أولاً مع رجوع للكاش (للتنقّل) — لا نتدخّل في طلبات الـ API
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api')) return; // اترك طلبات الـ API للشبكة مباشرة
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/driver-app').then((r) => r || caches.match(req)))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(DRIVER_CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});

// ===== إشعارات Push للسائق (تعمل في الخلفية حتى عند إغلاق التطبيق) =====
self.addEventListener('push', (event) => {
  let data = { title: 'تطبيق السائق', body: 'لديك إشعار جديد', icon: '/icons/icon-192.png', data: {} };
  if (event.data) {
    try { data = Object.assign(data, event.data.json()); }
    catch (e) { data.body = event.data.text(); }
  }
  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [300, 120, 300, 120, 300],
    tag: data.tag || 'driver-notify',
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    data: data.data || {},
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const ndata = event.notification.data || {};
  const isCall = ndata.type === 'incoming_call';
  const urlToOpen = ndata.url || '/driver-app';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          if (!isCall) client.navigate(urlToOpen);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(urlToOpen);
    })
  );
});
