// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
/**
 * Tests for DatasourceClient
 *
 * Cover: dedup, TTL/refresh cadence, JSONPath per-subscriber views,
 * error → last-known-good, fallback emission, localStorage persistence,
 * stop/resume, peek, refresh, and lifecycle (subscribe/unsubscribe).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatasourceClient } from './datasource-client.js';

/** Build a mock fetch that serves JSON responses, tracks call count,
 *  and lets tests control error injection per-URL. */
function makeFetch(responses) {
  const calls = [];
  const fn = vi.fn(async (url) => {
    calls.push(url);
    const handler = responses[url];
    if (!handler) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        json: async () => ({}),
        text: async () => '',
      };
    }
    return typeof handler === 'function' ? await handler(url, calls.length) : handler;
  });
  fn.calls = calls;
  return fn;
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: {
      get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
    },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Minimal in-memory storage implementing the Storage API subset we use. */
function memStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _raw: map,
  };
}

describe('DatasourceClient — subscribe/fetch basics', () => {
  let fetchImpl, client;

  beforeEach(() => {
    fetchImpl = makeFetch({
      'https://api.example.com/prices': jsonResponse({ usd: 42 }),
    });
    client = new DatasourceClient({ fetchImpl, storage: null });
  });

  afterEach(() => {
    client.stop();
  });

  it('invokes callback once on first successful fetch', async () => {
    const cb = vi.fn();
    client.subscribe('https://api.example.com/prices', cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalled());
    const [value, meta] = cb.mock.calls[0];
    expect(value).toEqual({ usd: 42 });
    expect(meta.stale).toBe(false);
    expect(meta.error).toBe(null);
    expect(meta.fetchedAt).toBeGreaterThan(0);
  });

  it('returns unsubscribe function that stops further emissions', async () => {
    const cb = vi.fn();
    const unsub = client.subscribe('https://api.example.com/prices', cb, { refreshMs: 1000 });
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
    unsub();
    // Cache cleared of subscribers → no further fetches
    const snapshot = fetchImpl.calls.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(fetchImpl.calls.length).toBe(snapshot);
  });

  it('emits fallback synchronously before first fetch resolves', async () => {
    // Slow fetch so fallback is observable
    let resolveFetch;
    const slow = makeFetch({
      'https://api.example.com/slow': () => new Promise((r) => { resolveFetch = () => r(jsonResponse({ ok: true })); }),
    });
    const slowClient = new DatasourceClient({ fetchImpl: slow, storage: null });
    const cb = vi.fn();
    slowClient.subscribe('https://api.example.com/slow', cb, { fallback: 'loading…' });
    // First synchronous call should be the fallback
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBe('loading…');
    expect(cb.mock.calls[0][1].fromFallback).toBe(true);
    // Let the fetch resolve
    resolveFetch();
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(2));
    expect(cb.mock.calls[1][0]).toEqual({ ok: true });
    slowClient.stop();
  });
});

