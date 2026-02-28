/**
 * Widget HTML processing — preprocesses widget HTML and stores via REST
 *
 * Handles:
 * - <base> tag injection for relative path resolution
 * - CMS signed URL → local store path rewriting
 * - Interactive Control hostAddress rewriting
 * - CSS object-position fix for CMS template alignment
 *
 * Note: CSS font URL rewriting is primarily handled by the proxy layer (proxy.js).
 * As defense-in-depth, this module also rewrites font URLs inside CSS files
 * before storing them, in case the proxy misses the CSS detection.
 *
 * Runs on the main thread (needs window.location for URL construction).
 * Stores content via PUT /store/... — no Cache API needed.
 */

import { createLogger } from '@xiboplayer/utils';
import { toProxyUrl } from './download-manager.js';

const log = createLogger('Cache');

// Dynamic base path for multi-variant deployment (pwa, pwa-xmds, pwa-xlr)
const BASE = (typeof window !== 'undefined')
  ? window.location.pathname.replace(/\/[^/]*$/, '').replace(/\/$/, '') || '/player/pwa'
  : '/player/pwa';

// Dedup concurrent static resource fetches (two widgets both need bundle.min.js)
const _pendingStatic = new Map(); // filename → Promise<void>

/**
 * Store widget HTML in ContentStore for iframe loading
 * @param {string} layoutId - Layout ID
 * @param {string} regionId - Region ID
 * @param {string} mediaId - Media ID
 * @param {string} html - Widget HTML content
 * @returns {Promise<string>} Cache key URL
 */
