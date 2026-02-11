# PWA Player Implementation Plan: Feature Gap Closure

## Architecture Overview

The PWA player is organized as a monorepo with these key packages:

| Package | Path | Purpose |
|---------|------|---------|
| `@xiboplayer/core` | `packages/core/src/player-core.js` | Platform-independent orchestration |
| `@xiboplayer/xmds` | `packages/xmds/src/xmds.js` | SOAP API client |
| `@xiboplayer/xmr` | `packages/xmr/src/xmr-wrapper.js` | WebSocket push messaging |
| `@xiboplayer/renderer` | `packages/renderer/src/renderer-lite.js` | XLF layout renderer |
| `@xiboplayer/cache` | `packages/cache/src/cache.js` | Cache API + IndexedDB file management |
| `@xiboplayer/schedule` | `packages/schedule/src/schedule.js` | Layout scheduling |
| `@xiboplayer/stats` | `packages/stats/src/` | Stats collector + Log reporter |
| `@xiboplayer/settings` | `packages/settings/src/settings.js` | Display settings management |
| `@xiboplayer/utils` | `packages/utils/src/` | Config, logger, events |
| Platform PWA | `platforms/pwa/src/main.ts` | PWA-specific integration |

---

## P0 -- Critical for Production

### Feature 1: Log Submission to CMS

**Current State:** `LogReporter` class exists in `packages/stats/src/log-reporter.js` with full IndexedDB storage, `formatLogs()` XML formatter, and `getLogsForSubmission()` / `clearSubmittedLogs()` methods. `XmdsClient.submitLog()` exists in `packages/xmds/src/xmds.js` (line 358). What is missing is the wiring: nothing instantiates `LogReporter`, intercepts log messages, or triggers submission.

**Complexity:** S (Small) -- all building blocks exist, just need integration.

**Implementation approach:**

**Step 1: Wire LogReporter into the PWA platform layer**

Modify `platforms/pwa/src/main.ts`:
- Import `LogReporter` and `formatLogs` from `@xiboplayer/stats`
- Instantiate `LogReporter` alongside `StatsCollector` in `loadCoreModules()` (around line 207)
- Store as `this.logReporter`
- Call `await this.logReporter.init()` after instantiation

**Step 2: Intercept logger output and feed to LogReporter**

