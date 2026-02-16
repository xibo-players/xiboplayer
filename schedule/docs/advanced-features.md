# Schedule-Advanced Package

Advanced scheduling features for Xibo Player including interrupt layouts (shareOfVoice) and overlays.

## Features

### Interrupt Layouts (Share of Voice) ✅

Fully implemented and tested. Layouts with `shareOfVoice > 0` play for a percentage of each hour.

**Use cases:**
- Advertising: Display ads for X% of each hour
- Emergency alerts: Show warnings during incidents
- Promotional content: Feature sales during campaigns
- Time-based content mixing: Combine regular + special content

**Example:**
```javascript
{
  id: 1,
  file: 100,
  duration: 30,
  shareOfVoice: 10, // 10% of hour = 360 seconds
  priority: 10
}
```

### Overlay Layouts 🚧

Partially implemented (scheduling only, rendering not yet complete).

**Use cases:**
- Emergency alerts on top of content
- Weather overlays
- Social media feeds
- Ticker tapes

## Installation

```bash
npm install @xiboplayer/schedule-advanced
```

## Quick Start

```javascript
import { ScheduleManager } from '@xiboplayer/schedule';
import { InterruptScheduler } from '@xiboplayer/schedule-advanced';

// Create interrupt scheduler
const interruptScheduler = new InterruptScheduler();

// Pass to schedule manager
const scheduleManager = new ScheduleManager({
  interruptScheduler
});

// Set schedule data
scheduleManager.setSchedule(scheduleData);

// Get layouts (automatically processes interrupts)
const layouts = scheduleManager.getCurrentLayouts();
```

## Documentation

