# Feature Branch Squash Plan

## Current Status
- **Branch:** feature/standalone-service-worker
- **Commits ahead of main:** 97
- **Goal:** Squash into ~10-15 atomic commits

## Proposed Atomic Commits (This Session's Work)

### 1. fix: resolve PWA image loading failures
**Squash commits:**
- 264a13f fix: resolve PWA image loading failures caused by ReadableStream consumption
- 6e57f73 fix: update SW fetch event filter for new cache paths
- 1a72a82 fix: force Service Worker script to always fetch fresh
- 6805e6e fix: update widget HTML cache path in getWidgetHtml callback

**Message:**
```
fix: resolve PWA image loading failures caused by ReadableStream consumption

Fixed critical bug where images failed to load with NS_ERROR_INTERCEPTION_FAILED.

Root cause: Service Worker consumed cached Response body with blob(), then tried
to return cached.clone().body - but body was already consumed, creating invalid
ReadableStream that Firefox rejected.

Fix: Clone BEFORE consuming, use blob directly in Response.

Also fixed SW fetch event filter and cache paths to match new scope.

Result: Images load successfully on fresh boot and all reload scenarios.
```

### 2. feat: chunk-based storage and low-memory streaming
**Squash commits:**
- 46a0770 feat: implement chunk-based storage and low-memory streaming
- 8d4ee05 feat: implement download prioritization and adaptive concurrency
- d302fe6 fix: prevent duplicate downloads during collection cycles
- 18bb723 fix: enable progressive rendering for chunked files
- 584ea7d fix: remove duplicate variable declaration

**Message:**
```
feat: implement chunk-based storage and low-memory streaming for large videos

Comprehensive chunk-based storage system for Pi Zero to desktop support.

Features:
- Dynamic RAM detection and chunk sizing
- Files >100 MB stored as chunks (20× 50 MB for 1 GB)
- BlobCache with LRU eviction (prevents re-materialization)
- Adaptive concurrency (Pi Zero: 1, 4 GB: 4, 8+ GB: 6)
- Download prioritization by layout priority
- Progressive rendering (metadata-first)
- Duplicate download prevention

Memory impact:
- Before: 3-5 GB peak (crashed low-memory devices)
- After: 100 MB peak (50 MB × 2 chunks)
- Reduction: 95%+

Device support:
- Pi Zero (512 MB): 10 MB chunks, 1 concurrent
- 4 GB: 50 MB chunks, 4 concurrent
- 8+ GB: 100 MB chunks, 6 concurrent

Result: Multi-GB video playback on 512 MB RAM devices.
```

### 3. fix: layout ID/media ID confusion and file type disambiguation
**Squash commits:**
- 55ef07b fix: resolve layout ID/media ID confusion in file ready notifications
- 0f59abe feat: implement download prioritization and video loop optimization (video loop part)

**Message:**
```
fix: resolve layout ID/media ID confusion in file ready notifications

Fixed bug where layout files were treated as media files when checking dependencies.

Issue: Layout 78's XLF file (ID=78) confused with media/78, causing layouts
to wait for non-existent media files.

Fix: Added fileType parameter to notifyMediaReady(), explicit type checks.

Also fixed video looping to avoid black frames (reset to start on 'ended' event).

Result: Layout changes work correctly, proper dependency resolution.
```

### 4. refactor: routing helper pattern and utility functions
**Squash commits:**
- 1df1318 refactor: implement routing helper pattern
- 8c04073 refactor: apply utility helpers and Logger
- 93afd1a feat: complete Logger integration
- 9eaffd1, 969649a, 0414a79 fix: logging cleanup

**Message:**
```
refactor: implement routing helper pattern and utility functions

Clean architecture improvements for maintainability.

Routing Helper Pattern:
- routeFileRequest() determines storage format and handler
- Clean switch dispatch (no nested if/else)
- Testable routing logic

Utility Functions:
- formatBytes() - eliminates 8+ duplications
- parseRangeHeader() - clean Range parsing
- getChunksForRange() - chunk calculations
- createMediaHeaders() - standardized headers

Logger Integration:
- SWLogger for Service Worker context
- Component-specific loggers (SW, Cache, BlobCache)
- Configurable levels (DEBUG, INFO, WARNING, ERROR)
- 100% coverage in SW and core

Result: Clean, maintainable code with professional logging.
```

### 5. feat: download progress overlay
**Squash commits:**
- 09a20e6 feat: add download progress overlay component
- a83fb12 feat: integrate download progress overlay
- 7416497, b824e34, 3dd30a3 revert/fixes

**Message:**
```
feat: add download progress overlay for debugging

Visual download monitoring with hover activation.

Features:
- Hover-activated (green ⬇ trigger, bottom-right)
- Real-time progress bars
- Shows active downloads, chunks, percentages
- Auto-enabled on localhost
- Configurable via localStorage

Design:
- Clean, modern styling
- Non-intrusive (hidden when not hovering)
- Works with mouse (installation/debugging)
- Auto-disabled on touchscreen kiosks

Result: Professional debug tool for monitoring downloads.
```

### 6-10. Documentation commits (can be one commit)
**Squash commits:**
- f2298a6, 3562830, bd1e9ae, 1a06cbe, c7fac0a, 093a7cd (all docs)

**Message:**
```
docs: comprehensive PWA chunk streaming documentation

Added extensive documentation for chunk-based streaming implementation.

Documents:
- PWA_CHUNK_STREAMING_COMPLETE.md (technical details)
- QUICK_REFERENCE_CHUNK_STREAMING.md (TL;DR)
- SESSION_SUMMARY.md (session overview)
- MODULE_RESPONSIBILITIES.md (architecture)
- TEST_STATUS_AND_COVERAGE.md (test gaps)
- CONFIGURATION_PARAMETERS.md (config analysis)
- CHUNK_PLAYBACK_HEURISTICS.md (performance analysis)

Result: Production-ready codebase with comprehensive guides.
```

## Earlier Work (71 commits - from before this session)

These should also be grouped into atomic features:
- PWA-XLR integration
- RendererLite implementation
- Campaign support
- Dayparting support
- Transitions support
- Bug fixes

## Squash Strategy

**Option 1: Interactive Rebase (Recommended)**
```bash
git rebase -i main

# In editor, mark commits to squash:
pick 264a13f fix: image loading
squash 6e57f73 fix: SW filter
squash 1a72a82 fix: SW fetch
# ... etc

# Result: ~10-15 atomic commits
```

**Option 2: Squash Merge to Main**
```bash
git checkout main
git merge --squash feature/standalone-service-worker
# Manually create atomic commits from staged changes
```

**Option 3: Cherry-pick Atomic Features**
```bash
# Cherry-pick specific commit ranges for each feature
git cherry-pick -n <range>  # -n = no commit
# Group changes, commit atomically
```

**Recommended approach: Option 1 (Interactive Rebase)**
- Clean history
- Atomic commits
- Easy to review
- Maintains logical order

**Would you like me to create the interactive rebase script?**
