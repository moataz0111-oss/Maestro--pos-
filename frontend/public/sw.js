// Service Worker v5 - Network First Strategy for Speed
const CACHE_NAME = 'maestro-app-v5';
const CACHE_VERSION = Date.now(); // Force update on each deploy

// Only cache essential static files
const STATIC_FILES = [
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install - Skip waiting immediately
self.addEventListener('install', (event) => {
  console.log('[SW v5] Installing...');
  self.skipWaiting();
});

// Activate - Clean ALL old caches immediately
self.addEventListener('activate', (event) => {
  console.log('[SW v5] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW v5] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      console.log('[SW v5] Taking control of clients');
      return self.clients.claim();
    })
  );
});

// Fetch - ALWAYS use Network First for HTML/JS/CSS
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-HTTP requests
  if (!url.protocol.startsWith('http')) return;
  
  // Skip cross-origin requests
  if (url.origin !== location.origin) return;
  
  // API calls - Always network only
  if (url.pathname.startsWith('/api')) {
    event.respondWith(fetch(request));
    return;
  }
  
  // HTML pages (navigation) - Network First, no cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request))
    );
    return;
  }
  
  // JS/CSS files - Network First for fresh content
  if (url.pathname.includes('.js') || url.pathname.includes('.css')) {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match(request))
    );
    return;
  }
  
  // Icons and images - Cache first for speed
  if (url.pathname.includes('/icons/') || url.pathname.includes('.png') || url.pathname.includes('.jpg')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }
  
  // Everything else - Network only
  event.respondWith(fetch(request));
});

// Push Notifications
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-72.png',
        vibrate: [200, 100, 200],
        tag: data.tag || 'maestro-notification'
      })
    );
  }
});

// Notification Click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/driver'));
});

// Message handler - for manual cache clear
self.addEventListener('message', (event) => {
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
    console.log('[SW v5] All caches cleared');
  }
});

console.log('[SW v5] Loaded');
