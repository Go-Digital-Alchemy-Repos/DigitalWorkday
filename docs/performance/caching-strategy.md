# Caching Strategy

**Created**: March 28, 2026
**Scope**: Server-side TTL caching, client-side React Query cache configuration, cache invalidation, and bypass mechanisms.

---

## Architecture Overview

The application uses a two-layer caching approach:

```
Browser ──[React Query Cache]──> Express Server ──[In-Memory TTL Cache]──> PostgreSQL
         (client-side)                             (server-side)
```

1. **Client-side**: React Query manages request deduplication, stale-while-revalidate, and cache invalidation triggered by mutations.
2. **Server-side**: An in-memory `Map`-based cache with TTL expiration handles expensive aggregate and hierarchy queries.

---

## Server-Side TTL Cache

### Implementation: `server/lib/reportCache.ts`

The server cache is a single-process in-memory `Map<string, CacheEntry>` with the following configuration:

| Setting | Value | Description |
|---------|-------|-------------|
| `DEFAULT_TTL_MS` | 120,000ms (2 min) | Default TTL for cached entries |
| `MAX_ENTRIES` | 200 | Maximum number of cached entries before LRU eviction |

### Cache Entry Lifecycle

1. **Write**: `setCache(key, data, ttlMs)` stores data with a creation timestamp and TTL.
2. **Read**: `getCached(key)` checks if the entry exists and hasn't expired. On hit, the entry is refreshed in the Map (moved to end for LRU ordering).
3. **Expiry**: On every `setCache` call, `evictExpired()` scans all entries and removes those past their TTL.
4. **LRU Eviction**: If the cache exceeds `MAX_ENTRIES`, the oldest entry (first in Map insertion order) is removed.

### Cached Endpoints

| Endpoint | Cache Key Pattern | TTL | Constant |
|----------|------------------|-----|----------|
| `GET /api/v1/clients/hierarchy/list` | `{tenantId}:clients-hierarchy:{paramsHash}` | 60s | `HIERARCHY_CACHE_TTL_MS` |
| `GET /api/v1/clients/summary` | `{tenantId}:clients-summary:{paramsHash}` | 60s | `SUMMARY_CACHE_TTL_MS` |
| Report endpoints (various) | `{tenantId}:{reportName}:{paramsHash}` | 120s (default) | `DEFAULT_TTL_MS` |

### Cache Key Scoping by Tenant

Every cache key is prefixed with the tenant ID to ensure strict data isolation:

```typescript
const cacheKey = buildCacheKey(tenantId, "clients-hierarchy");
// Result: "tenant-abc123:clients-hierarchy:d41d8cd98f00"
```

The `buildCacheKey` function:
1. Takes `tenantId`, `reportName`, and optional `params`
2. Sorts and MD5-hashes the params for consistent key generation
3. Returns `{tenantId}:{reportName}:{paramsHash}`

This ensures:
- Tenant A never sees tenant B's cached data
- Different filter parameter combinations produce different cache entries
- `invalidateTenantReports(tenantId)` clears all cache entries for a specific tenant

### Cache Bypass: `?fresh=true`

Any cached endpoint supports cache bypass by appending `?fresh=true` or `?fresh=1` to the request URL:

```typescript
// In server/lib/reportCache.ts
export function shouldBypassCache(query: Record<string, unknown>): boolean {
  return query.fresh === "true" || query.fresh === "1";
}
```

**When to use bypass**:
- After a mutation that affects cached data and the user expects immediate consistency
- During debugging to verify the cache isn't serving stale data
- In automated tests that need deterministic responses

**Route implementation pattern**:
```typescript
router.get("/hierarchy/list", async (req, res) => {
  const cacheKey = buildCacheKey(tenantId, "clients-hierarchy");

  if (!shouldBypassCache(req.query)) {
    const cached = getCached(cacheKey);
    if (cached !== undefined) {
      setCacheHeaders(res, true, 60);
      return res.json(cached);
    }
  }

  const data = await storage.getClientsByTenantWithHierarchy(tenantId);
  setCache(cacheKey, data, HIERARCHY_CACHE_TTL_MS);
  setCacheHeaders(res, false, 60);
  return res.json(data);
});
```

