# Time Tracking

**Status:** Current  
**Last Updated:** January 2026  
**Related Docs:** [API Reference](../04-API/), [Database Schema](../08-DATABASE/)

---

## Overview

MyWorkDay includes a comprehensive time tracking system with:
- Active timer with start/pause/resume/stop
- Manual time entry creation
- Client/Project/Task/Subtask association
- Cross-tab synchronization
- Persistent timer display in header

---

## Components

### GlobalActiveTimer

Displayed in the header when a timer is running:

```
┌──────────────────────────────────────────┐
│  [Logo]  MyWorkDay    ⏱ 01:23:45  [▶||] │
└──────────────────────────────────────────┘
```

Features:
- Persistent across all pages
- Real-time elapsed time display
- Pause/resume controls
- Click to expand details
- Cross-tab synchronization

### Time Tracking Page

Located at `/time-tracking`:

```
┌─────────────────────────────────────────────────┐
│ Time Tracking                    [+ Start Timer]│
├─────────────────────────────────────────────────┤
│ Today: 4h 32m                                   │
│ This Week: 28h 15m                              │
├─────────────────────────────────────────────────┤
│ Time Entries                                    │
│ ┌─────────────────────────────────────────────┐ │
│ │ Project A > Task 1           2:30   [Edit]  │ │
│ │ Project B > Task 2           1:45   [Edit]  │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## Timer Operations

### Starting a Timer

```typescript
POST /api/timer/start
{
  "taskId": "uuid",      // Optional
  "description": "..."   // Optional
}
```

**Behavior:**
- Only one timer can run per user (enforced by unique index)
- Returns 409 with `TIMER_ALREADY_RUNNING` if timer exists
- Timer persists across sessions

### Pausing/Resuming

```typescript
POST /api/timer/pause
POST /api/timer/resume
```

**Behavior:**
- Optimistic UI updates with rollback on failure
- Pause stores accumulated duration
- Resume continues from paused state

### Stopping a Timer

```typescript
POST /api/timer/stop
{
  "taskId": "uuid",      // Optional (can be set at stop)
  "clientId": "uuid",    // Optional
  "description": "..."   // Optional
}
```

**Behavior:**
- Creates time entry in database
- Clears active timer
- Broadcasts update to other tabs

---

## Cache Invalidation Strategy

Time entry mutations use targeted cache invalidation via the `invalidateTimeEntries` helper
(`client/src/lib/queryKeys.ts`). This replaces broad prefix-based invalidation of all
`/api/time-entries` query variants with narrower, filter-aware invalidation.

### Helper: `invalidateTimeEntries(qc, opts)`

| Option | Type | Description |
|--------|------|-------------|
| `dateFilter` | `"all" \| "today" \| "week" \| "month" \| null` | When set, only the query key for that specific filter is invalidated. When null/omitted, all time entry queries are invalidated. |
| `includeStats` | `boolean` | Whether to also invalidate `/api/time-entries/my/stats`. Defaults to `true`. |
| `taskId` | `string \| null` | When set, additionally invalidates the task-specific time entries cache. |

### Mutation Invalidation Rules

| Mutation | Invalidates entries | Invalidates stats | Notes |
|----------|--------------------|--------------------|-------|
| Timer start | No | No | No time entry created |
| Timer pause/resume | No | No | Timer state only |
| Timer stop (save) | All variants | Yes | New entry could appear in any filter |
| Timer stop (discard) | No | No | No data change |
| Manual entry create | Active filter only | Yes | |
| Time entry update | Active filter only | Yes | |
| Time entry delete | Active filter only | Yes | |

### Optimistic Updates

Timer pause/resume use optimistic cache patches on the timer query key only.
Timer stop optimistically clears the timer from the cache with rollback on error.

Time entry mutations in the My Time page use optimistic list patches with rollback:

| Mutation | Optimistic Action | Rollback |
|----------|------------------|----------|
| Manual create | Insert placeholder entry at top of active filter cache | Restore previous cache on error |
| Edit | Patch entry fields in active filter cache | Restore previous cache on error |
| Delete | Remove entry from active filter cache | Restore previous cache on error |
| Timer stop (save) | Timer cleared optimistically; response entry inserted into all matching filter caches | Timer restored on error |

Helpers in `client/src/lib/queryKeys.ts`:
- `optimisticInsertTimeEntry(qc, entry, dateFilter)` — prepends entry to flat or paginated cache
- `optimisticUpdateTimeEntry(qc, entryId, dateFilter, patch)` — patches matching entry in cache
- `optimisticRemoveTimeEntry(qc, entryId, dateFilter)` — removes entry from cache
- `rollbackTimeEntryCache(qc, dateFilter, previousData)` — restores saved cache snapshot

- `optimisticInsertTimeEntryBroad(qc, entry)` — inserts entry into all matching filter caches (used by timer stop)
- `entryMatchesDateFilter(startTimeISO, dateFilter)` — checks if entry falls within filter range

All helpers handle both flat (today/week) and paginated (month/all) cache shapes.
Manual create guards insertion with `entryMatchesDateFilter` to avoid inserting out-of-range entries.
Timer stop uses `optimisticInsertTimeEntryBroad` to insert the server response entry into all matching active caches.

---

## Cross-Tab Synchronization

Timer state is synchronized across browser tabs using BroadcastChannel.
Messages include an `eventType` field to distinguish timer state changes from data mutations:

```typescript
const channel = new BroadcastChannel("active-timer-sync");

