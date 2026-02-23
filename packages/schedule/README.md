# @xiboplayer/schedule

**Campaign scheduling with dayparting, interrupts, overlays, and timeline prediction.**

## Overview

Complete scheduling solution for Xibo digital signage:

- **Campaign scheduling** — priority-based campaign rotation with configurable play counts
- **Dayparting** — weekly time slots with midnight-crossing support
- **Interrupts** — percentage-based share-of-voice scheduling with even interleaving across the hour
- **Overlays** — multiple simultaneous overlay layouts with independent scheduling and priority
- **Geo-fencing** — location-based schedule filtering with criteria evaluation
- **Timeline prediction** — deterministic future schedule simulation for proactive content preloading

## Installation

```bash
npm install @xiboplayer/schedule
```

## Usage

```javascript
import { Schedule } from '@xiboplayer/schedule';

const schedule = new Schedule();
schedule.update(scheduleXml);

const currentLayouts = schedule.getCurrentLayouts();
const timeline = schedule.getTimeline(now, now + 3600000); // next hour
```

## Dependencies

- `@xiboplayer/utils` — logger, events

---

[xiboplayer.org](https://xiboplayer.org) · **Part of the [XiboPlayer SDK](https://github.com/xibo-players/xiboplayer)**
