// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
/**
 * Widget-side preamble helpers
 *
 * When the translator (xiboplayer-smil-tools) emits an `xp:datasource`
 * widget, the widget's HTML runs inside a cross-document iframe. Direct
 * access to window.xpDatasource (living on the parent) isn't possible
 * when the iframe is cross-origin or served via blob URL, so we bridge
 * over postMessage. This module provides two pieces:
 *
 *   1. `buildWidgetPreamble(options)` — returns a self-contained `<script>`
 *      body string the translator can inline into each widget's HTML.
 *      The script subscribes to a URL+jsonpath, receives values, and
 *      updates a target element (by selector) on each change.
 *
 *   2. `attachHostBridge(client, targetWindow)` — server-side (PWA) helper
 *      that wires a DatasourceClient to an iframe window. It listens for
 *      SUBSCRIBE/UNSUBSCRIBE messages from the iframe and forwards values
 *      back.
 *
 * Protocol (JSON envelopes over window.postMessage, string type
 * `xp:datasource`):
 *
 *   iframe → host   { type: 'xp:datasource', action: 'subscribe',
 *                     id, url, jsonpath?, refreshMs?, fallback? }
 *   iframe → host   { type: 'xp:datasource', action: 'unsubscribe', id }
 *   host → iframe   { type: 'xp:datasource', action: 'value',
 *                     id, value, stale, error, fetchedAt }
 *
 * `id` is a per-widget-per-URL token the iframe picks so it can route
 * incoming values to the right DOM target.
 */

const MSG_TYPE = 'xp:datasource';

/**
 * Generate the widget-side runtime as a string. Meant to be inlined
 * verbatim into the translator's widget HTML (inside a `<script>` tag).
 *
 * The produced runtime:
 *   - posts a 'subscribe' message to window.parent on load,
 *   - listens for 'value' messages,
 *   - writes the incoming value (stringified with optional formatter)
 *     into the element matching `selector`.
 *
 * @param {Object} options
 * @param {string} options.url - Data-source URL
 * @param {string} [options.jsonpath] - xp:jsonpath value
 * @param {number} [options.refreshMs=30000]
 * @param {string|number|boolean|null} [options.fallback] - xp:fallback literal
 * @param {string} [options.selector='[data-xp-bind]'] - CSS selector for the
 *        DOM node that receives the fetched value as textContent.
 * @param {string} [options.id] - Override the generated subscription id.
 * @returns {string} JS source (no <script> tags — caller wraps if needed)
 */
export function buildWidgetPreamble(options) {
  if (!options || typeof options.url !== 'string') {
    throw new Error('buildWidgetPreamble: options.url required');
  }

  const payload = {
    url: options.url,
    jsonpath: options.jsonpath || null,
    refreshMs: options.refreshMs || 30_000,
    fallback: options.fallback === undefined ? null : options.fallback,
    selector: options.selector || '[data-xp-bind]',
    id: options.id || null,
  };

  // The runtime references payload via a serialised JSON literal. JSON.stringify
  // produces valid JavaScript for any serialisable object.
  const serialized = JSON.stringify(payload);

  return `(function(){
  var cfg = ${serialized};
  if (!cfg.id) cfg.id = 'xp-' + Math.random().toString(36).slice(2, 10);

  function render(value) {
    try {
      var nodes = document.querySelectorAll(cfg.selector);
      for (var i = 0; i < nodes.length; i++) {
        if (value === null || value === undefined) {
          nodes[i].textContent = '';
        } else if (typeof value === 'object') {
          nodes[i].textContent = JSON.stringify(value);
        } else {
          nodes[i].textContent = String(value);
        }
      }
    } catch (_) { /* DOM not ready */ }
  }

  if (cfg.fallback !== null) render(cfg.fallback);

  function onMessage(e) {
    var m = e && e.data;
    if (!m || m.type !== '${MSG_TYPE}' || m.action !== 'value' || m.id !== cfg.id) return;
    if (m.error && (m.value === null || m.value === undefined) && cfg.fallback !== null) {
      render(cfg.fallback);
    } else {
      render(m.value);
    }
  }

  window.addEventListener('message', onMessage);

  function subscribe() {
    try {
      window.parent.postMessage({
        type: '${MSG_TYPE}',
        action: 'subscribe',
        id: cfg.id,
        url: cfg.url,
        jsonpath: cfg.jsonpath,
        refreshMs: cfg.refreshMs,
        fallback: cfg.fallback
      }, '*');
    } catch (_) { /* no parent — standalone preview */ }
  }

  function unsubscribe() {
    try {
      window.parent.postMessage({
        type: '${MSG_TYPE}',
        action: 'unsubscribe',
        id: cfg.id
      }, '*');
    } catch (_) {}
  }

  window.addEventListener('unload', unsubscribe);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', subscribe);
  } else {
    subscribe();
  }
})();`;
}

