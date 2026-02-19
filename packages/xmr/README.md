# @xiboplayer/xmr

**XMR WebSocket client for real-time Xibo CMS commands.**

## Overview

Listens for push commands from the CMS over WebSocket with automatic reconnection:

- **collectNow** — trigger an immediate collection cycle
- **screenshot** — request a display screenshot
- **changeLayout** — switch to a specific layout
- **overlayLayout** — show an overlay layout
- **revertToSchedule** — return to the scheduled playlist
- **purgeAll** — clear all cached content
- **dataUpdate** — notify of updated widget data
- **triggerWebhook** — fire a webhook action
- **commandAction** — execute a shell command
- **criteriaUpdate** — update geo/criteria filters

## Installation

```bash
npm install @xiboplayer/xmr
```

## Usage

```javascript
import { XmrClient } from '@xiboplayer/xmr';

const xmr = new XmrClient({
  wsUrl: 'wss://your-cms.example.com/xmr',
  channel: 'display-channel-key',
  rsaKey: 'display-rsa-key',
});

xmr.on('collectNow', () => player.collect());
xmr.on('screenshot', () => captureScreenshot());
xmr.connect();
```

## Dependencies

- `@xiboplayer/utils` — logger, events

---

**Part of the [XiboPlayer SDK](https://github.com/linuxnow/xiboplayer)**
