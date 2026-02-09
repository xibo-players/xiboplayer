# @xiboplayer/xmds Documentation

**XMDS (XML-based Media Distribution Service) SOAP client.**

## Overview

SOAP client for Xibo CMS communication:

- Display registration
- Content synchronization
- File downloads
- Proof of play submission
- Log reporting

## Installation

```bash
npm install @xiboplayer/xmds
```

## Usage

```javascript
import { XMDSClient } from '@xiboplayer/xmds';

const client = new XMDSClient({
  cmsUrl: 'https://cms.example.com',
  serverKey: 'abc123',
  hardwareKey: 'def456'
});

// Register display
await client.registerDisplay();

// Get required files
const files = await client.requiredFiles();

// Download file
const blob = await client.getFile(fileId, fileType);
```

## SOAP Methods

- `RegisterDisplay` - Register/verify display
- `RequiredFiles` - Get content to download
- `GetFile` - Download media file
- `SubmitStats` - Send proof of play
- `SubmitLog` - Report errors

## Dependencies

- `@xiboplayer/utils` - Logger

## Related Packages

- [@xiboplayer/core](../../core/docs/) - Player core

---

**Package Version**: 1.0.0
