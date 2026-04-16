// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
/**
 * DatasourceClient — shared data-source cache for ADA xp:datasource widgets
 *
 * Problem (#235 gap G9):
 *   - Every ADA-emitted data-bound widget (xp:datasource=URL + xp:jsonpath=)
 *     polls its URL independently. Six widgets on one layout = six fetches
 *     every 30s for the exact same URL.
 *   - No offline fallback: once network drops, widgets fall back forever
 *     (until the widget iframe is re-created).
 *   - No CORS strategy: tenant URLs may forbid iframe-scoped fetches.
 *
 * Solution:
 *   - One shared client lives in the PWA (not in each iframe) so CORS is
 *     evaluated once, against the top-level origin.
 *   - subscribe(url, cb) deduplicates: N subscribers to the same URL share
 *     one active poller and one cached response.
 *   - Each URL has its own refresh cadence (min across all subscribers).
 *   - Responses cached with TTL (defaults to refreshMs). Subscribers who
 *     join an already-primed URL get the cached value synchronously first.
 *   - On fetch error, last-known-good is emitted; if no LKG, the subscriber
 *     gets its configured fallback (or undefined).
 *   - Last-known-good is persisted to localStorage (opt-in per-URL) so cold
 *     boots with no network start with yesterday's value instead of blank.
 *
 * The client deliberately does NOT do postMessage bridging: that's the job
 * of a thin widget-preamble helper that the iframe loads. This keeps the
 * core logic testable in pure Node/jsdom without DOM plumbing.
 */

import { createLogger } from '@xiboplayer/utils';
import { evalJsonPath, parseJsonPath } from './jsonpath.js';

const log = createLogger('Datasource');

const DEFAULT_REFRESH_MS = 30_000;
const MIN_REFRESH_MS = 1_000;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const DEFAULT_STORAGE_KEY = 'xp:datasource:lkg';
const LKG_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h — tighter guarantees than "eternity"

/** @typedef {{
 *   url: string,
 *   refreshMs: number,
 *   value: any,
 *   fetchedAt: number,
 *   error: Error|null,
 *   timer: any,
 *   inFlight: Promise<any>|null,
 *   subscribers: Set<Subscriber>,
 * }} Entry */

/** @typedef {{
 *   callback: (value: any, meta: {stale: boolean, error: Error|null, fetchedAt: number}) => void,
 *   jsonpath: string|null,
 *   segments: Array|null,
 *   fallback: any,
 *   refreshMs: number,
 * }} Subscriber */

export class DatasourceClient {
  /**
   * @param {Object} [options]
   * @param {(url: string, init?: any) => Promise<Response>} [options.fetchImpl] - injectable (tests)
   * @param {Storage|null} [options.storage] - localStorage-like (null disables persistence)
   * @param {string} [options.storageKey]
   * @param {number} [options.defaultRefreshMs]
   * @param {number} [options.fetchTimeoutMs]
   * @param {(ms: number) => void} [options.logThrottledMs] - internal throttle for noisy logs
   */
  constructor(options = {}) {
    this._fetch = options.fetchImpl || ((url, init) => globalThis.fetch(url, init));
    this._storage = options.storage === undefined
      ? (typeof localStorage !== 'undefined' ? localStorage : null)
      : options.storage;
    this._storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
    this._defaultRefreshMs = Math.max(MIN_REFRESH_MS, options.defaultRefreshMs || DEFAULT_REFRESH_MS);
    this._fetchTimeoutMs = options.fetchTimeoutMs || DEFAULT_FETCH_TIMEOUT_MS;

    /** @type {Map<string, Entry>} */
    this._entries = new Map();

    /** Stopped: no new fetches will run; subscribers still get LKG. */
    this._stopped = false;

    this._loadPersisted();
  }

