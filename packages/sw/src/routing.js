// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
/**
 * Shared routing helpers for the Service Worker fetch handlers.
 *
 * `RequestHandler` (proxy mode) and `RequestHandlerBrowser` (browser
 * mode, see `request-handler-browser.js`) dispatch fetch events
 * through the same URL-pattern vocabulary:
 *
 *   - static pages (/, /index.html, /setup.html under BASE) → network
 *   - player-API paths → cache-through or passthrough depending on
 *     deployment mode
 *   - legacy xmds.php?file=… URLs → rewrite to a player-API path
 *
 * Extracted here so the two handlers share one vocabulary and the
 * unit tests have a single place to assert routing decisions.
 */

import { PLAYER_API } from '@xiboplayer/utils';
import { BASE } from './sw-utils.js';

/**
 * Pathnames that must always be fetched from the network (they
 * change on every deploy).
 *
 * @param {URL} url - parsed request URL
 * @returns {boolean}
 */
export function isStaticPage(url) {
  return (
    url.pathname === BASE + '/' ||
    url.pathname === BASE + '/index.html' ||
    url.pathname === BASE + '/setup.html'
  );
}

/**
 * Legacy XMDS file-download URL recognition. Matches the shape
 * `https://<cms>/xmds.php?file=<name>&type=<T>&itemId=<id>` that
 * the XMDS RequiredFiles flow issues.
 *
 * @param {URL} url - parsed request URL
 * @returns {boolean}
 */
export function isXmdsFileRequest(url) {
  return url.pathname.includes('xmds.php') && url.searchParams.has('file');
}

/**
 * Path prefixes whose responses are safe to cache in the browser
 * ContentStore. Used by `RequestHandlerBrowser._handleApiRequest`
 * to decide between cache-through and pass-with-auth routing.
 *
 * Immutable, shared across all handler instances.
 *
 * @type {readonly RegExp[]}
 */
export const CACHEABLE_API_PATTERNS = Object.freeze([
  /\/media\/file\//,
  /\/media\/\d+/,
  /\/layouts\/\d+/,
  /\/widgets\/\d+\/\d+\/\d+/,
  /\/dependencies\//,
]);

/**
 * True when the given path (must start with PLAYER_API) names a
 * cacheable resource category — media, layout, widget HTML, or
 * dependency. Non-cacheable API calls (auth, displays, schedule,
 * inventory) return false.
 *
 * @param {string} pathname - URL pathname
 * @returns {boolean}
 */
export function isCacheableApiPath(pathname) {
  return CACHEABLE_API_PATTERNS.some((p) => p.test(pathname));
}

/**
 * Translate a legacy XMDS file-download URL into the player-API
 * path that both the proxy and the browser handler know how to
 * serve.
 *
 * XMDS `type` values:
 *   - `L` (layout) → `{PLAYER_API}/layouts/{itemId}`
 *   - `P` (resource/font/dependency) → `{PLAYER_API}/dependencies/{filename}`
 *   - `M` (media) and everything else → `{PLAYER_API}/media/file/{filename}`
 *
 * Returns `null` when `file` is missing — caller should pass the
 * request through unchanged.
 *
 * @param {URL} url - parsed XMDS request URL
 * @returns {string|null} API path (starts with PLAYER_API), or null
 */
export function rewriteXmdsToApiPath(url) {
  const filename = url.searchParams.get('file');
  if (!filename) return null;
  const fileType = url.searchParams.get('type');
  const itemId = url.searchParams.get('itemId');

  if (fileType === 'L') {
    return `${PLAYER_API}/layouts/${itemId}`;
  }
  if (fileType === 'P') {
    return `${PLAYER_API}/dependencies/${filename}`;
  }
  // 'M' or unknown — treat as media
  return `${PLAYER_API}/media/file/${filename}`;
}
