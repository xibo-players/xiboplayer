# PWA Player - Configuration Parameters

## Current Configuration Status

### ✅ Already Configurable from CMS

**1. Collection Interval** ✅
**Location:** `player-core.js:183`
**Code:**
```javascript
const collectIntervalSeconds = parseInt(settings.collectInterval || '300', 10);
```
**Source:** CMS Display Settings (collectInterval)
**Default:** 300 seconds (5 minutes)
**Status:** ✅ Already environment-aware via CMS

**How it works:**
- CMS admin sets `collectInterval` in display settings
- Player reads from `RegisterDisplay` response
- Falls back to 300s if not set
- **Already supports different values per environment!**

**To set different values:**
- Development display: Set collectInterval = 60 (1 minute)
- Production display: Set collectInterval = 300 (5 minutes)
- Configure in Xibo CMS, not code ✅

### ✅ Dynamic (Calculated Based on Device)

**2. Chunk Size, Cache Size, Concurrency**
**Location:** `sw.js` (calculateChunkConfig)
**Code:**
```javascript
function calculateChunkConfig() {
  const deviceMemoryGB = navigator.deviceMemory || estimateFromUserAgent();

  if (deviceMemoryGB <= 0.5) {
    return { chunkSize: 10 * MB, blobCacheSize: 25, concurrency: 1 };
  }
  // ... other tiers
}
```
**Source:** Runtime device detection
**Status:** ✅ Dynamic, adapts to device capabilities

**Not hardcoded** - automatically configured based on:
- RAM detection (navigator.deviceMemory)
- User agent parsing (Pi Zero, ARM detection)
- Optimal for each device type

### ⚠️ Hardcoded (Could Be Configurable)

**3. Service Worker Timeouts**
**Location:** `cache-proxy.js`
**Code:**
```javascript
await new Promise(resolve => setTimeout(resolve, 100)); // SW claim wait
await new Promise(resolve => setTimeout(resolve, 200)); // Fetch ready wait
setTimeout(() => reject(new Error('SW timeout')), 10000); // Max wait
```
**Current:** Hardcoded milliseconds
**Recommendation:** Extract to TIMEOUTS constants (already in sw-utils.js!)

**4. Minimum Valid File Size**
**Location:** `main.ts:413`
**Code:**
```javascript
if (contentType === 'text/plain' || blob.size < 100) {
  // Corrupted file
}
```
**Current:** 100 bytes hardcoded
**Recommendation:** Make configurable (MIN_VALID_FILE_SIZE = 100)

**5. Chunk Storage Threshold (Base Values)**
**Location:** `sw.js:66-67`
**Code:**
```javascript
const BASE_CHUNK_SIZE = 50 * 1024 * 1024; // 50MB
const BASE_CHUNK_STORAGE_THRESHOLD = 100 * 1024 * 1024; // 100 MB
```
**Current:** Base values hardcoded, then calculated
**Status:** ⚠️ Could expose as config override

**Recommendation:**
```javascript
// Allow override via query param or localStorage
const chunkConfig = calculateChunkConfig();
const userOverride = localStorage.getItem('xibo_chunk_config');
if (userOverride) {
  Object.assign(chunkConfig, JSON.parse(userOverride));
}
```

### ❌ Should NOT Be Configurable

**6. HTTP Status Codes**
```javascript
status: 200, 206, 404, 500, 502
```
**Reason:** HTTP standards, not policy

**7. Cache Names**
```javascript
const CACHE_NAME = 'xibo-media-v1';
const STATIC_CACHE = 'xibo-static-v1';
```
**Reason:** Version management, not configuration

**8. Video Element Properties**
```javascript
video.autoplay = true;
video.controls = true; // (but could be config for production vs debug)
```
**Reason:** Player behavior requirements

## Recommended Configuration Architecture

### Option 1: Environment Detection (Recommended)

```javascript
// In player-core.js or main.ts
function getEnvironmentConfig() {
  const hostname = window.location.hostname;
  const isDevelopment = hostname === 'localhost' || hostname === '127.0.0.1';

  return {
    collectInterval: isDevelopment ? 60 : 300, // 1 min dev, 5 min prod
    logLevel: isDevelopment ? 'DEBUG' : 'WARNING',
    videoControls: isDevelopment, // Show controls in dev only
    minValidFileSize: isDevelopment ? 0 : 100 // More lenient in dev
  };
}

// Usage in PlayerCore
const envConfig = getEnvironmentConfig();
const collectInterval = parseInt(settings.collectInterval || envConfig.collectInterval, 10);
```

### Option 2: Configuration File

```javascript
// config/defaults.js
export const DEFAULT_CONFIG = {
  development: {
    collectInterval: 60,
    logLevel: 'DEBUG',
    videoControls: true,
    enableDetailedLogs: true
  },
  production: {
    collectInterval: 300,
    logLevel: 'WARNING',
    videoControls: false,
    enableDetailedLogs: false
  }
};

// In player
import { DEFAULT_CONFIG } from './config/defaults.js';
const env = detectEnvironment();
const defaults = DEFAULT_CONFIG[env];
```

### Option 3: URL Parameters + localStorage

```javascript
// Allow override via URL
const urlParams = new URLSearchParams(window.location.search);
const collectInterval =
  urlParams.get('collectInterval') ||              // URL override
  localStorage.getItem('xibo_collect_interval') || // Saved preference
  (isDevelopment ? 60 : 300);                      // Environment default
```

## Summary of Hardcoded Parameters

| Parameter | Current | Should Be | Priority | Effort |
|-----------|---------|-----------|----------|---------|
| Collection interval | ✅ From CMS | ✅ Already good | N/A | Done |
| Chunk sizes | ✅ Dynamic (RAM-based) | ✅ Already good | N/A | Done |
| SW timeouts | ⚠️ Hardcoded | ⚠️ Could use TIMEOUTS const | Low | 15 min |
| Min file size | ⚠️ Hardcoded (100 bytes) | ⚠️ Could be config | Low | 10 min |
| Video controls | ⚠️ Hardcoded (true) | ⚠️ Env-dependent? | Low | 5 min |
| Log levels | ✅ Env-dependent | ✅ Already good | N/A | Done |
| Concurrency | ✅ Dynamic (RAM-based) | ✅ Already good | N/A | Done |

## Recommendation

**Collection interval is ALREADY configurable!**
- Comes from CMS Display Settings ✅
- Just set different values per display in Xibo CMS
- No code changes needed!

**Other parameters:**
- Most are already dynamic or environment-dependent ✅
- Remaining hardcoded values are low priority
- Can be extracted to constants for clarity

**No urgent configuration work needed** - architecture is already flexible! ✅
