# Schedule-Advanced Integration Guide

## Overview

The `@xiboplayer/schedule-advanced` package provides advanced scheduling features including interrupt layouts (shareOfVoice) and overlays. It integrates with the base `@xiboplayer/schedule` package to extend its functionality.

## Installation

```bash
npm install @xiboplayer/schedule-advanced
```

## Usage

### Basic Setup (without interrupts)

```javascript
import { ScheduleManager } from '@xiboplayer/schedule';

const scheduleManager = new ScheduleManager();
scheduleManager.setSchedule(scheduleData);

const layouts = scheduleManager.getCurrentLayouts();
```

### With Interrupt Support

```javascript
import { ScheduleManager } from '@xiboplayer/schedule';
import { InterruptScheduler } from '@xiboplayer/schedule-advanced';

// Create interrupt scheduler
const interruptScheduler = new InterruptScheduler();

// Pass to schedule manager
const scheduleManager = new ScheduleManager({
  interruptScheduler
});

scheduleManager.setSchedule(scheduleData);

// Now getCurrentLayouts() will process interrupts automatically
const layouts = scheduleManager.getCurrentLayouts();
```

## Interrupt Layouts (Share of Voice)

### What are Interrupts?

Interrupt layouts are layouts with a `shareOfVoice` property > 0. They must play for a specific percentage of each hour, interleaved with normal layouts.

**Example use cases:**
- Advertising: Display ads for 10% of each hour
- Emergency alerts: Show warnings for 25% of hour during emergencies
- Promotional content: Feature special offers for 15% of hour during sales

### How it Works

1. **Separation**: Layouts are separated into normal and interrupt arrays
2. **Calculation**: For each interrupt, calculate required plays based on shareOfVoice percentage
3. **Filling**: Fill remaining time with normal layouts
4. **Interleaving**: Distribute interrupts evenly throughout the hour

### Example Schedule Data

```javascript
const scheduleData = {
  layouts: [
    {
      id: 1,
      file: 10,
      duration: 60,
      shareOfVoice: 10, // 10% of hour = 360 seconds
      priority: 10,
      fromdt: '2026-01-01 00:00:00',
      todt: '2027-01-01 00:00:00'
    },
    {
      id: 2,
      file: 20,
      duration: 120,
      shareOfVoice: 0, // Normal layout
      priority: 10,
      fromdt: '2026-01-01 00:00:00',
      todt: '2027-01-01 00:00:00'
    }
  ]
};
```

**Result**: Layout 10 plays 6 times (360s), Layout 20 fills remaining 3240s (27 plays).

### ShareOfVoice Calculation

- `shareOfVoice` is a percentage (0-100)
- Required time = `(shareOfVoice / 100) * 3600` seconds
- Required plays = `required_time / layout_duration`

**Examples:**
- 10% shareOfVoice = 360 seconds per hour
- 50% shareOfVoice = 1800 seconds per hour
- 100% shareOfVoice = 3600 seconds per hour (entire hour)

### Multiple Interrupts

When multiple interrupts exist, they are all satisfied:

```javascript
const scheduleData = {
  layouts: [
    { id: 1, file: 10, duration: 30, shareOfVoice: 15 }, // 15% = 540s
    { id: 2, file: 20, duration: 30, shareOfVoice: 10 }, // 10% = 360s
    { id: 3, file: 30, duration: 60, shareOfVoice: 0 }   // Normal, fills remaining 2700s
  ]
};
```

**Result**:
- Layout 10: 18 plays (540s)
- Layout 20: 12 plays (360s)
- Layout 30: 45 plays (2700s)
- Total: 75 layouts, evenly interleaved

### Edge Cases

#### All Interrupts (>= 100% total shareOfVoice)

If interrupts consume the entire hour (total shareOfVoice >= 100%), no normal layouts play:

```javascript
const scheduleData = {
  layouts: [
    { id: 1, file: 10, duration: 60, shareOfVoice: 60 },
    { id: 2, file: 20, duration: 60, shareOfVoice: 60 }
  ]
};
// Result: Only interrupts play (no room for normal layouts)
```

