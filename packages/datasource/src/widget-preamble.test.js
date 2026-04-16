// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2024-2026 Pau Aliagas <linuxnow@gmail.com>
/**
 * Tests for widget-preamble: both the serialisable widget-side script
 * generator and the host-side postMessage bridge.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildWidgetPreamble,
  attachHostBridge,
  DATASOURCE_MSG_TYPE,
} from './widget-preamble.js';
import { DatasourceClient } from './datasource-client.js';

describe('buildWidgetPreamble', () => {
  it('requires a URL', () => {
    expect(() => buildWidgetPreamble({})).toThrow();
    expect(() => buildWidgetPreamble(null)).toThrow();
  });

  it('returns a string with the URL embedded', () => {
    const src = buildWidgetPreamble({ url: 'https://api.example.com/x' });
    expect(typeof src).toBe('string');
    expect(src).toContain('https://api.example.com/x');
    expect(src).toContain(DATASOURCE_MSG_TYPE);
  });

  it('embeds jsonpath, refreshMs, fallback, selector verbatim', () => {
    const src = buildWidgetPreamble({
      url: 'https://x/',
      jsonpath: '$.rooms[0].status',
      refreshMs: 15000,
      fallback: 'loading',
      selector: '#room-status',
    });
    expect(src).toContain('$.rooms[0].status');
    expect(src).toContain('15000');
    expect(src).toContain('"loading"');
    expect(src).toContain('#room-status');
  });

  it('generated script is syntactically valid JavaScript', () => {
    const src = buildWidgetPreamble({ url: 'https://x/' });
    // Wrap in a function to avoid actually running subscribe; new Function()
    // only validates syntax, it does not execute on parse.
    expect(() => new Function(src)).not.toThrow();
  });

  it('handles quote escaping in URLs and paths', () => {
    const src = buildWidgetPreamble({
      url: 'https://api.example.com/a?q=1&b=2',
      jsonpath: "$['with \"mixed\" quotes']",
    });
    expect(() => new Function(src)).not.toThrow();
  });

  it('defaults fallback to null, selector to [data-xp-bind]', () => {
    const src = buildWidgetPreamble({ url: 'https://x/' });
    expect(src).toContain('[data-xp-bind]');
    // null fallback should appear as part of the serialised config
    expect(src).toMatch(/"fallback":\s*null/);
  });
});

describe('attachHostBridge — postMessage protocol', () => {
  let client, bridge, listeners;

  beforeEach(() => {
    client = new DatasourceClient({ storage: null });
    listeners = [];
    // Each test builds its own fake window
  });

  afterEach(() => {
    if (bridge) bridge.destroy();
    client.stop();
  });

  /** Create a minimal fake Window that records postMessage calls and exposes
   *  a way to dispatch synthetic 'message' events. */
  function fakeWindow() {
    const messageListeners = [];
    const posted = [];
    return {
      addEventListener(type, listener) {
        if (type === 'message') messageListeners.push(listener);
      },
      removeEventListener(type, listener) {
        if (type === 'message') {
          const i = messageListeners.indexOf(listener);
          if (i !== -1) messageListeners.splice(i, 1);
        }
      },
      postMessage(data) { posted.push(data); },
      _dispatch(event) { for (const l of messageListeners) l(event); },
      _posted: posted,
    };
  }

  it('subscribes on receiving a subscribe message', async () => {
    const hostWin = fakeWindow();
    const iframeWin = fakeWindow();
    const subSpy = vi.spyOn(client, 'subscribe');

    bridge = attachHostBridge(client, hostWin);
    hostWin._dispatch({
      source: iframeWin,
      data: {
        type: DATASOURCE_MSG_TYPE,
        action: 'subscribe',
        id: 'w1',
        url: 'https://api.example.com/x',
        jsonpath: '$.v',
        refreshMs: 5000,
        fallback: 'fb',
      },
    });
    expect(subSpy).toHaveBeenCalledTimes(1);
    const [url, , opts] = subSpy.mock.calls[0];
    expect(url).toBe('https://api.example.com/x');
    expect(opts).toMatchObject({ jsonpath: '$.v', refreshMs: 5000, fallback: 'fb' });
    expect(bridge.stats()).toEqual({ subscribers: 1 });
  });

  it('forwards values back to the originating iframe window', async () => {
    const hostWin = fakeWindow();
    const iframeWin = fakeWindow();
    bridge = attachHostBridge(client, hostWin);

    // Inject a subscription that uses a synchronous-fallback path
    hostWin._dispatch({
      source: iframeWin,
      data: {
        type: DATASOURCE_MSG_TYPE,
        action: 'subscribe',
        id: 'w1',
        url: 'https://api.example.com/forward',
        fallback: 'instant',
      },
    });

    // The synchronous fallback emit posted a message back to the iframe
    expect(iframeWin._posted.length).toBeGreaterThan(0);
    const msg = iframeWin._posted[0];
    expect(msg.type).toBe(DATASOURCE_MSG_TYPE);
    expect(msg.action).toBe('value');
    expect(msg.id).toBe('w1');
    expect(msg.value).toBe('instant');
  });

  it('unsubscribe message tears down the subscription', () => {
    const hostWin = fakeWindow();
    const iframeWin = fakeWindow();
    bridge = attachHostBridge(client, hostWin);

    hostWin._dispatch({
      source: iframeWin,
      data: {
        type: DATASOURCE_MSG_TYPE, action: 'subscribe',
        id: 'w1', url: 'https://api.example.com/u', fallback: 'fb',
      },
    });
    expect(bridge.stats().subscribers).toBe(1);

    hostWin._dispatch({
      source: iframeWin,
      data: { type: DATASOURCE_MSG_TYPE, action: 'unsubscribe', id: 'w1' },
    });
    expect(bridge.stats().subscribers).toBe(0);
  });

  it('ignores unrelated messages', () => {
    const hostWin = fakeWindow();
    const iframeWin = fakeWindow();
    const subSpy = vi.spyOn(client, 'subscribe');
    bridge = attachHostBridge(client, hostWin);

    hostWin._dispatch({
      source: iframeWin,
      data: { type: 'something-else', action: 'subscribe' },
    });
    hostWin._dispatch({ source: iframeWin, data: null });
    hostWin._dispatch({ source: iframeWin, data: { type: DATASOURCE_MSG_TYPE } }); // no action
    expect(subSpy).not.toHaveBeenCalled();
  });

  it('destroy() removes listener and clears all subscribers', () => {
    const hostWin = fakeWindow();
    const iframeWin = fakeWindow();
    bridge = attachHostBridge(client, hostWin);
    hostWin._dispatch({
      source: iframeWin,
      data: {
        type: DATASOURCE_MSG_TYPE, action: 'subscribe',
        id: 'w1', url: 'https://api.example.com/d',
      },
    });
    expect(client.stats().subscriptions).toBe(1);
    bridge.destroy();
    // destroy() removed the client subscription
    expect(client.stats().subscriptions).toBe(0);
    // Subsequent messages are ignored (listener removed)
    const cnt = client.stats().subscriptions;
    hostWin._dispatch({
      source: iframeWin,
      data: {
        type: DATASOURCE_MSG_TYPE, action: 'subscribe',
        id: 'w2', url: 'https://api.example.com/d',
      },
    });
    expect(client.stats().subscriptions).toBe(cnt);
    bridge = null;
  });

  it('replaces existing subscription when same (source, id) re-subscribes', () => {
    const hostWin = fakeWindow();
    const iframeWin = fakeWindow();
    bridge = attachHostBridge(client, hostWin);
    hostWin._dispatch({
      source: iframeWin,
      data: {
        type: DATASOURCE_MSG_TYPE, action: 'subscribe',
        id: 'w1', url: 'https://api.example.com/a',
      },
    });
    hostWin._dispatch({
      source: iframeWin,
      data: {
        type: DATASOURCE_MSG_TYPE, action: 'subscribe',
        id: 'w1', url: 'https://api.example.com/b',
      },
    });
    // Same id on same source replaces — still 1 active
    expect(bridge.stats().subscribers).toBe(1);
  });

  it('throws when target window has no addEventListener', () => {
    expect(() => attachHostBridge(client, {})).toThrow(/no window/);
  });
});

