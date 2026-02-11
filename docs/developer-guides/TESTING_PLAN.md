# Comprehensive Test Suite for Xibo Players

## Overview

This document outlines the comprehensive test suite for all 12 packages in the Xibo Players monorepo. The goal is to achieve >90% code coverage with unit tests, integration tests, and contract tests.

## Test Strategy

### Test Levels

1. **Unit Tests** - Test individual modules in isolation with mocked dependencies
2. **Integration Tests** - Test module interactions and data flow
3. **Contract Tests** - Test API contracts with actual CMS responses
4. **E2E Tests** - Test complete player lifecycle scenarios

### Test Framework

- **Framework**: Vitest (fast, modern, ESM-native)
- **Mocking**: vi.fn(), vi.mock()
- **Coverage**: c8 (built into Vitest)
- **Browser**: jsdom for DOM testing

## Package Test Coverage

### 1. @xiboplayer/utils

**Files to Test**:
- `config.js` - Configuration management with localStorage
- `logger.js` - Multi-level logging
- `event-emitter.js` - Event system

**Test Files**:
- ✅ `config.test.js` (Created)
- ✅ `logger.test.js` (Created)
- ✅ `event-emitter.test.js` (Exists)

**Coverage**:
- Config: Hardware key generation, persistence, getters/setters
- Logger: All log levels, filtering, formatting
- EventEmitter: on/off/once/emit, edge cases

### 2. @xiboplayer/xmds

**Files to Test**:
- `xmds.js` - SOAP protocol client

**Test Files**:
- ✅ `xmds.test.js` (Exists)

**Coverage**:
- SOAP envelope generation
- XML parsing and escaping
- RegisterDisplay, RequiredFiles, Schedule
- GetResource, NotifyStatus
- Error handling (SOAP faults, network errors)

### 3. @xiboplayer/xmr

**Files to Test**:
- `xmr-wrapper.js` - WebSocket command handler

**Test Files**:
- ✅ `xmr-wrapper.test.js` (Created)

**Coverage**:
- Connection lifecycle (connect, disconnect, reconnect)
- Command handlers (collectNow, screenShot, changeLayout, etc.)
- Exponential backoff
- Error handling

### 4. @xiboplayer/cache

**Files to Test**:
- `cache.js` - Cache API + IndexedDB manager
- `cache-proxy.js` - Service Worker proxy
- `download-manager.js` - Parallel chunk downloads

**Test Files**:
- ✅ `cache-proxy.test.js` (Exists)
- ✅ `download-manager.test.js` (Exists)
- ⏳ `cache.test.js` (TODO)

**Coverage**:
- File download with MD5 verification
- Large file chunking (50MB chunks, 4 concurrent)
- Cache validation (detect corrupted text/plain responses)
- IndexedDB persistence
- Widget HTML caching

### 5. @xiboplayer/schedule

**Files to Test**:
- `schedule.js` - Schedule manager with campaigns

**Test Files**:
- ✅ `schedule.test.js` (Exists)
- ✅ `schedule.dayparting.test.js` (Exists)

**Coverage**:
- Campaign prioritization
- Time window filtering
- Default layout fallback
- Layout order preservation
- Dayparting support

### 6. @xiboplayer/schedule-advanced

**Files to Test**:
- `index.js` - Advanced scheduling features

**Test Files**:
- ⏳ `index.test.js` (TODO)

**Coverage**:
- Advanced scheduling rules
- Criteria-based filtering
- Geo location support

### 7. @xiboplayer/renderer

**Files to Test**:
- `renderer-lite.js` - Lightweight XLF renderer
- `layout.js` - Layout parsing

**Test Files**:
- ✅ `renderer-lite.test.js` (Exists)
- ⏳ `layout.test.js` (TODO)

**Coverage**:
- Element reuse (Arexibo pattern)
- Video restart on replay
- Dynamic duration detection
- Blob URL lifecycle
- Widget HTML rendering
- Media pre-fetching

### 8. @xiboplayer/stats

**Files to Test**:
- `index.js` - Analytics and stats reporting

**Test Files**:
- ⏳ `index.test.js` (TODO)

**Coverage**:
- Playback stats collection
- CMS reporting
- Proof-of-play

### 9. @xiboplayer/display-settings

**Files to Test**:
- `index.js` - Display configuration

**Test Files**:
- ⏳ `index.test.js` (TODO)

**Coverage**:
- Settings parsing
- Display profile management

### 10. @xiboplayer/core

