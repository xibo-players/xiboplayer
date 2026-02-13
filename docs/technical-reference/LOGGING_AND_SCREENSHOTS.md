# Logging and Screenshot Implementation

## Overview

This document describes the SubmitLog and SubmitScreenShot SOAP methods implementation for remote debugging and display verification.

## Features

### SubmitLog
- Collects player logs in IndexedDB
- Batch submission (100 logs per batch)
- Log level filtering (off, error, audit)
- SOAP XML formatting
- Automatic retry on failure

### SubmitScreenShot
- Captures player container as PNG
- Base64 encoding for SOAP
- Html2canvas integration (best quality)
- Native canvas fallback
- Placeholder for testing

## Architecture

```
┌─────────────────────────────────────────────────┐
│ PlayerCore / PWA Main                           │
│ - Lifecycle events                              │
│ - Error handling                                │
└────────────┬────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────┐
│ LogReporter (@xiboplayer/stats)                 │
│ - log(level, message, meta)                     │
│ - submit()                                      │
│ - IndexedDB storage                             │
└────────────┬────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────┐
│ XmdsClient (@xiboplayer/xmds)                   │
│ - submitLog(logXml)                             │
│ - submitScreenShot(base64)                      │
│ - SOAP envelope building                        │
└────────────┬────────────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────────────┐
│ Xibo CMS                                        │
│ - Stores logs in database                       │
│ - Displays in Displays > Logs                   │
│ - Screenshots in Display profile                │
└─────────────────────────────────────────────────┘
```

## Usage

### LogReporter

```javascript
import { LogReporter, LOG_LEVELS } from '@xiboplayer/stats';
import { XmdsClient } from '@xiboplayer/xmds';

// Initialize
const xmds = new XmdsClient(config);
const logger = new LogReporter(xmds, { logLevel: LOG_LEVELS.ERROR });
await logger.init();

// Log messages
logger.log('info', 'Player started');
logger.log('error', 'Failed to load layout', {
  method: 'loadLayout',
  layoutId: 123,
  scheduleId: 456
});

// Log events (always recorded)
logger.log('event', 'Display came online', {
  eventType: 'Display Up',
  alertType: 'start'
});

// Manual submission
await logger.submit();

// Auto-submission happens at 100 logs
```

### Screenshot Capture

```javascript
import { captureScreenshot, getPlaceholderScreenshot } from '@xiboplayer/stats';
import { XmdsClient } from '@xiboplayer/xmds';

// Capture player container
try {
  const base64 = await captureScreenshot('#player-container', {
    width: 1920,
    height: 1080,
    quality: 0.9
  });

  // Submit to CMS
  const xmds = new XmdsClient(config);
  const success = await xmds.submitScreenShot(base64);

  console.log('Screenshot submitted:', success);
} catch (error) {
  // Fallback to placeholder
  const placeholder = getPlaceholderScreenshot();
  await xmds.submitScreenShot(placeholder);
}
```

### Integration with PlayerCore

```javascript
// In platforms/pwa/src/main.ts

import { LogReporter, LOG_LEVELS, captureScreenshot } from '@xiboplayer/stats';

class PwaPlayer {
  async init() {
    // Initialize logger
    this.logger = new LogReporter(this.xmds, {
      logLevel: config.logLevel || LOG_LEVELS.ERROR
    });
    await this.logger.init();

    // Log player lifecycle
    this.logger.log('event', 'Player initialized', {
      eventType: 'App Start',
      alertType: 'start'
    });

    // Setup error handler
    window.addEventListener('error', (event) => {
      this.logger.log('error', event.message, {
        method: 'window.onerror'
      });
    });

    // Setup core event handlers
    this.core.on('collection-error', (error) => {
      this.logger.log('error', error.message, {
        method: 'PlayerCore.collect'
      });
    });

    this.core.on('layout-error', (layoutId, error) => {
      this.logger.log('error', error.message, {
        method: 'loadLayout',
        layoutId
      });
    });
  }

  // XMR screenshot request handler
  async handleScreenshotRequest() {
    try {
      const base64 = await captureScreenshot('#player-container');
      await this.xmds.submitScreenShot(base64);
      console.log('[PWA] Screenshot submitted to CMS');
    } catch (error) {
      console.error('[PWA] Screenshot capture failed:', error);
      // Submit placeholder
      const placeholder = getPlaceholderScreenshot();
      await this.xmds.submitScreenShot(placeholder);
    }
  }
}
```

## Log Levels

### Off
- Only logs events (Display Up, Display Down, etc.)
- No info, error, or debug logs

### Error
- Logs errors + events
- Good for production (minimal overhead)

### Audit/Debug
- Logs everything (info, error, debug, events)
- Good for troubleshooting

## Log Entry Structure

```javascript
{
  uid: 'unique-id',
  timestamp: 1707561600000,
  date: '2026-02-10 12:00:00',
  category: 'Error',  // Audit, Debug, Error, event
  message: 'Failed to load layout',
  method: 'loadLayout',
  scheduleId: 123,
  layoutId: 456,
  mediaId: 789,
  eventType: 'Display Up',
  alertType: 'start',
  refId: 999
}
```

## SOAP XML Format

### SubmitLog