describe('DatasourceClient — deduplication across subscribers', () => {
  it('two subscribers to same URL share one fetch', async () => {
    const fetchImpl = makeFetch({
      'https://api.example.com/shared': jsonResponse({ v: 1 }),
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    const a = vi.fn();
    const b = vi.fn();
    client.subscribe('https://api.example.com/shared', a);
    client.subscribe('https://api.example.com/shared', b);
    await vi.waitFor(() => {
      expect(a).toHaveBeenCalled();
      expect(b).toHaveBeenCalled();
    });
    expect(fetchImpl.calls.length).toBe(1);
    client.stop();
  });

  it('late subscriber gets cached value synchronously', async () => {
    const fetchImpl = makeFetch({
      'https://api.example.com/warm': jsonResponse({ n: 99 }),
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    const first = vi.fn();
    client.subscribe('https://api.example.com/warm', first);
    await vi.waitFor(() => expect(first).toHaveBeenCalled());

    const late = vi.fn();
    client.subscribe('https://api.example.com/warm', late);
    // Late subscriber receives cached value in its first emit synchronously
    expect(late).toHaveBeenCalledTimes(1);
    expect(late.mock.calls[0][0]).toEqual({ n: 99 });
    // No extra fetch — cache hit
    expect(fetchImpl.calls.length).toBe(1);
    client.stop();
  });

  it('each subscriber gets its own jsonpath view', async () => {
    const fetchImpl = makeFetch({
      'https://api.example.com/rooms': jsonResponse({
        rooms: [
          { name: 'Alpha', status: 'free' },
          { name: 'Beta', status: 'busy' },
        ],
      }),
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    const nameCb = vi.fn();
    const statusCb = vi.fn();
    client.subscribe('https://api.example.com/rooms', nameCb, { jsonpath: '$.rooms[0].name' });
    client.subscribe('https://api.example.com/rooms', statusCb, { jsonpath: '$.rooms[1].status' });
    await vi.waitFor(() => {
      expect(nameCb).toHaveBeenCalled();
      expect(statusCb).toHaveBeenCalled();
    });
    expect(nameCb.mock.calls[0][0]).toBe('Alpha');
    expect(statusCb.mock.calls[0][0]).toBe('busy');
    expect(fetchImpl.calls.length).toBe(1);
    client.stop();
  });

  it('jsonpath mismatch falls back to subscriber fallback', async () => {
    const fetchImpl = makeFetch({
      'https://api.example.com/data': jsonResponse({ ok: true }),
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    const cb = vi.fn();
    client.subscribe('https://api.example.com/data', cb, {
      jsonpath: '$.missing.path',
      fallback: 'n/a',
    });
    await vi.waitFor(() => {
      // First call is synchronous fallback (no cache yet), second call is post-fetch
      expect(cb).toHaveBeenCalledTimes(2);
    });
    expect(cb.mock.calls[1][0]).toBe('n/a');
    expect(cb.mock.calls[1][1].error).toBe(null); // fetch OK, just path miss
    client.stop();
  });
});

describe('DatasourceClient — refresh cadence', () => {
  it('shortest refreshMs across subscribers wins', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = makeFetch({
        'https://api.example.com/x': jsonResponse({ t: 'v' }),
      });
      const client = new DatasourceClient({ fetchImpl, storage: null });
      client.subscribe('https://api.example.com/x', () => {}, { refreshMs: 60_000 });
      await vi.runAllTicks();
      await vi.waitFor(() => expect(fetchImpl.calls.length).toBe(1));

      client.subscribe('https://api.example.com/x', () => {}, { refreshMs: 5_000 });
      // Advance past the short interval: one extra fetch should have fired.
      await vi.advanceTimersByTimeAsync(5_500);
      expect(fetchImpl.calls.length).toBe(2);
      client.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('refresh() forces immediate refetch', async () => {
    const fetchImpl = makeFetch({
      'https://api.example.com/force': jsonResponse({ v: 1 }),
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    client.subscribe('https://api.example.com/force', () => {}, { refreshMs: 60_000 });
    await vi.waitFor(() => expect(fetchImpl.calls.length).toBe(1));
    await client.refresh('https://api.example.com/force');
    expect(fetchImpl.calls.length).toBe(2);
    client.stop();
  });

  it('refresh() with no url refreshes all active URLs', async () => {
    const fetchImpl = makeFetch({
      'https://api.example.com/a': jsonResponse({ v: 'a' }),
      'https://api.example.com/b': jsonResponse({ v: 'b' }),
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    client.subscribe('https://api.example.com/a', () => {}, { refreshMs: 60_000 });
    client.subscribe('https://api.example.com/b', () => {}, { refreshMs: 60_000 });
    await vi.waitFor(() => expect(fetchImpl.calls.length).toBe(2));
    await client.refresh();
    expect(fetchImpl.calls.length).toBe(4);
    client.stop();
  });
});

describe('DatasourceClient — error handling and LKG', () => {
  it('serves last-known-good on fetch error', async () => {
    let callNum = 0;
    const fetchImpl = makeFetch({
      'https://api.example.com/flaky': () => {
        callNum++;
        if (callNum === 1) return jsonResponse({ v: 1 });
        throw new Error('network down');
      },
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    const cb = vi.fn();
    client.subscribe('https://api.example.com/flaky', cb, { refreshMs: 1_000 });
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(1));
    expect(cb.mock.calls[0][0]).toEqual({ v: 1 });

    // Force a failing refetch
    await client.refresh('https://api.example.com/flaky');
    // Should have emitted LKG with stale=true + error set
    const lastCall = cb.mock.calls[cb.mock.calls.length - 1];
    expect(lastCall[0]).toEqual({ v: 1 });
    expect(lastCall[1].stale).toBe(true);
    expect(lastCall[1].error).toBeTruthy();
    client.stop();
  });

  it('emits fallback when first fetch fails and no LKG', async () => {
    const fetchImpl = makeFetch({
      'https://api.example.com/dead': () => { throw new Error('no route'); },
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    const cb = vi.fn();
    client.subscribe('https://api.example.com/dead', cb, { fallback: 'offline' });
    // First call is synchronous fallback; second is the error-stale emission
    await vi.waitFor(() => expect(cb.mock.calls.length).toBeGreaterThanOrEqual(2));
    // Subscribe fallback emits first, then error path uses fallback again (since no LKG)
    expect(cb.mock.calls[0][0]).toBe('offline');
    expect(cb.mock.calls[0][1].fromFallback).toBe(true);
    const errorCall = cb.mock.calls.find((c) => c[1].error);
    expect(errorCall).toBeTruthy();
    expect(errorCall[0]).toBe('offline');
    client.stop();
  });

  it('HTTP 5xx is treated as error', async () => {
    const fetchImpl = makeFetch({
      'https://api.example.com/err': {
        ok: false, status: 500, statusText: 'Internal',
        headers: { get: () => 'application/json' },
        json: async () => ({}),
        text: async () => '',
      },
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    const cb = vi.fn();
    client.subscribe('https://api.example.com/err', cb, { fallback: 'fb' });
    await vi.waitFor(() => {
      const err = cb.mock.calls.find((c) => c[1].error);
      expect(err).toBeTruthy();
    });
    client.stop();
  });

  it('plain-text response is returned as-is (non-JSON content-type)', async () => {
    const fetchImpl = makeFetch({
      'https://api.example.com/text': {
        ok: true, status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => 'hello world',
        json: async () => { throw new Error('not json'); },
      },
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    const cb = vi.fn();
    client.subscribe('https://api.example.com/text', cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalled());
    expect(cb.mock.calls[0][0]).toBe('hello world');
    client.stop();
  });

  it('JSON-like text/plain body is auto-parsed', async () => {
    const fetchImpl = makeFetch({
      'https://api.example.com/jsonish': {
        ok: true, status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => '{"k":42}',
        json: async () => { throw new Error('not json'); },
      },
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    const cb = vi.fn();
    client.subscribe('https://api.example.com/jsonish', cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalled());
    expect(cb.mock.calls[0][0]).toEqual({ k: 42 });
    client.stop();
  });
});

describe('DatasourceClient — localStorage persistence', () => {
  it('writes LKG to storage after a successful fetch', async () => {
    const storage = memStorage();
    const fetchImpl = makeFetch({
      'https://api.example.com/cacheme': jsonResponse({ n: 7 }),
    });
    const client = new DatasourceClient({ fetchImpl, storage });
    client.subscribe('https://api.example.com/cacheme', () => {});
    await vi.waitFor(() => {
      const raw = storage.getItem('xp:datasource:lkg');
      expect(raw).toBeTruthy();
    });
    const parsed = JSON.parse(storage.getItem('xp:datasource:lkg'));
    expect(parsed['https://api.example.com/cacheme'].value).toEqual({ n: 7 });
    expect(parsed['https://api.example.com/cacheme'].fetchedAt).toBeGreaterThan(0);
    client.stop();
  });

  it('seeds subscriber from storage before first fetch resolves', async () => {
    const storage = memStorage();
    const url = 'https://api.example.com/seeded';
    storage.setItem('xp:datasource:lkg', JSON.stringify({
      [url]: { value: { cached: 'yes' }, fetchedAt: Date.now() - 5_000 },
    }));

    let resolveFetch;
    const fetchImpl = makeFetch({
      [url]: () => new Promise((r) => { resolveFetch = () => r(jsonResponse({ cached: 'fresh' })); }),
    });
    const client = new DatasourceClient({ fetchImpl, storage });
    const cb = vi.fn();
    client.subscribe(url, cb);

    // Initial emit should be the persisted value (synchronously)
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toEqual({ cached: 'yes' });

    resolveFetch();
    await vi.waitFor(() => expect(cb).toHaveBeenCalledTimes(2));
    expect(cb.mock.calls[1][0]).toEqual({ cached: 'fresh' });
    client.stop();
  });

  it('ignores storage entries older than 24h', async () => {
    const storage = memStorage();
    const url = 'https://api.example.com/stale';
    const twentyFiveHoursAgo = Date.now() - 25 * 60 * 60 * 1000;
    storage.setItem('xp:datasource:lkg', JSON.stringify({
      [url]: { value: 'too old', fetchedAt: twentyFiveHoursAgo },
    }));

    const fetchImpl = makeFetch({ [url]: jsonResponse('fresh') });
    const client = new DatasourceClient({ fetchImpl, storage });
    const cb = vi.fn();
    client.subscribe(url, cb);

    // No synchronous emit — stale LKG was discarded
    expect(cb).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(cb).toHaveBeenCalled());
    expect(cb.mock.calls[0][0]).toBe('fresh');
    client.stop();
  });

  it('persist=false skips storage writes', async () => {
    const storage = memStorage();
    const fetchImpl = makeFetch({
      'https://api.example.com/nop': jsonResponse({ v: 1 }),
    });
    const client = new DatasourceClient({ fetchImpl, storage });
    client.subscribe('https://api.example.com/nop', () => {}, { persist: false });
    await vi.waitFor(() => expect(fetchImpl.calls.length).toBe(1));
    expect(storage.getItem('xp:datasource:lkg')).toBe(null);
    client.stop();
  });

  it('handles corrupted storage gracefully', async () => {
    const storage = memStorage();
    storage.setItem('xp:datasource:lkg', 'not-json-at-all{{');
    const fetchImpl = makeFetch({
      'https://api.example.com/ok': jsonResponse({ v: 1 }),
    });
    const client = new DatasourceClient({ fetchImpl, storage });
    const cb = vi.fn();
    client.subscribe('https://api.example.com/ok', cb);
    await vi.waitFor(() => expect(cb).toHaveBeenCalled());
    expect(cb.mock.calls[0][0]).toEqual({ v: 1 });
    client.stop();
  });
});

describe('DatasourceClient — lifecycle', () => {
  it('stop() halts all pollers; resume() restarts them', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = makeFetch({
        'https://api.example.com/poll': jsonResponse({ v: 1 }),
      });
      const client = new DatasourceClient({ fetchImpl, storage: null, defaultRefreshMs: 1_000 });
      client.subscribe('https://api.example.com/poll', () => {});
      await vi.runAllTicks();
      await vi.waitFor(() => expect(fetchImpl.calls.length).toBe(1));
      client.stop();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(fetchImpl.calls.length).toBe(1);
      client.resume();
      await vi.runAllTicks();
      await vi.waitFor(() => expect(fetchImpl.calls.length).toBe(2));
      client.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('peek() returns cached snapshot', async () => {
    const fetchImpl = makeFetch({
      'https://api.example.com/peek': jsonResponse({ v: 'peeked' }),
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    client.subscribe('https://api.example.com/peek', () => {});
    await vi.waitFor(() => expect(client.peek('https://api.example.com/peek')).toBeTruthy());
    const snap = client.peek('https://api.example.com/peek');
    expect(snap.value).toEqual({ v: 'peeked' });
    expect(snap.stale).toBe(false);
    expect(snap.error).toBe(null);
    client.stop();
  });

  it('peek() returns undefined when URL never subscribed', () => {
    const client = new DatasourceClient({ fetchImpl: makeFetch({}), storage: null });
    expect(client.peek('https://nowhere.example.com/')).toBeUndefined();
    client.stop();
  });

  it('stats() reports url and subscription counts', async () => {
    const fetchImpl = makeFetch({
      'https://a.example.com/': jsonResponse({}),
      'https://b.example.com/': jsonResponse({}),
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    client.subscribe('https://a.example.com/', () => {});
    client.subscribe('https://a.example.com/', () => {});
    client.subscribe('https://b.example.com/', () => {});
    expect(client.stats()).toEqual({ urls: 2, subscriptions: 3, stopped: false });
    client.stop();
    expect(client.stats().stopped).toBe(true);
  });

  it('subscribe throws on empty url', () => {
    const client = new DatasourceClient({ fetchImpl: makeFetch({}), storage: null });
    expect(() => client.subscribe('', () => {})).toThrow();
    expect(() => client.subscribe('url', null)).toThrow();
    client.stop();
  });

  it('subscriber callback errors are caught and do not break other subscribers', async () => {
    const fetchImpl = makeFetch({
      'https://api.example.com/robust': jsonResponse({ v: 1 }),
    });
    const client = new DatasourceClient({ fetchImpl, storage: null });
    const good = vi.fn();
    client.subscribe('https://api.example.com/robust', () => { throw new Error('bad'); });
    client.subscribe('https://api.example.com/robust', good);
    await vi.waitFor(() => expect(good).toHaveBeenCalled());
    expect(good.mock.calls[0][0]).toEqual({ v: 1 });
    client.stop();
  });
});

describe('DatasourceClient — integration: widget A + widget B share a URL', () => {
  it('single poll feeds two distinct widgets with different JSONPath views', async () => {
    // Scenario from #235 G9: hotel-chain meeting-room dashboard. Two widgets
    // on the same layout point at /rooms.json but read different fields.
    // Expect ONE fetch, TWO delivered values.
    const roomsPayload = {
      rooms: [
        { id: 101, name: 'Studio A', status: 'IN SESSION' },
        { id: 102, name: 'Studio B', status: 'AVAILABLE' },
      ],
    };
    const fetchImpl = makeFetch({
      'https://tenant.example.com/rooms.json': jsonResponse(roomsPayload),
    });
    const client = new DatasourceClient({ fetchImpl, storage: null, defaultRefreshMs: 60_000 });

    const widgetA_receivedStatus = [];
    const widgetB_receivedName = [];

    // Widget A: room 0 status
    client.subscribe('https://tenant.example.com/rooms.json', (v) => widgetA_receivedStatus.push(v), {
      jsonpath: '$.rooms[0].status',
    });
    // Widget B: room 1 name
    client.subscribe('https://tenant.example.com/rooms.json', (v) => widgetB_receivedName.push(v), {
      jsonpath: '$.rooms[1].name',
    });

    await vi.waitFor(() => {
      expect(widgetA_receivedStatus.length).toBeGreaterThan(0);
      expect(widgetB_receivedName.length).toBeGreaterThan(0);
    });

    expect(widgetA_receivedStatus).toContain('IN SESSION');
    expect(widgetB_receivedName).toContain('Studio B');
    expect(fetchImpl.calls.length).toBe(1); // dedup held
    client.stop();
  });
});