describe('buildWidgetPreamble — end-to-end DOM execution', () => {
  /** Execute the preamble script body inside jsdom and verify the DOM
   *  is updated when the simulated parent sends a 'value' message. */
  it('writes incoming value to the selector target', async () => {
    // Build a widget HTML page and execute the preamble as if inside a widget
    document.body.innerHTML = '<span data-xp-bind></span>';
    // Fake parent (no real parent in test) — preamble tries parent.postMessage
    // but wraps it in try/catch, so we accept silent no-op.
    const src = buildWidgetPreamble({
      url: 'https://x/',
      selector: '[data-xp-bind]',
      fallback: 'loading',
      id: 'fixed-id',
    });
    // Run the script
    new Function(src)();
    // Fallback should have rendered synchronously
    expect(document.querySelector('[data-xp-bind]').textContent).toBe('loading');

    // Simulate a 'value' message from the host
    const evt = new MessageEvent('message', {
      data: {
        type: DATASOURCE_MSG_TYPE,
        action: 'value',
        id: 'fixed-id',
        value: 42,
        stale: false,
        error: null,
        fetchedAt: Date.now(),
      },
    });
    window.dispatchEvent(evt);
    expect(document.querySelector('[data-xp-bind]').textContent).toBe('42');

    // Object values are JSON-stringified
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: DATASOURCE_MSG_TYPE, action: 'value',
        id: 'fixed-id', value: { room: 'A', status: 'free' },
        stale: false, error: null, fetchedAt: Date.now(),
      },
    }));
    expect(document.querySelector('[data-xp-bind]').textContent).toBe('{"room":"A","status":"free"}');
  });

  it('ignores messages with a different id', () => {
    document.body.innerHTML = '<span data-xp-bind>initial</span>';
    const src = buildWidgetPreamble({
      url: 'https://x/',
      selector: '[data-xp-bind]',
      id: 'mine',
    });
    new Function(src)();
    // Send a message to a different widget id
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: DATASOURCE_MSG_TYPE, action: 'value', id: 'other',
        value: 'nope', stale: false, error: null, fetchedAt: 0,
      },
    }));
    expect(document.querySelector('[data-xp-bind]').textContent).toBe('initial');
  });

  it('error + null value falls back to configured fallback', () => {
    document.body.innerHTML = '<span data-xp-bind></span>';
    const src = buildWidgetPreamble({
      url: 'https://x/',
      selector: '[data-xp-bind]',
      fallback: 'offline',
      id: 'id2',
    });
    new Function(src)();
    // First sync render: fallback on page load
    expect(document.querySelector('[data-xp-bind]').textContent).toBe('offline');
    // Send success value
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: DATASOURCE_MSG_TYPE, action: 'value', id: 'id2',
        value: 'live', stale: false, error: null, fetchedAt: 0,
      },
    }));
    expect(document.querySelector('[data-xp-bind]').textContent).toBe('live');
    // Send error with null → fallback
    window.dispatchEvent(new MessageEvent('message', {
      data: {
        type: DATASOURCE_MSG_TYPE, action: 'value', id: 'id2',
        value: null, stale: true, error: 'net down', fetchedAt: 0,
      },
    }));
    expect(document.querySelector('[data-xp-bind]').textContent).toBe('offline');
  });
});
