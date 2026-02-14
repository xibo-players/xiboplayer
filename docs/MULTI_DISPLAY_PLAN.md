# Multi-Display Synchronization Plan

**Date:** 2026-02-14
**Status:** Phase 1-2 Complete, Phase 3-4 Planned
**Priority:** Low (rare use case, but architecturally important)

---

## 1. How Xibo Multi-Display Sync Works

### CMS Data Model

From CMS source (`lib/Entity/SyncGroup.php`, migration `20230509113820_content_sync_migration.php`):

**`syncgroup` table:**
- `syncGroupId` (PK)
- `name`
- `syncPublisherPort` (default 9590) — TCP port for inter-player ZeroMQ
- `syncSwitchDelay` (default 750ms) — delay before showing new content
- `syncVideoPauseDelay` (default 100ms) — delay before unpausing video
- `leadDisplayId` — FK to `display`, the leader/master

**`display` table** gains `syncGroupId` (nullable FK).

**`schedule_sync` table** (PK: eventId + displayId):
- Maps which layout each display shows for a given sync event

**`schedule` table** gains:
- `syncGroupId` (nullable FK)
- `syncEvent` (0 or 1)

### Schedule Event Type

In `Schedule.php`: `public static $SYNC_EVENT = 9;`

When `eventTypeId === 9`, the CMS:
1. Looks up `schedule_sync` for display-specific layout assignments
2. Sets `syncEvent="1"` in schedule XML
3. Returns per-display `layoutId` from `schedule_sync`

### RegisterDisplay Response

From `Soap5.php` lines 499-533, displays in a sync group receive:

```xml
<syncGroup>lead</syncGroup>                  <!-- "lead" or leader's LAN IP -->
<syncPublisherPort>9590</syncPublisherPort>
<syncSwitchDelay>750</syncSwitchDelay>
<syncVideoPauseDelay>100</syncVideoPauseDelay>
```

### Native Sync Protocol

- **Transport**: ZeroMQ PUB/SUB over TCP port 9590
- **Lead**: Runs ZeroMQ publisher on `tcp://*:9590`
- **Followers**: Subscribe to `tcp://<leader-lan-ip>:9590`
- **Flow**: Lead publishes timing commands; all players load content, wait `syncSwitchDelay`, then show simultaneously
- **Supported**: Only Android (R400+) and WebOS (R407+). NOT Windows, Linux, or Electron.

### Content Modes

- **Mirrored**: All displays show the same layout
- **Synchronized**: Different layouts per display, coordinated transitions

---

## 2. Current State of Our PWA Player

### What We Have
- Schedule parser does **NOT** parse `syncEvent` attribute
- XMR wrapper handles 13 commands, none sync-specific
- PlayerCore has no sync awareness
- REST client would receive sync settings but doesn't extract them

### Browser Limitations
- **No ZeroMQ**: Browsers cannot open raw TCP sockets
- **No TCP server**: Cannot bind to a port as a publisher
- **No LAN discovery**: Cannot discover other devices
- **No peer-to-peer TCP**: WebRTC is possible but complex

---

## 3. Architecture Options

### Option A: BroadcastChannel API (Same-Machine)

Multiple browser tabs on the same machine, each registered as a different display.

```
Tab A (Lead)  ──BroadcastChannel──>  Tab B (Follower)
                                     Tab C (Follower)
```

| Aspect | Details |
|--------|---------|
| Latency | <1ms (same process) |
| Infrastructure | None |
| Use case | Single PC driving multiple monitors |
| Complexity | Low |

### Option B: WebSocket Relay (Cross-Device)

Lightweight relay server acts as ZeroMQ equivalent.

```
Device A (Lead) ──┐
Device B (Follow) ─┼── WebSocket Relay ──> All devices
Device C (Follow) ─┘
```

| Aspect | Details |
|--------|---------|
| Latency | ~20-50ms |
| Infrastructure | Relay server (Node.js) |
| Use case | Multiple physical screens |
| Complexity | Medium-High |

### Option C: XMR-Based (CMS as Coordinator)

Use existing XMR WebSocket for sync messages.

| Aspect | Details |
|--------|---------|
| Latency | ~50-200ms (through CMS relay) |
| Infrastructure | Existing XMR |
| Use case | General coordination |
| Complexity | High (needs CMS changes) |

### Option D: Hybrid (Recommended)

Phase 1 + 2 covers 90% of use cases.

---

## 4. Implementation Phases

### Phase 1: Parse Sync Data (Foundation)

**Goal**: Parse sync-related data so the player is aware of sync groups.

**Files to modify:**

