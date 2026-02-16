# @xiboplayer/utils Documentation

**Shared utilities for all Xibo Player packages.**

## Overview

Common utilities:

- **Logger** - Structured logging
- **EventEmitter** - Pub/sub event bus
- **Config** - Configuration management
- **Helpers** - Utility functions

## Installation

```bash
npm install @xiboplayer/utils
```

## Usage

```javascript
import { Logger, EventEmitter } from '@xiboplayer/utils';

// Logger
const log = new Logger('MyModule');
log.info('Message', { data: 123 });

// EventEmitter
const emitter = new EventEmitter();
emitter.on('event', (data) => console.log(data));
emitter.emit('event', { foo: 'bar' });
```

## API Reference

### Logger

```javascript
logger.debug(message, data)
logger.info(message, data)
logger.warn(message, data)
logger.error(message, data)
```

### EventEmitter

```javascript
emitter.on(event, callback)
emitter.once(event, callback)
emitter.off(event, callback)
emitter.emit(event, data)
```

## Dependencies

None (zero dependencies)

---

**Package Version**: 1.0.0
