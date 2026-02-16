# @xiboplayer/settings

CMS display settings management and application for Xibo players.

## Features

- Parse all settings from RegisterDisplay CMS response
- Validate and normalize setting values
- Dynamic collection interval updates
- Download window enforcement (same-day and overnight windows)
- Screenshot interval tracking
- Event emission on setting changes
- Comprehensive error handling

## Installation

```bash
npm install @xiboplayer/settings
```

## Usage

### Basic Usage

```javascript
import { DisplaySettings } from '@xiboplayer/settings';

const displaySettings = new DisplaySettings();

// Apply settings from RegisterDisplay response
const result = displaySettings.applySettings(cmsSettings);

console.log('Changed settings:', result.changed);
console.log('Collection interval:', result.settings.collectInterval);
```

### With PlayerCore

```javascript
import { PlayerCore } from '@xiboplayer/core';
import { DisplaySettings } from '@xiboplayer/settings';

const displaySettings = new DisplaySettings();

const core = new PlayerCore({
  config,
  xmds,
  cache,
  schedule,
  renderer,
  xmrWrapper,
  displaySettings // Inject DisplaySettings
});

// Settings are automatically applied after RegisterDisplay
await core.collect();
```

### Event Handling

```javascript
// Listen for collection interval changes
displaySettings.on('interval-changed', (newInterval) => {
  console.log(`Collection interval changed to ${newInterval}s`);
});

// Listen for any settings changes
displaySettings.on('settings-applied', (settings, changes) => {
  console.log('Settings updated:', changes.join(', '));
});
```

## API Reference

### Constructor

```javascript
const displaySettings = new DisplaySettings();
```

### Methods

#### `applySettings(settings)`

Apply CMS settings from RegisterDisplay response.

**Parameters:**
- `settings` (Object): Raw settings from CMS

**Returns:**
- Object with `changed` (array) and `settings` (object)

**Example:**
```javascript
const result = displaySettings.applySettings({
  collectInterval: 600,
  displayName: 'Main Display',
  statsEnabled: '1',
  xmrWebSocketAddress: 'ws://xmr.example.com:9505'
});

console.log(result.changed); // ['collectInterval']
console.log(result.settings.collectInterval); // 600
```

#### `getCollectInterval()`

Get current collection interval in seconds.

**Returns:** Number (seconds)

#### `getDisplayName()`

Get display name from CMS.

**Returns:** String

#### `getDisplaySize()`

Get display dimensions.

**Returns:** Object `{ width: number, height: number }`

#### `isStatsEnabled()`

Check if stats/proof of play is enabled.

**Returns:** Boolean

#### `getAllSettings()`

Get all current settings as an object.

**Returns:** Object

#### `getSetting(key, defaultValue)`

Get a specific setting by key.

**Parameters:**
- `key` (String): Setting key
- `defaultValue` (Any): Default if not set

**Returns:** Setting value or default

#### `isInDownloadWindow()`

Check if current time is within the download window.

**Returns:** Boolean

**Example:**
```javascript
// Configure download window 09:00-17:00
displaySettings.applySettings({
  downloadStartWindow: '09:00',
  downloadEndWindow: '17:00'
});

// Check if downloads are allowed now
if (displaySettings.isInDownloadWindow()) {
  await downloadFiles();
}
```

#### `getNextDownloadWindow()`

Get the next download window start time.

**Returns:** Date object or null

#### `shouldTakeScreenshot(lastScreenshot)`

Check if screenshot interval has elapsed.

**Parameters:**
- `lastScreenshot` (Date): Last screenshot timestamp

**Returns:** Boolean

## Supported Settings

### Collection
- `collectInterval` - Collection interval in seconds (60-86400, default: 300)

### Display Info
- `displayName` - Display name (default: 'Unknown Display')
- `sizeX` - Display width in pixels (default: 1920)
- `sizeY` - Display height in pixels (default: 1080)

### Stats/Logging
- `statsEnabled` - Enable proof of play ('1' or '0')
- `aggregationLevel` - Stats aggregation ('Individual' or 'Aggregate')
- `logLevel` - Log level ('error', 'audit', 'info', 'debug')

### XMR
- `xmrNetworkAddress` - XMR TCP address (e.g., 'tcp://xmr.example.com:9505')
- `xmrWebSocketAddress` - XMR WebSocket address (e.g., 'ws://xmr.example.com:9505')
- `xmrCmsKey` - XMR encryption key

### Features
- `preventSleep` - Prevent display sleep (boolean, default: true)
- `embeddedServerPort` - Embedded server port (default: 9696)
- `screenshotInterval` - Screenshot interval in seconds (default: 120)

### Download Windows
- `downloadStartWindow` - Download start time ('HH:MM')
- `downloadEndWindow` - Download end time ('HH:MM')

### Other
- `licenceCode` - Commercial license code
- `isSspEnabled` - Enable SSP ad space (boolean)

## Setting Name Formats

Supports both lowercase and CamelCase (uppercase first letter):

```javascript
// Both formats work
displaySettings.applySettings({
  collectInterval: 600,   // lowercase
  CollectInterval: 600    // CamelCase
});

displaySettings.applySettings({
  displayName: 'Test',    // lowercase
  DisplayName: 'Test'     // CamelCase
});
```

## Download Windows

### Same-Day Window

```javascript
displaySettings.applySettings({
  downloadStartWindow: '09:00',
  downloadEndWindow: '17:00'
});

// Downloads allowed 09:00-17:00
```

### Overnight Window

```javascript
displaySettings.applySettings({
  downloadStartWindow: '22:00',
  downloadEndWindow: '06:00'
});

// Downloads allowed 22:00-23:59 and 00:00-06:00
```

## Events

### `interval-changed`

Emitted when collection interval changes.

**Callback:** `(newInterval: number) => void`

### `settings-applied`

Emitted when settings are applied.

**Callback:** `(settings: Object, changes: Array<string>) => void`

## Testing

```bash
npm test
```

The test suite includes:
- 44 comprehensive test cases
- Constructor defaults
- Setting parsing and validation
- Collection interval enforcement (60s-24h)
- Boolean parsing ('1', '0', true, false)
- Download window logic (same-day and overnight)
- Screenshot interval tracking
- Edge cases and error handling

## Integration with Upstream

Based on upstream electron-player implementation:
- `/upstream_players/electron-player/src/main/config/config.ts`
- `/upstream_players/electron-player/src/main/xmds/response/registerDisplay.ts`

## License

AGPL-3.0-or-later
