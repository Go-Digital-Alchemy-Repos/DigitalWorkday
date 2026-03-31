# My Time Performance Optimization

> Enterprise Stabilization Phase 1 — Task #72

## Overview

Performance optimizations for the My Time page to reduce payload sizes, minimize database load, and improve frontend responsiveness.

## Architecture Summary

### Lightweight Picker Endpoints

Dedicated picker endpoints return minimal `{id, label}` payloads for dropdown/select UI. These replace heavier endpoints that previously returned full entity data.

| Endpoint | Response Shape | Query Params |
|---|---|---|
| `GET /api/v1/pickers/clients` | `{id, label}[]` | — |
| `GET /api/v1/pickers/projects` | `{id, label, clientId}[]` | `clientId` (optional), `search` (optional) |
| `GET /api/v1/pickers/tasks` | `{id, label, projectId, parentTaskId, status}[]` | `projectId` (required), `search` (optional) |

Frontend query keys defined in `queryKeys.pickers`.

### Time Entry List DTO vs Detail DTO

The list view uses a lean `TimeEntryListItem` type that includes pre-resolved display names (userName, clientName, projectName, taskTitle) via `batchFlattenEntries`. This avoids N+1 lookups by batch-loading related entities in a single pass.

- Backend: `batchFlattenEntries()` in `server/storage/timeTracking.repo.ts`
- Triggered by: `fields=list` query parameter on `GET /api/time-entries/my` and `GET /api/time-entries`
- Full detail fetched on-demand when editing a specific entry

### Cursor-Based Pagination

`GET /api/time-entries/my` supports cursor pagination:

```
GET /api/time-entries/my?limit=25&cursor=<nextCursor>
```

Response: `{ items, hasMore, nextCursor, totalCount }`

When `limit` is omitted, returns a flat array for backward compatibility. Frontend uses `useInfiniteQuery` with "Load more" button for "All Time" and "This Month" filters. Query key: `queryKeys.timeEntries.paginated`.

### SQL-First Stats Aggregation

The summary statistics (total hours, billable/unbillable split, by-client, by-project) are computed via SQL `SUM`/`GROUP BY` directly in `timeTrackingRepo`, not in application code. This eliminates fetching all entries just to compute totals.

### Targeted Cache Invalidation

Optimistic update/delete/insert helpers in `queryKeys.ts`:

- `optimisticUpdateTimeEntry(qc, entryId, updater)` — updates entry in-place across paginated + non-paginated caches
- `optimisticDeleteTimeEntry(qc, entryId)` — removes entry from caches immediately
- `optimisticInsertTimeEntry(qc, newEntry, dateFilter)` — inserts into correct cache position
- `invalidateTimeEntries(qc, { dateFilter })` — scoped invalidation per date filter

### Cascade Hook

`useTimeEntryCascade()` in `client/src/hooks/use-time-entry-cascade.ts` powers client → project → task → subtask dropdown chains. Now wired to lightweight picker endpoints (`/api/v1/pickers/*`) returning `{id, label}` payloads.

## Files

| File | Purpose |
|---|---|
| `server/http/domains/pickers.router.ts` | Lightweight picker endpoints |
| `server/http/mount.ts` | Router registration |
| `client/src/hooks/use-time-entry-cascade.ts` | Cascade dropdown hook |
| `client/src/lib/queryKeys.ts` | Query key definitions including `pickers` namespace |
| `client/src/pages/time-tracking.tsx` | My Time page (ActiveTimerPanel, ManualEntryDialog, EditTimeEntryDrawer, TimeEntriesList) |
| `client/src/features/timer/start-timer-drawer.tsx` | Start timer drawer |
| `client/src/features/timer/global-active-timer.tsx` | Global active timer panel |
| `client/src/components/time-entry-drawer.tsx` | Reusable time entry drawer |
| `server/storage/timeTracking.repo.ts` | Time tracking repository with batch hydration |
| `server/http/domains/time/entries.routes.ts` | Time entry routes with `fields=list` support |