// Broadcast: timer state change (pause/resume/start)
channel.postMessage({ type: "timer-updated", eventType: "timer-state-change" });

// Broadcast: time entry data changed (stop with save, manual create)
channel.postMessage({ type: "timer-updated", eventType: "time-entry-changed" });

// Receiving tab
channel.onmessage = (event) => {
  if (event.data.type === "timer-updated") {
    refetchTimer(); // Always refetch timer state
    if (event.data.eventType === "time-entry-changed") {
      // Also invalidate time entry lists and stats
      invalidateTimeEntries(queryClient, {});
    }
  }
};
```

Fallback for older browsers uses `localStorage` events with the same JSON payload
(`{ eventType, ts }`).

---

## Timer Reliability

### Periodic Refetch

Timer state is refetched periodically to ensure convergence:
- Running timer: every 30 seconds
- Paused timer: every 60 seconds

### Recovery Toast

On app boot, if a timer is running, a recovery toast is shown:

```
┌──────────────────────────────────────┐
│ ⏱ Timer recovered                    │
│ You have a timer running: 01:23:45   │
└──────────────────────────────────────┘
```

Uses `sessionStorage` to show once per timer per session.

### Error Handling

- Timer mutations preserve state on failure
- 409 errors show "timer already running" message
- Network errors don't clear timer state

---

## Cascading Selection

Time entries use cascading dropdowns:

```
Client → Division (if client has divisions) → Project → Task → Subtask
```

**Behavior:**
- Selecting Client:
  - Filters Projects to that client
  - Shows Division dropdown if client has divisions
- Selecting Division (when available):
  - Filters Projects to only those in the selected division
  - Selecting "All divisions" shows all client projects
- Selecting Project enables Task dropdown
- If Task has subtasks, Subtask dropdown appears
- Changing parent clears children (cascade reset)

**Division-aware filtering:**
```typescript
const filteredProjects = clientHasDivisions && divisionId
  ? clientProjects.filter(p => p.divisionId === divisionId)
  : clientProjects;
```

**Final assignment:**
```typescript
const finalTaskId = subtaskId || taskId;
```

---

## Database Schema

### active_timers

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| userId | uuid | User (unique index) |
| tenantId | uuid | Tenant |
| taskId | uuid | Associated task (optional) |
| clientId | uuid | Associated client (optional) |
| startedAt | timestamp | Timer start time |
| pausedAt | timestamp | Pause time (null if running) |
| accumulatedSeconds | integer | Time before current pause |
| status | enum | running, paused |
| description | text | Timer description |

### time_entries

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| userId | uuid | User |
| tenantId | uuid | Tenant |
| taskId | uuid | Associated task |
| clientId | uuid | Associated client |
| startTime | timestamp | Entry start |
| endTime | timestamp | Entry end |
| durationMinutes | integer | Duration in minutes |
| description | text | Entry description |
| scope | enum | task, subtask, direct |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/timer/current` | Get active timer |
| POST | `/api/timer/start` | Start new timer |
| POST | `/api/timer/pause` | Pause timer |
| POST | `/api/timer/resume` | Resume timer |
| POST | `/api/timer/stop` | Stop and save entry |
| GET | `/api/time-entries` | List time entries |
| POST | `/api/time-entries` | Create manual entry |
| PATCH | `/api/time-entries/:id` | Update entry |
| DELETE | `/api/time-entries/:id` | Delete entry |

---

## Related Sections

- [04-API](../04-API/) - Full API reference
- [05-FRONTEND](../05-FRONTEND/) - Component docs
- [08-DATABASE](../08-DATABASE/) - Schema reference