/**
 * Attach a host-side bridge that translates widget iframe postMessage
 * envelopes into DatasourceClient.subscribe calls and streams values back.
 *
 * The bridge installs a global `message` listener on `targetWindow`
 * (usually `window`). It tracks per-source subscriptions so that when an
 * iframe is removed from the DOM, its subscriptions can be torn down via
 * the bridge's `destroy()` method. Iframes that close cleanly by sending
 * an 'unsubscribe' message are cleaned up automatically; otherwise the
 * caller can call `destroy()` on layout teardown.
 *
 * @param {import('./datasource-client.js').DatasourceClient} client
 * @param {Window} [targetWindow=window]
 * @returns {{ destroy(): void, stats(): {subscribers: number} }}
 */
export function attachHostBridge(client, targetWindow) {
  const win = targetWindow || (typeof window !== 'undefined' ? window : null);
  if (!win || typeof win.addEventListener !== 'function') {
    throw new Error('attachHostBridge: no window available');
  }

  /** Map<MessageEventSource, Map<id, unsubscribe>> */
  const subsBySource = new Map();

  const handler = (event) => {
    const data = event.data;
    if (!data || data.type !== MSG_TYPE) return;

    if (data.action === 'subscribe') {
      const src = event.source;
      if (!src) return;
      let bySource = subsBySource.get(src);
      if (!bySource) {
        bySource = new Map();
        subsBySource.set(src, bySource);
      }
      // Replace any prior subscription for the same id on the same source
      const prior = bySource.get(data.id);
      if (prior) prior();

      const unsub = client.subscribe(
        data.url,
        (value, meta) => {
          try {
            src.postMessage({
              type: MSG_TYPE,
              action: 'value',
              id: data.id,
              value,
              stale: !!meta.stale,
              error: meta.error ? String(meta.error.message || meta.error) : null,
              fetchedAt: meta.fetchedAt,
            }, '*');
          } catch {
            // source window was unloaded — clean up
            unsub();
            bySource.delete(data.id);
            if (bySource.size === 0) subsBySource.delete(src);
          }
        },
        {
          refreshMs: data.refreshMs,
          jsonpath: data.jsonpath,
          fallback: data.fallback,
        },
      );
      bySource.set(data.id, unsub);
      return;
    }

    if (data.action === 'unsubscribe') {
      const src = event.source;
      if (!src) return;
      const bySource = subsBySource.get(src);
      if (!bySource) return;
      const unsub = bySource.get(data.id);
      if (unsub) {
        unsub();
        bySource.delete(data.id);
      }
      if (bySource.size === 0) subsBySource.delete(src);
      return;
    }
  };

  win.addEventListener('message', handler);

  return {
    destroy() {
      win.removeEventListener('message', handler);
      for (const bySource of subsBySource.values()) {
        for (const unsub of bySource.values()) {
          try { unsub(); } catch {}
        }
      }
      subsBySource.clear();
    },
    stats() {
      let n = 0;
      for (const bs of subsBySource.values()) n += bs.size;
      return { subscribers: n };
    },
  };
}

/** Exported for tests — keeps the protocol name in one place. */
export const DATASOURCE_MSG_TYPE = MSG_TYPE;
