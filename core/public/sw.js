/**
 * Service Worker for offline cache
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `xibo-static-${CACHE_VERSION}`;

// Files to cache on install (with /player/ prefix)
const STATIC_FILES = [
  '/player/',
  '/player/index.html',
  '/player/setup.html',
  '/player/manifest.json'
];

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching static files');
      return cache.addAll(STATIC_FILES);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('xibo-') && name !== STATIC_CACHE && name !== 'xibo-media-v1')
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle cache URLs (/player/cache/*)
  if (url.pathname.startsWith('/player/cache/')) {
    // Strip /player/ prefix to match cached keys
    const cacheKey = url.pathname.replace('/player', '');
    const cacheUrl = new URL(cacheKey, url.origin);

    event.respondWith(
      caches.open('xibo-media-v1').then((cache) => {
        return cache.match(cacheUrl).then((response) => {
          if (response) {
            console.log('[SW] Serving from cache:', cacheKey);
            return response;
          }
          // Cache miss - this shouldn't happen for media files
          console.warn('[SW] Cache miss for:', cacheKey);
          return new Response('Not found', { status: 404 });
        });
      })
    );
    return;
  }

  // For other requests, try cache first, then network
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache successful responses
        if (networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      });
    }).catch(() => {
      // Network failed and not in cache
      if (event.request.destination === 'document') {
        return caches.match('/index.html');
      }
      return new Response('Offline', { status: 503 });
    })
  );
});