**Files to Test**:
- `player-core.js` - Main orchestration
- `main.js` - Entry point

**Test Files**:
- ✅ `player-core.test.js` (Exists - 700+ lines!)
- ⏳ `main.test.js` (TODO)

**Coverage**:
- Collection cycle orchestration
- Layout transitions
- XMR integration
- Event emission
- Error handling

### 11. @xiboplayer/sw

**Files to Test**:
- `worker.js` - Service Worker

**Test Files**:
- ⏳ `worker.test.js` (TODO)

**Coverage**:
- HTTP request interception
- Cache-first strategy
- Background download management
- HTTP 202 handling

### 12. @xiboplayer/player

**Files to Test**:
- `index.js` - Meta package

**Test Files**:
- ⏳ `index.test.js` (TODO)

**Coverage**:
- Package integration
- Exports verification

## Integration Tests

### Test Scenarios

1. **Full Collection Cycle**
   - Register → RequiredFiles → Schedule → Download → Render
   - Verify event sequence
   - Check state transitions

2. **Layout Transitions**
   - Load layout A → Transition to B → Return to A
   - Verify element cleanup
   - Check memory stability

3. **Offline Mode**
   - Start with cache → Go offline → Continue playing
   - Verify graceful degradation
   - Test reconnection

4. **XMR Commands**
   - Send collectNow → Verify collection
   - Send changeLayout → Verify layout switch
   - Send screenShot → Verify capture

5. **Large File Downloads**
   - Download 1GB video in background
   - Verify chunking (50MB chunks)
   - Test parallel downloads (4 concurrent)
   - Verify MD5 validation

## Contract Tests

### XMDS Protocol Tests

Test against actual Xibo CMS responses:

1. **RegisterDisplay**
   ```xml
   <display code="READY" message="...">
     <collectInterval>300</collectInterval>
     <xmrWebSocketAddress>wss://...</xmrWebSocketAddress>
   </display>
   ```

2. **RequiredFiles**
   ```xml
   <files>
     <file type="media" id="1" size="1024" md5="abc123" ... />
     <file type="layout" id="100" ... />
   </files>
   ```

3. **Schedule**
   ```xml
   <schedule>
     <default file="999" />
     <layout file="100" priority="10" ... />
     <campaign id="1" priority="10">
       <layout file="200" />
     </campaign>
   </schedule>
   ```

4. **GetResource** (Widget HTML)
   - Verify HTML injection
   - Test base tag injection
   - Validate iframe loading

### XMR Protocol Tests

Test against actual XMR WebSocket messages:

1. **collectNow** command
2. **changeLayout** command (with layoutId)
3. **screenShot** command
4. **criteriaUpdate** command

## E2E Test Scenarios

### Scenario 1: First-Time Player Setup

1. Clear localStorage and cache
2. Configure CMS address, key, display name
3. Register with CMS
4. Download required files
5. Render first layout
6. Verify XMR connection

**Expected**: Player fully operational in <10 seconds

### Scenario 2: Layout Cycle with Campaigns

1. Start with campaign (3 layouts)
2. Cycle through all 3 layouts
3. Verify layout order preserved
4. Check memory stability (no leaks)

**Expected**: Smooth transitions, stable memory

### Scenario 3: Large Video Playback

1. Download 1GB video file
2. Render layout with video widget
3. Play video for 60 seconds
4. Verify smooth playback (no buffering)

**Expected**: Background download completes, video plays smoothly

### Scenario 4: XMR-Triggered Layout Change

1. Playing layout A
2. CMS sends changeLayout(B) via XMR
3. Verify immediate switch to layout B
4. Verify cleanup of layout A

**Expected**: Instant layout change (<1 second)

### Scenario 5: Offline Resilience

1. Player running with cached content
2. Disconnect network
3. Continue playing layouts
4. Reconnect network
5. Resume XMR and XMDS

**Expected**: Continuous operation during outage, automatic reconnection

## Test Utilities

### Mock Factories

Create reusable mocks for:

1. **mockCmsResponses.js** - XMDS responses
2. **mockXlfLayouts.js** - XLF layout files
3. **mockScheduleData.js** - Schedule data
4. **mockMediaFiles.js** - Media files (blob generators)
5. **mockXmrMessages.js** - XMR WebSocket messages

### Test Helpers

1. **waitFor(condition, timeout)** - Async wait utility
2. **createMockPlayer()** - Player mock with all methods
3. **createMockConfig()** - Config mock with defaults
4. **createMockCache()** - Cache mock with storage
5. **createMockXmds()** - XMDS mock with responses