### Cache-Control Response Headers

The `setCacheHeaders` function sets two headers on every cached response:

| Header | Value | Purpose |
|--------|-------|---------|
| `Cache-Control` | `private, max-age=60` | Tells browsers/proxies the response is tenant-specific and cacheable for N seconds |
| `X-Report-Cache` | `HIT` or `MISS` | Debug header for monitoring cache effectiveness |

The `private` directive ensures CDNs and shared proxies never cache tenant-scoped data. The `max-age` matches the server-side TTL so browsers don't re-request data the server would serve from cache anyway.

Additionally, `server/middleware/apiCacheControl.ts` provides `apiNoCacheMiddleware` that sets `no-store, no-cache, must-revalidate` for endpoints that must never be cached (e.g., auth, real-time data).

### Tenant-Wide Invalidation

```typescript
import { invalidateTenantReports } from "./lib/reportCache";

invalidateTenantReports(tenantId);
```

This scans all cache entries and deletes any whose key starts with `{tenantId}:`. Use this when a broad mutation (e.g., bulk status change) could affect multiple cached views.

---

## Client-Side: React Query Configuration

### Default Settings

The React Query client is configured in `client/src/lib/queryClient.ts` (line 340):

| Setting | Value | Effect |
|---------|-------|--------|
| `staleTime` | 60,000ms (1 min) | Data is considered fresh for 60 seconds; queries won't refetch within this window |
| `refetchOnWindowFocus` | `false` | Queries do NOT automatically refetch when the browser tab regains focus |
| `gcTime` | 300,000ms (5 min) | Unused cache entries are garbage collected after 5 minutes of inactivity |

These defaults mean that after a successful fetch, the data is considered fresh for 60 seconds. During this window, navigating away and back won't trigger a refetch. After 60 seconds, the data is stale and the next mount or manual invalidation triggers a refetch. Window focus events do not trigger refetches.

### Per-Query Overrides

Some queries override the defaults:

| Query | `staleTime` | Reason |
|-------|-------------|--------|
| Projects analytics summary | 30,000ms (30s) | More aggressive staleness than the 60s default because analytics are expensive and shown prominently |
| Feature flags | 300,000ms (5 min) | Flags change rarely; no need to refetch frequently |

### Query Key Architecture

All keys are centralized in `client/src/lib/queryKeys.ts`:

```typescript
export const queryKeys = {
  clients: {
    all: ["/api/clients"],                    // Full client list
    minimal: ["/api/clients", { fields: "minimal" }], // Dropdown-only fields
    detail: (id) => ["/api/clients", id],     // Single full client
    hierarchy: ["/api/v1/clients/hierarchy/list"], // Thin hierarchy list
    stagesSummary: ["/api/v1/clients/stages/summary"], // Pipeline counts
  },
  tasks: {
    my: ["/api/tasks/my"],           // Task list (with filter params appended)
    detail: (id) => ["/api/tasks", id], // Full task detail
    // ...
  },
  // ...
};
```

**Key design rules**:
- Filter parameters are part of the query key: `[...queryKeys.projects.all, queryParams]`
- Each payload shape has its own key (thin vs full are never mixed)
- Hierarchical keys use arrays for proper prefix-based invalidation

### Cache Invalidation Strategy

#### The `invalidateTaskCaches` Helper

Located in `client/src/lib/queryKeys.ts`, this function consolidates task-related cache invalidation:

