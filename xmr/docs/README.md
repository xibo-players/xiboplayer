# @xiboplayer/xmr Documentation

**XMR (Xibo Message Relay) WebSocket client for real-time CMS commands.**

## Overview

The XMR package provides WebSocket integration with Xibo CMS, enabling real-time push commands from CMS to player without polling.

### Key Features

- **Real-time commands**: Instant content updates via WebSocket
- **Automatic reconnection**: Exponential backoff with max 10 attempts
- **Connection management**: Handles disconnects, errors, and network issues
- **7 CMS commands**: collectNow, screenShot, changeLayout, criteriaUpdate, and more
- **Event-driven**: Clean event-based API for command handling
- **Memory efficient**: Proper cleanup of timers and event listeners
- **Production ready**: Comprehensive test suite with 48 test cases

## Installation

```bash
npm install @xiboplayer/xmr
```

## Quick Start

```javascript
import { XmrWrapper } from '@xiboplayer/xmr';

// Create wrapper
const config = {
  cmsAddress: 'https://cms.example.com',
  hardwareKey: 'player-hw-key-123',
  xmrChannel: 'player-channel' // Optional, defaults to player-{hardwareKey}
};

const player = {
  collect: async () => { /* ... */ },
  captureScreenshot: async () => { /* ... */ },
  changeLayout: async (layoutId) => { /* ... */ },
  reportGeoLocation: async (data) => { /* ... */ },
  updateStatus: (status) => { /* ... */ }
};

const xmr = new XmrWrapper(config, player);

// Start connection
const connected = await xmr.start('wss://cms.example.com:9505', 'cms-key-123');

if (connected) {
  console.log('XMR connected');
}

// Check connection status
if (xmr.isConnected()) {
  console.log('Currently connected');
}

// Stop connection
await xmr.stop();
```

## Supported Commands

### Core Commands

| Command | Description | Player Method |
|---------|-------------|---------------|
| `collectNow` | Force immediate XMDS sync | `player.collect()` |
| `screenShot` | Capture screenshot | `player.captureScreenshot()` |
| `changeLayout` | Switch to specific layout | `player.changeLayout(layoutId)` |
| `licenceCheck` | Validate license (no-op for Linux) | None |
| `rekey` | Rotate RSA keys | None (future) |

### New in v0.0.6

| Command | Description | Player Method |
|---------|-------------|---------------|
| `criteriaUpdate` | Update display criteria | `player.collect()` |
| `currentGeoLocation` | Report geo location | `player.reportGeoLocation(data)` |

See [XMR_COMMANDS.md](./XMR_COMMANDS.md) for complete command reference.

## Connection Lifecycle

```
                    ┌──────────┐
                    │  start() │
                    └─────┬────┘
                          │
                          ▼
                    ┌──────────┐
              ┌─────│Connected │◄─────┐
              │     └─────┬────┘      │
              │           │           │
    Network   │           │Commands   │Auto
    Error     │           │Flowing    │Reconnect
              │           │           │
              ▼           ▼           │
        ┌──────────┐            ┌──────────┐
        │Disconnect│────────────│Reconnect │
        └─────┬────┘  Backoff   └──────────┘
              │
              │stop()
              ▼
        ┌──────────┐
        │ Stopped  │
        └──────────┘
```

### Reconnection Logic

- **Exponential backoff**: 5s, 10s, 15s, 20s, 25s, 30s, 35s, 40s, 45s, 50s
- **Max attempts**: 10 (then waits for next collection cycle)
- **Intentional shutdown**: No reconnect when `stop()` is called
- **Connection events**: `connected`, `disconnected`, `error`

## API Reference

### XmrWrapper

#### Constructor

```javascript
new XmrWrapper(config, player)
```

**Parameters**:
- `config` (Object): Player configuration
  - `hardwareKey` (string): Player hardware key
  - `xmrChannel` (string, optional): Custom channel ID
- `player` (Object): Player instance with command handlers

#### Methods

##### start(xmrUrl, cmsKey)

Start XMR connection.

```javascript
await xmr.start('wss://cms.example.com:9505', 'cms-key-123');
```

**Returns**: `Promise<boolean>` - True if connected, false if failed

##### stop()

Stop XMR connection and cancel reconnection.

```javascript
await xmr.stop();
```

##### isConnected()

Check connection status.

```javascript
const connected = xmr.isConnected();
```

**Returns**: `boolean`

##### send(action, data)

Send message to CMS (for future features).

```javascript
await xmr.send('customAction', { key: 'value' });
```

**Returns**: `Promise<boolean>` - True if sent successfully

