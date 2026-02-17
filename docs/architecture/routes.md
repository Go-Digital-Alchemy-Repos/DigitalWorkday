# Route Architecture Convention

> **Status**: Active (Prompt #1 — Feb 2026)  
> **Pilot Domain**: `system-integrations` at `/api/v1/system`

## Overview

All **new routes** must be created using `createApiRouter()` from `server/http/routerFactory.ts` and registered in `server/http/routeRegistry.ts` via `mountAllRoutes()` in `server/http/mount.ts`.

Legacy routes continue to work unchanged. They are inventoried in the route registry for tracking but mounted through the existing `server/routes.ts` aggregator.

## Key Files

| File | Purpose |
|------|---------|
| `server/http/routerFactory.ts` | Factory: creates routers with standardized guard policies |
| `server/http/policy/requiredMiddleware.ts` | Policy definitions: `public`, `authOnly`, `authTenant`, `superUser` |
| `server/http/policy/responseEnvelope.ts` | Non-breaking `res.ok()` / `res.fail()` helpers |
| `server/http/routeRegistry.ts` | Single source of truth for all route mount declarations |
| `server/http/mount.ts` | `mountAllRoutes()` — the single entry point for route registration |
| `server/http/domains/system.router.ts` | Pilot: system-integrations router using new convention |
| `server/tests/policy/routePolicy.test.ts` | Policy drift tests — fail if routes bypass required guards |

## Policies

| Policy | Factory-Applied Guards | Use Case |
|--------|----------------------|----------|
| `public` | None | Health checks, webhooks |
| `authOnly` | `requireAuth` | Tenant onboarding, setup flows |
| `authTenant` | `requireAuth` + `requireTenantContext` | Standard tenant-scoped API routes |
| `superUser` | `requireAuth` + `requireSuperUser` | Admin-only system management |

> **Note**: Request-ID (`X-Request-Id`), request logging, and CSRF middleware are applied **globally** at the app level (in `server/routes.ts`), not by the factory. The factory only applies auth/tenant/superUser guards specific to each policy. During the migration period, factory-mounted routers under `/api/*` also receive the legacy global auth/tenant guards — this is safe (idempotent) but redundant. Once all domains are migrated, the global guards in `routes.ts` will be removed.

## Creating a New Domain Router

```typescript
// server/http/domains/myDomain.router.ts
import { createApiRouter } from "../routerFactory";

const router = createApiRouter({
  policy: "authTenant",          // choose appropriate policy
  allowlist: ["/public-endpoint"], // optional: paths that bypass policy guards
});

// Mount your route handlers
router.get("/items", async (req, res) => {
  const data = await getItems();
  res.ok(data); // uses envelope helper
});

router.post("/items", async (req, res) => {
  // policy guards already applied — user is authenticated + has tenant context
  const item = await createItem(req.body);
  res.ok(item, 201);
});

export default router;
```

Then register in `server/http/mount.ts`:

```typescript
import myDomainRouter from "./domains/myDomain.router";

// Inside mountAllRoutes():
registerRoute({
  path: "/api/v1/my-domain",
  router: myDomainRouter,
  policy: "authTenant",
  domain: "my-domain",
  description: "Description of what this domain handles",
  legacy: false,
});

// Mount it
app.use("/api/v1/my-domain", myDomainRouter);
```

## Response Envelope Helpers

New routes get `res.ok()` and `res.fail()` automatically:

```typescript
// Success
res.ok({ items: [...] });           // 200 by default
res.ok({ id: "abc" }, 201);         // custom status

// Error
res.fail("VALIDATION_ERROR", "Name is required", 400);
res.fail("NOT_FOUND", "Item not found", 404);
res.fail("INTERNAL_ERROR", "Something broke", 500, { debugInfo: "..." });
```

These are **non-breaking additions** — existing `res.json()` / `res.status().json()` patterns continue to work.

## Guard Allowlists

Current auth-exempt paths (defined in `server/routes.ts`):
- `/api/auth/*`
- `/api/v1/auth/*`
- `/api/v1/super/bootstrap`
- `/api/health`
- `/api/v1/webhooks/*`

Current tenant-context-exempt paths:
- `/api/auth/*`
- `/api/health`
- `/api/v1/super/*`
- `/api/v1/tenant/*`
- `/api/v1/webhooks/*`

When a router-factory policy specifies an allowlist, it works at the router level — matching paths within that router that should skip the policy guards.

## Policy Drift Tests

Tests in `server/tests/policy/routePolicy.test.ts` verify:
1. All registered routes have valid policies
2. Webhooks use `public` policy
3. Super admin routes use `superUser` policy
4. Tags domain uses `authTenant` policy
5. Non-legacy routes have actual router instances with factory metadata
6. No rogue `app.use('/api'...)` mounts exist outside allowed files
7. Guard allowlists match the actual exemptions in `routes.ts`

Integration tests in `server/tests/integration/tagsRoutes.test.ts` verify:
1. Unauthenticated requests blocked by factory authTenant policy (401)
2. Authenticated requests reach handlers successfully
3. Missing tenant context blocked (400/403)
4. All tag CRUD routes match correctly (no express-level 404s)
5. Factory metadata present with correct policy

Run: `npx vitest run server/tests/policy/ server/tests/integration/`

## Migrated Domains

| Domain | Mount Path | Policy | Router File | Prompt | Date |
|--------|-----------|--------|-------------|--------|------|
| system-integrations | `/api/v1/system` | `superUser` | `server/http/domains/system.router.ts` | #1 (pilot) | Feb 2026 |
| tags | `/api` | `authTenant` | `server/http/domains/tags.router.ts` | #2 | Feb 2026 |
| activity | `/api` | `authTenant` | `server/http/domains/activity.router.ts` | #3 | Feb 2026 |
| comments | `/api` | `authTenant` | `server/http/domains/comments.router.ts` | #4 | Feb 2026 |
| presence | `/api` | `authTenant` | `server/http/domains/presence.router.ts` | #5 | Feb 2026 |
| ai | `/api` | `authTenant` | `server/http/domains/ai.router.ts` | #5 | Feb 2026 |
| attachments | `/api` | `authTenant` | `server/http/domains/attachments.router.ts` | #6 | Feb 2026 |
| flags | `/api` | `authTenant` | `server/http/domains/flags.router.ts` | #7 | Feb 2026 |
| uploads | `/api/v1/uploads` | `authTenant` | `server/http/domains/uploads.router.ts` | #7 | Feb 2026 |
| chat | `/api/v1/chat` | `authTenant` | `server/http/domains/chat.router.ts` | #8 | Feb 2026 |

### Presence Domain Migration Notes (Prompt #5)
- **1 endpoint** migrated: GET `/v1/presence` (query all or specific user presence)
- **skipEnvelope: true** — Legacy handler uses `res.json()` directly.
- **Path mapping**: Legacy mount was `router.use("/v1/presence", presenceRoutes)` where handler used `/`. New router uses `/v1/presence` path directly, mounted at `/api`.
- **Integration tests**: 5 smoke tests in `server/tests/integration/presenceRoutes.test.ts`.

### AI Domain Migration Notes (Prompt #5)
- **4 endpoints** migrated: GET `/v1/ai/status`, POST `/v1/ai/suggest/task-breakdown`, POST `/v1/ai/suggest/project-plan`, POST `/v1/ai/suggest/task-description`
- **skipEnvelope: true** — Legacy handlers use `res.json()` directly.
- **Policy: authTenant** — AI features are tenant-scoped. Legacy used `requireAuth` per-handler; factory policy now applies at router scope.
- **Validation preserved**: Zod schemas for request body validation retained verbatim.
- **Integration tests**: 8 smoke tests in `server/tests/integration/aiRoutes.test.ts`.

### Attachments Domain Migration Notes (Prompt #6)
- **7 endpoints** migrated: GET `/attachments/config`, GET `/crm/flags`, GET `/projects/:pid/tasks/:tid/attachments`, POST `/projects/:pid/tasks/:tid/attachments/presign`, POST `/projects/:pid/tasks/:tid/attachments/:aid/complete`, GET `/projects/:pid/tasks/:tid/attachments/:aid/download`, DELETE `/projects/:pid/tasks/:tid/attachments/:aid`
- **skipEnvelope: true** — Legacy handlers use `res.json()` directly.
- **Upload guard middleware introduced**: `server/http/middleware/uploadGuards.ts` provides `validateUploadRequest()` (filename sanitization, size/type logging), `sanitizeFilename()`, and `isFilenameUnsafe()`. Applied to the presign endpoint in warn/log-only mode — does not block existing flows.
- **Storage side-effects preserved**: S3/R2 presigned URL generation, object existence checks, and deletion all retained verbatim.
- **CRM flags co-located**: GET `/crm/flags` was in the legacy attachments router; migrated as-is to avoid breaking the endpoint. **Moved to its own flags.router.ts in Prompt #7.**
- **Integration tests**: 10 smoke tests in `server/tests/integration/attachmentsRoutes.test.ts` covering auth, tenant enforcement, route matching, validation, metadata, and upload guards.

### Uploads Domain Migration Notes (Prompt #7)
- **3 endpoints** migrated: POST `/presign`, GET `/status`, POST `/upload` (multipart proxy)
- **Mount path**: `/api/v1/uploads` — preserves legacy URL structure.
- **skipEnvelope: true** — Legacy handlers use `res.json()` directly.
- **Rate limiting preserved**: `uploadRateLimiter` applied to `/presign` and `/upload` endpoints as middleware.
- **Legacy `requireAuth` removed**: Factory `authTenant` policy handles auth+tenant enforcement at router scope, replacing per-handler `requireAuth` calls.
- **Upload guard middleware applied**: `validateUploadRequest()` on `/presign` with field mapping (`filename`/`contentType`/`size` fields).
- **Integration tests**: 12 smoke tests in `server/tests/integration/uploadsRoutes.test.ts` covering auth, tenant, routing, validation, enforce-mode guard behavior, and metadata.

### Chat Domain Migration Notes (Prompt #8)
- **29 endpoints** migrated: channels CRUD + join/leave, DMs CRUD, messages send/edit/delete, thread replies, thread summaries, file uploads, read tracking, search, user lists, mentionable users, channel member management.
- **Mount path**: `/api/v1/chat` — preserves legacy URL structure.
- **skipEnvelope: true** — Legacy handlers use `res.json()` directly.
- **De-duplication**: Removed 3 dead-code duplicate routes (PATCH/DELETE `/messages/:id` duplicated `/messages/:messageId`, GET `/users` duplicated at line 1230). Only first-registered Express routes were effective.
- **Rate limiting preserved**: `chatSendRateLimiter` on POST `/channels/:channelId/messages` and POST `/dm/:dmId/messages`.
- **Socket.IO integration preserved**: All `emitToTenant`, `emitToChatChannel`, `emitToChatDm` real-time broadcast calls retained verbatim.
- **Chat debug instrumentation preserved**: All `chatDebugStore.logEvent()` calls retained for observability.
- **Direct DB query**: GET `/messages/recent-since-login` uses direct Drizzle ORM query against `chatMessages` table (read-only). Not refactored to storage interface in this migration.
- **File upload**: POST `/uploads` uses multer in-memory buffer + S3/R2 upload via `getStorageProvider()`.
- **Policy tests**: 11 HTTP policy drift tests in `server/tests/chat-router-policy.test.ts`.

### Socket.IO Policy Wrapper (Prompt #8/9)
- **New file**: `server/realtime/socketPolicy.ts` — reusable `withSocketPolicy()` decorator for Socket.IO event handlers.
- **Options**: `requireAuth`, `requireTenant`, `requireChatMembership`, `requireChatRoomAccess` — composable policy checks.
- **AuthorizedContext**: Handler receives `{ userId, tenantId, socketId }` after policy checks pass.
- **Membership validation**: When `requireChatMembership: true`, validates user is a member of the channel/DM specified by `conversationId`.
- **Room Access validation**: When `requireChatRoomAccess: true`, validates user has access to the room specified by `targetType` and `targetId`.
- **Caching**: Includes a lightweight membership cache to reduce database load on high-frequency events; automatically cleaned up on socket disconnection.
- **Coverage**: `TYPING_EVENTS.START`, `TYPING_EVENTS.STOP`, `CHAT_ROOM_EVENTS.JOIN`, `CHAT_ROOM_EVENTS.LEAVE`, `PRESENCE_EVENTS.PING`, and `PRESENCE_EVENTS.IDLE` all use `withSocketPolicy()`.

### Time Domain Migration Notes (Prompt #10)
- **18 endpoints** migrated from two legacy files:
  - `server/routes/timeTracking.router.ts` (18 endpoints, tenancy-aware)
  - `server/routes/timeTracking.ts` (7 overlapping timer endpoints, simpler version)
- **Timer CRUD** (7): GET/PATCH/DELETE `/timer/current`, POST `/timer/start`, `/timer/pause`, `/timer/resume`, `/timer/stop`
- **Time Entry CRUD** (7): GET `/time-entries`, `/time-entries/my`, `/time-entries/my/stats`, `/time-entries/:id`, POST `/time-entries`, PATCH `/time-entries/:id`, DELETE `/time-entries/:id`
- **Reporting** (2): GET `/time-entries/report/summary`, `/time-entries/export/csv`
- **Calendar** (2): GET `/calendar/events`, `/my-calendar/events`
- **skipEnvelope: true** — All handlers use `res.json()` directly. Envelope helpers available but not adopted to maintain response compatibility.
- **Invariants confirmed**:
  - Single active timer per user: Starting a timer while one exists returns 409 Conflict.
  - Timer must be running to pause; must be paused to resume.
  - Stop with `discard: true` deletes timer without creating a time entry.
  - Stop without discard + zero duration throws 400.
  - No overlap enforcement on time entries (manual entries can overlap).
- **Tenancy-aware**: Full strict/soft/legacy mode support preserved. Timer and time entry operations respect `isStrictMode()` / `isSoftMode()` with appropriate warning headers and fallback queries for legacy records.
- **Policy drift tests**: 19 tests in `server/tests/time-router-policy.test.ts` (18 auth rejection + 1 factory metadata).
- **Integration tests**: 30 tests in `server/tests/integration/timeRoutes.test.ts` covering auth rejection (live + mini app), tenant enforcement (4 tests: no-tenant → 400/403), timer invariants (4 tests: stop/pause/resume/delete with no active timer → 404), route matching (timer + time entry + reporting + calendar), and registry metadata.

### Flags Domain Migration Notes (Prompt #7)
- **1 endpoint**: GET `/crm/flags` — CRM feature flags.
- **Extracted from attachments router**: Restores domain boundaries; `/crm/flags` was co-located in the legacy attachments router file.
- **skipEnvelope: true** — Returns raw JSON response.
- **Integration tests**: 4 smoke tests in `server/tests/integration/flagsRoutes.test.ts`.

### Upload Guards: Warn/Enforce Mode (Prompt #7)
- **`UPLOAD_GUARDS_MODE` env var**: Controls guard behavior. Values: `warn` (default) or `enforce`.
- **Warn mode** (default): Logs structured warnings for unsafe filenames, oversized files, unexpected MIME types. Does not block requests.
- **Enforce mode**: Blocks path traversal attempts, dangerous file extensions (.exe/.bat/etc), and absurd file sizes with `400 Bad Request`. Applied only when `UPLOAD_GUARDS_MODE=enforce`.
- **Field mapping**: `validateUploadRequest()` supports configurable field names (`filenameField`, `mimeTypeField`, `sizeField`) to work with different request schemas (attachments use `fileName`/`mimeType`/`fileSizeBytes`, uploads use `filename`/`contentType`/`size`).
- **Applied to**: Attachments presign endpoint + Uploads presign endpoint.

### Registry-Only Mounting (Prompt #5)
- **mount.ts refactored**: Domain routers are now declared in `MIGRATED_DOMAINS` array and registered via `registerRoute()`. All non-legacy routes are mounted by iterating `getRouteRegistry()` — no direct `app.use(path, router)` calls for individual domains.
- **Policy drift test added**: Verifies mount.ts has no direct `app.use()` calls with router literals, and confirms registry iteration pattern is present.

### Comments Domain Migration Notes (Prompt #4)
- **6 endpoints** migrated: GET/POST `/tasks/:taskId/comments`, PATCH/DELETE `/comments/:id`, POST `/comments/:id/resolve`, POST `/comments/:id/unresolve`
- **Mixed URL prefixes**: Routes span `/tasks/:taskId/comments` and `/comments/:id`. Mounted at `/api` to preserve all paths.
- **skipEnvelope: true** — Legacy handlers use `res.json()` directly. Envelope helpers available but not adopted to maintain response compatibility.
- **Notification side-effects preserved**: POST comment handler includes @mention notifications, email outbox, and assignee notifications — all retained verbatim.
- **Integration tests**: 9 smoke tests in `server/tests/integration/commentsRoutes.test.ts` covering auth rejection, tenant enforcement, route matching, and metadata.

### Activity Domain Migration Notes (Prompt #3)
- **2 endpoints** migrated: POST `/activity-log`, GET `/activity-log/:entityType/:entityId`
- **skipEnvelope: true** — Legacy handlers use `res.json()` directly.
- **Smallest migration**: Only 2 endpoints, no side-effects.

### Tags Domain Migration Notes (Prompt #2)
- **6 endpoints** migrated: tag CRUD (GET, POST, PATCH, DELETE) + task-tag associations (POST, DELETE)
- **Mixed URL prefixes**: Routes span `/workspaces/:id/tags`, `/tags/:id`, and `/tasks/:id/tags`. Mounted at `/api` to preserve all paths.
- **skipEnvelope: true** — Legacy handlers use `res.json()` directly. Envelope helpers available but not adopted to maintain response compatibility.
- **Double-guard**: Global auth+tenant from `routes.ts` runs first (idempotent), then factory's `authTenant` policy runs. Safe but redundant.
- **No internal auth guards** — All auth/tenant enforcement came from global middleware, now handled by factory policy.

## Migration Playbook (Next Domain)

To migrate the next domain (Prompt #3):

1. **Pick a domain** from the registry (look for `legacy: true` entries)
2. **Create** `server/http/domains/<domain>.router.ts` using `createApiRouter()`
3. **Move** the route handlers from the legacy router to the new domain file
4. **Comment out** the legacy mount in `routes/index.ts` (add TODO marker)
5. **Register** in `MIGRATED_DOMAINS` array in `mount.ts` — routers are auto-mounted via registry iteration
6. **Add smoke tests** — at least: 401 unauth, 200 auth+tenant, route matching
7. **Update policy drift tests** — verify the new domain's policy is declared
8. **Test** — all tests must pass
9. **Verify** — URLs unchanged, existing behavior preserved

### Recommended migration order (low to high risk):
1. `/api/v1/system` — system integrations (DONE - Prompt #1 pilot)
2. `/api` tags — tag CRUD + task-tag associations (DONE - Prompt #2)
3. `/api` activity — activity log (DONE - Prompt #3)
4. `/api` comments — comment CRUD (DONE - Prompt #4)
5. `/api/v1/presence` — presence tracking (DONE - Prompt #5)
6. `/api/v1/ai` — AI routes (DONE - Prompt #5)
7. `/api` attachments — attachment upload/download (DONE - Prompt #6)
8. `/api/v1/uploads` — file uploads (DONE - Prompt #7)
   - Also: `/api` flags — CRM feature flags (DONE - Prompt #7, extracted from attachments)
9. `/api/v1/chat` — chat system (DONE - Prompt #8, 29 endpoints + socket policy pilot)
10. `/api` time — time tracking, timers, calendar, reporting (DONE - Prompt #10, 18 endpoints)
11. `/api` projects/tasks — project CRUD, task CRUD (NEXT — recommended sub-slice: projects first, then tasks)
12. `/api/v1/super` — super admin (large, many sub-routers)
13. `/api` — remaining main domain routes (largest, final migration)

### Known Risks

- **Double middleware**: Legacy global auth/tenant guards in `routes.ts` apply to ALL `/api/*` paths. New factory-mounted routers under `/api/*` will get both the global guards AND their factory policy guards. Auth checks are idempotent, so this is safe but redundant. Once ALL domains are migrated, remove global guards from `routes.ts`.
- **URL stability**: Never change external URLs during migration. Mount new routers at the exact same paths.
- **Mixed-prefix domains**: Some legacy domains (tags, comments, activity) use routes under multiple URL prefixes (e.g., `/workspaces/:id/tags` AND `/tags/:id`). These must be mounted at `/api` level, not a more specific prefix.
- **Error handler ordering**: Express error middleware must remain LAST. New routers are mounted before error handlers via `mountAllRoutes()`.
- **skipEnvelope for compatibility**: Use `skipEnvelope: true` when migrating handlers that use `res.json()` directly. This preserves response format compatibility. Envelope helpers can be adopted incrementally later.

## Preferred API Version

`/api/v1` is the preferred prefix for new routes. Legacy `/api` prefix exists for backward compatibility.