```typescript
export function invalidateTaskCaches(qc: QueryClient, opts: {
  projectId?: string | null;
  taskId?: string | null;
  parentTaskId?: string | null;
  includeProjectLists?: boolean;
}): void {
  qc.invalidateQueries({ queryKey: queryKeys.tasks.my });
  qc.invalidateQueries({ queryKey: queryKeys.tasks.all });

  if (opts.taskId) {
    qc.invalidateQueries({ queryKey: queryKeys.tasks.detail(opts.taskId) });
  }
  if (opts.projectId) {
    qc.invalidateQueries({ queryKey: queryKeys.projects.sections(opts.projectId) });
    qc.invalidateQueries({ queryKey: queryKeys.projects.tasks(opts.projectId) });
  }
  if (opts.parentTaskId) {
    qc.invalidateQueries({ queryKey: queryKeys.tasks.detail(opts.parentTaskId) });
    qc.invalidateQueries({ queryKey: queryKeys.tasks.childTasks(opts.parentTaskId) });
    qc.invalidateQueries({ queryKey: queryKeys.tasks.subtasks(opts.parentTaskId) });
  }
  if (opts.includeProjectLists) {
    qc.invalidateQueries({ queryKey: queryKeys.projects.all });
    qc.invalidateQueries({ queryKey: queryKeys.projects.v1 });
  }
}
```

**Before this helper existed**, task mutations had 3–5 scattered `invalidateQueries` calls across `task-detail-drawer`, `subtask-detail-drawer`, `ai-project-planner`, `use-create-task`, and `project.tsx`. Now invalidation logic is auditable from a single location.

#### Mutation → Invalidation Table

| Mutation | Caches Invalidated |
|----------|-------------------|
| Create client | `clients.hierarchy`, `clients.stagesSummary` |
| Update client stage | `clients.detail(id)`, `clients.hierarchy`, `clients.stagesSummary` |
| Bulk client status change | `clients.hierarchy`, `clients.stagesSummary` |
| Create/update/delete task | `tasks.my`, `tasks.all`, `projects.sections(pid)`, `projects.tasks(pid)` |
| Create/update project | `projects.all` (resets pagination via `resetPagination()`) |
| Toggle project pin | `projects.all` |

#### Tenant Context Switch

When a super user switches tenant context, `clearTenantScopedCaches()` invalidates all queries with tenant-scoped prefixes (20+ prefixes including `/api/v1/clients`, `/api/tasks`, `/api/projects`, etc.). This prevents stale data from the previous tenant appearing in the new context.

---

## Tradeoffs of the Current Approach

### In-Memory Cache Limitations
- **Single-process**: The cache lives in the Node.js process memory. In a multi-instance deployment, each instance maintains its own cache — no cross-instance sharing.
- **Cold start**: After a server restart, all cache entries are lost. The first request after restart will always be a cache miss.
- **Memory pressure**: With `MAX_ENTRIES = 200`, the cache is bounded. In a system with many tenants making varied queries, eviction may cause lower hit rates.

### Staleness Window
- The 60-second TTL means a user could see data up to 60 seconds old on the clients list. This is acceptable for list views but would not be acceptable for transaction-critical data.
- `?fresh=true` provides an escape hatch for scenarios requiring immediate consistency.

### No Active Invalidation on Client CRUD
- The hierarchy and summary caches are not actively invalidated when a client is created, updated, or deleted. They rely on TTL expiration.
- This was a deliberate design choice: active invalidation would require wiring every mutation through the cache layer, adding complexity. The 60-second TTL provides an acceptable staleness window for list views.
- If tighter consistency is needed in the future, add `invalidateTenantReports(tenantId)` calls to the client CRUD mutation handlers in the router.

### React Query vs Server Cache Interaction
- React Query's `staleTime: 60_000` means the client considers data fresh for 60 seconds after fetching. Combined with `refetchOnWindowFocus: false`, this means navigating between tabs does not trigger refetches. After 60 seconds, the data becomes stale and the next mount triggers a refetch.
- The `Cache-Control: private, max-age=60` header on server responses aligns with the client-side stale time. This means the browser's HTTP cache and React Query's cache have roughly the same freshness window, reducing redundant network requests.

---

## Future Considerations

1. **Redis or shared cache**: For multi-instance deployments, consider migrating from the in-memory Map to Redis for cross-instance cache sharing.
2. **Active invalidation**: Wire `invalidateTenantReports(tenantId)` into client CRUD handlers for tighter consistency on the hierarchy cache.
3. **Cache warming**: Pre-populate the cache on server start for high-traffic tenants to eliminate cold-start penalties.
4. **Monitoring**: Track cache hit/miss rates via the `X-Report-Cache` header and the `reportCacheStats()` function to tune TTL values.
