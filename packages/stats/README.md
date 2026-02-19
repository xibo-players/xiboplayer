# @xiboplayer/stats

**Proof of play tracking, stats reporting, and CMS logging.**

## Overview

Collects and reports display analytics to the Xibo CMS:

- **Proof of play** — per-layout and per-widget duration tracking
- **Aggregation modes** — individual or aggregated stat submission (configurable from CMS)
- **Log reporting** — display logs batched and submitted to CMS
- **Fault alerts** — error deduplication and fault reporting

## Installation

```bash
npm install @xiboplayer/stats
```

## Usage

```javascript
import { StatsCollector } from '@xiboplayer/stats';

const stats = new StatsCollector({ transport });
stats.init();

// Stats are collected automatically from player events
// and submitted during each collection cycle
```

## Dependencies

- `@xiboplayer/utils` — logger, events

---

**Part of the [XiboPlayer SDK](https://github.com/linuxnow/xiboplayer)**
