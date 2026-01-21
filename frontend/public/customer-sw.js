// Customer App Service Worker - Isolated from main app
const CACHE_NAME = 'customer-menu-v1';
const CUSTOMER_SCOPE = '/customer-pwa/';

// Files to cache for offline
const urlsToCache = [
  '/customer-pwa/',
  '/customer-pwa/index.html',
  '/customer-pwa/manifest.json',
  '/icons/customer-icon-192.png',
  '/icons/customer-icon-512.png'
];

// Install event - cache essential files
self.addEventListener('install', event => {
  console.log('[Customer SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Customer SW] Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', event => {
  console.log('[Customer SW] Activating...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old customer caches
          if (cacheName.startsWith('customer-') && cacheName !== CACHE_NAME) {
            console.log('[Customer SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // Only handle requests within our scope
  if (!event.request.url.includes('/customer-pwa/') && 
      !event.request.url.includes('/icons/customer-')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
