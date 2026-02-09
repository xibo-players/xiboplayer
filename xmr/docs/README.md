# @xiboplayer/xmr Documentation

**XMR (Xibo Message Relay) WebSocket client wrapper.**

## Overview

WebSocket client for real-time CMS commands:

- Instant content updates
- Remote control
- Emergency messaging
- Connection management

## Installation

```bash
npm install @xiboplayer/xmr
```

## Usage

```javascript
import { XMRClient } from '@xiboplayer/xmr';

const xmr = new XMRClient({
  xmrUrl: 'wss://xmr.example.com',
  displayId: 123,
  token: 'secret'
});

xmr.on('message', (command) => {
  console.log('Received command:', command);
});

await xmr.connect();
```

## Commands

- `CollectNow` - Force immediate sync
- `ChangeLayout` - Switch layout
- `Reboot` - Restart player
- `Screenshot` - Capture display

## Dependencies

- `@xiboplayer/utils` - EventEmitter

## Related Packages

- [@xiboplayer/core](../../core/docs/) - Player core

---

**Package Version**: 1.0.0
