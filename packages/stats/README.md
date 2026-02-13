# @xiboplayer/stats

Proof of play tracking and CMS logging for Xibo Players.

## Features

- **StatsCollector**: Track layout and widget playback for proof of play reporting
- **LogReporter**: Collect and submit application logs to CMS
- **IndexedDB Storage**: Persistent storage across browser sessions
- **Offline Support**: Stats and logs are queued when offline and submitted when online
- **Quota Management**: Automatic cleanup of old data when storage quota is exceeded
- **XMDS Integration**: Format stats and logs as XML for CMS submission

## Installation

```bash
npm install @xiboplayer/stats
```

## Usage

### StatsCollector - Proof of Play Tracking

The StatsCollector tracks when layouts and widgets (media) are played for reporting to the CMS.

```javascript
import { StatsCollector, formatStats } from '@xiboplayer/stats';

// Initialize collector
const collector = new StatsCollector();
await collector.init();

// Track layout playback
await collector.startLayout(layoutId, scheduleId);
// ... layout plays for 5 minutes ...
await collector.endLayout(layoutId, scheduleId);

// Track widget playback
await collector.startWidget(mediaId, layoutId, scheduleId);
// ... widget plays for 30 seconds ...
await collector.endWidget(mediaId, layoutId, scheduleId);

// Submit stats to CMS
const stats = await collector.getStatsForSubmission(50); // Get up to 50 stats
const xml = formatStats(stats);
const success = await xmds.submitStats(xml);

if (success) {
  await collector.clearSubmittedStats(stats);
}
```

#### API Reference

**`new StatsCollector()`**

Create a new stats collector instance.

**`async init()`**

Initialize IndexedDB storage. Must be called before using other methods.

**`async startLayout(layoutId, scheduleId)`**

Start tracking a layout. Creates a new stat entry and marks it as in-progress.

- `layoutId` (number): Layout ID from CMS
- `scheduleId` (number): Schedule ID that triggered this layout

**`async endLayout(layoutId, scheduleId)`**

End tracking a layout. Calculates duration and saves to database.

- `layoutId` (number): Layout ID from CMS
- `scheduleId` (number): Schedule ID

**`async startWidget(mediaId, layoutId, scheduleId)`**

Start tracking a widget/media item.

- `mediaId` (number): Media ID from CMS
- `layoutId` (number): Parent layout ID
- `scheduleId` (number): Schedule ID

**`async endWidget(mediaId, layoutId, scheduleId)`**

End tracking a widget. Calculates duration and saves to database.

- `mediaId` (number): Media ID from CMS
- `layoutId` (number): Parent layout ID
- `scheduleId` (number): Schedule ID

**`async getStatsForSubmission(limit = 50)`**

Get unsubmitted stats ready for submission to CMS.

- `limit` (number): Maximum number of stats to return (default: 50)
- Returns: Array of stat objects

**`async clearSubmittedStats(stats)`**

Delete stats that were successfully submitted to CMS.

- `stats` (Array): Array of stat objects to delete

**`async getAllStats()`**

Get all stats from database (for debugging).

- Returns: Array of all stat objects

**`async clearAllStats()`**

Clear all stats from database (for testing).

#### Stat Object Structure

```javascript
{
  id: 123,                 // Auto-generated ID
  type: 'layout',          // 'layout' or 'media'
  layoutId: 456,           // Layout ID from CMS
  scheduleId: 789,         // Schedule ID
  mediaId: 111,            // Only for type='media'
  start: Date,             // Start time
  end: Date,               // End time
  duration: 300,           // Duration in seconds
  count: 1,                // Number of plays (always 1)
  submitted: 0             // 0 = not submitted, 1 = submitted
}
```

### formatStats - XML Formatting

Format stats array as XML for XMDS SubmitStats API.

```javascript
import { formatStats } from '@xiboplayer/stats';

const stats = await collector.getStatsForSubmission(50);
const xml = formatStats(stats);

console.log(xml);
// <stats>
//   <stat type="layout" fromdt="2026-02-10 12:00:00" todt="2026-02-10 12:05:00"
//         scheduleid="123" layoutid="456" count="1" duration="300" />
//   <stat type="media" fromdt="2026-02-10 12:00:00" todt="2026-02-10 12:01:00"
//         scheduleid="123" layoutid="456" mediaid="789" count="1" duration="60" />
// </stats>
```

### LogReporter - CMS Logging

The LogReporter collects application logs and submits them to the CMS via XMDS.

```javascript
import { LogReporter, formatLogs } from '@xiboplayer/stats';

// Initialize reporter
const reporter = new LogReporter();
await reporter.init();

// Log messages
await reporter.error('Failed to load layout 123', 'PLAYER');
await reporter.audit('User logged in', 'AUTH');
await reporter.info('Layout loaded successfully', 'RENDERER');
await reporter.debug('Cache hit for file ABC', 'CACHE');

// Submit logs to CMS
const logs = await reporter.getLogsForSubmission(100); // Get up to 100 logs
const xml = formatLogs(logs);
const success = await xmds.submitLog(xml);

if (success) {
  await reporter.clearSubmittedLogs(logs);
}
```