export async function cacheWidgetHtml(layoutId, regionId, mediaId, html) {
  const cacheKey = `${BASE}/cache/widget/${layoutId}/${regionId}/${mediaId}`;

  // Inject <base> tag to fix relative paths for widget dependencies
  // Widget HTML has relative paths like "bundle.min.js" that should resolve to cache/media/
  const baseTag = `<base href="${BASE}/cache/media/">`;
  let modifiedHtml = html;

  // Insert base tag after <head> opening tag (skip if already present)
  if (!html.includes('<base ')) {
    if (html.includes('<head>')) {
      modifiedHtml = html.replace('<head>', '<head>' + baseTag);
    } else if (html.includes('<HEAD>')) {
      modifiedHtml = html.replace('<HEAD>', '<HEAD>' + baseTag);
    } else {
      // No head tag, prepend base tag
      modifiedHtml = baseTag + html;
    }
  }

  // Rewrite absolute CMS signed URLs to local store paths
  // Matches: https://cms/xmds.php?file=... or https://cms/pwa/file?file=...
  // These absolute URLs bypass the <base> tag entirely, causing slow CMS fetches
  const cmsUrlRegex = /https?:\/\/[^"'\s)]+(?:xmds\.php|pwa\/file)\?[^"'\s)]*file=([^&"'\s)]+)[^"'\s)]*/g;
  const staticResources = [];
  modifiedHtml = modifiedHtml.replace(cmsUrlRegex, (match, filename) => {
    const localPath = `${BASE}/cache/static/${filename}`;
    staticResources.push({ filename, originalUrl: match });
    log.info(`Rewrote widget URL: ${filename} → ${localPath}`);
    return localPath;
  });

  // Inject CSS default for object-position to suppress CMS template warning
  const cssFixTag = '<style>img,video{object-position:center center}</style>';
  if (!modifiedHtml.includes('object-position:center center')) {
    if (modifiedHtml.includes('</head>')) {
      modifiedHtml = modifiedHtml.replace('</head>', cssFixTag + '</head>');
    } else if (modifiedHtml.includes('</HEAD>')) {
      modifiedHtml = modifiedHtml.replace('</HEAD>', cssFixTag + '</HEAD>');
    }
  }

  // Rewrite Interactive Control hostAddress to SW-interceptable path
  modifiedHtml = modifiedHtml.replace(
    /hostAddress\s*:\s*["']https?:\/\/[^"']+["']/g,
    `hostAddress: "${BASE}/ic"`
  );

  log.info('Injected base tag and rewrote CMS/data URLs in widget HTML');

  // Store static resources FIRST — widget iframe loads immediately after HTML is stored,
  // and its <script>/<link> tags will 404 if deps aren't ready yet
  if (staticResources.length > 0) {
    await Promise.all(staticResources.map(({ filename, originalUrl }) => {
      // Dedup: if another widget is already fetching the same resource, wait for it
      if (_pendingStatic.has(filename)) {
        return _pendingStatic.get(filename);
      }

      const work = (async () => {
      // Check if already stored
      try {
        const headResp = await fetch(`/store/static/${filename}`, { method: 'HEAD' });
        if (headResp.ok) return; // Already stored
      } catch { /* proceed to fetch */ }

      try {
        const resp = await fetch(toProxyUrl(originalUrl));
        if (!resp.ok) {
          resp.body?.cancel();
          log.warn(`Failed to fetch static resource: ${filename} (HTTP ${resp.status})`);
          return;
        }

        const ext = filename.split('.').pop().toLowerCase();
        const contentType = {
          'js': 'application/javascript',
          'css': 'text/css',
          'otf': 'font/otf', 'ttf': 'font/ttf',
          'woff': 'font/woff', 'woff2': 'font/woff2',
          'eot': 'application/vnd.ms-fontobject',
          'svg': 'image/svg+xml'
        }[ext] || 'application/octet-stream';

        // Defense-in-depth: rewrite font URLs inside CSS files before storing.
        // The proxy normally handles this, but if it misses CSS detection
        // (e.g. CMS returns unexpected Content-Type), we catch it here.
        // Also handles truncated CSS from CMS (missing closing ');}) due to
        // Content-Length mismatch after URL expansion).
        if (ext === 'css') {
          let cssText = await resp.text();
          // Match any CMS signed URL with a file= query param in the CSS text.
          // Uses a simple approach: find all https:// URLs with file=<name>, then
          // filter to fonts by extension or fileType=font. This handles both normal
          // url('...') and truncated CSS (where the closing '); is missing).
          const CMS_SIGNED_URL_RE = /https?:\/\/[^\s'")\]]+\?[^\s'")\]]*file=([^&\s'")\]]+)[^\s'")\]]*/g;
          const FONT_EXTS = /\.(?:woff2?|ttf|otf|eot|svg)$/i;
          const fontJobs = [];

          cssText = cssText.replace(CMS_SIGNED_URL_RE, (fullUrl, fontFilename) => {
            if (!FONT_EXTS.test(fontFilename) && !fullUrl.includes('fileType=font')) return fullUrl;
            fontJobs.push({ filename: fontFilename, originalUrl: fullUrl });
            log.info(`Rewrote CSS font URL: ${fontFilename}`);
            return `${BASE}/cache/static/${encodeURIComponent(fontFilename)}`;
          });

          // Fetch and store each referenced font file
          await Promise.all(fontJobs.map(async (font) => {
            try {
              const headResp = await fetch(`/store/static/${font.filename}`, { method: 'HEAD' });
              if (headResp.ok) return; // Already stored
            } catch { /* proceed */ }
            try {
              const fontResp = await fetch(toProxyUrl(font.originalUrl));
              if (!fontResp.ok) { fontResp.body?.cancel(); return; }
              const fontBlob = await fontResp.blob();
              const fontExt = font.filename.split('.').pop().toLowerCase();
              const fontContentType = {
                'otf': 'font/otf', 'ttf': 'font/ttf',
                'woff': 'font/woff', 'woff2': 'font/woff2',
                'eot': 'application/vnd.ms-fontobject', 'svg': 'image/svg+xml',
              }[fontExt] || 'application/octet-stream';
              const putFont = await fetch(`/store/static/${font.filename}`, {
                method: 'PUT',
                headers: { 'Content-Type': fontContentType },
                body: fontBlob,
              });
              putFont.body?.cancel();
              log.info(`Stored font: ${font.filename} (${fontBlob.size} bytes)`);
            } catch (e) {
              log.warn(`Failed to store font: ${font.filename}`, e);
            }
          }));

          // Store the rewritten CSS
          const cssBlob = new Blob([cssText], { type: 'text/css' });
          const staticResp = await fetch(`/store/static/${filename}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'text/css' },
            body: cssBlob,
          });
          staticResp.body?.cancel();
          log.info(`Stored CSS with ${fontJobs.length} rewritten font URLs: ${filename} (${cssText.length} bytes)`);
        } else {
          const blob = await resp.blob();
          const staticResp = await fetch(`/store/static/${filename}`, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: blob,
          });
          staticResp.body?.cancel();
          log.info(`Stored static resource: ${filename} (${contentType}, ${blob.size} bytes)`);
        }
      } catch (error) {
        log.warn(`Failed to store static resource: ${filename}`, error);
      }
      })();

      _pendingStatic.set(filename, work);
      return work.finally(() => _pendingStatic.delete(filename));
    }));
  }

  // Store widget HTML AFTER all static deps are ready — iframe loads instantly on store,
  // so bundle.min.js/fonts.css/fonts must already be in the ContentStore
  const putResp = await fetch(`/store/widget/${layoutId}/${regionId}/${mediaId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: modifiedHtml,
  });
  putResp.body?.cancel();
  log.info(`Stored widget HTML at ${cacheKey} (${modifiedHtml.length} bytes)`);

  return cacheKey;
}
