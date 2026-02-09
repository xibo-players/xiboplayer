# @xiboplayer/schedule Documentation

**Campaign scheduling, dayparting, and priority logic.**

## Overview

The `@xiboplayer/schedule` package provides:

- **Campaign scheduler** - Multi-campaign priority handling
- **Dayparting** - Time-based scheduling
- **Geo-scheduling** - Location-based campaigns
- **Interrupt campaigns** - High-priority content
- **Default fallback** - Graceful degradation

## Installation

```bash
npm install @xiboplayer/schedule
```

## Usage

```javascript
import { Scheduler } from '@xiboplayer/schedule';

const scheduler = new Scheduler({
  campaigns: campaignData,
  timezone: 'America/New_York'
});

// Get current layout
const layout = scheduler.getCurrentLayout();

// Check next scheduled event
const nextEvent = scheduler.getNextEvent();
```

## Features

### Campaign Priority

Campaigns ordered by priority (1 = highest):
1. Interrupt campaigns (override all)
2. Normal campaigns (scheduled)
3. Default layout (fallback)

### Dayparting

Time-based scheduling:
```javascript
{
  dayOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
  startTime: '08:00',
  endTime: '18:00'
}
```

### Geo-Scheduling

Location-based content:
```javascript
{
  geofence: {
    latitude: 40.7128,
    longitude: -74.0060,
    radius: 1000 // meters
  }
}
```

## API Reference

### Scheduler

```javascript
class Scheduler {
  constructor(options)
  getCurrentLayout()
  getNextEvent()
  setLocation(lat, lon)
  on(event, callback)
}
```

### Events

- `schedule:change` - Active schedule changed
- `campaign:start` - Campaign started
- `campaign:end` - Campaign ended

## Dependencies

- `@xiboplayer/utils` - Logger, EventEmitter

## Related Packages

- [@xiboplayer/core](../../core/docs/) - Player orchestration

---

**Package Version**: 1.0.0
**Last Updated**: 2026-02-10