#### No Normal Layouts

If only interrupts exist, they fill the entire hour:

```javascript
const scheduleData = {
  layouts: [
    { id: 1, file: 10, duration: 60, shareOfVoice: 25 }
  ]
};
// Result: Layout repeats to fill entire hour
```

## Overlay Layouts

Overlays are layouts that display **on top** of main layouts (not yet fully implemented).

```javascript
import { OverlayScheduler } from '@xiboplayer/schedule-advanced';

const overlayScheduler = new OverlayScheduler();
overlayScheduler.setOverlays(overlayData);

const activeOverlays = overlayScheduler.getCurrentOverlays();
```

**Note**: Overlay rendering is not yet implemented in the player. This provides the scheduling logic only.

## Testing

Run the comprehensive test suite:

```bash
cd packages/schedule-advanced
npm test
```

**Test coverage:**
- 33 tests for InterruptScheduler
- Tests cover all edge cases, multiple interrupts, interleaving, and real-world scenarios

## Debugging

Enable debug logging:

```javascript
// In browser console or Node.js
localStorage.setItem('xibo:log:level', 'debug');

// Or set programmatically
import { config } from '@xiboplayer/utils';
config.set('logLevel', 'debug');
```

**Debug output example:**
```
[schedule-advanced:interrupts] Processing 2 interrupt layouts with 3 normal layouts
[schedule-advanced:interrupts] DEBUG: Resolved 15 interrupt plays (900s total)
[schedule-advanced:interrupts] DEBUG: Resolved 45 normal plays (2700s target)
[schedule-advanced:interrupts] DEBUG: Interleaving: pickCount=45, normalPick=1, interruptPick=3
[schedule-advanced:interrupts] DEBUG: Interleaved 60 layouts, total duration: 3600s
[schedule-advanced:interrupts] Final loop: 60 layouts (45 normal + 15 interrupts)
```

## API Reference

### InterruptScheduler

#### Methods

##### `isInterrupt(layout)`
Check if a layout is an interrupt (shareOfVoice > 0).

**Returns**: `boolean`

##### `processInterrupts(normalLayouts, interruptLayouts)`
Process interrupts and combine with normal layouts.

**Returns**: `Array` - Combined layout loop for the hour

##### `separateLayouts(layouts)`
Separate layouts into normal and interrupt arrays.

**Returns**: `{ normalLayouts, interruptLayouts }`

##### `resetCommittedDurations()`
Reset interrupt duration tracking (call every hour).

##### `getRequiredSeconds(layout)`
Calculate required seconds per hour for an interrupt.

**Returns**: `number`

### OverlayScheduler

#### Methods

##### `setOverlays(overlays)`
Update overlays from schedule data.

##### `getCurrentOverlays()`
Get currently active overlays.

**Returns**: `Array` - Active overlay objects sorted by priority

##### `isTimeActive(overlay, now)`
Check if overlay is within its time window.

**Returns**: `boolean`

## Performance

The interrupt algorithm is highly efficient:

- **Time complexity**: O(n) where n is number of layouts
- **Space complexity**: O(n) for result array
- **Typical processing time**: < 10ms for 100 layouts

## Compatibility

- **Node.js**: >= 18.0.0
- **Browsers**: All modern browsers (ES2020+)
- **Xibo CMS**: Compatible with Xibo CMS 3.x and 4.x schedules

## Upstream Reference

This implementation is based on the upstream Xibo Electron player:

**Source**: `upstream_players/electron-player/src/main/common/scheduleManager.ts` (lines 181-321)

**Differences**:
- Adapted to JavaScript (from TypeScript)
- Uses modular logger from @xiboplayer/utils
- Simplified API for easier integration
- More comprehensive test coverage

## License

AGPL-3.0-or-later

## Support

For issues or questions:
- GitHub Issues: https://github.com/xibo/xibo-players/issues
- Documentation: /packages/schedule-advanced/docs/
