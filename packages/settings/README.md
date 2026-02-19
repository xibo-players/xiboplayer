# @xiboplayer/settings

**CMS display settings management for Xibo Player.**

## Overview

Manages display configuration received from the CMS:

- **Resolution** — screen dimensions and orientation
- **Collection interval** — how often to poll the CMS
- **Download windows** — time-of-day restrictions for media downloads
- **Screenshot config** — screenshot dimensions, quality, and interval
- **Log level** — remote log verbosity control
- **Stats config** — proof of play aggregation mode and submission interval

## Installation

```bash
npm install @xiboplayer/settings
```

## Usage

```javascript
import { SettingsManager } from '@xiboplayer/settings';

const settings = new SettingsManager();
settings.apply(cmsSettings);

const interval = settings.get('collectInterval');
const screenshotEnabled = settings.get('screenshotRequested');
```

## Dependencies

- `@xiboplayer/utils` — logger, events

---

**Part of the [XiboPlayer SDK](https://github.com/linuxnow/xiboplayer)**