Modify `packages/utils/src/logger.js`:
- Add a global `logSink` callback array (similar to how transports work in XLR's `loggerLib.ts`)
- In each Logger method (`debug`, `info`, `warn`, `error`), after the console call, invoke all registered sinks with `{ level, name, message, timestamp }`
- Export `registerLogSink(callback)` and `unregisterLogSink(callback)`

```javascript
// In logger.js, add near the end:
const logSinks = [];

export function registerLogSink(fn) {
  logSinks.push(fn);
}

export function unregisterLogSink(fn) {
  const idx = logSinks.indexOf(fn);
  if (idx >= 0) logSinks.splice(idx, 1);
}

// In Logger class methods, add after console call:
// logSinks.forEach(fn => fn({ level: 'error', name: this.name, args }));
```

**Step 3: Bridge logger sinks to LogReporter**

In `platforms/pwa/src/main.ts`, after LogReporter init:
```javascript
registerLogSink(({ level, name, args }) => {
  const message = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  this.logReporter.log(level, `[${name}] ${message}`, 'PLAYER').catch(() => {});
});
```

**Step 4: Submit logs during collection cycle**

Add a `submit-logs-request` event handler in `setupCoreEventHandlers()` (or hook into `collection-complete`):
```javascript
this.core.on('collection-complete', async () => {
  await this.submitLogs();
});
```

Add `submitLogs()` method to `PwaPlayer`:
```javascript
private async submitLogs() {
  if (!this.logReporter) return;
  const logs = await this.logReporter.getLogsForSubmission(100);
  if (logs.length === 0) return;
  const xml = formatLogs(logs);
  const success = await this.xmds.submitLog(xml);
  if (success) {
    await this.logReporter.clearSubmittedLogs(logs);
  }
}
```

**Step 5: Add log submission trigger to PlayerCore**

Modify `packages/core/src/player-core.js` `collect()` method (around line 173, after stats submission):
```javascript
// Submit logs
this.emit('submit-logs-request');
```

**Files to modify:**
- `packages/utils/src/logger.js` -- add log sink registration
- `packages/utils/src/index.js` -- export new functions
- `platforms/pwa/src/main.ts` -- wire LogReporter, add submitLogs()
- `packages/core/src/player-core.js` -- emit submit-logs-request

**Tests:**
- Add test to `log-reporter.test.js` for end-to-end flow
- Mock XMDS submitLog in integration test

---

### Feature 2: Fault Reporting

**Current State:** No fault reporting exists. XLR has a `reportFaults` event emitted during collection (line 153 of `xmds.ts`). The CMS does not have a dedicated `ReportFault` XMDS endpoint per the SOAP protocol; instead, faults are submitted as log entries with specific `eventType` and `alertType` fields (see XLR's `loggerLib.ts` lines 9-18: `'Display Up'`, `'Display Down'`, `'Player Fault'`, etc.).

**Complexity:** M (Medium) -- new class needed but pattern is clear from XLR.

**Implementation approach:**

**Step 1: Create FaultReporter class**

Create new file `packages/stats/src/fault-reporter.js`:

```javascript
export class FaultReporter {
  constructor() {
    this.faults = new Map(); // key -> { code, reason, timestamp, ttl }
  }

  /**
   * Report a fault (deduplicates by key)
   * @param {string} code - Fault code (e.g., 'LAYOUT_LOAD_FAILED')
   * @param {string} reason - Human-readable reason
   * @param {string} key - Deduplication key (optional)
   * @param {number} ttl - Time-to-live in seconds (default: 60)
   */
  report(code, reason, key = null, ttl = 60) {
    const faultKey = key || `fault_${code}`;
    this.faults.set(faultKey, {
      code,
      reason,
      timestamp: new Date(),
      ttl,
      submitted: false
    });
  }

  /**
   * Get faults for submission as log entries with alertType fields
   * Faults are submitted as special log entries per XLR pattern
   */
  getFaultsForSubmission() {
    const faults = [];
    const now = Date.now();
    for (const [key, fault] of this.faults) {
      if ((now - fault.timestamp.getTime()) / 1000 > fault.ttl) {
        this.faults.delete(key);
        continue;
      }
      if (!fault.submitted) {
        faults.push({ ...fault, key });
      }
    }
    return faults;
  }

  markSubmitted(keys) {
    for (const key of keys) {
      if (this.faults.has(key)) {
        this.faults.get(key).submitted = true;
      }
    }
  }

  clearAll() {
    this.faults.clear();
  }
}
```

**Step 2: Integrate FaultReporter into PwaPlayer**

- Instantiate in `loadCoreModules()`
- Report faults on key error events:
  - Layout load failures (in `prepareAndRenderLayout` catch block)
  - Renderer errors (in `setupRendererEventHandlers` error handler)
  - Collection errors
  - Cache corruption detected
- Submit faults as part of log submission (append fault log entries to regular logs)

**Step 3: Report common fault scenarios**

In `setupRendererEventHandlers()`:
```javascript
this.renderer.on('error', (error) => {
  this.faultReporter?.report(
    error.type || 'RENDERER_ERROR',
    `Renderer error: ${error.message || error.type}`,
    `renderer_${error.layoutId || 'unknown'}`
  );
});
```

In `prepareAndRenderLayout()` catch block:
```javascript
this.faultReporter?.report(
  'LAYOUT_LOAD_FAILED',
  `Failed to prepare layout ${layoutId}: ${error.message}`,
  `layout_${layoutId}`
);
```

**Files to create:**
- `packages/stats/src/fault-reporter.js`
- `packages/stats/src/fault-reporter.test.js`

**Files to modify:**
- `packages/stats/src/index.js` -- export FaultReporter
- `platforms/pwa/src/main.ts` -- instantiate and wire FaultReporter

---

## P1 -- High Impact

### Feature 3: CRC32 Optimization

**Current State:** Every collection cycle, the PWA calls `requiredFiles()` and `schedule()` unconditionally, re-downloading the full XML response even when nothing has changed. XLR stores `checkRf` and `checkSchedule` CRC32 values from `RegisterDisplay` response and skips the SOAP call if the CRC matches. The all-day log analysis confirmed this: 184 collection cycles re-enqueued all 26 files every time, with 0 actual downloads needed after the initial load.

**Complexity:** S (Small) -- straightforward comparison logic.

**Implementation approach:**

**Step 1: Extract checkRf/checkSchedule from RegisterDisplay response**

Modify `packages/xmds/src/xmds.js` `parseRegisterDisplayResponse()` (around line 148):

```javascript
parseRegisterDisplayResponse(xml) {
  // ... existing code ...
  const display = doc.querySelector('display');

  const checkSchedule = display.getAttribute('checkSchedule') || '';
  const checkRf = display.getAttribute('checkRf') || '';

  return { code, message, settings, checkSchedule, checkRf };
}
```

**Step 2: Store CRC32 values in PlayerCore**

Modify `packages/core/src/player-core.js`:
- Add `this.checkRf = null;` and `this.checkSchedule = null;` to constructor
- In `collect()`, after registerDisplay, extract and store:
  ```javascript
  this.checkRf = regResult.checkRf || null;
  this.checkSchedule = regResult.checkSchedule || null;
  ```

**Step 3: Skip XMDS calls when CRC matches**

Modify `packages/core/src/player-core.js` `collect()`:

```javascript
// Get required files - skip if CRC unchanged
const lastCheckRf = this._lastCheckRf;
if (!lastCheckRf || lastCheckRf !== this.checkRf) {
  const files = await this.xmds.requiredFiles();
  this._lastCheckRf = this.checkRf;
  this.emit('files-received', files);
  // ... download logic ...
} else {
  log.info('RequiredFiles CRC unchanged, skipping download');
}

// Same pattern for schedule
const lastCheckSchedule = this._lastCheckSchedule;
if (!lastCheckSchedule || lastCheckSchedule !== this.checkSchedule) {
  const schedule = await this.xmds.schedule();
  this._lastCheckSchedule = this.checkSchedule;
  // ... schedule processing ...
} else {
  log.info('Schedule CRC unchanged, skipping');
}
```

**Files to modify:**
- `packages/xmds/src/xmds.js` -- extract checkRf/checkSchedule
- `packages/core/src/player-core.js` -- store and compare CRC values

**Dependencies:** None -- completely independent.

---

### Feature 4: Interactive Control Listener

**Current State:** `bundle.min.js` (the `xibo-interactive-control` library) is already served from the static cache and loads in widget iframes. The library makes HTTP requests to routes like `/trigger`, `/duration/expire`, `/duration/extend`, `/duration/set`, `/fault`, `/info`, and `/realtime`. The missing piece is the player-side request handler.

**Complexity:** M (Medium) -- need to create a request interceptor.

**Implementation approach:**

The `xibo-interactive-control` library uses `XMLHttpRequest` to communicate with the player via HTTP routes. In a PWA context, we cannot run an HTTP server. Instead, we intercept these requests at the Service Worker level and route them to the player via `postMessage`.

**Step 1: Create InteractiveControlHandler**

Create new file `packages/renderer/src/interactive-control.js`:

```javascript
export class InteractiveControlHandler {
  constructor(renderer) {
    this.renderer = renderer;
    this.dataStore = new Map();
  }

  handleRequest(method, path, body) {
    switch (path) {
      case '/info':
        return { status: 200, body: JSON.stringify({
          hardwareKey: this.renderer.config.hardwareKey,
          playerType: 'pwa'
        })};
      case '/trigger':
        return this.handleTrigger(body);
      case '/duration/expire':
        return this.handleExpire(body);
      case '/duration/extend':
        return this.handleExtend(body);
      case '/duration/set':
        return this.handleSetDuration(body);
      case '/fault':
        return this.handleFault(body);
      default:
        if (path.startsWith('/realtime')) {
          return this.handleGetData(path);
        }
        return { status: 404, body: 'Not found' };
    }
  }

  handleTrigger(body) {
    const { id, trigger } = body;
    this.renderer.emit('interactiveTrigger', { targetId: id, triggerCode: trigger });
    return { status: 200, body: 'OK' };
  }

  handleExpire(body) {
    const { id } = body;
    this.renderer.expireWidget(id);
    return { status: 200, body: 'OK' };
  }

  handleExtend(body) {
    const { id, duration } = body;
    this.renderer.extendWidgetDuration(id, parseInt(duration));
    return { status: 200, body: 'OK' };
  }

  handleSetDuration(body) {
    const { id, duration } = body;
    this.renderer.setWidgetDuration(id, parseInt(duration));
    return { status: 200, body: 'OK' };
  }

  handleFault(body) {
    this.renderer.emit('widgetFault', body);
    return { status: 200, body: 'OK' };
  }

  handleGetData(path) {
    const url = new URL(path, 'http://localhost');
    const dataKey = url.searchParams.get('dataKey');
    const data = this.dataStore.get(dataKey);
    if (data) {
      return { status: 200, body: JSON.stringify(data) };
    }
    return { status: 404, body: null };
  }
}
```

**Step 2: Intercept requests in Service Worker**

Add to the SW fetch handler for interactive control routes. Use `MessageChannel` for synchronous response back from the main thread.

**Step 3: Add widget control methods to RendererLite**

Add `expireWidget()`, `extendWidgetDuration()`, `setWidgetDuration()` methods.

**Step 4: Wire into PwaPlayer**

Listen for `INTERACTIVE_CONTROL` messages from SW and dispatch to handler.

**Files to create:**
- `packages/renderer/src/interactive-control.js`
- `packages/renderer/src/interactive-control.test.js`

**Files to modify:**
- SW fetch handler -- intercept IC requests
- `packages/renderer/src/renderer-lite.js` -- add widget control methods
- `platforms/pwa/src/main.ts` -- wire IC handler

**Dependencies:** None, but complements P2 Feature 10 (Action events in schedule).

---

### Feature 5: Layout Scaling/Positioning

**Current State:** The renderer uses absolute pixel values from XLF directly. If a layout is designed for 1920x1080 but displayed on a 1366x768 screen, regions overflow. XLR calculates `scaleFactor = Math.min(screenWidth/layoutWidth, screenHeight/layoutHeight)` and applies it.

**Complexity:** M (Medium) -- math is simple but affects all positioning.

**Implementation approach:**

**Step 1: Calculate scale factor in renderLayout**

```javascript
const screenWidth = this.container.clientWidth;
const screenHeight = this.container.clientHeight;
const scaleX = screenWidth / layout.width;
const scaleY = screenHeight / layout.height;
const scaleFactor = Math.min(scaleX, scaleY);
const offsetX = (screenWidth - layout.width * scaleFactor) / 2;
const offsetY = (screenHeight - layout.height * scaleFactor) / 2;
```

**Step 2: Apply scale factor to region positioning**

```javascript
regionEl.style.left = `${regionConfig.left * sf + ox}px`;
regionEl.style.top = `${regionConfig.top * sf + oy}px`;
regionEl.style.width = `${regionConfig.width * sf}px`;
regionEl.style.height = `${regionConfig.height * sf}px`;
```

**Step 3: Handle window resize**

Add a `ResizeObserver` on the container that recalculates scale and repositions all regions.

**Files to modify:**
- `packages/renderer/src/renderer-lite.js` -- scale logic in renderLayout, createRegion, add resize handler

---

## P2 -- Medium Impact

### Feature 6: Stats Aggregation

**Current State:** `StatsCollector` stores individual stats with `count: 1`. XLR supports `aggregationLevel` setting from CMS ('Individual' or 'Aggregate'). When aggregated, stats are grouped by (type, layoutId, mediaId, scheduleId, hour).

**Complexity:** S (Small).

Add `getAggregatedStatsForSubmission(limit, level)` method that groups stats when `aggregationLevel === 'Aggregate'`.

**Files to modify:**
- `packages/stats/src/stats-collector.js` -- add aggregation method
- `platforms/pwa/src/main.ts` -- use aggregation level from displaySettings

---

### Feature 7: Font CSS URL Rewriting

**Current State:** `fonts.css` is downloaded and cached, but URLs inside still point to CMS. Need to rewrite to local paths.

**Complexity:** S (Small) -- port the regex from XLR's `fileManager.ts`.

```javascript
async rewriteFontCss(cssText) {
  const regex = /url\((['"]?)(https?:\/\/[^'")?]+\?file=([^&'")]+\.(?:woff2?|ttf|otf|eot|svg))[^'")]*?)\1\)/gi;
  return cssText.replace(regex, (_match, quote, fullUrl, fileName) => {
    return `url(${quote}/player/pwa/cache/static/${encodeURIComponent(fileName)}${quote})`;
  });
}
```

**Files to modify:**
- `packages/cache/src/cache.js` -- add rewriteFontCss, apply during fontCss download

---

### Feature 8: Purge List

**Current State:** RequiredFiles response can include a `purge` list of files to remove from cache. Currently ignored.

**Complexity:** S (Small).

Parse `<file type="purge">` entries from RequiredFiles response, emit `purge-request` event, delete from cache.

**Files to modify:**
- `packages/xmds/src/xmds.js` -- parse purge list
- `packages/core/src/player-core.js` -- emit purge event
- `platforms/pwa/src/main.ts` -- handle purge
- `packages/cache/src/cache-proxy.js` -- add deleteFile method if missing

---

### Feature 9: Missing XMR Message Types

**Current State:** `xmr-wrapper.js` has handlers for `collectNow`, `screenShot`, `licenceCheck`, `changeLayout`, `rekey`, `criteriaUpdate`, and `currentGeoLocation`. The gap is that `PwaPlayer` does not implement `captureScreenshot()` or `commandAction`.

**Complexity:** M (Medium) -- screenshot capture requires html2canvas or similar.

**Implementation:**
1. Add `captureScreenshot()` using html2canvas, submit via `xmds.submitScreenShot()`
2. Add periodic screenshot submission using `displaySettings.screenshotInterval`
3. Add `commandAction` handler for `showStatusWindow`, `forceUpdate`, `geoLocation`

**Files to modify:**
- `platforms/pwa/src/main.ts` -- add captureScreenshot, screenshot interval
- `packages/xmr/src/xmr-wrapper.js` -- add commandAction handler

**Dependencies:** Need to add `html2canvas` as a dependency (or use a lighter alternative).

---

### Feature 10: Action Events in Schedule

**Current State:** Schedule parser only handles `<layout>`, `<campaign>`, and `<overlay>`. XLR also parses `<action>`, `<dataconnector>`, and `<command>` elements.

**Complexity:** M (Medium) -- parse + handler infrastructure.

Parse action events, create `ActionHandler` class with trigger listeners (touch, webhook) and execute actions (navigateToLayout, navigateToWidget, command).

**Files to create:**
- `packages/schedule/src/actions.js`

**Files to modify:**
- `packages/xmds/src/xmds.js` -- parse actions from schedule XML
- `packages/schedule/src/schedule.js` -- store/expose actions

---

## P3 -- Low Impact

### Feature 11: Data Connectors

**Complexity:** L (Large). Requires real-time data polling, storage, and notification to widgets. Skip for now; implement when customer demand requires it.

### Feature 12: Dependants Tracking

**Complexity:** S (Small). Track `mediaId -> Set<layoutId>` to know which media files can be purged when layouts are removed from schedule.

**Files to modify:**
- `packages/cache/src/cache.js` -- add dependants map

### Feature 13: Background Image Support

**Complexity:** S (Small). Parse `background` attribute from XLF `<layout>` element and set as container background.

**Files to modify:**
- `packages/renderer/src/renderer-lite.js` -- parse and apply background

### Feature 14: Centralized State Class

**Complexity:** S (Small). Port XLR's `State` class for tracking currentLayoutId, displayStatus, dimensions, etc.

**Files to create:**
- `packages/core/src/state.js`

### Feature 15: Retry Logic with Backoff

**Complexity:** S (Small). Add `fetchWithRetry()` utility with exponential backoff.

**Files to create:**
- `packages/utils/src/fetch-retry.js`

**Files to modify:**
- `packages/xmds/src/xmds.js` -- use fetchWithRetry in `call()`

---

## Implementation Order (Dependencies)

```
Phase 1 (P0 - Critical, do first):
  1. Log Submission (Feature 1) <- prerequisite for all debugging
  2. Fault Reporting (Feature 2) <- depends on log infrastructure

Phase 2 (P1 - High Impact):
  3. CRC32 Optimization (Feature 3) <- independent, easy win
  5. Layout Scaling (Feature 5) <- independent, visual correctness
  4. Interactive Control (Feature 4) <- depends on SW changes

Phase 3 (P2 - Medium Impact, parallel):
  6. Stats Aggregation (Feature 6) <- independent
  7. Font CSS Rewriting (Feature 7) <- independent
  8. Purge List (Feature 8) <- independent
  9. XMR Message Types (Feature 9) <- independent
  10. Action Events (Feature 10) <- benefits from Feature 4

Phase 4 (P3 - Low Impact, as needed):
  13. Background Image (Feature 13) <- quick win
  15. Retry Logic (Feature 15) <- quick win
  14. State Class (Feature 14) <- refactoring
  12. Dependants (Feature 12) <- optimization
  11. Data Connectors (Feature 11) <- large, defer
```

---

## Estimated Effort Summary

| Feature | Priority | Complexity | Est. Hours | Dependencies |
|---------|----------|------------|------------|--------------|
| Log Submission | P0 | S | 2-3h | None |
| Fault Reporting | P0 | M | 3-4h | Feature 1 |
| CRC32 Optimization | P1 | S | 1-2h | None |
| Interactive Control | P1 | M | 4-6h | None |
| Layout Scaling | P1 | M | 3-4h | None |
| Stats Aggregation | P2 | S | 1-2h | None |
| Font CSS Rewriting | P2 | S | 1-2h | None |
| Purge List | P2 | S | 1-2h | None |
| XMR Message Types | P2 | M | 3-4h | None |
| Action Events | P2 | M | 4-5h | Feature 4 |
| Data Connectors | P3 | L | 8-12h | Feature 4 |
| Dependants | P3 | S | 1-2h | None |
| Background Image | P3 | S | 0.5-1h | None |
| State Class | P3 | S | 1-2h | None |
| Retry Logic | P3 | S | 1h | None |

**Total estimated: 34-52 hours** (P0+P1: ~15h, P2: ~12h, P3: ~12h)

---

## Critical Files for Implementation

- `platforms/pwa/src/main.ts` - Central integration point: all features wire through PwaPlayer class
- `packages/core/src/player-core.js` - Orchestration hub: CRC32 state, new events, collection flow
- `packages/renderer/src/renderer-lite.js` - Rendering engine: layout scaling, widget control, background
- `packages/xmds/src/xmds.js` - SOAP client: extract CRC32, parse purge list and actions
- `packages/utils/src/logger.js` - Log infrastructure: sink registration for CMS log submission