  /**
   * Subscribe to a data source. Deduplicated by URL across all subscribers.
   *
   * The callback is invoked:
   *   - synchronously once at subscribe time if a cached value exists (with
   *     `stale: age > refreshMs` so widgets can render a freshness badge);
   *   - on every successful fetch thereafter;
   *   - on fetch error with the previous value (stale=true, error=set) if
   *     one exists, else with the configured `fallback`.
   *
   * @param {string} url - Absolute URL to poll. Relative URLs are resolved
   *                       against window.location if available.
   * @param {(value: any, meta: {stale: boolean, error: Error|null, fetchedAt: number}) => void} callback
   * @param {Object} [options]
   * @param {number} [options.refreshMs=30000] - Poll cadence. If multiple
   *        subscribers request different cadences, the shortest wins.
   * @param {string} [options.jsonpath] - If set, callback receives the path
   *        extraction instead of the full response (per-subscriber view).
   * @param {any}    [options.fallback] - Value to emit when no data is available.
   * @param {boolean} [options.persist=true] - Persist last-known-good to storage.
   * @returns {() => void} Unsubscribe function. When last subscriber unsubscribes
   *          the poller is torn down but the cached value is retained for
   *          the session (next subscribe wins instant cache hit).
   */
  subscribe(url, callback, options = {}) {
    if (typeof url !== 'string' || url.length === 0) {
      throw new Error('DatasourceClient.subscribe: url required');
    }
    if (typeof callback !== 'function') {
      throw new Error('DatasourceClient.subscribe: callback must be a function');
    }

    const refreshMs = Math.max(MIN_REFRESH_MS, options.refreshMs || this._defaultRefreshMs);
    const persist = options.persist !== false;
    const jsonpath = options.jsonpath || null;
    let segments = null;
    if (jsonpath) {
      try {
        segments = parseJsonPath(jsonpath);
      } catch (err) {
        log.warn(`Invalid jsonpath "${jsonpath}":`, err.message);
      }
    }

    const sub = {
      callback,
      jsonpath,
      segments,
      fallback: options.fallback,
      refreshMs,
      persist,
    };

    let entry = this._entries.get(url);
    if (!entry) {
      entry = {
        url,
        refreshMs,
        value: undefined,
        fetchedAt: 0,
        error: null,
        timer: null,
        inFlight: null,
        subscribers: new Set(),
        persisted: false,
      };
      this._entries.set(url, entry);

      // Seed from persisted LKG if available
      const lkg = this._readPersisted(url);
      if (lkg) {
        entry.value = lkg.value;
        entry.fetchedAt = lkg.fetchedAt;
      }
    } else if (refreshMs < entry.refreshMs) {
      // Tighten cadence to match the most eager subscriber
      entry.refreshMs = refreshMs;
      if (entry.timer) this._scheduleNext(entry);
    }

    entry.subscribers.add(sub);
    if (persist) entry.persisted = true;

    // Synchronous first emit if we have a cached value
    if (entry.fetchedAt > 0) {
      this._emitOne(sub, entry, this._isStale(entry));
    } else if (sub.fallback !== undefined) {
      // No cache yet — emit fallback so the widget paints something while
      // the first fetch is in flight. The poller will overwrite shortly.
      try {
        sub.callback(sub.fallback, { stale: true, error: null, fetchedAt: 0, fromFallback: true });
      } catch (err) {
        log.warn('subscriber fallback callback threw:', err);
      }
    }

    // Ensure a fetch is scheduled. If already in-flight or about to run, noop.
    if (!this._stopped && !entry.timer && !entry.inFlight) {
      // Kick an immediate fetch (don't wait refreshMs for first data)
      this._fetchNow(entry).catch(() => {});
    }

    return () => this._unsubscribe(url, sub);
  }

  /**
   * Force an immediate refresh of a URL. Returns a promise that resolves
   * when a fresh fetch finishes (success or failure). Useful after a
   * network reconnect event to warm all caches at once. If a fetch is
   * already in flight, `refresh()` waits for it to complete and then
   * triggers an additional fetch, so callers always observe a fresh
   * network round-trip after the promise resolves.
   *
   * @param {string} [url] - If omitted, refreshes every active subscription.
   * @returns {Promise<void>}
   */
  async refresh(url) {
    if (url) {
      const entry = this._entries.get(url);
      if (entry) await this._forceFetch(entry);
      return;
    }
    const all = [...this._entries.values()].map((e) => this._forceFetch(e));
    await Promise.all(all);
  }

  /**
   * Wait for any in-flight fetch to settle, then trigger a new one and
   * return its promise. Used by refresh() to guarantee the caller sees
   * a fresh network round-trip regardless of timing races with a
   * concurrent scheduled poll.
   */
  async _forceFetch(entry) {
    if (entry.inFlight) {
      try { await entry.inFlight; } catch { /* ignore */ }
    }
    // Clear any scheduled timer so we don't double-fire right after.
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    try { await this._fetchNow(entry); } catch { /* ignore */ }
  }

  /**
   * Peek at the cached value for a URL without subscribing.
   * Returns `undefined` if nothing cached. Used for tests and debug overlays.
   * @param {string} url
   * @returns {{value: any, fetchedAt: number, stale: boolean, error: Error|null}|undefined}
   */
  peek(url) {
    const entry = this._entries.get(url);
    if (!entry || entry.fetchedAt === 0) return undefined;
    return {
      value: entry.value,
      fetchedAt: entry.fetchedAt,
      stale: this._isStale(entry),
      error: entry.error,
    };
  }

  /**
   * Stop all polling. Cached values remain in memory so
   * subsequent peek()/subscribe() calls can still read them.
   */
  stop() {
    this._stopped = true;
    for (const entry of this._entries.values()) {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
    }
  }

  /** Resume polling if previously stopped. */
  resume() {
    if (!this._stopped) return;
    this._stopped = false;
    for (const entry of this._entries.values()) {
      if (entry.subscribers.size > 0 && !entry.timer && !entry.inFlight) {
        this._fetchNow(entry).catch(() => {});
      }
    }
  }

  /** Debug: snapshot of current state. */
  stats() {
    return {
      urls: this._entries.size,
      subscriptions: [...this._entries.values()].reduce((n, e) => n + e.subscribers.size, 0),
      stopped: this._stopped,
    };
  }

