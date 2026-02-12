/**
 * Service Worker for offline cache
 * Version: 2026-02-04-21:16 - Video cache fixes
 */

const SW_BUILD = '2026-02-04-21:16';
const CACHE_VERSION = 'v1';
const STATIC_CACHE = `xibo-static-${CACHE_VERSION}`;

console.log('[SW] Loading version:', SW_BUILD);

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
      return cache.addAll(STATIC_FILES).catch(err => {
        console.warn('[SW] Static file caching failed (ignoring):', err.message);
        // Continue anyway - static file caching is optional
      });
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

  // Debug: Log all xmds.php requests
  if (url.pathname.includes('xmds.php')) {
    console.log('[SW] Fetch event for xmds.php:', event.request.method, url.pathname, 'has file param:', url.searchParams.has('file'));
  }

  // Handle XMDS media file requests from XLR
  // XLR generates /xmds.php?file=X.png for native media rendering
  // We intercept and serve from cache if available
  if (url.pathname.includes('xmds.php') && url.searchParams.has('file')) {
    const filename = url.searchParams.get('file');
    console.log('[SW] Intercepting media request:', filename, 'method:', event.request.method);

    // Only intercept GET requests for media files, let HEAD requests pass through to CMS
    // This allows proper Content-Length detection for downloads
    if (event.request.method === 'HEAD') {
      console.log('[SW] HEAD request for media, passing through to CMS:', filename);
      return; // Let it pass through
    }

    console.log('[SW] XLR requesting media via xmds.php:', filename);

    event.respondWith(
      (async () => {
        // Extract media ID from filename (e.g., "4.mp4" → "4")
        const mediaId = filename.split('.')[0];
        const expectedCacheKey = `/cache/media/${mediaId}`;

        console.log('[SW] Looking for cache key:', expectedCacheKey, 'from filename:', filename);

        // Try to find in cache by media ID
        const cache = await caches.open('xibo-media-v1');  // Match cache.js CACHE_NAME

        // Try direct cache key first (most efficient)
        const directMatch = await cache.match(new Request(self.location.origin + expectedCacheKey));
        if (directMatch) {
          console.log('[SW] Found cached media (direct match):', filename);
          return new Response(directMatch.body, {
            headers: {
              'Content-Type': directMatch.headers.get('Content-Type') || 'video/mp4',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=31536000',
              'Accept-Ranges': 'bytes'
            }
          });
        }

        // Fall back to searching all cache keys
        const cachedResponses = await cache.keys();
        for (const request of cachedResponses) {
          const cachedUrl = new URL(request.url);
          // Check if cached URL contains the media ID
          if (cachedUrl.pathname.includes(`/media/${mediaId}`) || cachedUrl.searchParams.get('file') === filename) {
            console.log('[SW] Found cached media (fallback search):', filename);
            const response = await cache.match(request);
            if (response) {
              return new Response(response.body, {
                headers: {
                  'Content-Type': response.headers.get('Content-Type') || 'video/mp4',
                  'Access-Control-Allow-Origin': '*',
                  'Cache-Control': 'public, max-age=31536000',
                  'Accept-Ranges': 'bytes'
                }
              });
            }
          }
        }

        // Not in cache yet - check if it's a video downloading in background
        console.warn('[SW] Media not in cache:', filename);
        if (filename.match(/\.(mp4|webm|mov|avi)$/i)) {
          console.log('[SW] Video file downloading in background, returning 202');
          return new Response('Video downloading in background, please wait...', {
            status: 202,
            statusText: 'Accepted',
            headers: { 'Content-Type': 'text/plain' }
          });
        }

        // For other files, pass through to CMS (will likely 404 but that's expected)
        console.log('[SW] Passing through to CMS:', filename);
        return fetch(event.request);
      })()
    );
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

  // Aggressive caching for widget resources (bundle.min.js, fonts.css, fonts)
  // These have dynamic signatures but should be cached by filename for kiosk use
  if (url.pathname.includes('xmds.php') &&
      (url.searchParams.get('fileType') === 'bundle' ||
       url.searchParams.get('fileType') === 'fontCss' ||
       url.searchParams.get('fileType') === 'font')) {
    const filename = url.searchParams.get('file');
    const fileType = url.searchParams.get('fileType');
    console.log(`[SW] Widget resource request: ${filename} (${fileType})`);

    event.respondWith(
      (async () => {
        // Create cache key based on filename only (ignore signatures)
        const cacheKey = `widget-resource:${filename}`;
        const cache = await caches.open(STATIC_CACHE);

        // Try to serve from cache first
        const cached = await cache.match(cacheKey);
        if (cached) {
          console.log(`[SW] Serving widget resource from cache: ${filename}`);
          return cached;
        }

        // Not cached - fetch and cache aggressively
        console.log(`[SW] Fetching and caching widget resource: ${filename}`);
        const response = await fetch(event.request);
        if (response.ok) {
          // Cache with long TTL for kiosk use
          const responseClone = response.clone();
          await cache.put(cacheKey, responseClone);
          console.log(`[SW] Cached widget resource: ${filename} (${fileType})`);
        }
        return response;
      })()
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
        // CRITICAL: Don't cache HTTP 202 responses (background downloads in progress)
        if (networkResponse.ok && event.request.method === 'GET' && networkResponse.status !== 202) {
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
