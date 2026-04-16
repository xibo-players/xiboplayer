# @xiboplayer/datasource

Shared data-source cache for ADA `xp:datasource` widgets (#235 gap G9).

## Problem

ADA emits `xp:datasource="URL"` + `xp:jsonpath="$.path"` on data-bound widgets
(hotel-chain live prices, queue numbers, meeting-room status, bank rates, …).
The translator promotes these into embedded widgets carrying inline JS that
polls the URL. Without a shared cache:

- Every widget polls independently — six data-bound widgets on one layout =
  six simultaneous fetches every 30 s.
- Two widgets reading the same URL fetch twice.
- If network drops, widgets show the fallback forever even after reconnect.
- Each iframe evaluates CORS on its own origin.

## Solution

A single `DatasourceClient` lives in the PWA (not inside each widget iframe):

- Deduplicates fetches by URL across all subscribers.
- Serves cached values to late subscribers synchronously.
- Persists last-known-good to `localStorage` so cold boots without network
  show yesterday's values instead of blank.
- On fetch error, emits last-known-good (or the configured fallback) with
  `meta.stale=true` and `meta.error` set so widgets can render a freshness
  badge.
- Widgets subscribe over `postMessage` (protocol token `xp:datasource`), so
  cross-origin or `blob:` URL iframes don't need direct access to the host
  client.
- On `window.online`, all active URLs are force-refreshed.

## API

```js
import { DatasourceClient, attachHostBridge, buildWidgetPreamble } from '@xiboplayer/datasource';

// On the host (PWA main.ts):
const client = new DatasourceClient({ defaultRefreshMs: 30_000 });
const bridge = attachHostBridge(client, window);
// window.xpDatasource = client; // optional same-origin escape hatch

// Inline subscribe (same-origin, no iframe):
const unsubscribe = client.subscribe(
  'https://tenant.example.com/rooms.json',
  (value, meta) => {
    document.querySelector('#room-status').textContent = value;
  },
  { jsonpath: '$.rooms[0].status', refreshMs: 30_000, fallback: '—' }
);
```

### DatasourceClient

| Method | Summary |
|--------|---------|
| `subscribe(url, cb, opts?)` | Register callback; returns unsubscribe fn. Dedup by URL. `opts`: `refreshMs`, `jsonpath`, `fallback`, `persist`. |
| `refresh(url?)` | Force a fresh fetch. Omit URL to refresh every active subscription. Returns when the fetch settles. |
| `peek(url)` | Read cached `{value, fetchedAt, stale, error}` snapshot without subscribing. |
| `stop() / resume()` | Halt or restart pollers (cached values retained). |
| `stats()` | Debug snapshot: `{urls, subscriptions, stopped}`. |

### attachHostBridge(client, window)

Installs a `message` listener. Iframe widgets send:

```js
window.parent.postMessage({
  type: 'xp:datasource', action: 'subscribe',
  id: 'w1', url: 'https://…', jsonpath: '$.x', refreshMs: 30000, fallback: '—'
}, '*');
```

The bridge returns values to the originating iframe with
`{ type: 'xp:datasource', action: 'value', id, value, stale, error, fetchedAt }`.
Send `action: 'unsubscribe'` to tear down.

### buildWidgetPreamble(options)

Generates a self-contained JS string that the **translator**
(`xiboplayer-smil-tools`) can inline in each widget's HTML. The script
subscribes to the configured URL, receives values, and writes them into a
DOM target (default selector `[data-xp-bind]`). This is the replacement
for the current fetch-loop widget template.

## Integration pattern for xiboplayer-smil-tools

Replace the per-widget `setInterval(fetch, 30000)` emitter in
`src/xlf-builder.js` (`buildXpTextEmbeddedMedia`) with:

```js
import { buildWidgetPreamble } from '@xiboplayer/datasource';

// In the embedded widget HTML:
<script>
${buildWidgetPreamble({
  url: item.xpAttrs.datasource,
  jsonpath: item.xpAttrs.jsonpath,
  refreshMs: parseInt(item.xpAttrs.refresh || '30') * 1000,
  fallback: item.xpAttrs.fallback || null,
  selector: '[data-xp-bind]',
})}
</script>
<div data-xp-bind></div>
```

The bundle size stays small (the preamble is a few hundred bytes; all fetch
+ cache logic lives in the PWA, not in each widget).

## JSONPath subset

`parseJsonPath` + `evalJsonPath` implement the ADA-emitted subset:

- `$` root
- `$.a.b.c` dot notation
- `$.a[0]` / `$.a[-1]` bracket index (negative = from end)
- `$['a.key']` / `$["a key"]` quoted bracket keys
- `$.items[*].price` wildcard (returns an array)

Out of scope (by design): filter expressions `[?(@.x>1)]`, recursive descent
`$..name`, slices `[1:3]`, script expressions.

## Testing

```
cd packages/datasource
pnpm test
```

Coverage includes: dedup fetching, TTL caching, LKG fallback on error,
localStorage persistence, 24-h expiry, stop/resume, JSONPath extraction,
widget preamble end-to-end DOM update, host bridge postMessage protocol.