### Player Interface

Your player object should implement these methods:

```javascript
{
  // Required
  collect: async () => Promise<void>,
  captureScreenshot: async () => Promise<void>,
  changeLayout: async (layoutId) => Promise<void>,

  // Optional
  reportGeoLocation: async (data) => Promise<void>,
  updateStatus: (status) => void
}
```

## Testing

### Run Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test Coverage

- ✅ 48 test cases
- ✅ Constructor and initialization
- ✅ Connection lifecycle (start, stop, reconnect)
- ✅ All 7 CMS commands
- ✅ Error handling and edge cases
- ✅ Memory management and cleanup

See [XMR_TESTING.md](./XMR_TESTING.md) for comprehensive testing guide.

## Configuration

### From registerDisplay

XMR settings are typically received from CMS `registerDisplay` response:

```json
{
  "settings": {
    "xmrWebSocketAddress": "wss://cms.example.com:9505",
    "xmrCmsKey": "abcdef123456",
    "xmrChannel": "player-hw-key-123"
  }
}
```

Use these values with `start()`:

```javascript
const { xmrWebSocketAddress, xmrCmsKey } = settings;
await xmr.start(xmrWebSocketAddress, xmrCmsKey);
```

### Custom Channel

Override default channel (player-{hardwareKey}):

```javascript
const config = {
  hardwareKey: 'hw-123',
  xmrChannel: 'custom-channel-name' // Use this instead
};
```

## Error Handling

All command handlers include error handling:

```javascript
this.xmr.on('collectNow', async () => {
  console.log('[XMR] Received collectNow command');
  try {
    await this.player.collect();
    console.log('[XMR] collectNow completed successfully');
  } catch (error) {
    console.error('[XMR] collectNow failed:', error);
  }
});
```

Errors don't:
- ❌ Crash the player
- ❌ Disconnect XMR
- ❌ Prevent other commands

They do:
- ✅ Log to console
- ✅ Preserve connection state
- ✅ Continue processing other commands

## Troubleshooting

### Connection Issues

**Problem**: XMR won't connect

**Solution**:
1. Verify XMR enabled in CMS settings
2. Check firewall allows port 9505
3. Verify `xmrWebSocketAddress` from registerDisplay
4. Check browser console for errors

### Commands Not Executing

**Problem**: collectNow sent but nothing happens

**Solution**:
1. Check `xmr.isConnected()` returns true
2. Verify player methods exist (`player.collect`, etc.)
3. Check console for command reception logs
4. Look for errors in command handler

### Reconnection Loops

**Problem**: Keeps reconnecting forever

**Solution**:
1. Verify XMR server is running
2. Check cmsKey is correct
3. Monitor `reconnectAttempts` counter
4. Manually stop: `await xmr.stop()`

See [XMR_TESTING.md](./XMR_TESTING.md#troubleshooting) for more.

## Dependencies

- `@xibosignage/xibo-communication-framework@^0.0.6` - Official XMR library
- `@xiboplayer/utils` - Logging and utilities

## Version History

### v0.9.0 (Current)
- ✅ Upgraded to @xibosignage/xibo-communication-framework@0.0.6
- ✅ Added `criteriaUpdate` command
- ✅ Added `currentGeoLocation` command
- ✅ Intentional shutdown flag (no reconnect on stop)
- ✅ Comprehensive test suite (48 tests)
- ✅ Complete documentation

### Previous Versions
- Basic XMR integration
- Core commands (collectNow, screenShot, changeLayout)
- Automatic reconnection

## Contributing

When adding new XMR commands:

1. Add event handler in `setupEventHandlers()`
2. Update [XMR_COMMANDS.md](./XMR_COMMANDS.md)
3. Add tests in `xmr-wrapper.test.js`
4. Implement player method if needed

See [XMR_TESTING.md](./XMR_TESTING.md#adding-new-commands) for details.

## Related Packages

- [@xiboplayer/core](../../core/docs/) - Player core orchestration
- [@xiboplayer/xmds](../../xmds/docs/) - XMDS SOAP client
- [@xiboplayer/schedule](../../schedule/docs/) - Schedule engine

## Support

- **GitHub Issues**: https://github.com/xibo/xibo-players/issues
- **Documentation**: [XMR_COMMANDS.md](./XMR_COMMANDS.md), [XMR_TESTING.md](./XMR_TESTING.md)
- **Xibo Community**: https://community.xibo.org.uk

---

**Package Version**: 0.9.0 | **XMR Library**: 0.0.6

## License

AGPL-3.0-or-later