#### API Reference

**`new LogReporter()`**

Create a new log reporter instance.

**`async init()`**

Initialize IndexedDB storage. Must be called before using other methods.

**`async log(level, message, category = 'PLAYER')`**

Log a message with specified level.

- `level` (string): Log level - 'error', 'audit', 'info', or 'debug'
- `message` (string): Log message
- `category` (string): Log category (default: 'PLAYER')

**`async error(message, category = 'PLAYER')`**

Shorthand for logging an error message.

**`async audit(message, category = 'PLAYER')`**

Shorthand for logging an audit message.

**`async info(message, category = 'PLAYER')`**

Shorthand for logging an info message.

**`async debug(message, category = 'PLAYER')`**

Shorthand for logging a debug message.

**`async getLogsForSubmission(limit = 100)`**

Get unsubmitted logs ready for submission to CMS.

- `limit` (number): Maximum number of logs to return (default: 100)
- Returns: Array of log objects

**`async clearSubmittedLogs(logs)`**

Delete logs that were successfully submitted to CMS.

- `logs` (Array): Array of log objects to delete

**`async getAllLogs()`**

Get all logs from database (for debugging).

- Returns: Array of all log objects

**`async clearAllLogs()`**

Clear all logs from database (for testing).

#### Log Object Structure

```javascript
{
  id: 123,                 // Auto-generated ID
  level: 'error',          // 'error', 'audit', 'info', or 'debug'
  message: 'Error text',   // Log message
  category: 'PLAYER',      // Log category
  timestamp: Date,         // When log was created
  submitted: 0             // 0 = not submitted, 1 = submitted
}
```

#### Common Categories

- `PLAYER` - Player lifecycle and general operations
- `RENDERER` - Layout rendering and widget display
- `CACHE` - File caching and downloads
- `XMDS` - CMS communication
- `AUTH` - Authentication and registration
- `SCHEDULE` - Schedule management

### formatLogs - XML Formatting

Format logs array as XML for XMDS SubmitLog API.

```javascript
import { formatLogs } from '@xiboplayer/stats';

const logs = await reporter.getLogsForSubmission(100);
const xml = formatLogs(logs);

console.log(xml);
// <logs>
//   <log date="2026-02-10 12:00:00" category="PLAYER" type="error"
//        message="Failed to load layout 123" />
//   <log date="2026-02-10 12:01:00" category="AUTH" type="audit"
//        message="User logged in" />
// </logs>
```

## Storage

Both StatsCollector and LogReporter use IndexedDB for persistent storage:

- **Database Names**: `xibo-player-stats` and `xibo-player-logs`
- **Indexes**: Both use an index on the `submitted` field for fast queries
- **Quota Management**: Automatically cleans old submitted entries when quota is exceeded
- **Offline Support**: Data persists across browser sessions and restarts

### Storage Limits

- **Chrome**: ~60% of available disk space
- **Firefox**: ~10% of available disk space
- **Safari**: ~1GB

When storage quota is exceeded, the oldest 100 submitted entries are automatically deleted.

## Integration with PWA Platform

The stats package is integrated into the PWA platform (`platforms/pwa/src/main.ts`):

```typescript
// Initialize stats collector
this.statsCollector = new StatsCollector();
await this.statsCollector.init();

// Track layout events
this.renderer.on('layoutStart', (layoutId) => {
  this.statsCollector.startLayout(layoutId, this.currentScheduleId);
});

this.renderer.on('layoutEnd', (layoutId) => {
  this.statsCollector.endLayout(layoutId, this.currentScheduleId);
});

// Track widget events
this.renderer.on('widgetStart', ({ widgetId, layoutId, mediaId }) => {
  if (mediaId) {
    this.statsCollector.startWidget(mediaId, layoutId, this.currentScheduleId);
  }
});

this.renderer.on('widgetEnd', ({ widgetId, layoutId, mediaId }) => {
  if (mediaId) {
    this.statsCollector.endWidget(mediaId, layoutId, this.currentScheduleId);
  }
});

// Submit stats periodically (every 10 minutes)
setInterval(async () => {
  const stats = await this.statsCollector.getStatsForSubmission(50);
  if (stats.length > 0) {
    const xml = formatStats(stats);
    const success = await this.xmds.submitStats(xml);
    if (success) {
      await this.statsCollector.clearSubmittedStats(stats);
    }
  }
}, 600000);
```

## Testing

The package includes comprehensive tests using Vitest and fake-indexeddb:

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Coverage

- **StatsCollector**: 32 tests covering initialization, layout tracking, widget tracking, submission flow, edge cases, and database operations
- **LogReporter**: 35 tests covering initialization, log creation, submission flow, edge cases, and database operations
- **Total**: 67 tests with 100% pass rate

## Compatibility

- **Node.js**: 18+ (for ESM support)
- **Browsers**: Chrome 58+, Firefox 52+, Safari 12+, Edge 79+
- **IndexedDB**: Required for persistent storage

## License

AGPL-3.0-or-later

## Author

Pau Aliagas <linuxnow@gmail.com>

## Repository

https://github.com/xibo/xibo-players/tree/main/packages/stats
