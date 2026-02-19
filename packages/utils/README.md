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
import { createLogger, setLogLevel, getLogLevel, isDebug, applyCmsLogLevel, LOG_LEVELS } from '@xiboplayer/utils';

// Create a logger (follows global level by default)
const log = createLogger('MyModule');
log.info('Message', { data: 123 });

// Create a logger with fixed level (ignores global changes)
const debugLog = createLogger('Debug', 'DEBUG');

// EventEmitter
import { EventEmitter } from '@xiboplayer/utils';
const emitter = new EventEmitter();
emitter.on('event', (data) => console.log(data));
emitter.emit('event', { foo: 'bar' });
```

## API Reference

### Logger

#### Log Levels

| Level | Value | Use case |
|-------|-------|----------|
| `DEBUG` | 0 | Development — verbose output for debugging |
| `INFO` | 1 | Monitoring — routine operations |
| `WARNING` | 2 | Production default — only unexpected conditions |
| `ERROR` | 3 | Production — only failures |
| `NONE` | 4 | Silent |

#### Level Precedence (highest wins)

1. **URL param** — `?logLevel=DEBUG`
2. **localStorage** — `xibo_log_level` key
3. **CMS setting** — via `applyCmsLogLevel()` after RegisterDisplay
4. **Default** — `WARNING` (production-safe)

For development, pass `?logLevel=DEBUG` in the URL. Electron's `--dev` flag does this automatically.

#### Methods

```javascript
log.debug(message, ...args)   // Only when level ≤ DEBUG
log.info(message, ...args)    // Only when level ≤ INFO
log.warn(message, ...args)    // Only when level ≤ WARNING
log.error(message, ...args)   // Only when level ≤ ERROR

setLogLevel('DEBUG')          // Set globally + persist to localStorage
getLogLevel()                 // Returns current level name
isDebug()                     // Returns true if level is DEBUG
applyCmsLogLevel('debug')     // Apply CMS level (skipped if local override exists)
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