| File | Change |
|------|--------|
| `packages/xmds/src/schedule-parser.js` | Parse `syncEvent` attribute from layout elements |
| `packages/xmds/src/rest-client.js` | Extract `syncGroup`, `syncPublisherPort`, `syncSwitchDelay`, `syncVideoPauseDelay` from RegisterDisplay |
| `packages/core/src/player-core.js` | Store sync config, add `isSyncEvent()` helper |
| `packages/schedule/src/schedule.js` | Propagate `syncEvent` flag through `getCurrentLayouts()` |

**Status**: COMPLETE (commit e26c635)

### Phase 2: BroadcastChannel Sync (Same-Machine Video Walls)

**Goal**: Synchronized layout transitions across browser tabs on the same machine.

**New package**: `packages/sync/src/sync-manager.js`

```
Tab A (Lead Display)                Tab B (Follower)
┌────────────────────┐             ┌────────────────┐
│ SyncManager        │             │ SyncManager     │
│  role: 'lead'      │             │  role: 'follow' │
│  BroadcastChannel ─┼── sync ────┼─> receives      │
│  publishes:        │             │  applies:       │
│  - layoutChange    │             │  - layoutChange │
│  - syncReady       │             │  - syncReady    │
│  - videoStart      │             │  - videoStart   │
└────────────────────┘             └────────────────┘
```

**Message types:**
```javascript
{ type: 'layout-change', layoutId: 123, showAt: Date.now() + syncSwitchDelay }
{ type: 'layout-ready', layoutId: 123, displayId: 'pwa-abc123' }
{ type: 'layout-show', layoutId: 123 }  // All ready, show now
{ type: 'video-start', layoutId: 123, regionId: 'r1' }
{ type: 'heartbeat', displayId: 'pwa-abc123', timestamp: Date.now() }
```

**Integration points:**
- `PlayerCore.advanceToNextLayout()` — delegate to SyncManager if sync active
- `RendererLite.renderLayout()` — load content but wait for 'show' signal
- Video handling — load paused, wait for 'video-start'

**Status**: COMPLETE (commit 3d4446b)

### Phase 3: WebSocket Relay (Cross-Device)

**Goal**: Sync across physically separate devices.

**New files:**
- `packages/sync/src/ws-sync-relay.js` — Node.js WebSocket relay
- `packages/sync/src/ws-sync-client.js` — Browser WebSocket client

**Protocol:**
```javascript
{ type: 'join', syncGroupId: 1, displayId: 'pwa-abc', role: 'lead' }
{ type: 'layout-change', layoutId: 123, showAt: <timestamp> }
{ type: 'ready', layoutId: 123, displayId: 'pwa-def' }
{ type: 'show', layoutId: 123 }
```

**Effort**: 5-7 days

### Phase 4: CMS Integration (Future)

- New WebSocket endpoint: `/pwa/sync/{syncGroupId}`
- Update `Pwa.php` to expose sync group data in REST API
- Support PWA client types in sync group membership

**Effort**: Depends on CMS cooperation

---

## 5. Browser vs Native Comparison

| Aspect | Native (Android/WebOS) | PWA |
|--------|----------------------|-----|
| Protocol | ZeroMQ PUB/SUB (TCP) | BroadcastChannel / WebSocket |
| Latency | <5ms (LAN) | <1ms (BC) / ~20-50ms (WS) |
| Video sync precision | Frame-level (hardware clock) | Best-effort (~100ms) |
| Infrastructure | None (peer-to-peer) | None (BC) / relay server (WS) |
| Cross-network | Not possible (LAN only) | Possible with WS relay |
| Max displays | ZeroMQ throughput limited | Unlimited (BC) / relay dependent (WS) |

**Key limitation**: Frame-perfect video sync for true video walls (single video spanning screens) is extremely difficult in browsers. For synchronized layout transitions and general coordination, the browser approach works well.

---

## 6. Recommended Priority

1. **Phase 1** — Immediate (parse sync data, no behavior change)
2. **Phase 2** — When video wall requests come in (covers most use cases)
3. **Phase 3** — Only if cross-device sync is needed
4. **Phase 4** — Future, when CMS adds PWA sync support

---

## References

- CMS sync migration: `xibo-cms/db/migrations/20230509113820_content_sync_migration.php`
- CMS SyncGroup entity: `xibo-cms/lib/Entity/SyncGroup.php`
- CMS XMDS Soap5: `xibo-cms/lib/Xmds/Soap5.php` (lines 499-533)
- Upstream schedule parser: `electron-player/src/main/xmds/response/schedule/events/layout.ts` (line 85)
- Our schedule parser: `packages/xmds/src/schedule-parser.js` (missing syncEvent)