```xml
<soap:Envelope>
  <soap:Body>
    <tns:SubmitLog>
      <serverKey>...</serverKey>
      <hardwareKey>...</hardwareKey>
      <logXml>&lt;logs&gt;
        &lt;log date="2026-02-10 12:00:00" category="Error"&gt;
          &lt;message&gt;Failed to load layout&lt;/message&gt;
          &lt;method&gt;loadLayout&lt;/method&gt;
          &lt;layoutId&gt;123&lt;/layoutId&gt;
        &lt;/log&gt;
      &lt;/logs&gt;</logXml>
    </tns:SubmitLog>
  </soap:Body>
</soap:Envelope>
```

### SubmitScreenShot

```xml
<soap:Envelope>
  <soap:Body>
    <tns:SubmitScreenShot>
      <serverKey>...</serverKey>
      <hardwareKey>...</hardwareKey>
      <screenShot>iVBORw0KGgoAAAANSUhEUgAA...</screenShot>
    </tns:SubmitScreenShot>
  </soap:Body>
</soap:Envelope>
```

## Testing

### Unit Tests

```bash
# Run all tests
npm run test:unit

# Run XMDS tests
npx vitest run packages/xmds/src/xmds.test.js

# Run LogReporter tests
npx vitest run packages/stats/src/log-reporter.test.js

# Run screenshot tests
npx vitest run packages/stats/src/screenshot.test.js

# Coverage
npx vitest run --coverage
```

### Manual Testing

1. **Test Log Submission**
   ```javascript
   // In browser console
   const logger = window.pwaPlayer.logger;

   // Log test message
   logger.log('error', 'Test error from browser');

   // Submit manually
   await logger.submit();

   // Check CMS: Displays > [Your Display] > Logs
   ```

2. **Test Screenshot Capture**
   ```javascript
   // In browser console
   const { captureScreenshot } = await import('@xiboplayer/stats');
   const xmds = window.pwaPlayer.xmds;

   // Capture and submit
   const base64 = await captureScreenshot('#player-container');
   await xmds.submitScreenShot(base64);

   // Check CMS: Displays > [Your Display] > Edit > Screenshot
   ```

3. **Test via XMR**
   - In CMS: Displays > [Your Display] > Send Command > Request Screenshot
   - Wait 10-30s
   - Check Display profile for screenshot

### Contract Tests

Tests verify compatibility with Xibo CMS XMDS protocol:

- SOAP envelope structure
- XML escaping (double-encoding)
- Response parsing
- Error handling
- Large payloads (screenshots)

## Performance

### LogReporter
- **Memory**: ~50KB per 100 logs in IndexedDB
- **Submission**: <1s for 100 logs
- **Batch interval**: 10s between batches
- **Auto-submit**: At 100 logs

### Screenshot
- **html2canvas**: 500ms-2s for 1920x1080
- **Native fallback**: <100ms (lower quality)
- **Size**: 50-500KB base64 (depends on content)
- **SOAP overhead**: ~3% size increase

## CMS Integration

### Viewing Logs
1. Navigate to **Displays**
2. Select display
3. Click **Logs** tab
4. Filter by date, category
5. Export as CSV

### Viewing Screenshots
1. Navigate to **Displays**
2. Select display
3. Click **Edit**
4. View screenshot in **Display Information** section
5. Request new screenshot via **Send Command**

## Troubleshooting

### Logs not appearing in CMS

**Check log level:**
```javascript
// Should be 'error' or 'audit', not 'off'
console.log(config.logLevel);
```

**Check log count:**
```javascript
const count = await logger.getLogCount();
console.log(`${count} logs pending`);
```

**Force submission:**
```javascript
await logger.submit();
```

### Screenshots fail to capture

**Check html2canvas:**
```javascript
console.log(window.html2canvas ? 'Available' : 'Not loaded');
```

**Use placeholder:**
```javascript
const { getPlaceholderScreenshot } = await import('@xiboplayer/stats');
const placeholder = getPlaceholderScreenshot();
await xmds.submitScreenShot(placeholder);
```

### SOAP errors

**Check XMDS endpoint:**
```bash
curl -X POST https://your-cms.com/xmds.php?v=5 \
  -H "Content-Type: text/xml" \
  -d '<soap:Envelope>...</soap:Envelope>'
```

**Check server key:**
```javascript
console.log(config.cmsKey);
```

## Security

- Logs are stored locally in IndexedDB (player only)
- SOAP traffic should use HTTPS
- Server key authenticates submissions
- No sensitive data in logs (avoid logging passwords, tokens)

## Future Enhancements

1. **Automatic screenshot on errors** - Capture screenshot when critical errors occur
2. **Log rotation** - Delete old logs after X days
3. **Compression** - Gzip logs before submission
4. **Retry queue** - Persistent queue for failed submissions
5. **Performance metrics** - Track submission latency
6. **Log filtering** - Client-side filtering by method, layoutId, etc.

## References

- **Upstream implementation**: `electron-player/src/main/xmds/xmds.ts` (Xibo upstream)
- **XMDS protocol**: https://github.com/linuxnow/xibo_players_docs
- **Tests**: `packages/xmds/src/xmds.test.js`, `packages/stats/src/log-reporter.test.js`