  // ── Internal ────────────────────────────────────────────────────────

  _unsubscribe(url, sub) {
    const entry = this._entries.get(url);
    if (!entry) return;
    entry.subscribers.delete(sub);
    if (entry.subscribers.size === 0) {
      if (entry.timer) {
        clearTimeout(entry.timer);
        entry.timer = null;
      }
      // Retain cached value in memory for the session; next subscribe gets instant hit.
    }
  }

  _isStale(entry) {
    return Date.now() - entry.fetchedAt > entry.refreshMs;
  }

  _scheduleNext(entry) {
    if (this._stopped) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = null;
      this._fetchNow(entry).catch(() => {});
    }, entry.refreshMs);
  }

  async _fetchNow(entry) {
    if (this._stopped || entry.subscribers.size === 0) return;
    if (entry.inFlight) return entry.inFlight; // dedup concurrent triggers

    const url = entry.url;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), this._fetchTimeoutMs)
      : null;

    entry.inFlight = (async () => {
      try {
        const response = await this._fetch(url, controller ? { signal: controller.signal } : undefined);
        if (!response || typeof response.ok !== 'boolean') {
          throw new Error(`Invalid response object from fetch(${url})`);
        }
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText || ''} for ${url}`);
        }
        const body = await this._parseResponse(response);
        entry.value = body;
        entry.fetchedAt = Date.now();
        entry.error = null;
        if (entry.persisted) this._writePersisted(url, body, entry.fetchedAt);
        this._emitAll(entry, /*stale*/ false);
      } catch (err) {
        entry.error = err;
        // Keep entry.value as last-known-good so subscribers still see data.
        const hadLkg = entry.fetchedAt > 0;
        log.warn(`fetch ${url} failed:`, err.message || err, hadLkg ? '(serving LKG)' : '(no LKG — falling back)');
        this._emitAll(entry, /*stale*/ true);
      } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
        entry.inFlight = null;
        this._scheduleNext(entry);
      }
    })();

    return entry.inFlight;
  }

  async _parseResponse(response) {
    const ct = response.headers?.get ? (response.headers.get('content-type') || '') : '';
    if (ct.includes('application/json') || ct.includes('+json')) {
      return await response.json();
    }
    const text = await response.text();
    // Best-effort JSON parse for servers that serve JSON as text/plain
    const trimmed = text.trim();
    if (trimmed.length > 0 && (trimmed[0] === '{' || trimmed[0] === '[')) {
      try {
        return JSON.parse(trimmed);
      } catch { /* fall through — treat as plain text */ }
    }
    return text;
  }

  _emitAll(entry, stale) {
    const meta = { stale, error: entry.error, fetchedAt: entry.fetchedAt };
    for (const sub of entry.subscribers) {
      this._emitOne(sub, entry, stale, meta);
    }
  }

  _emitOne(sub, entry, stale, meta) {
    const viewMeta = meta || { stale, error: entry.error, fetchedAt: entry.fetchedAt };
    let value = entry.value;
    if (sub.segments) {
      const extracted = evalJsonPath(entry.value, sub.segments);
      value = extracted === undefined ? sub.fallback : extracted;
    } else if (value === undefined && sub.fallback !== undefined) {
      value = sub.fallback;
    }
    try {
      sub.callback(value, viewMeta);
    } catch (err) {
      log.warn('subscriber callback threw:', err);
    }
  }

  // ── Persistence ─────────────────────────────────────────────────────

  _loadPersisted() {
    if (!this._storage) return;
    try {
      const raw = this._storage.getItem(this._storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      // Lazy: keep the parsed map on the instance; individual entries pull
      // their LKG on first subscribe.
      this._persistedMap = parsed;
    } catch (err) {
      log.warn('failed to load persisted LKG:', err.message || err);
      this._persistedMap = null;
    }
  }

  _readPersisted(url) {
    if (!this._persistedMap) return null;
    const entry = this._persistedMap[url];
    if (!entry || typeof entry !== 'object') return null;
    if (typeof entry.fetchedAt !== 'number') return null;
    if (Date.now() - entry.fetchedAt > LKG_MAX_AGE_MS) return null;
    return entry;
  }

  _writePersisted(url, value, fetchedAt) {
    if (!this._storage) return;
    try {
      let map = {};
      const raw = this._storage.getItem(this._storageKey);
      if (raw) {
        try { map = JSON.parse(raw) || {}; } catch { map = {}; }
      }
      // Drop entries older than 24h opportunistically
      const cutoff = Date.now() - LKG_MAX_AGE_MS;
      for (const k of Object.keys(map)) {
        if (!map[k] || typeof map[k].fetchedAt !== 'number' || map[k].fetchedAt < cutoff) {
          delete map[k];
        }
      }
      map[url] = { value, fetchedAt };
      this._storage.setItem(this._storageKey, JSON.stringify(map));
      this._persistedMap = map;
    } catch (err) {
      // QuotaExceededError is the usual suspect — log once and keep going.
      log.warn('failed to persist LKG:', err.message || err);
    }
  }
}
