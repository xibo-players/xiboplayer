/**
 * Service Worker for offline cache
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `xibo-static-${CACHE_VERSION}`;

/**
 * Handle Range requests for video/audio seeking
 * Required for HTML5 video element to support seeking/scrubbing
 * For streaming files, downloads chunks on-demand
 */
async function handleRangeRequest(cachedResponse, rangeHeader, cacheKey, originalUrl) {
  const blob = await cachedResponse.blob();
  const fileSize = blob.size;

  // Parse Range header: "bytes=START-END" or "bytes=START-"
  const rangeParts = rangeHeader.replace(/bytes=/, '').split('-');
  const start = parseInt(rangeParts[0], 10);
  const end = rangeParts[1] ? parseInt(rangeParts[1], 10) : fileSize - 1;

  // Extract requested range from blob
  const rangeBlob = blob.slice(start, end + 1);

  return new Response(rangeBlob, {
    status: 206, // Partial Content
    statusText: 'Partial Content',
    headers: {
      'Content-Type': cachedResponse.headers.get('Content-Type') || 'video/mp4',
      'Content-Length': rangeBlob.size,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

/**
 * Fetch and cache a chunk from the original URL on-demand
 * Used for streaming large video files
 */
async function fetchAndCacheChunk(originalUrl, rangeHeader, cacheKey, cache) {
  console.log('[SW] Fetching chunk on-demand:', rangeHeader);

  const response = await fetch(originalUrl, {
    headers: { 'Range': rangeHeader }
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Failed to fetch chunk: ${response.status}`);
  }

  // Cache this chunk for future requests
  const responseClone = response.clone();
  await cache.put(cacheKey + '#' + rangeHeader, responseClone);

  return response;
}

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

  // IMPORTANT: Let XMDS downloads bypass Service Worker
  // Large video files (2GB+) cause timeouts if intercepted
  // The cache.js module handles downloads directly
  if (url.pathname.includes('xmds.php') && url.searchParams.has('file')) {
    // Don't intercept - let it go directly to network
    return;
  }

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
    console.log('[SW] Request for:', url.pathname, '→ Cache key:', cacheKey);

    event.respondWith(
      caches.open('xibo-media-v1').then((cache) => {
        return cache.match(cacheKey).then(async (response) => {
          if (response) {
            console.log('[SW] Serving from cache:', cacheKey);

            // Handle Range requests for video/audio seeking
            const rangeHeader = event.request.headers.get('Range');
            if (rangeHeader) {
              return handleRangeRequest(response, rangeHeader, cacheKey, event.request.url);
            }

            // Regular response
            return new Response(response.body, {
              status: 200,
              statusText: 'OK',
              headers: {
                'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
                'Content-Length': response.headers.get('Content-Length') || '',
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }

          // Cache miss - might be background download in progress
          // For media files, show a loading message instead of 404
          console.warn('[SW] Cache miss for:', cacheKey, '(might be downloading in background)');

          // Return a placeholder for videos being downloaded
          if (cacheKey.includes('.mp4') || cacheKey.includes('.mov') || cacheKey.includes('.avi')) {
            return new Response('Downloading video in background...', {
              status: 202,
              statusText: 'Accepted',
              headers: { 'Content-Type': 'text/plain' }
            });
          }

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
