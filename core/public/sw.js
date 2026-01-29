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

  // Handle widget HTML requests (/player/cache/widget/*)
  if (url.pathname.startsWith('/player/cache/widget/')) {
    console.log('[SW] Widget HTML request:', url.pathname);
    // Strip /player/ prefix to match cached keys
    const cacheKey = url.pathname.replace('/player', '');
    const cacheUrl = new URL(cacheKey, url.origin);
    event.respondWith(
      caches.open('xibo-media-v1').then((cache) => {
        return cache.match(cacheUrl).then((response) => {
          if (response) {
            console.log('[SW] Serving widget HTML from cache:', cacheKey);
            return new Response(response.body, {
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=31536000'
              }
            });
          }
          console.warn('[SW] Widget HTML not found in cache:', cacheKey);
          return new Response('<!DOCTYPE html><html><body>Widget not found</body></html>', {
            status: 404,
            headers: { 'Content-Type': 'text/html' }
          });
        });
      })
    );
    return;
  }

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
            // Clone response to avoid CORS issues
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: {
                'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
          // Cache miss - this shouldn't happen for media files
          console.warn('[SW] Cache miss for:', cacheKey);
          return new Response('Not found', { status: 404 });
        });
      }).catch(err => {
        console.error('[SW] Error serving:', cacheKey, err);
        return new Response('Error: ' + err.message, { status: 500 });
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
        // Cache successful GET responses only (can't cache POST)
        if (networkResponse.ok && event.request.method === 'GET') {
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
        return caches.match('/player/index.html');
      }
      return new Response('Offline', { status: 503 });
    })
  );
});