- **[Integration Guide](./INTEGRATION.md)** - Complete integration examples
- **[API Reference](#api-reference)** - Detailed API documentation
- **[Algorithm Details](#algorithm)** - How shareOfVoice works
- **[Testing](#testing)** - Running and writing tests

## How ShareOfVoice Works

### Algorithm Overview

1. **Separation**: Separate interrupts (shareOfVoice > 0) from normal layouts
2. **Calculation**: For each interrupt, calculate required plays:
   - Required seconds = `(shareOfVoice / 100) * 3600`
   - Required plays = `required_seconds / layout_duration`
3. **Filling**: Fill remaining time with normal layouts
4. **Interleaving**: Distribute interrupts evenly throughout the hour

### Example

**Input:**
```javascript
[
  { file: 10, duration: 60, shareOfVoice: 10 },  // Interrupt
  { file: 20, duration: 60, shareOfVoice: 0 }    // Normal
]
```

**Calculation:**
- Interrupt requirement: 10% of 3600s = 360s
- Interrupt plays: 360s / 60s = 6 plays
- Remaining time: 3600s - 360s = 3240s
- Normal plays: 3240s / 60s = 54 plays

**Output (60 layouts):**
```
[20, 20, 20, 20, 20, 20, 20, 20, 10,  // 9 layouts
 20, 20, 20, 20, 20, 20, 20, 20, 10,  // +9
 20, 20, 20, 20, 20, 20, 20, 20, 10,  // +9
 ...                                   // etc
 20, 20, 20, 20, 20, 20, 20, 20, 10]  // Last 9
```

Interrupts are evenly distributed (every 9 layouts).

### Multiple Interrupts

When multiple interrupts exist, they all get their required time:

**Input:**
```javascript
[
  { file: 10, duration: 60, shareOfVoice: 25 },  // Interrupt 1
  { file: 20, duration: 60, shareOfVoice: 25 },  // Interrupt 2
  { file: 30, duration: 60, shareOfVoice: 0 }    // Normal
]
```

**Calculation:**
- Int1 requirement: 25% = 900s (15 plays)
- Int2 requirement: 25% = 900s (15 plays)
- Remaining: 1800s (30 normal plays)
- Total: 60 layouts

**Output:**
Interrupts and normal layouts interleaved evenly.

## API Reference

### InterruptScheduler

#### Constructor
```javascript
const scheduler = new InterruptScheduler();
```

#### Methods

##### `isInterrupt(layout)`
Check if layout has shareOfVoice > 0.

**Parameters:**
- `layout` (Object) - Layout object with shareOfVoice property

**Returns:** `boolean`

**Example:**
```javascript
const isInt = scheduler.isInterrupt({ shareOfVoice: 10 });
// true
```

##### `processInterrupts(normalLayouts, interruptLayouts)`
Process interrupts and combine with normal layouts for one hour.

**Parameters:**
- `normalLayouts` (Array) - Normal layouts
- `interruptLayouts` (Array) - Interrupt layouts with shareOfVoice

**Returns:** `Array` - Combined layout loop for the hour

**Example:**
```javascript
const normal = [{ file: 10, duration: 60 }];
const interrupts = [{ file: 20, duration: 60, shareOfVoice: 10 }];
const loop = scheduler.processInterrupts(normal, interrupts);
// Returns 60-layout array with 6 interrupts, 54 normal
```

##### `separateLayouts(layouts)`
Separate layouts into normal and interrupt arrays.

**Parameters:**
- `layouts` (Array) - Mixed layouts

**Returns:** `{ normalLayouts, interruptLayouts }`

**Example:**
```javascript
const { normalLayouts, interruptLayouts } = scheduler.separateLayouts(allLayouts);
```

##### `getRequiredSeconds(layout)`
Calculate required seconds per hour for an interrupt.

**Parameters:**
- `layout` (Object) - Layout with shareOfVoice

**Returns:** `number` - Required seconds

**Example:**
```javascript
const required = scheduler.getRequiredSeconds({ shareOfVoice: 25 });
// 900 (25% of 3600)
```

##### `resetCommittedDurations()`
Reset committed duration tracking. Call this every hour to reset counters.

**Example:**
```javascript
// Every hour
setInterval(() => {
  scheduler.resetCommittedDurations();
}, 3600000);
```

### OverlayScheduler

#### Constructor
```javascript
const overlayScheduler = new OverlayScheduler();
```

#### Methods

##### `setOverlays(overlays)`
Update overlays from schedule data.

**Parameters:**
- `overlays` (Array) - Overlay objects from XMDS

##### `getCurrentOverlays()`
Get currently active overlays.

**Returns:** `Array` - Active overlays sorted by priority

##### `isTimeActive(overlay, now)`
Check if overlay is within its time window.

**Parameters:**
- `overlay` (Object) - Overlay object
- `now` (Date) - Current time

**Returns:** `boolean`

## Testing

### Run Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test src/interrupts.test.js
npm test src/integration.test.js

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test Coverage

**Current coverage:**
- 47 total tests
- 33 interrupt scheduler tests
- 14 integration tests
- All edge cases covered

**Test categories:**
- Basic functionality (isInterrupt, getRequiredSeconds, etc.)
- ShareOfVoice calculation (10%, 50%, 100%)
- Multiple interrupts
- Interleaving algorithm
- Edge cases (no normal layouts, >100% total, etc.)
- Integration with ScheduleManager
- Priority handling
- Campaign support
- Real-world scenarios

### Writing Tests

Example test:

```javascript
import { InterruptScheduler } from './interrupts.js';

it('should handle 10% shareOfVoice', () => {
  const scheduler = new InterruptScheduler();
  const normal = [{ file: 10, duration: 60 }];
  const interrupts = [{ file: 20, duration: 60, shareOfVoice: 10 }];

  const result = scheduler.processInterrupts(normal, interrupts);

  const interruptCount = result.filter(l => l.file === 20).length;
  expect(interruptCount).toBe(6); // 360s / 60s
});
```

## Performance

### Benchmarks

- **Processing time**: < 10ms for 100 layouts
- **Memory usage**: O(n) where n is number of layouts
- **Time complexity**: O(n) for separation and interleaving

### Optimization Tips

1. **Reuse scheduler instance** - Create once, reuse multiple times
2. **Reset hourly** - Call `resetCommittedDurations()` every hour
3. **Batch updates** - Process all schedule changes at once

## Upstream Reference

Based on upstream Xibo Electron player implementation:

**File:** `electron-player/src/main/common/scheduleManager.ts`
**Lines:** 181-321
**Version:** Latest as of 2026-02-10

**Differences from upstream:**
- JavaScript (not TypeScript)
- Modular design (separate package)
- Enhanced logging via @xiboplayer/utils
- More comprehensive test coverage
- Cleaner API surface

## Debugging

Enable debug logging:

```javascript
// Browser console
localStorage.setItem('xibo:log:level', 'debug');

// Programmatically
import { config } from '@xiboplayer/utils';
config.set('logLevel', 'debug');
```

**Debug output:**
```
[schedule-advanced:interrupts] Processing 2 interrupt layouts with 3 normal layouts
[schedule-advanced:interrupts] DEBUG: Resolved 15 interrupt plays (900s total)
[schedule-advanced:interrupts] DEBUG: Resolved 45 normal plays (2700s target)
[schedule-advanced:interrupts] DEBUG: Interleaving: pickCount=45, normalPick=1, interruptPick=3
[schedule-advanced:interrupts] DEBUG: Interleaved 60 layouts, total duration: 3600s
[schedule-advanced:interrupts] Final loop: 60 layouts (45 normal + 15 interrupts)
```

## Troubleshooting

### Issue: Interrupts not playing

**Check:**
1. InterruptScheduler passed to ScheduleManager?
2. Layouts have shareOfVoice > 0?
3. Priority filtering removing interrupts?

**Debug:**
```javascript
const { normalLayouts, interruptLayouts } = scheduler.separateLayouts(allLayouts);
console.log('Interrupts:', interruptLayouts);
```

### Issue: Wrong number of plays

**Check:**
1. Layout duration vs shareOfVoice percentage
2. Rounding (algorithm may overshoot slightly)
3. Multiple interrupts summing > 100%

**Debug:**
```javascript
const required = scheduler.getRequiredSeconds(layout);
const plays = required / layout.duration;
console.log('Required plays:', plays);
```

### Issue: Performance problems

**Check:**
1. Too many layouts (>1000)?
2. Creating new scheduler instance every time?
3. Not resetting committed durations?

**Solution:**
```javascript
// Create once
const scheduler = new InterruptScheduler();

// Reset hourly
setInterval(() => scheduler.resetCommittedDurations(), 3600000);
```

## Contributing

See main repository [CONTRIBUTING.md](../../../CONTRIBUTING.md).

**Areas for contribution:**
- Overlay rendering implementation
- Criteria-based scheduling
- Geo-location awareness
- Additional test coverage
- Performance optimizations

## Support

- **Issues**: https://github.com/xibo/xibo-players/issues
- **Discussions**: https://github.com/xibo/xibo-players/discussions
- **Documentation**: https://xibo.org.uk/docs/

## Changelog

### 0.9.0 (2026-02-10)

- ✅ Initial release
- ✅ Full interrupt layout (shareOfVoice) implementation
- ✅ 47 comprehensive tests (all passing)
- ✅ Integration with @xiboplayer/schedule
- ✅ Based on upstream electron-player algorithm
- 🚧 Overlay layout scheduling (rendering not complete)

## License

AGPL-3.0-or-later