## Running Tests

### Commands

```bash
# Run all tests
npm test

# Run tests for specific package
npm test -w packages/core

# Run tests in watch mode
npm test -- --watch

# Generate coverage report
npm test -- --coverage

# Run integration tests only
npm test -- --grep "Integration"

# Run E2E tests only
npm test -- --grep "E2E"
```

### Coverage Thresholds

```json
{
  "coverage": {
    "branches": 90,
    "functions": 90,
    "lines": 90,
    "statements": 90
  }
}
```

### Continuous Integration

GitHub Actions workflow:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v3
```

## Test Gaps (TODO)

### High Priority

1. ⏳ `cache.test.js` - Cache manager unit tests
2. ⏳ `layout.test.js` - Layout parsing tests
3. ⏳ `worker.test.js` - Service Worker tests

### Medium Priority

4. ⏳ `schedule-advanced/index.test.js` - Advanced scheduling
5. ⏳ `stats/index.test.js` - Stats reporting
6. ⏳ `display-settings/index.test.js` - Display settings

### Low Priority

7. ⏳ Integration test suite
8. ⏳ E2E test suite
9. ⏳ Contract test suite

## Success Criteria

- ✅ All unit tests passing
- ✅ >90% code coverage
- ✅ Integration tests for critical paths
- ✅ Contract tests verify CMS compatibility
- ✅ E2E tests validate real-world scenarios
- ✅ CI/CD pipeline running tests automatically
- ✅ Test documentation complete

## Timeline

- **Day 1-2**: Unit tests for all packages (✅ 70% complete)
- **Day 3**: Integration tests for core workflows
- **Day 4**: Contract tests with CMS
- **Day 5**: E2E test scenarios
- **Day 6**: Documentation and CI/CD setup

## Current Status

### Completed (✅)

- `utils/config.test.js` - 300+ lines, comprehensive
- `utils/logger.test.js` - 250+ lines, all levels tested
- `utils/event-emitter.test.js` - 430+ lines, edge cases
- `xmds/xmds.test.js` - Exists, needs expansion
- `xmr/xmr-wrapper.test.js` - 400+ lines, WebSocket tests
- `cache/cache-proxy.test.js` - Exists
- `cache/download-manager.test.js` - Exists
- `schedule/schedule.test.js` - Campaign tests
- `schedule/schedule.dayparting.test.js` - Dayparting tests
- `renderer/renderer-lite.test.js` - 25 tests, comprehensive
- `core/player-core.test.js` - 700+ lines, exhaustive!

**Total**: ~2500+ lines of tests across 11 test files

### In Progress (⏳)

- `cache/cache.test.js` - High priority
- `renderer/layout.test.js` - Medium priority
- `sw/worker.test.js` - Medium priority

### Not Started (❌)

- `schedule-advanced/index.test.js`
- `stats/index.test.js`
- `display-settings/index.test.js`
- `player/index.test.js`
- `core/main.test.js`

## Coverage Report (Estimated)

```
Package                   Coverage
---------------------------------
@xiboplayer/utils         95%  ✅
@xiboplayer/xmds          85%  ✅
@xiboplayer/xmr           90%  ✅
@xiboplayer/cache         75%  ⚠️
@xiboplayer/schedule      95%  ✅
@xiboplayer/renderer      90%  ✅
@xiboplayer/core          95%  ✅
@xiboplayer/sw            20%  ❌
@xiboplayer/stats         0%   ❌
@xiboplayer/display-set.  0%   ❌
@xiboplayer/schedule-adv. 0%   ❌
@xiboplayer/player        0%   ❌
---------------------------------
Overall                   ~60% ⚠️
```

**Target**: >90% overall coverage

## Next Steps

1. Create `cache.test.js` (high priority - core functionality)
2. Create `layout.test.js` (medium priority - XLF parsing)
3. Create remaining package tests (low priority - simple exports)
4. Build integration test suite
5. Setup CI/CD pipeline
6. Generate and publish coverage reports

## Conclusion

With ~2500+ lines of tests already written, we have strong coverage of core modules (utils, xmds, xmr, schedule, renderer, core). The remaining work focuses on:

- Cache module (critical for downloads)
- Service Worker (background operations)
- Smaller utility packages
- Integration/E2E tests

Estimated completion: 2-3 more days of work for 90%+ coverage.
